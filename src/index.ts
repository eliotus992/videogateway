import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { prettyJSON } from 'hono/pretty-json';

import { generationsRouter } from './routes/generations.js';
import { healthRouter } from './routes/health.js';
import { errorHandler } from './middleware/error.js';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors());
app.use('*', prettyJSON());

// Error handling
app.onError(errorHandler);

// Routes
app.route('/v1/video/generations', generationsRouter);
app.route('/health', healthRouter);

// Root
app.get('/', (c) => {
  return c.json({
    name: 'VideoGateway',
    version: '0.1.0',
    description: 'Unified AI video generation gateway',
    endpoints: {
      'POST /v1/video/generations': 'Create a video generation task',
      'GET /v1/video/generations/:id': 'Get generation status',
      'GET /v1/video/generations/:id/result': 'Get generation result',
      'GET /health': 'Health check'
    }
  });
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

console.log(`🎬 VideoGateway starting on port ${port}`);

serve({
  fetch: app.fetch,
  port
});

export default app;
