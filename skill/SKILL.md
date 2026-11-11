---
name: gouye
description: >
  「狗爷 All-in-One」个人生活管理应用 Skill。当用户需要：(1) 记账、记录开销、收支统计，
  (2) 管理 TODO、待办、任务，(3) 打卡、运动记录，(4) 分类标签管理，
  (5) 周报生成，或用户提到花钱、收入、待办、打卡、跑步等与个人生活管理相关的请求时使用。
  收到任何图片时自动触发记账流程。
version: "0.2.0"
tags: ["personal-management", "api-client", "productivity"]
---

# Gouye

## 核心工作流

**用户消息 → 模块识别 → 参数提取 → 确认判断 → API 调用 → 结果展示**

根据用户意图选择模块，详细规则在各模块 reference 中：

| 模块 | 何时读取 | reference |
|------|---------|-----------|
| 记账 | 用户提到花钱、收入、记账、账单截图 | [transaction.md](references/transaction.md) |
| TODO | 用户提到待办、任务、记得、完成 | [todo.md](references/todo.md) |
| 打卡 | 用户提到运动、跑步、打卡、健身 | [checkin.md](references/checkin.md) |
| 分类标签 | 需要创建/查询分类或标签时 | [category_tag.md](references/category_tag.md) |
| 数据模型 | 需要查字段类型或约束时 | [data_schema.md](references/data_schema.md) |

## 配置要求

| 配置项 | 说明 | 示例 |
|--------|------|------|
| `GOUYE_API_BASE` | 后端 API 基础地址 | `http://localhost:5000` |
| `GOUYE_JWT_TOKEN` | JWT 认证 Token | `eyJhbGciOiJIUzI1NiIs...` |

配置缺失时，先询问用户获取，不可执行任何 API 调用。

## 用户偏好配置

> 所有个性化规则集中在此管理。新增偏好直接追加。

### 记账偏好

- **图片记账**：收到任何图片时自动触发记账，**直接识别并执行记录**，无需事先与用户确认；记录完成后告知用户写入了哪些字段。若图片中关键字段（金额/分类/时间）缺失或明显不合理，再询问用户。
- **打车截图记账**：
  - 描述（description）只保留**上班**，如"上班"
  - 必须关联 `通勤`、`打车` 标签（tag_name="通勤,打车"）
  - 如果无法判断上班/下班，主动询问用户
  - 如果"通勤"标签不存在，创建前需确认
- **腾讯工资日期固定为5号**：识别到腾讯科技(深圳)有限公司的工资收入时，无论截图上的日期是多少，`transaction_date` 设为**离到账日期最近的那个5日**（逻辑：找出当月5日和次月5日，取距离最近的那个）

### TODO偏好

- **建项目走 POST /api/projects**：创建 TODO 前如需项目，先调用 `POST /api/projects` 拿 project_id，再传给 TODO
- **group_by=project**：查看项目及归属 TODO 时，统一使用 `GET /api/todos?group_by=project`
- domain=work 时默认找域内第一个项目，找不到则询问用户

### 打卡偏好

- **模板化打卡（v2.0, 2026-04-30）**：打卡必须绑定 `template_id`，不再用自由字符串 `category`
- **title 自动取模板名**：创建打卡时 `title` 字段自动填为模板名称（如跑步模板→title="跑步"），不单独展示或确认
- **先匹配后打卡**：收到打卡意图时先 `GET /api/checkin-templates` 找对应模板；找不到则先与用户确认**创建模板**，再创建打卡
- **comment 字段**：用户随口补充的内容可归入 `payload.comment`
- **下班时间默认（2026-04-30）**：用户打"下班"卡但未明确说时间时，从三个预设时间点 `18:25 / 20:30 / 21:10` 中选**离当前时刻最近的那一个**（当天，按绝对时间差 `abs(now - candidate)` 算，取最小）。用户明确给出时间时以用户为准，不走此规则
- **已创建模板**：`跑步`（id=1，字段：distance km(必填)、duration min(必填)）
  - **地点信息**归入 `payload.comment` 字段。

## 模块概览

### 📝 记账（Transaction）

支持：记录支出/收入、查看流水、收支汇总、修改删除。

快捷识别：
- "花了/支出/买..." → expense
- "收了/收入/工资..." → income
- 金额提取："35块" → 35，"35.5元" → 35.5

详细规则 → [references/transaction.md](references/transaction.md)

### ✅ TODO

支持：添加待办、查看待办、完成/取消、修改删除。

快捷识别：
- "记得/要/TODO/待办" → 创建
- "工作/上班" → domain=work，"生活/个人" → domain=life
- 状态：`not_started` → `in_progress` → `blocked` → `completed` / `cancelled`（任意互转）

详细规则 → [references/todo.md](references/todo.md)

### 🏃 打卡（Checkin）

支持：基于模板的结构化打卡、查看打卡、修改删除；管理打卡模板。

快捷识别：
- "跑了/运动/打卡/健身..." → 先找模板，再创建 Checkin
- "跑步/冥想/下班..." → 匹配模板名（若无则引导创建模板）
- 字段类型：number / select / text / boolean / date
- `occurred_at` 表示打卡发生的时间（DateTime），展示给用户时统一叫**"时间"**而非"日期"

详细规则 → [references/checkin.md](references/checkin.md)

### 🏷️ 分类与标签

- 查看分类：`GET /api/categories`
- 创建分类：`POST /api/categories`（⚠️ 必须确认）
- 查看标签：`GET /api/tags`
- 创建标签：`POST /api/tags`（⚠️ 必须确认）

详细规则 → [references/category_tag.md](references/category_tag.md)

### 📊 统计与周报

| 用户意图 | 处理方式 |
|---------|---------|
| 查看收支统计 | `GET /api/transactions/summary?start_date=&end_date=` |
| 生成周报 | 查询本周 TODO + Checkin 数据，直接生成 Markdown 文本展示 |
| 查看历史周报 | `GET /api/ai/weekly-reports` |

**周报替代方案**：AI 相关 API 不使用。调用 `GET /api/todos` 和 `GET /api/checkins` 获取本周数据，直接生成 Markdown 周报展示给用户。

### 📁 项目管理

| 用户意图 | 调用 API |
|---------|---------|
| 查看项目列表及归属 TODO | `GET /api/todos?group_by=project` |
| 创建新项目 | `POST /api/projects` 直接建 |
| 归档项目 | `PUT /api/projects/:id` 传 `{"status": "archived"}` |

> ⚠️ `POST /api/projects/:id/archive` 和 `POST /api/projects/:id/unarchive` 路由已在 v1.5.0 删除。归档/恢复统一用 `PUT /api/projects/:id` 传 `{"status": "archived"|"active"}`。

## 确认机制

### 确认时参数展示（硬性规则）
向用户确认任何操作（尤其是记账、创建/修改/删除记录）时，**必须将所有要发给后端 API 的参数整理出来**，用清晰的格式（如表格或列表）展示给用户，确认无误后再执行 API 调用。禁止只给出模糊总结让用户确认。

示例格式：
```
我识别到以下信息，请确认：

| 参数 | 值 |
|------|-----|
| type | expense |
| amount | 35.5 |
| category | 餐饮 |
| description | 午餐 |
| 时间 | 2026-04-30T15:00:00 |
| tag | 通勤,打车 |

确认无误后我将记录这笔账目。是否确认？
```

> **展示命名规则**：`transaction_date` 和 `occurred_at` 在向用户展示时统一叫「时间」，不叫「日期」或「transaction_date」。

### 始终需要确认（硬性规则）
1. **创建分类（Category）**
2. **创建标签（Tag）**

### 建议确认（磨合期，v0.2.0 默认启用）
- 创建/修改/删除 记账流水
- 创建/删除 TODO
- 创建/删除 打卡记录

### 无需确认
- 查询类操作
- 修改 TODO 状态（如"完成了"）
- 简单的打卡记录（磨合期后）

## 通用查询速查

| 用户说法 | 处理 |
|---------|------|
| "今天花了多少钱" | 查询今日 transactions/summary |
| "还有什么没做完" | 查询 status 非 completed 的 todos |
| "这周跑了几次" | 查询本周 `checkins?template_id=<跑步模板id>` |
| "最近有什么打卡" | 查询最近 7 天的 checkins |

## 请求构造

所有 API 请求：

```
Authorization: Bearer {GOUYE_JWT_TOKEN}
Content-Type: application/json
```

GET 参数放 query string，POST/PUT 参数放 JSON body。

响应格式：
```json
{"code": 0, "message": "ok", "data": { ... }}
```

`code == 0` 成功，`code != 0` 时展示 `message`。

## 错误处理

| 场景 | 处理 |
|------|------|
| 401 认证失败 | Token 过期或无效，提示重新登录 |
| 404 数据不存在 | 确认 ID/名称是否正确 |
| 400 参数错误 | 展示错误信息，要求补充修正 |
| 503 服务不可用 | 后端异常，提示稍后重试 |
| 重复数据 | 告知已存在，询问是否使用已有的 |

## 时间提取

| 用户说法 | 映射 |
|---------|------|
| "刚才/刚刚" | 当前时间 |
| "今天" | 当天日期 |
| "昨天" | 昨天日期 |
| "周三" | 本周三日期 |
| "上周末" | 上周六/日 |
| "下午3点" | 当天 15:00 |

无法推断时询问用户确认。

## 交互风格

- **简洁明了**：1-2 句话总结结果
- **中文沟通**
- **友好确认**：用清晰表格或列表展示操作预览
- **主动总结**：多项意图时总结所有识别结果

## 工具使用

### Python 脚本（首选）

```python
import subprocess, json
result = subprocess.run(
    ["python3", "scripts/api_client.py", "--call", "get_categories"],
    capture_output=True, text=True
)
data = json.loads(result.stdout)
```

### curl（脚本不可用时）

```bash
curl -H "Authorization: Bearer $GOUYE_JWT_TOKEN" \
     "$GOUYE_API_BASE/api/categories"
```

脚本路径：`scripts/api_client.py`
