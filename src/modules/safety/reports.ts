// Reports and the report subject registry (SP4 spec 8.7; plan Task 24).
//
// A report names a subject by type and id. The module that owns a subject type registers it
// once, at load (`registerReportSubject`): which trust subject carries out an operator's
// decision, and how to tell that a subject exists. `report` checks the subject, stores the
// report and opens a trust review item for it, in one transaction:
//   * reason `child_safety`: queue `child_safety` at priority 1000 (Foundation raises the
//     critical alert);
//   * any other reason: queue `reports`, at priority 50 once 3 or more distinct reporters
//     (this one included) reported the subject in the last 7 days, else 0.
// A repeat by the same reporter on the same subject within 24 hours returns the first report.
//
// Disclosure: the reporter is told only that the report arrived (`safety.report_received`),
// never the outcome. The reporter and the details reach operators only: the reported party
// never learns who reported them or why. Audit data holds the subject type and the reason
// code, never the details.
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { queryRows, withTx, type Db, type DbOrTx } from '@/lib/db';
import { badRequest, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import {
  REPORT_REASON_LABELS,
  SAFETY_LIMITS,
  type ReportInput,
  type Reporter,
  type ReportSubjectRegistration,
  type ReportSubjectType,
  type ReportSummary,
  type SafetyReportReason,
} from '@/lib/safety';
import { record } from '@/modules/audit';
import { notify } from '@/modules/notifications';
import { openReviewItem } from '@/modules/trust';
import { isUuid } from './ids';
import { reports } from './schema';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** The Safety tab shows at most this many reports on one subject, newest first. */
const LIST_LIMIT = 500;

const registry = new Map<ReportSubjectType, ReportSubjectRegistration>();

/**
 * Registers (or replaces) how reports on `t` are checked and routed. A subject type nobody
 * registered is refused with `bad_request` (`unknown_subject_type`).
 */
export function registerReportSubject(t: ReportSubjectType, r: ReportSubjectRegistration): void {
  registry.set(t, r);
}

/** Code points, so a cut never splits an emoji. */
function excerpt(text: string, max: number): string {
  return Array.from(text).slice(0, max).join('');
}

/** The review item's reason: `Report (<label>): "<first 500 characters of the details>"`. */
export function reviewReason(reason: SafetyReportReason, details: string): string {
  return `Report (${REPORT_REASON_LABELS[reason]}): "${excerpt(details, SAFETY_LIMITS.reasonExcerpt)}"`;
}

/** Distinct reporters of the subject since `since`, the new report included. */
async function distinctReporters(
  db: DbOrTx,
  i: { subjectType: ReportSubjectType; subjectId: string },
  since: Date,
): Promise<number> {
  const [row] = await queryRows<{ n: number }>(
    db,
    sql`select count(distinct reporter_user_id)::int as n from app.reports
        where subject_type = ${i.subjectType} and subject_id = ${i.subjectId}::uuid
          and created_at > ${since.toISOString()}::timestamptz`,
  );
  return row?.n ?? 0;
}

/** A repeat within 24 hours returns the first report with `created: false`. */
export async function report(
  db: Db,
  reporter: Reporter,
  i: ReportInput,
): Promise<{ reportId: string; created: boolean }> {
  const subject = registry.get(i.subjectType);
  if (!subject) {
    throw badRequest("This can't be reported", { reason: 'unknown_subject_type' });
  }
  const details = (i.details ?? '').trim();
  if (Array.from(details).length > SAFETY_LIMITS.detailsMax) {
    throw badRequest('Keep the details under 1,000 characters', { reason: 'details_too_long' });
  }
  if (!isUuid(i.subjectId) || !(await subject.exists(db, i.subjectId))) {
    throw notFound("We couldn't find what you reported");
  }

  return withTx(db, async (tx) => {
    // One report per reporter and subject at a time: a double tap waits here, then finds the
    // first report below.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('safety.report'),
            hashtext(${`${reporter.userId}:${i.subjectType}:${i.subjectId}`}))::text`,
    );
    const now = new Date();
    const [repeat] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.reporterUserId, reporter.userId),
          eq(reports.subjectType, i.subjectType),
          eq(reports.subjectId, i.subjectId),
          gt(reports.createdAt, new Date(now.getTime() - SAFETY_LIMITS.repeatWindowHours * HOUR_MS)),
        ),
      )
      .orderBy(asc(reports.createdAt), asc(reports.id))
      .limit(1);
    if (repeat) return { reportId: repeat.id, created: false };

    const reportId = newId();
    await tx.insert(reports).values({
      id: reportId,
      reporterUserId: reporter.userId,
      reporterOrgId: reporter.orgId ?? null,
      subjectType: i.subjectType,
      subjectId: i.subjectId,
      reason: i.reason,
      details,
      createdAt: now,
      updatedAt: now,
    });

    const childSafety = i.reason === 'child_safety';
    let priority = 0;
    if (childSafety) {
      priority = SAFETY_LIMITS.childSafetyPriority;
    } else {
      const since = new Date(now.getTime() - SAFETY_LIMITS.escalateWindowDays * DAY_MS);
      const reporters = await distinctReporters(tx, i, since);
      if (reporters >= SAFETY_LIMITS.escalateReporters) priority = SAFETY_LIMITS.escalatedPriority;
    }
    const item = await openReviewItem(tx, {
      queue: childSafety ? 'child_safety' : 'reports',
      subjectType: subject.trustSubjectType,
      subjectId: i.subjectId,
      reason: reviewReason(i.reason, details),
      priority,
    });
    await tx.update(reports).set({ reviewItemId: item.id }).where(eq(reports.id, reportId));

    await notify(tx, reporter.userId, 'safety.report_received', { reportId });
    await record(tx, {
      actorType: 'user',
      actorId: reporter.userId,
      orgId: reporter.orgId ?? null,
      action: 'safety.report_created',
      subjectType: 'report',
      subjectId: reportId,
      data: { subjectType: i.subjectType, reason: i.reason },
    });
    return { reportId, created: true };
  });
}

/** For the console's Safety tab (SP8): the newest 500 reports on one subject. */
export async function listReportsAbout(
  db: DbOrTx,
  i: { subjectType: ReportSubjectType; subjectId: string },
): Promise<ReportSummary[]> {
  if (!isUuid(i.subjectId)) return [];
  const rows = await db
    .select()
    .from(reports)
    .where(and(eq(reports.subjectType, i.subjectType), eq(reports.subjectId, i.subjectId)))
    .orderBy(desc(reports.createdAt), desc(reports.id))
    .limit(LIST_LIMIT);
  return rows.map((r) => ({
    reportId: r.id,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    reason: r.reason,
    details: r.details,
    reporterUserId: r.reporterUserId,
    reviewItemId: r.reviewItemId,
    createdAt: r.createdAt,
  }));
}
