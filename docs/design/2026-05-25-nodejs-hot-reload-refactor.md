# Node.js 热加载架构重构 设计文档

**核心诉求：** 将 Flask 后端重构为 Node.js (TypeScript + Prisma)，通过定时 git pull + 自动重启实现"部署即生效"，无需人工干预。

**日期：** 2026-05-25

## 背景

现有系统是 Flask + SQLAlchemy + MySQL 的个人应用（记账、TODO、打卡、AI 周报）。部署在云端，运维方式是定时 cron 执行 git pull。当前 Flask 需要手动重启才能加载新代码，用户希望 pull 后自动生效。

不做的代价：每次代码更新都需要手动 SSH 进去重启，个人项目维护成本高。

## 方案

**选择：Node.js + TypeScript + Prisma + tsx --watch + pm2**

核心思路：
- `pm2` 作为进程管理器保活 Node 进程
- `tsx --watch` 模式运行，检测到文件变化自动重启（< 1 秒）
- cron 每分钟执行 `git pull`，pull 到新代码 → 文件变化 → 自动重启 → 生效
- 前端静态文件由 Express 直接服务，无需重启即生效

**否决的替代方案：**
- **dynamic import 热加载（Gateway + Handler 分层）：** 零停机但实现复杂，TypeScript 模块缓存管理容易内存泄漏，对个人项目 overkill
- **gunicorn --reload（保持 Flask）：** 可行但不满足用户换技术栈的意愿
- **PHP：** 天然热更新但需要完全重学生态

## 功能范围

### 包含
- 全部 9 个 API 模块重写（user, category, transaction, tag, project, todo, checkin, checkin_template, ai）
- JWT 认证中间件（兼容现有 token，相同 secret）
- Prisma schema 对齐现有 MySQL 表结构（含多对多关联表）
- 前端静态文件服务
- pm2 配置 + 部署脚本（cron git pull + 自动重启）
- TODO 版本管理逻辑（TodoVersion 快照）
- Checkin 模板校验逻辑

### 不包含（本次迭代）
- 前端重构（保持现有 HTML/CSS/JS 不变）
- 新增功能
- 定时任务（周报生成，功能废弃）
- 数据库 migration（复用现有表，Prisma 用 db pull 对齐）
- CI/CD 流水线
- 单元测试（后续迭代补充，本次以接口兼容性为验收标准）

## 模块划分

```
backend-node/
├── src/
│   ├── app.ts                  # Express 入口 + 静态文件服务
│   ├── middleware/
│   │   └── auth.ts             # JWT 认证（jsonwebtoken）
│   ├── routes/                 # API 路由（每个文件对应一个 Blueprint）
│   │   ├── user.ts
│   │   ├── category.ts
│   │   ├── transaction.ts
│   │   ├── tag.ts
│   │   ├── project.ts
│   │   ├── todo.ts
│   │   ├── checkin.ts
│   │   ├── checkin-template.ts
│   │   └── ai.ts
│   ├── services/
│   │   ├── ai-service.ts       # DeepSeek API 调用
│   │   ├── entry-service.ts    # 聚合查询
│   │   └── todo-versioning.ts  # 版本快照逻辑
│   ├── scheduler.ts            # (预留，本次不实现)
│   └── utils.ts                # 响应格式工具函数
├── prisma/
│   └── schema.prisma           # 数据库 schema（从现有 DB pull）
├── frontend/                   # 直接复制现有前端（符号链接或复制）
├── ecosystem.config.js         # pm2 配置
├── deploy.sh                   # 部署脚本（cron 调用）
├── package.json
├── tsconfig.json
└── .env                        # 数据库连接等配置
```

### 接口契约

所有 API 保持与现有 Flask 完全一致：
- 路由前缀：`/api/...`
- 响应格式：`{ code: 0, data: ..., message: "..." }` 或 `{ code: 1, message: "错误信息" }`
- JWT 认证：Bearer token，payload 含 `identity`（user_id）
- 日期格式：ISO 8601

### 部署架构

```
┌─────────────────────────────────────┐
│  cron (每分钟)                        │
│  deploy.sh:                          │
│    cd /app && git pull               │
│    # tsx --watch 自动检测重启         │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  pm2                                 │
│  └── tsx --watch src/app.ts          │
│       ├── Express (port 7001)        │
│       ├── API routes (/api/*)        │
│       ├── Static files (frontend/)   │
│       └── node-cron (预留)           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  MySQL (现有实例，不变)               │
│  └── Prisma Client 连接              │
└─────────────────────────────────────┘
```

**热更新机制：**
1. cron 每分钟执行 `git pull`
2. 如果有文件变化，`tsx --watch` 检测到并自动重启 Node 进程
3. pm2 保证进程崩溃时自动恢复
4. 前端静态文件：git pull 后下次请求直接读新文件，无需重启

**每日定时重启（兜底）：**
- cron 每天凌晨 4 点执行 `pm2 restart all`
- 防止长时间运行的内存泄漏

## 测试与验收

### 测试覆盖范围
- 每个 API 端点的请求/响应格式与旧系统一致
- JWT 认证流程（登录 → 获取 token → 访问受保护接口）
- 数据库 CRUD 操作正确性
- 多对多关联（tag 关联）正确性
- 热更新验证（改代码 → 自动重启 → 新逻辑生效）

### 验收标准
- [ ] 所有 API 端点返回格式与旧系统一致（用相同请求对比响应）
- [ ] 现有前端页面功能正常（TODO、打卡、记账）
- [ ] JWT token 兼容（旧系统签发的 token 新系统能用）
- [ ] git pull 后 1 分钟内新代码自动生效
- [ ] pm2 保活：kill 进程后自动恢复

## 风险与假设

| 假设 | 如果错了 |
|------|---------|
| 现有 MySQL 表结构可以直接被 Prisma introspect | 如果有不兼容类型，需要手动调整 schema |
| tsx --watch 在生产环境稳定 | 如果不稳定，回退到 `tsc --build` + nodemon |
| JWT secret 相同则 token 互通 | 如果 Flask 用了特殊编码方式，需要对齐 |
| 前端不依赖 Flask 特有的响应头 | 如果依赖，需要在 Express 中补充 |
| pm2 + tsx --watch 不冲突 | 如果冲突，改用 pm2 的 --watch 功能替代 |
