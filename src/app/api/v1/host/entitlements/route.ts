// GET /api/v1/host/entitlements: the organization's listing slots, seats and invite credits
// (SP2 spec section 5). Any host role may read them: counts only, no listing data.
import { unauthorized } from '@/lib/errors';
import { getBalance, getCapacity } from '@/modules/entitlements';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  handler: async ({ db, host }) => {
    if (!host) throw unauthorized();
    const now = new Date();
    const [listingSlots, seats, inviteCredits] = await Promise.all([
      getCapacity(db, host.orgId, 'listing_slot', now),
      getCapacity(db, host.orgId, 'seat', now),
      getBalance(db, host.orgId, 'invite_credit', now),
    ]);
    return {
      listingSlots,
      seats,
      inviteCredits: {
        balance: inviteCredits.balance,
        resetsAt: inviteCredits.resetsAt ? inviteCredits.resetsAt.toISOString() : null,
      },
    };
  },
});
