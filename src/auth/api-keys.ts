import { Hono } from 'hono';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import type { MiddlewareHandler } from 'hono';

// API Key 存储（生产环境用 D1/Postgres）
interface ApiKey {
  id: string;
  key_hash: string;
  name: string;
  user_id: string;
  permissions: string[];
  rate_limit: number;
  created_at: string;
  last_used_at?: string;
  expires_at?: string;
  is_active: boolean;
}

// 内存存储（MVP 用，生产换数据库）
const apiKeysStore = new Map<string, ApiKey>();
const keyUsageStore = new Map<string, { count: number; resetAt: number }>();

// 速率限制窗口（1分钟）
const RATE_LIMIT_WINDOW = 60 * 1000;

// 验证 API Key 的中间件
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: 'Missing Authorization header', code: 'UNAUTHORIZED' }, 401);
  }

  const [scheme, apiKey] = authHeader.split(' ');
  
  if (scheme !== 'Bearer' || !apiKey) {
    return c.json({ error: 'Invalid Authorization format. Use: Bearer <api_key>', code: 'UNAUTHORIZED' }, 401);
  }

  // 验证 key
  const keyRecord = await validateApiKey(apiKey);
  
  if (!keyRecord) {
    return c.json({ error: 'Invalid API key', code: 'UNAUTHORIZED' }, 401);
  }

  if (!keyRecord.is_active) {
    return c.json({ error: 'API key is deactivated', code: 'UNAUTHORIZED' }, 401);
  }

  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return c.json({ error: 'API key has expired', code: 'UNAUTHORIZED' }, 401);
  }

  // 速率限制检查
  const rateLimitStatus = checkRateLimit(keyRecord.id, keyRecord.rate_limit);
  if (!rateLimitStatus.allowed) {
    return c.json({ 
      error: 'Rate limit exceeded', 
      code: 'RATE_LIMITED',
      retry_after: rateLimitStatus.retryAfter
    }, 429);
  }

  // 更新最后使用时间
  keyRecord.last_used_at = new Date().toISOString();

  // 附加到 context
  c.set('apiKey', keyRecord);
  
  await next();
};

// 验证 API Key
async function validateApiKey(plainKey: string): Promise<ApiKey | null> {
  // 提取 key ID（格式: vg_xxx.yyyyyyyy）
  const [keyId] = plainKey.split('.');
  
  const record = apiKeysStore.get(keyId);
  if (!record) return null;

  // 验证 hash
  const isValid = await bcrypt.compare(plainKey, record.key_hash);
  return isValid ? record : null;
}

// 检查速率限制
function checkRateLimit(keyId: string, limit: number): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const usage = keyUsageStore.get(keyId);

  if (!usage || now > usage.resetAt) {
    // 新窗口
    keyUsageStore.set(keyId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true };
  }

  if (usage.count >= limit) {
    return { 
      allowed: false, 
      retryAfter: Math.ceil((usage.resetAt - now) / 1000)
    };
  }

  usage.count++;
  return { allowed: true };
}

// 创建新的 API Key
export async function createApiKey(
  userId: string,
  name: string,
  permissions: string[] = ['video:generate'],
  rateLimit: number = 60,
  expiresInDays?: number
): Promise<{ id: string; key: string; name: string }> {
  const id = `vg_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  const keySecret = uuidv4().replace(/-/g, '');
  const fullKey = `${id}.${keySecret}`;

  const keyRecord: ApiKey = {
    id,
    key_hash: await bcrypt.hash(fullKey, 10),
    name,
    user_id: userId,
    permissions,
    rate_limit: rateLimit,
    created_at: new Date().toISOString(),
    is_active: true,
    expires_at: expiresInDays 
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined
  };

  apiKeysStore.set(id, keyRecord);

  // 只返回一次，之后无法找回
  return { id, key: fullKey, name };
}

// 撤销 API Key
export function revokeApiKey(keyId: string, userId: string): boolean {
  const record = apiKeysStore.get(keyId);
  if (!record || record.user_id !== userId) return false;
  
  record.is_active = false;
  return true;
}

// 获取用户的所有 API Keys（不含 hash）
export function listApiKeys(userId: string): Omit<ApiKey, 'key_hash'>[] {
  return Array.from(apiKeysStore.values())
    .filter(k => k.user_id === userId)
    .map(({ key_hash, ...rest }) => rest);
}

// API Key 管理路由
export function createKeysRouter() {
  const app = new Hono();

  // POST /keys - 创建新 key
  app.post('/', async (c) => {
    const body = await c.req.json();
    const apiKey = c.get('apiKey') as ApiKey;
    
    const { name, permissions, rate_limit, expires_in_days } = body;
    
    const result = await createApiKey(
      apiKey.user_id,
      name,
      permissions,
      rate_limit,
      expires_in_days
    );

    return c.json({
      ...result,
      warning: 'This is the only time you will see this key. Store it securely.'
    }, 201);
  });

  // GET /keys - 列出所有 keys
  app.get('/', (c) => {
    const apiKey = c.get('apiKey') as ApiKey;
    const keys = listApiKeys(apiKey.user_id);
    return c.json({ keys });
  });

  // DELETE /keys/:id - 撤销 key
  app.delete('/:id', (c) => {
    const keyId = c.req.param('id');
    const apiKey = c.get('apiKey') as ApiKey;
    
    const success = revokeApiKey(keyId, apiKey.user_id);
    
    if (!success) {
      return c.json({ error: 'Key not found', code: 'NOT_FOUND' }, 404);
    }

    return c.json({ success: true });
  });

  return app;
}
