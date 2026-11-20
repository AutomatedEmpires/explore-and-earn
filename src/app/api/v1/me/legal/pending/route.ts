// GET /api/v1/me/legal/pending (SP8 spec section 5): the legal documents the signed-in person
// still has to accept, each at the version published now. Native apps must honor it (spec 8.5).
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { LEGAL_TITLES, pendingAcceptances } from '@/modules/content';
import { apiRoute } from '@/server/api';

const output = z.object({
  items: z.array(
    z.object({ slug: z.string(), version: z.number().int(), title: z.string(), url: z.string() }),
  ),
});

export const GET = apiRoute({
  auth: 'user',
  openapi: {
    method: 'GET',
    path: '/api/v1/me/legal/pending',
    summary: 'List the legal documents I still have to accept',
    output,
  },
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    const items = await pendingAcceptances(db, user.id);
    return {
      items: items.map((item) => ({
        slug: item.slug,
        version: item.version,
        title: LEGAL_TITLES[item.slug],
        url: `/legal/${item.slug}`,
      })),
    };
  },
});
