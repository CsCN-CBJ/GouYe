#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== Skill 集成测试 ==="

# 1. 校验 .env.test 存在且含必要键
ENV_TEST="$PROJECT_DIR/.env.test"
if [ ! -f "$ENV_TEST" ]; then
    echo "❌ .env.test 不存在: $ENV_TEST"
    exit 1
fi
if ! grep -q 'DATABASE_URL' "$ENV_TEST"; then
    echo "❌ .env.test 缺少 DATABASE_URL"
    exit 1
fi
if ! grep -q 'JWT_SECRET_KEY' "$ENV_TEST"; then
    echo "❌ .env.test 缺少 JWT_SECRET_KEY"
    exit 1
fi
echo "✅ .env.test 校验通过"

# 2. Export DATABASE_URL and JWT_SECRET_KEY from .env.test
while IFS='=' read -r key val; do
    key=$(echo "$key" | xargs)
    val=$(echo "${val%%#*}" | xargs | sed "s/^['\"]//;s/['\"]$//")
    if [ -z "$key" ] || [ "$key" != "${key#\#}" ]; then continue; fi
    case "$key" in
        DATABASE_URL|JWT_SECRET_KEY) export "$key=$val" ;;
    esac
done < "$ENV_TEST"

# 3. Set test port (NODE_ENV != 'test' so app.listen() runs)
export PORT=7099
export NODE_ENV=skilltest

# 4. 启动 Express
echo ""
echo "启动后端 (port $PORT)..."
cd "$PROJECT_DIR"
npx tsx src/app.ts &
BACKEND_PID=$!

cleanup() {
    echo ""
    echo "停止后端 (PID $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
    echo "✅ 后端已停止"
}
trap cleanup EXIT

# 5. wait-for-it: curl /api/users/me 直到收到 401（说明在跑）
echo "等待后端就绪..."
for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/users/me" 2>/dev/null || echo "000")
    if [ "$code" = "401" ]; then
        echo "✅ 后端就绪 (${i}s)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ 后端启动超时 (last code=$code)"
        exit 1
    fi
    sleep 1
done

# 6. pip install test dependencies
echo ""
echo "安装 Python 测试依赖..."
cd "$PROJECT_DIR/skill"
python3 -m pip install -q -r tests/requirements.txt 2>/dev/null

# 7. Set API base for pytest
export GOUYE_API_BASE="http://localhost:$PORT"
cd "$PROJECT_DIR"

# 8. Run pytest
echo ""
echo "运行 pytest..."
set +e
python3 -m pytest skill/tests/ -v --tb=short
PYTEST_EXIT=$?
set -e

echo ""
echo "=== 测试完成 (pytest exit: $PYTEST_EXIT) ==="
exit $PYTEST_EXIT
