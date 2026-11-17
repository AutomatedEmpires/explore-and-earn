// Who is reading a thread. A seeker is themselves; a host is their current organization.
import { forbidden } from '@/lib/errors';
import type { ThreadViewer } from '@/modules/messaging/access';
import { requireHost, type CurrentUser } from '@/server/guards';

export async function threadViewer(user: CurrentUser): Promise<ThreadViewer> {
  if (user.accountType === 'seeker') return { kind: 'seeker', userId: user.id };
  if (user.accountType === 'host') return { kind: 'host', ctx: await requireHost() };
  throw forbidden();
}
