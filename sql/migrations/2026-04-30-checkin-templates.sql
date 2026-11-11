-- ============================================================
-- Migration: Checkin 引入模板 (CheckinTemplate)
-- 日期: 2026-04-30
-- 变更点:
--   1. 新增 checkin_templates 表
--   2. checkins 表删除 category 字段、新增 template_id 外键
--   3. 为每个已有打卡记录的 category 自动创建对应模板，并回填 template_id
--
-- 说明:
--   - 主库为 MySQL；SQLite 开发环境由 app.py 的 db.create_all() 和
--     seed 脚本 (scripts/seed_default_templates.py) 负责创建模板。
--   - 本脚本只覆盖 MySQL 的升级路径。
-- ============================================================

USE gouye;

-- 1. 新建 checkin_templates 表
CREATE TABLE IF NOT EXISTS checkin_templates (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    name VARCHAR(50) NOT NULL,
    icon VARCHAR(50) NULL,
    fields_schema JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_template_name (user_id, name),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- 2. 把历史 checkins 中出现过的 (user_id, category) 提升为模板
--    用一个最小可用的 fields_schema（仅含 notes 隐式字段，这里放空 fields）
INSERT INTO checkin_templates (user_id, name, fields_schema)
SELECT DISTINCT user_id, category, JSON_OBJECT('fields', JSON_ARRAY())
FROM checkins
WHERE category IS NOT NULL AND category <> '';

-- 3. 给 checkins 表加 template_id 列（先允许 NULL，回填后再设 NOT NULL）
ALTER TABLE checkins ADD COLUMN template_id BIGINT NULL AFTER user_id;

-- 4. 回填 template_id
UPDATE checkins c
JOIN checkin_templates t
  ON c.user_id = t.user_id AND c.category = t.name
SET c.template_id = t.id;

-- 5. 收紧约束 + 外键 + 索引
ALTER TABLE checkins MODIFY COLUMN template_id BIGINT NOT NULL;
ALTER TABLE checkins ADD CONSTRAINT fk_checkins_template
    FOREIGN KEY (template_id) REFERENCES checkin_templates(id);
ALTER TABLE checkins ADD INDEX idx_user_template (user_id, template_id);

-- 6. 删除 category 字段与旧索引
ALTER TABLE checkins DROP INDEX idx_user_category;
ALTER TABLE checkins DROP COLUMN category;
