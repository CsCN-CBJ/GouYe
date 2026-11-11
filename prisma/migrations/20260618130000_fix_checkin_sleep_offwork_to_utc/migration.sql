-- v1.10.4: 把 checkins 表中 "下班 / 睡觉 / OffWork" 模板下所有记录的 occurred_at -8h，
-- 让底层字面量统一为真 UTC（与 v1.10.3 之后新写入数据一致）。
-- 修复前：底层为 Beijing 字面量（前端渲染再 +8h 错位 +8h，凌晨 02 点变上午 10 点）。
-- 修复后：底层为真 UTC，前端 toLocaleString('zh-CN') 自动 +8h 渲染回 Beijing 钟点。
-- 共 67 条。
-- 迁移前快照见 temp/checkin-sleep-offwork-pre-fix-20260618.csv
-- 注意：prisma migrate 通过 _prisma_migrations 表防重跑；如手工重跑此 SQL 会再次 -8h，
-- 请先核对 occurred_at 是否已为 UTC（凌晨睡觉应显示为前一天 18:xx）。

UPDATE checkins c
JOIN checkin_templates t ON c.template_id = t.id
SET c.occurred_at = c.occurred_at - INTERVAL 8 HOUR
WHERE t.name IN ('下班', '睡觉', 'OffWork');

-- 北京时间视图：方便 DBA / 用户直接 SELECT 看到合理钟表时间。
-- 视图列名加 _bj 后缀；原表保持真 UTC，代码层不受影响。
DROP VIEW IF EXISTS v_checkins;
CREATE VIEW v_checkins AS
SELECT
  id,
  user_id,
  template_id,
  DATE_ADD(occurred_at, INTERVAL 8 HOUR) AS occurred_at_bj,
  payload,
  DATE_ADD(created_at,  INTERVAL 8 HOUR) AS created_at_bj,
  DATE_ADD(updated_at,  INTERVAL 8 HOUR) AS updated_at_bj
FROM checkins;

DROP VIEW IF EXISTS v_transactions;
CREATE VIEW v_transactions AS
SELECT
  transaction_id,
  user_id,
  amount,
  transaction_type,
  category_id,
  DATE_ADD(transaction_date, INTERVAL 8 HOUR) AS transaction_date_bj,
  description,
  images,
  DATE_ADD(created_at, INTERVAL 8 HOUR) AS created_at_bj,
  DATE_ADD(updated_at, INTERVAL 8 HOUR) AS updated_at_bj
FROM transactions;

DROP VIEW IF EXISTS v_todos;
CREATE VIEW v_todos AS
SELECT
  id,
  user_id,
  domain,
  project_id,
  title,
  status,
  DATE_ADD(due_at,        INTERVAL 8 HOUR) AS due_at_bj,
  DATE_ADD(completed_at,  INTERVAL 8 HOUR) AS completed_at_bj,
  comment,
  DATE_ADD(created_at,    INTERVAL 8 HOUR) AS created_at_bj,
  DATE_ADD(updated_at,    INTERVAL 8 HOUR) AS updated_at_bj
FROM todos;
