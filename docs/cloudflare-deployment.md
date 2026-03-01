# Cloudflare Workers 部署指南

## 前置要求

```bash
# 安装 Wrangler CLI
npm install -g wrangler

# 登录 Cloudflare
wrangler login
```

## 初始设置

### 1. 创建 D1 数据库

```bash
# 创建数据库
wrangler d1 create videogateway-db

# 记录输出中的 database_id，填入 wrangler.toml
```

### 2. 创建 KV 命名空间

```bash
# API Keys 存储
wrangler kv:namespace create "API_KEYS"

# Rate limit 存储
wrangler kv:namespace create "RATE_LIMITS"

# 记录输出中的 id，填入 wrangler.toml
```

### 3. 创建 Queue

```bash
wrangler queues create video-generation
```

### 4. 设置 Secrets

```bash
# Provider API Keys
wrangler secret put SEEDANCE_API_KEY
wrangler secret put KLING_API_KEY
wrangler secret put RUNWAY_API_KEY

# Webhook 签名密钥
wrangler secret put WEBHOOK_SECRET
```

### 5. 初始化数据库

```bash
# 创建表
wrangler d1 execute videogateway-db --file=./schema.sql
```

## 部署

```bash
# 开发模式（本地测试）
npm run dev:worker

# 部署到 Cloudflare
npm run deploy
```

## 数据库 Schema

```sql
-- API Keys 表
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  user_id TEXT NOT NULL,
  permissions TEXT NOT NULL, -- JSON array
  rate_limit INTEGER DEFAULT 60,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  expires_at TEXT,
  is_active BOOLEAN DEFAULT 1
);

-- 生成任务表
CREATE TABLE generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  duration INTEGER,
  resolution TEXT,
  aspect_ratio TEXT,
  callback_url TEXT,
  video_url TEXT,
  error TEXT,
  cost_usd REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT
);

-- Webhook 订阅表
CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT NOT NULL, -- JSON array
  secret TEXT NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 创建索引
CREATE INDEX idx_generations_user_id ON generations(user_id);
CREATE INDEX idx_generations_status ON generations(status);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
```

## 成本估算

| 项目 | 免费档 | 备注 |
|------|--------|------|
| Workers | 100,000 请求/天 | 超出 $0.50/百万 |
| D1 | 5GB 存储 | 超出 $0.75/百万行读取 |
| KV | 1GB 存储 | 超出 $0.50/百万读取 |
| Queue | 1M 操作/月 | 超出 $1.00/百万 |
| 出站流量 | 1GB/月 | 超出 $0.10/GB |

**1000 视频生成/月预估成本：$0-5**

## 监控

```bash
# 查看日志
wrangler tail

# 查看 Queue 状态
wrangler queues list
wrangler queues info video-generation
```
