// Organization status (active, suspended, banned) and business verification status. Operators
// and billing sanctions change the status; listings closes every listing on suspension through
// the `org.status_changed` event, so this module never imports listings.
import { and, eq, ne } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import type { Actor } from '@/modules/entitlements';
import { emit } from '@/modules/jobs';
import { organizations } from './schema';

export type OrgStatus = 'active' | 'suspended' | 'banned';

/** The same values as verification's VerificationStatus (orgs can't import verification). */
export type OrgVerificationStatus =
  'unverified' | 'running' | 'verified' | 'needs_review' | 'needs_info' | 'failed';

export async function getOrgStatus(db: DbOrTx, orgId: string): Promise<OrgStatus> {
  const [row] = await db
    .select({ status: organizations.status })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!row) throw notFound('Organization not found');
  return row.status;
}

/**
 * Sets the status, records `orgs.status_changed` (with `reason`) and emits
 * `org.status_changed`, in one transaction (a savepoint inside the caller's). Setting the
 * status the org already has changes nothing. The caller calls `kickWorker()` after commit.
 */
export async function setOrgStatus(
  db: DbOrTx,
  orgId: string,
  status: OrgStatus,
  actor: Actor,
  reason?: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .for('update');
    if (!before) throw notFound('Organization not found');
    if (before.status === status) return;

    await tx
      .update(organizations)
      .set({ status })
      .where(and(eq(organizations.id, orgId), ne(organizations.status, status)));
    await record(tx, {
      actorType: actor.type,
      actorId: actor.id,
      orgId,
      action: 'orgs.status_changed',
      subjectType: 'organization',
      subjectId: orgId,
      data: { from: before.status, to: status, ...(reason ? { reason } : {}) },
    });
    await emit(tx, 'org.status_changed', { orgId, status }, newId());
  });
}

/** Stores the verification status; `verified` also stamps `verified_at` (default now). */
export async function setVerificationStatus(
  db: DbOrTx,
  orgId: string,
  status: OrgVerificationStatus,
  at?: Date,
): Promise<void> {
  const updated = await db
    .update(organizations)
    .set({
      verificationStatus: status,
      ...(status === 'verified' ? { verifiedAt: at ?? new Date() } : {}),
    })
    .where(eq(organizations.id, orgId))
    .returning({ id: organizations.id });
  if (updated.length === 0) throw notFound('Organization not found');
}
