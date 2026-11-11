# API 文档

## 基础信息

- **Base URL**: `/api`
- **认证方式**: JWT Bearer Token（`Authorization: Bearer <token>`）
- **Content-Type**: `application/json`

## 响应格式

**成功：**
```json
{
  "code": 0,
  "data": { ... },
  "message": "ok"
}
```

**失败：**
```json
{
  "code": 1,
  "message": "Error message"
}
```

**常见 HTTP 状态码：**
- `200` — 成功
- `201` — 创建成功
- `400` — 请求参数错误
- `401` — 未授权（Token 无效、过期或缺失）
- `404` — 资源不存在
- `409` — 冲突（重复数据）
- `500` — 服务器内部错误

---

## 用户模块

### POST /api/users/register

用户注册

**请求参数：**
```json
{
  "username": "string",
  "password": "string"
}
```

**成功响应（200）：**
```json
{
  "code": 0,
  "data": {
    "user_id": 1,
    "username": "testuser",
    "created_at": "2026-05-26T10:00:00.000Z"
  },
  "message": "ok"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | username and password are required |
| 409 | username already exists |

### POST /api/users/login

用户登录

**请求参数：**
```json
{
  "username": "string",
  "password": "string"
}
```

**成功响应（200）：**
```json
{
  "code": 0,
  "data": {
    "token": "jwt_token_string",
    "user": {
      "user_id": 1,
      "username": "testuser",
      "created_at": "2026-05-26T10:00:00.000Z"
    }
  },
  "message": "ok"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | username and password are required |
| 401 | invalid credentials |

### GET /api/users/me

获取当前用户信息（需认证）

**成功响应（200）：**
```json
{
  "code": 0,
  "data": {
    "user_id": 1,
    "username": "testuser",
    "created_at": "2026-05-26T10:00:00.000Z"
  },
  "message": "ok"
}
```

---

## 分类模块

所有接口需认证。

### GET /api/categories

获取分类列表（含当前用户的和系统公共分类 `user_id=null`）

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。（含当前用户的和系统公共分类 `user_id=null`）

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | `income` / `expense` |
| keyword | string | 否 | 对 category_name 做模糊匹配（escape `%` `_` `\`） |

未识别的 query parameter 返回 400，message 包含参数名列表。

**成功响应（200）：**
```json
{
  "code": 0,
  "data": [
    {
      "category_id": 1,
      "user_id": 1,
      "category_name": "餐饮",
      "category_type": "expense",
      "icon": "food",
      "color": "#ff6600",
      "created_at": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "ok"
}
```

### POST /api/categories

创建分类

**请求参数：**
```json
{
  "category_name": "string",
  "category_type": "income|expense",
  "icon": "string (可选)",
  "color": "string (可选)"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | category_name and category_type are required |
| 400 | category_type must be income or expense |

### PUT /api/categories/:categoryId

更新分类

> 公共分类（`user_id=null`）为只读，尝试修改返回 403 `cannot modify public category`。

**请求参数（所有字段可选）：**
```json
{
  "category_name": "string",
  "icon": "string",
  "color": "string"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 403 | cannot modify public category |
| 404 | category not found |

### DELETE /api/categories/:categoryId

删除分类

> 公共分类（`user_id=null`）为只读，尝试删除返回 403 `cannot modify public category`。

**错误响应：**
| 状态码 | message |
|--------|---------|
| 403 | cannot modify public category |
| 404 | category not found |
| 409 | cannot delete category with associated transactions |

---

## 标签模块

所有接口需认证。

### GET /api/tags

获取当前用户的标签列表

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 对 tag_name 做模糊匹配（escape `%` `_` `\`） |

未识别的 query parameter 返回 400，message 包含参数名列表。

**成功响应（200）：**
```json
{
  "code": 0,
  "data": [
    {
      "tag_id": 1,
      "user_id": 1,
      "tag_name": "工作餐",
      "color": "#3366ff",
      "created_at": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "ok"
}
```

### POST /api/tags

创建标签

**请求参数：**
```json
{
  "tag_name": "string",
  "color": "string (可选)"
}
```

**成功响应（201）：**
```json
{
  "code": 0,
  "data": { "tag_id": 1, "..." : "..." },
  "message": "created"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | tag_name is required |
| 409 | tag name already exists |

### PUT /api/tags/:tagId

更新标签

**请求参数（所有字段可选）：**
```json
{
  "tag_name": "string",
  "color": "string"
}
```

**错误响应：**
| 状态码 | message |
|--------|---------|
| 404 | tag not found |
| 409 | tag name already exists |

### DELETE /api/tags/:tagId

删除标签

**错误响应：**
| 状态码 | message |
|--------|---------|
| 404 | tag not found |

---

## 收支记录模块

所有接口需认证。

### GET /api/transactions

获取收支记录列表（分页）

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | `income` / `expense` |
| category_id | int | 否 | 分类 ID |
| tag_id | int | 否 | 标签 ID |
| start_date | string | 否 | 起始日期 `YYYY-MM-DD` |
| end_date | string | 否 | 结束日期 `YYYY-MM-DD` |
| keyword | string | 否 | 对 description 做模糊匹配，空字符串视为不传。仅匹配 description 字段，不匹配 category / tag |
| page | int | 否 | 页码，默认 1 |
| per_page | int | 否 | 每页数量，默认 20 |

未识别的 query parameter 返回 400，message 包含参数名列表。

**成功响应（200）：**
```json
{
  "code": 0,
  "data": {
    "items": [
      {
        "transaction_id": 1,
        "user_id": 1,
        "category_id": 1,
        "category": { "category_id": 1, "category_name": "餐饮", "..." : "..." },
        "amount": "30.00",
        "transaction_type": "expense",
        "transaction_date": "2026-05-26T00:00:00.000Z",
        "description": "午饭",
        "images": null,
        "tags": [{ "tag_id": 1, "user_id": 1, "tag_name": "工作餐", "color": null, "created_at": "..." }],
        "created_at": "2026-05-26T10:00:00.000Z",
        "updated_at": "2026-05-26T10:00:00.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "per_page": 20,
    "pages": 3
  },
  "message": "ok"
}
```

### GET /api/transactions/summary

收支统计

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_date | string | 否 | 起始日期 `YYYY-MM-DD` |
| end_date | string | 否 | 结束日期 `YYYY-MM-DD` |

**成功响应（200）：**
```json
{
  "code": 0,
  "data": {
    "income": "5000.00",
    "expense": "3200.50",
    "balance": "1799.50"
  },
  "message": "ok"
}
```

### POST /api/transactions

创建收支记录

**请求参数：**
```json
{
  "amount": 30.00,
  "transaction_type": "expense",
  "category_id": 1,
  "transaction_date": "2026-05-26",
  "description": "string (可选)",
  "images": "string (可选)",
  "tag_ids": [1, 2]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| amount | number | 是 | 金额 |
| transaction_type | string | 是 | `income` / `expense` |
| category_id | int | 是 | 分类 ID |
| transaction_date | string | 是 | 日期。写入接受 YYYY-MM-DD，响应统一返回 ISO 8601 datetime（YYYY-MM-DDTHH:mm:ss.sssZ） |
| description | string | 否 | 描述 |
| images | string | 否 | 图片。写入与响应均为 string，前端负责 JSON.stringify，后端不做转换 |
| tag_ids | int[] | 否 | 标签 ID 列表 |

**成功响应（201）**

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | amount, transaction_type, category_id, transaction_date are required |
| 400 | transaction_type must be income or expense |

### GET /api/transactions/:transactionId

获取收支记录详情

### PUT /api/transactions/:transactionId

更新收支记录（所有字段可选）

### DELETE /api/transactions/:transactionId

删除收支记录

---

## 项目模块

所有接口需认证。

### GET /api/projects

获取项目列表

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 否 | `work` / `life` |
| status | string | 否 | `active` / `archived`，默认 `active` |
| include_archived | string | 否 | 设为 `true` 时包含已归档项目 |
| keyword | string | 否 | 对 name 做模糊匹配（escape `%` `_` `\`） |

未识别的 query parameter 返回 400，message 包含参数名列表。

**项目对象字段：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| user_id | INT | 所属用户 |
| domain | ENUM(work,life) | 领域 |
| name | VARCHAR(100) | 项目名 |
| color | VARCHAR(20) NULL | hex 颜色（#RRGGBB）或 null |
| status | ENUM(active,archived) | 状态 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### POST /api/projects

创建项目

**请求参数：**
```json
{
  "name": "string",
  "domain": "work|life",
  "color": "#3b82f6"
}
```

> `color` 为可选（VARCHAR(20) NULL），格式 hex `#RRGGBB`。

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | name and domain are required |
| 400 | domain must be work or life |
| 400 | invalid color format |
| 409 | project with this name already exists in domain（响应含 `data` 字段返回已有项目） |

### PUT /api/projects/:id

更新项目（含状态切换）

**请求参数：**
```json
{
  "name": "string",
  "domain": "string",
  "status": "active|archived",
  "color": "#3b82f6"
}
```

> `color` 为可选（VARCHAR(20) NULL），格式 hex `#RRGGBB`，传 `null` 可清空。

**status 取值：**
- `active` — 活跃
- `archived` — 已归档

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | invalid status: `<value>` |
| 400 | invalid color format |
| 404 | project not found |
| 409 | project with this domain already exists |

### DELETE /api/projects/:id

删除项目

---

## TODO 模块

所有接口需认证。

### GET /api/todos

获取 TODO 列表

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domain | string | 否 | `work` / `life` |
| project_id | int | 否 | 项目 ID |
| status | string | 否 | `not_started` / `in_progress` / `blocked` / `completed` / `cancelled` |
| tag_id | int | 否 | 标签 ID |
| group_by | string | 否 | 设为 `project` 时按项目分组返回 |
| include_archived | string | 否 | group_by=project 时，设为 `true` 包含已归档项目 |
| project_status | string | 否 | group_by=project 时，筛选项目状态 |
| keyword | string | 否 | 对 title 做模糊匹配（escape `%` `_` `\`） |

未识别的 query parameter 返回 400，message 包含参数名列表。

**普通列表响应：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "domain": "work",
      "project_id": 1,
      "project": { "id": 1, "name": "Q2方案", "domain": "work", "status": "active", "..." : "..." },
      "title": "提交方案",
      "status": "not_started",
      "due_at": "2026-06-01T00:00:00.000Z",
      "completed_at": null,
      "comment": null,
      "tags": [{ "tag_id": 1, "..." : "..." }],
      "created_at": "2026-05-26T10:00:00.000Z",
      "updated_at": "2026-05-26T10:00:00.000Z",
      "current_version": 1
    }
  ],
  "message": "ok"
}
```

**group_by=project 响应：**
```json
{
  "code": 0,
  "data": [
    {
      "project": { "id": 1, "user_id": 1, "domain": "work", "name": "Q2方案", "status": "active", "..." : "..." },
      "todos": [ ... ],
      "count": 5,
      "pending_count": 3
    }
  ],
  "message": "ok"
}
```

### POST /api/todos

创建 TODO

**请求参数：**
```json
{
  "title": "string",
  "domain": "work|life",
  "project_id": 1,
  "due_at": "2026-06-01T00:00:00",
  "comment": "string (可选)",
  "tag_ids": [1, 2]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 标题 |
| domain | string | 是 | `work` 或 `life` |
| project_id | int | 否 | 已有项目 ID |
| due_at | string | 否 | 截止时间，ISO 格式 |
| comment | string | 否 | 备注，不传为 NULL，空字符串等价 NULL |
| tag_ids | int[] | 否 | 标签 ID 列表 |

**说明：** 创建时自动写入 v1 版本快照。响应中包含 `current_version` 字段。

**成功响应（201）**

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | title and domain are required |
| 400 | domain must be work or life |
| 400 | project_name is no longer supported, create project first via POST /api/projects |
| 404 | project not found |

### GET /api/todos/:todoId

获取 TODO 详情

### PUT /api/todos/:todoId

更新 TODO（所有字段可选，含状态；comment 必填）

**请求参数（comment 必填，其余可选）：**
```json
{
  "title": "string",
  "domain": "work|life",
  "project_id": 1,
  "due_at": "2026-06-10T00:00:00Z",
  "comment": "本次变更说明",
  "tag_ids": [1, 2],
  "status": "in_progress|blocked|completed|cancelled"
}
```

**status 取值：**
- `not_started` — 未开始（默认）
- `in_progress` — 进行中
- `blocked` — 阻塞
- `completed` — 已完成
- `cancelled` — 已取消

**状态说明：**
- 状态间可任意切换，无需校验流转规则
- 进入 `completed` 时 `completed_at` 自动置为当前时间
- 离开 `completed` 时 `completed_at` 自动清空
- 有字段变更（含 status）时自动写入版本快照

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | comment is required |
| 400 | comment too long (max 500) |
| 400 | invalid status: `<value>` |
| 400 | project_name is no longer supported, create project first via POST /api/projects |
| 404 | todo not found |

### DELETE /api/todos/:todoId

删除 TODO（CASCADE 自动清理版本历史和标签关联）

### GET /api/todos/:todoId/versions

获取版本历史

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| order | string | 否 | `asc` / `desc`，默认 `desc` |
| limit | int | 否 | 返回条数上限，默认 50，最大 200 |

**响应 data 字段：**
```json
[
  {
    "id": 1,
    "todo_id": 1,
    "version_number": 1,
    "title": "提交方案",
    "status": "not_started",
    "domain": "work",
    "project_id": 1,
    "due_at": null,
    "completed_at": null,
    "comment": null,
    "tag_ids": [1],
    "created_at": "2026-05-26T10:00:00.000Z"
  }
]
```

### GET /api/todos/:todoId/versions/:versionNumber

获取指定版本详情

---

## 打卡模板模块

所有接口需认证。打卡基于模板机制：先定义模板（含字段 schema），再基于模板创建打卡记录。

### GET /api/checkin-templates

获取当前用户的模板列表

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| keyword | string | 否 | 对 name 做模糊匹配（escape `%` `_` `\`） |

未识别的 query parameter 返回 400，message 包含参数名列表。

**成功响应（200）：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "name": "跑步",
      "icon": "running",
      "fields_schema": [
        { "name": "distance", "type": "number", "required": true },
        { "name": "duration", "type": "number", "required": true },
        { "name": "feeling", "type": "select", "required": false, "options": ["好", "一般", "差"] }
      ],
      "created_at": "2026-05-26T10:00:00.000Z",
      "updated_at": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "ok"
}
```

### GET /api/checkin-templates/:templateId

获取模板详情

### POST /api/checkin-templates

创建打卡模板

**请求参数：**
```json
{
  "name": "string",
  "icon": "string (可选)",
  "fields_schema": [
    { "name": "字段名", "type": "number|text|boolean|select|date", "required": true, "options": ["选项1"] }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 模板名称（同用户唯一） |
| icon | string | 否 | 图标标识 |
| fields_schema | array | 是 | 字段定义数组 |

**fields_schema 中每个字段：**
| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 字段名 |
| type | string | 是 | `number` / `text` / `boolean` / `select` / `date` / `array` |
| required | boolean | 否 | 是否必填，默认 false |
| options | string[] | 否 | type=select 时的可选项 |
| item_fields | array | 否 | type=array 时的元素字段定义（支持递归），递归上限 3 层 |
| min_items | number | 否 | type=array 时的最小元素数（默认无），必须 >= 0 |
| max_items | number | 否 | type=array 时的最大元素数（默认 200，硬上限 1000） |

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | name and fields_schema are required |
| 409 | template name already exists |

### PUT /api/checkin-templates/:templateId

更新模板（所有字段可选）

### DELETE /api/checkin-templates/:templateId

删除模板

**错误响应：**
| 状态码 | message |
|--------|---------|
| 409 | cannot delete template with associated checkins |
| 404 | template not found |

---

## 打卡模块

所有接口需认证。打卡基于模板创建，`payload` 必须符合模板的 `fields_schema` 校验。

### GET /api/checkins

获取打卡列表

> 当前无分页支持，全量返回。数据量过大时考虑前端分批渲染。

**Query 参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| template_id | int | 否 | 按模板过滤 |
| tag_id | int | 否 | 按标签过滤 |

> 不支持 `keyword` 参数（payload 是结构化 JSON）。未识别的 query parameter 返回 400。

**成功响应（200）：**
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "user_id": 1,
      "template_id": 1,
      "template": { "id": 1, "name": "跑步", "icon": "running", "fields_schema": [...] },
      "occurred_at": "2026-05-26T10:00:00.000Z",
      "payload": { "distance": 5.2, "duration": 30 },
      "tags": [{ "id": 1, "name": "晨跑", "color": null }],
      "created_at": "2026-05-26T10:00:00.000Z",
      "updated_at": "2026-05-26T10:00:00.000Z"
    }
  ],
  "message": "ok"
}
```

### POST /api/checkins

创建打卡

**请求参数：**
```json
{
  "template_id": 1,
  "occurred_at": "2026-05-26T10:00:00+08:00 (可选，默认当前时间)",
  "payload": { "distance": 5.2, "duration": 30 },
  "tag_ids": [1, 2]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| template_id | int | 是 | 打卡模板 ID |
| occurred_at | string | 否 | 打卡时间，ISO 格式（建议含时区如 `2026-05-26T10:00:00+08:00`），默认当前时间 |
| payload | object | 否 | 打卡数据，需符合模板 schema |
| tag_ids | int[] | 否 | 标签 ID 列表 |

**payload 校验规则（由 template-validator 执行）：**
- `required: true` 的字段不可缺失或为空
- `type: number` → 值必须是数字
- `type: boolean` → 值必须是布尔
- `type: select` → 值必须在 `options` 数组内
- `type: text` / `type: date` → 值必须是字符串
- 不允许出现 schema 中未定义的字段（严格模式）

**错误响应：**
| 状态码 | message |
|--------|---------|
| 400 | template_id is required |
| 400 | payload validation failed: <detail> |
| 404 | template not found or no permission |

### GET /api/checkins/:checkinId

获取打卡详情

### PUT /api/checkins/:checkinId

更新打卡（所有字段可选）

**说明：** 更新 payload 时仍需通过 schema 校验。允许切换 template_id，切换后以新模板 schema 校验。

### DELETE /api/checkins/:checkinId

删除打卡
