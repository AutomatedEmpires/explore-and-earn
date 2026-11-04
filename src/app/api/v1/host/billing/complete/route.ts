// GET /api/v1/host/billing/complete?session_id=...: the Checkout success page's call. Fetches
// the session from Stripe and syncs its subscription; returns { status }. The browser's arrival
// grants nothing by itself. Owner, Admin and Billing (billing.portal).
import { z } from 'zod';
import { finishCheckout } from '@/modules/billing';
import { kickWorker } from '@/modules/jobs';
import { requireCapability } from '@/modules/orgs';
import { apiRoute } from '@/server/api';

export const GET = apiRoute({
  auth: 'host',
  input: z.object({ session_id: z.string().min(1).max(255) }),
  handler: async ({ db, host, input }) => {
    if (!host) throw new Error('host auth did not run');
    requireCapability(host, 'billing.portal');
    const result = await finishCheckout(db, host, input.session_id);
    kickWorker();
    return result;
  },
});
