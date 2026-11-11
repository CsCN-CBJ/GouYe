#!/usr/bin/env bash
#
# gouye 生产库热备脚本
# - 仅备份生产库 dev.db（不备份 test.db）
# - 使用 sqlite3 .backup 在线一致性快照，不阻塞 gouye 服务
# - 按日期命名：dev-YYYYMMDD.db（东八区）
# - 永久保留，不自动清理（磁盘满由人工处理）
# - 日志追加到 BACKUP_DIR/backup.log
#
# 由 cron 每日调用；也可手动执行做即时备份。

set -euo pipefail

# ─── 配置 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_FILE="${SCRIPT_DIR}/prisma/gouye.db"        # 生产库（DATABASE_URL=file:./gouye.db 解析到此）
BACKUP_DIR="/home/admin/gouye_backup"
LOG_FILE="${BACKUP_DIR}/backup.log"
SQLITE="$(command -v sqlite3)"

# ─── 前置检查 ──────────────────────────────────────────────────────────────
if [[ -z "${SQLITE}" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] ERROR: sqlite3 未安装，无法备份" | tee -a "${LOG_FILE}"
  exit 1
fi
if [[ ! -f "${DB_FILE}" ]]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] ERROR: 生产库不存在: ${DB_FILE}" | tee -a "${LOG_FILE}"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# 东八区日期戳
DATE_STAMP="$(TZ='Asia/Shanghai' date '+%Y%m%d')"
BACKUP_FILE="${BACKUP_DIR}/gouye-${DATE_STAMP}.db"

# ─── 执行热备 ──────────────────────────────────────────────────────────────
# 同一天多次备份会覆盖当天文件（保留当日最新一份）；如需保留每小时可改为 dev-YYYYMMDD-HHMM.db
echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] INFO: 开始备份 ${DB_FILE} -> ${BACKUP_FILE}" | tee -a "${LOG_FILE}"

if "${SQLITE}" "${DB_FILE}" ".backup '${BACKUP_FILE}'"; then
  # 校验备份一致性
  if "${SQLITE}" "${BACKUP_FILE}" "PRAGMA integrity_check;" | grep -q -v '^ok$'; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] ERROR: 备份完整性校验失败: ${BACKUP_FILE}" | tee -a "${LOG_FILE}"
    rm -f "${BACKUP_FILE}"
    exit 1
  fi
  SIZE="$(du -h "${BACKUP_FILE}" | cut -f1)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] OK: 备份完成 size=${SIZE} file=${BACKUP_FILE}" | tee -a "${LOG_FILE}"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S %z')] ERROR: sqlite3 .backup 失败" | tee -a "${LOG_FILE}"
  exit 1
fi
