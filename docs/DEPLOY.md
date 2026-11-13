# 部署到 2 核 2GB 服务器

本机开发已经跑通。下面是放到一台腾讯云香港轻量服务器上的步骤。仓库里没有代为登录或完成远程部署。

## 服务器上需要的软件

- Python 3.12
- Node.js 20 或更新，只在构建前端时需要
- 不需要 PostgreSQL、Redis、Celery 或 Nginx 以外的额外服务

## 安装

```bash
git clone <仓库地址> citecheck
cd citecheck
uv venv .venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
cp .env.example .env
```

编辑 `.env`：

- `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`
- 使用 COS 时再填 `COS_SECRET_ID`、`COS_SECRET_KEY`。桶保持私有。不填则 PDF 存在 `data/uploads/`
- 前面有 HTTPS 反向代理时设置 `CITECHECK_COOKIE_SECURE=1`
- `CITECHECK_HOST=0.0.0.0`

构建前端并启动，只开一个 worker：

```bash
cd frontend && npm install && npm run build && cd ..
python -m citecheck.web
```

`python -m citecheck.web` 固定 `workers=1`。解析队列也是一次一篇，避免同时加载多个 embedding 索引。SQLite 文件默认是 `data/citecheck.db`。

## 反向代理

Nginx 把 443 转到 `127.0.0.1:8000` 即可，需要转发 `Host` 和 `X-Forwarded-Proto`。上传限制设得不小于 20MB：

```nginx
client_max_body_size 25m;
proxy_read_timeout 120s;
```

提问会等模型返回，超时要留够。

## 更新后

拉取代码，重新 `npm run build`，重启进程。重启时，停在「排队中」或「解析中」的论文会自动重新解析。

## 不要提交

`.env`、`data/`、`frontend/node_modules/`。COS 和模型密钥只放在服务器的 `.env`。
