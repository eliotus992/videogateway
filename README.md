# VideoGateway

Unified AI video generation gateway with multi-provider support, cost-optimized routing, and async queue processing.

## Features

- 🎬 **Multi-Provider Support**: ByteDance Seedance, Kling AI, Runway ML (extensible)
- 💰 **Cost-Optimized Routing**: Automatically select the cheapest provider
- ⚡ **Async Queue**: Background job processing with progress tracking
- 🔌 **OpenAI-Compatible API**: Drop-in replacement for standard video generation APIs
- 🌐 **Edge-Ready**: Built with Hono, deployable to Cloudflare Workers

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys

# Run development server
npm run dev
```

## API Endpoints

### Create Generation

```bash
POST /v1/video/generations
Content-Type: application/json

{
  "model": "seedance-1.0",
  "prompt": "A cat dancing in a futuristic city",
  "duration": 5,
  "resolution": "1080p",
  "aspect_ratio": "16:9"
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

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 3000) |
| `SEEDANCE_API_KEY` | ByteDance Seedance API key | No |
| `KLING_API_KEY` | Kling AI API key | No |
| `RUNWAY_API_KEY` | Runway ML API key | No |
| `REDIS_URL` | Redis URL for queue | No (in-memory fallback) |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Client    │────▶│  VideoGateway    │────▶│   Provider A    │
└─────────────────┘     │  (Hono + Queue)  │     │  (Seedance)     │
                        │                  │     └─────────────────┘
                        │  - Routing       │
                        │  - Queue         │     ┌─────────────────┐
                        │  - Retry         │────▶│   Provider B    │
                        │                  │     │   (Kling)       │
                        └──────────────────┘     └─────────────────┘
```

## Roadmap

- [ ] Webhook callbacks
- [ ] Queue persistence (Redis/BullMQ)
- [ ] Cost tracking and analytics
- [ ] Rate limiting
- [ ] API key management
- [ ] Dashboard UI

## License

MIT
