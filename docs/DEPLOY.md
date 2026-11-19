# 部署到 2 核 2GB 服务器

本机开发已经跑通。腾讯云 / 宝塔上推荐用仓库内脚本一键部署。

## 服务器上需要的软件

- Python 3.12，Ubuntu 还需：`apt install -y python3.12-venv python3.12-dev`
- Node.js 20 或更新，只在构建前端时需要
- Nginx（宝塔自带）做反向代理与 HTTPS
- 不需要 PostgreSQL、Redis、Celery

## 一键部署（推荐）

```bash
git clone <仓库地址> /www/wwwroot/citecheck
cd /www/wwwroot/citecheck
cp .env.example .env
# 编辑 .env：LLM_BASE_URL、LLM_API_KEY、LLM_MODEL；可选 COS_*
chmod +x scripts/deploy.sh
./scripts/deploy.sh --https
```

- `--https` 会写入 `CITECHECK_HOST=0.0.0.0` 与 `CITECHECK_COOKIE_SECURE=1`（域名已上 SSL 时使用）。
- 进程默认以后台方式运行，日志在 `logs/citecheck-web.log`；也可用 `./scripts/deploy.sh deploy --systemd`（需 sudo）。
- 更新代码：`./scripts/deploy.sh pull --https`

空机器可用 `scripts/bootstrap-server.sh --repo <git-url>` 拉仓库；配好 `.env` 后再执行 `./scripts/deploy.sh --https`。

## 手动安装（与脚本等价）

```bash
cd citecheck
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
cd frontend && npm ci && npm run build && cd ..
python -m citecheck.web
```

`python -m citecheck.web` 固定 `workers=1`。SQLite 默认 `data/citecheck.db`。

## 反向代理（宝塔）

1. 网站 → 添加站点（你的域名）→ 设置 → **反向代理** → 目标 `http://127.0.0.1:8000`
2. 在 Nginx 配置中加上 `scripts/nginx-reverse-proxy.conf` 里的超时与 `client_max_body_size`（上传 PDF、等模型回答需要）。

提问会等模型返回，`proxy_read_timeout` 建议 ≥ 120s。

## 更新后

```bash
cd /www/wwwroot/citecheck
./scripts/deploy.sh pull --https
```

或手动 `git pull`、前端 `npm run build`、重启进程。重启后，停在「排队中」或「解析中」的论文会自动重新解析。

## 脚本命令速查

| 命令 | 作用 |
|------|------|
| `./scripts/deploy.sh` | 安装依赖、构建前端、启动 |
| `./scripts/deploy.sh pull --https` | 拉代码并重新部署 |
| `./scripts/deploy.sh status` | 查看是否在跑 |
| `./scripts/deploy.sh stop` / `restart` | 停止 / 重启 |

## 不要提交

`.env`、`data/`、`frontend/node_modules/`。COS 和模型密钥只放在服务器的 `.env`。
