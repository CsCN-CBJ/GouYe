# 设计：修复 datetime 字段时区不一致

工蜂 issue #1（git.woa.com 项目 1772578）。**扩展范围至所有 datetime 字段**。

## 核心诉求

1. 修复进程 TZ 漂移导致的 datetime 字段错误存储（不只 `occurred_at`）
2. 强约束服务器 / 客户端时区，确保后续不再漂移
3. 修正 checkins 存量脏数据（仅"下班 / OffWork / 睡觉"模板下、id ≥ 67 的 17 条）

## 根因

`new Date(裸时间字符串)` 按**进程 TZ** 解释裸串。6/9 进程 TZ 从 `Asia/Shanghai` 漂移为 `UTC` 后，所有用 `new Date(裸串)` 处理用户输入的字段都会出错：

| 文件 | 字段 | 用例 |
|---|---|---|
| `src/routes/checkin.ts:87,153` | `occurredAt` | POST/PUT |
| `src/routes/transaction.ts:96-97` | `transactionDate` 查询窗口 | GET start/end |
| `src/routes/transaction.ts:146` | `transactionDate` | POST |
| `src/routes/transaction.ts` PUT | `transactionDate` | PUT（如有）|
| `src/routes/todo.ts:208,307` | `dueAt` | POST/PUT |

客户端（`skill/scripts/api_client.py`、`frontend/pages/checkin.js`）一直只发裸串，没带时区。

## 方案

### 1. 通用时间解析工具

新增 `src/utils/datetime.ts`：
```ts
// 写死 +08:00 字面量，不读 process.env.TZ
export function parseLocalDateTime(input: unknown): Date {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error('datetime must be a non-empty string');
  }
  const s = input.trim();
  // 已带时区（Z / ±HH:MM / ±HHMM）→ 直接交给 Date
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${input}`);
    return d;
  }
  // 裸串 YYYY-MM-DD 或 YYYY-MM-DDTHH:mm[:ss]：按 +08:00 解释
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) {
    return new Date(`${dateOnly[1]}T00:00:00+08:00`);
  }
  const dateTime = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}(?::\d{2})?)$/);
  if (!dateTime) throw new Error(`invalid datetime format: ${input}`);
  const d = new Date(`${dateTime[1]}T${dateTime[2]}+08:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid datetime: ${input}`);
  return d;
}

// 用于 start_date/end_date 这种"日期窗口"，end_date 自动推到当天 23:59:59 +08:00
export function parseLocalDateRange(start: unknown, end: unknown): { gte?: Date; lte?: Date } {
  const out: { gte?: Date; lte?: Date } = {};
  if (typeof start === 'string' && start) {
    out.gte = new Date(`${start}T00:00:00+08:00`);
    if (Number.isNaN(out.gte.getTime())) throw new Error(`invalid start_date: ${start}`);
  }
  if (typeof end === 'string' && end) {
    out.lte = new Date(`${end}T23:59:59+08:00`);
    if (Number.isNaN(out.lte.getTime())) throw new Error(`invalid end_date: ${end}`);
  }
  return out;
}
```

### 2. 替换所有 `new Date(裸串)` 调用点

| 文件 | 行 | 改动 |
|---|---|---|
| `src/routes/checkin.ts` | 87 | `occurredAt: occurred_at ? parseLocalDateTime(occurred_at) : now` |
| `src/routes/checkin.ts` | 153 | `occurredAt: parseLocalDateTime(occurred_at)` |
| `src/routes/transaction.ts` | 95-98 | 用 `parseLocalDateRange` 重写 dateFilter |
| `src/routes/transaction.ts` | 146 | `transactionDate: parseLocalDateTime(transaction_date)` |
| `src/routes/transaction.ts` PUT | (查) | 同上 |
| `src/routes/todo.ts` | 208 | `dueAt: due_at ? parseLocalDateTime(due_at) : null` |
| `src/routes/todo.ts` | 307 | `const newDueAt = due_at ? parseLocalDateTime(due_at) : null` |
| `src/routes/todo.ts` createTodoVersion | - | `dueAt` 已经是 Date 对象，无需改 |

捕获 `parseLocalDateTime` 抛出的错误统一返回 400。

### 3. 客户端显式带时区

- `skill/scripts/api_client.py`：
  - `create_checkin`、`create_transaction`、`update_transaction`、`create_todo`、`update_todo` 等接收 datetime 入参的函数
  - docstring 顶部标注："**所有时间参数默认按北京时间（Asia/Shanghai, +08:00）解释**，调用方无需自己处理时区"
  - 函数内部：若入参不含时区后缀，自动补 `+08:00` 再发送（双保险）
- `skill/scripts/daily_check.py`：构造 `occurred_at` 时改用带时区的 ISO 8601
- `frontend/pages/checkin.js` `frontend/pages/todo.html` 等：表单取 `<input type="datetime-local">.value` 后拼 `+08:00` 再发送

### 4. PM2 ecosystem 钉死时区

`ecosystem.config.cjs`：
```js
env: {
  NODE_ENV: 'production',
  TZ: 'Asia/Shanghai'
}
```

与 `parseLocalDateTime` 形成双保险（即使忘了用工具函数，进程 TZ 也不会漂）。

### 5. 历史数据迁移（仅 checkins，不迁 transactions/todos）

新建 `prisma/migrations/20260618000000_fix_checkin_occurred_at_tz/migration.sql`：

```sql
-- v1.10.3: 修正 6/9 ~ 6/17 期间因进程 TZ 漂移 (Asia/Shanghai → UTC)
-- 导致 occurred_at 整体快 8h 的脏数据。
-- 仅修正"下班 / OffWork / 睡觉"模板的 17 条记录（用户已逐条确认）。
-- 注意：本迁移已 +8h，prisma migrate 通过 _prisma_migrations 表防重复执行。
-- 若需手工重跑，请先核对此 17 条 occurred_at 是否已修正，避免再 +8h。
UPDATE checkins SET occurred_at = occurred_at + INTERVAL 8 HOUR
WHERE id IN (67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 80, 81, 82, 83, 84, 85, 86);
```

watch-pull.sh 自动 `prisma migrate deploy`。

**迁移前 evidence 抓取**（executor 实施时手动跑）：
```bash
mysql -h 9.134.107.159 -P 3306 -u ai -pwdnmd gouye -e "
SELECT id, occurred_at FROM checkins WHERE id IN (67,70,71,72,73,74,75,76,77,78,80,81,82,83,84,85,86) ORDER BY id;
" > temp/checkin-tz-fix-backup-20260618.csv
```
作为迁移前快照存档。

**transactions / todos 不迁数据**：
- `transactionDate` / `dueAt` 同样可能被污染，但用户决定**只修代码、不迁数据**
- 后续如发现具体脏记录，单开 issue 处理

### 6. TodoVersion 快照逻辑

`createTodoVersion` 写入 `dueAt: todo.dueAt`，因 todo.dueAt 已经是 Date 对象（来自 prisma 创建/更新返回值），无需改。但要确认 PUT 流程里 `parseLocalDateTime` 在写入 prisma 前完成转换。

## 涉及文件清单

| 文件 | 改动 |
|---|---|
| `src/utils/datetime.ts` | 新增 `parseLocalDateTime` / `parseLocalDateRange` |
| `src/routes/checkin.ts` | 两处 `new Date(occurred_at)` → `parseLocalDateTime` |
| `src/routes/transaction.ts` | GET dateFilter 用 `parseLocalDateRange`；POST/PUT 用 `parseLocalDateTime` |
| `src/routes/todo.ts` | POST/PUT `due_at` 处理用 `parseLocalDateTime` |
| `skill/scripts/api_client.py` | 涉及 datetime 入参的函数补 `+08:00` 默认 + docstring 标注 |
| `skill/scripts/daily_check.py` | 构造 `occurred_at` 带 `+08:00` |
| `frontend/pages/checkin.js`、`frontend/pages/todo.js` | 表单取值后拼 `+08:00` |
| `ecosystem.config.cjs` | env 加 `TZ: 'Asia/Shanghai'` |
| `prisma/migrations/20260618000000_fix_checkin_occurred_at_tz/migration.sql` | 17 条 +8h |
| `tests/datetime.test.ts` | 新增 `parseLocalDateTime` / `parseLocalDateRange` 单测 |
| `tests/checkin.test.ts` `tests/transaction.test.ts` `tests/todo.test.ts` | 各加裸串/带 Z/带 +08:00 用例 |
| `temp/checkin-tz-fix-backup-20260618.csv` | 迁移前快照 |
| `CHANGELOG.md` | v1.10.3 |
| `package.json` | bump 1.10.3 |

## 测试与验收

### 单元测试 `tests/datetime.test.ts`

| ID | 用例 | 期望 |
|---|---|---|
| U1 | `parseLocalDateTime('2026-06-18T22:00:00')` | 返回 `Date('2026-06-18T14:00:00.000Z')` |
| U2 | `parseLocalDateTime('2026-06-18T14:00:00Z')` | 返回 `Date('2026-06-18T14:00:00.000Z')` |
| U3 | `parseLocalDateTime('2026-06-18T22:00:00+08:00')` | 返回 `Date('2026-06-18T14:00:00.000Z')` |
| U4 | `parseLocalDateTime('2026-06-18')` | 返回 `Date('2026-06-17T16:00:00.000Z')` (即 +08:00 的 00:00) |
| U5 | `parseLocalDateTime('not-a-date')` | throw |
| U6 | `parseLocalDateTime('')` / `null` / `undefined` | throw |
| U7 | `parseLocalDateRange('2026-06-18', '2026-06-18')` | gte = 当天 0 点 +08:00, lte = 当天 23:59:59 +08:00 |
| U8 | 在 `process.env.TZ='UTC'` 下跑 U1 | 结果不变（验证不依赖进程 TZ） |

### 集成测试

| ID | 用例 | 期望 |
|---|---|---|
| T1 | POST `/api/checkins` 传裸串 `2026-06-18T22:00:00` | DB 落库 `occurredAt.toISOString() === '2026-06-18T14:00:00.000Z'` |
| T2 | POST `/api/checkins` 传带 Z 后缀 | 落库 UTC 时间一致 |
| T3 | POST `/api/checkins` 传 `+08:00` | 落库 UTC 一致 |
| T4 | POST 不传 occurred_at | 落库 = 服务端 now |
| T5 | POST 传非法格式 | 400 |
| T6 | POST `/api/transactions` 传 `transaction_date='2026-06-18T22:00:00'` | 落库 UTC 一致 |
| T7 | GET `/api/transactions?start_date=2026-06-18&end_date=2026-06-18` | 命中 6/18 北京时间所有记录（不漏不多）|
| T8 | POST `/api/todos` 传 `due_at='2026-06-18T22:00:00'` | 落库 UTC 一致 |

### 历史数据验收（线上 readonly）

迁移 deploy 后跑：
```sql
SELECT id, occurred_at FROM checkins WHERE id IN (67,70,71,72,73,74,75,76,77,78,80,81,82,83,84,85,86) ORDER BY id;
```
对照设计文档"修正后"列逐条核对。

### 验收 checklist

应该消失：
- [ ] checkins 中下班/睡觉模板 occurred_at 落在不合理时段（下班 8-17 / 睡觉 6-23）的脏数据
- [ ] 源码中所有 `new Date(裸串)` 处理用户输入的调用点

应该存在：
- [ ] `src/utils/datetime.ts::parseLocalDateTime` / `parseLocalDateRange`
- [ ] 所有相关路由（checkin / transaction / todo）改用工具函数
- [ ] U1-U8、T1-T8 全过
- [ ] `ecosystem.config.cjs` 含 `TZ: 'Asia/Shanghai'`
- [ ] migration 文件存在且已 deploy
- [ ] 线上 17 条记录 `occurred_at` 已 +8h
- [ ] `temp/checkin-tz-fix-backup-20260618.csv` 存档
- [ ] skill api_client docstring 顶部标注"默认北京时间"

## 不包含的内容

- 不修改 schema
- 不迁 `transactions` / `todos` 的历史数据（用户决定，单开 issue 处理）
- 不动跑步 / 修心 / 健身等其他 checkin 模板的历史数据
- 不改 frontend-pc（只读，无写入入口）
- 不引入 dayjs / luxon
