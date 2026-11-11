# Gouye 数据模型

## User（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | BigInteger | 主键 |
| username | String(50) | 用户名，唯一 |
| password_hash | String(255) | 密码哈希 |
| avatar_url | String(255) | 头像URL |
| created_at | DateTime | 创建时间 |

---

## Category（分类）

| 字段 | 类型 | 说明 |
|------|------|------|
| category_id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| category_name | String(50) | 分类名称 |
| category_type | Enum | income / expense |
| icon | String(50) | 图标（emoji或icon名称） |
| color | String(20) | 颜色值 |
| created_at | DateTime | 创建时间 |

**约束**: (user_id, category_name) 唯一

---

## Tag（标签）

| 字段 | 类型 | 说明 |
|------|------|------|
| tag_id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| tag_name | String(30) | 标签名称 |
| color | String(20) | 颜色值 |
| created_at | DateTime | 创建时间 |

**约束**: (user_id, tag_name) 唯一

---

## Transaction（记账流水）

| 字段 | 类型 | 说明 |
|------|------|------|
| transaction_id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| category_id | BigInteger | 分类ID |
| amount | Numeric(15,2) | 金额（字符串形式返回） |
| transaction_type | Enum | income / expense |
| transaction_date | DateTime | 交易日期 |
| description | String(255) | 描述 |
| images | Text | 图片URL，逗号分隔 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

关联：多对多关联 Tag

---

## Todo（待办）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| domain | Enum | work / life |
| project_id | BigInteger | 项目ID（可空） |
| title | String(200) | 标题 |
| status | Enum | not_started / in_progress / blocked / completed / cancelled |
| due_at | DateTime | 截止日期（可空） |
| completed_at | DateTime | 完成时间（可空） |
| payload | JSON | 扩展数据 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

关联：多对多关联 Tag；一对多关联 TodoVersion（CASCADE 删除）

**流转规则**: 状态间可任意切换，无需校验流转规则

---

## TodoVersion（TODO 版本历史快照）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger | 主键 |
| todo_id | BigInteger | 关联 TODO（FK, ON DELETE CASCADE） |
| version_number | Integer | 版本号，同一 todo_id 内从 1 递增 |
| title | String(200) | 快照 |
| status | Enum | 快照 |
| domain | Enum | 快照 |
| project_id | BigInteger | 快照（可空） |
| due_at | DateTime | 快照（可空） |
| completed_at | DateTime | 快照（可空） |
| payload | JSON | 快照（可空） |
| tag_ids | JSON | 标签 ID 数组快照 |
| change_summary | String(500) | 变更摘要（可读字符串） |
| created_at | DateTime | 版本创建时间 |

**约束**: `UNIQUE (todo_id, version_number)`

**写入时机**: 创建 TODO 时写入 v1；PUT/状态转换时若有字段变化则追加新版本；同值更新不写。

---

## Project（项目）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| domain | Enum | work / life |
| name | String(100) | 项目名称 |
| status | Enum | active / archived |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

**约束**: (user_id, domain, name) 唯一

---

## Checkin（打卡/运动）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| template_id | BigInteger | 所属模板（NOT NULL，FK → checkin_templates.id） |
| occurred_at | DateTime | 发生时间（展示时叫"时间"而非"日期"） |
| payload | JSON | 按模板 fields_schema 存储的打卡数据（schema 中已含 `comment` 字段） |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

关联：多对多关联 Tag；多对一关联 CheckinTemplate

---

## CheckinTemplate（打卡模板）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BigInteger | 主键 |
| user_id | BigInteger | 所属用户 |
| name | String(50) | 模板名（如"跑步"） |
| icon | String(50) | 图标标识符（如"running"），可空 |
| fields_schema | JSON | 字段定义 JSON 数组，每个元素含 `key`, `type`, `required` 等。支持同时传 `{"fields": [...]}` 嵌套格式或扁平数组 |
| created_at | DateTime | 创建时间 |
| updated_at | DateTime | 更新时间 |

**约束**: (user_id, name) 唯一

**fields_schema 支持类型**：`number` / `select` / `text` / `boolean` / `date`

`comment` 字段（text 类型，备注）由后端自动注入，用户不可自定义

