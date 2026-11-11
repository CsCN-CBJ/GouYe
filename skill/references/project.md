# 项目管理详细指南

## 先建项目再建 TODO

创建 TODO 前如需归属到项目，流程如下：

1. 调 `POST /api/projects` 创建项目（如项目已存在，返回 409 并在 `data` 中带回已有项目信息）
2. 拿到 `project_id`
3. 调 `POST /api/todos`，传入 `project_id`

示例：

```python
# 创建项目
proj = api_client.create_project("AI 提效", "work")
if proj.get("code") == 1:
    # 同 domain 同 name 已存在，直接复用
    proj_id = proj["data"]["project_id"]
else:
    proj_id = proj["data"]["project_id"]

# 创建 TODO
api_client.create_todo("完成周报", "work", project_id=proj_id)
```

## API

| 用户意图 | 调用 API |
|---------|---------|
| 创建项目 | `POST /api/projects` |
| 查看项目列表 | `GET /api/projects` |
| 归档项目 | `PUT /api/projects/:id` 传 `{"status": "archived"}` |
| 删除项目 | `DELETE /api/projects/:id` |

## 查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `domain` | `work` / `life` | `work` |
| `status` | `active` / `archived`，默认 `active` | `archived` |
| `include_archived` | 设为 `true` 包含已归档项目 | `true` |
| `keyword` | 对 name 做模糊匹配（escape `%` `_` `\`） | `Q2` |

> **未识别参数 400**：所有列表路由不再静默忽略未知 query 参数。传 ?foo=bar 会返回 400 `unknown query parameters: foo`。
