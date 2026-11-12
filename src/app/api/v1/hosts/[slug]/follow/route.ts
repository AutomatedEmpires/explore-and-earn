// PUT /api/v1/hosts/[slug]/follow: follow a public host page (seekers; 404 unless the page is
// public). DELETE stops following. Both answer `{ following }` and share 60 changes an hour.
import { z } from 'zod';
import { unauthorized } from '@/lib/errors';
import { follow, unfollowHost } from '@/modules/hostpages';
import { apiRoute, type RateLimitOption } from '@/server/api';

const input = z.object({ slug: z.string().min(1).max(100) });
type Input = z.infer<typeof input>;

const rateLimit: RateLimitOption<Input> = {
  key: (ctx) => `hosts.follow:${ctx.user?.id}`,
  limit: 60,
  windowSec: 3600,
};

export const PUT = apiRoute({
  auth: 'seeker',
  input,
  rateLimit,
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return follow(db, user.id, input.slug);
  },
});

export const DELETE = apiRoute({
  auth: 'seeker',
  input,
  rateLimit,
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    return unfollowHost(db, user.id, input.slug);
  },
});
