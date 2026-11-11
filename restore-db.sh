#!/usr/bin/env bash
#
# gouye 生产库恢复脚本（手动执行，不在 cron 中）
#
# 用法:
#   ./restore-db.sh <备份文件路径>
#   例: ./restore-db.sh /home/admin/gouye_backup/dev-20260824.db
#
# 流程:
#   1) 校验备份文件存在且 integrity_check 通过
#   2) 停 gouye 服务 (PM2)
#   3) 将原生产库备份一份到 prisma/dev.db.bak.<时间戳> 防误操作
#   4) 用 sqlite3 .restore 把备份写回 prisma/dev.db
#   5) 重启 gouye 服务
#
# 注意: 本脚本会短暂中断 gouye 服务（通常仅数秒）。

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: $0 <备份文件路径>" >&2
  exit 1
fi

BACKUP_FILE="$1"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="${SCRIPT_DIR}/prisma/dev.db"
SQLITE="$(command -v sqlite3)"
PM2="${SCRIPT_DIR}/../botmux/node_modules/.bin/pm2"

if [[ -z "${SQLITE}" ]]; then echo "ERROR: sqlite3 未安装" >&2; exit 1; fi
if [[ ! -f "${BACKUP_FILE}" ]]; then echo "ERROR: 备份文件不存在: ${BACKUP_FILE}" >&2; exit 1; fi

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 校验备份完整性..."
if ! "${SQLITE}" "${BACKUP_FILE}" "PRAGMA integrity_check;" | grep -q '^ok$'; then
  echo "ERROR: 备份文件完整性校验失败" >&2; exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 停止 gouye 服务..."
"${PM2}" stop gouye

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 备份当前生产库(防误操作)..."
cp "${DB_FILE}" "${DB_FILE}.bak.$(date '+%Y%m%d%H%M%S')"

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 恢复: ${BACKUP_FILE} -> ${DB_FILE}"
"${SQLITE}" "${DB_FILE}" ".restore '${BACKUP_FILE}'"

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 重启 gouye 服务..."
"${PM2}" start gouye

echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] 恢复完成。请验证服务与数据。"
