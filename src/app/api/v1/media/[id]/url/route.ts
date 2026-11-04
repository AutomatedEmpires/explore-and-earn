// GET /api/v1/media/{id}/url?variant=320|640|1280: where to load a media file from.
// Approved public images get their permanent URL; private files a 300-second signed URL, for
// the owner, members of the owning organization and operators only.
import { z } from 'zod';
import { isAppError, unauthorized } from '@/lib/errors';
import { getMediaUrl, getStorage, type MediaViewer, type VariantWidth } from '@/modules/media';
import { apiRoute } from '@/server/api';
import { requireHost, requireOperator, type CurrentUser } from '@/server/guards';

const input = z.object({
  id: z.uuid(),
  variant: z
    .enum(['320', '640', '1280'])
    .optional()
    .transform((v) => (v === undefined ? undefined : (Number(v) as VariantWidth))),
});

const output = z.object({ url: z.string() });

/** A guard that denies (no passkey, no strong sign-in) just means no extra access here. */
async function unlessForbidden<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isAppError(err) && err.code === 'forbidden') return fallback;
    throw err;
  }
}

async function viewerFor(user: CurrentUser): Promise<MediaViewer> {
  const viewer: MediaViewer = { userId: user.id, orgIds: [], isOperator: false };
  if (user.accountType === 'operator') {
    viewer.isOperator = await unlessForbidden(async () => (await requireOperator(), true), false);
  } else if (user.accountType === 'host') {
    const orgId = await unlessForbidden(async () => (await requireHost()).orgId, null);
    if (orgId) viewer.orgIds = [orgId];
  }
  return viewer;
}

export const GET = apiRoute({
  auth: 'user',
  input,
  openapi: {
    method: 'GET',
    path: '/api/v1/media/{id}/url',
    summary: 'Get a URL for a media file (public, or signed for 300 seconds)',
    output,
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    const url = await getMediaUrl(db, getStorage(), await viewerFor(user), input.id, input.variant);
    return { url };
  },
});
