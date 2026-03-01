import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';

import { generationsRouterWorker } from './routes/generations-worker.js';
import { keysRouterWorker } from './routes/keys-worker.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error.js';

// Workers 环境类型
export type Bindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  GENERATION_QUEUE: Queue;
  SEEDANCE_API_KEY?: string;
  KLING_API_KEY?: string;
  RUNWAY_API_KEY?: string;
  WEBHOOK_SECRET?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization']
}));
app.use('*', prettyJSON());

// Error handling
app.onError(errorHandler);

// Routes
app.route('/v1/video/generations', generationsRouterWorker);
app.route('/v1/keys', keysRouterWorker);
app.route('/health', healthRouter);

// Root
app.get('/', (c) => {
  const providers = [];
  if (c.env.SEEDANCE_API_KEY) providers.push('seedance');
  if (c.env.KLING_API_KEY) providers.push('kling');
  if (c.env.RUNWAY_API_KEY) providers.push('runway');

  return c.json({
    name: 'VideoGateway',
    version: '0.1.0',
    platform: 'Cloudflare Workers',
    providers,
    endpoints: {
      'POST /v1/video/generations': 'Create a video generation task',
      'GET /v1/video/generations/:id': 'Get generation status',
      'GET /v1/video/generations/:id/result': 'Get generation result',
      'DELETE /v1/video/generations/:id': 'Cancel generation',
      'POST /v1/keys': 'Create API key',
      'GET /v1/keys': 'List API keys',
      'GET /health': 'Health check'
    }
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

export default app;
