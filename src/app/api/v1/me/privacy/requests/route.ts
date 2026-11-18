// GET /api/v1/me/privacy/requests: the caller's own export and deletion requests, newest first.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { listPrivacyRequests } from '@/modules/privacy';
import { apiRoute } from '@/server/api';

const item = z.object({
  id: z.uuid(),
  kind: z.enum(['export', 'delete']),
  status: z.string(),
  createdAt: z.iso.datetime(),
  completedAt: z.iso.datetime().nullable(),
  exportExpiresAt: z.iso.datetime().nullable(),
});

export const GET = apiRoute({
  auth: 'user',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/privacy/requests',
    summary: 'List your privacy requests',
    output: z.object({ items: z.array(item) }),
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    const rows = await listPrivacyRequests(db, user.id);
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
        exportExpiresAt: row.exportExpiresAt?.toISOString() ?? null,
      })),
    };
  },
});
