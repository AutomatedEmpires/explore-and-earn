// POST /api/v1/me/applications/{id}/withdraw (SP4 spec 5 and 8.5): the seeker withdraws their
// own application and gets the receipt back. Safe to retry: a second call finds it withdrawn
// and returns the same receipt.
// @/server/api first: it loads identity before orgs (see discovery/_shared/params.ts).
import { apiRoute } from '@/server/api';
import { unauthorized } from '@/lib/errors';
import { getReceipt, withdraw, withdrawSchema } from '@/modules/applications';
import { kickWorker } from '@/modules/jobs';
import { privateJson } from '@/server/viewer';

export const POST = apiRoute({
  auth: 'seeker',
  input: withdrawSchema,
  openapi: {
    method: 'POST',
    path: '/api/v1/me/applications/{id}/withdraw',
    summary: 'Withdraw an application',
  },
  handler: async ({ db, user, input }) => {
    if (!user) throw unauthorized();
    await withdraw(db, {
      applicationId: input.id,
      seekerUserId: user.id,
      reason: input.reason,
      note: input.note,
    });
    kickWorker();
    return privateJson(await getReceipt(db, user.id, input.id));
  },
});
