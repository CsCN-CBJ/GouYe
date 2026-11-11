# 分类与标签管理详细指南

## 分类（Category）

### API 映射

| 用户意图 | 调用 API |
|---------|---------|
| 查看所有分类 | `GET /api/categories` |
| 创建新分类 | `POST /api/categories` |
| 修改分类 | `PUT /api/categories/:id` |
| 删除分类 | `DELETE /api/categories/:id` |

### 查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `type` | income / expense | `expense` |
| `keyword` | 对 category_name 做模糊匹配（escape `%` `_` `\`） | `餐饮` |

> **未识别参数 400**：所有列表路由不再静默忽略未知 query 参数。传 ?foo=bar 会返回 400 `unknown query parameters: foo`。

### 创建分类参数

```json
{
  "category_name": "餐饮",
  "category_type": "expense",
  "icon": "🍜",
  "color": "#FF6B6B"
}
```

### 分类数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| category_id | BigInteger | 主键 |
| category_name | String(50) | 分类名称 |
| category_type | Enum | income / expense |
| icon | String(50) | 图标（emoji或icon名称） |
| color | String(20) | 颜色值 |

**约束**: (user_id, category_name) 唯一

**注意**: 删除分类时，如果分类下有流水记录会被拒绝。

---

## 标签（Tag）

### API 映射

| 用户意图 | 调用 API |
|---------|---------|
| 查看所有标签 | `GET /api/tags` |
| 创建新标签 | `POST /api/tags` |
| 修改标签 | `PUT /api/tags/:id` |
| 删除标签 | `DELETE /api/tags/:id` |

### 标签查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `keyword` | 对 tag_name 做模糊匹配（escape `%` `_` `\`） | `重要` |

> **未识别参数 400**：同分类。

### 创建标签参数

```json
{
  "tag_name": "重要",
  "color": "#FF0000"
}
```

### 标签数据结构

| 字段 | 类型 | 说明 |
|------|------|------|
| tag_id | BigInteger | 主键 |
| tag_name | String(30) | 标签名称 |
| color | String(20) | 颜色值 |

**约束**: (user_id, tag_name) 唯一

---

## ⚠️ 强制确认规则

**创建分类和创建标签的操作，必须始终向用户确认，不可自动执行。**

原因：
- 分类和标签影响所有数据组织的结构
- 同一用户下不可重复（有唯一性约束）
- 删除分类如果有流水关联会被拒绝

确认流程：
1. 用户意图含"创建分类/标签"
2. 向用户展示拟创建的分类/标签详情
3. 等待用户明确回复"确认""好""可以"等肯定答复
4. 只有用户确认后才调用 API
5. 若用户拒绝或未回复，不执行操作

## 重复数据处理

- 创建标签/分类时可能遇到"已存在"
- 告知用户已存在，询问是否使用已有的标签/分类

## 通用用法

分类和标签可以被记账流水（Transaction）、TODO、打卡（Checkin）关联：
- Transaction 通过 `tag_ids` 数组关联标签
- TODO 通过 `tag_ids` 数组关联标签
- Checkin 通过 `tag_ids` 数组关联标签
- Transaction 通过 `category_id` 关联分类
