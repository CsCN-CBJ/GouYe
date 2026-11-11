-- Migration: Expand TodoStatus from 3 to 5 states
-- Date: 2026-06-03
-- 
-- Old: ENUM('pending','done','cancelled')
-- New: ENUM('not_started','in_progress','blocked','completed','cancelled')
--
-- Data mapping:
--   pending     -> not_started
--   done        -> completed
--   cancelled   -> cancelled  (unchanged)

-- 1. Expand ENUM (keep old values temporarily)
ALTER TABLE todos 
  MODIFY COLUMN status ENUM('pending','done','cancelled','not_started','in_progress','blocked','completed') 
  NOT NULL DEFAULT 'not_started';

-- 2. Migrate data
UPDATE todos SET status = 'not_started' WHERE status = 'pending';
UPDATE todos SET status = 'completed' WHERE status = 'done';

-- 3. Shrink ENUM to only new values
ALTER TABLE todos 
  MODIFY COLUMN status ENUM('not_started','in_progress','blocked','completed','cancelled') 
  NOT NULL DEFAULT 'not_started';

-- 4. Expand todo_versions ENUM (keep old values temporarily)
ALTER TABLE todo_versions 
  MODIFY COLUMN status ENUM('pending','done','cancelled','not_started','in_progress','blocked','completed') 
  NOT NULL;

-- 5. Migrate data
UPDATE todo_versions SET status = 'not_started' WHERE status = 'pending';
UPDATE todo_versions SET status = 'completed' WHERE status = 'done';

-- 6. Shrink ENUM to only new values
ALTER TABLE todo_versions 
  MODIFY COLUMN status ENUM('not_started','in_progress','blocked','completed','cancelled') 
  NOT NULL;
