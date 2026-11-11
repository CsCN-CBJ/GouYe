# 后端 E2E 测试套件 设计文档

**核心诉求：** 为 8 个 API 模块建立端到端测试，作为每次代码变更后的自动化 CI。覆盖正常流程 + 权限校验 + 关键边界情况。

**日期：** 2026-05-26

## 背景

v1.0.0 完成了 Flask → Node.js 全栈重构，但没有自动化测试。每次改动只能手动验证，不可持续。需要一套 E2E 测试作为安全网，`npm test` 一键执行全绿才能合并代码。

不做的代价：后续迭代（SKILL+CLI、前端重构）可能无意中破坏已有接口行为。

## 方案

**选择：Vitest + supertest + 独立测试库**

- **Vitest** — 原生 TypeScript/ESM 支持，零配置，速度快
- **supertest** — 直接测 Express app 实例，无需启动服务器
- **独立 MySQL 测试库** — `gouye_test`，每个测试文件前清空相关表，保证隔离

**app.ts 已改造：** `NODE_ENV=test` 时不自动 listen，supertest 直接使用 app 实例。

## 功能范围

### 包含

- 8 个 API 模块的完整 E2E 测试（user, category, tag, transaction, project, todo, checkin, checkin-template）
- 认证流程测试（无 token 拒绝、过期 token 拒绝、有效 token 通过）
- 正常 CRUD 流程
- 关键边界情况（缺少必填字段、重复数据、无效枚举值、不存在的资源 ID）
- 业务逻辑验证（TODO 状态机、版本快照、打卡 payload 校验、收支统计）
- npm script 集成（`npm test` 一键执行）

### 不包含

- 前端测试
- 性能/压力测试
- Mock 外部服务（AI 已删除，无外部依赖）
- 数据库 migration 自动化（手动创建测试库）

## 技术架构

### 目录结构

```
tests/
├── setup.ts                  # globalSetup: 连接测试库、清空所有表
├── helpers.ts                # 工具函数: 注册用户、获取 token、工厂函数
├── user.test.ts
├── category.test.ts
├── tag.test.ts
├── transaction.test.ts
├── project.test.ts
├── todo.test.ts
├── checkin-template.test.ts
└── checkin.test.ts
vitest.config.ts              # 测试配置
```

### 配置文件

**vitest.config.ts:**
- 环境变量：`NODE_ENV=test`，`DATABASE_URL` 指向 `gouye_test`
- 全局 setup/teardown
- 串行执行（测试间共享数据库，避免并发冲突）

**测试数据库：**
- 库名：`gouye_test`
- 与生产库同 schema（prisma generate 生成的 client 通用）
- 测试前通过 `TRUNCATE` 清空所有表

### helpers.ts 工具函数

```typescript
// 注册并登录，返回 token
async function createAuthenticatedUser(username?: string): Promise<{ token: string; userId: number }>

// 创建分类，返回 category_id
async function createCategory(token: string, data?: Partial<CategoryInput>): Promise<number>

// 创建标签
async function createTag(token: string, name?: string): Promise<number>

// 创建项目
async function createProject(token: string, data?: Partial<ProjectInput>): Promise<number>

// 创建打卡模板
async function createCheckinTemplate(token: string, data?: Partial<TemplateInput>): Promise<number>
```

## 各模块测试用例

### user.test.ts

| 用例 | 预期 |
|------|------|
| POST /register 正常注册 | 201, 返回 user_id + username |
| POST /register 缺少字段 | 400 |
| POST /register 重复用户名 | 409 |
| POST /login 正常登录 | 200, 返回 token |
| POST /login 错误密码 | 401 |
| POST /login 不存在的用户 | 401 |
| GET /me 有效 token | 200, 返回当前用户 |
| GET /me 无 token | 401 |
| GET /me 无效 token | 401 |

### category.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建 income 分类 | 200, 正确 category_type |
| POST 创建 expense 分类 | 200 |
| POST 缺少 category_name | 400 |
| GET 列表 | 200, 返回当前用户的分类 |
| PUT 更新分类 | 200, 字段已更新 |
| DELETE 删除分类 | 200 |
| DELETE 不存在的分类 | 404 |
| 无 token 访问 | 401 |

### tag.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建标签 | 200 |
| POST 重复标签名（同用户） | 400/409 |
| POST 同名标签（不同用户） | 200，允许 |
| GET 列表 | 200, 只返回当前用户的 |
| PUT 更新 | 200 |
| DELETE 删除 | 200 |

### transaction.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建收入记录 | 201, 含 category 和 tags |
| POST 创建支出记录 | 201 |
| POST 缺少必填字段 | 400 |
| POST 无效 transaction_type | 400 |
| POST 带 tag_ids 关联 | 201, tags 数组包含关联标签 |
| GET 列表（分页） | 200, 含 total/page/pages |
| GET 列表按 type 筛选 | 200, 只返回指定类型 |
| GET 列表按日期范围筛选 | 200 |
| GET 列表按 tag_id 筛选 | 200 |
| GET /summary 收支统计 | 200, income/expense/balance 正确 |
| GET /summary 按日期范围 | 200 |
| GET /:id 详情 | 200 |
| GET /:id 不存在 | 404 |
| PUT 更新金额 | 200 |
| PUT 更新标签关联 | 200, tags 已更新 |
| DELETE | 200 |

### project.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建项目 | 201 |
| POST 重复 (domain+name) | 409 |
| GET 列表 | 200 |
| GET 按 domain 筛选 | 200 |
| PUT 更新 | 200 |
| POST /:id/archive | 200, status=archived |
| POST /:id/unarchive | 200, status=active |
| DELETE | 200 |

### todo.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建 TODO | 201, status=pending, current_version=1 |
| POST 缺少 title/domain | 400 |
| POST 无效 domain | 400 |
| POST 带 project_name（自动创建项目） | 201, project 非 null |
| POST 带 tag_ids | 201, tags 数组正确 |
| GET 列表 | 200 |
| GET 按 status 筛选 | 200 |
| GET group_by=project | 200, 返回项目分组结构 |
| GET /:id 详情 | 200 |
| PUT 更新 title | 200, current_version 递增 |
| PUT 更新 tags | 200, version change_summary 含 "tags" |
| POST /:id/status pending→done | 200, completedAt 非 null |
| POST /:id/status done→pending | 200, completedAt 为 null |
| POST /:id/status done→cancelled | 200 |
| POST /:id/status cancelled→pending | 200 |
| POST /:id/status pending→pending（无效） | 400 |
| DELETE | 200 |
| GET /:id/versions | 200, 返回版本列表 |
| GET /:id/versions/:num | 200, 返回指定版本 |

### checkin-template.test.ts

| 用例 | 预期 |
|------|------|
| POST 创建模板（含 fields_schema） | 200 |
| POST 缺少 name | 400 |
| POST 重复模板名 | 409 |
| GET 列表 | 200 |
| GET /:id | 200 |
| PUT 更新 schema | 200 |
| DELETE | 200 |

### checkin.test.ts

| 用例 | 预期 |
|------|------|
| POST 基于模板创建打卡 | 200 |
| POST template_id 不存在 | 404 |
| POST payload 与 schema 匹配 | 200 |
| POST payload 缺少 required 字段 | 400, 含具体错误信息 |
| POST payload 含未知字段 | 400 |
| POST payload 类型错误（number 传 string） | 400 |
| POST payload select 值不在 options 中 | 400 |
| GET 列表 | 200 |
| GET 按 template_id 筛选 | 200 |
| GET /:id | 200 |
| PUT 更新 payload | 200 |
| PUT 更新时 payload 校验仍生效 | 400 |
| DELETE | 200 |

## 测试与验收

### 验收标准

- [ ] `npm test` 一键执行全部测试
- [ ] 所有测试 pass（0 failures）
- [ ] 每个模块至少覆盖：正常 CRUD + 权限拒绝 + 1-2 个边界
- [ ] 测试间无顺序依赖（每个文件可独立运行）
- [ ] 测试数据隔离（不影响生产库）

### 运行方式

```bash
# 一键执行
npm test

# 单个模块
npx vitest run tests/todo.test.ts

# watch 模式（开发时）
npx vitest tests/todo.test.ts
```

## 风险与假设

| 假设 | 如果错了 |
|------|---------|
| 本地可创建 gouye_test 库 | 需要用户手动创建或提供连接信息 |
| 串行执行性能可接受 | 如果太慢（>30s），改为按模块并行+每模块独立用户隔离 |
| Prisma Client 可同时连不同库 | 用环境变量切换 DATABASE_URL 即可 |
| 测试不需要 seed 数据 | 每个测试自己创建所需数据 |
