import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { ImageGenerationRequest, ImageGenerationResponse, GenerationJob } from '../types/index.js';
import type { ImageProviderAdapter } from '../providers/seedream.js';
import { authMiddleware } from '../auth/api-keys.js';
import type { Bindings } from '../worker.js';

// 图像生成请求 Schema
const ImageGenerationRequestSchema = z.object({
  model: z.enum([
    'seedream-v1', 'seedream-v2',
    'stable-diffusion-xl-1024-v1-0', 'stable-diffusion-v1-6', 'stable-image-core', 'stable-image-ultra',
    'replicate-sdxl', 'replicate-flux', 'replicate-kandinsky',
    'dall-e-3', 'dall-e-2'
  ]),
  prompt: z.string().min(1).max(4000),
  negative_prompt: z.string().max(2000).optional(),
  n: z.number().int().min(1).max(10).optional().default(1),
  size: z.enum(['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792', '2048x2048']).optional().default('1024x1024'),
  quality: z.enum(['standard', 'hd']).optional().default('standard'),
  style: z.enum(['vivid', 'natural', 'photographic', 'anime', 'digital-art', 'cinematic']).optional(),
  image_url: z.string().url().optional(), // 图生图
  seed: z.number().optional(),
  callback_url: z.string().url().optional(),
  metadata: z.record(z.string()).optional()
});

const app = new Hono<{ Bindings: Bindings }>();

// 获取图像生成 provider
async function getImageProvider(env: Bindings, userId: string, model: string): Promise<ImageProviderAdapter | null> {
  const { getProviderKey } = await import('./providers.js');
  
  // 根据模型确定 provider
  let providerId: string;
  if (model.startsWith('seedream')) providerId = 'seedance';
  else if (model.startsWith('stable-')) providerId = 'stability';
  else if (model.startsWith('replicate-')) providerId = 'replicate';
  else if (model.startsWith('dall-e')) providerId = 'openai'; // 需要额外处理
  else return null;

  // 获取 key
  const apiKey = await getProviderKey(env.DB, env, userId, providerId);
  if (!apiKey) return null;

  // 创建 provider 实例
  const { createProvider } = await import('../providers/index.js');
  const provider = createProvider(providerId as any, apiKey);
  
  // 检查是否支持图像生成
  if (!('supportsImageGeneration' in provider) || !provider.supportsImageGeneration()) {
    return null;
  }
  
  return provider as ImageProviderAdapter;
}

// 应用认证
app.use('*', authMiddleware);

// POST /v1/images/generations - 创建图像生成任务
app.post('/', async (c) => {
  const body = await c.req.json();
  const apiKey = c.get('apiKey') as any;
  
  // 验证请求
  const validated = ImageGenerationRequestSchema.parse(body);
  
  // 获取 provider
  const provider = await getImageProvider(c.env, apiKey.user_id, validated.model);
  
  if (!provider) {
    return c.json({
      error: `Provider for model '${validated.model}' not configured`,
      message: `Please configure the provider API key via POST /v1/providers/:provider`,
      code: 'PROVIDER_NOT_CONFIGURED'
    }, 400);
  }

  // 创建任务 ID
  const id = `img_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  
  // 存储到 D1
  await c.env.DB.prepare(`
    INSERT INTO image_generations (id, user_id, status, model, provider, prompt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    apiKey.user_id,
    'pending',
    validated.model,
    (provider as any).id,
    validated.prompt,
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  // 提交到 provider（图像生成通常是同步或快速异步）
  try {
    const { provider_job_id, estimated_seconds } = await provider.submitImage(validated);
    
    // 更新为 processing
    await c.env.DB.prepare(`
      UPDATE image_generations SET status = ?, provider_job_id = ? WHERE id = ?
    `).bind('processing', provider_job_id, id).run();

    // 如果是快速生成，直接轮询结果
    if (estimated_seconds <= 15) {
      // 后台轮询
      pollImageStatus(c.env, id, provider, provider_job_id, validated.callback_url);
    }

    return c.json({
      id,
      status: 'processing',
      model: validated.model,
      provider: (provider as any).id,
      created_at: new Date().toISOString(),
      estimated_seconds
    } as ImageGenerationResponse, 202);
    
  } catch (error) {
    await c.env.DB.prepare(`
      UPDATE image_generations SET status = ?, error = ? WHERE id = ?
    `).bind('failed', String(error), id).run();
    
    throw error;
  }
});

// GET /v1/images/generations/:id - 获取状态
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as any;
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM image_generations WHERE id = ? AND user_id = ?
  `).bind(id, apiKey.user_id).first();
  
  if (!result) {
    return c.json({ error: 'Image generation not found', code: 'NOT_FOUND' }, 404);
  }

  return c.json({
    id: result.id,
    status: result.status,
    model: result.model,
    provider: result.provider,
    progress: result.progress,
    created_at: result.created_at,
    updated_at: result.updated_at,
    ...(result.image_urls && { images: JSON.parse(result.image_urls) }),
    ...(result.error && { error: result.error })
  });
});

// GET /v1/images/generations/:id/result - 获取结果
app.get('/:id/result', async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as any;
  
  const result = await c.env.DB.prepare(`
    SELECT * FROM image_generations 
    WHERE id = ? AND user_id = ? AND status = 'completed'
  `).bind(id, apiKey.user_id).first();
  
  if (!result) {
    return c.json({ error: 'Result not ready', code: 'NOT_READY' }, 400);
  }

  return c.json({
    id: result.id,
    status: 'completed',
    images: JSON.parse(result.image_urls || '[]'),
    model: result.model,
    provider: result.provider,
    created_at: result.created_at,
    completed_at: result.updated_at,
    cost_usd: result.cost_usd
  });
});

// 轮询图像生成状态
async function pollImageStatus(
  env: Bindings,
  id: string,
  provider: ImageProviderAdapter,
  providerJobId: string,
  callbackUrl?: string
): Promise<void> {
  const maxAttempts = 30;
  const interval = 2000; // 2 秒
  
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, interval));
    
    try {
      const status = await provider.checkImageStatus(providerJobId);
      
      // 更新进度
      await env.DB.prepare(`
        UPDATE image_generations SET progress = ?, updated_at = ? WHERE id = ?
      `).bind(status.progress || Math.round((i / maxAttempts) * 100), new Date().toISOString(), id).run();
      
      if (status.status === 'completed') {
        // 计算成本
        const { estimateImageCost } = provider;
        const cost = estimateImageCost({ model: 'seedream-v1', prompt: '' }); // 简化
        
        await env.DB.prepare(`
          UPDATE image_generations 
          SET status = ?, image_urls = ?, cost_usd = ?, updated_at = ? 
          WHERE id = ?
        `).bind(
          'completed',
          JSON.stringify([{ url: status.image_url }]),
          cost,
          new Date().toISOString(),
          id
        ).run();
        
        // 发送 webhook
        if (callbackUrl) {
          await fetch(callbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'image.completed',
              data: { id, status: 'completed', image_url: status.image_url },
              timestamp: new Date().toISOString()
            })
          });
        }
        
        return;
      }
      
      if (status.status === 'failed') {
        await env.DB.prepare(`
          UPDATE image_generations SET status = ?, error = ? WHERE id = ?
        `).bind('failed', status.error, id).run();
        return;
      }
    } catch (error) {
      console.error(`Poll error for ${id}:`, error);
    }
  }
  
  // 超时
  await env.DB.prepare(`
    UPDATE image_generations SET status = ?, error = ? WHERE id = ?
  `).bind('failed', 'Polling timeout', id).run();
}

export const imagesRouter = app;
