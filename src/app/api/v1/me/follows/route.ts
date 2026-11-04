// GET /api/v1/me/follows: the public hosts the signed-in seeker follows, most recent first.
import { unauthorized } from '@/lib/errors';
import { listFollows } from '@/modules/hostpages';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'seeker',
  handler: async ({ db, user }) => {
    if (!user) throw unauthorized();
    return listFollows(db, user.id);
  },
});
