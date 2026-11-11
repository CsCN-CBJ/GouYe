-- v1.10.3: 修正 6/9 ~ 6/17 期间因进程 TZ 漂移 (Asia/Shanghai → UTC)
-- 导致 occurred_at 整体快 8h 的脏数据。
-- 仅修正"下班 / OffWork / 睡觉"模板的 17 条记录（用户已逐条确认）。
-- 注意：本迁移已 +8h，prisma migrate 通过 _prisma_migrations 表防重复执行。
-- 若需手工重跑，请先核对此 17 条 occurred_at 是否已修正，避免再 +8h。
UPDATE checkins SET occurred_at = occurred_at + INTERVAL 8 HOUR
WHERE id IN (67, 70, 71, 72, 73, 74, 75, 76, 77, 78, 80, 81, 82, 83, 84, 85, 86);
