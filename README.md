# VideoGateway

🎬 **开源 AI 视频生成网关** — 自托管、多平台支持、成本优化

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   你的应用       │────▶│  VideoGateway    │────▶│   字节 Seedance  │
│                 │     │  (自托管)         │     │   (你自己的账号)  │
└─────────────────┘     │                  │     └─────────────────┘
                        │  - 统一 API       │
                        │  - 成本优化       │     ┌─────────────────┐
                        │  - 队列管理       │────▶│   可灵 AI        │
                        │  - Webhook       │     │   (你自己的账号)  │
                        └──────────────────┘     └─────────────────┘
```

## 特点

- 🔓 **完全开源** - MIT 协议，可自由修改
- 🏠 **自托管** - 部署到 Cloudflare Workers（免费额度够用）
- 🔑 **自带账号** - 用户绑定自己的 字节/可灵/Runway 账号
- 💰 **成本透明** - 直接付费给平台，Gateway 不收差价
- 🚀 **边缘部署** - 全球 CDN，低延迟

## 快速开始

### 1. 部署到 Cloudflare Workers（5 分钟）

```bash
# 1. 克隆代码
git clone https://github.com/eliotus992/videogateway.git
cd videogateway

# 2. 安装依赖
npm install

# 3. 登录 Cloudflare
npx wrangler login

# 4. 创建 D1 数据库
npx wrangler d1 create videogateway
# 复制输出的 database_id

# 5. 编辑 wrangler.toml，填入 database_id
# [[d1_databases]]
# database_id = "你的-database-id"

# 6. 初始化数据库
npx wrangler d1 execute videogateway --file=./schema.sql

# 7. 部署
npx wrangler deploy
```

部署完成后，你会得到一个 `https://videogateway.xxx.workers.dev` 地址。

### 2. 创建 API Key

```bash
curl -X POST https://your-gateway.workers.dev/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'

# 返回（只显示一次，请保存）
{
  "id": "vg_xxx",
  "key": "vg_xxx.yyyyyyyy",
  "name": "my-app"
}
```

### 3. 配置你的 Provider 账号

#### 字节 Seedance
```bash
curl -X POST https://your-gateway.workers.dev/v1/providers/seedance \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-your-seedance-api-key"
  }'
```

#### 可灵 AI
```bash
curl -X POST https://your-gateway.workers.dev/v1/providers/kling \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-your-kling-api-key"
  }'
```

#### Runway ML
```bash
curl -X POST https://your-gateway.workers.dev/v1/providers/runway \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "sk-your-runway-api-key"
  }'
```

### 4. 生成视频

```bash
curl -X POST https://your-gateway.workers.dev/v1/video/generations \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance-1.0",
    "prompt": "一只猫在未来城市跳舞",
    "duration": 5,
    "resolution": "1080p",
    "callback_url": "https://your-app.com/webhook"
  }'

# 返回
{
  "id": "vg_a1b2c3d4e5f6g7h8",
  "status": "pending",
  "model": "seedance-1.0",
  "provider": "seedance",
  "estimated_seconds": 75
}
```

### 5. 查询状态

```bash
curl https://your-gateway.workers.dev/v1/video/generations/vg_a1b2c3d4e5f6g7h8 \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy"
```

### 6. 获取结果

```bash
curl https://your-gateway.workers.dev/v1/video/generations/vg_a1b2c3d4e5f6g7h8/result \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy"

# 返回
{
  "id": "vg_a1b2c3d4e5f6g7h8",
  "status": "completed",
  "video_url": "https://...",
  "provider": "seedance"
}
```

---

## 部署者配置（可选）

作为 Gateway 部署者，你可以预配置默认的 Provider Keys，这样用户不配置也能用：

```bash
# 设置环境变量（Secrets）
npx wrangler secret put SEEDANCE_API_KEY
npx wrangler secret put KLING_API_KEY
npx wrangler secret put RUNWAY_API_KEY
npx wrangler secret put WEBHOOK_SECRET  # 用于加密存储
```

优先级：
1. **用户自己配置的 Key**（优先使用）
2. **部署者配置的默认 Key**（fallback）

---

## API 端点

| 方法 | 端点 | 描述 |
|------|------|------|
| GET | `/v1/providers` | 列出可用 providers |
| POST | `/v1/providers/:provider` | 配置 provider API key |
| DELETE | `/v1/providers/:provider` | 删除 provider 配置 |
| POST | `/v1/video/generations` | 创建生成任务 |
| GET | `/v1/video/generations/:id` | 查询任务状态 |
| GET | `/v1/video/generations/:id/result` | 获取结果 |
| DELETE | `/v1/video/generations/:id` | 取消任务 |
| POST | `/v1/keys` | 创建 API key |
| GET | `/v1/keys` | 列出 API keys |
| GET | `/health` | 健康检查 |

---

## Webhook 回调

配置 `callback_url` 后，会收到以下事件：

```json
{
  "event": "generation.completed",
  "data": {
    "id": "vg_xxx",
    "status": "completed",
    "video_url": "https://..."
  },
  "timestamp": "2024-03-01T07:31:15Z"
}
```

事件类型：
- `generation.started` - 开始生成
- `generation.progress` - 进度更新
- `generation.completed` - 完成
- `generation.failed` - 失败

---

## 成本对比

| 方案 | 每 5 秒 1080p 视频成本 |
|------|----------------------|
| 直接调用 Seedance | ¥2.5 |
| 通过 Gateway | ¥2.5（0 差价）|
| 其他 SaaS 平台 | ¥3.5-5（加价）|

**Gateway 本身免费**，你只需要付给字节/可灵/Runway。

---

## 支持的模型

| Provider | 模型 | 价格参考 |
|----------|------|---------|
| 字节 Seedance | seedance-1.0, seedance-1.0-pro | ¥0.5/秒起 |
| 可灵 AI | kling-1.6, kling-1.0 | ¥0.4/秒起 |
| Runway | runway-gen3, runway-gen2 | $0.35/秒起 |

---

## 开发

```bash
# 本地开发（需要配置 .env）
npm run dev

# 运行测试
npm test

# 部署
npm run deploy:worker
```

---

## 常见问题

**Q: 我的 API Key 安全吗？**
A: 存储时加密，传输用 HTTPS。开源代码，可审计。

**Q: 可以部署到自己的服务器吗？**
A: 可以。除了 Workers 版本，也有 Node.js 版本（见 `src/index.ts`）。

**Q: 免费额度够用吗？**
A: Cloudflare Workers 免费额度：10 万次请求/天，足够个人使用。

**Q: 可以集成到我的 SaaS 吗？**
A: 完全可以。每个用户用自己的 Gateway API Key，绑定自己的 Provider 账号。

---

## 许可证

MIT License - 自由使用、修改、商业用途。

---

## 贡献

欢迎 PR！

- 添加更多 Provider（Pika、Luma、可灵等）
- 改进文档
- 添加测试
- 修复 bug
