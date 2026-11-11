# 变更日志

所有 notable 变更都会记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## v2.0.0 (2026-08-17)

🚀 核心变更
- **数据库从 MySQL 迁移到 SQLite** - 后端数据层整体切换为 SQLite 单文件数据库，移除 MySQL 服务依赖，部署更简单
- **时间存储统一为 epoch 毫秒** - 与 Prisma SQLite 原生存储格式一致，日期范围查询/统计功能恢复正常
- **schema 类型适配 SQLite** - 枚举改字符串、JSON 字段改字符串序列化、主键由 BigInt 改 Int（SQLite 不支持 BigInt 自增）
- **存量数据导入** - 远程 MySQL 生产库全部业务数据已导出至本地 SQLite（`prisma/dev.db`）

## v1.11.0 (2026-06-18)

✨ 新增
- transactions 查询新增 `keyword` 参数，对 `description` 字段做模糊匹配（空字符串视为不传），仅匹配 description 不匹配 category / tag
- 未识别的 query parameter 返回 400 `unknown query parameters: <name>`

## v1.10.4 (2026-06-18)

🐛 修复
- 修正 v1.10.3 迁移方向错误：把 checkins 表中"下班/睡觉/OffWork"模板下全部 67 条 occurred_at `- INTERVAL 8 HOUR`，让底层字面量统一为真 UTC（与代码层标准约定一致），前端 `toLocaleString('zh-CN')` 自动 +8h 渲染北京钟点
- v1.10.3 迁移误把 17 条 +8h 导致前端显示错位 +8h（凌晨 02 点变上午 10 点），本次一并修正

✨ 新增
- DB view `v_checkins` / `v_transactions` / `v_todos`：所有 datetime 列附 `_bj` 后缀的北京时间映射，方便直接 SELECT 查看原表保留真 UTC

## v1.10.3 (2026-06-18)

🐛 修复
- 修复 datetime 字段时区不一致：引入 `parseLocalDateTime` / `parseLocalDateRange`（写死 +08:00），替换 `checkin/transaction/todo` 所有 `new Date(裸串)` 调用
- PM2 `ecosystem.config.cjs` 钉死 `TZ: 'Asia/Shanghai'` 双保险
- 17 条 checkins 历史脏数据迁移（`occurred_at + INTERVAL 8 HOUR`）

## v1.10.2 (2026-06-16)

🐛 修复
- GET /api/todos 返回的 project 对象漏掉 color 字段（src/routes/todo.ts 有独立的 projectToDict，v1.10.0 只改了 project.ts 的同名函数），导致前端拿不到颜色

## v1.10.1 (2026-06-16)

🔧 改进
- TodoCard 项目名 pill 用 project.color 上色（按状态分组时也能识别项目归属）
- 修复 v1.10.0 schema 改动未走 prisma migrations 导致线上库未自动同步的问题（已在 hotfix 中改正）

## v1.10.0 (2026-06-15)

✨ 新增
- Project 模型加 color 字段（VARCHAR(20) NULL，hex 格式 #RRGGBB），POST/PUT 接受可选 color，PUT 传 null 可清空
- 前端 PC 打卡卡片支持 array 嵌套字段通用渲染（schema 驱动递归，>200 字符截断）
- TODO 项目分组头颜色优先用 project.color，无颜色 fallback 现有调色板

🔧 改进
- 需求页面状态筛选默认全选 5 个状态（之前默认隐藏 completed/cancelled）
- color 校验抽 isValidColor helper，POST/PUT null 处理一致

✅ 测试
- 5 个新用例 (P1-P5)，181/181 通过
- 数据库迁移 prisma/migrations/20260615000000_add_project_color/（替代散写 sql/add_project_color.sql，由 watch-pull.sh 自动 prisma migrate deploy 应用）

🔧 工作流
- CLAUDE.md 加铁律：所有 schema 改动必须走 prisma/migrations/，禁止手写 sql/*.sql 或手动 ALTER 数据库

## 版本列表

- [v1.9.0 (2026-06-13)](#v190-2026-06-13) - 打卡模板 fields_schema 新增 array 嵌套字段类型，支持健身打卡「一次训练 → N 个动作 → 每个动作 M 组」结构。递归深度上限 3 层，max_items 硬上限 1000。错误信息带嵌套路径。向后兼容旧扁平模板。
- [v1.8.0 (2026-06-11)](#v180-2026-06-11) - TODO 接口不再静默建项目（移除 project_name），强制走 POST /api/projects；同时修复 POST /api/projects 同 domain 只能建一个项目的潜伏 bug（查重改为三元唯一）
- [v1.7.1 (2026-06-11)](#v171-2026-06-11) - watch-pull 自动执行 prisma migrate deploy
- [v1.7.0 (2026-06-10)](#v170-2026-06-10) - TODO comment 字段重设计：payload / change_summary 退役
- [v1.6.2 (2026-06-10)](#v162-2026-06-10) - 文档对齐：修正 SKILL.md 与 api.md 残留过时描述
- [v1.6.1 (2026-06-10)](#v161-2026-06-10) - 修复按项目分组排序错误
- [v1.6.0 (2026-06-10)](#v160-2026-06-10) - PC 端需求/TODO 双列卡片 + 版本历史 + 分组开关
- [v1.5.0 (2026-06-10)](#v150-2026-06-10) - **BREAKING** API 接口合一 + 文档对齐
- [v1.4.3 (2026-06-10)](#v143-2026-06-10) - watch-pull 始终重启 PM2，不再依赖版本号检测
- [v1.4.2 (2026-06-10)](#v142-2026-06-10) - 打卡模板自动注入 comment 字段 + api_client 注册修复
- [v1.4.1 (2026-06-09)](#v141-2026-06-09) - 修复 token 过期后页面闪烁问题
- [v1.4.0 (2026-06-05)](#v140-2026-06-05) - TODO 状态扩展 5 状态 + 颜色方案
- [v1.3.1 (2026-06-03)](#v131-2026-06-03) - 分组视图、展示修复与按 lockfile 部署安装
- [v1.3.0 (2026-05-29)](#v130-2026-05-29) - PC 前端重绘：只读展示 + 筛选
- [v1.2.2 (2026-05-28)](#v122-2026-05-28) - run.sh 健康检查 + git hooks 保护
- [v1.2.1 (2026-05-28)](#v121-2026-05-28) - 部署修复：pm2 + tsx + 脚本优化
- [v1.2.0 (2026-05-26)](#v120-2026-05-26) - 后端 E2E 测试套件 (136 tests)
- [v1.1.0 (2026-05-26)](#v110-2026-05-26) - 移除 AI 模块 + 测试基础设施准备
- [v1.0.0 (2026-05-26)](#v100-2026-05-26) - Node.js 全栈重构：TypeScript + Prisma + 热加载部署
- [v0.3.0 (2026-05-21)](#v030-2026-05-21) - 签到模板化 + TODO 版本管理 + OpenClaw Skill
- [v0.2.2 (2026-04-22)](#v022-2026-04-22) - 统一弹窗系统、周报合并到 TODO、修复 AI 弹窗遮挡
- [v0.1.0 (2025-02-11)](#v010-2025-02-11) - 初始化项目

## v1.9.0 (2026-06-13) — 打卡模板 fields_schema 新增 array 嵌套字段类型

### ✨ 新增

- **array 字段类型** — fields_schema 新增 `type: "array"`，用 `item_fields` 描述元素结构，支持递归嵌套（递归深度上限 3 层）
- **min_items / max_items 校验** — array 字段支持 `min_items`（最小元素数）和 `max_items`（最大元素数，默认 200，硬上限 1000）
- **嵌套路径错误信息** — payload 校验错误带完整路径（如 `exercises[0].sets[1].reps: must be a number`），方便定位深层字段错误

### 🔧 改进

- **injectDefaultField 复用 normalizeFields** — 消除重复的 fieldsSchema 规范化逻辑
- **array 元素遍历早停** — 元素数超过 max_items 时只遍历 [0, maxItems)，避免大 payload 浪费 CPU

### ✅ 测试

- 后端 176 测试全过

## v1.8.0 (2026-06-11) — TODO 接口不再静默建项目 + 项目查重修复

### 🔧 接口收紧

- **TODO 接口移除 project_name** — `POST /api/todos` 和 `PUT /api/todos/:id` 不再接受 `project_name` 参数。传了返回 400 `project_name is no longer supported, create project first via POST /api/projects`。建项目必须显式走 `POST /api/projects`。
- **skill `create_todo` 签名变更** — 删除 `project_name` 参数，改为先调 `create_project` 再传 `project_id`。

### 🐛 修复

- **POST /api/projects 查重 bug** — 原来 `findFirst({ userId, domain })` 导致同 domain 只能建一个项目，现改为 `findFirst({ userId, domain, name })` 三元唯一。
- **409 响应带 data** — 同 (domain, name) 建项目时返回 409，且 `body.data` 包含已有项目信息，方便前端直接复用 `project_id`。

### ✅ 测试

- 后端 161 测试全过
- Skill 80 测试全过

## v1.7.1 (2026-06-11) — watch-pull 自动执行 prisma migrate deploy

### 🚀 部署

- **watch-pull.sh** — 检测到 `prisma/migrations/` 下文件变化时，先跑 `npx prisma migrate deploy` 再 `prisma generate`。`_prisma_migrations` 表保证已 applied 的迁移不会重跑

### ⚠️ 升级提示

如果 prod 库以前从未用过 `prisma migrate`（只用 `db pull`），第一次跑 `migrate deploy` 会失败。需要在 prod 上手动执行：

```
npx prisma migrate resolve --applied <migration_name>
```

把已经手动应用过的迁移标记为 applied，之后 watch-pull 会跳过这条。

## v1.7.0 (2026-06-10) — TODO comment 字段重设计

### 🗑️ 移除

- **`todos.payload`** — JSON 扩展字段删除，提为独立 `comment VARCHAR(500)` 列
- **`todo_versions.payload`** — 同步删除
- **`todo_versions.change_summary`** — 自动生成的变更摘要列删除，替换为 `comment`

### ✨ 新增

- **`todos.comment`** — 独立备注字段（VARCHAR(500) NULL），创建可选，更新必填
- **`todo_versions.comment`** — 版本快照记录当时的 comment 值
- **PUT comment 校验** — 不传返回 400 `comment is required`，超 500 字符返回 400

### 🔧 改进

- **API 响应** — Todo/TodoVersion 响应中 `payload` / `change_summary` 字段移除，新增 `comment`
- **前端版本历史** — 卡片底部版本历史从 `change_summary` 切为 `comment` 展示，空值显示 `—`
- **Skill api_client** — `create_todo` 加可选 `comment=None`，`update_todo` 改为 `comment` 位置参数（必填）

### 🗄️ 数据库迁移

- `prisma/migrations/20260610000000_todo_comment/migration.sql` 含 `payload.comment` 回填，不可逆

### 🧪 测试

- 后端：9 条新测试（C1-C9），现有 PUT 用例全部加 comment
- 前端：2 条新测试（F1-F2），mockVersions 改 comment
- skill：3 条新测试（S1-S3），现有 update_todo 调用全部加 comment
- 全部 155 后端 + 17 前端 + 77 skill 测试通过

## v1.6.2 (2026-06-10) — 文档对齐

### 📝 文档

- **skill/SKILL.md** — 修正归档项目 API 路径错误（原写 `PUT /api/todos/:id`，实际为 `PUT /api/projects/:id` 传 `status='archived'`）
- **skill/SKILL.md** — 删除过时的 `deprecation_warning` 描述（v1.5.0 已真删归档子路由，无兼容层）
- **docs/api.md** — 失败响应模板示例 message 由中文改为英文，与 v1.5.0 错误信息英文化对齐

## v1.6.1 (2026-06-10) — 修复按项目分组排序错误

### 🐛 修复

- **按项目分组内卡片排序** — 之前误用状态优先级排序覆盖了 `updated_at` 倒序，导致已完成/已取消卡片被推到末尾，整体看起来像正序。修复后任何分组模式、任何筛选状态组合下，分组内一律按 `updated_at` 降序

### 🧪 测试

- T6 改为纯时间降序断言；新增 T16 覆盖「按项目分组 + 全选状态」回归场景
- 前端 DOM 测试：15 passed

## v1.6.0 (2026-06-10) — PC 端双列卡片 + 版本历史 + 分组开关

### ✨ 新增功能

- **双列卡片网格** — PC 端（≥1024px）需求/TODO 页卡片改为双列 CSS Grid，手机端自动单列
- **版本历史内联展示** — 卡片底部显示最近 5 条变更历史（`change_summary` + 时间），超过 5 条点击「还有 N 条」全部展开
- **版本历史异步加载** — 每张卡片独立调用 `GET /api/todos/:id/versions?order=desc&limit=5`，失败显示重试按钮
- **按状态 / 按项目分组开关** — 顶部 segmented control 切换分组模式，选择持久化到 `localStorage`
- **多选状态筛选 chip 组** — 5 个状态 chip 可多选，默认勾选未开始+进行中+阻塞

### 🔧 改进

- **状态组排序** — 固定顺序：进行中 → 阻塞 → 未开始 → 已完成 → 已取消，组内 `updated_at` 倒序
- **项目组排序** — 项目之间按组内最新 `updated_at` 倒序，"未归类"始终在最后
- **已完成/已取消视觉弱化** — opacity 降低 + 标题删除线

### 🧪 测试

- **14 条前端 DOM 断言测试** — vitest + happy-dom，覆盖分组、排序、筛选、版本历史、localStorage 持久化
- **独立的 vitest 子配置** — `vitest.config.frontend.ts`，与后端 E2E 测试隔离

### ⚙️ 技术细节

- 新增组件：`todo-card.js`、`group-toggle.js`、`multi-select-filter.js`
- 所有交互元素埋设 `data-testid` 属性（8 个 hook 点）
- 不涉及后端改动、移动端改动、创建/编辑/删除 UI

## v1.5.0 (2026-06-10) — BREAKING CHANGE

### 🚀 接口合一

- **TODO 状态更新并入 PUT** — `POST /api/todos/:id/status` 已删除，使用 `PUT /api/todos/:id` 传入 `status` 字段即可（含 completedAt 自动管理 + 版本快照）
- **项目归档并入 PUT** — `POST /api/projects/:id/archive` 和 `/unarchive` 已删除，使用 `PUT /api/projects/:id` 传入 `status: "active"|"archived"`

### ✨ 新增

- **分类跨用户保护** — PUT/DELETE 非本人分类返回 403 `cannot modify public category`

### 🔧 改进

- **错误信息英文化** — checkin/checkin-template 模块的中文错误替换为英文
- **Skill 脚本同步** — `api_client.py` 删除 `update_todo_status` 函数，使用 `update_todo(id, status="completed")` 替代

### ⚠️ 破坏性变更

| 破坏点 | 影响 | 应对 |
|--------|------|------|
| `POST /api/todos/:id/status` 删除 | 调用方返回 404 | 改用 `PUT /api/todos/:id` 传 status |
| `POST /api/projects/:id/archive` 删除 | 调用方返回 404 | 改用 `PUT /api/projects/:id` 传 status |
| `POST /api/projects/:id/unarchive` 删除 | 同上 | 同上 |
| `api_client.update_todo_status()` 删除 | 调用方报错 | 改用 `api_client.update_todo(id, status=...)` |

## v1.4.3 (2026-06-10)

### 🐛 修复

- **watch-pull 始终重启 PM2** — 代码更新后不再依赖版本号检测，任何代码变化都执行 `pm2 restart gouye`，确保新代码立即生效

## v1.4.2 (2026-06-10)

### ✨ 新增功能

- **打卡模板自动注入 comment 字段** — 创建/更新打卡模板时自动添加系统 `comment` 字段，用户无需手动声明
- **reserved key 拒绝** — 提交含 `comment` 的字段名时返回错误，提示该字段由系统维护

### 🐛 修复

- **Python api_client.py** — `register()` 绕过认证流程直接调用 API，修复新用户无法注册的问题

### 📝 文档

- skill 文档移除 comment 手动传参指引
- API 文档同步 comment 注入变更
- 数据模型文档更新 comment 字段说明

## v1.4.1 (2026-06-09)

### 🐛 修复

- **Token 过期后页面闪烁** — 启动时不再仅检查 token 是否存在，而是调用 API 验证有效性，过期则直接显示登录页，避免主界面闪烁
- **401 跳转优化** — API 返回 401 时直接切换登录页 UI，而非通过 hash 路由跳转

## v1.4.0 (2026-06-05)

### ✨ 新增功能

- **TODO 5 状态体系** — 状态从 3 个（待办/已完成/已取消）扩展为 5 个：
  - 未开始、进行中、阻塞、已完成、已取消
  - 状态间可任意切换，无需校验流转规则
  - `completedAt` 自动管理（进入已完成设值，离开清空）
- **状态颜色方案（PC 端）** — 每个状态有独立配色：未开始（黄色）、进行中（蓝色）、阻塞（红色）、已完成（绿色）、已取消（灰色），通过徽章和卡片样式展示
- **状态颜色方案（移动端）** — 五大状态各有独立的左边框强调色和圆形按钮填充色，已完成的 TODO 显示半透明和删除线效果
- **统计栏细化** — 从 3 项（待办/已完成/已取消）细化为 5 项（未开始/进行中/阻塞/已完成/已取消）
- **默认视图优化** — 需求与 TODO 页面默认显示除「已完成」外的所有状态

### 🗄️ 数据库迁移

- `todos` 表 `status` 列：ENUM 从 3 值扩展为 5 值，存量数据已完成映射转换
- `todo_versions` 表同步扩展

## v1.3.1 (2026-06-03)

### ✨ 新增功能

- **需求 / TODO / 打卡分组视图** — 需求与 TODO 按项目分组，打卡按模板分组展示，分组标题含计数
- **站点 favicon** — PC 前端增加页面图标

### 🐛 修复

- **记账展示修复** — 分类与标签使用可用颜色渲染，不再统一表现为灰白标签
- **打卡详情修复** — 兼容不同模板 schema 结构，修复 payload 明细、标签展示与筛选为空的问题

### 🔧 改进

- **部署脚本按 lockfile 安装依赖** — `scripts/run.sh` 与 `scripts/watch-pull.sh` 改为 `npm ci --include=dev`
- **文档全面更新** — README、架构概览、部署指南、配置说明、测试策略、模块架构全部更新为 Express/TypeScript 技术栈
- **版本元数据更新** — `package.json` 与 `package-lock.json` 更新至 1.3.1

## v1.3.0 (2026-05-29)

### ✨ 新增功能

- **PC 前端重绘** — 全新响应式前端（PC + 手机），只读展示 + 筛选，原生 HTML + Tailwind CSS
  - 需求页（domain=work）：按状态、项目、标签筛选
  - TODO 页（domain=life）：按状态、项目、标签筛选
  - 记账页：按月份、分类、标签筛选，实时显示筛选后收支汇总
  - 打卡页：按模板、日期范围筛选
  - 登录页：JWT 认证，过期自动跳转
  - 侧边栏导航，手机端汉堡菜单

### 🔄 变更

- 根路径 `/` 服务新前端 `frontend-pc/`
- 旧移动端前端移至 `/legacy/`

## v1.2.2 (2026-05-28)

### ✨ 改进

- **run.sh 全面增强** — .env 检测、自动装 pm2、每次 prisma generate、启动后 HTTP 健康检查、失败自动输出错误日志
- **ecosystem.config.cjs** — 改用 `./node_modules/.bin/tsx` 直接运行，兼容性更好
- **根目录 run.sh** — 便捷入口，直接 `./run.sh` 即可启动

### 🔒 新增

- **Git hooks 保护** — 禁止直接在 master 提交，merge 到 master 必须包含 CHANGELOG 修改

### 🐛 修复

- **vitest.config.ts** — 移除硬编码的测试数据库连接串（docker 内部域名 `host.docker.internal`，指向空测试库 `gouye_test`，不涉及真实数据），改为从 .env 的 `TEST_DATABASE_URL` 读取

## v1.2.1 (2026-05-28)

### 🐛 修复

- **ecosystem.config 重构** — 改为 .cjs 格式 + `node --import tsx/esm` 方式运行，解决 tsx 二进制在部分环境缺失问题
- **tsx 移至生产依赖** — `npm install --production` 也能正确安装
- **pm2 cwd 使用 __dirname** — 部署路径无关
- **.gitignore `temp*` 规则修复** — 不再误排除 `template-validator.ts`
- **vitest fileParallelism 关闭** — 修复测试 DB 竞态导致偶发失败

### ✨ 改进

- **scripts/deploy.sh 重写** — 分支无关、flock 防重入、精确 diff 检测
- **scripts/run.sh** — 一键启动/重启脚本

## v1.2.0 (2026-05-26)

### ✨ 新增功能

- **🧪 后端 E2E 测试套件** — Vitest + supertest，覆盖全部 8 个 API 模块（136 个测试用例）
- 测试覆盖：正常 CRUD、认证拒绝、关键边界情况、业务逻辑（状态机、版本管理、payload 校验、收支统计）
- `npm test` 一键执行，独立测试库隔离

### 🐛 修复

- 修复分类列表查询 `{ userId: null }` 与 Prisma 非空 schema 不兼容导致报错

### 📝 文档

- API 文档根据实际代码行为全面重写（修正旧 Flask 时代遗留不一致）
- 新增 E2E 测试设计文档

## v1.1.0 (2026-05-26)

### 🗑️ 移除

- **AI 自然语言解析模块** — 移除路由、服务、Prisma 模型定义及环境变量配置
- 附带 `sql/drop_ai_tables.sql` 供生产环境删表使用

### 🔧 改进

- app.ts 分离创建与启动逻辑，支持 `NODE_ENV=test` 时不自动监听端口

## v1.0.0 (2026-05-26)

### 🚀 核心重构

- **技术栈迁移** - 后端从 Python/Flask/SQLAlchemy 全面重构为 Node.js/TypeScript/Express/Prisma
- **热加载部署** - tsx --watch + pm2 + 定时 git pull 实现代码自动生效，无需手动重启
- **项目结构重组** - 清除旧 Python 代码，统一为标准 Node.js 项目结构

### ✨ 保持的功能

- 用户认证（注册/登录/JWT）
- 记账 CRUD + 收支统计
- 分类管理 + 标签系统
- TODO CRUD + 版本管理 + 状态机
- 项目管理（含归档/恢复）
- 签到模板 + payload 校验
- AI 自然语言解析 + proposals

### 🔄 变更

- 移除定时周报功能（原 APScheduler 实现）
- 移除旧 Python 测试代码
- 移除 HTML 原型文件
- 部署方式从 uvicorn 改为 pm2 + tsx --watch

### 📦 部署

- pm2 进程管理 + 自动保活
- cron 每分钟 git pull，文件变化自动重启
- 每日凌晨 4 点定时重启兜底

## v0.3.0 (2026-05-21)

### ✨ 新增功能

- **📋 签到模板系统** - 打卡从自由分类改为模板驱动，支持 number/select/multi_select/text/boolean/rating 六种字段类型，payload 严格校验
- **📄 TODO 版本管理** - 每次修改自动产生快照版本，支持查看变更历史和差异摘要
- **🤖 OpenClaw Skill** - 新增 gouye Skill（SKILL.md + API 客户端 + 每日检查脚本 + 模块参考文档）
- **🔍 每日账单三件套检查脚本** - 自动判断工作日，检查打车/吃饭/下班打卡是否齐全

### 🔄 变更

- **签到模型重构** - Checkin 移除 title/category/raw_input，改为 template_id + payload 模式
- **TODO 状态互转** - cancelled 状态可恢复为 pending 或 done
- **Project 接口废弃** - 使用 `GET /api/todos?group_by=project` 替代 `/api/projects`
- **AI 周报分页** - 周报列表接口返回分页格式

### 🗑️ 移除

- 移除 checkins 表的 title、raw_input 列
- 移除 todos 表的 raw_input 列
- 移除 ai_proposals 表的 raw_input 列

## v0.2.2 (2026-04-22)

### ✨ 新增功能

- **🪟 统一弹窗系统** - 抽取 openModal/closeModal 工具函数和 .modal-overlay/.modal-content 样式类

### 🐛 修复

- 修复 AI 弹窗被底部导航栏遮挡（z-index 50→110）
- 修复 AI 服务 DeepSeek 模型配置错误

### 🔄 变更

- 周报页面合并到 TODO 页面，删除独立周报页
- 底部导航从 5 项精简为 4 项（中间 AI + 4 个功能 tab）
- 各页面头部添加新建按钮

## [0.1.0] - 2025-02-11

### Added
- 初始化项目结构
- 搭建 Flask 应用框架，集成 SQLAlchemy、JWT、CORS
- 实现用户认证模块（注册/登录）
- 实现记账核心功能：
  - 收支记录 CRUD
  - 分类管理
  - 标签系统
- 创建前端单页面原型（原生 HTML/CSS/JS）
- 配置 MySQL 数据库连接（utf8mb4）
- 添加数据库初始化脚本 `sql/tables.sql`
- 添加错误处理（数据库字符集冲突等）

### Technical
- 使用 `python-dotenv` 管理环境变量
- 使用 `WsgiToAsgi` 适配 Uvicorn 部署
- 前端路由支持 History API（返回 index.html）
