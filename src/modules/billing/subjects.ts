// What an operator's decision on a `billing_account` review item does (SP2 plan, decision 11).
// Those items report an unknown price or a duplicate subscription: approve, remove and ask_info
// only resolve the item, because the operator fixes the price or the subscription in Stripe and
// the next sync (or billing.reconcile) applies it. Suspend and ban sanction the org (a ban also
// cancels its subscription). Billing items never touch verification. Registered when the
// module's index is imported.
import type { Actor } from '@/modules/entitlements';
import { registerSubjectHandlers, type SubjectHandler } from '@/modules/trust';
import { sanctionOrg } from './cancel';
import { BILLING_SUBJECT } from './sync';

/** The deciding operator is recorded by trust on the review item. */
const OPERATOR: Actor = { type: 'operator', id: null };

const resolveOnly: SubjectHandler = async () => {};

registerSubjectHandlers(BILLING_SUBJECT, {
  approve: resolveOnly,
  remove: resolveOnly,
  ask_info: resolveOnly,
  suspend: (db, orgId) => sanctionOrg(db, orgId, 'suspend', OPERATOR),
  ban: (db, orgId) => sanctionOrg(db, orgId, 'ban', OPERATOR),
});
