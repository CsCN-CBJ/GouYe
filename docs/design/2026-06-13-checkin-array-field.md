# 打卡模板支持 array 嵌套字段

**日期**: 2026-06-13
**版本**: v1.9.0
**性质**: 打卡 fields_schema 能力扩展，向后兼容

## 核心诉求

现在 `CheckinTemplate.fields_schema` 字段类型只有 `number / select / text / boolean / date`，全部扁平。健身打卡这种「一次训练 → N 个动作 → 每个动作 M 组 → 每组重量+次数」的结构装不进去。

加一种 `type: "array"`，用 `item_fields` 描述元素结构，**支持递归嵌套**（数组的元素里还能有数组）。

## 方案

### 1. fields_schema 新类型

新增 `array` 类型：

```jsonc
{
  "key": "sets",
  "type": "array",
  "label": "组数",
  "required": true,        // 数组本身是否必填（true 时不能缺/不能空数组）
  "min_items": 1,          // 可选
  "max_items": 50,         // 可选
  "item_fields": [         // 每个元素的字段定义（递归），不带 comment 系统字段
    { "key": "weight_kg", "type": "number", "label": "重量(kg)" },
    { "key": "reps", "type": "number", "label": "次数" }
  ]
}
```

`item_fields` 里的字段类型继续支持所有原有类型 + `array` 自身 → 递归。

### 2. 健身用例完整 schema

```jsonc
{
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
```

### 3. 对应 payload

```jsonc
{
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
```

### 4. 约束

| 约束 | 值 | 理由 |
|---|---|---|
| 递归深度上限 | **3 层**（顶层 fields → 第 1 层 array → 第 2 层 array → 第 3 层 array 内不允许再 array） | 防止 schema 写出无限嵌套打挂 validator；3 层够"训练→动作→组→子组"，已超出实际需求 |
| 单 array 元素数 | `max_items` 默认 200，硬上限 1000 | 防 payload 体积失控 |
| `comment` 保留 | 仅顶层注入，`item_fields` 不注入 | 数组元素不需要每个都有备注；要备注就在 item_fields 里显式声明一个 text 字段 |
| `array` 字段 `key` 限制 | 同 `comment` 不可用 | 复用现有保留字检查 |

### 5. 校验逻辑

`validateFieldsSchema` 改成**递归**：
- 遇 `type === 'array'`：必须有 `item_fields`（数组）；递归校验 item_fields；记录当前深度，超 3 层报错。
- `item_fields` 里禁用 `key === 'comment'`（保留字）。

`validatePayload` 改成**递归 + 路径化错误**：
- 遇 `type === 'array'`：
  - `required && (absent || (Array.isArray && length===0))` → `${path}: is required`
  - 不是数组 → `${path}: must be an array`
  - 长度超 `max_items` / 不足 `min_items` → 相应错误
  - 遍历元素，对每个 element 调 `validatePayloadInner(item_fields, element, ${path}[i])`
- 错误路径示例：`exercises[0].sets[1].weight_kg: must be a number`

### 6. 涉及文件

| 类别 | 文件 | 改动 |
|---|---|---|
| 后端 | `src/services/template-validator.ts` | 重写为递归；加 array 类型；加深度检查；加路径化错误 |
| 后端 | `src/routes/checkin-template.ts` | 无改动（已经调 validateFieldsSchema） |
| 后端 | `src/routes/checkin.ts` | 无改动（已经调 validatePayload） |
| 后端测试 | `tests/template-validator.test.ts`（新建） | V1-V12 |
| 后端测试 | `tests/checkin.test.ts` | 加 E1-E3 |
| skill | `skill/scripts/api_client.py` | 无（payload 透传） |
| skill | `skill/references/checkin.md` | 补 array 字段语法说明 + 健身示例 |
| 文档 | `docs/api.md` | fields_schema 字段类型表加 `array` 行 |
| 元 | `CHANGELOG.md` | v1.9.0 条目 |
| 元 | `package.json` | 1.8.0 → 1.9.0 |

**前端**：本次不动。frontend-pc 的打卡表单暂不渲染 array 字段（用户用 skill / 直接调 API 录入即可），等后端稳了再单独做前端 UX。

### 7. 数据迁移

不需要。fields_schema / payload 都是 JSON 列；现有扁平模板继续工作。

## 测试与验收

### Validator 单元测试

| ID | 用例 | 期望 |
|---|---|---|
| V1 | array 类型缺 `item_fields` | `validateFieldsSchema` 失败 |
| V2 | array 嵌套 4 层 | 失败：`exceed max nesting depth` |
| V3 | array 嵌套 3 层（合法） | 通过 |
| V4 | item_fields 里 key=comment | 失败：reserved field |
| V5 | array required=true 但 payload 缺该字段 | `exercises: is required` |
| V6 | array required=true 但 payload 给空数组 | `exercises: is required` |
| V7 | array 元素少于 min_items | `exercises: at least N items` |
| V8 | array 元素超过 max_items | `exercises: at most N items` |
| V9 | 元素里 number 字段传字符串 | `exercises[0].sets[1].weight_kg: must be a number` |
| V10 | 元素里多了未声明 key | `exercises[0].foo: unknown field` |
| V11 | 完整健身 payload（如上例） | 通过 |
| V12 | 旧扁平模板（pre-1.9） | 通过（向后兼容） |

### 端到端测试

| ID | 用例 | 期望 |
|---|---|---|
| E1 | POST /checkin-templates 创建健身模板 | 200，fields_schema 原样存回 |
| E2 | POST /checkins 完整健身 payload | 200 |
| E3 | POST /checkins 缺一组 reps | 400，错误含路径 `exercises[0].sets[1].reps: is required` |

### 验收 checklist

应该消失：
- [ ] template-validator 不再硬编码扁平字段假设
- [ ] payload 错误信息不再丢失嵌套路径

应该存在：
- [ ] `type: "array"` 在 createTemplate 阶段被正确接受/拒绝
- [ ] 嵌套 payload 校验产出带路径的错误
- [ ] 嵌套深度超 3 被拦
- [ ] 旧扁平模板/打卡完全不受影响（V12 + 现有测试全过）
- [ ] CHANGELOG / package.json 升到 1.9.0
- [ ] skill/references/checkin.md 有健身示例

## 不包含

- 前端打卡表单的 array 渲染 / 动态增删行 UX
- 健身专用统计（容量/PR/周报）；要做单独立项
- min_items / max_items 之外的复杂校验（如 unique、跨字段约束）
- 历史扁平 payload 自动迁移到 array（无需）

## 风险与假设

| 风险 | 应对 |
|---|---|
| 递归 validator 写错出无限循环 | 显式深度计数器；单测 V2 / V3 覆盖 |
| payload 体积爆 | max_items 硬上限 1000；现有 Express body limit 兜底 |
| 旧 schema 走新 validator 行为变化 | V12 + 现有 checkin/checkin-template 全部测试必须 0 failure |

## 实现步骤（给 codebuddy）

1. `src/services/template-validator.ts` 重写：
   - `validateFieldsSchema(schema, depth=0, maxDepth=3)` 递归
   - `validatePayload(schema, payload, pathPrefix='')` 递归，错误带路径
   - 顶层 `injectDefaultField` 行为保持
2. `tests/template-validator.test.ts` 新建，覆盖 V1-V12
3. `tests/checkin.test.ts` 加 E1-E3
4. `tests/checkin-template.test.ts` 现有用例必须 0 改动 0 失败（兼容性证明）
5. `npm test` 全过（serial：`--no-file-parallelism`）
6. `skill/references/checkin.md` 加 array 语法 + 健身示例段落
7. `docs/api.md` fields_schema 字段类型表加 `array` 行（含 item_fields/min_items/max_items）
8. `CHANGELOG.md` v1.9.0
9. `package.json` → 1.9.0
