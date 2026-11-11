# 配置说明

## 环境变量

通过 `.env` 文件管理，参考 `.env.example`：

| 变量名 | 必填 | 默认值 | 说明 |
|--------|------|--------|------|
| `DATABASE_URL` | 是 | - | Prisma SQLite 数据库文件路径，格式 `file:./dev.db`（相对 `prisma/` 目录） |
| `JWT_SECRET_KEY` | 是 | - | JWT 签名密钥，随机字符串 |
| `PORT` | 否 | `7001` | 服务监听端口 |
| `TEST_DATABASE_URL` | 否 | - | 测试数据库文件路径，格式 `file:./test.db`。仅 `npm test` 时需要 |

## 运行方式

| 命令 | 用途 |
|------|------|
| `npm run dev` | 开发模式（tsx --watch，文件变更自动重启） |
| `npm start` | 生产模式（tsx，一次启动） |
| `npm test` | 运行测试（vitest run） |
| `npm run build` | TypeScript 编译（输出到 `dist/`） |

## 数据库配置

Prisma 通过 `DATABASE_URL` 连接 SQLite 数据库文件，Schema 定义在 `prisma/schema.prisma`。

### 生成 Prisma Client

```bash
npx prisma generate
```

### 数据库同步（仅 schema 变更时）

修改 schema 后运行：

```bash
npx prisma db push   # 按 schema 同步 SQLite 表结构
npx prisma generate  # 重新生成 client
```

## JWT 配置

- Token 有效期：7 天
- 认证方式：`Authorization: Bearer <token>`
- 中间件：`src/middleware/auth.ts`
- 无需配置刷新 token —— 过期后重新登录即可

## PM2 配置

`ecosystem.config.cjs` 中的关键配置：

- **进程名**: `gouye`
- **入口**: `./node_modules/.bin/tsx src/app.ts`
- **模式**: `production`
- **监听**: 监听 `src/` 目录变化，1 秒延迟后重启
- **内存限制**: 256MB
- **自动重启**: 开启

## 数据库存储

SQLite 为单文件数据库，默认存放于 `prisma/` 目录（`dev.db` / `test.db`），已在 `.gitignore` 中排除。SQLite 原生支持 UTF-8，无需字符集配置。删除 `prisma/*.db` 即可重置数据库。
