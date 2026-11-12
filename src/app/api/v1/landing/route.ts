// GET /api/v1/landing?path=: the public landing page, or 404 (SP3 spec section 5, plan Task 40).
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { z } from 'zod';
import { notFound } from '@/lib/errors';
import { apiRoute } from '@/server/api';
import { resolveLanding } from '@/modules/landing';

const input = z.object({
  path: z.string().trim().min(1).max(512),
});

export const GET = apiRoute({
  auth: 'none',
  input,
  openapi: {
    method: 'GET',
    path: '/api/v1/landing',
    summary: 'The landing page for a public path',
  },
  handler: async ({ db, input: query }) => {
    const page = await resolveLanding(db, query.path, new Date());
    if (!page) throw notFound('No landing page at that path.');
    return page;
  },
});
