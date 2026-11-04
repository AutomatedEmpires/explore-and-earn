// Review decisions on subject `organization` (SP2 spec section 6; Plan decision 11), registered
// when the module loads. The subject is used only for verification and fraud items:
// approve -> verified, remove -> failed, ask_info -> needs_info with the note, suspend or ban ->
// billing.sanctionOrg (a ban also cancels the subscription at once).
import { z } from 'zod';
import { sanctionOrg, type Actor } from '@/modules/billing';
import { registerSubjectHandlers } from '@/modules/trust';
import { askForInfo, operatorApprove, operatorFail } from './decide';

/** trust.decide passes the decision's data plus the deciding review item. */
const decisionData = z.looseObject({
  note: z.string().optional(),
  reviewItemId: z.uuid().optional(),
});

function readData(data: unknown): { note?: string; reviewItemId: string | null } {
  const parsed = decisionData.safeParse(data ?? {});
  if (!parsed.success) return { reviewItemId: null };
  return { note: parsed.data.note, reviewItemId: parsed.data.reviewItemId ?? null };
}

/** The handlers don't learn which operator decided; trust.decided records that. */
const OPERATOR: Actor = { type: 'operator', id: null };

registerSubjectHandlers('organization', {
  approve: async (db, orgId, data) => {
    await operatorApprove(db, orgId, readData(data).reviewItemId);
  },
  remove: async (db, orgId, data) => {
    await operatorFail(db, orgId, readData(data).reviewItemId);
  },
  ask_info: async (db, orgId, data) => {
    const d = readData(data);
    await askForInfo(db, orgId, d.note, d.reviewItemId);
  },
  suspend: async (db, orgId) => {
    await sanctionOrg(db, orgId, 'suspend', OPERATOR);
  },
  ban: async (db, orgId) => {
    await sanctionOrg(db, orgId, 'ban', OPERATOR);
  },
});
