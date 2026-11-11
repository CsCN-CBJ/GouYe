# TODO 接口去除静默建项目

**日期**: 2026-06-11
**版本**: v1.8.0
**性质**: API 行为收紧 + skill 调用方式调整

## 核心诉求

现在 `POST /api/todos` 和 `PUT /api/todos/:id` 传 `project_name` 时，后端 `findOrCreateProject` 会按 `(userId, domain, name)` 找不到就静默建项目。问题：

1. 拼写错误就会多出一个项目（"工作a" vs "工作"），前端 / 用户没有任何提示
2. skill 调用方误传名字 → prod 库慢慢攒垃圾项目
3. "建项目"是有语义的动作，应该走显式接口而不是 todo 接口的副作用

## 方案

**TODO 接口只接 `project_id`，不再接受 `project_name`。**「建项目」统一走 `POST /api/projects`。前端流程变成：用户在表单里选项目（已有的）或显式点"新建项目"按钮 → 调 `POST /api/projects` 拿 id → 再调 `POST /api/todos`。

### 后端改动

#### TODO 路由 (src/routes/todo.ts)

- 删 `findOrCreateProject` 函数
- `POST /api/todos`:
  - body 移除 `project_name` 解析
  - 传了 `project_name` → 400 `project_name is no longer supported, create project first via POST /api/projects`
  - 只接受 `project_id`：传了就按现有逻辑校验存在性（不存在 404），不传就 projectId = null
- `PUT /api/todos/:id`:
  - 同上：删 `project_name` 处理分支，传了就 400
  - 只接受 `project_id`

#### 项目路由 (src/routes/project.ts) —— 顺带修潜伏 bug

**bug 背景**：现在 `POST /api/projects` L62 用 `findFirst({ userId, domain })` 做重复校验（只查 domain 不查 name），而数据库 schema 是 `@@unique(userId, domain, name)`。代码层比 schema 严格，导致每个 domain 只能成功建一次项目。

**为什么之前没被触发**：用户能在同 domain 下"加过好几个项目"，是因为这些项目全是 `findOrCreateProject`（todo.ts L106）通过 todo 接口的 `project_name` 静默建的——它走的是 `prisma.project.create` 直连，绕过 L62 校验，只受数据库三元唯一约束限制。`POST /api/projects` 这条路径**从未被用户成功调用过同 domain 第二次**（前端 grep 也确认没人调）。这次要把静默建项目堵掉、强制走 `POST /api/projects`，这个潜伏 bug 必须先修，否则用户无法"先建项目"。

**改动**：
- 查重改为 `(userId, domain, name)` 三元组
- 已存在 → 返回 409 `project with this name already exists in domain` 同时把已有项目数据带回来（方便前端直接拿 id 复用）：

```json
// 409 响应体
{
  "code": 1,
  "message": "project with this name already exists in domain",
  "data": { "id": 42, "name": "AI 提效", "domain": "work", ... }
}
```

> 项目约定失败响应是 `{code:1, message}` 不带额外字段。这里破例带 `data` 是为了前端"输项目名→重名→复用已有 id"省一次 GET（用户已确认）。

### Skill 改动

#### skill/scripts/api_client.py

- `create_todo(...)`:
  - 删除 `project_name` 参数
  - 删除 `elif project_name:` 分支（L298-299）
- 新增（如果还没有）独立 helper `create_project(name, domain)` 直接调 `POST /api/projects`
- 文档字符串：去掉"按名称查找/自动创建项目"的描述

#### skill/references/todo.md

- L7 表格删 `project_name?`
- L22 示例 body 删 `project_name`
- L29 那段"`project_id` 和 `project_name` 二选一……自动创建"整段删，改成：

> 创建项目走 `POST /api/projects`（详见 references/project.md），todo 只接 `project_id`。

#### skill/SKILL.md

- L53 那条 "**project_name 自动创建**" feature 描述删除或改成"建项目走 `POST /api/projects`"
- L127 表格 "创建新项目" 行改：`POST /api/projects` 直接建

### 前端

grep 确认 `frontend-pc` / `frontend` 当前**完全没有使用 `project_name`**，所以前端不需要改。

> 如果未来前端要做"输入项目名自动建"的 UX，调用顺序：先 `POST /api/projects` → 拿 id → 再 `POST /api/todos`。

### 数据迁移

不需要。这是 API 行为变更，不动 schema。

### 涉及文件清单

| 类别 | 文件 | 改动 |
|---|---|---|
| 后端路由 | `src/routes/todo.ts` | 删 findOrCreateProject、POST/PUT 拒绝 project_name |
| 后端路由 | `src/routes/project.ts` | POST 查重改为 (userId, domain, name)，409 带 data |
| 后端测试 | `tests/todo.test.ts` | 删 L75 "auto-creates project" 用例，加"传 project_name 返回 400"用例 |
| 后端测试 | `tests/project.test.ts`（如有） | 加"同 domain 同 name 重复 → 409 带 data"、"同 domain 不同 name → 都能建"用例 |
| skill | `skill/scripts/api_client.py` | create_todo 去掉 project_name；保证有 create_project helper |
| skill | `skill/references/todo.md` | 删 project_name 字段说明 |
| skill | `skill/references/project.md` | 补充"先建项目再建 todo"流程说明（如缺） |
| skill | `skill/SKILL.md` | L53 / L127 调整 |
| skill 测试 | `skill/tests/test_todo.py` | L23 / L48 改成先 create_project 再 create_todo(project_id=...) |
| 文档 | `docs/api.md` | todos POST/PUT 字段说明删 project_name；projects POST 说明 409 行为 |
| 元 | `CHANGELOG.md` | v1.8.0 条目 |
| 元 | `package.json` | version → 1.8.0 |

## 测试与验收

### 后端测试用例

| ID | 用例 | 期望 |
|---|---|---|
| T1 | POST /todos 传 project_id（存在） | 201，todo.projectId 正确 |
| T2 | POST /todos 传 project_id（不存在） | 404 `project not found` |
| T3 | POST /todos 传 project_name | 400 `project_name is no longer supported, create project first via POST /api/projects` |
| T4 | POST /todos 不传项目字段 | 201，projectId = null |
| T5 | PUT /todos/:id 传 project_name | 400（同 T3 文案） |
| T6 | PUT /todos/:id 传 project_id=null | 200，解绑项目 |
| T7 | PUT /todos/:id 传 project_id=不存在 | 404 |
| P1 | POST /projects 同 domain 同 name 第二次 | 409，body.data 含已有项目 id |
| P2 | POST /projects 同 domain 不同 name | 两个都 201 成功 |
| P3 | POST /projects 不同 domain 同 name | 两个都 201 成功 |

### skill 测试用例

| ID | 用例 | 期望 |
|---|---|---|
| S1 | `create_todo(..., project_name=...)` | TypeError（参数已删）或者 API 400 |
| S2 | `create_project("x", "work")` 后 `create_todo(..., project_id=<刚拿的>)` | 201 |
| S3 | 同 domain 同 name 调 `create_project` 第二次 | 409，能从响应拿到已存在项目 id |

### 验收 checklist

应该消失：
- [ ] `findOrCreateProject` 函数已从代码库删除
- [ ] `src/routes/todo.ts` POST/PUT 不再接受 `project_name`
- [ ] skill `api_client.create_todo` 签名不再有 `project_name` 参数
- [ ] skill 文档中"自动创建项目"相关描述全部清理
- [ ] `tests/todo.test.ts` 不再有 "auto-creates project" 用例

应该存在:
- [ ] `POST /api/todos` 传 `project_name` 返回 400 + 明确错误信息
- [ ] `POST /api/projects` 同 (domain, name) 重复返回 409
- [ ] `POST /api/projects` 同 domain 不同 name 都能建（修复 L62 bug）
- [ ] skill `create_project` helper 可用
- [ ] `npm test` + `npm run test:skill` 全过
- [ ] CHANGELOG / package.json 版本 → 1.8.0

## 不包含

- 前端 UX 改造（前端目前没用 project_name，无需动）
- 项目重命名 / 合并的能力
- 历史脏数据（之前可能因拼写产生的重复项目）的清理脚本——如果你需要查/合并，单独提需求
- `POST /api/projects` 响应 schema 之外的其他改动

## 风险与假设

| 风险 | 应对 |
|---|---|
| 第三方 / 旧脚本 / 旧 mobile 端还在用 `project_name` | 400 错误信息明确提示新流程，看日志一周决定要不要再多做引导 |
| 409 带 data 破坏"失败响应不带额外字段"的项目约定 | 用户已拍板：破例带 data，省前端一次 GET |
| 前端某个我没 grep 到的角落用了 project_name | 这次实现前 codebuddy 再全仓搜一次，有就一并改；没有就过 |

## 实现步骤（给 codebuddy）

1. `src/routes/todo.ts`：删 `findOrCreateProject`；POST 收到 `project_name` 返 400；PUT 同处理
2. `src/routes/project.ts`：POST 查重改 `(userId, domain, name)`；同 name 409 带 data
3. `tests/todo.test.ts`：删原 "auto-creates project" 用例，加 T1-T7
4. `tests/project.test.ts`：加 P1-P3（如文件不存在则新建）
5. `npm test` 全过
6. `skill/scripts/api_client.py`：`create_todo` 删 project_name；确认/补 `create_project` helper
7. `skill/references/todo.md`、`skill/references/project.md`、`skill/SKILL.md` 同步
8. `skill/tests/test_todo.py`：S1-S3
9. `npm run test:skill` 全过
10. `docs/api.md` 文字同步
11. `CHANGELOG.md` 加 v1.8.0 条目（描述：todo 接口不再静默建项目；POST /api/projects 查重修复）
12. `package.json` → 1.8.0
