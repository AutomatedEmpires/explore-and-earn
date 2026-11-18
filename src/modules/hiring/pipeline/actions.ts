// Shortlist and Mark hired. A stale move commits the mirror, then returns 409.
import type { ApplicationStatus } from '@/lib/applications';
import { track } from '@/lib/analytics';
import type { Db } from '@/lib/db';
import { withTx } from '@/lib/db';
import { notify } from '@/modules/notifications';
import { getOrgSummaries } from '@/modules/orgs';
import { record } from '@/modules/audit';
import type { HostContext } from '@/server/guards';
import { requireEntry } from '../access';
import { staleStatus, transitionStatus } from '../core';

export async function shortlist(
  db: Db,
  ctx: HostContext,
  applicationId: string,
  on: boolean,
): Promise<{ status: ApplicationStatus }> {
  const to: ApplicationStatus = on ? 'shortlisted' : 'new';
  const outcome = await withTx(db, async (tx) => {
    await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    const result = await transitionStatus(tx, {
      applicationId,
      from: on ? ['new'] : ['shortlisted'],
      to,
      actor: { type: 'host', userId: ctx.user.id, orgId: ctx.orgId },
      eventKind: on ? 'shortlisted' : 'unshortlisted',
    });
    if (!result.ok) return { ok: false as const, current: result.current };
    return { ok: true as const, status: to };
  });
  if (!outcome.ok) throw staleStatus(outcome.current);
  return { status: outcome.status };
}

export async function markHired(
  db: Db,
  ctx: HostContext,
  applicationId: string,
): Promise<{ status: 'hired' }> {
  const outcome = await withTx(db, async (tx) => {
    const entry = await requireEntry(tx, ctx, applicationId, { forUpdate: true });
    const result = await transitionStatus(tx, {
      applicationId,
      from: ['new', 'shortlisted', 'interviewing'],
      to: 'hired',
      actor: { type: 'host', userId: ctx.user.id, orgId: ctx.orgId },
      eventKind: 'hired',
      hiredSource: 'host',
    });
    if (!result.ok) return { ok: false as const, current: result.current };
    const orgs = await getOrgSummaries(tx, [entry.orgId]);
    await record(tx, {
      actorType: 'user',
      actorId: ctx.user.id,
      orgId: entry.orgId,
      action: 'hiring.marked_hired',
      subjectType: 'application',
      subjectId: applicationId,
      data: { listingId: entry.listingId },
    });
    await notify(tx, entry.seekerUserId, 'hiring.marked_hired', {
      orgName: orgs.get(entry.orgId)?.name ?? '',
      applicationId,
      listingId: entry.listingId,
    });
    return { ok: true as const, listingId: entry.listingId };
  });
  if (!outcome.ok) throw staleStatus(outcome.current);
  track('hiring.hired', { applicationId, listingId: outcome.listingId });
  return { status: 'hired' };
}
