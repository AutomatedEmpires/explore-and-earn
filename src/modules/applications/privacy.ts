// The applications module's SP8 registration (SP4 spec 10; plan Task 23): export, the redacting
// erase and the 12-month retention rule.
//
// An application is a record the host also holds, so erasure never deletes the row. It
// withdraws what is still open and redacts the snapshot ("Deleted user", no contact details,
// no answers, no work authorization), under the `app.privacy_erase` setting that the table's
// guard checks. The setting is switched off again before the function returns, so nothing
// later in the caller's transaction can touch a snapshot.
import { and, asc, eq, gt, inArray, lt, notInArray, sql } from 'drizzle-orm';
import { withTx, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { seekerStatus, TERMINAL_STATUSES, type ApplicationSnapshotV1 } from '@/lib/applications';
import { getListingSummaries } from '@/modules/listings';
import type {
  EraseResult,
  ExportPart,
  PrivacyHandler,
  PrivacySubject,
  RetentionRule,
} from '@/modules/privacy';
import { applicationEvents, applications } from './schema';
import { withdrawAllAsSystem } from './status';

const DELETED_NAME = 'Deleted user';
const RETAIN_MONTHS = 12;
/** How many old, still-open applications a retention run checks against SP2 at a time. */
const RETENTION_SCAN = 500;

/** A snapshot that erase or retention has not redacted yet. */
const NOT_REDACTED = sql`(${applications.snapshot}->'profile'->>'firstName' <> ${DELETED_NAME}
  or ${applications.snapshot}->'profile'->>'email' <> '')`;

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

/** The snapshot with the person removed; the listing facts and resume template stay. */
export function redactSnapshot(s: ApplicationSnapshotV1): ApplicationSnapshotV1 {
  return {
    ...s,
    profile: {
      ...s.profile,
      firstName: DELETED_NAME,
      lastName: '',
      email: '',
      phone: null,
      avatarMediaId: null,
      coverMediaId: null,
      workAuthorization: null,
      portfolioLinks: [],
    },
    answers: [],
  };
}

/** Redacts the given applications' snapshots and clears their event notes. */
async function redact(tx: Tx, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
  try {
    const rows = await tx
      .select({ id: applications.id, snapshot: applications.snapshot })
      .from(applications)
      .where(and(inArray(applications.id, ids), NOT_REDACTED))
      .for('update');
    for (const row of rows) {
      await tx
        .update(applications)
        .set({ snapshot: sql`${JSON.stringify(redactSnapshot(row.snapshot))}::jsonb` })
        .where(eq(applications.id, row.id));
    }
    await tx
      .update(applicationEvents)
      .set({ note: null })
      .where(
        and(
          inArray(applicationEvents.applicationId, ids),
          sql`${applicationEvents.note} is not null`,
        ),
      );
    return rows.length;
  } finally {
    // After a failed statement the transaction is aborted and rolls the setting back itself.
    await tx.execute(sql`select set_config('app.privacy_erase', 'off', true)`).catch(() => {});
  }
}

async function retainedUntil(tx: DbOrTx, s: PrivacySubject): Promise<EraseResult['retained']> {
  const [row] = await tx
    .select({ latest: sql<string | null>`max(${applications.statusChangedAt})::text` })
    .from(applications)
    .where(
      s.kind === 'user' ? eq(applications.seekerUserId, s.userId) : eq(applications.orgId, s.orgId),
    );
  if (!row?.latest) return [];
  return [
    {
      table: 'applications',
      reason: 'shared_record',
      until: addMonths(new Date(row.latest), RETAIN_MONTHS).toISOString(),
    },
  ];
}

async function exportData(db: DbOrTx, s: PrivacySubject): Promise<ExportPart> {
  // An org's export holds no applicant data: applications are the seekers' personal data.
  if (s.kind !== 'user') return { records: { applications: [] }, files: [] };
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.seekerUserId, s.userId))
    .orderBy(asc(applications.submittedAt), asc(applications.id));
  const events =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(applicationEvents)
          .where(
            inArray(
              applicationEvents.applicationId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(asc(applicationEvents.createdAt), asc(applicationEvents.id));
  return {
    records: {
      applications: rows.map((r) => ({
        applicationId: r.id,
        listingId: r.listingId,
        status: seekerStatus(r.status),
        source: r.source,
        submittedAt: r.submittedAt.toISOString(),
        statusChangedAt: r.statusChangedAt.toISOString(),
        withdrawnReason: r.withdrawnReason,
        additionalStepCompletedAt: r.additionalStepCompletedAt?.toISOString() ?? null,
        snapshot: r.snapshot,
      })),
      // The seeker's view of the history; a host's internal note is not the seeker's data.
      application_events: events
        .filter(
          (e) =>
            e.type !== 'status_changed' ||
            e.fromStatus === null ||
            seekerStatus(e.fromStatus) !== seekerStatus(e.toStatus),
        )
        .map((e) => ({
          applicationId: e.applicationId,
          type: e.type,
          status: seekerStatus(e.toStatus),
          note: e.actorType === 'seeker' ? e.note : null,
          at: e.createdAt.toISOString(),
        })),
    },
    files: [],
  };
}

export const privacyHandler: PrivacyHandler = {
  module: 'applications',
  tables: ['applications', 'application_events'],
  // FD-2: an application holds no uploaded file, so there is no media column to declare.
  mediaColumns: [],
  exportData,
  async erase(tx, s, ctx) {
    // A legal hold freezes the record exactly as it is (SP8 eraser rules).
    if (ctx.holds.includes('applications') || ctx.holds.includes('all')) {
      return {
        erased: 0,
        retained: [{ table: 'applications', reason: 'legal_hold', until: null }],
      };
    }
    // Erasing an org leaves the seekers' applications as they are.
    if (s.kind !== 'user') return { erased: 0, retained: await retainedUntil(tx, s) };

    await withdrawAllAsSystem(tx, s.userId);
    const rows = await tx
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.seekerUserId, s.userId));
    const erased = await redact(
      tx,
      rows.map((r) => r.id),
    );
    return { erased, retained: await retainedUntil(tx, s) };
  },
};

/**
 * Redacts up to `limit` applications whose last status change is over 12 months old: finished
 * ones first, then still-open ones whose listing SP2 reports closed or removed (or no longer
 * knows). The open ones are paged through by id, `scan` at a time, until `limit` is reached or
 * none are left, so old applications to listings that are still active never hide the ones
 * behind them.
 */
export async function redactDue(
  db: Db,
  now: Date,
  limit: number,
  scan: number = RETENTION_SCAN,
): Promise<number> {
  const cutoff = addMonths(now, -RETAIN_MONTHS);
  const old = and(lt(applications.statusChangedAt, cutoff), NOT_REDACTED);

  const finished = await db
    .select({ id: applications.id })
    .from(applications)
    .where(and(old, inArray(applications.status, [...TERMINAL_STATUSES])))
    .orderBy(asc(applications.statusChangedAt), asc(applications.id))
    .limit(limit);
  const due = finished.map((r) => r.id);

  let after: string | null = null;
  while (due.length < limit) {
    const open: { id: string; listingId: string }[] = await db
      .select({ id: applications.id, listingId: applications.listingId })
      .from(applications)
      .where(
        and(
          old,
          notInArray(applications.status, [...TERMINAL_STATUSES]),
          after ? gt(applications.id, after) : undefined,
        ),
      )
      .orderBy(asc(applications.id))
      .limit(scan);
    if (open.length === 0) break;
    const listings = await getListingSummaries(db, [...new Set(open.map((r) => r.listingId))]);
    for (const r of open) {
      if (due.length >= limit) break;
      const state = listings.get(r.listingId)?.state;
      if (state === undefined || state === 'closed' || state === 'removed') due.push(r.id);
    }
    if (open.length < scan) break;
    after = open.at(-1)?.id ?? null;
  }
  return withTx(db, (tx) => redact(tx, due));
}

export const retentionRules: RetentionRule[] = [
  {
    key: 'applications.terminal_12m',
    description:
      'Applications are redacted 12 months after they reach a final status or their listing closes.',
    async run(db: Db, now: Date, limit: number) {
      return { deleted: await redactDue(db, now, limit) };
    },
  },
];
