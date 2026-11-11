# Skill 集成测试套件

## 依赖

```bash
pip install -r requirements.txt
```

| 包 | 最低版本 | 用途 |
|----|---------|------|
| pytest | >=7.0 | 测试框架 |
| requests | >=2.31 | HTTP 客户端 |
| python-dotenv | >=1.0 | 加载 .env.test 环境变量 |

## 测试库要求

确保根目录 `.env.test` 包含以下键：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | MySQL 测试库连接串（与后端 vitest 共享） |
| `JWT_SECRET_KEY` | JWT 签名密钥 |
| `PORT` | 测试端口（run.sh 自动设为 7099） |

## 跑法

```bash
# 一键跑（自动启停 Express 后端 + 运行 pytest）
npm run test:skill

# 或直接执行 shell
bash skill/tests/run.sh

# 单独跑某个测试文件（需要后端已在 localhost:7099 运行）
GOUYE_API_BASE=http://localhost:7099 pytest skill/tests/test_user.py -v --tb=short
```
