# TODO / Checkin 模块架构

## 模块边界

| 模块 | 职责 | 入口文件 |
|---|---|---|
| Project | 单层项目 CRUD + 归档/恢复 | `src/routes/project.ts` |
| TODO | 任务 CRUD + 状态流转 + 版本管理 + tag/project 绑定 | `src/routes/todo.ts` |
| TodoVersioning | 版本快照生成 + 差异摘要计算 | `src/services/todo-versioning.ts` |
| CheckinTemplate | 打卡模板 CRUD + schema 校验 | `src/routes/checkin-template.ts` |
| TemplateValidator | 模板 schema 校验 + payload 严格校验 | `src/services/template-validator.ts` |
| Checkin | 基于模板的结构化打卡 CRUD + tag 绑定 | `src/routes/checkin.ts` |

## 数据流

TODO 和 Checkin 从前端直接通过 RESTful API 创建，不经过 AI 中间层：

```
前端表单 → POST /api/todos 或 POST /api/checkins
    │
    v
路由层校验（必填字段、权限）
    │
    ├── TODO: 创建记录 → 写入 v1 版本快照 → 绑定 tag
    ├── Checkin: 校验 payload 符合模板 schema → 创建记录 → 绑定 tag
    └── 返回创建结果
```

## 关键约束

- **TODO 状态机任意互转** — `not_started` / `in_progress` / `blocked` / `completed` / `cancelled` 五态任意互转。允许所有转换。
- **TODO 版本快照** — 每次创建/更新/状态变更自动写入 `TodoVersion` 快照，含 `change_summary` 摘要。`tag_ids` 存为 JSON 数组快照。
- **Checkin 基于模板** — 打卡必须指定 `template_id`，`payload` 严格校验（缺必填、类型不符、多余字段均拒绝）。模板有打卡引用时不可删除。
- **Checkin 无 status** — 打卡创建即存在，没有未完成态。
- **Tag 复用** — `todo_tags`、`checkin_tags` 两张关联表，指向现有 `tags` 表。
- **模板 schema 校验** — `src/services/template-validator.ts` 提供 `validatePayload(fieldsSchema, payload)` 进行打卡数据严格校验，返回 `{ ok, errors }`。自动注入 `comment` 系统字段。
- **多用户权限隔离** — 所有查询和操作均通过 `req.userId` 过滤，用户 A 无法访问/修改用户 B 的资源。
