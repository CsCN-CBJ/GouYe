# GouYe（狗爷）All-in-One

个人生活管理应用：**记账、待办需求、打卡记录**，一个网页全搞定。

## 能做什么

### 💰 记账

- 收入 / 支出分开记录，金额精确到分
- 分类体系：收入、支出各自维护一套分类
- 多标签：一笔账可以打多个标签，便于横向归类
- 多维筛选：类型、分类、标签、日期区间、关键词
- 汇总统计：按时间段汇总收支

### ✅ 待办 & 需求

- 两个域：`work`（工作需求）、`life`（日常待办）
- 按项目分组展示，项目可设颜色，一眼区分
- 状态流转：未开始 → 进行中 → 阻塞 → 已完成 / 已取消（可互相转换）
- **版本快照**：每次修改自动留档，可查看历史版本与差异
- 支持标签、归档、关键词搜索

### 🏃 打卡

- **模板驱动**：先定义模板（字段 + 类型），打卡时按模板填
- 支持 6 种字段类型：数字、单选、文本、布尔、日期、数组（可嵌套）
- 提交时严格校验字段类型与取值范围，脏数据进不来
- 适合跑步、健身、作息等需要长期追踪的记录

### 🖥 双端界面

- **PC 端**：单页应用，侧边栏 + 卡片式列表，适合整理和回顾
- **移动端**：单页版，手机浏览器直接打开就能记

## 快速开始

```bash
npm ci                      # 安装依赖
cp .env.example .env        # 配置环境变量
# 编辑 .env：填 JWT_SECRET_KEY，按需改 PORT / DATABASE_URL
npx prisma generate         # 生成 Prisma Client
npm run dev                 # 启动（默认 http://localhost:7001）
```

数据库默认用 SQLite 单文件（`file:./dev.db`），**不需要额外装数据库服务**。

## 技术栈

| 层 | 选型 |
|---|---|
| 后端 | Express + TypeScript |
| 数据 | Prisma + SQLite |
| 认证 | JWT（jsonwebtoken + bcryptjs） |
| 前端 | 原生 HTML / CSS / JS（无构建步骤） |
| 测试 | Vitest + Supertest |
| 部署 | PM2 + cron 自动部署 |

## 目录结构

| 目录 | 放什么 |
|---|---|
| `src/` | 后端源码（路由、中间件、业务逻辑） |
| `frontend/` | 移动端页面 |
| `frontend-pc/` | PC 端单页应用 |
| `prisma/` | 数据模型定义（schema） |
| `tests/` | 集成测试 |
| `docs/` | 设计与接口文档 |
| `scripts/` | 部署脚本 |
| `sql/` | 早期 MySQL 建表脚本（已停用，仅存档） |

## 文档

- [API 文档](docs/api.md)
- [架构概览](docs/architecture/overview.md)
- [部署指南](docs/deployment.md)
- [配置说明](docs/config.md)
- [版本更新日志](CHANGELOG.md)
