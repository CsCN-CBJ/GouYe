# 测试策略

## 测试框架

- **测试运行器**: Vitest
- **HTTP 测试**: Supertest（直接启动 Express app 实例，不走网络）
- **数据库**: 真实 SQLite 测试库（`TEST_DATABASE_URL`），不做 mock

## 数据库策略

所有测试共享一个真实的 SQLite 测试数据库文件（`prisma/test.db`）。每个测试文件运行前，`tests/setup.ts` 会清理所有表：

1. `PRAGMA foreign_keys = OFF` 禁用外键约束
2. 按从子到父的顺序清空 12 张表（`checkin_tags`, `checkins`, `checkin_templates`, `todo_versions`, `todo_tags`, `todos`, `projects`, `transaction_tags`, `transactions`, `categories`, `tags`, `users`）
3. `PRAGMA foreign_keys = ON` 恢复外键约束

这样保证每个测试文件从一个干净的状态开始，且不存在 mock 与真实数据库行为不一致的风险。

## 运行命令

```bash
# 运行所有测试
npm test

# 运行单个模块测试
npx vitest run tests/todo.test.ts

# 监听模式（开发时）
npx vitest
```

## 测试配置

`vitest.config.ts` 中的关键配置：

- `globals: true` — 无需导入 `describe`/`it`/`expect`
- `environment: 'node'`
- `sequence.concurrent: false` — 测试文件顺序执行，避免数据库竞争
- `testTimeout: 10000` — 单测试 10 秒超时
- 通过 `env` 注入 `JWT_SECRET_KEY` 和 `TEST_DATABASE_URL`

## 测试结构

```
tests/
├── setup.ts          # 全局 setup/teardown，负责数据库清理
├── helpers.ts        # 测试辅助函数（创建用户、分类、标签、项目、模板等）
├── user.test.ts      # 用户模块（9 tests）
├── transaction.test.ts # 收支记录模块（20 tests）
├── category.test.ts  # 分类模块（18 tests）
├── tag.test.ts       # 标签模块（16 tests）
├── project.test.ts   # 项目模块（17 tests）
├── todo.test.ts      # TODO 模块（26 tests）
├── checkin-template.test.ts # 打卡模板模块（14 tests）
└── checkin.test.ts   # 打卡模块（16 tests）
```

共 **138 个测试用例**，覆盖 8 个模块。

## 测试辅助

`tests/helpers.ts` 提供通用辅助函数：

- `createAuthenticatedUser(username, password)` — 注册 + 登录，返回 user 对象和 auth header
- `createCategory(user, overrides)` — 创建分类
- `createTag(user, overrides)` — 创建标签
- `createProject(user, overrides)` — 创建项目
- `createCheckinTemplate(user, overrides)` — 创建打卡模板
- `authHeader(token)` — 生成 Authorization header

所有 HTTP 请求使用 `supertest(app)`，结果验证使用 `expect` 断言。

## 覆盖范围

| 模块 | 测试重点 |
|------|----------|
| 用户认证 | 注册（成功/重复/缺少字段）、登录（成功/错误密码/不存在用户）、JWT 验证 |
| 收支记录 | CRUD 操作、分页、按日期/分类/标签筛选、统计汇总、tag 关联 |
| 分类 | CRUD 操作、类型过滤、有交易时禁止删除（409） |
| 标签 | CRUD 操作、同用户唯一性、跨用户同名不冲突、无认证拒绝 |
| 项目 | CRUD 操作、归档/恢复、领域过滤、状态过滤 |
| TODO | CRUD 操作、状态流转（6 条合法边 + 非法边）、版本快照、分组查询 |
| 打卡模板 | CRUD 操作、schema 校验、有打卡时禁止删除 |
| 打卡 | CRUD 操作、payload 校验（必填/类型/select 选项/未定义字段）、跨模版权限隔离 |

## 测试注意事项

- 测试依赖真实 SQLite 连接，运行前确保 `TEST_DATABASE_URL` 指向的数据库文件可写
- 测试不模拟 JWT，直接使用真实 token 进行认证测试
- 跨用户权限隔离已验证（如 user A 不能更新 user B 的资源）
