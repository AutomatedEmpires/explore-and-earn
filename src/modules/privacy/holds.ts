// Legal holds (SP8 spec section 3). A hold never blocks a privacy request: the erasers skip
// the held scopes and report them as `legal_hold`. The reason is free text an operator wrote,
// so it stays in this table and never reaches the audit log, an export or an email.
//
// Releasing a hold ends the reason to keep what it kept. So a release queues the erasure
// again for every finished deletion that kept records under a hold for that person or
// organization (lead decision 2026-11-19). Each set and release is also copied to the
// backup project beside the deletion ledger, so a restore from an older backup can put
// the holds back before it replays deletions.
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { findUserById, listActiveOperators } from '@/modules/identity';
import { enqueue } from '@/modules/jobs';
import type { HoldEntry } from './mirror';
import { privacyLegalHolds, privacyRequestSteps, privacyRequests } from './schema';
import { HOLD_SCOPES, type HoldScope, type PrivacySubject } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

/** The job that erases again what a released hold kept. Payload: `{ requestId }`. */
export const HOLD_RELEASE_ERASE_TOPIC = 'privacy.hold_release_erase';
/** The job that copies a hold to the backup project. Payload: `{ holdId }`. */
export const HOLD_MIRROR_TOPIC = 'privacy.hold_mirror';

/** The reason stored on a hold put back from the mirror, which never holds the real one. */
const RESTORED_REASON =
  'Put back from the hold mirror after a database restore. The reason was not mirrored.';

export type LegalHoldRow = {
  id: string;
  userId: string | null;
  orgId: string | null;
  scope: HoldScope;
  reason: string;
  reviewAt: string;
  createdBy: string;
  createdAt: Date;
  releasedAt: Date | null;
};

function isDay(value: string): boolean {
  if (!DAY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Places a hold on exactly one user or organization. `reviewAt` is the day (UTC) an operator
 * looks at it again. Records `privacy.legal_hold_set` without the reason.
 */
export async function setLegalHold(
  db: Db,
  i: {
    userId?: string;
    orgId?: string;
    scope: HoldScope;
    reason: string;
    reviewAt: string;
    operatorId: string;
  },
  now: Date = new Date(),
): Promise<{ holdId: string }> {
  const subjectId = i.userId ?? i.orgId;
  if ((i.userId === undefined) === (i.orgId === undefined) || !subjectId || !UUID.test(subjectId)) {
    throw badRequest('A hold names one user or one organization');
  }
  if (!(HOLD_SCOPES as readonly string[]).includes(i.scope)) {
    throw badRequest('Unknown hold scope');
  }
  const reason = i.reason.trim();
  if (reason.length < 10 || reason.length > 1000) {
    throw badRequest('Give a reason of 10 to 1,000 characters');
  }
  if (!isDay(i.reviewAt) || i.reviewAt < now.toISOString().slice(0, 10)) {
    throw badRequest('The review date must be today or later');
  }

  const holdId = newId();
  await db.transaction(async (tx) => {
    await tx.insert(privacyLegalHolds).values({
      id: holdId,
      userId: i.userId ?? null,
      orgId: i.orgId ?? null,
      scope: i.scope,
      reason,
      reviewAt: i.reviewAt,
      createdBy: i.operatorId,
    });
    await record(tx, {
      actorType: 'operator',
      actorId: i.operatorId,
      orgId: i.orgId ?? null,
      action: 'privacy.legal_hold_set',
      subjectType: i.userId ? 'user' : 'organization',
      subjectId,
      data: {
        holdId,
        scope: i.scope,
        reviewAt: i.reviewAt,
        subjectKind: i.userId ? 'user' : 'org',
      },
    });
    await enqueue(tx, {
      topic: HOLD_MIRROR_TOPIC,
      payload: { holdId },
      dedupeKey: `privacy_hold_mirror:${holdId}:set`,
    });
  });
  return { holdId };
}

type HoldSubject = Pick<typeof privacyLegalHolds.$inferSelect, 'id' | 'userId' | 'orgId'>;

/**
 * Queues the erasure again for each finished deletion that kept records under a hold for the
 * hold's person or organization. A deletion's steps name every subject it erased, so the
 * organization only the requester ran is found through them.
 *
 * The request rows are locked. A finalize step completing one of them right now holds the
 * same lock, so this waits and then sees it `completed`. A deletion that is still running is
 * left alone: its finalize step sees the released hold and queues the job itself.
 */
async function queueReErasure(tx: Tx, hold: HoldSubject): Promise<void> {
  const subjectId = hold.userId ?? hold.orgId;
  if (!subjectId) return;
  const subjectKind = hold.userId ? 'user' : 'org';
  const requests = await tx
    .select({ id: privacyRequests.id, status: privacyRequests.status })
    .from(privacyRequests)
    .where(
      and(
        eq(privacyRequests.kind, 'delete'),
        ne(privacyRequests.status, 'failed'),
        sql`exists (
          select 1 from app.privacy_request_steps step
          where step.request_id = ${privacyRequests.id}
            and step.subject_kind = ${subjectKind}
            and step.subject_id = ${subjectId}::uuid
        )`,
      ),
    )
    .orderBy(asc(privacyRequests.id))
    .for('update');
  for (const request of requests) {
    if (request.status !== 'completed') continue;
    const [held] = await tx
      .select({ id: privacyRequestSteps.id })
      .from(privacyRequestSteps)
      .where(
        and(
          eq(privacyRequestSteps.requestId, request.id),
          sql`${privacyRequestSteps.retained} @> '[{"reason":"legal_hold"}]'::jsonb`,
        ),
      )
      .limit(1);
    if (!held) continue;
    await enqueue(tx, {
      topic: HOLD_RELEASE_ERASE_TOPIC,
      payload: { requestId: request.id },
      dedupeKey: `privacy_hold_release_erase:${request.id}:${hold.id}`,
    });
  }
}

/**
 * Releases a hold, and queues the erasure again for what it kept (see the header). An
 * already released hold is a `conflict`.
 */
export async function releaseLegalHold(
  db: Db,
  i: { holdId: string; operatorId: string },
  now: Date = new Date(),
): Promise<void> {
  if (!UUID.test(i.holdId)) throw notFound('Legal hold not found');
  await db.transaction(async (tx) => {
    const [hold] = await tx
      .select()
      .from(privacyLegalHolds)
      .where(eq(privacyLegalHolds.id, i.holdId))
      .for('update');
    if (!hold) throw notFound('Legal hold not found');
    if (hold.releasedAt) throw conflict('This hold was already released');

    await tx
      .update(privacyLegalHolds)
      .set({ releasedAt: now, releasedBy: i.operatorId })
      .where(eq(privacyLegalHolds.id, hold.id));
    await record(tx, {
      actorType: 'operator',
      actorId: i.operatorId,
      orgId: hold.orgId,
      action: 'privacy.legal_hold_released',
      subjectType: hold.userId ? 'user' : 'organization',
      subjectId: hold.userId ?? hold.orgId,
      data: { holdId: hold.id, scope: hold.scope, subjectKind: hold.userId ? 'user' : 'org' },
    });
    await queueReErasure(tx, hold);
    await enqueue(tx, {
      topic: HOLD_MIRROR_TOPIC,
      payload: { holdId: hold.id },
      dedupeKey: `privacy_hold_mirror:${hold.id}:released`,
    });
  });
}

/** `operatorId` when that account is in this database, else an Owner's. */
async function knownOperator(tx: Tx, operatorId: string): Promise<string> {
  if (await findUserById(tx, operatorId)) return operatorId;
  const owner = (await listActiveOperators(tx)).find((operator) => operator.role === 'owner');
  if (!owner) throw new Error('hold mirror: no operator account to record the hold under');
  return owner.userId;
}

/**
 * Brings one hold in a restored database in line with its mirrored copy. A hold the database
 * lacks (placed after the backup) is put back, with its id, scope and dates; a hold the mirror
 * shows released is released, which queues the erasure of what it kept as a release does.
 * Returns what changed. With `apply: false` nothing is written and the answer is what would
 * change. Safe to repeat.
 *
 * The mirror never holds the reason, so a hold put back carries a note saying so. If the
 * operator who placed it is not in the restored database, it is recorded under an Owner.
 */
export async function applyMirroredHold(
  db: Db,
  e: HoldEntry,
  o: { apply: boolean },
): Promise<'added' | 'released' | 'unchanged'> {
  const subjectId = e.userId ?? e.orgId;
  if ((e.userId === null) === (e.orgId === null) || !subjectId || !UUID.test(subjectId)) {
    throw new Error('hold mirror: a hold names one user or one organization');
  }
  if (!UUID.test(e.holdId) || !(HOLD_SCOPES as readonly string[]).includes(e.scope)) {
    throw new Error('hold mirror: the entry is not a hold');
  }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(privacyLegalHolds)
      .where(eq(privacyLegalHolds.id, e.holdId))
      .for('update');
    if (!row) {
      if (!o.apply) return 'added';
      await tx.insert(privacyLegalHolds).values({
        id: e.holdId,
        userId: e.userId,
        orgId: e.orgId,
        scope: e.scope,
        reason: RESTORED_REASON,
        reviewAt: e.reviewAt,
        createdBy: await knownOperator(tx, e.createdBy),
        createdAt: new Date(e.createdAt),
        releasedAt: e.releasedAt ? new Date(e.releasedAt) : null,
        releasedBy: e.releasedAt ? e.releasedBy : null,
      });
      await record(tx, {
        actorType: 'system',
        actorId: null,
        orgId: e.orgId,
        action: 'privacy.legal_hold_restored',
        subjectType: e.userId ? 'user' : 'organization',
        subjectId,
        data: { holdId: e.holdId, scope: e.scope, subjectKind: e.userId ? 'user' : 'org' },
      });
      return 'added';
    }
    if (row.releasedAt || !e.releasedAt) return 'unchanged';
    if (!o.apply) return 'released';
    await tx
      .update(privacyLegalHolds)
      .set({ releasedAt: new Date(e.releasedAt), releasedBy: e.releasedBy })
      .where(eq(privacyLegalHolds.id, row.id));
    await record(tx, {
      actorType: 'system',
      actorId: null,
      orgId: row.orgId,
      action: 'privacy.legal_hold_released',
      subjectType: row.userId ? 'user' : 'organization',
      subjectId: row.userId ?? row.orgId,
      data: { holdId: row.id, scope: row.scope, subjectKind: row.userId ? 'user' : 'org' },
    });
    await queueReErasure(tx, row);
    return 'released';
  });
}

function subjectFilter(s: PrivacySubject): SQL {
  return s.kind === 'user'
    ? eq(privacyLegalHolds.userId, s.userId)
    : eq(privacyLegalHolds.orgId, s.orgId);
}

/** The distinct scopes of the subject's unreleased holds, in `HOLD_SCOPES` order. */
export async function activeHolds(db: DbOrTx, s: PrivacySubject): Promise<HoldScope[]> {
  const rows = await db
    .selectDistinct({ scope: privacyLegalHolds.scope })
    .from(privacyLegalHolds)
    .where(and(subjectFilter(s), isNull(privacyLegalHolds.releasedAt)));
  const held = new Set(rows.map((row) => row.scope));
  return HOLD_SCOPES.filter((scope) => held.has(scope));
}

/**
 * True when a hold on one of `subjects` was released at or after `since`. Both times are the
 * database's: the row's `updated_at` is stamped by the release itself.
 */
export async function holdReleasedSince(
  db: DbOrTx,
  subjects: readonly PrivacySubject[],
  since: Date,
): Promise<boolean> {
  for (const subject of subjects) {
    const [row] = await db
      .select({ id: privacyLegalHolds.id })
      .from(privacyLegalHolds)
      .where(
        and(
          subjectFilter(subject),
          isNotNull(privacyLegalHolds.releasedAt),
          gte(privacyLegalHolds.updatedAt, since),
        ),
      )
      .limit(1);
    if (row) return true;
  }
  return false;
}

/** True when `scope` is held, directly or by a hold on everything. */
export function holdsInclude(holds: readonly HoldScope[], scope: HoldScope): boolean {
  return holds.includes(scope) || holds.includes('all');
}

/**
 * True when the given user or organization has an unreleased hold whose scope is `i.scope` or
 * `all`. With both ids, either one counts. A user's hold never counts for an organization, nor
 * an organization's for a user.
 */
export async function isOnLegalHold(
  db: DbOrTx,
  i: { userId?: string; orgId?: string; scope: HoldScope },
): Promise<boolean> {
  const subjects: PrivacySubject[] = [];
  if (i.userId) subjects.push({ kind: 'user', userId: i.userId });
  if (i.orgId) subjects.push({ kind: 'org', orgId: i.orgId });
  for (const subject of subjects) {
    if (holdsInclude(await activeHolds(db, subject), i.scope)) return true;
  }
  return false;
}

/** What keeps a retention rule's row: a hold on that scope (or on `all`), or one of any scope. */
export type HeldUnder = HoldScope | 'any';

/** The hold scopes that keep a row held under `scope`, as holdsInclude decides. */
function scopesKeeping(scope: HeldUnder): readonly HoldScope[] {
  if (scope === 'any') return HOLD_SCOPES;
  return HOLD_SCOPES.filter((held) => holdsInclude([held], scope));
}

/**
 * The batch form of isOnLegalHold, as SQL for a retention rule's query: true when an
 * unreleased hold covers the row. Rules use it as `and not ${underLegalHold(...)}` (lead
 * decision 2026-11-18: no retention rule deletes what a legal hold keeps).
 *
 * `users` and `orgs` are SQL expressions for the person and organization ids the row belongs
 * to, uuid or text; one that is null matches nothing. The scopes that count follow
 * holdsInclude (a hold on `all` covers every scope); `any` counts a hold of any scope. The
 * holds are read inside the rule's own statement, so no earlier read can go stale before the
 * delete, and there is one query per batch, not one per row.
 */
export function underLegalHold(i: {
  users?: readonly SQL[];
  orgs?: readonly SQL[];
  scope: HeldUnder;
}): SQL {
  const users = i.users ?? [];
  const orgs = i.orgs ?? [];
  if (users.length + orgs.length === 0) {
    throw new Error('underLegalHold: name the user or organization the row belongs to');
  }
  const scopes = scopesKeeping(i.scope);
  const subjects = [
    ...users.map((id) => sql`privacy_hold.user_id::text = (${id})::text`),
    ...orgs.map((id) => sql`privacy_hold.org_id::text = (${id})::text`),
  ];
  return sql`exists (
    select 1 from app.privacy_legal_holds privacy_hold
    where privacy_hold.released_at is null
      and privacy_hold.scope in (${sql.join(
        scopes.map((scope) => sql`${scope}`),
        sql`, `,
      )})
      and (${sql.join(subjects, sql` or `)})
  )`;
}

/**
 * Like underLegalHold, for a row that names its person or organization only inside free-form
 * text, such as a job payload: true when `text` contains the id of a person or organization
 * with an unreleased hold covering `scope`, or one of `emails` (the held people's addresses,
 * which the caller reads from identity) in any case. The match is literal (strpos), so no
 * character in an address acts as a wildcard.
 */
export function namesUnderLegalHold(
  text: SQL,
  scope: HeldUnder,
  emails: readonly string[] = [],
): SQL {
  const byId = sql`exists (
    select 1 from app.privacy_legal_holds privacy_hold
    where privacy_hold.released_at is null
      and privacy_hold.scope in (${sql.join(
        scopesKeeping(scope).map((held) => sql`${held}`),
        sql`, `,
      )})
      and strpos(${text}, coalesce(privacy_hold.user_id, privacy_hold.org_id)::text) > 0
  )`;
  const addresses = [...new Set(emails.map((email) => email.trim().toLowerCase()))].filter(
    (email) => email !== '',
  );
  if (addresses.length === 0) return byId;
  const byEmail = addresses.map((email) => sql`strpos(lower(${text}), ${email}::text) > 0`);
  return sql`(${byId} or ${sql.join(byEmail, sql` or `)})`;
}

/**
 * The people and organizations with an unreleased hold covering `scope`, in one read. For a
 * retention rule that must ask another module who owns a row: it checks the owners it gets
 * back against these sets instead of reading holds row by row.
 */
export async function heldSubjects(
  db: DbOrTx,
  scope: HeldUnder,
): Promise<{ users: ReadonlySet<string>; orgs: ReadonlySet<string> }> {
  const rows = await db
    .select({ userId: privacyLegalHolds.userId, orgId: privacyLegalHolds.orgId })
    .from(privacyLegalHolds)
    .where(
      and(
        isNull(privacyLegalHolds.releasedAt),
        inArray(privacyLegalHolds.scope, [...scopesKeeping(scope)]),
      ),
    );
  return {
    users: new Set(rows.flatMap((row) => (row.userId ? [row.userId] : []))),
    orgs: new Set(rows.flatMap((row) => (row.orgId ? [row.orgId] : []))),
  };
}

/** The console's hold list, newest first, 50 a page. `before` is the last id of the page before. */
export async function listLegalHolds(
  db: DbOrTx,
  f: { includeReleased?: boolean; before?: string } = {},
): Promise<{ items: LegalHoldRow[]; nextBefore: string | null }> {
  if (f.before !== undefined && !UUID.test(f.before)) throw badRequest('Invalid cursor');
  const filters: SQL[] = [];
  if (!f.includeReleased) filters.push(isNull(privacyLegalHolds.releasedAt));
  if (f.before) filters.push(lt(privacyLegalHolds.id, f.before));

  const rows = await db
    .select({
      id: privacyLegalHolds.id,
      userId: privacyLegalHolds.userId,
      orgId: privacyLegalHolds.orgId,
      scope: privacyLegalHolds.scope,
      reason: privacyLegalHolds.reason,
      reviewAt: privacyLegalHolds.reviewAt,
      createdBy: privacyLegalHolds.createdBy,
      createdAt: privacyLegalHolds.createdAt,
      releasedAt: privacyLegalHolds.releasedAt,
    })
    .from(privacyLegalHolds)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(privacyLegalHolds.id))
    .limit(PAGE_SIZE + 1);
  const items = rows.slice(0, PAGE_SIZE);
  return { items, nextBefore: rows.length > PAGE_SIZE ? (items.at(-1)?.id ?? null) : null };
}
