# 系统架构

## 概览

GouYe 是一个个人生活管理应用，采用 Express + TypeScript 后端 + 原生 JS 前端，数据层使用 Prisma ORM 操作 SQLite。

```
浏览器 (PC / Mobile)
    │
    ├── /              → frontend-pc/     (PC SPA)
    ├── /legacy        → frontend/        (移动端 Legacy SPA)
    └── /api/*         → Express 路由      (RESTful API)
                               │
                          Prisma Client
                               │
                      SQLite (prisma/*.db)
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js (ESModules) |
| 语言 | TypeScript |
| Web 框架 | Express 4 |
| ORM | Prisma 5 |
| 数据库 | SQLite |
| 认证 | JWT (jsonwebtoken) + bcryptjs |
| 运行器 | tsx (开发/生产) |
| 进程管理 | PM2 |
| 测试 | Vitest + Supertest |
| 前端 (PC) | Vanilla JS + Tailwind CSS CDN + Font Awesome |
| 前端 (Mobile) | Vanilla JS + Tailwind CSS CDN + Web Components |

## 模块划分

| 模块 | 路由文件 | 职责 | 数据表 |
|------|----------|------|--------|
| 用户 | `src/routes/user.ts` | 注册、登录、个人信息 | `users` |
| 收支 | `src/routes/transaction.ts` | 记账 CRUD、统计汇总 | `transactions`, `transaction_tags` |
| 分类 | `src/routes/category.ts` | 收支分类管理 | `categories` |
| 标签 | `src/routes/tag.ts` | 通用标签管理（跨模块复用） | `tags` |
| 项目 | `src/routes/project.ts` | 项目管理（Work/Life 域） | `projects` |
| TODO | `src/routes/todo.ts` | 任务 CRUD、状态流转、版本快照 | `todos`, `todo_versions`, `todo_tags` |
| 打卡模板 | `src/routes/checkin-template.ts` | 模板定义、schema 管理 | `checkin_templates` |
| 打卡 | `src/routes/checkin.ts` | 基于模板的结构化打卡 | `checkins`, `checkin_tags` |

## 核心基础设施

| 文件 | 职责 |
|------|------|
| `src/app.ts` | Express 应用组装：CORS、JSON 解析、路由挂载、静态文件、SPA fallback |
| `src/prisma.ts` | Prisma Client 单例 |
| `src/types.ts` | Request 类型扩展（`userId?`） |
| `src/utils.ts` | 统一响应格式（`successResponse` / `errorResponse`） |
| `src/middleware/auth.ts` | JWT 认证中间件，提取 `req.userId` |

## 服务层

| 文件 | 职责 |
|------|------|
| `src/services/template-validator.ts` | 打卡 payload 校验（必填、类型、select 选项、严格模式） |
| `src/services/todo-versioning.ts` | TODO 版本快照生成、变更摘要计算 |

## 前端

- **PC 端** (`frontend-pc/`)：主力界面，SPA 架构（hash 路由），4 个页面（需求/TODO/记账/打卡），响应式布局
- **移动端** (`frontend/`)：Legacy 界面，通过 `/legacy` 路径访问，包含交易列表、AI 输入弹窗等组件

前端均为纯静态文件，由 Express 直接 serve，无需单独部署。

## 部署

- **启动**：`./run.sh`（安装 pm2、`npm ci`、prisma generate、pm2 start）
- **自动部署**：cron 每分钟触发 `scripts/watch-pull.sh`，检测 git 变更后自动 `npm ci` + pm2 restart
- **进程守护**：PM2 管理 Node.js 进程，每日凌晨 4:00 自动重启防内存泄漏
- **无 Docker**：当前部署在裸机上

## 当前未包含的模块

- **AI 服务**：自然语言解析和自动周报生成功能暂未实现
- **定时任务**：APScheduler 调度器未集成，周报生成依赖手动触发
