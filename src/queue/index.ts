import { Queue, Worker } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import IORedis from 'ioredis';
import type { GenerationJob, VideoGenerationResult } from '../types/index.js';
import { ProviderRegistry } from '../providers/index.js';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false
});

// Webhook 事件类型
export type WebhookEvent = 
  | 'generation.started'
  | 'generation.progress'
  | 'generation.completed'
  | 'generation.failed';

// Webhook payload
export interface WebhookPayload {
  event: WebhookEvent;
  data: {
    id: string;
    status: string;
    progress?: number;
    video_url?: string;
    error?: string;
    provider?: string;
    cost_usd?: number;
    duration?: number;
  };
  timestamp: string;
  signature: string;
}

// Webhook 订阅记录
interface WebhookSubscription {
  id: string;
  user_id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  is_active: boolean;
  created_at: string;
}

// 内存存储（生产用数据库）
const webhookStore = new Map<string, WebhookSubscription>();

// Generation 队列
export const generationQueue = new Queue('video-generation', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 50
  }
});

// 添加生成任务
export async function addGenerationJob(
  jobData: GenerationJob,
  callbackUrl?: string
): Promise<{ id: string }> {
  const job = await generationQueue.add(jobData.id, {
    ...jobData,
    callback_url: callbackUrl
  }, {
    jobId: jobData.id
  });

  return { id: job.id as string };
}

// 创建 Worker
export function createGenerationWorker(registry: ProviderRegistry) {
  return new Worker('video-generation', async (job) => {
    const data = job.data as GenerationJob & { callback_url?: string };
    
    console.log(`[Worker] Processing job ${data.id}`);
    
    const provider = registry.get(data.provider);
    
    try {
      // 发送 started 事件
      await sendWebhook(data.id, 'generation.started', {
        id: data.id,
        status: 'processing',
        provider: data.provider
      }, data.callback_url);

      // 提交到 provider
      const { provider_job_id, estimated_seconds } = await provider.submit(data.request);
      
      // 更新进度
      await job.updateProgress(10);
      
      // 轮询状态
      const result = await pollWithProgress(
        job,
        provider,
        provider_job_id,
        data.id,
        data.callback_url,
        estimated_seconds
      );

      // 发送 completed/failed 事件
      if (result.status === 'completed') {
        await sendWebhook(data.id, 'generation.completed', {
          id: data.id,
          status: 'completed',
          video_url: result.video_url,
          provider: data.provider,
          duration: data.request.duration || 5
        }, data.callback_url);
      } else {
        await sendWebhook(data.id, 'generation.failed', {
          id: data.id,
          status: 'failed',
          error: result.error,
          provider: data.provider
        }, data.callback_url);
      }

      return result;
    } catch (error) {
      console.error(`[Worker] Job ${data.id} failed:`, error);
      
      await sendWebhook(data.id, 'generation.failed', {
        id: data.id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: data.provider
      }, data.callback_url);

      throw error;
    }
  }, { 
    connection,
    concurrency: 5 // 同时处理 5 个任务
  });
}

// 带进度轮询
async function pollWithProgress(
  job: any,
  provider: any,
  providerJobId: string,
  jobId: string,
  callbackUrl?: string,
  estimatedSeconds: number = 60
): Promise<{ status: string; video_url?: string; error?: string }> {
  const pollInterval = 5000; // 5 秒
  const maxPolls = Math.ceil((estimatedSeconds * 3) / (pollInterval / 1000)); // 3x 超时
  
  for (let i = 0; i < maxPolls; i++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    
    const status = await provider.checkStatus(providerJobId);
    
    // 计算进度
    const progress = status.progress || Math.min(10 + (i / maxPolls) * 80, 90);
    await job.updateProgress(progress);
    
    // 发送进度事件（每 20%）
    if (Math.floor(progress / 20) > Math.floor((progress - 5) / 20)) {
      await sendWebhook(jobId, 'generation.progress', {
        id: jobId,
        status: status.status,
        progress: Math.round(progress),
        provider: provider.id
      }, callbackUrl);
    }
    
    if (status.status === 'completed') {
      await job.updateProgress(100);
      return { status: 'completed', video_url: status.video_url };
    }
    
    if (status.status === 'failed') {
      return { status: 'failed', error: status.error };
    }
  }
  
  return { status: 'failed', error: 'Polling timeout' };
}

// 发送 Webhook
async function sendWebhook(
  jobId: string,
  event: WebhookEvent,
  data: any,
  callbackUrl?: string
): Promise<void> {
  if (!callbackUrl) return;
  
  const payload: WebhookPayload = {
    event,
    data,
    timestamp: new Date().toISOString(),
    signature: '' // TODO: 实现签名验证
  };

  // 重试 3 次
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': event,
          'X-Webhook-ID': uuidv4()
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`[Webhook] ${event} sent to ${callbackUrl}`);
        return;
      }
      
      console.warn(`[Webhook] Attempt ${i + 1} failed: ${response.status}`);
    } catch (error) {
      console.error(`[Webhook] Attempt ${i + 1} error:`, error);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
  }
  
  console.error(`[Webhook] Failed to send ${event} after 3 attempts`);
}

// 注册 Webhook（用户级）
export async function registerWebhook(
  userId: string,
  url: string,
  events: WebhookEvent[],
  secret: string
): Promise<{ id: string; secret: string }> {
  const id = `wh_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  
  const subscription: WebhookSubscription = {
    id,
    user_id: userId,
    url,
    events,
    secret,
    is_active: true,
    created_at: new Date().toISOString()
  };
  
  webhookStore.set(id, subscription);
  
  return { id, secret };
}

// 获取任务状态
export async function getJobStatus(jobId: string) {
  const job = await generationQueue.getJob(jobId);
  if (!job) return null;
  
  const state = await job.getState();
  const progress = job.progress;
  
  return {
    id: job.id,
    state,
    progress,
    attempts: job.attemptsMade,
    created_at: job.timestamp,
    processed_at: job.processedOn,
    finished_at: job.finishedOn,
    failed_reason: job.failedReason,
    returnvalue: job.returnvalue
  };
}
