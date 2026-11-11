# 前端 array 通用渲染 + 需求状态默认全选 + Project 颜色支持

**日期**: 2026-06-15
**版本**: v1.10.0（含后端 schema 改动 → 中版本号）
**性质**: 前端渲染修复 + UX 调整 + 后端字段扩展

## 核心诉求

### 问题 1：打卡 array 字段渲染成 `[object Object]`

后端 v1.9.0 已支持嵌套 array，但前端 `_formatFieldValue` 没有 array 分支，对象数组被 `toString()` 拼成 `[object Object],[object Object]`。

需要**通用方案**——任意嵌套结构都能展示，不针对健身写死。

### 问题 2：需求页面状态筛选默认只勾 3 个

`requirements.js` 默认隐藏 `completed` / `cancelled`，与"打开就看到全部"的预期不符。

### 问题 3：TODO 项目（Project）不支持颜色

`Project` 表无 `color` 字段。前端 `todos.js` 当前用一个固定调色板按分组顺序轮询上色（`colors[index]`），换个排序颜色就跟着换，无法稳定区分项目。

`Tag` / `Category` 都已有 `color` 字段，`Project` 缺失。

## 方案

### 1. 通用 array / object 渲染（schema 驱动递归）

不写专用规则，**按 schema 递归遍历**。算法：

```
render(field, value):
  if value 为 null/undefined: 不渲染
  switch field.type:
    case 'array':
      if !Array.isArray(value): 退化为 String(value)
      if value.length === 0: 返回空（外层判断不渲染）
      return value.map(item => renderItem(field.item_fields, item)).join(' / ')
    case 'number'|'text'|'date'|'boolean'|'select':
      走原 _formatFieldValue 逻辑
    default:
      return String(value)

renderItem(itemFields, itemValue):
  // itemValue 是对象
  return itemFields
    .map(f => {
      const v = itemValue[f.key]
      const formatted = render(f, v)
      if (formatted === null || formatted === '') return null
      return `${f.label || f.key}:${formatted}`
    })
    .filter(Boolean)
    .join(', ')
```

效果：

```
动作: 名:哑铃卧推, 装备:哑铃, 组:[重量:20, 次数:12 / 重量:22.5, 次数:10] / 名:上斜卧推, 装备:杠铃, 组:[重量:40, 次数:10]
```

为防止过长，对最终字符串做长度截断（>200 字符 → 截断 + `…`）。

**优点**：不依赖具体业务字段名（"动作"/"组"），任何 array 嵌套都能展示，schema 改了字段前端不用动。

**不做**：表格 / 折叠 / 详情弹窗（用户用一阵反馈再说）。

### 2. 需求状态筛选默认全选

`requirements.js`:

```js
filters: { statuses: ['not_started', 'in_progress', 'blocked', 'completed', 'cancelled'], ... }
```

### 3. Project 颜色支持

#### 3.1 数据库

`prisma/schema.prisma::Project` 加：

```prisma
color  String?  @db.VarChar(20)
```

migration: `sql/add_project_color.sql`：

```sql
ALTER TABLE projects ADD COLUMN color VARCHAR(20) NULL;
```

#### 3.2 后端

| 文件 | 改动 |
|---|---|
| `src/routes/project.ts::projectToDict` | 返回值加 `color: p.color ?? null` |
| `POST /projects` | body 接受可选 `color`（字符串，hex 或预设色名，长度 ≤20，否则 400） |
| `PUT /projects/:id` | 同上，支持更新 `color`（传 `null` 清空） |
| `src/routes/project.ts` | `projectToDict` 类型签名加 `color: string \| null` |

校验规则：`color` 若提供，必须是 `^#[0-9a-fA-F]{6}$` 或 `null`（清空）。简单正则即可，不引入颜色库。

#### 3.3 前端（只读展示）

前端纯只读，不提供颜色编辑 UI。颜色由用户通过 skill / 直接调用 API 设置。

| 文件 | 改动 |
|---|---|
| `frontend-pc/js/pages/todos.js::_renderGroupHeader` | 优先用 `project.color`，没有则 fallback 到现有 `this.colors[colorIndex]` |
| `frontend-pc/js/pages/todos.js` | 项目分组渲染时，把 `project.color` 透传给 header 函数 |

**未分类**分组（项目为 null）沿用 fallback 调色板。

## 涉及文件

| 类别 | 文件 | 改动 |
|---|---|---|
| 数据库 | `prisma/schema.prisma` | Project 加 color |
| 数据库 | `sql/add_project_color.sql`（新建） | ALTER TABLE 脚本 |
| 后端 | `src/routes/project.ts` | dict 加 color；POST/PUT 接受+校验 color |
| 后端测试 | `tests/project.test.ts` | 加 P1-P4 测试用例 |
| 前端 | `frontend-pc/js/pages/checkins.js` | `_formatFieldValue` 加通用 array 分支 + 新增 `_renderItemFields` 递归方法 |
| 前端 | `frontend-pc/js/pages/requirements.js` | `filters.statuses` 改为 5 个全选 |
| 前端 | `frontend-pc/js/pages/todos.js` | 分组头用 `project.color`（只读展示） |
| 元 | `CHANGELOG.md` | v1.10.0 条目 |
| 元 | `package.json` | 1.9.0 → 1.10.0 |
| 元 | `docs/api.md` | Project 字段表加 color |

## 测试与验收

### 自动化测试（后端）

| ID | 用例 | 期望 |
|---|---|---|
| P1 | POST /projects 带 `color: "#3b82f6"` | 201，返回含 `color: "#3b82f6"` |
| P2 | POST /projects 带 `color: "red"`（非 hex） | 400 `invalid color format` |
| P3 | PUT /projects/:id 传 `color: null` | 200，color 被清空 |
| P4 | GET /projects 返回项含 `color` 字段（无颜色时为 null） | 通过 |

`npm test` 必须 180/180（原 176 + P1-P4）。

### 手动验收（前端）

| ID | 用例 | 期望 |
|---|---|---|
| F1 | 健身打卡卡片 | 不再出现 `[object Object]`；展示嵌套结构（哪怕看起来啰嗦也行，能读懂即可） |
| F2 | 旧扁平打卡（睡眠/学习等） | 渲染与之前完全一致 |
| F3 | 需求页面首次进入 | 5 个状态全部勾选，列表展示全部 |
| F4 | TODO 页面按项目分组 | 项目色块用 `project.color`（已设置的项目）；未设置的项目用 fallback 调色板 |
| F5 | 用 API（如 `PUT /projects/:id` 带 `color: "#ef4444"`）设置项目颜色后刷新页面 | 该项目分组头颜色变为指定值 |
| F6 | 数据库迁移后查 projects 表 | 新增 `color` 列，VARCHAR(20) NULL |

### 验收 checklist

应该消失：
- [ ] 打卡卡片 `[object Object]` 字样
- [ ] 需求页面默认隐藏 completed/cancelled
- [ ] TODO 项目颜色随分组顺序变化的不稳定行为

应该存在：
- [ ] 任意 array/嵌套字段都有通用渲染输出
- [ ] 旧扁平打卡渲染零变化
- [ ] 需求页面默认 5 个状态全选
- [ ] Project 表有 color 字段，API 接受/返回
- [ ] TODO 项目分组用 project.color 上色
- [ ] 后端测试 180/180
- [ ] CHANGELOG / package.json / docs/api.md 同步

## 不包含

- 移动端 `frontend/`（Legacy）
- 打卡 array 字段的展开 / 详情视图
- Project 增删改的完整管理 UI（仅加颜色编辑入口）
- 颜色选择器引入第三方库
- localStorage 记忆筛选状态

## 风险

| 风险 | 应对 |
|---|---|
| 通用 array 渲染输出过长 | 200 字符截断 + `…` |
| 通用渲染遇到 schema 与 payload 不匹配（字段缺失/类型不对） | 缺失字段跳过；类型不对退化 String() 兜底；不抛异常 |
| Project.color migration 在生产数据库失败 | 新加 NULL 列，向后兼容；migration 单独 SQL，不阻塞上线 |
| 颜色编辑 UI 与现有 group-toggle 样式冲突 | 用独立 CSS 类前缀 `color-picker-` |

## 实现步骤（给 codebuddy，务必拆开 3 个独立 cb.sh）

### 步骤 A — 后端 + migration（executor）

1. `prisma/schema.prisma` Project 加 `color`
2. 写 `sql/add_project_color.sql`
3. `npm run prisma:generate`
4. `src/routes/project.ts`:
   - `projectToDict` 加 color
   - POST/PUT 接受并校验（`/^#[0-9a-fA-F]{6}$/`）
5. **不动测试**

### 步骤 B — 后端测试（独立 tester）

只看步骤 A 的 diff + 设计文档 P1-P4，写 `tests/project.test.ts` 新用例。`npm test` 必须 180/180。

### 步骤 C — 前端（独立 executor，只看设计文档不看 A/B 上下文）

1. `frontend-pc/js/pages/checkins.js`：通用 array 渲染（schema 驱动递归）
2. `frontend-pc/js/pages/requirements.js`：`statuses` 默认全选
3. `frontend-pc/js/pages/todos.js`：分组头用 `project.color`；加色块编辑入口
4. CSS

### 步骤 D — 元数据（最后一步独立 cb.sh）

CHANGELOG / package.json / docs/api.md。
