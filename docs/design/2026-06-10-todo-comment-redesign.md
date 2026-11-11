# TODO comment 字段重设计

**日期**: 2026-06-10
**版本**: v1.7.0
**性质**: 数据库 schema 调整 + API 字段变化（前端/skill 同步）

## 核心诉求

1. 现在 TODO 的备注藏在 `payload.comment` 里，自由 JSON 没有约束
2. 版本历史的 `change_summary` 是后端拼的字段名清单（`Updated: payload`），看不出实际改了啥
3. 用户希望：每个版本带一个**用户自己写的备注**（常驻备注语义），前端版本历史那一格直接显示这个备注

## 方案

把 `payload` 整个字段删掉，提一个独立 `comment` 字段到 Todo 和 TodoVersion 表上。
版本历史展示从 `change_summary` 切到 `comment`，前端只换字符串来源，其他不动。

### 字段改动

| 表 | 删除 | 新增 |
|---|---|---|
| `todos` | `payload JSON?` | `comment VARCHAR(500)?` |
| `todo_versions` | `payload JSON?`、`change_summary VARCHAR(500)?` | `comment VARCHAR(500)?` |

### comment 语义

- **常驻备注**（不是 commit-message）：PUT 时传啥就改成啥，version 快照保存当时的值
- **创建 TODO**：comment 可选（可不传）
- **PUT 更新 TODO**：comment **必填**，缺了返回 400
- 不想改 comment 的场景：前端把当前 comment 原值重新传一遍

### API 行为

#### POST /api/todos

```json
{
  "title": "搞实验",
  "domain": "work",
  "comment": "周三 deadline 记得搞"
}
```

- comment 不传：写入 NULL，v1 快照里 comment 也是 NULL
- comment 传空字符串：视为 NULL（与 NULL 等价处理）

#### PUT /api/todos/:id

```json
{
  "status": "in_progress",
  "comment": "今天先把状态改了"
}
```

- comment 缺失 → `400 comment is required`
- comment 是空字符串 → 允许，存为空串
- comment 长度 > 500 → `400 comment too long (max 500)`

#### GET /api/todos/:id

返回里 `payload` 字段移除，`comment` 字段加进来。

#### GET /api/todos/:id/versions

每条 version 返回：
- 移除 `payload`、`change_summary`
- 新增 `comment`

### 前端展示

`frontend-pc/js/components/todo-card.js` 版本历史那一行：

```
v3 · 13:47 · 正在加实验
v2 · 13:36 · 今天先把状态改了
v1 · 06-01 · （空时不显示这一段，或显示为 —）
```

具体改动：
- 把渲染 `version.change_summary` 的位置改成读 `version.comment`
- comment 为 null/空 时该位置展示 `—`（或前端按需省略）
- 其他渲染逻辑不动（版本号、时间、展开折叠都保留）

编辑/创建表单：
- 创建表单：加一个 `comment`（备注）文本域，可空
- 编辑表单：加一个 `comment` 文本域，**必填**校验，placeholder 提示"本次备注"
- TODO 卡片正面**不展示** comment（保持卡片紧凑），只在版本历史里展示

### 数据迁移

新建 migration：

```sql
ALTER TABLE todos ADD COLUMN comment VARCHAR(500) NULL;
ALTER TABLE todo_versions ADD COLUMN comment VARCHAR(500) NULL;

UPDATE todos
   SET comment = JSON_UNQUOTE(JSON_EXTRACT(payload, '$.comment'))
 WHERE payload IS NOT NULL
   AND JSON_EXTRACT(payload, '$.comment') IS NOT NULL;

UPDATE todo_versions
   SET comment = JSON_UNQUOTE(JSON_EXTRACT(payload, '$.comment'))
 WHERE payload IS NOT NULL
   AND JSON_EXTRACT(payload, '$.comment') IS NOT NULL;

ALTER TABLE todos DROP COLUMN payload;
ALTER TABLE todo_versions DROP COLUMN payload;
ALTER TABLE todo_versions DROP COLUMN change_summary;
```

注意：
- 历史 version 没有 `payload.comment` 的回填后是 NULL，前端展示 `—`
- v1 「Initial version」这类自动 change_summary 直接丢弃
- 该迁移**不可逆**，执行前 dump 一份 prod 库

### skill 同步

- `skill/scripts/api_client.py`:
  - `create_todo(...)` 加可选参数 `comment=None`
  - `update_todo(...)` 加**必填**参数 `comment`（位置参数，不给默认值）
  - 删除 payload 相关签名
- `skill/references/todo.md`:
  - 删除 payload 章节
  - 新增 comment 字段说明（创建可选、更新必填、常驻语义）
- `skill/SKILL.md`:
  - 检查是否提到 todo payload，删

### 涉及文件清单

| 类别 | 文件 | 改动 |
|---|---|---|
| schema | `prisma/schema.prisma` | Todo / TodoVersion 字段调整 |
| migration | `prisma/migrations/<timestamp>_todo_comment/migration.sql` | 新增（含回填） |
| 后端路由 | `src/routes/todo.ts` | POST 接 comment 可选；PUT 校验 comment 必填；响应字段调整 |
| 后端服务 | `src/services/todo-versioning.ts` | snapshot 写 comment；移除 change_summary 拼接 |
| 后端测试 | `tests/todo.test.ts` | 现有 payload/change_summary 用例改写；新增 comment 用例 |
| 前端组件 | `frontend-pc/js/components/todo-card.js` | 版本历史展示从 change_summary → comment |
| 前端页面 | `frontend-pc/js/pages/requirements.js`、`todos.js` | 编辑/创建表单加 comment 输入 |
| 前端 CSS | `frontend-pc/css/app.css` | 备注输入框样式 |
| 前端测试 | `tests/frontend/todo-card.test.js` | 版本展示断言改 comment |
| skill | `skill/scripts/api_client.py` | create_todo / update_todo 签名调整 |
| skill | `skill/references/todo.md` | payload 章节 → comment 章节 |
| skill | `skill/SKILL.md` | 检查清理 |
| skill 测试 | `skill/tests/test_todo.py` | comment 必填/可选用例 |
| 文档 | `docs/api.md` | todos 字段说明 + versions 示例 |
| 文档 | `CHANGELOG.md` | v1.7.0 条目 |
| 元 | `package.json` | version → 1.7.0 |

## 测试与验收

### 后端测试用例

| ID | 用例 | 期望 |
|---|---|---|
| C1 | POST /todos 不传 comment | 201，DB comment IS NULL，v1 comment IS NULL |
| C2 | POST /todos 传 comment="abc" | 201，DB comment="abc"，v1 comment="abc" |
| C3 | POST /todos 传 comment=空字符串 | 201，DB comment 存为 NULL |
| C4 | PUT /todos/:id 不传 comment | 400 `comment is required` |
| C5 | PUT /todos/:id 传 comment + 改 status | 200，DB 更新，v(n+1) comment = 新值 |
| C6 | PUT /todos/:id 仅传 comment（无其他变化） | 200，写新版本 |
| C7 | PUT /todos/:id comment 长度 501 | 400 `comment too long (max 500)` |
| C8 | GET /todos/:id 响应 | 不含 payload，含 comment 字段 |
| C9 | GET /todos/:id/versions 响应 | 每条不含 payload/change_summary，含 comment |
| C10 | 迁移回填 | 已有 payload.comment 的 todo / version 在迁移后 comment 字段保留原值 |

### 前端测试用例

| ID | 用例 | 期望 |
|---|---|---|
| F1 | 版本历史渲染 | `version-item` 内显示 `version.comment`，不再出现 `Updated:`、`Initial version` |
| F2 | comment 为空的版本 | 该位置显示 `—` 或省略 |
| F3 | 编辑表单未填 comment 提交 | 前端阻止提交并提示必填 |
| F4 | 创建表单未填 comment 提交 | 允许，请求 body 不带 comment |

### skill 测试用例

| ID | 用例 | 期望 |
|---|---|---|
| S1 | `update_todo(id, status='completed')` 不传 comment | TypeError 或 API 400 |
| S2 | `update_todo(id, status='completed', comment='完成了')` | 200，version 写入 |
| S3 | `create_todo(title='x', domain='work')` 不传 comment | 201，comment NULL |

### 验收 checklist

应该消失：
- [ ] 数据库 `todos.payload` / `todo_versions.payload` 列已 drop
- [ ] 数据库 `todo_versions.change_summary` 列已 drop
- [ ] API 响应中不再出现 `payload`、`change_summary` 字段
- [ ] 前端版本历史里不再出现 `Updated: xxx`、`Initial version` 等自动文案
- [ ] skill api_client 不再有 payload 相关参数

应该存在：
- [ ] `todos.comment` / `todo_versions.comment` 列存在，类型 VARCHAR(500) NULL
- [ ] 历史已有 `payload.comment` 的数据已回填到新列
- [ ] PUT /todos/:id 不传 comment → 400
- [ ] POST /todos 不传 comment → 201
- [ ] 前端版本历史展示来自 `version.comment` 的内容
- [ ] 编辑表单 comment 必填、创建表单 comment 可选
- [ ] CHANGELOG / package.json 版本同步到 1.7.0
- [ ] `npm test` + `npm run test:frontend` + `npm run test:skill` 全过

## 不包含

- TODO 卡片正面展示 comment（保持卡片紧凑，不动）
- 移动端 frontend/ 改造（legacy 不动，跟随后端字段返回即可）
- comment 富文本/Markdown 渲染
- comment 历史搜索/筛选
- CheckinTemplate.payload 改造（仅 TODO，checkin 的 payload 是 schema-driven，保留）

## 风险与假设

| 风险 | 应对 |
|---|---|
| migration 不可逆，prod 库出问题 | 执行前 mysqldump 备份 todos / todo_versions 两张表 |
| 现存代码读 `todo.payload` 没清理干净导致运行时崩 | 全局 grep `\.payload`、`payload:` 排查 todo 相关引用 |
| 前端旧版 cache 还在请求 payload 字段 | 后端响应不带 payload，前端访问 `undefined` 时不要崩 |
| skill 旧调用方已经在传 payload | api_client 不再支持 payload 参数，调用方升级时同步改 |

## 实现步骤（给 codebuddy）

1. 改 `prisma/schema.prisma`：Todo / TodoVersion 加 comment、删 payload / change_summary
2. 写 migration SQL（含回填）
3. 改 `src/services/todo-versioning.ts`：移除 change_summary 拼接，snapshot 带上 comment
4. 改 `src/routes/todo.ts`：POST 接 comment 可选；PUT 校验 comment 必填、长度上限；响应字段调整
5. 改 `tests/todo.test.ts`：旧 payload/change_summary 用例改写，加 C1-C10
6. `npm test` 全过
7. 改 `frontend-pc/js/components/todo-card.js`：版本历史 change_summary → comment
8. 改 `frontend-pc/js/pages/requirements.js`、`todos.js`：表单加 comment 输入 + 必填校验（编辑）
9. 改 `tests/frontend/todo-card.test.js`：F1-F4 断言
10. `npm run test:frontend` 全过
11. 改 `skill/scripts/api_client.py`、`skill/references/todo.md`、`skill/SKILL.md`
12. 改 `skill/tests/test_todo.py`
13. `npm run test:skill` 全过
14. 改 `docs/api.md`
15. `CHANGELOG.md` + `package.json` v1.7.0
