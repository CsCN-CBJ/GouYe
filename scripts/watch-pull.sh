#!/bin/bash
# 由 cron 每分钟执行
# 功能：拉取当前跟踪分支最新代码；若依赖或 Prisma 变更则更新并重启

cd "$(dirname "$0")/.." || exit 1

lock_file=".cron.lock"
exec 200>"$lock_file"
flock -n 200 || exit 0

before_head=$(git rev-parse HEAD 2>/dev/null) || exit 1

git pull --ff-only || exit 1

after_head=$(git rev-parse HEAD 2>/dev/null) || exit 1

if [ "$before_head" = "$after_head" ]; then
    exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updated: $before_head -> $after_head"

changed_files=$(git diff --name-only "$before_head" "$after_head")

# 如果依赖有变化，按 lockfile 重装依赖
if printf '%s\n' "$changed_files" | grep -Eq '^(package\.json|package-lock\.json)$'; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Reinstalling dependencies..."
    npm ci --include=dev || exit 1
fi

# 如果有新 migration 文件夹，先跑 migrate deploy 应用未执行的迁移
# (_prisma_migrations 表保证已 applied 的 migration 不会重跑)
if printf '%s\n' "$changed_files" | grep -q '^prisma/migrations/'; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Running prisma migrate deploy..."
    npx prisma migrate deploy || exit 1
fi

# 如果 prisma schema 有变化，重新生成 client
if printf '%s\n' "$changed_files" | grep -q '^prisma/schema\.prisma$'; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Regenerating Prisma Client..."
    npx prisma generate || exit 1
fi

# 任何代码变更都重启服务
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting PM2 gouye..."
pm2 restart gouye
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy complete."
