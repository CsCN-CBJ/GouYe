# 记账（Transaction）详细指南

## API 映射

| 用户意图 | 提取参数 | 调用 API |
|---------|---------|---------|
| 记录一笔支出/收入 | amount, type, category_id/category_name, date, description, tag_ids? | `POST /api/transactions` |
| 查看流水记录 | type?, start_date?, end_date?, category_id?, tag_id?, keyword? | `GET /api/transactions` |
| 按关键词搜索流水 | keyword | `GET /api/transactions?keyword=抽纸` |
| 查看收支汇总 | start_date?, end_date? | `GET /api/transactions/summary` |
| 修改某笔记录 | transaction_id + 变更字段 | `PUT /api/transactions/:id` |
| 删除某笔记录 | transaction_id | `DELETE /api/transactions/:id` |

## 创建流水参数

```json
{
  "category_id": 1,
  "amount": 35.50,
  "transaction_type": "expense",
  "transaction_date": "2026-04-30T15:00:00",
  "description": "午餐",
  "images": "url1,url2",  // 可选
  "tag_ids": [1, 2]       // 可选
}
```

## 查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `type` | income / expense | `expense` |
| `start_date` | 起始日期 | `2026-04-01` |
| `end_date` | 结束日期 | `2026-04-30` |
| `category_id` | 分类ID | `3` |
| `tag_id` | 标签ID | `5` |
| `keyword` | 对 description 字段做模糊匹配，空字符串/纯空格视为不传，仅匹配 description 不匹配 category/tag | `抽纸` |
| `page` | 页码（默认1） | `1` |
| `per_page` | 每页条数（默认20） | `20` |

> **未识别参数会报错**：`GET /api/transactions` 收到不在上表的 query 参数（如 `limit`、`q`）会返回 400 `unknown query parameters: <name>`。调用前必须用上表中的参数名。

## 收支汇总返回

```json
{
  "income": "1000.00",
  "expense": "500.00",
  "balance": "500.00"
}
```

## 关键规则

- 金额必须转为字符串（后端用 `Numeric(15,2)`）
- transaction_date 格式：`YYYY-MM-DD` 或 `YYYY-MM-DDTHH:MM:SS`，必须写入一个**具体的时间值**（如 `2026-04-30T15:30:00`），不可写成占位符格式模板
- **时区规则（v1.10.3+）**：裸串（无 `Z` / `+08:00` 后缀）一律按**北京时间 (Asia/Shanghai, +08:00)** 解释。`api_client.py::create_transaction / update_transaction` 会自动给裸串补 `+08:00`
- **展示命名**：`transaction_date` 向用户展示时统一叫「时间」，不叫「日期」或「transaction_date」（与打卡的 `occurred_at` 保持一致）
- 如果用户用分类名称而不是 ID，先调用 `GET /api/categories` 查询匹配
- `tag_ids` 为数组，关联多个标签

## 场景识别

| 用户说法 | 映射 |
|---------|------|
| "花了..."、"支出..."、"开销..."、"买..." | 支出（expense） |
| "收了..."、"收入..."、"收到..."、"工资..." | 收入（income） |
| "记账" | 通用，需确认类型 |

## 金额提取

| 用户说法 | 提取结果 |
|---------|---------|
| "35 块"、"35元"、"35.5 元" | `35` 或 `35.5` |
| "两杯咖啡 70 块" | `70` |
