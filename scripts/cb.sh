#!/usr/bin/env bash
# cb.sh — codebuddy wrapper，统一调用 deepseek-v4-pro-ioa + glm-5.1-ioa fallback
# 用法：
#   cb.sh "prompt"                  # 默认 medium (1800s)
#   cb.sh -t small  "prompt"        # 300s
#   cb.sh -t medium "prompt"        # 1800s
#   cb.sh -t large  "prompt"        # 7200s
#   cb.sh -t huge   "prompt"        # 21600s
#   cb.sh -t 600    "prompt"        # 自定义秒数

set -euo pipefail

MODEL="deepseek-v4-pro-ioa"
FALLBACK="glm-5.1-ioa"

declare -A TIMEOUT_PRESETS=(
  [small]=300
  [medium]=1800
  [large]=7200
  [huge]=21600
)

declare -A RETRY_PRESETS=(
  [small]=2
  [medium]=2
  [large]=0
  [huge]=0
)

TIMEOUT_ARG="medium"
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--timeout) TIMEOUT_ARG="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \?//'; exit 0 ;;
    *) break ;;
  esac
done

if [[ -n "${TIMEOUT_PRESETS[$TIMEOUT_ARG]:-}" ]]; then
  TIMEOUT_SEC="${TIMEOUT_PRESETS[$TIMEOUT_ARG]}"
  MAX_RETRY="${RETRY_PRESETS[$TIMEOUT_ARG]}"
elif [[ "$TIMEOUT_ARG" =~ ^[0-9]+$ ]]; then
  TIMEOUT_SEC="$TIMEOUT_ARG"
  MAX_RETRY=2
else
  echo "[cb] invalid -t: $TIMEOUT_ARG (expected small/medium/large/huge or seconds)" >&2
  exit 2
fi

if [[ $# -eq 0 ]]; then
  echo "[cb] missing prompt" >&2
  exit 2
fi

PROMPT="$*"

attempt=0
total=$((MAX_RETRY + 1))
while [[ $attempt -lt $total ]]; do
  attempt=$((attempt + 1))
  echo "[cb] attempt ${attempt}/${total}, timeout=${TIMEOUT_SEC}s, model=${MODEL}, fallback=${FALLBACK}" >&2

  if timeout "${TIMEOUT_SEC}" codebuddy -p \
      --model "$MODEL" \
      --fallback-model "$FALLBACK" \
      -y \
      "$PROMPT"; then
    exit 0
  fi
  rc=$?

  if [[ $rc -eq 124 ]]; then
    echo "[cb] timeout after ${TIMEOUT_SEC}s" >&2
  else
    echo "[cb] codebuddy exited with $rc" >&2
  fi

  if [[ $attempt -lt $total ]]; then
    echo "[cb] retrying in 3s..." >&2
    sleep 3
  fi
done

echo "[cb] failed after ${total} attempts" >&2
exit 124
