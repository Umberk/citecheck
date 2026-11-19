#!/usr/bin/env bash
# CiteCheck production deploy helper (Tencent Cloud / Baota / plain Linux).
# Run from a git clone: ./scripts/deploy.sh
# First time: cp .env.example .env and set LLM_* keys, then ./scripts/deploy.sh --https

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RUN_DIR="$ROOT/run"
LOG_DIR="$ROOT/logs"
PID_FILE="$RUN_DIR/citecheck-web.pid"
LOG_FILE="$LOG_DIR/citecheck-web.log"
VENV="$ROOT/.venv"
PORT="${CITECHECK_PORT:-8000}"

USE_SYSTEMD=0
USE_HTTPS=0
SKIP_FRONTEND=0
DO_PULL=0
CMD="${1:-deploy}"

usage() {
  cat <<'EOF'
用法: ./scripts/deploy.sh [命令] [选项]

命令:
  deploy    安装依赖、构建前端、重启服务（默认）
  pull      git pull 后执行 deploy
  start     启动后端（不构建）
  stop      停止后端
  restart   重启后端
  status    查看运行状态

选项:
  --https         写入 .env：CITECHECK_HOST=0.0.0.0、CITECHECK_COOKIE_SECURE=1（Nginx HTTPS 时用）
  --systemd       使用 systemd 管理进程（需 sudo，并会安装 citecheck-web.service）
  --no-frontend   跳过 npm build
  -h, --help      显示帮助

环境变量:
  CITECHECK_PORT  监听端口（默认 8000）
  CITECHECK_USER  systemd 运行用户（默认当前用户）

示例:
  git clone <repo> /www/wwwroot/citecheck && cd /www/wwwroot/citecheck
  cp .env.example .env && nano .env
  ./scripts/deploy.sh --https
  ./scripts/deploy.sh pull --https
EOF
}

log() {
  printf '[citecheck] %s\n' "$*"
}

die() {
  printf '[citecheck] 错误: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "未找到命令: $1"
}

find_python() {
  if command -v python3.12 >/dev/null 2>&1; then
    echo python3.12
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    if python3 -c 'import sys; raise SystemExit(0 if sys.version_info[:2] == (3, 12) else 1)'; then
      echo python3
      return
    fi
  fi
  die "需要 Python 3.12（宝塔可安装「Python 3.12」或使用 pyenv）"
}

set_env_var() {
  local key="$1"
  local value="$2"
  local file="$ROOT/.env"
  if [[ ! -f "$file" ]]; then
    return
  fi
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local esc
    esc="$(printf '%s' "$value" | sed -e 's/[&/\]/\\&/g')"
    sed -i.bak "s|^${key}=.*|${key}=${esc}|" "$file"
    rm -f "${file}.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}

ensure_env() {
  if [[ ! -f "$ROOT/.env" ]]; then
    if [[ -f "$ROOT/.env.example" ]]; then
      cp "$ROOT/.env.example" "$ROOT/.env"
      die "已从 .env.example 创建 .env，请填写 LLM_API_KEY 等后重新运行本脚本"
    else
      die "缺少 .env，请先 cp .env.example .env"
    fi
  fi
  if [[ "$USE_HTTPS" -eq 1 ]]; then
    set_env_var CITECHECK_HOST "0.0.0.0"
    set_env_var CITECHECK_COOKIE_SECURE "1"
  else
    if ! grep -q "^CITECHECK_HOST=" "$ROOT/.env" 2>/dev/null; then
      set_env_var CITECHECK_HOST "0.0.0.0"
    fi
  fi
  if grep -q "^LLM_API_KEY=$" "$ROOT/.env" 2>/dev/null || grep -q "^LLM_API_KEY=\s*$" "$ROOT/.env" 2>/dev/null; then
    log "警告: .env 里 LLM_API_KEY 为空，站点可以起来但无法调用模型"
  fi
}

ensure_dirs() {
  mkdir -p "$ROOT/data/uploads" "$ROOT/data/indexes" "$ROOT/data/results" "$RUN_DIR" "$LOG_DIR"
}

setup_venv() {
  local py
  py="$(find_python)"
  if [[ ! -d "$VENV" ]]; then
    log "创建虚拟环境 ($py)"
    "$py" -m venv "$VENV"
  fi
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  python -m pip install -U pip wheel >/dev/null
  log "安装 Python 依赖"
  if command -v uv >/dev/null 2>&1; then
    uv pip install -r "$ROOT/requirements.txt"
  else
    pip install -r "$ROOT/requirements.txt"
  fi
}

build_frontend() {
  [[ "$SKIP_FRONTEND" -eq 1 ]] && return
  require_cmd npm
  log "构建前端"
  pushd "$ROOT/frontend" >/dev/null
  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi
  npm run build
  popd >/dev/null
}

git_pull() {
  [[ -d "$ROOT/.git" ]] || die "当前目录不是 git 仓库，无法 pull"
  log "git pull"
  git pull --ff-only
}

systemd_unit_path() {
  echo "/etc/systemd/system/citecheck-web.service"
}

write_systemd_unit() {
  local unit user workdir
  unit="$(systemd_unit_path)"
  user="${CITECHECK_USER:-$(whoami)}"
  workdir="$ROOT"
  sudo tee "$unit" >/dev/null <<EOF
[Unit]
Description=CiteCheck web workspace
After=network.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${workdir}
EnvironmentFile=${workdir}/.env
ExecStart=${workdir}/.venv/bin/python -m citecheck.web
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable citecheck-web.service
}

running_pid() {
  if [[ "$USE_SYSTEMD" -eq 1 ]] && systemctl is-active citecheck-web.service >/dev/null 2>&1; then
    systemctl show -p MainPID --value citecheck-web.service 2>/dev/null || true
    return
  fi
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
    fi
  fi
}

stop_service() {
  if [[ "$USE_SYSTEMD" -eq 1 ]] && [[ -f "$(systemd_unit_path)" ]]; then
    sudo systemctl stop citecheck-web.service 2>/dev/null || true
    return
  fi
  local pid
  pid="$(running_pid || true)"
  if [[ -n "${pid:-}" ]]; then
    log "停止进程 $pid"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 30); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
}

start_service() {
  # shellcheck disable=SC1091
  [[ -d "$VENV" ]] || die "请先运行 ./scripts/deploy.sh deploy 安装依赖"
  source "$VENV/bin/activate"
  ensure_dirs
  stop_service

  if [[ "$USE_SYSTEMD" -eq 1 ]]; then
    write_systemd_unit
    sudo systemctl restart citecheck-web.service
    log "已通过 systemd 启动 citecheck-web.service"
    return
  fi

  log "后台启动 python -m citecheck.web（日志: $LOG_FILE）"
  # shellcheck disable=SC1091
  nohup bash -c "cd '$ROOT' && source '$VENV/bin/activate' && set -a && source '$ROOT/.env' && set +a && exec python -m citecheck.web" \
    >>"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  sleep 1
  if kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    log "已启动 PID $(cat "$PID_FILE")，监听端口见 .env 中 CITECHECK_PORT（默认 $PORT）"
  else
    die "启动失败，查看 $LOG_FILE"
  fi
}

print_status() {
  local pid
  pid="$(running_pid || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    log "运行中 PID $pid"
  elif [[ "$USE_SYSTEMD" -eq 1 ]]; then
    systemctl status citecheck-web.service --no-pager 2>/dev/null || log "未运行"
  else
    log "未运行"
  fi
  log "健康检查: curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:${PORT}/app"
}

print_nginx_hint() {
  cat <<EOF

---------- Nginx / 宝塔反向代理 ----------
目标: http://127.0.0.1:${PORT}
建议在站点 Nginx 配置中加入:
  client_max_body_size 25m;
  proxy_read_timeout 120s;
完整示例见: scripts/nginx-reverse-proxy.conf

域名绑定 SSL 后请使用: ./scripts/deploy.sh deploy --https

EOF
}

parse_args() {
  local args=()
  for arg in "$@"; do
    case "$arg" in
      deploy | pull | start | stop | restart | status) CMD="$arg" ;;
      --https) USE_HTTPS=1 ;;
      --systemd) USE_SYSTEMD=1 ;;
      --no-frontend) SKIP_FRONTEND=1 ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        args+=("$arg")
        ;;
    esac
  done
  if [[ ${#args[@]} -gt 0 ]]; then
    die "未知参数: ${args[*]}（使用 --help）"
  fi
}

do_deploy() {
  ensure_env
  ensure_dirs
  setup_venv
  build_frontend
  start_service
  print_status
  print_nginx_hint
}

main() {
  parse_args "$@"
  case "$CMD" in
    deploy)
      do_deploy
      ;;
    pull)
      DO_PULL=1
      git_pull
      do_deploy
      ;;
    start)
      ensure_env
      start_service
      print_status
      ;;
    stop)
      stop_service
      log "已停止"
      ;;
    restart)
      ensure_env
      start_service
      print_status
      ;;
    status)
      print_status
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"