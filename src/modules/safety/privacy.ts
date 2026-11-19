// The safety module's SP8 registration (SP4 spec 10; plan Task 26): export, erase and the
// 12-month report retention rule.
//
// Export holds only what the subject did: the blocks they made, their mutes and the reports
// they filed. A block or a mute someone else made about them is that person's data, and
// exporting it would tell a seeker that a host blocked them.
//
// Erase deletes blocks and mutes where the subject is either party. Reports stay for safety
// (12 months after they were filed) with the reporter unlinked: `reporter_user_id` for a user,
// `reporter_org_id` for an org. A legal hold on reports keeps the reporter; a hold on
// everything leaves all three tables as they are (SP8 eraser rules). Once a report is unlinked
// nothing ties it to the subject any more, so a second run keeps (and reports) nothing.
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import type {
  EraseResult,
  ExportPart,
  HoldScope,
  PrivacyHandler,
  PrivacySubject,
  RetentionRule,
} from '@/modules/privacy';
import { blocks, mutes, reports } from './schema';

const TABLES = ['reports', 'blocks', 'mutes'] as const;
const RETAIN_MONTHS = 12;

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function party(s: PrivacySubject): { type: 'user' | 'org'; id: string } {
  return s.kind === 'user' ? { type: 'user', id: s.userId } : { type: 'org', id: s.orgId };
}

function reporterColumn(s: PrivacySubject) {
  return s.kind === 'user' ? reports.reporterUserId : reports.reporterOrgId;
}

async function exportData(db: DbOrTx, s: PrivacySubject): Promise<ExportPart> {
  const me = party(s);
  const made = await db
    .select({ type: blocks.blockedType, id: blocks.blockedId, at: blocks.createdAt })
    .from(blocks)
    .where(and(eq(blocks.blockerType, me.type), eq(blocks.blockerId, me.id)))
    .orderBy(asc(blocks.createdAt), asc(blocks.id));
  // A mute is the seeker's: an org's export never lists who muted it.
  const muted =
    s.kind === 'user'
      ? await db
          .select({ orgId: mutes.orgId, at: mutes.createdAt })
          .from(mutes)
          .where(eq(mutes.seekerUserId, s.userId))
          .orderBy(asc(mutes.createdAt), asc(mutes.orgId))
      : [];
  const filed = await db
    .select()
    .from(reports)
    .where(eq(reporterColumn(s), me.id))
    .orderBy(asc(reports.createdAt), asc(reports.id));
  return {
    records: {
      blocks: made.map((b) => ({ targetType: b.type, targetId: b.id, blockedAt: b.at.toISOString() })),
      mutes: muted.map((m) => ({ orgId: m.orgId, mutedAt: m.at.toISOString() })),
      reports: filed.map((r) => ({
        reportId: r.id,
        subjectType: r.subjectType,
        subjectId: r.subjectId,
        reason: r.reason,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      })),
    },
    files: [],
  };
}

/** Unlinks the subject from the reports they filed; keeps them for 12 months after filing. */
async function unlinkReports(
  tx: Tx,
  s: PrivacySubject,
): Promise<{ unlinked: number; retained: EraseResult['retained'] }> {
  const column = reporterColumn(s);
  const id = party(s).id;
  const [latest] = await tx
    .select({
      ms: sql<number | null>`(extract(epoch from max(${reports.createdAt})) * 1000)::float8`,
    })
    .from(reports)
    .where(eq(column, id));
  const unlinked = await tx
    .update(reports)
    .set(s.kind === 'user' ? { reporterUserId: null } : { reporterOrgId: null })
    .where(eq(column, id))
    .returning({ id: reports.id });
  const ms = latest?.ms == null ? null : Number(latest.ms);
  const retained: EraseResult['retained'] =
    ms === null
      ? []
      : [
          {
            table: 'reports',
            reason: 'safety',
            until: addMonths(new Date(ms), RETAIN_MONTHS).toISOString(),
          },
        ];
  return { unlinked: unlinked.length, retained };
}

async function erase(
  tx: Tx,
  s: PrivacySubject,
  ctx: { holds: HoldScope[] },
): Promise<EraseResult> {
  if (ctx.holds.includes('all')) {
    return {
      erased: 0,
      retained: TABLES.map((table) => ({ table, reason: 'legal_hold' as const, until: null })),
    };
  }
  const me = party(s);
  const removedBlocks = await tx
    .delete(blocks)
    .where(
      or(
        and(eq(blocks.blockerType, me.type), eq(blocks.blockerId, me.id)),
        and(eq(blocks.blockedType, me.type), eq(blocks.blockedId, me.id)),
      ),
    )
    .returning({ id: blocks.id });
  const removedMutes = await tx
    .delete(mutes)
    .where(s.kind === 'user' ? eq(mutes.seekerUserId, s.userId) : eq(mutes.orgId, s.orgId))
    .returning({ orgId: mutes.orgId });
  let erased = removedBlocks.length + removedMutes.length;

  if (ctx.holds.includes('reports')) {
    return { erased, retained: [{ table: 'reports', reason: 'legal_hold', until: null }] };
  }
  const { unlinked, retained } = await unlinkReports(tx, s);
  erased += unlinked;
  return { erased, retained };
}

export const privacyHandler: PrivacyHandler = {
  module: 'safety',
  tables: TABLES,
  mediaColumns: [],
  exportData,
  erase,
};

type Report = { id: string; subject_type: string; subject_id: string; at: string };

/**
 * The reports about a listing whose organization has a hold on reports (or on everything).
 * The listings module says whose each listing is; nothing is read when no such hold is open.
 */
async function heldThroughListing(
  db: DbOrTx,
  page: Report[],
  heldOrgs: ReadonlySet<string>,
): Promise<Set<string>> {
  if (heldOrgs.size === 0) return new Set();
  const about = page.filter((row) => row.subject_type === 'listing');
  if (about.length === 0) return new Set();
  const { getListingSummaries } = await import('@/modules/listings');
  const listings = await getListingSummaries(
    db,
    about.map((row) => row.subject_id),
  );
  return new Set(
    about
      .filter((row) => {
        const orgId = listings.get(row.subject_id)?.orgId;
        return orgId !== undefined && heldOrgs.has(orgId);
      })
      .map((row) => row.id),
  );
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'safety.reports_12m',
    description: 'Reports are deleted 12 months after they are filed.',
    async run(db: Db, now: Date, limit: number) {
      const cap = Math.max(0, Math.floor(limit));
      if (cap === 0) return { deleted: 0 };
      const cutoff = addMonths(now, -RETAIN_MONTHS);
      // A report whose reporter or subject is under a legal hold on reports (or on everything)
      // is kept, as the eraser keeps it (lead decision 2026-11-18). The reporter and an
      // organization or seeker subject are on the row; a listing's organization comes from the
      // listings module. Reports about a thread or message are not yet matched to their owner:
      // messaging exposes no owner lookup.
      const { heldSubjects, underLegalHold } = await import('@/modules/privacy');
      const held = await heldSubjects(db, 'reports');
      const onTheRow = underLegalHold({
        users: [
          sql`r.reporter_user_id`,
          sql`case when r.subject_type = 'seeker_profile' then r.subject_id end`,
        ],
        orgs: [sql`r.reporter_org_id`, sql`case when r.subject_type = 'org' then r.subject_id end`],
        scope: 'reports',
      });
      return withTx(db, async (tx) => {
        // Pages oldest first until `cap` may go, so held reports at the front never stop the
        // ones behind them. With no hold open, one page is enough.
        const due: string[] = [];
        let after: { at: string; id: string } | null = null;
        for (;;) {
          const page: Report[] = await queryRows<Report>(
            tx,
            sql`
              select r.id, r.subject_type, r.subject_id::text as subject_id,
                r.created_at::text as at
              from app.reports r
              where r.created_at < ${cutoff.toISOString()}::timestamptz
                and not ${onTheRow}
                ${after ? sql`and (r.created_at, r.id) > (${after.at}::timestamptz, ${after.id}::uuid)` : sql``}
              order by r.created_at, r.id
              limit ${cap}
              for update of r skip locked
            `,
          );
          const kept = await heldThroughListing(tx, page, held.orgs);
          for (const row of page) {
            if (due.length < cap && !kept.has(row.id)) due.push(row.id);
          }
          const last = page.at(-1);
          if (due.length >= cap || page.length < cap || !last) break;
          after = { at: last.at, id: last.id };
        }
        if (due.length === 0) return { deleted: 0 };
        const rows = await queryRows<{ id: string }>(
          tx,
          sql`delete from app.reports where id in (${sql.join(
            due.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) returning id`,
        );
        return { deleted: rows.length };
      });
    },
  },
];
