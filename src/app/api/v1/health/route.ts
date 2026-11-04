import { z } from 'zod';
import { getEnv } from '@/lib/env';
import { apiRoute } from '@/server/api';

const output = z.object({
  ok: z.literal(true),
  env: z.enum(['dev', 'preview', 'prod']),
});

/** Liveness for the uptime check. Touches no database, so it stays up during a DB incident. */
export const GET = apiRoute({
  auth: 'none',
  openapi: { method: 'GET', path: '/api/v1/health', summary: 'Health check', output },
  handler: async () => ({ ok: true as const, env: getEnv().APP_ENV }),
});
