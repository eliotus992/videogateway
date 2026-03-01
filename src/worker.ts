import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';
import { errorHandler } from './middleware/error.js';
import { providersRouter } from './routes/providers.js';
import { generationsRouterV2 } from './routes/generations-v2.js';
import { imagesRouter } from './routes/images.js';
import { keysRouterWorker } from './routes/keys-worker.js';
import { dashboardRouter } from './routes/dashboard.js';
import { dashboardUIRouter } from './routes/dashboard-ui.js';
import { healthRouter } from './routes/health.js';
import { authMiddleware } from './auth/api-keys.js';

export type Bindings = {
  DB: D1Database;
  CACHE: KVNamespace;
  GENERATION_QUEUE: Queue;
  // Video providers
  SEEDANCE_API_KEY?: string;
  KLING_API_KEY?: string;
  RUNWAY_API_KEY?: string;
  PIKA_API_KEY?: string;
  LUMA_API_KEY?: string;
  HAIPER_API_KEY?: string;
  HAILUO_API_KEY?: string;
  STABLE_VIDEO_API_KEY?: string;
  // Image providers
  STABILITY_API_KEY?: string;
  REPLICATE_API_KEY?: string;
  OPENAI_API_KEY?: string;
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

// Dashboard UI (public)
app.route('/dashboard', dashboardUIRouter);

// API routes (auth required)
app.use('/v1/*', authMiddleware);
app.route('/v1/providers', providersRouter);
app.route('/v1/video/generations', generationsRouterV2);
app.route('/v1/images/generations', imagesRouter);  // 新增图像生成
app.route('/v1/keys', keysRouterWorker);
app.route('/v1/dashboard', dashboardRouter);
app.route('/health', healthRouter);

// Root
app.get('/', (c) => {
  const videoProviders = [];
  const imageProviders = [];
  
  if (c.env.SEEDANCE_API_KEY) videoProviders.push('seedance');
  if (c.env.KLING_API_KEY) videoProviders.push('kling');
  if (c.env.RUNWAY_API_KEY) videoProviders.push('runway');
  if (c.env.PIKA_API_KEY) videoProviders.push('pika');
  if (c.env.LUMA_API_KEY) videoProviders.push('luma');
  if (c.env.HAIPER_API_KEY) videoProviders.push('haiper');
  if (c.env.HAILUO_API_KEY) videoProviders.push('hailuo');
  if (c.env.STABLE_VIDEO_API_KEY) videoProviders.push('stable-video');
  
  if (c.env.STABILITY_API_KEY) imageProviders.push('stability');
  if (c.env.REPLICATE_API_KEY) imageProviders.push('replicate');
  if (c.env.OPENAI_API_KEY) imageProviders.push('openai');

  return c.json({
    name: 'VideoGateway',
    version: '0.4.0',
    platform: 'Cloudflare Workers',
    mode: 'Self-hosted',
    video_providers: videoProviders,
    image_providers: imageProviders,
    dashboard: '/dashboard',
    endpoints: {
      // Video
      'POST /v1/video/generations': 'Create video generation',
      'GET /v1/video/generations/:id': 'Get video status',
      // Image (NEW)
      'POST /v1/images/generations': 'Create image generation',
      'GET /v1/images/generations/:id': 'Get image status',
      'GET /v1/images/generations/:id/result': 'Get image result',
      // Provider
      'GET /v1/providers': 'List providers',
      'POST /v1/providers/:provider': 'Configure provider',
      // Dashboard
      'GET /v1/dashboard': 'Get dashboard data',
      'GET /v1/dashboard/stats': 'Get usage statistics'
    },
    docs: 'https://github.com/eliotus992/videogateway'
  });
});

app.notFound((c) => {
  return c.json({ error: 'Not found', code: 'NOT_FOUND' }, 404);
});

export default app;
