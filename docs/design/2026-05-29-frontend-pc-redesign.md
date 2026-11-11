# PC 前端重绘 — 只读展示 + 筛选

## 核心诉求

全新 PC 端前端（响应式兼容手机），只读展示 + 筛选，需登录。旧移动端前端保留不动。

## 技术方案

| 项目 | 选择 | 理由 |
|------|------|------|
| 框架 | 无框架，原生 HTML/JS | 与旧前端一致，轻量 |
| 样式 | Tailwind CSS (CDN) | 响应式开箱即用 |
| 图标 | Font Awesome (CDN) | 现成图标库 |
| 目录 | `frontend-pc/` | 独立于旧 `frontend/` |
| 路由 | Hash 路由 (`#/xxx`) | 无需后端配合，单 HTML 入口 |
| 认证 | JWT localStorage | 复用现有 `/api/users/login` |

## 页面清单

### 1. 登录页
- 用户名 + 密码
- 调用 `POST /api/users/login`
- 存 token 到 localStorage，跳转首页

### 2. 需求页（`#/requirements`）
- 数据源：`GET /api/todos?domain=work`
- 展示字段：title, status, project, tags, due_at, created_at
- 筛选：status(pending/done/cancelled), project, tag
- 默认首页

### 3. TODO 页（`#/todos`）
- 数据源：`GET /api/todos?domain=life`
- 展示字段：同需求页
- 筛选：status, project, tag

### 4. 记账页（`#/transactions`）
- 数据源：`GET /api/transactions` + `GET /api/transactions/summary`
- 展示字段：amount, transaction_type(收/支), category, description, tags, transaction_date
- 筛选：月份(start_date/end_date), 收/支(type), 分类(category_id), tag(tag_id)
- 顶部显示月度收支汇总

### 5. 打卡页（`#/checkins`）
- 数据源：`GET /api/checkins`
- 展示字段：template(name+icon), occurred_at, payload（根据 fields_schema 渲染）
- 筛选：模板(template_id), 日期范围

## 目录结构

```
frontend-pc/
├── index.html          # 单入口，含侧边栏/顶部导航
├── css/
│   └── app.css         # 自定义样式（Tailwind 之外的微调）
├── js/
│   ├── app.js          # 路由 + 初始化 + 认证守卫
│   ├── api.js          # fetch 封装（自动带 JWT header）
│   ├── router.js       # 简易 hash 路由
│   └── pages/
│       ├── login.js
│       ├── requirements.js
│       ├── todos.js
│       ├── transactions.js
│       └── checkins.js
└── components/
    ├── sidebar.js      # 侧边栏导航
    ├── filters.js      # 通用筛选组件
    └── card.js         # 通用卡片渲染
```

## UI 布局

### PC（≥1024px）
```
┌──────────┬────────────────────────────────────┐
│ Sidebar  │  Header (页面标题 + 筛选栏)         │
│          │────────────────────────────────────│
│ 需求     │                                    │
│ TODO     │  内容区（卡片列表/表格）             │
│ 记账     │                                    │
│ 打卡     │                                    │
│          │                                    │
│──────────│  Pagination                        │
│ 退出登录 │                                    │
└──────────┴────────────────────────────────────┘
```

### 手机（<1024px）
```
┌────────────────────────┐
│ ☰ 页面标题             │  ← 汉堡菜单展开侧边栏
│────────────────────────│
│ 筛选栏（折叠/展开）     │
│────────────────────────│
│                        │
│ 内容区（卡片列表）      │
│                        │
│ Pagination             │
└────────────────────────┘
```

## 后端改动

**无需改动。** 所有数据通过现有 API 获取，筛选由查询参数实现。

打卡接口暂无日期筛选参数，可在前端做客户端过滤（数据量不大），或后续再加后端支持。

## 路由服务

修改 Express 静态文件服务：

```typescript
// 新前端作为主页
app.use(express.static('frontend-pc'));

// 旧移动端前端保留在 /legacy/
app.use('/legacy', express.static('frontend'));

// SPA fallback — 非 API 路由返回新前端 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPcDir, 'index.html'));
});
```

访问方式：`http://host:9000/`（新前端）、`http://host:9000/legacy/`（旧前端）

## 功能范围

### 包含
- [x] 登录/退出
- [x] 需求列表（work domain）+ 筛选
- [x] TODO 列表（life domain）+ 筛选
- [x] 记账列表 + 月度汇总 + 筛选
- [x] 打卡列表 + 筛选
- [x] 响应式布局（PC + 手机）
- [x] token 过期自动跳转登录

### 不包含
- 创建/编辑/删除任何数据
- 用户注册
- 旧前端代码改动
- 复杂图表/统计（后续迭代）

## 验收标准

1. 登录成功后能看到需求列表
2. 四个页面均能正确加载数据并展示
3. 每个页面的筛选功能正常工作
4. PC 和手机端布局均正常
5. token 过期或未登录时自动跳转登录页
6. 无 JS 报错，加载流畅

## 风险与假设

| 风险 | 应对 |
|------|------|
| 打卡无日期筛选 API | 前端客户端过滤，数据量可控 |
| Tailwind CDN 加载慢 | 国内可换 unpkg 镜像 |
| 无分页 API（TODO/打卡） | TODO 数据量可控直接全量拉取；如过大后续加分页 |
