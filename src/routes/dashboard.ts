import { Hono } from 'hono';
import type { Bindings } from '../worker.js';
import type { UsageStats, DashboardData } from '../types/index.js';

const app = new Hono<{ Bindings: Bindings }>();

// GET /v1/dashboard - 获取仪表盘数据
app.get('/', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const userId = apiKey.user_id;
  
  const usage = await getUsageStats(c.env.DB, userId);
  const recentVideos = await getRecentGenerations(c.env.DB, userId, 5);
  const recentImages = await getRecentImages(c.env.DB, userId, 5);
  const providersStatus = await getProvidersStatus(c.env, userId);
  
  const rateLimit = {
    limit: apiKey.rate_limit,
    used: await getRateLimitUsage(c.env.CACHE, userId),
    reset_at: new Date(Date.now() + 60 * 1000).toISOString()
  };
  
  const dashboard: DashboardData = {
    usage,
    recent_generations: recentVideos,
    recent_images: recentImages,
    providers_status: providersStatus,
    rate_limit_status: rateLimit
  };
  
  return c.json(dashboard);
});

// GET /v1/dashboard/stats
app.get('/stats', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const userId = apiKey.user_id;
  const days = parseInt(c.req.query('days') || '30');
  const type = c.req.query('type') || 'all'; // 'all', 'video', 'image'
  
  let usage;
  if (type === 'video') {
    usage = await getVideoStats(c.env.DB, userId, days);
  } else if (type === 'image') {
    usage = await getImageStats(c.env.DB, userId, days);
  } else {
    usage = await getUsageStats(c.env.DB, userId, days);
  }
  
  return c.json({ period_days: days, type, ...usage });
});

// 获取综合用量统计
async function getUsageStats(db: D1Database, userId: string, days: number = 30): Promise<UsageStats> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  // 视频统计
  const { results: videoTotals } = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status IN ('pending', 'processing', 'queued') THEN 1 ELSE 0 END) as pending,
      SUM(cost_usd) as total_cost
    FROM generations 
    WHERE user_id = ? AND created_at > ?
  `).bind(userId, since).all();
  
  // 图像统计
  const { results: imageTotals } = await db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(cost_usd) as total_cost
    FROM image_generations 
    WHERE user_id = ? AND created_at > ? AND status = 'completed'
  `).bind(userId, since).all();
  
  const video = videoTotals?.[0] as any || {};
  const image = imageTotals?.[0] as any || {};
  
  // Provider 统计（合并视频和图像）
  const { results: byProvider } = await db.prepare(`
    SELECT provider, 
      SUM(video_count) as video_count,
      SUM(image_count) as image_count,
      SUM(cost) as cost
    FROM (
      SELECT provider, 
        COUNT(*) as video_count,
        0 as image_count,
        SUM(cost_usd) as cost
      FROM generations 
      WHERE user_id = ? AND created_at > ? AND status = 'completed'
      GROUP BY provider
      UNION ALL
      SELECT provider,
        0 as video_count,
        COUNT(*) as image_count,
        SUM(cost_usd) as cost
      FROM image_generations
      WHERE user_id = ? AND created_at > ? AND status = 'completed'
      GROUP BY provider
    )
    GROUP BY provider
  `).bind(userId, since, userId, since).all();
  
  const byProviderMap: UsageStats['by_provider'] = {};
  for (const row of byProvider || []) {
    const r = row as any;
    byProviderMap[r.provider] = {
      count: r.video_count || 0,
      image_count: r.image_count || 0,
      cost_usd: r.cost || 0,
      avg_duration_seconds: 0
    };
  }
  
  // 按天统计（合并）
  const { results: byDay } = await db.prepare(`
    SELECT date, 
      SUM(video_count) as video_count,
      SUM(image_count) as image_count,
      SUM(cost) as cost
    FROM (
      SELECT DATE(created_at) as date,
        COUNT(*) as video_count,
        0 as image_count,
        SUM(cost_usd) as cost
      FROM generations 
      WHERE user_id = ? AND created_at > ?
      GROUP BY DATE(created_at)
      UNION ALL
      SELECT DATE(created_at) as date,
        0 as video_count,
        COUNT(*) as image_count,
        SUM(cost_usd) as cost
      FROM image_generations
      WHERE user_id = ? AND created_at > ?
      GROUP BY DATE(created_at)
    )
    GROUP BY date
    ORDER BY date DESC
    LIMIT 30
  `).bind(userId, since, userId, since).all();
  
  return {
    total_generations: video.total || 0,
    total_images: image.total || 0,
    completed: video.completed || 0,
    failed: video.failed || 0,
    pending: video.pending || 0,
    total_cost_usd: (video.total_cost || 0) + (image.total_cost || 0),
    by_provider: byProviderMap,
    by_day: (byDay || []).map((r: any) => ({
      date: r.date,
      count: r.video_count || 0,
      image_count: r.image_count || 0,
      cost_usd: r.cost || 0
    }))
  };
}

// 获取最近视频生成
async function getRecentGenerations(db: D1Database, userId: string, limit: number = 10) {
  const { results } = await db.prepare(`
    SELECT id, status, model, provider, video_url, cost_usd, created_at, completed_at
    FROM generations 
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(userId, limit).all();
  
  return results || [];
}

// 获取最近图像生成
async function getRecentImages(db: D1Database, userId: string, limit: number = 10) {
  const { results } = await db.prepare(`
    SELECT id, status, model, provider, image_urls, cost_usd, created_at, completed_at
    FROM image_generations 
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ?
  `).bind(userId, limit).all();
  
  return (results || []).map((r: any) => ({
    ...r,
    image_urls: r.image_urls ? JSON.parse(r.image_urls) : []
  }));
}

// 获取 Provider 状态（区分图像/视频）
async function getProvidersStatus(env: Bindings, userId: string) {
  const providers = [
    { id: 'seedance', name: 'ByteDance Seedance', video: true, image: true },
    { id: 'kling', name: 'Kling AI', video: true, image: false },
    { id: 'runway', name: 'Runway ML', video: true, image: false },
    { id: 'pika', name: 'Pika Labs', video: true, image: false },
    { id: 'luma', name: 'Luma AI', video: true, image: false },
    { id: 'haiper', name: 'Haiper AI', video: true, image: false },
    { id: 'hailuo', name: 'Hailuo AI', video: true, image: false },
    { id: 'stable-video', name: 'Stable Video', video: true, image: false },
    { id: 'stability', name: 'Stability AI', video: false, image: true },
    { id: 'replicate', name: 'Replicate', video: true, image: true },
  ];
  
  const status = [];
  
  for (const p of providers) {
    const userConfig = await env.DB.prepare(`
      SELECT created_at FROM user_providers 
      WHERE user_id = ? AND provider = ? AND is_active = 1
    `).bind(userId, p.id).first();
    
    const envKey = (env as any)[`${p.id.toUpperCase().replace(/-/g, '_')}_API_KEY`];
    const hasDefault = !!envKey;
    
    const lastUsed = await env.DB.prepare(`
      SELECT MAX(created_at) as last_used FROM (
        SELECT created_at FROM generations WHERE user_id = ? AND provider = ?
        UNION ALL
        SELECT created_at FROM image_generations WHERE user_id = ? AND provider = ?
      )
    `).bind(userId, p.id, userId, p.id).first();
    
    status.push({
      id: p.id,
      name: p.name,
      configured: !!userConfig || hasDefault,
      supports_video: p.video,
      supports_image: p.image,
      healthy: true,
      ...(lastUsed?.last_used && { last_used: lastUsed.last_used })
    });
  }
  
  return status;
}

async function getRateLimitUsage(cache: KVNamespace, userId: string): Promise<number> {
  const key = `ratelimit:${userId}:${new Date().toISOString().slice(0, 13)}`;
  const value = await cache.get(key);
  return value ? parseInt(value) : 0;
}

// 分别获取视频和图像统计
async function getVideoStats(db: D1Database, userId: string, days: number): Promise<Partial<UsageStats>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { results } = await db.prepare(`
    SELECT 
      COUNT(*) as total_generations,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(cost_usd) as total_cost_usd
    FROM generations 
    WHERE user_id = ? AND created_at > ?
  `).bind(userId, since).all();
  
  return results?.[0] as any || {};
}

async function getImageStats(db: D1Database, userId: string, days: number): Promise<Partial<UsageStats>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  
  const { results } = await db.prepare(`
    SELECT 
      COUNT(*) as total_images,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      SUM(cost_usd) as total_cost_usd
    FROM image_generations 
    WHERE user_id = ? AND created_at > ?
  `).bind(userId, since).all();
  
  return results?.[0] as any || {};
}

export { app as dashboardRouter };
export { getUsageStats };
