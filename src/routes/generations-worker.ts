import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { VideoGenerationRequestSchema } from '../types/schemas.js';
import type { VideoGenerationResponse, GenerationJob } from '../types/index.js';
import { ProviderRegistry, createProvider } from '../providers/index.js';
import type { Bindings } from '../worker.js';

const app = new Hono<{ Bindings: Bindings }>();

// 获取 provider registry
function getRegistry(env: Bindings) {
  const registry = new ProviderRegistry();
  
  if (env.SEEDANCE_API_KEY) {
    registry.register(createProvider('seedance', env.SEEDANCE_API_KEY));
  }
  if (env.KLING_API_KEY) {
    registry.register(createProvider('kling', env.KLING_API_KEY));
  }
  if (env.RUNWAY_API_KEY) {
    registry.register(createProvider('runway', env.RUNWAY_API_KEY));
  }
  
  return registry;
}

// 检查 providers
app.use('*', (c, next) => {
  const registry = getRegistry(c.env);
  if (registry.getAll().length === 0) {
    return c.json({ 
      error: 'No providers configured',
      code: 'NO_PROVIDERS'
    }, 503);
  }
  return next();
});

// POST /v1/video/generations
app.post('/', async (c) => {
  const body = await c.req.json();
  const validated = VideoGenerationRequestSchema.parse(body);
  
  const registry = getRegistry(c.env);
  const providers = registry.findForRequest(validated);
  
  if (providers.length === 0) {
    return c.json({
      error: 'No provider available for the requested model',
      code: 'NO_PROVIDER'
    }, 400);
  }

  const provider = providers[0];
  const id = `vg_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  
  const jobData: GenerationJob = {
    id,
    request: validated,
    provider: provider.id,
    attempts: 0,
    max_attempts: 3,
    created_at: Date.now()
  };

  // 发送到 Queue
  await c.env.GENERATION_QUEUE.send(jobData);

  // 存储初始状态到 D1
  await c.env.DB.prepare(`
    INSERT INTO generations (id, status, model, provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(id, 'pending', validated.model, provider.id, 
    new Date().toISOString(), new Date().toISOString()).run();

  const response: VideoGenerationResponse = {
    id,
    status: 'pending',
    model: validated.model,
    provider: provider.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    estimated_seconds: provider.estimateTime(validated)
  };

  return c.json(response, 202);
});

// GET /v1/video/generations/:id
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM generations WHERE id = ?
  `).bind(id).first();
  
  if (!result) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  return c.json({
    id: result.id,
    status: result.status,
    progress: result.progress,
    model: result.model,
    provider: result.provider,
    created_at: result.created_at,
    updated_at: result.updated_at,
    ...(result.video_url && { video_url: result.video_url }),
    ...(result.error && { error: result.error })
  });
});

// GET /v1/video/generations/:id/result
app.get('/:id/result', async (c) => {
  const id = c.req.param('id');
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM generations WHERE id = ? AND status = 'completed'
  `).bind(id).first();
  
  if (!result) {
    return c.json({ error: 'Result not ready', code: 'NOT_READY' }, 400);
  }

  return c.json({
    id: result.id,
    status: 'completed',
    video_url: result.video_url,
    provider: result.provider,
    created_at: result.created_at,
    completed_at: result.updated_at
  });
});

// Queue 消费者
export async function handleGenerationQueue(
  batch: MessageBatch<GenerationJob>,
  env: Bindings
): Promise<void> {
  const registry = getRegistry(env);
  
  for (const message of batch.messages) {
    const job = message.body;
    
    try {
      const provider = registry.get(job.provider);
      
      // 更新状态为 processing
      await env.DB.prepare(`
        UPDATE generations SET status = ?, updated_at = ? WHERE id = ?
      `).bind('processing', new Date().toISOString(), job.id).run();
      
      // 提交到 provider
      const { provider_job_id } = await provider.submit(job.request);
      
      // 轮询结果（简化版，实际可用 Durable Objects）
      const pollResult = await pollProvider(provider, provider_job_id);
      
      if (pollResult.status === 'completed') {
        await env.DB.prepare(`
          UPDATE generations 
          SET status = ?, video_url = ?, updated_at = ? 
          WHERE id = ?
        `).bind('completed', pollResult.video_url, new Date().toISOString(), job.id).run();
      } else {
        await env.DB.prepare(`
          UPDATE generations 
          SET status = ?, error = ?, updated_at = ? 
          WHERE id = ?
        `).bind('failed', pollResult.error, new Date().toISOString(), job.id).run();
      }
      
      message.ack();
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      
      if (job.attempts < job.max_attempts) {
        message.retry();
      } else {
        await env.DB.prepare(`
          UPDATE generations 
          SET status = ?, error = ?, updated_at = ? 
          WHERE id = ?
        `).bind('failed', String(error), new Date().toISOString(), job.id).run();
        message.ack();
      }
    }
  }
}

async function pollProvider(
  provider: any,
  providerJobId: string,
  maxAttempts = 60
): Promise<{ status: string; video_url?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    
    const status = await provider.checkStatus(providerJobId);
    
    if (status.status === 'completed') {
      return { status: 'completed', video_url: status.video_url };
    }
    if (status.status === 'failed') {
      return { status: 'failed', error: status.error };
    }
  }
  
  return { status: 'failed', error: 'Polling timeout' };
}

export const generationsRouterWorker = app;
