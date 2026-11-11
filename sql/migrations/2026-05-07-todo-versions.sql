-- ============================================================
-- Migration: TODO 版本历史快照表
-- 日期: 2026-05-07
-- 变更点:
--   1. 新增 todo_versions 表（快照模式，每次修改写入完整快照）
--   2. 为所有现存 TODO 初始化 v1 快照（change_summary = '迁移初始化'）
--
-- 说明:
--   - 字段完整快照，包括 tag_ids（JSON 数组）
--   - ON DELETE CASCADE 由 DB 层保证历史清理
--   - version_number 从 1 递增，同一 todo_id 内 UNIQUE
--
-- ⚠️ 执行方式（必须指定 utf8mb4，否则中文注释/中文字面量会被 Latin-1 坏掉）:
--    mysql --default-character-set=utf8mb4 -h ... -u ... -p... gouye \
--        < 2026-05-07-todo-versions.sql
-- ============================================================

/*!40101 SET NAMES utf8mb4 */;
/*!40101 SET CHARACTER_SET_CLIENT=utf8mb4 */;
/*!40101 SET CHARACTER_SET_CONNECTION=utf8mb4 */;
/*!40101 SET CHARACTER_SET_RESULTS=utf8mb4 */;

USE gouye;

-- 1. 新建 todo_versions 表
CREATE TABLE IF NOT EXISTS todo_versions (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    todo_id         BIGINT       NOT NULL,
    version_number  INT          NOT NULL COMMENT '版本号，从1递增',

    -- 快照字段
    title           VARCHAR(200) NOT NULL,
    status          ENUM('pending','done','cancelled') NOT NULL,
    domain          ENUM('work','life')                NOT NULL,
    project_id      BIGINT       NULL,
    due_at          DATETIME     NULL,
    completed_at    DATETIME     NULL,
    payload         JSON         NULL,
    tag_ids         JSON         NULL COMMENT '标签ID数组快照',

    -- 审计元数据
    change_summary  VARCHAR(500) NULL COMMENT '变更摘要',
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_todo_version (todo_id, version_number),
    INDEX idx_todo_versions_todo_id (todo_id),
    FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  COMMENT='TODO 版本历史快照表';

-- 2. 为所有现存且尚无版本记录的 TODO 写入 v1 初始快照
--    tag_ids 使用子查询聚合 todo_tags；MySQL 8.0 的 JSON_ARRAYAGG 会把空集合变 NULL，
--    这里改为 COALESCE 成 JSON '[]' 以保持字段语义稳定。
INSERT INTO todo_versions
    (todo_id, version_number, title, status, domain, project_id,
     due_at, completed_at, payload, tag_ids, change_summary, created_at)
SELECT
    t.id,
    1,
    t.title,
    t.status,
    t.domain,
    t.project_id,
    t.due_at,
    t.completed_at,
    t.payload,
    COALESCE(
        (SELECT JSON_ARRAYAGG(tt.tag_id)
           FROM todo_tags tt
          WHERE tt.todo_id = t.id),
        JSON_ARRAY()
    ),
    '迁移初始化',
    COALESCE(t.created_at, CURRENT_TIMESTAMP)
FROM todos t
WHERE NOT EXISTS (
    SELECT 1 FROM todo_versions v WHERE v.todo_id = t.id
);
