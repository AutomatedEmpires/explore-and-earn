// Hiring's privacy registration. Export and erase follow the SP5 retention rules.
import { and, asc, eq, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import type { Db, Tx } from '@/lib/db';
import { getHiringInfoMany } from '@/modules/listings';
import { getOrgSummaries } from '@/modules/orgs';
import type { EraseResult, ExportPart, PrivacyHandler, RetentionRule } from '@/modules/privacy';
import {
  asDescribedResponses,
  candidatePoolEntries,
  candidatePoolRuns,
  interviews,
  interviewSlots,
  invites,
  offers,
  pendingPasses,
  pipelineEntries,
} from './schema';

const TERMINAL = ['hired', 'not_selected', 'withdrawn', 'offer_declined'] as const;

const emptyExport = (): ExportPart => ({
  records: { invites: [], interviews: [], offers: [], as_described: [], fit: [] },
  files: [],
});

function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const privacyHandler: PrivacyHandler = {
  module: 'hiring',
  tables: [
    'pipeline_entries',
    'pipeline_events',
    'pending_passes',
    'candidate_pool_runs',
    'candidate_pool_entries',
    'invites',
    'interviews',
    'interview_slots',
    'offers',
    'as_described_responses',
  ],
  mediaColumns: [{ table: 'offers', column: 'letter_media_id', array: false }],
  async exportData(db, subject) {
    if (subject.kind !== 'user') return emptyExport();
    const entries = await db
      .select()
      .from(pipelineEntries)
      .where(eq(pipelineEntries.seekerUserId, subject.userId));
    const applicationIds = entries.map((row) => row.applicationId);
    const listingIds = [...new Set(entries.map((row) => row.listingId))];
    const [sent, meetings, proposed, answers, listings] = await Promise.all([
      db.select().from(invites).where(eq(invites.seekerUserId, subject.userId)),
      applicationIds.length === 0
        ? Promise.resolve([])
        : db.select().from(interviews).where(inArray(interviews.applicationId, applicationIds)),
      applicationIds.length === 0
        ? Promise.resolve([])
        : db.select().from(offers).where(inArray(offers.applicationId, applicationIds)),
      db
        .select()
        .from(asDescribedResponses)
        .where(
          applicationIds.length === 0
            ? eq(asDescribedResponses.seekerUserId, subject.userId)
            : or(
                eq(asDescribedResponses.seekerUserId, subject.userId),
                inArray(asDescribedResponses.applicationId, applicationIds),
              ),
        ),
      getHiringInfoMany(db, listingIds),
    ]);
    const orgIds = [...new Set([...entries.map((row) => row.orgId), ...sent.map((row) => row.orgId)])];
    const orgs = await getOrgSummaries(db, orgIds);
    const titleById = new Map(listings.map((listing) => [listing.id, listing.title]));
    const meetingIds = meetings.map((row) => row.id);
    const slots =
      meetingIds.length === 0
        ? []
        : await db
            .select()
            .from(interviewSlots)
            .where(inArray(interviewSlots.interviewId, meetingIds))
            .orderBy(asc(interviewSlots.startsAt));
    const slotsByInterview = new Map<string, { startsAt: string; endsAt: string }[]>();
    for (const slot of slots) {
      const list = slotsByInterview.get(slot.interviewId) ?? [];
      list.push({ startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() });
      slotsByInterview.set(slot.interviewId, list);
    }

    return {
      records: {
        invites: sent.map((row) => ({
          title: titleById.get(row.listingId) ?? '',
          org: orgs.get(row.orgId)?.name ?? '',
          note: row.note,
          status: row.status,
          sentAt: row.sentAt.toISOString(),
          expiresAt: row.expiresAt.toISOString(),
          respondedAt: row.respondedAt?.toISOString() ?? null,
        })),
        interviews: meetings.map((row) => ({
          status: row.status,
          slots: slotsByInterview.get(row.id) ?? [],
          scheduledStart: row.scheduledStart?.toISOString() ?? null,
          scheduledEnd: row.scheduledEnd?.toISOString() ?? null,
          format: row.format,
          note: row.note,
        })),
        offers: proposed.map((row) => ({
          position: row.position,
          startDate: row.startDate,
          pay: {
            amountCents: row.payAmountCents,
            maxCents: row.payMaxCents,
            unit: row.payUnit,
            currency: row.currency,
          },
          note: row.note,
          status: row.status,
        })),
        as_described: answers.map((row) => ({
          applicationId: row.applicationId,
          workedHere: row.workedHere,
          housing: row.housing,
          meals: row.meals,
          pay: row.pay,
        })),
        fit: entries.map((row) => ({
          applicationId: row.applicationId,
          fitScore: row.fitScore,
          fitLines: row.fitLines,
        })),
      },
      files: proposed.flatMap((row) =>
        row.letterMediaId ? [{ mediaId: row.letterMediaId, name: `offer-${row.id}.pdf` }] : [],
      ),
    };
  },
  async erase(tx, subject, ctx) {
    if (subject.kind === 'org') return eraseOrg(tx, subject.orgId);
    if (ctx.holds.includes('all') || ctx.holds.includes('applications')) {
      return {
        erased: 0,
        retained: [{ table: 'pipeline_entries', reason: 'legal_hold', until: null }],
      };
    }
    return eraseUser(tx, subject.userId);
  },
};

async function eraseUser(tx: Tx, userId: string): Promise<EraseResult> {
  const removedInvites = await tx
    .delete(invites)
    .where(eq(invites.seekerUserId, userId))
    .returning({ id: invites.id });
  const removedPool = await tx
    .delete(candidatePoolEntries)
    .where(eq(candidatePoolEntries.seekerUserId, userId))
    .returning({ id: candidatePoolEntries.id });
  await tx
    .update(asDescribedResponses)
    .set({ seekerUserId: null })
    .where(eq(asDescribedResponses.seekerUserId, userId));
  const entries = await tx
    .select({ lastStatusAt: pipelineEntries.lastStatusAt })
    .from(pipelineEntries)
    .where(eq(pipelineEntries.seekerUserId, userId));
  const retained: EraseResult['retained'] = [];
  const first = entries[0];
  if (first) {
    const latest = entries.reduce(
      (max, row) => (row.lastStatusAt > max ? row.lastStatusAt : max),
      first.lastStatusAt,
    );
    retained.push({
      table: 'pipeline_entries',
      reason: 'shared_record',
      until: isoDate(addMonths(latest, 12)),
    });
  }
  return { erased: removedInvites.length + removedPool.length, retained };
}

async function eraseOrg(tx: Tx, orgId: string): Promise<EraseResult> {
  const runs = await tx
    .delete(candidatePoolRuns)
    .where(eq(candidatePoolRuns.orgId, orgId))
    .returning({ listingId: candidatePoolRuns.listingId });
  const pool = await tx
    .delete(candidatePoolEntries)
    .where(eq(candidatePoolEntries.orgId, orgId))
    .returning({ id: candidatePoolEntries.id });
  const passes = await tx
    .delete(pendingPasses)
    .where(eq(pendingPasses.orgId, orgId))
    .returning({ applicationId: pendingPasses.applicationId });
  return { erased: runs.length + pool.length + passes.length, retained: [] };
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'hiring.notes_12m',
    description: 'Deletes host notes older than 12 months.',
    async run(db: Db, now: Date, limit: number) {
      const cutoff = addMonths(now, -12);
      let left = Math.max(0, limit);
      const inviteIds = await idsToNull(db, left, () =>
        db
          .select({ id: invites.id })
          .from(invites)
          .where(
            and(
              isNotNull(invites.note),
              sql`coalesce(${invites.respondedAt}, ${invites.expiresAt}) < ${cutoff}`,
            ),
          )
          .limit(left),
      );
      if (inviteIds.length > 0) {
        await db.update(invites).set({ note: null }).where(inArray(invites.id, inviteIds));
      }
      left -= inviteIds.length;
      const interviewIds = await idsToNull(db, left, () =>
        db
          .select({ id: interviews.id })
          .from(interviews)
          .innerJoin(pipelineEntries, eq(interviews.applicationId, pipelineEntries.applicationId))
          .where(
            and(
              inArray(pipelineEntries.status, [...TERMINAL]),
              lt(pipelineEntries.lastStatusAt, cutoff),
              or(isNotNull(interviews.note), isNotNull(interviews.requestNote)),
            ),
          )
          .limit(left),
      );
      if (interviewIds.length > 0) {
        await db
          .update(interviews)
          .set({ note: null, requestNote: null })
          .where(inArray(interviews.id, interviewIds));
      }
      left -= interviewIds.length;
      const offerIds = await idsToNull(db, left, () =>
        db
          .select({ id: offers.id })
          .from(offers)
          .innerJoin(pipelineEntries, eq(offers.applicationId, pipelineEntries.applicationId))
          .where(
            and(
              inArray(pipelineEntries.status, [...TERMINAL]),
              lt(pipelineEntries.lastStatusAt, cutoff),
              isNotNull(offers.note),
            ),
          )
          .limit(left),
      );
      if (offerIds.length > 0) {
        await db.update(offers).set({ note: null }).where(inArray(offers.id, offerIds));
      }
      return { deleted: inviteIds.length + interviewIds.length + offerIds.length };
    },
  },
];

async function idsToNull(
  _db: Db,
  left: number,
  load: () => Promise<{ id: string }[]>,
): Promise<string[]> {
  if (left <= 0) return [];
  const rows = await load();
  return rows.map((row) => row.id);
}
