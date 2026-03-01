import { Hono } from 'hono';
import { authMiddleware, createKeysRouter } from '../auth/api-keys.js';

const app = new Hono();

// 所有 /keys 路由需要认证
app.use('*', authMiddleware);

// 挂载 keys 管理路由
app.route('/', createKeysRouter());

export const keysRouter = app;
