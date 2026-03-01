# VideoGateway

Unified AI video generation gateway with multi-provider support, cost-optimized routing, and async queue processing.

## Features

- 🎬 **Multi-Provider Support**: ByteDance Seedance, Kling AI, Runway ML (extensible)
- 💰 **Cost-Optimized Routing**: Automatically select the cheapest provider
- ⚡ **Async Queue**: Background job processing with progress tracking
- 🔌 **OpenAI-Compatible API**: Drop-in replacement for standard video generation APIs
- 🔑 **API Key Management**: User-level API keys with rate limiting
- 🌐 **Webhook Callbacks**: Real-time progress updates
- 🚀 **Edge-Ready**: Built with Hono, deployable to Cloudflare Workers or Node.js

## Quick Start

### Option 1: Node.js + Railway/Render

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev
```

### Option 2: Cloudflare Workers

```bash
# Install Wrangler
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create videogateway

# Update wrangler.toml with your database_id

# Deploy
npm run deploy:worker
```

## API Endpoints

### Authentication

All API requests require authentication via Bearer token:

```bash
Authorization: Bearer vg_xxx.yyyyyyyy
```

### Create Generation

```bash
POST /v1/video/generations
Content-Type: application/json

{
  "model": "seedance-1.0",
  "prompt": "A cat dancing in a futuristic city",
  "duration": 5,
  "resolution": "1080p",
  "aspect_ratio": "16:9",
  "callback_url": "https://your-app.com/webhook"
}
```

Response:
```json
{
  "id": "vg_a1b2c3d4e5f6g7h8",
  "status": "pending",
  "model": "seedance-1.0",
  "provider": "seedance",
  "created_at": "2024-03-01T07:30:00Z",
  "estimated_seconds": 75
}
```

### Check Status

```bash
GET /v1/video/generations/:id
```

### Get Result

```bash
GET /v1/video/generations/:id/result
```

### Webhook Events

Your `callback_url` will receive these events:

```json
{
  "event": "generation.completed",
  "data": {
    "id": "vg_a1b2c3d4e5f6g7h8",
    "status": "completed",
    "video_url": "https://..."
  },
  "timestamp": "2024-03-01T07:31:15Z",
  "signature": "sha256=..."
}
```

## Environment Variables

### Node.js

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `SEEDANCE_API_KEY` | ByteDance Seedance API key | No |
| `KLING_API_KEY` | Kling AI API key | No |
| `RUNWAY_API_KEY` | Runway ML API key | No |
| `REDIS_URL` | Redis URL for queue | No (in-memory fallback) |

### Cloudflare Workers

| Secret | Description |
|--------|-------------|
| `SEEDANCE_API_KEY` | ByteDance Seedance API key |
| `KLING_API_KEY` | Kling AI API key |
| `RUNWAY_API_KEY` | Runway ML API key |
| `WEBHOOK_SECRET` | Secret for webhook signature |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Client    │────▶│  VideoGateway    │────▶│   Provider A    │
└─────────────────┘     │  (Hono + Queue)  │     │  (Seedance)     │
                        │                  │     └─────────────────┘
                        │  - Auth          │
                        │  - Routing       │     ┌─────────────────┐
                        │  - Queue         │────▶│   Provider B    │
                        │  - Webhooks      │     │   (Kling)       │
                        └──────────────────┘     └─────────────────┘
```

## Development

```bash
# Run tests
npm test

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format
```

## Supported Models

| Provider | Models | Pricing (USD/sec) |
|----------|--------|-------------------|
| Seedance | seedance-1.0, seedance-1.0-pro | 0.25-1.00 |
| Kling | kling-1.6, kling-1.0 | 0.20-0.80 |
| Runway | runway-gen3, runway-gen2 | 0.35-1.20 |

## Roadmap

- [x] Multi-provider support
- [x] Cost-optimized routing
- [x] Async queue processing
- [x] API key management
- [x] Webhook callbacks
- [x] Cloudflare Workers deployment
- [x] Comprehensive tests
- [ ] Dashboard UI
- [ ] Usage analytics
- [ ] Batch processing
- [ ] Custom model fine-tuning

## License

MIT

## Contributing

PRs welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
