# API 接口合一 + 文档实现一致性整改

**日期**: 2026-06-10
**版本**: v1.5.0（BREAKING CHANGE）
**范围**: 后端路由 + skill + API 文档 + CHANGELOG

## 核心诉求

1. **接口合一**：把"动作子资源"合并到主资源 PUT
   - `POST /api/todos/:id/status` → `PUT /api/todos/:id`
   - `POST /api/projects/:id/archive` + `POST /api/projects/:id/unarchive` → `PUT /api/projects/:id`
2. **修复静默忽略**：PUT 接口对未识别字段（status、archive 状态）静默丢弃 → 改为正常处理
3. **文档对齐**：`docs/api.md` 中 v1.4.0 之后未同步、写读不对称、字段类型歧义、错误信息中英文混用等问题一次性修齐

## 背景

| 现状 | 说明 |
|------|------|
| `PUT /api/todos/:id` | body 里 status 字段被静默忽略 |
| `POST /api/todos/:id/status` | 状态更新专用，含 completedAt 自动管理 + 强制版本快照 |
| `PUT /api/projects/:id` | body 里 status 字段同样可能被静默忽略 |
| `POST /api/projects/:id/archive`、`/unarchive` | 项目状态切换专用 |
| v1.4.0 之后 | TODO 状态可任意互转，"动作语义"合理性弱化 |
| 业内主流 | GitHub Issues / Linear / Asana / Notion 都把状态合到主资源更新接口 |
| `docs/api.md` | v1.4.0 之后未同步：仍写 3 状态枚举、3→3 流转规则 |

---

## 方案

### 一、TODO 状态合一

`PUT /api/todos/:id` 接受 `status` 字段，下沉以前 `/status` 的两个副作用：

1. **completedAt 自动管理**
   - 进入 `completed` → `completedAt = now`
   - 离开 `completed` → `completedAt = null`
   - 其他状态间互转不影响 completedAt
2. **版本快照**：保留"有 diff 才写"语义；status 变化算 diff，自然写快照；`change_summary` 沿用现有 diff 计算

**status 校验**
- 取值：`not_started / in_progress / blocked / completed / cancelled`
- 非法值 → 400 `invalid status: <value>`
- 任意状态可互转，不做流转校验

**移除 `/status` 子接口**：直接删除路由，不保留兼容路径。

**POST /api/todos 不变**：仍不接受初始 status，新建强制 `not_started`。

### 二、项目归档合一

`PUT /api/projects/:id` 接受 `status` 字段：

- 取值：`active / archived`
- 非法值 → 400 `invalid status: <value>`
- 任意切换，不做流转校验

**移除 `/archive`、`/unarchive` 子接口**：直接删除路由。

**说明**：`GET /api/projects?include_archived=true` 查询语义不变。

### 三、API 文档对齐

#### 3.1 删除内容

- 整段 `POST /api/todos/:todoId/status`（含 v1.4.0 后已不存在的 3 状态流转规则）
- 整段 `POST /api/projects/:id/archive` 和 `POST /api/projects/:id/unarchive`

#### 3.2 修正内容

**TODO**

| 位置 | 改动 |
|------|------|
| `GET /api/todos` query 参数 `status` | 取值改为 5 状态枚举 |
| `PUT /api/todos/:todoId` | 列出全部可更新字段（含 status）；增加 status 字段语义说明（5 取值 + 自动 completedAt + 快照规则） |
| `GET /api/todos/:todoId/versions` | 明确 `limit` 越界行为：`limit > 200` 时 clamp 为 200（不报 400） |

**项目**

| 位置 | 改动 |
|------|------|
| `PUT /api/projects/:id` | 列出全部可更新字段（name/domain/status）；status 字段语义说明 |
| `GET /api/projects` `include_archived` | 描述与代码一致（沿用现状："true" 字符串包含已归档） |

**记账**

| 位置 | 改动 |
|------|------|
| `POST /api/transactions.transaction_date` | 写入接受 `YYYY-MM-DD`；响应统一返回 ISO 8601 datetime（`YYYY-MM-DDT00:00:00.000Z`） |
| `images` 字段 | 明确类型：写入与响应均为 `string`（前端负责 `JSON.stringify`），后端不做转换 |

**打卡**

| 位置 | 改动 |
|------|------|
| `POST /api/checkins.occurred_at` | 建议传 ISO 8601 含时区（如 `2026-05-26T10:00:00+08:00`）；不传时使用服务端 UTC `now()` |
| `fields_schema.type` | 与代码对齐：列出全部支持类型（v0.3.0 changelog 提到 6 种：number/select/multi_select/text/boolean/rating；当前文档仅列 5 种 + date——需查代码确认实际支持，文档只列实际支持的） |

**分类**

| 位置 | 改动 |
|------|------|
| `GET /api/categories` 公共分类 | 明确：公共分类（`user_id=null`）只读，禁止 PUT/DELETE，尝试操作返回 403 `cannot modify public category` |

**通用**

| 位置 | 改动 |
|------|------|
| 错误信息语言 | 立规则：**错误 message 统一英文**。本次同步把已存在的中文错误信息改为英文（checkin/checkin-template 模块），保留中文需求文档说明 |
| 分页接口标注 | TODO/checkin/category/tag/project 的列表接口在文档明确："当前无分页支持，全量返回。数据量过大时考虑前端分批渲染" |

#### 3.3 不在本次范围

以下属于**设计债**，本次只在文档列清单，不动代码：

- TODO/checkin 列表加分页（数据量小时不必，后续单独立项）
- 错误信息统一改英文之外的拓展（如 i18n、错误码体系）

### 四、Skill 同步

| 文件 | 改动 |
|------|------|
| `skill/references/todo.md` 第 10 行 | 删除"修改状态" 独立行 |
| `skill/references/todo.md` 第 59 行 | 删除"更新状态用 POST /api/todos/:id/status"提示 |
| `skill/scripts/api_client.py` 第 297-299 行 | **删除** `update_todo_status` 函数（用户已确认选项 A） |
| `skill/scripts/api_client.py` 项目相关 | 如有 `archive_project` / `unarchive_project` 函数，删除；调用方改用 `update_project(id, status="archived")` |
| `skill/references/` 项目相关 ref | 同步删除 archive/unarchive 独立行 |

---

## 涉及文件清单

| 类别 | 文件 | 改动 |
|------|------|------|
| 后端 | `src/routes/todo.ts` | PUT 增加 status 解构 + 枚举校验 + completedAt 管理；删除 `/status` 路由 |
| 后端 | `src/routes/project.ts` | PUT 增加 status 解构 + 枚举校验；删除 `/archive`、`/unarchive` 路由 |
| 后端 | `src/routes/category.ts` | PUT/DELETE 增加公共分类只读校验（如代码已有则确认；如缺失则补） |
| 后端 | `src/routes/transaction.ts` | 检查 `images` 字段处理：保持 string 不转换 |
| 后端 | `src/routes/todo.ts`（versions） | `limit` 越界 clamp 到 200 |
| 后端 | 各路由错误信息 | 中文 → 英文（checkin/checkin-template） |
| 测试 | `tests/todo.test.ts` | 删除 `/status` 用例；新增 U1-U9 |
| 测试 | `tests/project.test.ts` | 删除 `/archive`、`/unarchive` 用例；新增 P1-P5 |
| 测试 | `tests/category.test.ts` | 新增 C1（公共分类只读校验） |
| 测试 | `tests/checkin.test.ts`、`tests/checkin-template.test.ts` | 错误断言中文 → 英文 |
| 文档 | `docs/api.md` | 见上方 3.1、3.2 全部修正项 |
| Skill | `skill/references/todo.md` | 删除 status 独立行与提示 |
| Skill | `skill/references/` 其他相关 ref | 删除项目 archive/unarchive 行（如存在） |
| Skill | `skill/scripts/api_client.py` | 删除 `update_todo_status`、`archive_project`、`unarchive_project`（如存在） |
| Skill | `skill/scripts/daily_check.py`、其他脚本 | grep + 替换调用点 |
| 变更日志 | `CHANGELOG.md` | v1.5.0：BREAKING — 接口合一 + 文档对齐 |

---

## 测试与验收

### 后端测试用例

#### TODO（U 系列）

| ID | 用例 | 期望 |
|----|------|------|
| U1 | PUT body 含 `status: "in_progress"` | 200，DB 更新，写新版本快照 |
| U2 | PUT body 含 `status: "completed"` | 200，`completed_at` 自动设为当前时间 |
| U3 | 已 completed 的 todo PUT body 含 `status: "in_progress"` | 200，`completed_at` 清空为 null |
| U4 | PUT body 含 `status: "invalid_value"` | 400，message 含 "invalid status" |
| U5 | PUT body 含 title + status | 200，两字段都更新；快照 change_summary 含两者 |
| U6 | PUT body 不含 status | 200，沿用旧值（回归） |
| U7 | `POST /api/todos/:id/status` 路径 | 404（路由已删除） |
| U8 | not_started → not_started 同状态 PUT | 200，不写快照（沿用 PUT "有 diff 才写"） |
| U9 | 用户 A PUT 用户 B 的 todo（含 status） | 404（权限校验回归） |
| U10 | `GET /api/todos/:id/versions?limit=500` | 200，实际返回 ≤200 条 |

#### 项目（P 系列）

| ID | 用例 | 期望 |
|----|------|------|
| P1 | PUT body 含 `status: "archived"` | 200，DB 更新 |
| P2 | PUT body 含 `status: "active"`（恢复） | 200，DB 更新 |
| P3 | PUT body 含 `status: "invalid"` | 400 |
| P4 | `POST /api/projects/:id/archive` 路径 | 404（已删除） |
| P5 | `POST /api/projects/:id/unarchive` 路径 | 404（已删除） |

#### 分类（C 系列）

| ID | 用例 | 期望 |
|----|------|------|
| C1 | 用户 PUT 公共分类（user_id=null） | 403 `cannot modify public category` |
| C2 | 用户 DELETE 公共分类 | 403 同上 |

#### 错误信息英文化（E 系列）

| ID | 用例 | 期望 |
|----|------|------|
| E1 | POST /api/checkin-templates 缺 name | 400 `name and fields_schema are required`（之前是中文） |
| E2 | 同名模板冲突 | 409 `template name already exists` |
| E3 | 删除有打卡的模板 | 409 `cannot delete template with associated checkins` |
| E4 | payload 校验失败 | 400 `payload validation failed: <detail>` |

### Skill 验证

| ID | 用例 | 期望 |
|----|------|------|
| S1 | `api_client.update_todo(id, status="completed")` | 调用 `PUT /api/todos/:id`，DB 生效 |
| S2 | `api_client.update_project(id, status="archived")` | 调用 `PUT /api/projects/:id`，DB 生效 |
| S3 | `grep -r "update_todo_status\|archive_project\|unarchive_project" skill/` | 无残留 |
| S4 | `grep -r "/api/todos/.*/status\|/api/projects/.*/archive" skill/` | 无残留 |
| S5 | `bash skill/scripts/test_api.sh` | 全过 |

---

## 兼容性与破坏性变更

**v1.5.0 是 BREAKING CHANGE**：

| 破坏点 | 影响 | 应对 |
|--------|------|------|
| `POST /api/todos/:id/status` 删除 | 任何调用方使用此路径会 404 | 同步更新 skill |
| `POST /api/projects/:id/archive` 删除 | 同上 | 同步更新 skill |
| `POST /api/projects/:id/unarchive` 删除 | 同上 | 同步更新 skill |
| 公共分类禁止改写 | 之前可能未校验，调用方依赖此 bug 会突然 403 | 文档明示；改写公共分类本就不应被允许 |
| checkin/checkin-template 错误信息英文化 | 前端如有按字符串匹配错误的逻辑会失效 | 当前前端只读，不消费这些错误；不受影响 |

**部署顺序**：
1. 先合并 skill 改动（去除对旧路径的依赖）
2. 再合并后端改动
3. 最后更新 CHANGELOG 发布

---

## 实现步骤建议（给执行者）

1. **后端 todo**：改 `src/routes/todo.ts`（PUT 加 status + 删 /status 路由 + versions limit clamp）→ 改测试 → `npm test`
2. **后端 project**：改 `src/routes/project.ts`（PUT 加 status + 删 /archive、/unarchive 路由）→ 改测试 → `npm test`
3. **后端 category**：补/确认公共分类只读校验 → 加测试 → `npm test`
4. **后端 checkin/checkin-template**：错误信息中文 → 英文 → 改测试断言 → `npm test`
5. **后端 transaction**：核对 `images` 字段处理逻辑（不需改，仅确认）
6. **API 文档**：按上方 3.1、3.2 全部修正项更新 `docs/api.md`
7. **Skill**：
   - `grep -rn "/api/todos/.*/status\|/api/projects/.*/archive\|/api/projects/.*/unarchive\|update_todo_status\|archive_project\|unarchive_project" skill/` 找全部引用
   - 删除 `api_client.py` 中相关函数
   - 改 `references/todo.md`（项目 ref 如有同步）
   - 改 daily_check.py 等脚本调用点
   - 跑 `skill/scripts/test_api.sh`
8. **CHANGELOG**：v1.5.0 BREAKING 条目（详细列接口删除、字段、错误信息英文化）
9. **最终回归**：`npm test` + `bash skill/scripts/test_api.sh` + grep 残留检查
10. 提交

---

## 验收 checklist

- [ ] `npm test` 全过（含 U1-U10、P1-P5、C1-C2、E1-E4）
- [ ] `POST /api/todos/:id/status`、`/api/projects/:id/archive`、`/api/projects/:id/unarchive` 全部 404
- [ ] `docs/api.md` 中以下表述全部消失：
  - [ ] `POST /api/todos/:todoId/status`
  - [ ] `POST /api/projects/:id/archive`
  - [ ] `POST /api/projects/:id/unarchive`
  - [ ] 3 状态枚举（pending/done/cancelled）
  - [ ] 3→3 状态流转规则段
- [ ] `docs/api.md` 中以下表述存在：
  - [ ] PUT /api/todos/:id 列出 status 字段含 5 取值
  - [ ] PUT /api/projects/:id 列出 status 字段含 active/archived
  - [ ] 公共分类只读说明
  - [ ] images 字段类型说明
  - [ ] transaction_date 写读格式说明
  - [ ] occurred_at 时区说明
  - [ ] versions limit clamp 说明
  - [ ] 各列表接口"无分页"标注
- [ ] `grep -rn "/api/todos/.*/status\|/api/projects/.*/archive\|/api/projects/.*/unarchive" skill/` 无残留
- [ ] `grep -rn "update_todo_status\|archive_project\|unarchive_project" skill/` 无残留
- [ ] `bash skill/scripts/test_api.sh` 全过
- [ ] CHANGELOG 标注 v1.5.0 BREAKING

---

## 不包含

- POST /api/todos 接受初始 status（独立问题）
- 前端调用方改动（前端目前只读，不调被删的接口）
- 引入 PATCH 方法
- 任何接口的兼容别名保留
- TODO/checkin 列表分页（设计债，单独立项）
- 错误码标准化（i18n、code 体系）
- 旧移动端 `frontend/` 适配
