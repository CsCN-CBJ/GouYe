#!/bin/bash
# 一键启动/重启服务
# 自动处理：锁冲突、pm2安装、依赖安装、Prisma生成、健康检查

set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

# 清除 watch-pull.sh 的 cron 锁（手动启动优先级高于 cron）
rm -f .cron.lock

# 创建日志目录
mkdir -p log

# 0. 检查 .env 文件
if [ ! -f ".env" ]; then
    echo "[run.sh] ERROR: .env file not found!"
    echo "[run.sh] Copy from .env.example and fill in your values:"
    echo "         cp .env.example .env"
    exit 1
fi

get_env_value() {
    local key="$1"
    awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1) }' .env | tail -n 1
}

PORT="$(get_env_value PORT)"
PORT="${PORT:-7001}"
HEALTH_URL="http://127.0.0.1:${PORT}/"

# 1. 确保 pm2 可用
if ! command -v pm2 >/dev/null 2>&1; then
    echo "[run.sh] pm2 not found, installing globally..."
    npm install -g pm2 || { echo "[run.sh] Failed to install pm2"; exit 1; }
fi

# 2. 安装依赖（node_modules 不存在 或关键依赖缺失）
need_install=false
if [ ! -d "node_modules" ]; then
    need_install=true
elif [ ! -f "node_modules/.bin/tsx" ]; then
    echo "[run.sh] tsx missing, reinstalling dependencies..."
    rm -rf node_modules
    need_install=true
fi

if [ "$need_install" = true ]; then
    echo "[run.sh] Installing dependencies from lockfile..."
    npm ci --include=dev || exit 1
fi

# 3. 每次生成 Prisma Client，保证依赖和 schema 变化后也能启动
echo "[run.sh] Generating Prisma Client..."
npx prisma generate || exit 1

# 4. 停掉旧进程（如果存在），重新启动
if pm2 describe gouye >/dev/null 2>&1; then
    echo "[run.sh] Restarting gouye..."
    pm2 delete gouye 2>/dev/null || true
fi

echo "[run.sh] Starting gouye..."
pm2 start ecosystem.config.cjs >/dev/null

# 5. 健康检查：确认 HTTP 服务已真正可访问
for i in $(seq 1 20); do
    if curl -s "$HEALTH_URL" >/dev/null 2>&1; then
        echo "[run.sh] Service is ready: $HEALTH_URL"
        pm2 status gouye
        exit 0
    fi
    sleep 1
done

echo "[run.sh] ERROR: service did not become ready: $HEALTH_URL"
echo "[run.sh] Last 50 lines of error log:"
tail -n 50 "$HOME/.pm2/logs/gouye-error.log" || true
exit 1
