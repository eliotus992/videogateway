import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { errorHandler } from './middleware/error.js';
import { providersRouter } from './routes/providers.js';
import { generationsRouterV2 } from './routes/generations-v2.js';
import { keysRouterWorker } from './routes/keys-worker.js';
import { healthRouter } from './routes/health.js';

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
app.route('/v1/providers', providersRouter);      // Provider 配置
app.route('/v1/video/generations', generationsRouterV2);  // 生成任务（v2 支持用户 provider）
app.route('/v1/keys', keysRouterWorker);          // API Key 管理
app.route('/health', healthRouter);               // 健康检查

// Root
app.get('/', (c) => {
  // 检查部署者配置的 providers
  const defaultProviders = [];
  if (c.env.SEEDANCE_API_KEY) defaultProviders.push('seedance');
  if (c.env.KLING_API_KEY) defaultProviders.push('kling');
  if (c.env.RUNWAY_API_KEY) defaultProviders.push('runway');

  return c.json({
    name: 'VideoGateway',
    version: '0.2.0',
    platform: 'Cloudflare Workers',
    mode: 'Self-hosted',
    default_providers: defaultProviders,
    endpoints: {
      'GET /v1/providers': 'List available providers',
      'POST /v1/providers/:provider': 'Configure your provider API key',
      'DELETE /v1/providers/:provider': 'Remove provider configuration',
      'POST /v1/video/generations': 'Create video generation task',
      'GET /v1/video/generations/:id': 'Get generation status',
      'GET /v1/video/generations/:id/result': 'Get generation result',
      'DELETE /v1/video/generations/:id': 'Cancel generation',
      'POST /v1/keys': 'Create API key',
      'GET /v1/keys': 'List API keys',
      'GET /health': 'Health check'
    },
    docs: 'https://github.com/eliotus992/videogateway'
  });
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

export default app;
