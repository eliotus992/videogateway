-- D1 数据库 Schema

-- API Keys 表
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    permissions TEXT NOT NULL, -- JSON array
    rate_limit INTEGER DEFAULT 60,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    expires_at TEXT
);

-- Generations 表
CREATE TABLE IF NOT EXISTS generations (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL, -- pending, processing, completed, failed
    model TEXT NOT NULL,
    provider TEXT NOT NULL,
    progress INTEGER DEFAULT 0,
    video_url TEXT,
    error TEXT,
    cost_usd REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
);

-- Webhook 订阅表
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array
    secret TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);
CREATE INDEX IF NOT EXISTS idx_generations_provider ON generations(provider);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
