// GET /api/v1/legal/{slug} (SP8 spec section 5): the published version of a legal document. A
// document with no published version, drafts and versions with counsel included, answers 404.
import { z } from 'zod';
import { notFound } from '@/lib/errors';
import { getPublishedLegal, isLegalSlug } from '@/modules/content';
import { apiRoute } from '@/server/api';

const input = z.object({ slug: z.string().max(40) });
const output = z.object({
  slug: z.string(),
  version: z.number().int(),
  title: z.string(),
  bodyMd: z.string(),
  effectiveAt: z.string(),
});

export const GET = apiRoute({
  auth: 'none',
  input,
  openapi: {
    method: 'GET',
    path: '/api/v1/legal/{slug}',
    summary: 'Read the published version of a legal document',
    output,
  },
  handler: async ({ db, input }) => {
    const doc = isLegalSlug(input.slug) ? await getPublishedLegal(db, input.slug) : null;
    if (!doc) throw notFound('This document has not been published yet.');
    return { ...doc, effectiveAt: doc.effectiveAt.toISOString() };
  },
});
