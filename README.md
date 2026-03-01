# VideoGateway

🎬 **开源 AI 视频 + 图像生成网关** — 自托管、多平台支持、成本优化

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   你的应用       │────▶│  VideoGateway    │────▶│   视频生成平台   │
│                 │     │  (自托管)         │     │  (Seedance等)   │
└─────────────────┘     │                  │     └─────────────────┘
                        │  · 统一 API       │
                        │  · 视频 + 图像    │     ┌─────────────────┐
                        │  · 成本优化       │────▶│   图像生成平台   │
                        │  · 用量统计       │     │  (Stability等)  │
                        └──────────────────┘     └─────────────────┘
```

## 特点

- 🔓 **完全开源** - MIT 协议
- 🏠 **自托管** - Cloudflare Workers（免费额度够用）
- 🎬 **视频生成** - 8 个平台，14 个模型
- 🎨 **图像生成** - 3 个平台，10+ 模型
- 🔑 **自带账号** - 用户绑定自己的 API Key
- 💰 **成本透明** - 零差价，直接付费给平台
- 📊 **用量统计** - Dashboard 可视化

## 支持的 Providers

### 视频生成 (8 个平台)

| Provider | 模型 | 特点 |
|----------|------|------|
| **字节 Seedance** | seedance-1.0, pro | 国产，速度快 |
| **可灵 AI** | kling-1.6, 1.0 | 国产，质量高 |
| **Runway** | gen3, gen2 | 行业标杆 |
| **Pika** | 2.0, 1.5 | 易用，效果好 |
| **Luma** | 1.0, 1.5 | Dream Machine |
| **Haiper** | v2, v1 | 支持重绘 |
| **海螺 AI** | video-v1 | MiniMax 出品 |
| **Stable Video** | 1-1, 1-0 | 图生视频 |

### 图像生成 (3 个平台)

| Provider | 模型 | 特点 |
|----------|------|------|
| **字节 Seedream** | v1, v2 | 国产，效果好 |
| **Stability AI** | SDXL, Core, Ultra | 开源生态 |
| **Replicate** | SDXL, Flux, Kandinsky | 模型市场 |

---

## 快速开始

### 部署到 Cloudflare Workers

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

# 6. 初始化数据库
npx wrangler d1 execute videogateway --file=./schema.sql

# 7. 部署
npx wrangler deploy
```

---

## API 使用

### 1. 创建 API Key

```bash
curl -X POST https://your-gateway.workers.dev/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"name": "my-app"}'

# 返回：
{
  "id": "vg_xxx",
  "key": "vg_xxx.yyyyyyyy",  # 保存好，只显示一次
  "name": "my-app"
}
```

### 2. 配置 Provider

```bash
# 配置字节 Seedance
curl -X POST https://your-gateway.workers.dev/v1/providers/seedance \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-your-seedance-key"}'

# 配置 Stability AI 图像生成
curl -X POST https://your-gateway.workers.dev/v1/providers/stability \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{"api_key": "sk-your-stability-key"}'
```

### 3. 生成视频

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

# 返回：
{
  "id": "vg_a1b2c3d4e5f6g7h8",
  "status": "pending",
  "model": "seedance-1.0",
  "provider": "seedance",
  "estimated_seconds": 75
}
```

### 4. 生成图像（新增）

```bash
curl -X POST https://your-gateway.workers.dev/v1/images/generations \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "stable-image-core",
    "prompt": "A beautiful sunset over mountains",
    "size": "1024x1024",
    "quality": "hd",
    "style": "photographic",
    "n": 1
  }'

# 返回：
{
  "id": "img_a1b2c3d4e5f6g7h8",
  "status": "processing",
  "model": "stable-image-core",
  "provider": "stability",
  "estimated_seconds": 10
}
```

### 5. 获取结果

```bash
# 视频结果
curl https://your-gateway.workers.dev/v1/video/generations/vg_xxx/result \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy"

# 图像结果
curl https://your-gateway.workers.dev/v1/images/generations/img_xxx/result \
  -H "Authorization: Bearer vg_xxx.yyyyyyyy"
```

---

## 图像生成参数

### 支持的模型

```
seedream-v1, seedream-v2                    # 字节
stable-diffusion-xl-1024-v1-0               # Stability
stable-diffusion-v1-6
stable-image-core
stable-image-ultra
replicate-sdxl, replicate-flux              # Replicate
replicate-kandinsky
dall-e-3, dall-e-2                          # OpenAI (需要配置)
```

### 尺寸选项

```
256x256, 512x512, 1024x1024, 1792x1024, 1024x1792, 2048x2048
```

### 风格选项

```
vivid, natural, photographic, anime, digital-art, cinematic
```

### 图生图

```json
{
  "model": "seedream-v2",
  "prompt": "Convert to anime style",
  "image_url": "https://example.com/original.jpg"
}
```

---

## Dashboard

访问 `https://your-gateway.workers.dev/dashboard` 查看：

- 📊 用量统计（视频 + 图像）
- 💰 成本分析
- 🔌 Provider 配置状态
- 📋 最近任务列表

---

## Webhook 事件

```json
// 视频完成
{
  "event": "generation.completed",
  "data": {
    "id": "vg_xxx",
    "status": "completed",
    "video_url": "https://..."
  }
}

// 图像完成
{
  "event": "image.completed",
  "data": {
    "id": "img_xxx",
    "status": "completed",
    "image_url": "https://..."
  }
}
```

---

## API 端点汇总

| 方法 | 端点 | 描述 |
|------|------|------|
| **视频** ||
| POST | `/v1/video/generations` | 创建视频生成 |
| GET | `/v1/video/generations/:id` | 查询状态 |
| GET | `/v1/video/generations/:id/result` | 获取结果 |
| **图像** ||
| POST | `/v1/images/generations` | 创建图像生成 |
| GET | `/v1/images/generations/:id` | 查询状态 |
| GET | `/v1/images/generations/:id/result` | 获取结果 |
| **通用** ||
| GET | `/v1/providers` | 列出 providers |
| POST | `/v1/providers/:provider` | 配置 provider |
| GET | `/v1/dashboard` | 仪表盘数据 |
| GET | `/dashboard` | Web UI |

---

## 开发

```bash
# 本地开发
npm run dev

# 运行测试
npm test

# 部署
npm run deploy:worker
```

---

## 许可证

MIT License

---

## 贡献

欢迎 PR！

- 添加更多 Provider
- 改进 Dashboard UI
- 增加批量生成功能
- 添加团队协作功能
