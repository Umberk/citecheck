#!/usr/bin/env bash
# 在空目录首次拉仓库并部署（可选）。默认目录 /www/wwwroot/citecheck
#
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/main/scripts/bootstrap-server.sh | bash -s -- \
#     --repo https://github.com/<owner>/<repo>.git
#
# 或在服务器上已下载仓库后直接使用 ./scripts/deploy.sh

set -euo pipefail

REPO=""
TARGET="/www/wwwroot/citecheck"
BRANCH="main"
DEPLOY_EXTRA=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="$2"
      shift 2
      ;;
    --dir)
      TARGET="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --https | --systemd | --no-frontend)
      DEPLOY_EXTRA+=("$1")
      shift
      ;;
    -h | --help)
      echo "用法: bootstrap-server.sh --repo <git-url> [--dir /www/wwwroot/citecheck] [--branch main] [--https]"
      exit 0
      ;;
    *)
      echo "未知参数: $1" >&2
      exit 1
      ;;
  esac
done

[[ -n "$REPO" ]] || {
  echo "必须指定 --repo" >&2
  exit 1
}

if [[ -d "$TARGET/.git" ]]; then
  echo "[bootstrap] 目录已存在，执行 git pull"
  git -C "$TARGET" pull --ff-only
else
  mkdir -p "$(dirname "$TARGET")"
  echo "[bootstrap] git clone $REPO -> $TARGET"
  git clone --branch "$BRANCH" --depth 1 "$REPO" "$TARGET"
fi

cd "$TARGET"
chmod +x scripts/deploy.sh
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "[bootstrap] 已创建 .env，请先编辑 LLM_API_KEY 等，再运行: cd $TARGET && ./scripts/deploy.sh --https"
  exit 0
fi

exec ./scripts/deploy.sh deploy "${DEPLOY_EXTRA[@]}"