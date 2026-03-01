import { Hono } from 'hono';
import type { Bindings } from '../worker.js';
import * as crypto from 'crypto';

const app = new Hono<{ Bindings: Bindings }>();

// 加密/解密 API Key（简单 XOR + base64，生产用更安全的方案）
function encrypt(text: string, secret: string): string {
  const xor = text.split('').map((c, i) => 
    String.fromCharCode(c.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))
  ).join('');
  return Buffer.from(xor).toString('base64');
}

function decrypt(encrypted: string, secret: string): string {
  const xor = Buffer.from(encrypted, 'base64').toString();
  return xor.split('').map((c, i) => 
    String.fromCharCode(c.charCodeAt(0) ^ secret.charCodeAt(i % secret.length))
  ).join('');
}

// GET /v1/providers - 列出可用的 providers
app.get('/', async (c) => {
  const apiKey = c.get('apiKey') as any;
  const secret = c.env.WEBHOOK_SECRET || 'default-secret';
  
  // 检查部署者配置的默认 providers
  const defaultProviders = [];
  if (c.env.SEEDANCE_API_KEY) defaultProviders.push('seedance');
  if (c.env.KLING_API_KEY) defaultProviders.push('kling');
  if (c.env.RUNWAY_API_KEY) defaultProviders.push('runway');
  
  // 检查用户自己配置的 providers
  const { results } = await c.env.DB.prepare(`
    SELECT provider, created_at FROM user_providers 
    WHERE user_id = ? AND is_active = 1
  `).bind(apiKey.user_id).all();
  
  const userProviders = (results || []).map((r: any) => r.provider);
  
  return c.json({
    default_providers: defaultProviders,  // 部署者配置的
    user_providers: userProviders,         // 用户自己绑定的
    available: [...new Set([...defaultProviders, ...userProviders])]
  });
});

// POST /v1/providers/:provider - 配置用户的 provider API Key
app.post('/:provider', async (c) => {
  const provider = c.req.param('provider');
  const apiKey = c.get('apiKey') as any;
  const { api_key } = await c.req.json();
  
  if (!api_key) {
    return c.json({ error: 'api_key is required', code: 'MISSING_KEY' }, 400);
  }
  
  // 验证 provider 合法性
  const validProviders = ['seedance', 'kling', 'runway', 'pika', 'luma'];
  if (!validProviders.includes(provider)) {
    return c.json({ error: 'Invalid provider', valid: validProviders }, 400);
  }
  
  const secret = c.env.WEBHOOK_SECRET || 'default-secret';
  const encrypted = encrypt(api_key, secret);
  
  // 保存或更新
  await c.env.DB.prepare(`
    INSERT INTO user_providers (id, user_id, provider, api_key_encrypted, is_active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
    ON CONFLICT(user_id, provider) DO UPDATE SET
      api_key_encrypted = excluded.api_key_encrypted,
      updated_at = excluded.created_at
  `).bind(
    crypto.randomUUID(),
    apiKey.user_id,
    provider,
    encrypted,
    new Date().toISOString()
  ).run();
  
  return c.json({
    success: true,
    provider,
    message: `${provider} API key configured successfully`
  });
});

// GET /v1/providers/:provider - 获取 provider 状态（不含 key）
app.get('/:provider', async (c) => {
  const provider = c.req.param('provider');
  const apiKey = c.get('apiKey') as any;
  
  const result = await c.env.DB.prepare(`
    SELECT provider, created_at, updated_at, is_active 
    FROM user_providers 
    WHERE user_id = ? AND provider = ?
  `).bind(apiKey.user_id, provider).first();
  
  if (!result) {
    // 检查是否是部署者配置的默认 provider
    const envKey = `${provider.toUpperCase()}_API_KEY`;
    const hasDefault = !!(c.env as any)[envKey];
    
    return c.json({
      provider,
      configured: false,
      has_default: hasDefault,
      message: hasDefault 
        ? 'Using default provider (deployer configured)'
        : 'Not configured'
    });
  }
  
  return c.json({
    provider,
    configured: true,
    is_active: result.is_active,
    created_at: result.created_at,
    updated_at: result.updated_at
  });
});

// DELETE /v1/providers/:provider - 删除用户配置的 provider
app.delete('/:provider', async (c) => {
  const provider = c.req.param('provider');
  const apiKey = c.get('apiKey') as any;
  
  await c.env.DB.prepare(`
    DELETE FROM user_providers 
    WHERE user_id = ? AND provider = ?
  `).bind(apiKey.user_id, provider).run();
  
  return c.json({
    success: true,
    provider,
    message: `${provider} configuration removed`
  });
});

// Helper: 获取用户或默认的 provider key
export async function getProviderKey(
  db: D1Database,
  env: Bindings,
  userId: string,
  provider: string
): Promise<string | null> {
  // 1. 先查用户自己配置的
  const userConfig = await db.prepare(`
    SELECT api_key_encrypted FROM user_providers 
    WHERE user_id = ? AND provider = ? AND is_active = 1
  `).bind(userId, provider).first();
  
  if (userConfig) {
    const secret = env.WEBHOOK_SECRET || 'default-secret';
    return decrypt(userConfig.api_key_encrypted as string, secret);
  }
  
  // 2.  fallback 到部署者配置的默认 key
  const envKey = `${provider.toUpperCase()}_API_KEY`;
  return (env as any)[envKey] || null;
}

// Helper: 检查 provider 是否可用
export async function isProviderAvailable(
  db: D1Database,
  env: Bindings,
  userId: string,
  provider: string
): Promise<boolean> {
  const key = await getProviderKey(db, env, userId, provider);
  return !!key;
}

export { app as providersRouter };
export { getProviderKey, isProviderAvailable };
