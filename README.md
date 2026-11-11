# GouYe (狗爷) All-in-One APP

个人生活管理应用，集成记账、需求管理、TODO List 和打卡记录功能。

## 技术栈

- **后端**: Express + TypeScript + Prisma + SQLite
- **前端**: 原生 HTML/CSS/JS（PC 端 + 移动端两套界面）
- **认证**: JWT（jsonwebtoken + bcryptjs）
- **测试**: Vitest + Supertest
- **部署**: PM2 + cron 自动部署

## 快速开始

1. 安装依赖：
   ```bash
   npm ci
   ```

2. 配置环境变量（参考 `.env.example`）：
   ```bash
   cp .env.example .env
   # 编辑 .env 填写 DATABASE_URL、JWT_SECRET_KEY、PORT
   ```

3. 生成 Prisma Client：
   ```bash
   npx prisma generate
   ```

4. 启动开发服务器：
   ```bash
   npm run dev
   ```

应用将在 `http://localhost:7001` 运行。

## 项目结构

```
.
├── src/                  # 后端源码 (TypeScript)
│   ├── app.ts            # Express 应用入口
│   ├── prisma.ts         # Prisma Client 单例
│   ├── types.ts          # 全局类型扩展
│   ├── utils.ts          # 响应工具函数
│   ├── middleware/        # 中间件
│   │   └── auth.ts       # JWT 认证中间件
│   ├── routes/           # API 路由
│   │   ├── user.ts       # 用户注册/登录
│   │   ├── transaction.ts # 收支记录 CRUD
│   │   ├── category.ts   # 分类管理
│   │   ├── tag.ts        # 标签管理
│   │   ├── project.ts    # 项目管理
│   │   ├── todo.ts       # TODO CRUD + 状态流转 + 版本管理
│   │   ├── checkin-template.ts # 打卡模板
│   │   └── checkin.ts    # 打卡记录
│   └── services/         # 业务逻辑
│       ├── template-validator.ts # 打卡 payload 校验
│       └── todo-versioning.ts    # TODO 版本快照
├── frontend-pc/          # PC 前端 (SPA)
│   ├── index.html
│   ├── css/app.css
│   └── js/
│       ├── api.js        # API 请求封装
│       ├── router.js     # 路由管理
│       ├── app.js        # 应用入口
│       └── pages/        # 页面模块
├── frontend/             # 移动端前端 (Legacy)
├── prisma/               # 数据库
│   └── schema.prisma     # Prisma Schema
├── sql/                  # 历史 MySQL 建表脚本（不再使用）
├── tests/                # 集成测试 (Vitest)
│   ├── setup.ts          # 数据库清理
│   ├── helpers.ts        # 测试辅助函数
│   └── *.test.ts         # 各模块测试
├── scripts/              # 部署脚本
│   ├── run.sh            # 启动脚本
│   ├── watch-pull.sh     # cron 自动部署
│   └── crontab.example   # cron 配置示例
└── docs/                 # 项目文档
```

## 功能模块

1. **记账** — 收支记录、分类管理、标签系统，按日期/分类/标签筛选
2. **需求管理** — Work 域 TODO，按项目分组视图
3. **TODO List** — Life 域 TODO，状态流转（pending/done/cancelled）+ 版本快照
4. **打卡** — 基于模板的结构化打卡（跑步、健身等），schema 校验

## 文档索引

- [架构概览](docs/architecture/overview.md)
- [API 文档](docs/api.md)
- [部署指南](docs/deployment.md)
- [配置说明](docs/config.md)
