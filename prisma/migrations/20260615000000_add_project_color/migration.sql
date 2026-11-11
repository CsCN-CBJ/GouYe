-- v1.10.0: Project 加 color 字段（hex #RRGGBB，可空）
ALTER TABLE projects ADD COLUMN color VARCHAR(20) NULL;
