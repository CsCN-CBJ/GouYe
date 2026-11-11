# TODO 与打卡模块（AI 集成）设计文档

**核心诉求：** 在 APP 中加入 TODO 与打卡两个模块，借此跑通"AI 输入 + AI 输出"的范式——用户用自然语言录入，AI 结构化；AI 生成周报/总结，传统界面只是兜底。
**日期：** 2026-04-21

---

## 背景

当前 APP 已有记账模块（Flask + SQLAlchemy + MySQL + JWT + 原生 HTML/JS 单页应用）。TODO 和打卡是两个规划中模块，此次一起落地。

本迭代的真实价值不在多两个 CRUD，而在**为整个 APP 确立 AI 交互范式**：以后每个模块都按"自然语言输入 → AI 解析 → 结构化入库 / AI 聚合 → 生成洞察"的路径扩展。TODO 和打卡是首批试点。

不做的代价：继续走纯手工表单，AI 只是事后贴皮的弱集成，长期扩展性差。

---

## 方案

### 关键设计决策

1. **TODO 与打卡分开建表**，不做统一 entry 抽象。
   理由：打卡未来可能长出复杂结构（健康指标、可穿戴接入），强类型表更经得起折腾；TODO 稳定而语义不同。跨模块聚合放服务层封装，不把模型扭曲。

2. **TODO 分类走方案 B**：`domain(work/life)` + 单层 `project`（无父子嵌套）+ 多对多 `tags`。不做多级分类。
   理由：个人 APP 量级撑不起树形结构的复杂度与心智负担。未来如需嵌套，加 `projects.parent_id` 即可。

3. **复用现有 `tags` 表**，不重复建表。
   新增关联表 `todo_tags`、`checkin_tags`，指向同一张 `tags.tag_id`。Tag 在用户维度通用，不引入 scope 字段。

4. **打卡无 `status` 字段**。
   打卡本质是"一件已经发生的事被记录"，创建即存在，没有未完成态。

5. **保留 `raw_input` 字段**（TEXT NULL）。
   存用户原始自然语言输入。走 AI 路径时填充，走传统表单时为空。用于 AI 解析错误回溯、未来 AI 再加工、调试 AI 质量。

6. **AI 集成硬约束（架构层，不靠 prompt）**：
   - 独立的 `AIService` 层，不散落在路由。
   - 面向 **OpenAI 兼容接口**（endpoint/key 走 `.env`），背后接 OpenAI / DeepSeek / 本地 ollama 任意。
   - **AI 返回结构受代码层 schema 约束**（Pydantic/dataclass 校验），不合格直接拒绝。
   - **projects / tags 的写入路径与 AI 解析路径物理隔离**——AI 无法直接写入，只能提议。
   - AI 返回的任何 id 必须做"归属当前用户 + 存在性"的后端校验。
   - prompt 模板与周报模板走配置（后续用户提供）。

7. **AI 提议走专门的 `ai_proposals` 表 + 即时确认**。
   AI 解析自然语言后，若要新建 project/tag，产出"提议"入库，**不直接建实体**。前端立刻弹卡片展示将建内容，用户一键确认或编辑后提交才落库。用户驳回新建提议时，entry 仍可创建但不绑 project。

8. **周报双路径**：
   - 用户主动点击"生成本周周报"→ 即时生成、展示并入库。
   - 定时自动生成（APScheduler）→ 入库存档，可回看。
   模板/prompt 走配置。本期不做导出/分享。

---

## 功能范围

### 包含

- **TODO 模块**：增删改查、完成状态流转（pending/done/cancelled）、domain(work/life)、project 关联、多 tag、payload JSON（priority / due_at 等）。
- **打卡模块**：增删改查、预置 category、自定义 tag、payload JSON、occurred_at（支持补打卡）。
- **Project 管理**：单层 project 的增删改查、归档；不含父子嵌套。
- **Tag 复用**：TODO 和打卡复用现有 `tags` 表；新增两张关联表。
- **AI 自然语言入口**：前端主交互输入框，AI 解析 → 路由到 TODO/打卡/... → 提议结构化 entry + 新 project/tag。
- **AI 提议 + 即时确认**：`ai_proposals` 表 + 前端确认卡片，用户确认后落库。
- **AI Service 层**：OpenAI 兼容接口抽象，配置化 endpoint/key/model。
- **周报手动生成**：用户点击按钮 → 即时生成 + 展示 + 入库 `ai_artifacts`。
- **周报定时生成**：APScheduler 周期任务 → 入库；可回看历史周报。
- **传统表单兜底**：TODO 和打卡都保留手工表单，AI 不可用不影响基础录入。

### 不包含（本次迭代）

- AI 主动分析推送洞察（"这周工作完成率比上周低 30%"）
- 周报导出 PDF / 分享链接 / 发邮件
- Tag 近似匹配合并（"工作" vs "work" 自动归并）
- 打卡的复杂统计报表（月度跑步公里数折线图等）
- 多级分类 / 树形 project
- IoT / 可穿戴设备自动打卡
- 响应式高级 UI / 桌面端适配
- JWT 刷新令牌机制

---

## 模块划分

### 数据模型

**todos 表（新建）**
```
id               BIGINT PK
user_id          FK users.user_id
domain           ENUM('work','life')  NOT NULL
project_id       FK projects.id       NULL
title            VARCHAR(200)
raw_input        TEXT                 NULL
status           ENUM('pending','done','cancelled')
due_at           DATETIME             NULL
completed_at     DATETIME             NULL
payload          JSON                     -- priority 等
created_at / updated_at
```

**checkins 表（新建）**
```
id               BIGINT PK
user_id          FK users.user_id
category         VARCHAR(40)              -- 预置枚举,存字符串便扩展
title            VARCHAR(200)
raw_input        TEXT                 NULL
occurred_at      DATETIME             NOT NULL
payload          JSON                     -- duration/distance/severity 等
created_at / updated_at
```

**projects 表（新建）**
```
id               BIGINT PK
user_id          FK users.user_id
domain           ENUM('work','life')
name             VARCHAR(100)
status           ENUM('active','archived')
created_at / updated_at
UNIQUE(user_id, domain, name)
```

**tags 表（复用已有，不改）**
```
现有: tag_id, user_id, tag_name, color, created_at
UNIQUE(user_id, tag_name)
```

**todo_tags 表（新建关联）**
```
todo_id BIGINT FK todos.id  ON DELETE CASCADE
tag_id  BIGINT FK tags.tag_id ON DELETE CASCADE
PRIMARY KEY(todo_id, tag_id)
```

**checkin_tags 表（新建关联）**
```
checkin_id BIGINT FK checkins.id ON DELETE CASCADE
tag_id     BIGINT FK tags.tag_id ON DELETE CASCADE
PRIMARY KEY(checkin_id, tag_id)
```

**ai_proposals 表（新建）**
```
id               BIGINT PK
user_id          FK users.user_id
raw_input        TEXT                     -- 用户原话
parsed_payload   JSON                     -- AI 解析的完整结构
status           ENUM('pending','accepted','rejected','expired')
created_at
decided_at       DATETIME NULL
```

**ai_artifacts 表（新建）**
```
id               BIGINT PK
user_id          FK users.user_id
type             VARCHAR(40)              -- 'weekly_report' 等
title            VARCHAR(200)
content          MEDIUMTEXT               -- Markdown
source_range     JSON                     -- {start, end, domains...}
generated_by     ENUM('manual','scheduled')
created_at
```

### 服务层

**`backend/services/ai_service.py`**
- `AIService` 类，封装 OpenAI 兼容 client。
- 方法：
  - `parse_natural_input(user_id, text) -> ParsedResult`：返回受 schema 约束的结构化结果（含 existing_id 或 new_*_proposal）。
  - `generate_weekly_report(user_id, range, template) -> str`：聚合数据 + 模板 + LLM → Markdown。
- 配置读取：endpoint / api_key / model / timeout 全走 `.env`。
- 失败/超时：返回明确错误码，前端回退到传统表单。

**`backend/services/entry_service.py`**（跨模块查询粘合层）
- `list_entries_in_range(user_id, start, end, kinds=[...])`：TODO + 打卡合并输出，供 AI 周报使用。
- `accept_proposal(proposal_id)`：原子操作——新建 project/tag（若有）+ 创建 entry + 绑定，全部成功才提交。

### 路由层

- `backend/routes/todo.py`：TODO CRUD、状态流转、tag 绑定、project 关联。
- `backend/routes/checkin.py`：打卡 CRUD。
- `backend/routes/project.py`：project CRUD、归档。
- `backend/routes/ai.py`：
  - `POST /api/ai/parse`：自然语言 → 提议（入 `ai_proposals`，返回 proposal_id + 预览结构）。
  - `POST /api/ai/proposals/<id>/accept`：确认（可带用户编辑后的覆盖字段）。
  - `POST /api/ai/proposals/<id>/reject`：驳回。
  - `POST /api/ai/weekly-report`：手动生成周报。
  - `GET /api/ai/weekly-reports`：周报历史。

### 定时任务

- `backend/scheduler.py`：APScheduler 在 Flask 启动时注册；每周固定时间调用 `AIService.generate_weekly_report` → 入库 `ai_artifacts`。失败记日志，不影响主应用。

### 前端

- `frontend/pages/todo.html / js`：TODO 列表、filter（domain/project/tag）、创建表单、状态切换。
- `frontend/pages/checkin.html / js`：打卡列表、category 过滤、创建表单。
- `frontend/pages/weekly-report.html / js`：历史周报列表 + 手动生成按钮 + Markdown 渲染。
- `frontend/components/ai-input.js`：顶部通用 AI 输入框组件；提交 → 展示确认卡片 → 调用 accept/reject。
- `frontend/components/proposal-card.js`：AI 提议确认卡片，可编辑 title / domain / tag / payload 后提交。

### 文件边界（Phase 2 分工依据）

| Teammate | 文件范围 |
|---|---|
| backend | `backend/models.py`（新增模型）、`backend/routes/{todo,checkin,project,ai}.py`、`backend/services/{ai_service,entry_service}.py`、`backend/scheduler.py`、`app.py`（注册 blueprint + scheduler）、`sql/` 新迁移、`backend/requirements.txt` |
| frontend | `frontend/pages/{todo,checkin,weekly-report}.{html,js,css}`、`frontend/components/{ai-input,proposal-card}.js`、`frontend/index.html`（接入入口） |
| infra | `.env.example`、`docs/config.md`、`docs/deployment.md` |
| tester | `tests/`（新增）、`docs/testing.md`、集成测试报告 |
| main agent | `docs/design/`、`docs/architecture/overview.md`、`CHANGELOG.md`、`README.md` |

### 接口契约（关键）

**`POST /api/ai/parse` 响应**
```json
{
  "proposal_id": 123,
  "kind": "todo" | "checkin",
  "preview": {
    "title": "...",
    "domain": "work" | "life" | null,
    "category": "sport" | null,
    "payload": {...},
    "project": { "id": 5, "name": "Q2 方案" } | { "new": "装修" } | null,
    "tags": [ { "id": 9, "name": "重要" }, { "new": "晨跑" } ]
  }
}
```

**`POST /api/ai/proposals/<id>/accept` 请求**
```json
{
  "overrides": {   // 可选,用户编辑过的字段
    "title": "...",
    "tags_add": ["新标签"],
    "tags_remove": [9],
    "payload": {...}
  }
}
```

---

## 业务规则对齐

本节明确"设计真源"。四条指导原则优先级递减:**简单 > 不限制用户 > 轻约束 AI > 用户完全隔离(硬约束)**。原则冲突时以前者为准,唯独 #4 作为硬约束不可妥协。

### (a) TODO 状态机 —— 任意互转

- `pending / done / cancelled` 三态之间**允许任意互转**。包括 `done → pending`(反悔)、`cancelled → pending`(复活)、`done ↔ cancelled` 等所有组合。
- `completed_at` 语义:进入 `done` 时置为 `now()`;离开 `done` 时清空为 `null`。
- 原则:#2(个人自用不要给自己上枷锁)+ #1(一张转移表不如没有转移表)。
- **与当前实现差异(需后续修正)**:`backend/routes/todo.py` 的 `VALID_TRANSITIONS` 把 `done/cancelled` 标为终态;`tests/backend/test_todo_routes.py::test_status_transition_done_to_cancelled_blocked` 锁死了该错误行为。设计文档为准,实现与测试在后续 PR 对齐。

### (b) Checkin —— 无状态字段

- 打卡本质是"一件已发生的事",创建即存在,不存在未完成态。对应方案要点 #4。
- 必填三要素:`title / category / occurred_at`。缺一即 400。
- 原则:#1。

### (c) Project 生命周期 —— active ↔ archived 双向

- `active ↔ archived` 可来回切,归档不是终态。
- 列表默认只返回 `active`;需看归档项目通过 `?include_archived=1` 或 `?status=archived`。
- `UNIQUE(user_id, domain, name)` 保留——同 domain 内重名是真实体验问题。
- 原则:#2(能归档就能复活)+ #4(用户维度唯一)。
- **与当前实现差异(需后续修正)**:`backend/routes/project.py` 仅实现归档方向,缺 `unarchive` 接口与 `include_archived` 查询参数。

### (d) AI Proposal 状态机 —— 线性不可逆

- 状态流转:`pending → accepted | rejected | expired`,三条出边,不可回退。
- `expired` 超时阈值:**24 小时**(扫描清理路径见 `ai.py::_expire_old_proposals`)。
- 原则:#3 + #1。AI 产物一旦决定就不反悔,避免状态反复导致的数据二义。

### (e) 用户隔离(硬约束)

- 所有业务表带 `user_id`;所有查询/更新**必须**以 `user_id = current_user` 为过滤条件。
- AI 返回的任何 `project_id / tag_id` 必须做归属校验:不属于当前用户直接 `403`(`PermissionError` → `error_response`)。
- 所有路由统一通过 `@jwt_required()` + 当前用户身份解析,无任何豁免。
- 原则:#4。不可妥协。

### (f) AI 写入边界

- AI **不能直接**创建 project / tag / todo / checkin。所有新建走 `ai_proposals` → 用户确认 → `entry_service.accept_proposal` 原子落库。
- `accept_proposal` 在原子事务内完成:新建 project/tag(若需要)+ 创建 entry + 绑定标签,任一步失败全部回滚。
- 对 AI 返回 id 的归属校验失败 → `PermissionError` → 路由层 403。
- 原则:#3(轻约束,但约束点要硬)。

### (g) 输入基础校验 —— 仅拒绝空/非法

- `POST /api/ai/parse` 空文本 → 400。
- `POST /api/checkins` 缺必填 → 400。
- `POST /api/projects` 同 user+domain 重名 → 400。
- **不做更多"业务合理性"校验**(如"due_at 不能在过去""completed_at 不能早于 created_at"等)。原则 #2。

---

## 测试与验收

### 单元测试覆盖范围

- `AIService.parse_natural_input` 的 schema 校验（故意喂脏输出应被拒绝）
- `AIService` 不可用时路由返回预期错误码
- `accept_proposal` 的原子性（中途失败全部回滚）
- `accept_proposal` 对 AI 返回 id 的归属校验（跨用户 id 应被拒绝）
- TODO 状态机任意互转：`pending ↔ done ↔ cancelled` 各组合均可切换；`completed_at` 在进入/离开 `done` 时正确设置/清空（对齐"业务规则对齐"(a)）
- 打卡的 `occurred_at` 时区/过去时间支持
- 周报数据聚合（`list_entries_in_range`）

### E2E 测试场景

1. 用户发"今天跑了五公里" → 生成 checkin 提议 → 确认 → 打卡入库 + 新 tag 入库
2. 用户发"提醒我明天交方案" → 生成 TODO 提议（work domain）→ 确认 → TODO 入库
3. 用户驳回"新建 project"的提议 → TODO 仍创建，project 未创建
4. 关闭 AI（mock 返回失败）→ 传统表单仍可创建 TODO / 打卡
5. AI 返回恶意 id（不属于当前用户）→ 后端拒绝
6. 本周有若干 TODO + 打卡 → 点击"生成周报"→ 返回 Markdown + 入库可回查
7. Scheduler 触发一次 → 周报入库
8. AI 提议 `pending` 超过 X 小时 → 标记 `expired`

### 验收标准

- [ ] TODO 可按 domain/project/tag 过滤，切换状态持久化
- [ ] 打卡可按 category/tag 过滤，按 `occurred_at` 排序
- [ ] 自然语言输入 3 种典型 case 均能正确路由到 TODO 或打卡
- [ ] AI 新建 project/tag 必须用户确认才落库（尝试跳过确认的请求被拒绝）
- [ ] AI 返回 id 必须通过归属校验
- [ ] 手动生成周报返回非空 Markdown 并入库
- [ ] 定时周报在本地可触发验证（调小周期或提供 dev 触发接口）
- [ ] AI endpoint 不可达时，基础 CRUD 不受影响
- [ ] 现有记账模块功能不受本次改动影响（回归）
- [ ] `tags` 表未发生 schema 变更（仍兼容现有记账）

### Playwright 手动测试点（MCP）

本节为**人工驱动**的测试清单：通过 Playwright MCP 逐步点击浏览器、截图观察布局合理性与业务流程正确性。非自动化断言脚本——关注"肉眼看到的问题"。

**通用约定**

- 视口：375×812（移动端基准）。
- 登录：使用 `tests/playwright-test.js` 中的 `TEST_TOKEN` 注入 `localStorage`。
- 中文字体：每次导航后注入 Noto Sans CJK SC 以避免方框字符。
- 截图目录：`tests/playwright-screenshots/`。
- 截图命名：`{Layer}-{page|flow}-{step}.png`（如 `L1-todo-empty.png`、`F1-01-todo-created.png`）。
- 每轮测试结束后，把结果（通过 / 布局问题 / 文档与实现差异）写入 `tests/playwright-manual-report.md`。

#### Layer 1 — 页面布局观察

每个页面至少 3 个截图点。重点看：空态占位是否居中、卡片是否溢出、模态框是否遮挡底部导航、长文本是否截断合理。

**首页 `/`（回归）**
| ID | 操作 | 观察点 |
|---|---|---|
| L1-home-empty | 清空流水后访问首页 | 占位文案居中，tab-bar 5 格等宽 |
| L1-home-with-data | 造≥10 条流水 | 月度收入/支出数字不溢出；收入绿、支出红 |
| L1-home-month-switch | 点 `#monthSelector` 切换月份 | loading 不抖动，金额刷新 |

**TODO 页 `/pages/todo.html`**
| ID | 操作 | 观察点 |
|---|---|---|
| L1-todo-empty | 清空 TODO 后访问 | 空态卡片垂直居中，"新建"按钮可见 |
| L1-todo-with-items | ≥5 条 TODO，含三态 | 状态徽章颜色区分；长 title 省略号截断不破版 |
| L1-todo-filter-expanded | 点 `#toggleFilterBtn` | `#filterDomain/#filterStatus/#filterProject/#filterTag` 不换行不遮挡列表 |
| L1-todo-create-modal | 点"新建"打开 `#todoModal` | 字段完整、`#todoDueAt` 小屏可点、关闭 X 在右上 |
| L1-todo-stats | 默认首屏 | `#statPending/#statDone/#statCancelled` 三格数字对齐 |

**打卡页 `/pages/checkin.html`**
| ID | 操作 | 观察点 |
|---|---|---|
| L1-checkin-empty | 清空后访问 | 空态文案 + 新建按钮 |
| L1-checkin-with-items | 造多种 category 的打卡 | category 图标/颜色可区分 |
| L1-checkin-filter-expanded | 点 `#toggleFilterBtn` | `#filterCategory/#filterTag` 不溢出 |
| L1-checkin-create-modal | 打开新建模态 | `#checkinOccurredAt` 默认当前时间；`#checkinPayload` textarea 高度合理 |

**周报页 `/pages/weekly-report.html`**
| ID | 操作 | 观察点 |
|---|---|---|
| L1-report-empty | 无周报时访问 | 空态 + `#generateBtn` 居中 |
| L1-report-list | 有若干历史周报 | 每张卡片标题/范围/生成方式（manual/scheduled）清晰 |
| L1-report-detail-modal | 点任一周报打开详情 | Markdown 正常渲染；`#reportModalTitle/#reportMeta/#reportContent` 三段不重叠；长报告可滚动 |
| L1-report-generating | 点 `#generateBtn` | `#generatingState` 出现，按钮 disabled |

**AI 输入模态（跨页面通用）**
| ID | 操作 | 观察点 |
|---|---|---|
| L1-ai-modal-open | 任意页面点 `.ai-btn` | 模态从底部弹出，不遮挡 tab-bar |
| L1-ai-modal-proposal-card | 提交一段文本后 | `proposal-card` 内可编辑字段清晰可点，多字段不挤压 |

#### Layer 2 — 关键业务流程

每条流程都是"点击 → 等待 → 截图 → 断言"的序列，串联若干步。

**F1：TODO 任意状态互转**（对应"业务规则对齐" (a)）

1. 新建 TODO（title="测试状态流转"，domain=work）→ `F1-01-created.png`
2. `pending → done`：检查徽章变色、`completed_at` 显示 → `F1-02-done.png`
3. `done → pending`：检查 `completed_at` 清空 → `F1-03-reopened.png`
4. `pending → cancelled` → `F1-04-cancelled.png`
5. `cancelled → pending`（应允许） → `F1-05-revived.png`
6. 全程**不应**出现 400 错误提示

> 若当前后端仍是旧 `VALID_TRANSITIONS`，F1-03 / F1-05 会失败——**这是文档与实现的已知差距**，截图记录即可，不作为文档 bug。

**F2：AI 自然语言建 TODO**

1. 任意页点 `.ai-btn`，输入"提醒我明天 10 点交方案"→ `F2-01-input.png`
2. 等待 `proposal-card` 出现 → `F2-02-proposal.png`
3. 编辑 title 为"提交 Q2 方案"后点"确认"→ `F2-03-confirmed.png`
4. 跳转 TODO 列表，新 TODO 在顶部 → `F2-04-list.png`
5. 打开详情查看 `raw_input` 保留原话 → `F2-05-raw-input.png`

**F3：AI 自然语言打卡 + 新 tag 驳回**

1. 输入"今天跑了五公里"→ `F3-01-input.png`
2. `proposal-card` 显示 category=sport + 新 tag "晨跑" → `F3-02-proposal.png`
3. 驳回"新 tag"项后确认 entry → `F3-03-partial-accept.png`
4. 打卡入库成功；tag 表不应多出"晨跑"→ `F3-04-verify.png`

**F4：AI 失败回退传统表单**

1. 临时断开 AI（修改 `.env` 的 endpoint 为不可达，或 mock 返回 5xx）
2. 点 `.ai-btn` 提交 → 错误提示 → `F4-01-ai-error.png`
3. 关闭 AI 模态，手动打开 TODO 创建 modal 填表提交 → `F4-02-manual-create.png`
4. 验证 TODO 正常入库 → `F4-03-list.png`

**F5：Project 归档 + 恢复**（对应 (c)）

1. 在 TODO 创建 modal 中新建 Project "P1"（work） → `F5-01-created.png`
2. 在 Project 管理入口归档 P1 → `F5-02-archived.png`
3. 默认列表不显示 P1 → `F5-03-hidden.png`
4. 勾选"显示归档"（`?include_archived=1`） → P1 出现 → `F5-04-show-archived.png`
5. 点击恢复 → 回到默认列表 → `F5-05-revived.png`

> 当前实现缺 `unarchive` 接口与 `include_archived` 参数；F5-04/F5-05 预期失败，截图记录即可。

**F6：手动生成周报**

1. 造本周若干 TODO / checkin
2. 进 `/pages/weekly-report.html`，点 `#generateBtn` → `F6-01-generating.png`
3. 生成完成，详情 Modal 自动弹出显示 Markdown → `F6-02-report.png`
4. 关闭 modal，列表多一条 → `F6-03-list.png`
5. 重新点该条，内容一致 → `F6-04-reopen.png`

**F7：跨用户隔离（硬约束验证）**

1. 用户 A 登录，创建 Project（记下 `project_id = N`）
2. 登出，用户 B 登录
3. 通过 DevTools Console 构造请求：`POST /api/ai/parse` → `POST /api/ai/proposals/<id>/accept`，`overrides` 里塞 `project_id=N`
4. 期望后端 403，前端显示权限错误 → `F7-01-forbidden.png`

#### 执行清单与产物

完成 Layer 1 + Layer 2 所有截图后，在 `tests/playwright-manual-report.md` 按以下结构归档：

```markdown
# Playwright 手动测试报告 — YYYY-MM-DD

## Layer 1 结果
| ID | 状态 | 备注 |
| L1-todo-empty | ✅ | |
| L1-todo-create-modal | ⚠️ | 长 tag 多选下拉溢出右边 4px |
...

## Layer 2 结果
| ID | 状态 | 备注 |
| F1-03-reopened | ❌ | 后端返回 400，预期 200（文档 vs 实现差距）|
...

## 需跟进
- [ ] Part 3 列表项 1 / 2 / 3（见设计文档）
```

---

## 风险与假设

### 假设

1. OpenAI 兼容接口足够通用，后续换模型不需改代码（只改 `.env`）。
   **若错**：某些模型 schema 不兼容，需在 `AIService` 内加适配层。
2. 用户打卡量级在个人尺度（日均 < 50），`payload` JSON 不做复杂 SQL 聚合足够。
   **若错**：后期需给高频 category 拆独立表或加物化视图。
3. 单层 project 能覆盖现实使用，不需要子项目。
   **若错**：给 `projects` 加 `parent_id`，1 级嵌套，不做无限层。
4. `ai_proposals` 的 `expired` 扫描可容忍延迟（半天级别）。
   **若错**：改为更频繁扫描或请求时懒清理。

### 风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| AI 解析不稳定，结果不可预测 | 用户录入失败率高 | schema 强校验 + 失败回退传统表单 + 保留 raw_input 可溯源 |
| AI 幻觉伪造用户 id/project_id | 越权写入 | 后端对所有 AI 返回的 id 做归属校验（硬约束） |
| prompt 写得不好导致周报质量差 | 用户体验差但不影响数据 | 模板可配置，用户可调优，后期迭代 |
| APScheduler 在 ASGI（Uvicorn + WsgiToASGI）下行为异常 | 定时周报失效 | 在 integration 阶段专门验证；若不行改用 `apscheduler` 的 `AsyncIOScheduler` 或独立 worker 进程 |
| `ai_proposals` 表膨胀 | 数据库占用 | expired 提议定期清理（本期不实现，留监控） |
| 跨模块 tag 污染（"餐饮"tag 出现在 TODO 下拉） | 轻度 UX 噪声 | 查询层按"本模块近期用过"排序 tag 建议，不改表结构 |

### 外部依赖

- OpenAI 兼容服务的可用性（网络/配额）
- APScheduler 与当前 ASGI 适配层（`WsgiToASGI`）的兼容性
