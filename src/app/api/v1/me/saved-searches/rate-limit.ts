// The one write bucket for job alerts (SP3 spec 5): saving, changing and deleting saved searches
// and changing alert settings count 30 an hour per seeker.
import type { ApiContext } from '@/server/api';

export const savedSearchRateLimit = {
  key: (ctx: Pick<ApiContext<unknown>, 'user'>) => `ss:${ctx.user?.id}`,
  limit: 30,
  windowSec: 3600,
};
