// Operator decisions on an organization (a sanction), registered when billing loads.
// Verification uses `business_verification` and does not share this subject.
import type { Actor } from '@/modules/entitlements';
import { getOrgStatus } from '@/modules/orgs';
import { registerSubjectHandlers } from '@/modules/trust';
import { restoreOrganization, sanctionMetaFrom, suspendOrganization } from './cancel';

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
