-- ============================================================
-- Migration: 删除 Checkin.title/raw_input, Todo.raw_input, AIProposal.raw_input
-- 日期: 2026-05-01
-- 变更点:
--   1. checkins 表删除 title、raw_input 列
--   2. todos 表删除 raw_input 列
--   3. ai_proposals 表删除 raw_input 列
-- ============================================================

USE gouye;

-- 1. checkins 删除 title 和 raw_input
ALTER TABLE checkins DROP COLUMN title;
ALTER TABLE checkins DROP COLUMN raw_input;

-- 2. todos 删除 raw_input
ALTER TABLE todos DROP COLUMN raw_input;

-- 3. ai_proposals 删除 raw_input
ALTER TABLE ai_proposals DROP COLUMN raw_input;
