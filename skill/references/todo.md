# TODO 管理详细指南

## API 映射

| 用户意图 | 提取参数 | 调用 API |
|---------|---------|---------|
| 添加待办 | title, domain(work/life), project_id?, due_at?, tag_ids? | `POST /api/todos` |
| 查看待办 | domain?, status?, project_id?, tag_id? | `GET /api/todos` |
| 按项目查看 | domain?, group_by='project' | `GET /api/todos?group_by=project` |
| 修改待办 | todo_id + 变更字段（含 status） | `PUT /api/todos/:id` |
| 删除待办 | todo_id | `DELETE /api/todos/:id` |
| 查看修改历史 | todo_id | `GET /api/todos/:id/versions` |
| 查看指定版本 | todo_id, version_number | `GET /api/todos/:id/versions/:n` |

## 创建待办参数

```json
{
  "title": "完成周报",
  "domain": "work",
  "project_id": 1,
  "due_at": "2026-05-01T18:00:00",
  "tag_ids": [1, 2],
  "comment": "周三 deadline 记得搞"
}
```

> 创建项目走 `POST /api/projects`（详见 references/project.md），todo 只接 `project_id`。
>
> **时区规则（v1.10.3+）**：`due_at` 裸串（无后缀）按**北京时间 (+08:00)** 解释。`api_client.py::create_todo / update_todo` 会自动给裸串补 `+08:00`。

### comment 字段说明

| 场景 | 规则 |
|------|------|
| 创建 TODO | 可选，不传为 NULL，传空字符串等价 NULL |
| 更新 TODO | **必填**，不想改时传原值 |
| 长度限制 | 最大 500 字符，超出返回 400 |
| 语义 | **常驻备注**（非 commit message），每次 PUT 覆盖 |

## 查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `domain` | work / life | `work` |
| `status` | not_started / in_progress / blocked / completed / cancelled | `not_started` |
| `project_id` | 项目ID | `3` |
| `tag_id` | 标签ID | `5` |
| `group_by` | 聚合方式，传 `project` 按项目分组 | `project` |
| `keyword` | 对 title 做模糊匹配（escape `%` `_` `\`） | `周报` |

> **未识别参数 400**：所有列表路由不再静默忽略未知 query 参数。传 ?foo=bar 会返回 400 `unknown query parameters: foo`。

## 状态说明

| 状态 | 含义 |
|------|------|
| `not_started` | 未开始（默认状态） |
| `in_progress` | 进行中 |
| `blocked` | 阻塞 |
| `completed` | 已完成 |
| `cancelled` | 已取消 |

任意状态之间可以互相切换，无需校验流转规则。

## 关键规则

- `domain` 字段只有 `"work"` 和 `"life"` 两个值
- 如果用户说"做完""完成"，映射为 `completed`
- 如果用户说"取消""不要了"，映射为 `cancelled`
- 如果用户说"开始做""进行中"，映射为 `in_progress`


## 场景识别

| 用户说法 | 映射 |
|---------|------|
| "记得..."、"要..."、"TODO"、"任务"、"待办" | 创建 TODO |
| "工作..."、"上班..." | domain = work |
| "生活..."、"个人..."、"周末..." | domain = life |
| "还有什么没做完" | 查询 status=not_started,in_progress,blocked |
| "这条 TODO 改过啥"、"历史"、"变更记录" | `GET /api/todos/:id/versions` |

## 版本历史（Version History）

每条 TODO 的关键字段修改都会自动写入一条快照，字段包括：
`title / status / domain / project_id / due_at / completed_at / comment / tag_ids`

### 触发时机

| 操作 | 是否写快照 |
|------|-----------|
| 创建 TODO | ✅ v1（comment 写入后值） |
| PUT 更新有字段变化 | ✅ version+1 |
| PUT 改状态 | ✅ version+1 |
| PUT 但传入同值 | ❌ 不写 |
| DELETE | ❌，历史 `ON DELETE CASCADE` 清理 |

### 返回字段

- `GET /api/todos/:id` 返回里包含 `current_version` 字段
- 历史每条记录包含：`version_number / title / status / tag_ids / comment / created_at` 等
