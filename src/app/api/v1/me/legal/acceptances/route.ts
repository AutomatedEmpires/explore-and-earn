// POST /api/v1/me/legal/acceptances (SP8 spec section 5): the signed-in person accepts 1 to 8
// legal documents, each at its published version (else 400 with reason `not_current`).
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { LEGAL_SLUGS, recordAcceptance } from '@/modules/content';
import { apiRoute } from '@/server/api';

const input = z
  .object({
    items: z
      .array(z.object({ slug: z.enum(LEGAL_SLUGS), version: z.number().int().min(1) }).strict())
      .min(1)
      .max(8),
  })
  .strict();
const output = z.object({ ok: z.literal(true) });

export const POST = apiRoute({
  auth: 'user',
  input,
  rateLimit: { key: (ctx) => `legal_accept:${ctx.user?.id}`, limit: 30, windowSec: 3600 },
  openapi: {
    method: 'POST',
    path: '/api/v1/me/legal/acceptances',
    summary: 'Accept the published versions of legal documents',
    output,
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await recordAcceptance(db, user.id, input.items);
    return { ok: true as const };
  },
});
