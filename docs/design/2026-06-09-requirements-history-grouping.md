# 需求/TODO 双列卡片 + 版本历史 + 分组开关

**日期**: 2026-06-09
**范围**: PC 端「需求」「TODO」两页（work + life domain），只读
**后端改动**: 无

## 核心诉求

1. PC 端卡片现状是单列整行，留白严重 → 改成双列卡片网格，响应式自适应
2. 卡片内联展示需求的版本历史（最多 5 条，超过点击全部展开）
3. 默认让"我正在做的事"优先出现在最上方
4. 状态筛选器从单选改为多选
5. 提供「按状态 / 按项目」分组开关

## 背景

- 当前需求/TODO 页（`requirements.js` / `todos.js`）使用扁平单列卡片或按项目分组的单列卡片
- 后端已存在 `GET /api/todos/:id/versions`，可直接消费
- TODO 已支持 5 状态（v1.4.0：未开始/进行中/阻塞/已完成/已取消）
- 不引入优先级字段（明确不做）

## 方案

### 1. 卡片网格布局

- PC（≥1024px）：**双列**（CSS Grid，`grid-template-columns: repeat(2, 1fr)`）
- 平板（768–1023px）：双列，间距收紧
- 手机（<768px）：单列
- 卡片高度自适应内容（不强制等高），版本历史展开后卡片向下扩展

### 2. 卡片内容结构

```
┌────────────────────────────────────────┐
│ [状态徽章] 标题                        │
│ 项目标签 · 标签1 标签2                 │
│ 截止 06-15 · 更新 06-08 · 创建 06-01   │
│ ─────────────────────────              │
│ 历史                                   │
│ • v5  状态改为进行中     06-08         │
│ • v4  标题修改          06-05         │
│ • v3  状态改为阻塞       06-03         │
│ • v2  添加截止日期       06-02         │
│ • v1  创建              06-01         │
│ [还有 2 条 ▾]                          │← 仅当 >5 条出现，点击全部展开
└────────────────────────────────────────┘
```

- 历史使用每条版本的 `change_summary` 字段；时间用 `created_at`
- 历史默认渲染最新 5 条（`?order=desc&limit=5` 客户端不再切片）
- 「还有 N 条 ▾」点击后再发一次 `GET /api/todos/:id/versions?order=desc&limit=200`，全部内联渲染（不弹 Modal）
- 按钮变成「收起 ▴」，点击恢复 5 条

### 3. 历史数据加载策略

**方案 A**：列表初次渲染时，每张卡片各发一次 `GET /api/todos/:id/versions?order=desc&limit=5`，并发请求。
- 简单粗暴，30 卡 ≈ 30 并发请求，浏览器 HTTP/1.1 默认 6 并发，HTTP/2 无限制
- 失败的卡片显示「历史加载失败 重试」，不阻塞其他卡片
- 不阻塞列表首屏：卡片骨架先出，历史区显示 loading，请求完成后填充

### 4. 分组开关

顶部 segmented control：

```
[ 按状态 ▣ ]  [ 按项目 ▢ ]
```

- 选择持久化到 `localStorage`，key：`gouye:requirements:groupBy` / `gouye:todos:groupBy`
- 默认值：`status`

#### 4.1 按状态分组

```
🔵 进行中 (3)        ← 始终展开
  ┌──────┬──────┐
  │ 卡片  │ 卡片  │
  └──────┴──────┘

🔴 阻塞 (1)          ← 始终展开
🟡 未开始 (5)        ← 始终展开
🟢 已完成 (12)       ← 始终展开（不折叠）
🔘 已取消 (2)        ← 始终展开（不折叠）
```

- 状态组顺序固定：进行中 → 阻塞 → 未开始 → 已完成 → 已取消
- 组内排序：`updated_at` 倒序
- 已完成/已取消视觉弱化保留（opacity-50 + line-through，沿用现状）

#### 4.2 按项目分组

```
📁 项目A (5)
  组内按 进行中 > 阻塞 > 未开始 > 已完成 > 已取消 排序
  同状态内按 updated_at 倒序

📁 项目B (3)
📂 未归类 (1)        ← 始终最后
```

- 项目组之间排序：按「组内最新一条 `updated_at`」倒序排
- 「未归类」始终在最后，不参与上述排序
- 组内同状态按 `updated_at` 倒序

### 5. 多选状态筛选器

- 现有的单选下拉改为多选 chip 组（5 个状态复选）
- 默认选中：`未开始 + 进行中 + 阻塞`（默认排除已完成/已取消）
- 全部取消勾选 = 不过滤（等价于全选）
- 选择不持久化（每次进入页面回到默认）

#### 筛选器与分组的关系

| 场景 | 行为 |
|------|------|
| 按状态分组 + 默认筛选 | 显示进行中/阻塞/未开始 三个组，已完成/已取消组不出现 |
| 按状态分组 + 全选 | 5 个状态组全部展示，已完成/已取消组始终展开 |
| 按项目分组 + 默认筛选 | 项目组内只显示进行中/阻塞/未开始的卡片，已完成/已取消默认隐藏 |
| 按项目分组 + 全选 | 项目组内显示全部状态卡片，已完成/已取消视觉弱化 |

### 6. 卡片上的项目标签

- 按状态分组时：卡片右上角显示项目名（点击可跳到该项目筛选）
- 按项目分组时：项目名已在分组标题，卡片内不重复显示

## 功能范围

### 包含
- `frontend-pc/js/pages/requirements.js` 改造
- `frontend-pc/js/pages/todos.js` 改造（与 requirements 共用渲染组件）
- `frontend-pc/css/app.css` 新增双列网格、卡片、版本历史样式
- 提取共享渲染逻辑到 `frontend-pc/js/components/todo-card.js`（新文件）
- `data-testid` 属性埋点（见测试章节）
- 测试用例（DOM 断言 + 截图）

### 不包含
- 后端改动
- 移动端 `frontend/` 改动
- 创建/编辑/删除 UI
- 分页（一次拉全部，沿用现状）
- 版本之间的字段 diff（只展示 `change_summary`）
- 优先级字段
- 记账页 / 打卡页改动

## 涉及文件

| 文件 | 改动 |
|------|------|
| `frontend-pc/js/pages/requirements.js` | 接入分组开关、多选筛选、双列网格、调用 todo-card 组件 |
| `frontend-pc/js/pages/todos.js` | 同上 |
| `frontend-pc/js/components/todo-card.js` | 新建：卡片渲染 + 历史加载/展开 |
| `frontend-pc/js/components/group-toggle.js` | 新建：分组开关组件 + localStorage |
| `frontend-pc/js/components/multi-select-filter.js` | 新建：多选状态筛选 chip 组 |
| `frontend-pc/css/app.css` | 双列 grid、卡片、版本历史、分组开关、多选 chip 样式 |
| `tests/frontend/todo-card.test.js` | 新建（vitest + happy-dom） |
| `tests/frontend/grouping.test.js` | 新建 |
| `CHANGELOG.md` | 添加新版本条目 |

## 测试与验收标准

### DOM 断言测试（vitest + happy-dom）

新建 `tests/frontend/`，独立的 vitest 配置（避免与后端测试冲突）。

#### 必埋的 `data-testid`

执行者**必须**为下列元素加上 `data-testid` 属性，否则测试无法落地：

| 元素 | testid | 附加 data-* |
|------|--------|--------------|
| 分组开关容器 | `group-toggle` | `data-active="status"` 或 `"project"` |
| 状态多选筛选 | `status-filter` | `data-selected="in_progress,blocked,not_started"` |
| 单个状态选项 | `status-option` | `data-status="in_progress"`, `data-checked="true"` |
| 分组段（状态或项目） | `group-section` | `data-group-type="status"`, `data-group-key="in_progress"` |
| 卡片容器 | `todo-card` | `data-todo-id`, `data-status`, `data-updated-at`, `data-project-id` |
| 卡片内历史区 | `version-list` | `data-loaded="true"` |
| 单条历史项 | `version-item` | `data-version-number` |
| "还有 N 条"按钮 | `version-expand` | `data-expanded="false"` |

#### 测试用例清单

| ID | 用例 | 断言 |
|----|------|------|
| T1 | 默认进入需求页 | `group-toggle[data-active=status]`；`status-filter[data-selected]` 含 `in_progress,blocked,not_started`；不含 `done,cancelled` |
| T2 | 按状态分组顺序 | `querySelectorAll('group-section')` 顺序为 `in_progress, blocked, not_started`（默认筛选下） |
| T3 | 全选状态后顺序 | 5 个组按固定顺序，已完成/已取消组也存在且非折叠状态 |
| T4 | 状态组内按 updated_at 倒序 | 卡片 `data-updated-at` 单调递减 |
| T5 | 按项目分组排序 | 项目组之间按组内最新 `updated_at` 倒序，"未归类"在最后 |
| T6 | 项目组内排序 | 同项目内先按状态优先级，再按 updated_at 倒序 |
| T7 | 项目分组+默认筛选 | 项目组内不出现 `data-status=done` 或 `cancelled` 的卡片 |
| T8 | 项目分组+全选 | 项目组内出现所有状态卡片 |
| T9 | 历史最多 5 条 | `version-list` 下 `version-item` 数量 ≤ 5 |
| T10 | 超过 5 条出现展开按钮 | mock 7 条版本，存在 `version-expand[data-expanded=false]`，文案"还有 2 条" |
| T11 | 点击展开按钮 | 触发再次请求，渲染全部 7 条；按钮 `data-expanded=true`，文案变"收起" |
| T12 | localStorage 持久化分组 | 切到"按项目"后刷新页面，`group-toggle[data-active=project]` |
| T13 | 历史加载失败 | mock 单卡片 versions 接口 500，该卡片显示"历史加载失败 重试"，其他卡片正常 |
| T14 | 双列布局类名 | 网格容器存在 `grid-cols-2` 或等价类（PC 视口下） |

#### 测试基础设施

```js
// tests/frontend/setup.js
import { beforeEach } from 'vitest'
import { JSDOM } from 'jsdom'
beforeEach(() => {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>',
    { url: 'http://localhost/' })
  global.window = dom.window
  global.document = dom.window.document
  global.localStorage = dom.window.localStorage
  global.fetch = vi.fn()  // 每个测试自己 mock
})
```

```js
// 共用 mock 工厂
function mockTodos(overrides) { /* 生成 work domain 的 todos 数组 */ }
function mockVersions(todoId, count) { /* 生成版本快照数组 */ }
function mockApi(url, response) { /* 注册 fetch mock */ }
```

## 风险与假设

| 风险 | 应对 |
|------|------|
| 30 卡片并发 30 个 versions 请求慢 | 浏览器 HTTP/2 下并发不是瓶颈；如确认慢再考虑批量接口（后续迭代） |
| 历史接口对未变更字段也产版本 | 沿用现有逻辑，前端忠实展示；不在前端做去重 |
| `data-testid` 漏埋导致测试无法运行 | PR 自检：测试 fail 即漏埋；reviewer 强制要求 |
| 无后端日期字段时区差异 | 沿用现状（API 返回 ISO 8601，前端格式化为本地时间） |

## 实现步骤建议（给执行者）

1. 抽 `todo-card.js` 组件 + `data-testid` 埋点 → 跑 T9/T10/T11
2. 抽 `group-toggle.js` + localStorage → 跑 T12
3. 抽 `multi-select-filter.js` → 跑 T1
4. requirements.js 接入三个组件 + 排序逻辑 → 跑 T2-T8
5. todos.js 复用同样改造
6. CSS 双列网格、卡片样式
7. 更新 CHANGELOG，提交

## 验收 checklist

- [ ] 14 条 DOM 断言测试全部通过
- [ ] CHANGELOG 更新
