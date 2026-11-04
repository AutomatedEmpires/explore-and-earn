// What an operator's decision on a `billing_account` review item does (SP2 plan, decision 11).
// Those items report an unknown price or a duplicate subscription: approve, remove and ask_info
// only resolve the item, because the operator fixes the price or the subscription in Stripe and
// the next sync (or billing.reconcile) applies it. Billing items never touch verification.
// Registered when the module's index is imported.
import { registerSubjectHandlers, type SubjectHandler } from '@/modules/trust';
import { BILLING_SUBJECT } from './sync';

const resolveOnly: SubjectHandler = async () => {};

registerSubjectHandlers(BILLING_SUBJECT, {
  approve: resolveOnly,
  remove: resolveOnly,
  ask_info: resolveOnly,
});
