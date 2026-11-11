# TODO 版本管理设计文档

**核心诉求：** 为 TODO 的每次变更生成完整快照和差异摘要，支持历史追溯。
**日期：** 2026-05-21

---

## 背景

TODO 是本应用中变更最频繁的实体——标题修改、状态流转、项目归属调整、标签变更等。用户需要知道"一个 TODO 经历了什么"，尤其：

1. 状态何时从 pending 变为 done，何时又从 done 回退到 pending
2. 标题/项目/标签何时被修改
3. 为什么一个 TODO 看起来和创建时完全不同

不做版本管理的代价：变更不可追溯，用户无法理解 TODO 的演变历史。

---

## 方案

### 关键设计决策

1. **快照模式（而非 diff）**：每次写入 TODO 的完整状态，而非仅存变更字段。简化查询和恢复逻辑，代价是存储空间略大（个人应用量级可接受）。

2. **version_number 单调递增**：从 1 开始，同一 `todo_id` 内全局唯一。创建时写入 v1 作为初始快照。

3. **tag_ids 存 JSON 数组**：避免多对多关联表在历史查询中失真。快照时将 `tags` 关系列拍平为排序后的 `tag_id` 列表。

4. **change_summary 自动生成**：每次写入快照时，对比变更字段生成人类可读的摘要，如 `"标题: 交方案 → 提交 Q2 方案; 状态: pending → done"`。

5. **CASCADE 删除**：删除 TODO 时自动清理所有版本记录。

### 数据模型

**todo_versions 表**
```
id               BIGINT PK
todo_id          FK todos.id  ON DELETE CASCADE
version_number   INT          -- 从 1 递增
title            VARCHAR(200)
status           ENUM('pending','done','cancelled')
domain           ENUM('work','life')
project_id       BIGINT NULL
due_at           DATETIME NULL
completed_at     DATETIME NULL
payload          JSON NULL
tag_ids          JSON NULL    -- 排序后的 tag_id 数组
change_summary   VARCHAR(500) NULL  -- 变更摘要
created_at       DATETIME
UNIQUE(todo_id, version_number)
INDEX(todo_id)
```

### 版本触发时机

| 操作 | 是否写入快照 | change_summary |
|------|-------------|----------------|
| 创建 TODO | 是 | `"创建"` |
| 更新 TODO（有实际变更） | 是 | 自动对比生成 |
| 更新 TODO（无实际变更） | 否 | — |
| 状态流转 | 是 | `"状态: pending → done"` + 完成时间变更 |

### 版本化字段白名单

以下字段的变更会触发快照写入：

`title`, `status`, `domain`, `project_id`, `due_at`, `completed_at`, `payload`, `tag_ids`

### 服务层

**`backend/services/todo_versioning.py`**

- `snapshot_todo(todo, change_summary=None) -> TodoVersion`：创建快照并加入 session（不 commit）。自动计算 version_number。
- `compute_diff_summary(todo, new_values) -> (summary, has_change)`：对比当前值与待写入值，生成差异摘要。仅对比白名单字段。

### 路由层

**`backend/routes/todo.py`** 新增接口

- `GET /api/todos/<id>/versions` — 获取版本历史列表
  - Query: `order` (asc/desc, 默认 desc), `limit` (默认 50, 最大 200)
- `GET /api/todos/<id>/versions/<version_number>` — 获取指定版本详情

**已有接口变更**

- 创建/更新/状态变更时自动写入快照
- TODO 响应中增加 `current_version` 字段

### diff_summary 格式

字段中文显示名：

| 字段 | 显示名 |
|------|--------|
| title | 标题 |
| status | 状态 |
| domain | 域 |
| project_id | 项目 |
| due_at | 截止 |
| completed_at | 完成时间 |
| payload | 扩展数据 |
| tag_ids | 标签 |

格式：`显示名: 旧值 → 新值`，多字段用 `; ` 连接。

空值显示为 `∅`，datetime 格式化为 `%Y-%m-%d %H:%M`，project_id 解析为 `项目名(#id)`，tag_ids 格式化为 `[1,2,3]`。

---

## 使用场景

1. **查看 TODO 演变历史**：前端展示版本时间线，每条记录显示变更摘要
2. **审计状态变更**：确认 TODO 何时被完成、何时回退
3. **未来可扩展**：版本回滚（恢复到某个版本的状态）、版本对比（高亮两个版本的差异）
