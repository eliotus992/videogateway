import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import { VideoGenerationRequestSchema } from '../types/schemas.js';
import type { VideoGenerationResponse, VideoGenerationResult, GenerationJob } from '../types/index.js';
import { ProviderRegistry, createProvider } from '../providers/index.js';
import { addGenerationJob, getJobStatus } from '../queue/index.js';
import { authMiddleware } from '../auth/api-keys.js';

const app = new Hono();

// Provider registry - 全局单例
const registry = new ProviderRegistry();

// 初始化 providers
export function initProvidersFromEnv() {
  if (process.env.SEEDANCE_API_KEY) {
    registry.register(createProvider('seedance', process.env.SEEDANCE_API_KEY));
  }
  if (process.env.KLING_API_KEY) {
    registry.register(createProvider('kling', process.env.KLING_API_KEY));
  }
  if (process.env.RUNWAY_API_KEY) {
    registry.register(createProvider('runway', process.env.RUNWAY_API_KEY));
  }
  
  console.log(`[Providers] Registered: ${registry.getAll().map(p => p.name).join(', ') || 'None'}`);
}

// 检查 providers 是否初始化
app.use('*', (c, next) => {
  if (registry.getAll().length === 0) {
    return c.json({ 
      error: 'No providers configured. Set SEEDANCE_API_KEY, KLING_API_KEY, or RUNWAY_API_KEY.',
      code: 'NO_PROVIDERS'
    }, 503);
  }
  return next();
});

// 应用认证中间件
app.use('*', authMiddleware);

// POST /v1/video/generations - 创建生成任务
app.post('/', async (c) => {
  const body = await c.req.json();
  
  // 验证请求
  const validated = VideoGenerationRequestSchema.parse(body);
  
  // 找到适合的 providers
  const providers = registry.findForRequest(validated);
  if (providers.length === 0) {
    return c.json({
      error: 'No provider available for the requested model',
      code: 'NO_PROVIDER'
    }, 400);
  }

  // 选择 provider（成本优化）
  const provider = providers[0];
  
  // 创建任务 ID
  const id = `vg_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  
  // 准备任务数据
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

  // 返回响应
  const response: VideoGenerationResponse = {
    id,
    status: 'pending',
    model: validated.model,
    provider: provider.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    estimated_seconds: provider.estimateTime(validated)
  };

  return c.json(response, 202); // 202 Accepted 表示异步处理
});

// GET /v1/video/generations/:id - 获取任务状态
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  
  // 从队列获取状态
  const jobStatus = await getJobStatus(id);
  
  if (!jobStatus) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  // 转换状态格式
  const statusMap: Record<string, string> = {
    'waiting': 'pending',
    'active': 'processing',
    'completed': 'completed',
    'failed': 'failed',
    'delayed': 'queued'
  };

  return c.json({
    id: jobStatus.id,
    status: statusMap[jobStatus.state] || jobStatus.state,
    progress: jobStatus.progress,
    created_at: new Date(jobStatus.created_at).toISOString(),
    ...(jobStatus.finished_at && { 
      completed_at: new Date(jobStatus.finished_at).toISOString() 
    }),
    ...(jobStatus.failed_reason && { error: jobStatus.failed_reason }),
    ...(jobStatus.returnvalue && { result: jobStatus.returnvalue })
  });
});

// GET /v1/video/generations/:id/result - 获取结果
app.get('/:id/result', async (c) => {
  const id = c.req.param('id');
  
  const jobStatus = await getJobStatus(id);
  
  if (!jobStatus) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  if (jobStatus.state !== 'completed') {
    return c.json({
      error: 'Generation not completed',
      status: jobStatus.state,
      progress: jobStatus.progress,
      code: 'NOT_READY'
    }, 400);
  }

  const result = jobStatus.returnvalue as VideoGenerationResult;
  
  return c.json({
    id,
    status: 'completed',
    video_url: result.video_url,
    provider: result.provider,
    created_at: new Date(jobStatus.created_at).toISOString(),
    completed_at: new Date(jobStatus.finished_at!).toISOString()
  });
});

// DELETE /v1/video/generations/:id - 取消任务
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  const jobStatus = await getJobStatus(id);
  
  if (!jobStatus) {
    return c.json({ error: 'Generation not found', code: 'NOT_FOUND' }, 404);
  }

  if (['completed', 'failed'].includes(jobStatus.state)) {
    return c.json({ 
      error: 'Cannot cancel completed generation', 
      code: 'INVALID_STATE' 
    }, 400);
  }

  // 从队列中移除
  const { generationQueue } = await import('../queue/index.js');
  await generationQueue.remove(id);

  return c.json({ 
    success: true, 
    message: 'Generation cancelled' 
  });
});

export const generationsRouter = app;
