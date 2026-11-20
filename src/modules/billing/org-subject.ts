// Operator decisions on an organization (a sanction), registered when billing loads.
// Verification uses `business_verification` and does not share this subject.
//
// The fraud queue opens `organization` items for fake hosts (a listing the fraud check
// rejected, repeated scam messages), and a report about a host opens one too. A ban decided on
// one also queues the ban of the card on file, as a ban on a `business_verification` item does
// (review pass 3 of #182): a host who signs up again with that card then fails verification's
// banned-print check and waits for an operator.
import { newId } from '@/lib/ids';
import type { Actor } from '@/modules/entitlements';
import { enqueue } from '@/modules/jobs';
import { getOrgStatus } from '@/modules/orgs';
import { registerSubjectHandlers } from '@/modules/trust';
import { restoreOrganization, sanctionMetaFrom, suspendOrganization } from './cancel';

/**
 * Verification's job that bans the print of the org's card on file (verification/run.ts). It is
 * named here because billing cannot import verification, which imports billing.
 */
const BAN_FINGERPRINTS_TOPIC = 'verification.ban_fingerprints';

function actorOf(data: unknown): Actor {
  const operatorId =
    data && typeof data === 'object' && typeof (data as { operatorId?: unknown }).operatorId === 'string'
      ? (data as { operatorId: string }).operatorId
      : null;
  return { type: 'operator', id: operatorId };
}

registerSubjectHandlers('organization', {
  suspend: async (db, orgId, data) => {
    const meta = sanctionMetaFrom(data);
    await suspendOrganization(db, {
      orgId,
      action: 'suspend',
      reviewItemId: meta.reviewItemId ?? '',
      reason: meta.reason ?? 'Other violation of our terms',
      endsAt: meta.endsAt ?? null,
      actor: actorOf(data),
    });
  },
  ban: async (db, orgId, data) => {
    const meta = sanctionMetaFrom(data);
    await suspendOrganization(db, {
      orgId,
      action: 'ban',
      reviewItemId: meta.reviewItemId ?? '',
      reason: meta.reason ?? 'Other violation of our terms',
      endsAt: null,
      actor: actorOf(data),
    });
    // Queued in the decision's transaction and run after it commits: the job reads Stripe.
    // The key is the one the `business_verification` ban uses, so one decision bans once.
    await enqueue(db, {
      topic: BAN_FINGERPRINTS_TOPIC,
      payload: { orgId },
      dedupeKey: `ban-prints:${orgId}:${meta.reviewItemId ?? newId()}`,
    });
  },
  approve: async (db, orgId, data) => {
    if ((await getOrgStatus(db, orgId)) === 'active') return;
    const meta = sanctionMetaFrom(data);
    await restoreOrganization(db, orgId, {
      reviewItemId: meta.reviewItemId,
      actor: actorOf(data),
    });
  },
});
