// Host Home tiles and the org hiring summary SP2's host page reads. Today's interviews name
// applicants, so they show only to a verified host (legal review 7.1, the same gate as the
// applicant reads); the counts carry no applicant data and always show.
import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { localDayRange } from '@/lib/hiring';
import type { HostHome, InterviewItem } from '@/lib/hiring/types';
import type { HostInterviewsQuery } from '@/lib/hiring';
import { getHiringInfoMany, listForOrg } from '@/modules/listings';
import { inScope, listingScope, unreadThreadCount } from '@/modules/messaging';
import { hostApplicantGate } from '@/modules/verification';
import type { HostContext } from '@/server/guards';
import { listHostInterviews } from '../interviews/host';
import { interviews, invites, pipelineEntries } from '../schema';

const ACTIVE_INTERVIEWS = ['invited', 'scheduled', 'reschedule_requested'] as const;

export async function getHostHome(
  db: DbOrTx,
  ctx: HostContext,
  i: { tz: string; now?: Date },
): Promise<HostHome> {
  const now = i.now ?? new Date();
  const range = localDayRange(i.tz, now);
  const scope = await listingScope(db, ctx);
  const scoped = scope.all ? undefined : inArray(pipelineEntries.listingId, scope.listingIds);
  const visible = scope.all || scope.listingIds.length > 0;

  const [applicantRow] = visible
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(pipelineEntries)
        .where(
          and(
            eq(pipelineEntries.orgId, ctx.orgId),
            scoped,
            gte(pipelineEntries.appliedAt, range.from),
            lt(pipelineEntries.appliedAt, range.to),
          ),
        )
    : [{ n: 0 }];

  const gate = await hostApplicantGate(db, ctx.orgId);
  const listed = gate.ok
    ? ((await listHostInterviews(db, ctx, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      } satisfies HostInterviewsQuery)) as { items: InterviewItem[] })
    : { items: [] };

  const openingsFilled = await filledOpenings(db, ctx);
  return {
    todayApplicants: Number(applicantRow?.n ?? 0),
    todayInterviews: listed.items,
    unreadThreads: await unreadThreadCount(db, ctx.user.id, { orgId: ctx.orgId }),
    openingsFilled,
  };
}

async function filledOpenings(
  db: DbOrTx,
  ctx: HostContext,
): Promise<{ listingId: string; title: string }[]> {
  const scope = await listingScope(db, ctx);
  const active = await listForOrg(db, ctx.orgId, { status: ['active'] });
  const ids = active.map((row) => row.id).filter((id) => inScope(scope, id));
  if (ids.length === 0) return [];
  const [infos, hired] = await Promise.all([
    getHiringInfoMany(db, ids),
    db
      .select({ listingId: pipelineEntries.listingId, n: sql<number>`count(*)::int` })
      .from(pipelineEntries)
      .where(
        and(
          eq(pipelineEntries.orgId, ctx.orgId),
          eq(pipelineEntries.status, 'hired'),
          inArray(pipelineEntries.listingId, ids),
        ),
      )
      .groupBy(pipelineEntries.listingId),
  ]);
  const hiredById = new Map(hired.map((row) => [row.listingId, Number(row.n)]));
  return infos
    .filter((info) => (hiredById.get(info.id) ?? 0) >= info.openings)
    .map((info) => ({ listingId: info.id, title: info.title }));
}

export async function getOrgHiringSummary(
  db: DbOrTx,
  orgId: string,
): Promise<{ applicants: number; hires: number; invitesSent: number; activeInterviews: number }> {
  const [applicants, hires, invitesSent, activeInterviews] = await Promise.all([
    countWhere(db, eq(pipelineEntries.orgId, orgId), pipelineEntries),
    countWhere(db, and(eq(pipelineEntries.orgId, orgId), eq(pipelineEntries.status, 'hired')), pipelineEntries),
    countWhere(db, and(eq(invites.orgId, orgId), ne(invites.scanState, 'held')), invites),
    countWhere(
      db,
      and(eq(interviews.orgId, orgId), inArray(interviews.status, [...ACTIVE_INTERVIEWS])),
      interviews,
    ),
  ]);
  return { applicants, hires, invitesSent, activeInterviews };
}

async function countWhere(
  db: DbOrTx,
  where: ReturnType<typeof and> | ReturnType<typeof eq>,
  table: typeof pipelineEntries | typeof invites | typeof interviews,
): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(where);
  return Number(row?.n ?? 0);
}
