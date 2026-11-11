# 部署指南

## 环境要求

- Node.js 18+
- npm

## 部署步骤

### 1. 克隆代码

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 文件，填写 DATABASE_URL、JWT_SECRET_KEY、PORT
```

### 3. 安装依赖并启动

```bash
npm ci
npx prisma generate
npm start
```

或直接使用启动脚本（含 pm2 管理）：

```bash
./run.sh
```

`run.sh` 自动完成：安装 pm2（如未安装）→ `npm ci` → `prisma generate` → `pm2 start` → 健康检查。

应用将在 `http://0.0.0.0:<PORT>` 运行（默认 7001）。

## 生产环境部署

### PM2 进程管理

项目使用 PM2 管理 Node.js 进程，配置见 `ecosystem.config.cjs`。

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs gouye

# 重启
pm2 restart gouye

# 停止
pm2 stop gouye
```

每日凌晨 4:00 自动重启，防内存泄漏。

### 自动部署（Git Hook 模式）

`scripts/watch-pull.sh` 实现 cron 驱动的自动部署：

1. `git pull --ff-only` 拉取最新代码
2. 检测到 `package.json` / `package-lock.json` 变更 → `npm ci` + `pm2 restart`
3. 检测到 `prisma/schema.prisma` 变更 → `prisma generate` + `pm2 restart`
4. 其他文件变更 → 自动生效（tsx watch 模式）

配置 cron：

```bash
# 每分钟检查并自动部署
* * * * * /path/to/project/scripts/watch-pull.sh >> /path/to/project/log/watch-pull.log 2>&1

# 每日凌晨重启（防内存泄漏）
0 4 * * * pm2 restart gouye
```

参考 `scripts/crontab.example`。

## 生产环境建议

- 使用 Nginx 反向代理 + HTTPS
- 定期备份 SQLite 数据库文件（默认 `prisma/dev.db`）
- 设置足够强度的 `JWT_SECRET_KEY`（推荐 `openssl rand -hex 32` 生成）
- 监控 PM2 进程状态和内存使用

## 常见问题排查

### 数据库连接失败

检查 `.env` 中的 `DATABASE_URL` 格式是否为 `file:./xxx.db`，`prisma/` 目录下数据库文件是否存在且可写。

### Prisma Client 未生成

```bash
npx prisma generate
```

### 端口被占用

修改 `.env` 中的 `PORT` 值，或在启动时指定：

```bash
PORT=9000 npm start
```

### PM2 进程异常

```bash
pm2 logs gouye --lines 50   # 查看最近 50 行日志
pm2 restart gouye            # 重启
pm2 delete gouye && ./run.sh # 完全重建
```
