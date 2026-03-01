import type { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';

export async function errorHandler(err: Error, c: Context) {
  console.error('Error:', err);

  if (err instanceof HTTPException) {
    return c.json(
      {
        error: err.message,
        status: err.status,
        code: 'HTTP_ERROR'
      },
      err.status
    );
  }

  // Zod validation errors
  if (err.name === 'ZodError') {
    return c.json(
      {
        error: 'Validation failed',
        details: (err as any).issues,
        code: 'VALIDATION_ERROR'
      },
      400
    );
  }

  // Generic error
  return c.json(
    {
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
      code: 'INTERNAL_ERROR'
    },
    500
  );
}
