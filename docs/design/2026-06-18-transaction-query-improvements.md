# 设计：列表路由查询统一改进 (keyword + 未知参数白名单)

工蜂 issue #2（git.woa.com 项目 1772578）。**扩展范围至所有 GET 列表路由**。

## 核心诉求

1. 所有 GET 列表路由收到未识别 query param 应报 400，不再静默忽略
2. 用户文本字段加 `keyword` 模糊匹配能力
3. 各 skill reference 文档同步

## 现状

| 路由 | 当前接收参数 | 静默忽略 | 缺 keyword |
|---|---|---|---|
| GET /api/transactions | type, category_id, start_date, end_date, tag_id, page, per_page | ✗ | ✓ description |
| GET /api/todos | domain, project_id, status, tag_id, group_by, include_archived, project_status | ✗ | ✓ title |
| GET /api/projects | domain, include_archived, status | ✗ | ✓ name |
| GET /api/categories | type | ✗ | ✓ name |
| GET /api/tags | (无) | ✗ | ✓ tag_name |
| GET /api/checkins | template_id, tag_id | ✗ | (payload 是结构化 JSON，不加 keyword)|
| GET /api/checkin-templates | (无) | ✗ | ✓ name |

## 方案

### 1. 通用工具函数

`src/utils/validateQuery.ts`：
```ts
export function validateQueryParams(query: Record<string, any>, allowed: readonly string[]): string[] {
  const allowedSet = new Set(allowed);
  return Object.keys(query).filter((k) => !allowedSet.has(k));
}

// LIKE 通配符 escape：% / _ / \ 全部 escape，防止 keyword=100% 误匹配
export function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, c => '\\' + c);
}
```

### 2. 各路由 GET 顶部统一加白名单

模式：
```ts
const ALLOWED = ['x', 'y', 'keyword', 'page', 'per_page'] as const;
const unknown = validateQueryParams(req.query, ALLOWED);
if (unknown.length) {
  const r = errorResponse(`unknown query parameters: ${unknown.join(', ')}`, 400);
  return res.status(r.statusCode).json(r.body);
}
```

各路由白名单 + keyword 字段：

| 路由 | ALLOWED | keyword 搜字段 |
|---|---|---|
| transactions | type, category_id, start_date, end_date, tag_id, **keyword**, page, per_page | description |
| todos | domain, project_id, status, tag_id, group_by, include_archived, project_status, **keyword** | title |
| projects | domain, include_archived, status, **keyword** | name |
| categories | type, **keyword** | name |
| tags | **keyword** | tag_name |
| checkins | template_id, tag_id | (无 keyword，payload 跳过) |
| checkin-templates | **keyword** | name |

### 3. keyword 过滤模板

```ts
if (typeof keyword === 'string' && keyword.trim()) {
  where.<field> = { contains: escapeLikePattern(keyword.trim()) };
}
```

MySQL utf8mb4_0900_ai_ci 默认大小写不敏感，**不要** `mode: 'insensitive'`。

### 4. skill 端同步

| skill 文件 | 改动 |
|---|---|
| `skill/scripts/api_client.py` | `get_transactions` / `list_todos` / `get_projects` / `get_categories` / `get_tags` / `list_checkin_templates`（具体函数名以现有为准）加 `keyword=None` 入参 |
| `skill/references/transaction.md` | keyword 行 + 未识别参数 400 提示 |
| `skill/references/todo.md` | 同 |
| `skill/references/project.md` | 同 |
| `skill/references/category.md` | 同（如果有这个文件） |
| `skill/references/checkin.md` | 加未识别参数 400 提示（无 keyword） |

## 涉及文件清单

| 文件 | 改动 |
|---|---|
| `src/utils/validateQuery.ts` | 新增 `validateQueryParams` + `escapeLikePattern` |
| `src/routes/transaction.ts` | 已完成（v1.11.0 第一波）|
| `src/routes/todo.ts` | 加白名单 + keyword 搜 title |
| `src/routes/project.ts` | 加白名单 + keyword 搜 name |
| `src/routes/category.ts` | 加白名单 + keyword 搜 name |
| `src/routes/tag.ts` | 加白名单 + keyword 搜 tag_name |
| `src/routes/checkin.ts` | 加白名单（不加 keyword） |
| `src/routes/checkin-template.ts` | 加白名单 + keyword 搜 name |
| `skill/scripts/api_client.py` | 各 list 函数加 keyword 入参 |
| `skill/references/*.md` | 同步参数表 + 未识别参数 400 警告 |
| `tests/*.test.ts` | 各路由加 keyword + 未知参数白名单测试 |
| `docs/api.md` | 全部 GET 列表路由补 keyword + 400 行为 |
| `CHANGELOG.md` | v1.11.0 |
| `package.json` | 1.11.0 |

## 测试与验收

每个改动的 GET 路由各加 4 个用例：
- T1: `?keyword=<匹配字符>` → 仅返回匹配记录
- T2: `?keyword=` 或 `?keyword=   ` → 等同不传
- T3: `?<unknown>=x` → 400 + message 含参数名
- T4: `?keyword=<含%或_>` → 字面量匹配，不当通配符

transactions 已有 T1-T5（含 100% 字面量）。

### 验收 checklist

应该消失：
- [ ] 任一 GET 列表路由对未知 query param 静默忽略

应该存在：
- [ ] `src/utils/validateQuery.ts` 含 `validateQueryParams` + `escapeLikePattern`
- [ ] 6 个 GET 列表路由（transactions / todos / projects / categories / tags / checkin-templates）支持 `keyword` 模糊匹配
- [ ] checkin GET 列表路由有白名单校验（无 keyword）
- [ ] 各路由对未识别参数返回 400 + `unknown query parameters: <names>`
- [ ] keyword 字面量 `%` / `_` 匹配（escape 生效）
- [ ] skill api_client.py 对应函数加 keyword 入参
- [ ] skill/references/*.md 同步

## 不包含的内容

- 不改 frontend-pc/ 调用方（前端只读，按需后续单独适配）
- 不引入全文索引
- checkins payload 不加 keyword（结构化字段，需要单独设计）
