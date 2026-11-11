# 打卡/运动（Checkin）详细指南

> **v2.0（2026-04-30 模板化）**：Checkin 不再使用自由字符串 `category`，改为**基于模板（CheckinTemplate）的结构化打卡**。每条打卡记录必须关联一个模板，`payload` 的字段由模板的 `fields_schema` 定义。

## 核心概念

- **CheckinTemplate（模板）**：定义某类打卡的字段结构（如"跑步"有 `distance` + `duration` 两个必填数值字段）。
- **Checkin（打卡记录）**：一次具体的打卡，引用某个模板，并按模板 schema 填 `payload`。
- `comment` 字段（text 类型，备注）由后端**自动注入**到所有模板中，用户不可自定义同名字段。

## 模板字段类型

| type | 说明 | 值示例 | 额外配置 |
|------|------|--------|----------|
| `number` | 数值 | `5.2` | `min` / `max` / `decimals` / `unit` |
| `select` | 单选 | `"中"` | `options: ["低","中","高"]` |
| `text` | 文本 | `"状态不错"` | `max_length`, `multiline` |
| `boolean` | 开关 | `true` | — |
| `date` | 日期 | `"2026-06-09"` | — |

- `comment` 为系统保留 key，由后端自动注入，用户不可自定义。

## API 映射

### 模板管理

| 用户意图 | 调用 API |
|---------|---------|
| 列出所有模板 | `GET /api/checkin-templates` |
| 查看某个模板 | `GET /api/checkin-templates/:id` |
| 创建模板（⚠️ 需确认）| `POST /api/checkin-templates` |
| 修改模板（⚠️ 需确认）| `PUT /api/checkin-templates/:id` |
| 删除模板（⚠️ 需确认）| `DELETE /api/checkin-templates/:id` |

### 打卡记录

| 用户意图 | 提取参数 | 调用 API |
|---------|---------|---------|
| 打卡 | `template_id` + `payload` + `occurred_at?` + `tag_ids?` | `POST /api/checkins` |
| 查看打卡 | `template_id?`, `tag_id?` | `GET /api/checkins` |
| 修改打卡 | `checkin_id` + 变更字段 | `PUT /api/checkins/:id` |
| 删除打卡 | `checkin_id` | `DELETE /api/checkins/:id` |

## 创建模板示例

```json
POST /api/checkin-templates
{
  "name": "跑步",
  "icon": "running",
  "fields_schema": [
    {"key": "distance", "label": "距离", "type": "number", "required": true, "unit": "km", "min": 0, "decimals": 2},
    {"key": "duration", "label": "时长", "type": "number", "required": true, "unit": "min", "min": 0}
  ]
}
```


## 创建打卡示例

```json
POST /api/checkins
{
  "template_id": 1,
  "occurred_at": "2026-04-30T07:00:00",
  "payload": {
    "distance": 5.2,
    "duration": 30,
    "comment": "状态不错"
  },
  "tag_ids": [3]
}
```

### 必填规则
- `template_id`：**必填**（后端强校验），对应某个已存在的模板
- `payload`：按模板 schema **严格校验**
  - `required: true` 的字段必须有非空值
  - **不允许出现 schema 之外的字段**（多传一个 key 即返回 400）
  - 类型/范围/枚举不匹配也会 400
- `occurred_at`：可选，默认当前时间；**展示给用户时叫"时间"而非"日期"**（字段类型是 DateTime）。
  **时区规则（v1.10.3+）**：传入裸串（如 `2026-06-18T22:00:00`）一律按**北京时间 (Asia/Shanghai, +08:00)** 解释，不再依赖服务器进程 TZ。如需明确指定时区，写完整后缀（`Z` / `+08:00`）。`api_client.py::create_checkin` 会自动给裸串补 `+08:00`，调用方无需手动处理。

## 查询参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `template_id` | 按模板筛选 | `1` |
| `tag_id` | 标签ID | `3` |

> **未识别参数 400**：所有列表路由不再静默忽略未知 query 参数。传 ?foo=bar 会返回 400 `unknown query parameters: foo`。
>
> ⚠️ Checkin 列表**不支持** `keyword` 参数（payload 是结构化 JSON）。

> ⚠️ 旧版本的 `?category=跑步` 已废弃，改用 `?template_id=<模板 id>`。必要时先 `GET /api/checkin-templates` 按名字找 id。

## 场景识别流程

### 用户要打卡时

1. **识别意图**：用户说"跑了 5 公里"/"打卡下班"/"做了 30 分钟冥想"等
2. **匹配模板**：`GET /api/checkin-templates` → 按 `name` 找最契合的模板
   - 未找到：询问用户是否**创建新模板**（进入模板创建确认流程）
   - 找到：用模板的 `fields_schema.fields` 来映射用户的自然语言到 `payload`
3. **参数确认**：展示 `template_id`（以及模板名）、`occurred_at`（展示为"时间"）、`payload` 给用户确认
4. **创建打卡**：`POST /api/checkins`

### 场景映射表

| 用户说法 | 映射 |
|---------|------|
| "跑了 5 公里 30 分钟" | template=跑步, payload={distance:5, duration:30} |
| "大沙河跑了 3 公里" | template=跑步, payload={distance:3, comment:"大沙河"} |
| "哈工深操场跑了两圈" | template=跑步, payload={distance:?估算, comment:"哈工深操场"} |
| "下班打卡" | template=下班（若无则引导创建）|
| "打卡冥想 20 分钟" | template=冥想, payload={duration:20} |
| "这周跑了几次" | `GET /api/checkins?template_id=<跑步id>` + 本周时间筛选 |
| "最近有什么打卡" | `GET /api/checkins`（最近 7 天）|
| "我有哪些打卡模板" | `GET /api/checkin-templates` |

## 关键规则

- **用户随口说的补充信息可塞进 `payload.comment`**
- **`occurred_at` 默认当前时间**，若用户说"昨天"要换算；**展示时叫"时间"而非"日期"**（该字段类型为 DateTime，不是 Date）
- **"下班"打卡时间默认**：若用户打"下班"卡但未明确给时间，从 `18:25 / 20:30 / 21:10` 三个预设时间点中选**离当前时刻绝对差最小**的那一个（当天）。用户明确给时间时以用户为准
- **未找到模板不要硬塞**：如果用户的行为没有对应模板，**先确认再创建模板**，不能自动降级为"随便找个模板打卡"
- **payload 严格校验**：number 传数字别传字符串；select 传单个值；**禁止传任何 schema 之外的字段**
- **模板名 (user_id, name) 唯一**：不能同名

## 历史兼容说明（2026-04-30）

- 旧字段 `category: String(40)` 已从 `checkins` 表删除
- 原本的 `POST /api/checkins` 带 `category` 参数现在会返回 `template_id 不能为空` 错误
- 如果在老文档/老对话里看到 `category: "跑步"` 的调用方式，请转换为先找 / 创建对应模板，再用 `template_id` 调用

## array 嵌套字段（v1.9.0+）

### array 字段语法

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | 固定值 `"array"` |
| key | string | 是 | 字段名（不可用 `comment`） |
| label | string | 否 | 显示标签 |
| required | boolean | 否 | 数组本身是否必填（true 时不能缺/不能空数组），默认 false |
| min_items | number | 否 | 最小元素数，必须 `>= 0` |
| max_items | number | 否 | 最大元素数，默认 200，硬上限 1000 |
| item_fields | array | 是 | 每个元素的字段定义（支持递归，包含所有原有类型 + array 自身） |

### 约束

- 递归深度上限 **3 层**（顶层 fields → 第 1 层 array → 第 2 层 array → 第 3 层 array 内不允许再 array）
- 单 array 元素数默认 200，硬上限 1000
- `comment` 仅顶层注入，`item_fields` 不自动注入 comment
- 错误信息带完整嵌套路径（如 `exercises[0].sets[1].weight_kg: must be a number`）

### 完整健身模板示例

**创建模板**：

```json
POST /api/checkin-templates
{
  "name": "健身",
  "icon": "fitness",
  "fields_schema": {
    "fields": [
      {
        "key": "exercises",
        "type": "array",
        "label": "动作",
        "required": true,
        "min_items": 1,
        "item_fields": [
          { "key": "name", "type": "text", "label": "动作名", "required": true },
          { "key": "equipment", "type": "select", "options": ["哑铃","杠铃","固定器械","自重","其他"] },
          {
            "key": "sets",
            "type": "array",
            "label": "组",
            "required": true,
            "min_items": 1,
            "item_fields": [
              { "key": "weight_kg", "type": "number", "label": "重量(kg)" },
              { "key": "reps", "type": "number", "label": "次数", "required": true },
              { "key": "rpe", "type": "number", "label": "RPE", "required": false }
            ]
          }
        ]
      }
    ]
  }
}
```

**打卡**：

```json
POST /api/checkins
{
  "template_id": 1,
  "payload": {
    "exercises": [
      {
        "name": "哑铃卧推",
        "equipment": "哑铃",
        "sets": [
          { "weight_kg": 20, "reps": 12 },
          { "weight_kg": 22.5, "reps": 10 },
          { "weight_kg": 25, "reps": 8 }
        ]
      },
      {
        "name": "上斜卧推",
        "equipment": "杠铃",
        "sets": [
          { "weight_kg": 40, "reps": 10 },
          { "weight_kg": 50, "reps": 8 }
        ]
      }
    ],
    "comment": "今天状态不错"
  }
}
```
