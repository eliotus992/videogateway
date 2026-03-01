import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { VideoGenerationRequestSchema } from '../types/schemas.js';
import type { VideoGenerationResponse, GenerationJob } from '../types/index.js';
import { ProviderRegistry, createProvider } from '../providers/index.js';
import { addGenerationJob, getJobStatus } from '../queue/index.js';
import { authMiddleware } from '../auth/api-keys.js';
import { getProviderKey, isProviderAvailable } from './providers.js';
import type { Bindings } from '../worker.js';

const app = new Hono<{ Bindings: Bindings }>();

// 获取 provider registry（使用用户或默认的 key）
async function getRegistry(env: Bindings, userId: string): Promise<ProviderRegistry> {
  const registry = new ProviderRegistry();
  
  // 尝试加载每个 provider
  const providers = ['seedance', 'kling', 'runway'];
  
  for (const providerId of providers) {
    const apiKey = await getProviderKey(env.DB, env, userId, providerId);
    if (apiKey) {
      try {
        registry.register(createProvider(providerId as any, apiKey));
      } catch (e) {
        console.warn(`Failed to register provider ${providerId}:`, e);
      }
    }
  }
  
  return registry;
}

// 检查 providers
app.use('*', authMiddleware);
app.use('*', async (c, next) => {
  const apiKey = c.get('apiKey') as any;
  const registry = await getRegistry(c.env, apiKey.user_id);
  
  if (registry.getAll().length === 0) {
    return c.json({ 
      error: 'No providers configured',
      message: 'Please configure your provider API keys via POST /v1/providers/:provider',
      code: 'NO_PROVIDERS',
      docs: 'https://github.com/eliotus992/videogateway#configure-providers'
    }, 503);
  }
  
  c.set('registry', registry);
  return next();
});

// POST /v1/video/generations
app.post('/', async (c) => {
  const body = await c.req.json();
  const apiKey = c.get('apiKey') as any;
  const registry = c.get('registry') as ProviderRegistry;
  
  // 验证请求
  const validated = VideoGenerationRequestSchema.parse(body);
  
  // 找到适合的 providers
  const providers = registry.findForRequest(validated);
  
  if (providers.length === 0) {
    // 检查是否是用户没配置这个 provider
    const requestedProvider = validated.model.split('-')[0]; // seedance-1.0 → seedance
    const hasKey = await isProviderAvailable(c.env.DB, c.env, apiKey.user_id, requestedProvider);
    
    if (!hasKey) {
      return c.json({
        error: `Provider '${requestedProvider}' not configured`,
        message: `Please configure ${requestedProvider} API key via POST /v1/providers/${requestedProvider}`,
        code: 'PROVIDER_NOT_CONFIGURED'
      }, 400);
    }
    
    return c.json({
      error: 'No provider available for the requested model',
      code: 'NO_PROVIDER'
    }, 400);
  }

  // 选择 provider（成本优化）
  const provider = providers[0];
  
  // 创建任务
  const id = `vg_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  
  const jobData: GenerationJob = {
    id,
    request: validated,
    provider: provider.id,
    attempts: 0,
    max_attempts: 3,
    created_at: Date.now()
  };

  // 添加到队列
  await addGenerationJob(jobData, validated.callback_url);

  // 存储到 D1
  await c.env.DB.prepare(`
    INSERT INTO generations (id, user_id, status, model, provider, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    apiKey.user_id,
    'pending',
    validated.model,
    provider.id,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return c.json({
    id,
    status: 'pending',
    model: validated.model,
    provider: provider.id,
    created_at: new Date().toISOString(),
    estimated_seconds: provider.estimateTime(validated)
  } as VideoGenerationResponse, 202);
});

// GET /v1/video/generations/:id
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as any;
  
  // 检查权限（只能看自己的）
  const result = await c.env.DB.prepare(`
    SELECT * FROM generations WHERE id = ? AND user_id = ?
  `).bind(id, apiKey.user_id).first();
  
  if (!result) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  // 获取队列状态
  const jobStatus = await getJobStatus(id);

  return c.json({
    id: result.id,
    status: result.status,
    progress: jobStatus?.progress || result.progress,
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
  const apiKey = c.get('apiKey') as any;
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM generations WHERE id = ? AND user_id = ? AND status = 'completed'
  `).bind(id, apiKey.user_id).first();
  
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

// DELETE /v1/video/generations/:id
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as any;
  
  const result = await c.env.DB.prepare(`
    SELECT status FROM generations WHERE id = ? AND user_id = ?
  `).bind(id, apiKey.user_id).first();
  
  if (!result) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  if (['completed', 'failed'].includes(result.status as string)) {
    return c.json({ 
      error: 'Cannot cancel completed generation', 
      code: 'INVALID_STATE' 
    }, 400);
  }

  await c.env.DB.prepare(`
    UPDATE generations SET status = 'cancelled', updated_at = ? WHERE id = ?
  `).bind(new Date().toISOString(), id).run();

  return c.json({ success: true, message: 'Generation cancelled' });
});

export const generationsRouterV2 = app;
