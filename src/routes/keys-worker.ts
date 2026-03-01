import { Hono } from 'hono';
import type { Bindings } from '../worker.js';

const app = new Hono<{ Bindings: Bindings }>();

// POST /v1/keys - 创建 API key
app.post('/', async (c) => {
  const body = await c.req.json();
  const { name, permissions = ['video:generate'], rate_limit = 60 } = body;
  
  // 生成 key
  const crypto = await import('crypto');
  const keyId = `vg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const keySecret = crypto.randomUUID().replace(/-/g, '');
  const fullKey = `${keyId}.${keySecret}`;
  
  // Hash key
  const encoder = new TextEncoder();
  const data = encoder.encode(fullKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  
  // 存储到 D1
  await c.env.DB.prepare(`
    INSERT INTO api_keys (id, key_hash, name, permissions, rate_limit, is_active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(keyId, keyHash, name, JSON.stringify(permissions), rate_limit, 1, 
    new Date().toISOString()).run();
  
  return c.json({
    id: keyId,
    key: fullKey,
    name,
    warning: 'This is the only time you will see this key. Store it securely.'
  }, 201);
});

// GET /v1/keys - 列出 API keys
app.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(`
    SELECT id, name, permissions, rate_limit, is_active, created_at, last_used_at
    FROM api_keys
    ORDER BY created_at DESC
  `).all();
  
  return c.json({
    keys: results?.map((k: any) => ({
      ...k,
      permissions: JSON.parse(k.permissions)
    })) || []
  });
});

// DELETE /v1/keys/:id - 撤销 API key
app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  
  await c.env.DB.prepare(`
    UPDATE api_keys SET is_active = 0 WHERE id = ?
  `).bind(id).run();
  
  return c.json({ success: true });
});

export const keysRouterWorker = app;
