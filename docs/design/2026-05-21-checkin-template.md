# 打卡模板（CheckinTemplate）设计文档

**核心诉求：** 将打卡从硬编码的 `title`/`category`/`raw_input` 模式，升级为用户自定义模板 + schema 校验的结构化打卡。
**日期：** 2026-05-21

---

## 背景

原打卡模型（`checkins` 表）使用 `title`、`category`、`raw_input` 三个字段描述打卡内容，`payload` 为自由 JSON。问题：

1. 不同类型打卡（跑步、阅读、冥想）所需的字段完全不同，`payload` 无约束导致数据质量差
2. 前端无法根据 category 动态渲染表单，只能做通用文本框
3. `category` 为自由字符串，无法保证一致性和可扩展性

解决方案：引入 `CheckinTemplate`，让用户自定义打卡类型的字段结构，打卡时严格按模板校验。

---

## 方案

### 关键设计决策

1. **模板与打卡一对多**：`checkins.template_id` 外键指向 `checkin_templates.id`，一条打卡必须基于模板创建。
2. **fields_schema 定义字段结构**：模板的核心是一个 JSON schema，声明字段列表及各字段的类型、约束。
3. **严格 payload 校验**：创建/更新打卡时，`payload` 必须完全符合模板 schema——缺必填、类型不符、多余字段均拒绝。
4. **自动注入 comment 字段**：所有模板自动携带一个 `comment`（备注）文本字段，用户不可自定义同名 key。
5. **模板不可删除（有引用时）**：若已有打卡记录引用模板，拒绝删除，避免孤儿数据。

### 数据模型

**checkin_templates 表**
```
id               BIGINT PK
user_id          FK users.user_id
name             VARCHAR(50)       -- 模板名称，同用户唯一
icon             VARCHAR(50) NULL  -- 图标标识
fields_schema    JSON              -- 字段定义
created_at / updated_at
UNIQUE(user_id, name)
```

**checkins 表（变更）**
```
id               BIGINT PK
user_id          FK users.user_id
template_id      FK checkin_templates.id  NOT NULL  -- 替代原 title/category
occurred_at      DATETIME             NOT NULL
payload          JSON                          -- 严格校验
created_at / updated_at
```

移除字段：`title`、`category`、`raw_input`。

### fields_schema 结构

```json
{
  "fields": [
    {
      "key": "distance",
      "label": "距离",
      "type": "number",
      "required": true,
      "unit": "km",
      "min": 0,
      "decimals": 2
    },
    {
      "key": "comment",
      "label": "备注",
      "type": "text",
      "required": false,
      "multiline": true,
      "max_length": 500,
      "system": true
    }
  ]
}
```

### 支持的字段类型

| 类型 | 说明 | 特有约束 |
|------|------|----------|
| number | 数值 | min, max, decimals, unit |
| select | 单选 | options (string[]) |
| multi_select | 多选 | options, max_select |
| text | 文本 | max_length, multiline |
| boolean | 开关 | 无 |
| rating | 评分 | max (默认 5) |

### 校验规则

**模板 schema 校验**（`validate_fields_schema`）：
- 用户自定义字段上限 20 个
- key 必须匹配 `^[a-z][a-z0-9_]*$`
- `comment` 为保留 key，仅系统字段可使用
- 各类型有专属约束校验（如 select 必须有 options）

**打卡 payload 校验**（`validate_payload`，严格模式）：
- required 字段不可缺失
- 值必须符合类型约束（number 范围、select 选项、text 长度等）
- 不允许出现 schema 中未定义的字段

### 服务层

**`backend/services/template_validator.py`**
- `validate_fields_schema(schema) -> (ok, error_msg)`：校验模板定义
- `inject_default_field(schema) -> schema`：自动注入 comment 字段
- `validate_payload(schema, payload) -> (ok, errors)`：严格校验打卡数据

### 路由层

**`backend/routes/checkin_template.py`** (`/api/checkin-templates`)
- `GET /` — 列出当前用户模板
- `GET /<id>` — 获取模板详情
- `POST /` — 创建模板（校验 + 注入 comment + 唯一性检查）
- `PUT /<id>` — 更新模板
- `DELETE /<id>` — 删除模板（有打卡引用时拒绝）

**`backend/routes/checkin.py`** 变更
- 创建打卡必须传 `template_id`，`payload` 按模板校验
- 更新打卡允许切换模板

### 初始化脚本

**`backend/scripts/seed_default_templates.py`**
- 为指定用户初始化预设模板（当前预设："跑步"模板）
- 幂等：已有同名模板则跳过

---

## 与原设计文档的差异

原 `docs/design/2026-04-21-todo-checkin-ai.md` 中定义的 Checkin 模型使用 `title/category/raw_input`。本次变更为模板机制后：

- `title` → 由模板 `name` 替代（打卡展示时通过 `template.name`）
- `category` → 由模板 `id` 替代（类型分组通过 `template_id` 过滤）
- `raw_input` → 移除（AI 提议路径中的原文存在 `ai_proposals.raw_input`）
- `payload` → 从自由 JSON 升级为 schema 严格校验

AI 模块的 `ai.py` 路由和 `entry_service.py` 需要后续适配模板机制（当前 AI 提议仍产出旧格式）。
