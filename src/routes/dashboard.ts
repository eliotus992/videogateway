import { Hono } from 'hono';
import type { Bindings } from '../worker.js';
import type { UsageStats, DashboardData } from '../types/index.js';

const app = new Hono<{ Bindings: Bindings }>();

// GET /v1/dashboard - 获取仪表盘数据
app.get('/', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const userId = apiKey.user_id;
  
  // 获取用量统计
  const usage = await getUsageStats(c.env.DB, userId);
  
  // 获取最近的生成任务
  const recent = await getRecentGenerations(c.env.DB, userId, 10);
  
  // 获取 Provider 状态
  const providersStatus = await getProvidersStatus(c.env, userId);
  
  // 获取速率限制状态
  const rateLimit = {
    limit: apiKey.rate_limit,
    used: await getRateLimitUsage(c.env.CACHE, userId),
    reset_at: new Date(Date.now() + 60 * 1000).toISOString()
  };
  
  const dashboard: DashboardData = {
    usage,
    recent_generations: recent,
    providers_status: providersStatus,
    rate_limit_status: rateLimit
  };
  
  return c.json(dashboard);
});

// GET /v1/dashboard/stats - 获取统计详情
app.get('/stats', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const userId = apiKey.user_id;
  const days = parseInt(c.req.query('days') || '30');
  
  const usage = await getUsageStats(c.env.DB, userId, days);
  
  return c.json({
    period_days: days,
    ...usage
  });
});

// GET /v1/dashboard/providers - Provider 详细状态
app.get('/providers', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const userId = apiKey.user_id;
  
  const providersStatus = await getProvidersStatus(c.env, userId);
  
  return c.json({
    providers: providersStatus
  });
});

// 获取用量统计
async function getUsageStats(
  db: D1Database, 
  userId: string, 
  days: number = 30
): Promise<UsageStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  // 总计统计
  const { results: totals } = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status IN ('pending', 'processing', 'queued') THEN 1 ELSE 0 END) as pending,
      SUM(cost_usd) as total_cost
    FROM generations 
    WHERE user_id = ? AND created_at > ?
  `).bind(userId, since).all();
  
  const total = totals?.[0] as any || { total: 0, completed: 0, failed: 0, pending: 0, total_cost: 0 };
  
  // 按 Provider 统计
  const { results: byProvider } = await db.prepare(`
    SELECT 
      provider,
      COUNT(*) as count,
      SUM(cost_usd) as cost,
      AVG(duration) as avg_duration
    FROM generations 
    WHERE user_id = ? AND created_at > ? AND status = 'completed'
    GROUP BY provider
  `).bind(userId, since).all();
  
  const byProviderMap: UsageStats['by_provider'] = {};
  for (const row of byProvider || []) {
    const r = row as any;
    byProviderMap[r.provider] = {
      count: r.count,
      cost_usd: r.cost || 0,
      avg_duration_seconds: r.avg_duration || 0
    };
  }
  
  // 按天统计
  const { results: byDay } = await db.prepare(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as count,
      SUM(cost_usd) as cost
    FROM generations 
    WHERE user_id = ? AND created_at > ?
    GROUP BY DATE(created_at)
    ORDER BY date DESC
    LIMIT 30
  `).bind(userId, since).all();
  
  return {
    total_generations: total.total || 0,
    completed: total.completed || 0,
    failed: total.failed || 0,
    pending: total.pending || 0,
    total_cost_usd: total.total_cost || 0,
    by_provider: byProviderMap,
    by_day: (byDay || []).map((r: any) => ({
      date: r.date,
      count: r.count,
      cost_usd: r.cost || 0
    }))
  };
}

// 获取最近的生成任务
async function getRecentGenerations(
  db: D1Database,
  userId: string,
  limit: number = 10
): Promise<any[]> {
  const { results } = await db.prepare(`
    SELECT 
      id,
      status,
      model,
      provider,
      video_url,
      cost_usd,
      created_at,
      completed_at
    FROM generations 
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(userId, limit).all();
  
  return results || [];
}

// 获取 Provider 状态
async function getProvidersStatus(
  env: Bindings,
  userId: string
): Promise<DashboardData['providers_status']> {
  const providers = [
    { id: 'seedance', name: 'ByteDance Seedance' },
    { id: 'kling', name: 'Kling AI' },
    { id: 'runway', name: 'Runway ML' },
    { id: 'pika', name: 'Pika Labs' },
    { id: 'luma', name: 'Luma AI' },
    { id: 'haiper', name: 'Haiper AI' },
    { id: 'hailuo', name: 'Hailuo AI' },
    { id: 'stable-video', name: 'Stable Video' }
  ] as const;
  
  const status = [];
  
  for (const p of providers) {
    // 检查用户是否配置了
    const userConfig = await env.DB.prepare(`
      SELECT created_at FROM user_providers 
      WHERE user_id = ? AND provider = ? AND is_active = 1
    `).bind(userId, p.id).first();
    
    // 检查部署者是否配置了默认 key
    const envKey = (env as any)[`${p.id.toUpperCase().replace(/-/g, '_')}_API_KEY`];
    const hasDefault = !!envKey;
    
    // 获取最近使用
    const lastUsed = await env.DB.prepare(`
      SELECT MAX(created_at) as last_used 
      FROM generations 
      WHERE user_id = ? AND provider = ?
    `).bind(userId, p.id).first();
    
    status.push({
      id: p.id,
      name: p.name,
      configured: !!userConfig || hasDefault,
      healthy: true, // TODO: 健康检查
      ...(lastUsed?.last_used && { last_used: lastUsed.last_used })
    });
  }
  
  return status;
}

// 获取速率限制使用量
async function getRateLimitCache(cache: KVNamespace, userId: string): Promise<number> {
  const key = `ratelimit:${userId}:${new Date().toISOString().slice(0, 13)}`; // 按小时
  const value = await cache.get(key);
  return value ? parseInt(value) : 0;
}

async function getRateLimitUsage(cache: KVNamespace, userId: string): Promise<number> {
  return await getRateLimitCache(cache, userId);
}

// 记录生成任务成本
export async function recordGenerationCost(
  db: D1Database,
  generationId: string,
  costUsd: number
): Promise<void> {
  await db.prepare(`
    UPDATE generations SET cost_usd = ? WHERE id = ?
  `).bind(costUsd, generationId).run();
}

export { app as dashboardRouter };
