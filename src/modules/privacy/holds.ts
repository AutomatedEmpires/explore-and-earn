// Legal holds (SP8 spec section 3). A hold never blocks a privacy request: the erasers skip
// the held scopes and report them as `legal_hold`. The reason is free text an operator wrote,
// so it stays in this table and never reaches the audit log, an export or an email.
import { and, desc, eq, isNull, lt, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { privacyLegalHolds } from './schema';
import { HOLD_SCOPES, type HoldScope, type PrivacySubject } from './types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 50;

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
  });
  return { holdId };
}

/** Releases a hold. An already released hold is a `conflict`. */
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
