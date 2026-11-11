-- v1.7.0: 把 payload 整个字段删掉，提一个独立 comment 字段到 Todo 和 TodoVersion 表上
ALTER TABLE todos ADD COLUMN comment VARCHAR(500) NULL;
ALTER TABLE todo_versions ADD COLUMN comment VARCHAR(500) NULL;

-- 回填：已有 payload.comment 的数据迁移到新 comment 列
UPDATE todos
   SET comment = JSON_UNQUOTE(JSON_EXTRACT(payload, '$.comment'))
 WHERE payload IS NOT NULL
   AND JSON_EXTRACT(payload, '$.comment') IS NOT NULL;

UPDATE todo_versions
   SET comment = JSON_UNQUOTE(JSON_EXTRACT(payload, '$.comment'))
 WHERE payload IS NOT NULL
   AND JSON_EXTRACT(payload, '$.comment') IS NOT NULL;

-- 删除旧字段
ALTER TABLE todos DROP COLUMN payload;
ALTER TABLE todo_versions DROP COLUMN payload;
ALTER TABLE todo_versions DROP COLUMN change_summary;
