# CiteCheck 实施计划（课程项目版）

**课程：** COMP5511 Artificial Intelligence Concepts  
**性质：** 个人课程项目（展示、报告、源代码提交；非商业长期运营）  
**原则：** 展示效果优先、AI 能力优先、真实可运行优先、开发效率优先  

**关键日期：**

| 节点 | 日期 |
|------|------|
| Presentation Slides | 2026-11-15 |
| 课堂展示 | 2026-11-20、2026-11-27 |
| 最终报告与源代码 | 2026-11-29 |

---

## 一、项目目标

1. 将现有单页演示升级为视觉完整、功能可演示的 **AI 科研文献分析工作台**。
2. **突出 Agentic AI 能力**：Query Planning、Hybrid Retrieval（BM25 + Embedding + RRF）、Evidence Verification。
3. 实现 **PDF 在线阅读、引用跳转/高亮、选区 AI 分析** 等直观演示功能。
4. 增加 **轻量用户系统 + 腾讯云 COS（香港）** 文献存储，产品形态完整。
5. **不得破坏** 现有 AI 核心、`python -m citecheck.ask`、`python -m citecheck.evaluate` 及 `tests/`。
6. 控制依赖、部署复杂度与 **2 核 2GB** 服务器资源占用。

---

## 二、仓库审计摘要（保留结论）

### 2.1 现有架构

```
CLI (ask / evaluate / sample_docs)
        ↓
AI 核心：ingest → retrieve → agent → llm
        ↓
FastAPI 演示：POST /api/library、POST /api/ask
        ↓
static 单页（中英 i18n、证据/轨迹/历史，无 PDF 阅读器）
```

| 模块 | 路径 | 状态 |
|------|------|------|
| PDF 解析与切块 | `citecheck/ingest.py` | 有 `chunk_id`、section、page；**无** PDF 坐标 |
| 混合检索 | `citecheck/retrieve.py` | BM25 + embedding + RRF |
| Agent | `citecheck/agent.py` | Planner、Verifier；`b1/b2/b3/full` 及消融 |
| 评测 | `citecheck/evaluate.py` | 输出 `data/results/latest.json` |
| Web API | `citecheck/web/app.py`、`service.py` | 内存 `library_id`；上传 PDF **不返回给浏览器** |
| 演示 UI | `citecheck/web/static/*` | 功能较多但 **无 PDF.js** |

### 2.2 必须复用（禁止重写 RAG 逻辑）

- `answer_question()`、`collect_evidence()`、`_verify_sentence()` — 仅扩展 JSON 字段，不改判定逻辑。
- `parse_pdfs()` + `Retriever` + `outline_from_chunks()` + `result_payload()`。
- 评测与 CLI 独立运行，不强制依赖 Web 数据库。

### 2.3 主要缺口（相对产品目标）

- 无 React 前端、无统一设计系统。
- 无 PDF 在线阅读与证据联动高亮。
- 无服务端持久化、无用户隔离、无 COS。
- 历史对话仅存浏览器；Evaluation 无可视化页面。
- `POST /api/library` 同步索引，大文件易阻塞（需轻量后台任务 + 状态）。

### 2.4 兼容性风险与对策

| 风险 | 对策 |
|------|------|
| 扩展 `Chunk` / API 字段破坏测试 | 新增字段可选；`agent.py` 行为不变；先加测试再改 ingest |
| `claim` 与 `evidence` 匹配靠全文相等 | API 增加 `chunk_id`；前端跳转优先 `page` + `chunk` 文本 |
| 旧演示页回归 | 保留 `/legacy`，现有 `tests/test_web.py` 指向 legacy 或更新断言 |
| COS/会话密钥泄露 | 仅服务端读 `.env`；桶私有；下载/阅读经鉴权接口 |
| 2GB 内存 | 单 worker、限制并发解析数与单文件大小；索引任务串行 |

### 2.5 明确不做

- PostgreSQL、Redis、Celery、K8s、微服务、企业 RBAC、复杂分布式任务。
- 专业 PDF 批注引擎、分片上传/CDN/对象版本生命周期。
- 邮箱验证、OAuth、管理员后台。
- 前端 Mock 假 AI / 假评测数据。

---

## 三、技术栈（轻量）

### 3.1 前端

| 技术 | 用途 |
|------|------|
| React 18 + TypeScript + Vite | 工程基础 |
| Ant Design 5 | 表单、表格、反馈组件（**须配合定制主题，禁止默认堆砌**） |
| Tailwind CSS | 布局、间距、响应式、与 Token 配合 |
| React Router | 路由 |
| Zustand | 全局 UI / 会话轻状态 |
| react-pdf / pdfjs-dist | PDF 渲染 |
| Recharts 或 ECharts | Evaluation Lab 图表 |
| Lucide React | 图标 |
| i18next（或轻量自研字典） | 中英文 |

**视觉方向：** Linear 式侧栏导航 + Notion 式阅读区 + 现代 AI Chat 右栏；浅色系、深蓝/灰白主色、清晰层级、Loading/Empty/Error/Success 齐全；适度过渡动画（**P2：深色模式可延后**）。

### 3.2 后端

| 技术 | 用途 |
|------|------|
| 现有 FastAPI + `citecheck` 包 | HTTP 与 AI 编排 |
| SQLite + SQLAlchemy | 用户、文献元数据、对话（**单文件，无 PostgreSQL 迁移体系**） |
| cos-python-sdk-v5 | 香港桶私有存储 |
| FastAPI `BackgroundTasks` + 进程内状态 | PDF 解析/索引排队（**无 Celery**） |
| passlib + JWT 或 Signed Cookie | 登录会话（简单可靠即可） |

### 3.3 路由与并存策略

- 开发：`npm run dev`（Vite proxy → `127.0.0.1:8000`）。
- 生产：`/app` → React 构建产物；`/legacy` → 现有 static；验证通过后 `GET /` 重定向 `/app`。
- 旧 API：`/api/library`、`/api/ask` **保留至 Phase 5**，与新 `/api/v1/*` 并存。

---

## 四、功能优先级（时间约束）

### P0（必须在展示前完成）

- 新前端视觉框架与 **AI Reader** 三栏。
- PDF 阅读、真实上传/解析、**AI 问答（full 模式）**。
- 引用跳转（页级 + 文本层高亮）、**Verifier 逐句展示**、检索轨迹。
- **Evaluation Lab 展示真实 `latest.json`**（先跑通 `evaluate` 脚本）。

### P1（报告提交前尽量完成）

- AI Selection（解释/翻译/自定义问）。
- Library 完整卡片与 CRUD（接 COS + DB）。
- 简单注册登录、历史对话、Dashboard 真实统计。

### P2（时间不足可砍掉或极简）

- 页缩略图侧栏、深色模式、复杂文件标签、额外动画。
- 预签名直传（若后端直传更稳则不做直传）。
- PyMuPDF 精确 quadpoints（仅当 P0 高亮不稳时再加强）。

---

## 五、页面与功能清单

| 页面 | 必须 | 可延后 | 说明 |
|------|:----:|:----:|------|
| Dashboard | ✓ | — | 欢迎区、统计、最近文献/对话、快捷上传 |
| Library | ✓ | 高级筛选 | 列表/卡片、搜索、上传/删/下、解析状态 |
| AI Reader | ✓ | 缩略图 | **最高优先级**；三栏 + 全链路真实 API |
| AI Selection | P1 | 方法/公式分析 | 选区浮层；直调 LLM，非完整 Agent |
| Research History | P1 | — | 列表、继续对话、按论文筛选 |
| Evaluation Lab | P0 | 案例库扩充 | 仅读真实 JSON，图表对比 B1/B2/B3/full/消融 |
| Settings | P1 | 复杂偏好 | 资料、语言、退出 |

---

## 六、PDF 阅读与证据定位（务实方案）

1. **PDF.js** 渲染 COS/本地回流的 PDF 字节流。
2. 保留现有 **`chunk_id`、`section`、`page`（1-based 展示，跳转时转 0-based `page_index`）**。
3. 点击引用 / claim：**先跳转到对应页**（必须稳定）。
4. 在同页 **text layer** 用证据摘录做 `find`/`highlight`（结合 `chunk_id` 对应的全文与上下文减少歧义）。
5. 若匹配失败：UI 标明 **「页级定位」**，仍展示摘录，不假装精确高亮。
6. **可选增强**（P2）：PyMuPDF `search_for` 写回少量 quadpoints，仅服务 `examples/widgetnet*.pdf` 与课程演示 PDF。

**不得**为覆盖所有排版极端情况无限扩大 ingest 复杂度。

---

## 七、数据与存储（简化模型）

SQLite 表（示意，实现时保持字段最小集）：

- `users`：id, email, password_hash, display_name, locale, created_at
- `documents`：id, user_id, title, cos_key, size_bytes, page_count, status, error_message, created_at
- `conversations`：id, user_id, document_id(s) JSON, title, updated_at
- `messages`：id, conversation_id, role, content, system, payload_json（含 claims/evidence/trace）
- （可选）`index_jobs`：id, document_id, status — 或由 `documents.status` 兼任

**索引数据：** Retriever 仍以内存 + 现有逻辑为主；可将 `chunks` 序列化到 `data/indexes/{document_id}.json`（gitignore），避免 SQLite 存大文本。评测与 CLI **不读** 该库。

**COS（`.env`）：** `COS_REGION`、`COS_BUCKET`、`COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_PREFIX`。  
**上传路径（择一实现，优先稳定）：**

- **方案 A（推荐课程期）：** `multipart` → 后端鉴权 → 写 COS → 建 DB 记录 → 触发 BackgroundTask 解析。
- 方案 B：预签名 PUT（若时间充裕再切换）。

访问：阅读/下载均 `GET /api/v1/documents/{id}/file`，校验 `user_id`。

**资源限制（建议默认值，可 env 覆盖）：**

- 单 PDF ≤ 20MB；并发解析任务 ≤ 1（2GB 机器）。
- 上传排队，前端轮询 `documents.status`：`pending` → `indexing` → `ready` | `failed`。

---

## 八、API 规划（主要新增）

### 8.1 公开 / 健康

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/legacy` | 旧演示页 |

### 8.2 Phase 2 起（可无登录，会话级 library）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/libraries` | 兼容 sample/upload；返回 `library_id`、`papers` outline |
| GET | `/api/v1/libraries/{id}` | 大纲与元数据 |
| GET | `/api/v1/libraries/{id}/papers/{paper_id}/pdf` | PDF 流（鉴权前可先 library_id 校验） |
| POST | `/api/v1/ask` | 同现 ask；响应增加 `chunk_id`、稳定 `evidence_ref` |
| POST | `/api/v1/selection` | 选区：`document_id/library_id`, `page_index`, `text`, `action` |

### 8.3 Phase 3 起（登录 + COS + 持久化）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/v1/auth/register` | 注册 |
| POST | `/api/v1/auth/login` | 登录，返回 token / Set-Cookie |
| POST | `/api/v1/auth/logout` | 退出 |
| GET | `/api/v1/auth/me` | 当前用户 |
| GET | `/api/v1/documents` | 当前用户文献列表 |
| POST | `/api/v1/documents` | 上传并创建记录 + 后台索引 |
| GET | `/api/v1/documents/{id}` | 元数据 + status |
| GET | `/api/v1/documents/{id}/file` | 阅读/下载 |
| DELETE | `/api/v1/documents/{id}` | 删 DB + COS |
| GET/POST | `/api/v1/conversations` | 历史列表 / 新建 |
| GET/POST | `/api/v1/conversations/{id}/messages` | 消息与追问（ask 结果写入 message） |

### 8.4 Phase 4 起

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/dashboard/summary` | 文献数、最近上传、最近对话 |
| GET | `/api/v1/evaluation/latest` | 读取 `data/results/latest.json`（不存在则 404 + 前端 Empty 指引运行 evaluate） |
| PATCH | `/api/v1/users/me` | 资料与 locale |

**保留：** `POST /api/library`、`POST /api/ask` 行为不变，供 CLI 对照与 legacy 页使用。

---

## 九、分阶段实施

### Phase 1：前端基础与视觉重构

**目标：** 可演示的「产品外壳」+ Library/Dashboard/Reader **框架**（Reader 可先占位 PDF 区）。

**主要新增文件（示意）：**

```
frontend/
  package.json, vite.config.ts, tailwind.config.js
  src/main.tsx, App.tsx, routes.tsx
  src/styles/tokens.css, theme/antdTheme.ts
  src/layouts/AppShell.tsx          # 侧栏 + 顶栏 + 面包屑
  src/pages/DashboardPage.tsx
  src/pages/LibraryPage.tsx         # UI 完整，数据可先 mock 空态 + 样例结构
  src/pages/ReaderPage.tsx          # 三栏布局骨架
  src/pages/HistoryPage.tsx
  src/pages/EvaluationPage.tsx      # 空态 + 图表占位
  src/pages/SettingsPage.tsx
  src/stores/uiStore.ts
  src/i18n/
citecheck/web/app.py                # 挂载 /app 静态资源、/legacy
```

**验收标准：**

- [ ] `npm run build` 成功，FastAPI 提供 `/app` SPA fallback。
- [ ] 7 个路由可访问，统一 Layout；Tailwind + Ant Design 主题一致，非默认蓝白堆砌。
- [ ] `/legacy` 仍可打开，现有 unittest 调整或保留通过。
- [ ] 无改动 `agent.py` / `evaluate.py` 行为。

---

### Phase 2：核心 AI Reader（P0 关键路径）

**目标：** 端到端真实数据：PDF → 索引 → 提问 → 证据/Verifier → 跳转高亮；基础 Selection。

**后端：**

- 扩展 `service.Library`：保存 `paper_id → Path`；`GET .../pdf`。
- `result_payload`：claims/evidence 带 `chunk_id`（及 `page`）。
- `ingest`：**仅** 增加 `page_index`（0-based）与用于高亮的 `snippet`（chunk 前 N 字），**不改变**切块主逻辑。
- `POST /api/v1/selection`：薄 LLM 封装。

**前端：**

- `features/reader/PdfViewer.tsx`、`OutlinePanel.tsx`、`ChatPanel.tsx`、`ClaimsPanel.tsx`、`TracePanel.tsx`。
- 证据点击 → `goToPage` + `highlightText`。
- Library：对接上传与进入 Reader（`library_id` 或临时 `document_id`）。

**验收标准：**

- [ ] `examples/widgetnet.pdf` 上传后可阅读、提问，full 模式答案与 legacy **语义一致**（允许 LLM 随机措辞差异）。
- [ ] 点击 supported claim 跳转正确页；widgetnet 上 **≥80%** 演示问题可文本高亮或明确页级定位。
- [ ] Verifier 列表展示 supported/uncertain，full 模式不确定句不进入主答案区。
- [ ] 选区「解释/翻译/自定义问」有真实 LLM 响应（错误可 Toast）。
- [ ] `python -m unittest discover -s tests -v` 通过；`citecheck.ask` CLI 仍可用。

---

### Phase 3：用户与云端文献管理

**目标：** SQLite + 注册登录 + COS + 文献 CRUD + 对话持久化。

**主要新增：**

```
citecheck/db/models.py, session.py, init_db.py
citecheck/web/api/v1/auth.py, documents.py, conversations.py
citecheck/storage/cos_client.py
citecheck/tasks/index_pdf.py          # BackgroundTasks 入口
```

**验收标准：**

- [ ] 用户 A 无法访问用户 B 的 `documents` / `conversations`（unittest 覆盖）。
- [ ] PDF 上传至 COS，DB 有记录；删除同时删对象（或标记删除 + COS delete）。
- [ ] 解析状态在前端可见；失败显示 `error_message`。
- [ ] 登录后 Library / History 读真实 DB；未登录可提示登录或保留匿名 library 演示（二选一，文档写清）。
- [ ] 密码 bcrypt；`.env` 无密钥进前端 bundle。

---

### Phase 4：展示效果与评测中心

**目标：** 课堂演示「帅」+ 实验可复现展示。

**工作项：**

- Evaluation Lab：解析 `latest.json`，Recharts/ECharts 对比 **B1/B2/B3/full** 及 `no_planner` / `embedding_only` / `no_verifier`（以文件中实际存在为准）。
- 指标：Token F1、Evidence Recall、Citation P/R、Unsupported Rate、Latency 等（**无数据则 Empty，引导命令**）。
- Dashboard 接 `dashboard/summary` 真实统计。
- Reader：检索轨迹时间线、claim 卡片样式、打字/骨架加载微交互。
- 中英文切换全站；Settings 写回 `locale`。

**验收标准：**

- [ ] 仓库内或服务器上存在一份真实 `data/results/latest.json`，页面数值与文件一致（可截图进报告）。
- [ ] Dashboard 无大块无意义空白，有统计与最近活动。
- [ ] P2 功能未做不影响本阶段验收。

---

### Phase 5：测试、部署与课程交付

**目标：** 腾讯云 2C2G 可运行；文档齐全；默认入口切换。

**工作项：**

- 功能走查清单；`unittest`；CLI + `evaluate --dataset custom --systems b1,b2,b3,full` 抽样。
- 部署：`uvicorn` + 前端 `dist`；SQLite 与 `data/` 路径文档化；COS/LLM env 说明。
- 更新 `README.md` / `README.en.md`：安装、开发、演示步骤、评测复现。
- `docs/DEMO_SCRIPT.md`（演示话术与页面顺序，建议新增）。
- `GET /` → `/app`；保留 `/legacy` 链接在 README。

**验收标准：**

- [ ] 远程 HTTPS 可完成：登录 → 上传 → Reader 问答 → 评测页有图。
- [ ] 提交包不含 `.env`、不含 COS 密钥；含示例 PDF 与 `custom_questions.json`。
- [ ] 明确列出：**已完成 / 部分完成 / 未做（P2）** 功能表。

---

## 十、主要目录结构（目标态）

```
citecheck/
  agent.py, ingest.py, retrieve.py, evaluate.py, ask.py   # 不动核心算法
  web/
    app.py
    service.py
    api/v1/
  db/
  storage/
  tasks/
frontend/
  src/layouts, pages, features/reader, components, styles, stores, i18n
docs/
  IMPLEMENTATION_PLAN.md    # 本文件
  DEMO_SCRIPT.md            # Phase 5
data/                       # gitignore，存 indexes、results、sqlite
tests/                      # 随 API 增量
```

---

## 十一、每阶段通用检查（不过度流程化）

1. 列出本阶段变更文件与 API。
2. `python -m unittest discover -s tests -v`
3. 抽样：`python -m citecheck.ask --pdf examples/widgetnet.pdf --question "..." --system full`
4. 标注功能状态：完成 / 部分 / 未开始 / 延后（P2）

---

## 十二、AI 核心与评测（冻结清单）

以下模块 **禁止** 为前端重构而删除或简化逻辑：

- PDF Parser、Section-aware Chunking  
- BM25、Embedding Retrieval、RRF  
- Query Planner、Evidence Verifier、Answer Synthesizer  
- B1 / B2 / B3 / full 及 ablation system 名  
- `citecheck.evaluate`、`data/results/latest.json` 格式  

前端 Evaluation Lab **只读** 上述脚本产出，禁止虚构曲线或指标。

---

## 十三、修订记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-11-13 | 课程项目轻量化五阶段计划；合并仓库审计；弃用企业级 PostgreSQL/Redis/Celery 路线 |
| 1.2 | 2026-11-13 | 按本计划完成五个阶段的代码。SQLite，无 Alembic。`/app` 与 `/legacy` 并存。COS 未配置时回落到 `data/uploads/` |

---

## 十四、实施状态（2026-11-13）

代码已实现：六个主页面、登录注册、PDF 阅读、引用跳转、逐句核对、选区分析、SQLite、COS 适配（无密钥时用本地目录）、后台单线程解析、评测页只读 `data/results/*.json`。

尚未在腾讯云服务器上部署。COS 真实上传未验证，当前运行使用本地目录。评测页使用仓库运行时已有的 `data/results/latest.json`，本次没有重新跑完整评测。
