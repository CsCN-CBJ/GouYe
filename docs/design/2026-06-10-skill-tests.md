# Skill 集成测试方案

**日期**: 2026-06-10
**范围**: 为 `skill/scripts/api_client.py` 与 `skill/scripts/daily_check.py` 建立可持续维护的测试套件
**性质**: 新增测试基础设施，不改业务代码

## 核心诉求

1. 当前 `skill/scripts/test_api.sh` 只是 9 个浅烟测（curl + grep），没覆盖 create/update/delete、错误路径、字段断言
2. v1.5.0 BREAKING 已落地（`/status`、`/archive`、`/unarchive` 删除），skill 必须有测试防止下次类似改造把 skill 调用方搞坏
3. 需要 codebuddy 持续维护 skill 时有"绿/红"信号

## 背景

| 资产 | 说明 |
|------|------|
| `skill/scripts/api_client.py` | 36 个公开函数，封装后端 9 个模块 |
| `skill/scripts/daily_check.py` | 工作日打卡三件套检查脚本 |
| `skill/scripts/test_api.sh` | 现状：9 个 GET/POST 浅烟测，覆盖不足 |
| `tests/`（后端 vitest） | 8 文件 / 146 测试，已绿，可作为对照 |
| `.env.test` | 含本地测试库 `DATABASE_URL`、`JWT_SECRET_KEY`、`PORT` |

## 方案

### 一、目录结构

```
skill/tests/
├── README.md
├── conftest.py            # pytest fixtures：测试库环境、用户登录、清理
├── run.sh                 # 一键入口：起后端 + pytest + 关后端
├── requirements.txt       # pytest, requests, python-dotenv
├── test_user.py
├── test_category.py
├── test_transaction.py
├── test_tag.py
├── test_todo.py           # 含 v1.5.0：status 走 PUT
├── test_project.py        # 含 v1.5.0：status 走 PUT
├── test_checkin_template.py
├── test_checkin.py
├── test_date_utils.py
└── test_daily_check_smoke.py
```

测试运行入口：根 `package.json` 加 `"test:skill": "bash skill/tests/run.sh"`，与 `npm test` 并列。

### 二、测试基础设施

#### `run.sh` 流程

```bash
#!/usr/bin/env bash
set -euo pipefail
# 1. 校验 .env.test 存在且含必要键
# 2. 启动 Express（NODE_ENV=test，端口 7099，加载 .env.test）
# 3. wait-for: curl /api 直到 200 / 最多 30s
# 4. cd skill && pip install -r tests/requirements.txt -q
# 5. 设置 GOUYE_API_BASE=http://localhost:7099
# 6. pytest skill/tests/ -v --tb=short
# 7. trap EXIT 杀后端进程
```

#### `conftest.py` 关键 fixtures

| Fixture | 作用域 | 用途 |
|---------|--------|------|
| `api_base_url` | session | 从 `GOUYE_API_BASE` 读 base URL |
| `client` | session | 注册并登录一个 `skill_test_<uuid>` 测试账号，注入到 `api_client` 模块的 token |
| `clean_db` | function | 每测试前清空相关表（参考后端 `tests/setup.ts`） |
| `tmp_category` / `tmp_project` / `tmp_template` | function | 常用资源工厂 |

#### 数据隔离

- 走本地测试库（`.env.test` 里的 `DATABASE_URL`），与后端 vitest 共享同一个测试库
- 每测试通过 `clean_db` fixture 独占清表（与后端 vitest 一致）

### 三、测试覆盖矩阵

每个 `api_client` 公开函数最少：

- **happy path**：正常入参 → 正确响应（断言关键字段、HTTP 200/201）
- **错误路径**：缺字段 / 非法值 / 404 / 跨用户隔离

#### 用例数量（按模块）

| 模块 | 用例数 | 重点 |
|------|--------|------|
| user | 6 | 注册成功/重复/缺字段；登录成功/错误密码/不存在 |
| category | 8 | CRUD + resolve；公共分类只读（v1.5.0） |
| transaction | 12 | CRUD + summary + 分页 + 跨用户隔离 |
| tag | 5 | CRUD + 同名冲突 |
| todo | 14 | CRUD + versions + 跨用户；v1.5.0 关键回归 |
| project | 8 | CRUD + 归档/恢复；v1.5.0 关键回归 |
| checkin_template | 8 | CRUD + 同名 409 + 关联禁删 409 + payload schema 校验 |
| checkin | 8 | CRUD + payload 校验 + 跨模板权限 |
| date_utils | 3 | 纯本地工具 |
| daily_check_smoke | 1 | 主流程不报错 + 输出 JSON |
| 合计 | 73 |  |

#### 关键 v1.5.0 回归用例

| ID | 用例 | 期望 |
|----|------|------|
| K1 | `client.update_todo(id, status='completed')` | PUT 200，DB status=completed，completed_at 自动设置 |
| K2 | `requests.post(f'{base}/api/todos/{id}/status', ...)` | 404（路由已删除） |
| K3 | `client.update_project(id, status='archived')` | PUT 200 |
| K4 | `requests.post(f'{base}/api/projects/{id}/archive', ...)` | 404 |
| K5 | `getattr(api_client, 'update_todo_status', None)` | None（函数已删除） |
| K6 | `getattr(api_client, 'archive_project', None)` | None（如未存在过则跳过） |

### 四、daily_check 烟测

`test_daily_check_smoke.py` 一条用例：

```
- fixture 准备测试打卡数据
- subprocess 跑 daily_check.py
- 断言 exit code 0
- 断言输出是合法 JSON
- 断言 JSON 含三个键：commute / lunch / off_work
```

### 五、删除现有 test_api.sh

`skill/scripts/test_api.sh` 直接删除，被新 pytest 全面替代。

## 涉及文件清单

| 类别 | 文件 | 改动 |
|------|------|------|
| 新建 | `skill/tests/README.md` | 跑法 + 依赖说明 |
| 新建 | `skill/tests/conftest.py` | fixtures |
| 新建 | `skill/tests/run.sh` | 一键入口 |
| 新建 | `skill/tests/requirements.txt` | pytest/requests/python-dotenv |
| 新建 | `skill/tests/test_*.py` | 10 个测试文件 |
| 修改 | `package.json` | 加 `"test:skill": "bash skill/tests/run.sh"` |
| 删除 | `skill/scripts/test_api.sh` | 被替代 |
| 修改（仅必要时）| `skill/scripts/api_client.py` | 让 token 可注入（最小测试 hook，保持向后兼容） |
| 修改 | `CHANGELOG.md` | v1.6.x 加测试基础设施条目 |

## 测试与验收

### 测试本身验收

- `bash skill/tests/run.sh` 一键执行成功
- pytest 输出 73 个 passed 0 failed
- daily_check_smoke 跑通

### v1.5.0 回归保障

- K1-K6 全部通过
- `grep -rn '/api/todos/.*/status\\|/api/projects/.*/archive' skill/tests/` 应当只在断言 404 的用例里出现，不在调用代码里

## 验收 checklist

- [ ] `skill/tests/` 目录建成，10 个 test_*.py 文件齐全
- [ ] `npm run test:skill` 入口可用
- [ ] pytest 73 用例全过
- [ ] K1-K6 v1.5.0 回归用例全在
- [ ] `skill/scripts/test_api.sh` 已删除
- [ ] `npm test`（后端 vitest）146 用例不受影响
- [ ] CHANGELOG 更新

## 不包含

- skill 业务代码功能改动（除 token 可注入这种最小测试 hook 外）
- daily_check 业务逻辑改造（只烟测）
- mock / 契约测试（明确做集成测试）
- 性能/压测
- CI 配置（先本地能跑，CI 集成另开任务）
- 移动端 / 前端任何改动

## 风险与假设

| 风险 | 应对 |
|------|------|
| pytest 与 vitest 共享同一测试库可能竞态 | pytest 默认串行；run.sh 用独立端口 7099；不与 vitest 同时跑 |
| api_client.py 的 token 是模块级全局变量并发不安全 | 集成测试串行无问题 |
| daily_check 依赖 holiday-cn JSON 外部网络 | 烟测 mock 该网络调用或允许失败降级 |
| `.env.test` 不进 git，CI 需另外提供 | run.sh 校验存在；CI 集成另立任务 |

## 实现步骤（给执行者）

1. 建 `skill/tests/` 骨架（README/requirements.txt/conftest.py 框架）
2. 写 `run.sh`，本地跑通"启后端 → pytest → 关后端"
3. 实现 `test_user.py` + `test_tag.py`（最简单，作为 smoke）
4. 实现剩余 8 个模块测试
5. 实现 `test_daily_check_smoke.py`
6. 删除 `skill/scripts/test_api.sh`
7. `package.json` 加 `test:skill` 入口
8. `npm run test:skill` 全过 → `npm test` 不受影响
9. CHANGELOG 更新
