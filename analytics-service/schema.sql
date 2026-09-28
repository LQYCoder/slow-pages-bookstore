-- Cloudflare D1 / SQLite；创建者：Codex；创建日期：2026/09/28。
-- 新建独立统计库；不修改或迁移现有浏览器阅读存档。
CREATE TABLE IF NOT EXISTS visit (
    id TEXT PRIMARY KEY,
    day TEXT NOT NULL,
    visitor_hash TEXT NOT NULL,
    path TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT NOT NULL,
    city TEXT NOT NULL,
    visible_ms INTEGER NOT NULL DEFAULT 0 CHECK (visible_ms >= 0 AND visible_ms <= 86400000),
    reading_ms INTEGER NOT NULL DEFAULT 0 CHECK (reading_ms >= 0 AND reading_ms <= visible_ms),
    motion_ms INTEGER NOT NULL DEFAULT 0 CHECK (motion_ms >= 0 AND motion_ms <= visible_ms),
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visit_day_path ON visit(day, path);
CREATE INDEX IF NOT EXISTS idx_visit_create_time ON visit(create_time);
