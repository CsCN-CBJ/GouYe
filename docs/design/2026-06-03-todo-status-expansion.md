# TODO 状态粒度扩展设计

## 核心诉求

将 TODO 的 3 状态（pending/done/cancelled）扩展为 5 状态，增加工作流中间态，提升任务管理的粒度。同时保留版本历史功能，每次状态变更记录快照。

## 背景

- 当前 3 状态粒度太粗，只能表达「待办→完成」，缺少「未开始」「进行中」「阻塞」等中间态
- `temp/workflow-management-system/` 提供了 5 状态设计参考：`not_started` / `in_progress` / `completed` / `blocked` / `cancelled`
- 版本历史机制（`TodoVersion`）已存在，可直接适配

## 方案

### 状态定义

| 状态 | 中文名 | 含义 | 前端颜色方案 |
|------|--------|------|-------------|
| `not_started` | 未开始 | 已创建但尚未着手（替代 `pending`） | 黄色 |
| `in_progress` | 进行中 | 正在处理中 | 蓝色 |
| `blocked` | 已阻塞 | 因依赖/问题暂停 | 红色 |
| `completed` | 已完成 | 已做完（替代 `done`） | 绿色 |
| `cancelled` | 已取消 | 不再需要（保持） | 灰色 |

### 状态流转规则

**不做任何校验** — 任意状态可切换到任意状态（与工作流系统一致）。后端仅做两件事：
1. SQL 注入防护（无直接拼 SQL，Prisma 参数化查询自动处理）
2. `completedAt` 自动管理（进 completed 设值，离开清 null）

### `completedAt` 逻辑

- 进入 `completed` → `completedAt = now`
- 离开 `completed` → `completedAt = null`
- 其他状态不受影响

### 版本历史

**已有机制：** `TodoVersion` 表在每次状态变更时自动写入快照，含 `change_summary`。无需额外开发。

**版本记录示例：**
```
v1: "Initial version" (status: not_started)
v2: "Status changed to in_progress"  
v3: "Status changed to blocked"
v4: "Status changed to in_progress"
v5: "Status changed to completed"
```

## 功能范围

### 包含
- Prisma schema：`TodoStatus` 枚举 + 4 个新值（not_started, in_progress, blocked, completed）
- 数据库迁移：ALTER TABLE 改列类型（`pending`→`not_started`, `done`→`completed`）
- 后端：5 状态枚举支持，移除状态校验（任意状态可互转），`completedAt` 自动管理
- 后端：API 响应兼容（返回新状态值）
- PC 前端：5 状态筛选、5 色徽章、completed/cancelled 弱化视觉
- 移动端前端（todo.js）：5 状态徽章、状态切换逻辑
- 测试：更新断言和状态转换测试
- CHANGELOG

### 不包含
- `blocked_reason` 字段（阻塞原因）— 未来可加
- `in_progress_since` 时间戳 — 未来可加
- 树形结构/父子任务 — 用户明确不需要
- 状态流转的前端审批/确认对话框
- 移动端 `todo.html` / `todo.css` 更新（legacy 页面目前无实际使用场景，仅更新 JS 以防 break）

## 涉及文件

| 文件 | 变更内容 |
|------|----------|
| `prisma/schema.prisma` | 枚举取值改为 5 状态 |
| `sql/migrations/` | 新增迁移 SQL |
| `src/routes/todo.ts` | 状态流转矩阵、`completedAt` 逻辑、初始状态 |
| `frontend-pc/css/app.css` | 新增 `badge-not-started`、`badge-in-progress`、`badge-blocked` 样式 |
| `frontend-pc/js/pages/requirements.js` | statusMap、statusClass、isCompleted、筛选下拉 |
| `frontend-pc/js/pages/todos.js` | 同上 |
| `frontend/pages/todo.js` | 状态展示、切换逻辑 |
| `tests/todo.test.ts` | 所有状态断言、转换测试用例 |

## 测试与验收标准

### 后端测试
- [ ] 创建 TODO 默认状态为 `not_started`
- [ ] 状态列表筛选支持所有 5 状态
- [ ] 任意状态间可互转（不做校验）
- [ ] `completedAt` 在进 completed 时设值，离开时清 null
- [ ] 版本快照在每次状态变更时正确生成

### 前端验收
- [ ] PC 端筛选下拉显示 5 个状态选项
- [ ] PC 端徽章颜色正确（5 色各不同）
- [ ] PC 端 completed/cancelled 项正确弱化（opacity + 删除线）
- [ ] 移动端状态徽章显示正确
- [ ] 移动端状态切换不 break（即使 PC 端只读无影响）

### 兼容性
- [ ] API 返回的旧 `pending` → 新 `not_started`，旧 `done` → 新 `completed`
- [ ] 现存数据迁移后 status 列值正确转换

## 风险与假设

**风险：** Prisma 枚举改值需要数据库迁移同步。迁移策略：
1. ALTER TABLE MODIFY COLUMN 将旧值映射为新值
2. Prisma generate 重新生成 Client
3. 需停机或在 watch-pull 自动部署时完成

**假设：** 用户只使用 PC 端，移动端为 legacy 仅保证不 break。
