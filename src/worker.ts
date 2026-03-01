import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { errorHandler } from './middleware/error.js';
import { providersRouter } from './routes/providers.js';
import { generationsRouterV2 } from './routes/generations-v2.js';
import { keysRouterWorker } from './routes/keys-worker.js';
import { dashboardRouter } from './routes/dashboard.js';
import { dashboardUIRouter } from './routes/dashboard-ui.js';
import { healthRouter } from './routes/health.js';
import { authMiddleware } from './auth/api-keys.js';

// Workers 环境类型
export type Bindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  GENERATION_QUEUE: Queue;
  SEEDANCE_API_KEY?: string;
  KLING_API_KEY?: string;
  RUNWAY_API_KEY?: string;
  PIKA_API_KEY?: string;
  LUMA_API_KEY?: string;
  HAIPER_API_KEY?: string;
  HAILUO_API_KEY?: string;
  STABLE_VIDEO_API_KEY?: string;
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

// Dashboard UI（公开访问）
app.route('/dashboard', dashboardUIRouter);

// API 路由（需要认证）
app.use('/v1/*', authMiddleware);
app.route('/v1/providers', providersRouter);
app.route('/v1/video/generations', generationsRouterV2);
app.route('/v1/keys', keysRouterWorker);
app.route('/v1/dashboard', dashboardRouter);
app.route('/health', healthRouter);

// Root
app.get('/', (c) => {
  const defaultProviders = [];
  if (c.env.SEEDANCE_API_KEY) defaultProviders.push('seedance');
  if (c.env.KLING_API_KEY) defaultProviders.push('kling');
  if (c.env.RUNWAY_API_KEY) defaultProviders.push('runway');
  if (c.env.PIKA_API_KEY) defaultProviders.push('pika');
  if (c.env.LUMA_API_KEY) defaultProviders.push('luma');
  if (c.env.HAIPER_API_KEY) defaultProviders.push('haiper');
  if (c.env.HAILUO_API_KEY) defaultProviders.push('hailuo');
  if (c.env.STABLE_VIDEO_API_KEY) defaultProviders.push('stable-video');

  return c.json({
    name: 'VideoGateway',
    version: '0.3.0',
    platform: 'Cloudflare Workers',
    mode: 'Self-hosted',
    default_providers: defaultProviders,
    supported_providers: [
      'seedance', 'kling', 'runway', 'pika', 
      'luma', 'haiper', 'hailuo', 'stable-video'
    ],
    dashboard: '/dashboard',
    endpoints: {
      'GET /dashboard': 'Web Dashboard UI',
      'GET /v1/providers': 'List available providers',
      'POST /v1/providers/:provider': 'Configure your provider API key',
      'POST /v1/video/generations': 'Create video generation task',
      'GET /v1/video/generations/:id': 'Get generation status',
      'GET /v1/dashboard': 'Get dashboard data',
      'GET /v1/dashboard/stats': 'Get usage statistics',
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
