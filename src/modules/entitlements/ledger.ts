// The entitlements ledger (SP2 spec sections 3, 4 and 8.1): append-only grants of listing
// slots, seats and invite credits, and the consumptions that spend credits from them.
//
// A grant is valid at `now` when valid_from <= now < coalesce(valid_until, 'infinity').
// Every write records its audit event in the same transaction.
import { and, asc, eq, gt, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { DbOrTx, Tx } from '@/lib/db';
import { badRequest, conflict, notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { entitlementConsumptions as consumptions, entitlementGrants as grants } from './schema';

/** SP6 extends the CHECK constraint and this union. */
export type EntitlementKind = 'listing_slot' | 'seat' | 'invite_credit';
export type CapacityKind = 'listing_slot' | 'seat';
export type CreditKind = 'invite_credit';
export type GrantSource = 'plan' | 'operator' | 'pack' | 'addon';
export type Actor = { type: 'user' | 'operator' | 'system'; id: string | null };

export type ConsumeResult =
  | { ok: true; consumptionId: string; remaining: number }
  | { ok: false; reason: 'insufficient'; remaining: number };

export type OpenGrant = {
  id: string;
  kind: EntitlementKind;
  quantity: number;
  sourceRef: string;
  validUntil: Date | null;
};

const MAX_QUANTITY = 2_147_483_647;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The suffix of the second and later rows of a split consumption: `<key>#2`, `<key>#3`, ... */
const SPLIT_SUFFIX = /#\d+$/;

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    throw badRequest('quantity must be a positive integer');
  }
}

function assertKey(key: string): void {
  if (key.trim() === '') throw badRequest('idempotencyKey is required');
}

/** The audit actor and the `created_by` user for an Actor (null for the system). */
function who(actor: Actor): {
  actorType: Actor['type'];
  actorId: string | null;
  createdBy: string | null;
} {
  const id = actor.type === 'system' ? null : actor.id;
  return { actorType: actor.type, actorId: id, createdBy: id };
}

/** Grants valid at `now`. */
function validAt(now: Date): SQL {
  return and(
    lte(grants.validFrom, now),
    or(isNull(grants.validUntil), gt(grants.validUntil, now)),
  ) as SQL;
}

/**
 * The org advisory lock, held until the transaction ends. `consume`, `withCapacity`, billing
 * sync and slot enforcement take it, so they never interleave for one organization.
 */
export async function lockOrg(tx: Tx, orgId: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('org:' || ${orgId}::text, 0))::text`,
  );
}

/**
 * Valid grants of `kind` with what is left on each, in draw order: the earliest `valid_until`
 * first (open-ended last), then the earliest `valid_from`.
 */
async function grantsWithLeft(
  db: DbOrTx,
  orgId: string,
  kind: EntitlementKind,
  now: Date,
): Promise<{ id: string; validUntil: Date | null; left: number }[]> {
  const rows = await db
    .select({
      id: grants.id,
      quantity: grants.quantity,
      validUntil: grants.validUntil,
      spent: sql<number>`coalesce(sum(${consumptions.quantity}), 0)::int`,
    })
    .from(grants)
    .leftJoin(
      consumptions,
      and(eq(consumptions.grantId, grants.id), isNull(consumptions.reversedAt)),
    )
    .where(and(eq(grants.orgId, orgId), eq(grants.kind, kind), validAt(now)))
    .groupBy(grants.id)
    .orderBy(sql`${grants.validUntil} asc nulls last`, asc(grants.validFrom), asc(grants.id));
  return rows.map((r) => ({
    id: r.id,
    validUntil: r.validUntil,
    left: Math.max(0, r.quantity - Number(r.spent)),
  }));
}

/**
 * Adds a grant. The same `idempotencyKey` always returns the grant it first created
 * (`created: false`), even after that grant was ended, and writes nothing.
 */
export async function grant(
  db: DbOrTx,
  i: {
    orgId: string;
    kind: EntitlementKind;
    quantity: number;
    source: GrantSource;
    sourceRef: string;
    validFrom?: Date;
    validUntil?: Date | null;
    idempotencyKey: string;
    actor: Actor;
    reason?: string;
  },
): Promise<{ grantId: string; created: boolean }> {
  assertQuantity(i.quantity);
  assertKey(i.idempotencyKey);
  const validFrom = i.validFrom ?? new Date();
  const validUntil = i.validUntil ?? null;
  if (validUntil !== null && validUntil < validFrom) {
    throw badRequest('validUntil must not be before validFrom');
  }
  const { actorType, actorId, createdBy } = who(i.actor);

  return db.transaction(async (tx) => {
    const id = newId();
    const inserted = await tx
      .insert(grants)
      .values({
        id,
        orgId: i.orgId,
        kind: i.kind,
        quantity: i.quantity,
        source: i.source,
        sourceRef: i.sourceRef,
        validFrom,
        validUntil,
        idempotencyKey: i.idempotencyKey,
        reason: i.reason ?? null,
        createdBy,
      })
      .onConflictDoNothing({ target: grants.idempotencyKey })
      .returning({ id: grants.id });

    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ id: grants.id, orgId: grants.orgId })
        .from(grants)
        .where(eq(grants.idempotencyKey, i.idempotencyKey));
      if (!existing) throw new Error('grant: idempotency key conflict without a row');
      if (existing.orgId !== i.orgId) {
        throw conflict('This idempotency key was used for another organization');
      }
      return { grantId: existing.id, created: false };
    }

    await record(tx, {
      actorType,
      actorId,
      orgId: i.orgId,
      action: 'entitlements.granted',
      subjectType: 'entitlement_grant',
      subjectId: id,
      data: {
        kind: i.kind,
        quantity: i.quantity,
        source: i.source,
        sourceRef: i.sourceRef,
        validFrom: validFrom.toISOString(),
        validUntil: validUntil?.toISOString() ?? null,
        reason: i.reason ?? null,
      },
    });
    return { grantId: id, created: true };
  });
}

/**
 * Ends a grant at `at` (it stops counting from `at` on). Never lengthens a grant: when it
 * already ends at or before `at`, nothing changes. An `at` before the grant starts ends it at
 * its start, so it never counts.
 */
export async function endGrant(db: DbOrTx, grantId: string, at: Date, actor: Actor): Promise<void> {
  if (!UUID.test(grantId)) throw notFound('Grant not found');
  const { actorType, actorId } = who(actor);

  await db.transaction(async (tx) => {
    const [g] = await tx
      .select({
        orgId: grants.orgId,
        kind: grants.kind,
        quantity: grants.quantity,
        validFrom: grants.validFrom,
        validUntil: grants.validUntil,
      })
      .from(grants)
      .where(eq(grants.id, grantId))
      .for('update');
    if (!g) throw notFound('Grant not found');

    const end = new Date(Math.max(g.validFrom.getTime(), at.getTime()));
    if (g.validUntil !== null && g.validUntil <= end) return;

    await tx.update(grants).set({ validUntil: end }).where(eq(grants.id, grantId));
    await record(tx, {
      actorType,
      actorId,
      orgId: g.orgId,
      action: 'entitlements.grant_ended',
      subjectType: 'entitlement_grant',
      subjectId: grantId,
      data: {
        kind: g.kind,
        quantity: g.quantity,
        validUntil: end.toISOString(),
        previousValidUntil: g.validUntil?.toISOString() ?? null,
      },
    });
  });
}

/**
 * Spends `quantity` (default 1) credits under the org lock, in its own savepoint. Draws from
 * the grant that expires first, splitting across grants (rows keyed `<key>`, `<key>#2`, ...),
 * and returns the first row's id. The same key again returns that consumption and writes
 * nothing. When the balance is too low it writes nothing and returns `insufficient`.
 */
export async function consume(
  db: DbOrTx,
  i: {
    orgId: string;
    kind: CreditKind;
    quantity?: number;
    subjectType: string;
    subjectId: string;
    idempotencyKey: string;
    actor: Actor;
  },
): Promise<ConsumeResult> {
  const quantity = i.quantity ?? 1;
  assertQuantity(quantity);
  assertKey(i.idempotencyKey);
  if (SPLIT_SUFFIX.test(i.idempotencyKey)) {
    throw badRequest('idempotencyKey must not end in #<number>');
  }
  const { actorType, actorId, createdBy } = who(i.actor);

  return db.transaction(async (tx): Promise<ConsumeResult> => {
    await lockOrg(tx, i.orgId);
    const now = new Date();

    const [existing] = await tx
      .select({ id: consumptions.id, orgId: consumptions.orgId, kind: consumptions.kind })
      .from(consumptions)
      .where(eq(consumptions.idempotencyKey, i.idempotencyKey));
    if (existing) {
      if (existing.orgId !== i.orgId || existing.kind !== i.kind) {
        throw conflict('This idempotency key was used for another consumption');
      }
      const { balance } = await getBalance(tx, i.orgId, i.kind, now);
      return { ok: true, consumptionId: existing.id, remaining: balance };
    }

    const open = (await grantsWithLeft(tx, i.orgId, i.kind, now)).filter((g) => g.left > 0);
    const total = open.reduce((sum, g) => sum + g.left, 0);
    if (total < quantity) return { ok: false, reason: 'insufficient', remaining: total };

    const rows: (typeof consumptions.$inferInsert & { id: string })[] = [];
    let needed = quantity;
    for (const g of open) {
      if (needed === 0) break;
      const take = Math.min(needed, g.left);
      rows.push({
        id: newId(),
        orgId: i.orgId,
        grantId: g.id,
        kind: i.kind,
        quantity: take,
        subjectType: i.subjectType,
        subjectId: i.subjectId,
        idempotencyKey:
          rows.length === 0 ? i.idempotencyKey : `${i.idempotencyKey}#${rows.length + 1}`,
        createdBy,
      });
      needed -= take;
    }
    await tx.insert(consumptions).values(rows);

    const consumptionId = rows[0]?.id as string;
    await record(tx, {
      actorType,
      actorId,
      orgId: i.orgId,
      action: 'entitlements.consumed',
      subjectType: 'entitlement_consumption',
      subjectId: consumptionId,
      data: {
        kind: i.kind,
        quantity,
        for: { type: i.subjectType, id: i.subjectId },
        grantIds: rows.map((r) => r.grantId),
      },
    });
    return { ok: true, consumptionId, remaining: total - quantity };
  });
}

/**
 * Reverses every row of the consumption `consumptionId` belongs to, which gives the credits
 * back to their grants. Reversing an already reversed consumption changes nothing.
 */
export async function reverse(
  db: DbOrTx,
  consumptionId: string,
  reason: string,
  actor: Actor,
): Promise<void> {
  if (!UUID.test(consumptionId)) throw notFound('Consumption not found');
  const { actorType, actorId } = who(actor);

  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ orgId: consumptions.orgId, idempotencyKey: consumptions.idempotencyKey })
      .from(consumptions)
      .where(eq(consumptions.id, consumptionId));
    if (!row) throw notFound('Consumption not found');
    await lockOrg(tx, row.orgId);

    // The rows of one consumption are keyed base, base#2, base#3, ... with no gaps.
    const base = row.idempotencyKey.replace(SPLIT_SUFFIX, '');
    const keys: string[] = [];
    let baseId: string | null = null;
    for (let n = 1; ; n++) {
      const key = n === 1 ? base : `${base}#${n}`;
      const [r] = await tx
        .select({ id: consumptions.id })
        .from(consumptions)
        .where(and(eq(consumptions.idempotencyKey, key), eq(consumptions.orgId, row.orgId)));
      if (!r) break;
      baseId ??= r.id;
      keys.push(key);
    }
    if (keys.length === 0) return;

    const reversed = await tx
      .update(consumptions)
      .set({ reversedAt: new Date(), reversalReason: reason })
      .where(and(inArray(consumptions.idempotencyKey, keys), isNull(consumptions.reversedAt)))
      .returning({ kind: consumptions.kind, quantity: consumptions.quantity });
    if (reversed.length === 0) return;

    await record(tx, {
      actorType,
      actorId,
      orgId: row.orgId,
      action: 'entitlements.reversed',
      subjectType: 'entitlement_consumption',
      subjectId: baseId,
      data: {
        kind: reversed[0]?.kind,
        quantity: reversed.reduce((sum, r) => sum + r.quantity, 0),
        reason,
      },
    });
  });
}

/**
 * `balance`: what is left on the grants valid at `now`. `resetsAt`: the earliest `valid_until`
 * among those grants with something left, or null when none of them expires.
 */
export async function getBalance(
  db: DbOrTx,
  orgId: string,
  kind: CreditKind,
  now: Date = new Date(),
): Promise<{ balance: number; resetsAt: Date | null }> {
  const rows = await grantsWithLeft(db, orgId, kind, now);
  let balance = 0;
  let resetsAt: Date | null = null;
  for (const g of rows) {
    if (g.left === 0) continue;
    balance += g.left;
    if (g.validUntil !== null && (resetsAt === null || g.validUntil < resetsAt)) {
      resetsAt = g.validUntil;
    }
  }
  return { balance, resetsAt };
}

/** Grants valid at `now`, filtered by source and kind, oldest first. */
export async function listOpenGrants(
  db: DbOrTx,
  orgId: string,
  i: { source?: GrantSource; kind?: EntitlementKind },
  now: Date = new Date(),
): Promise<OpenGrant[]> {
  const where: SQL[] = [eq(grants.orgId, orgId), validAt(now)];
  if (i.source !== undefined) where.push(eq(grants.source, i.source));
  if (i.kind !== undefined) where.push(eq(grants.kind, i.kind));
  return db
    .select({
      id: grants.id,
      kind: grants.kind,
      quantity: grants.quantity,
      sourceRef: grants.sourceRef,
      validUntil: grants.validUntil,
    })
    .from(grants)
    .where(and(...where))
    .orderBy(asc(grants.validFrom), asc(grants.id));
}

/** The total quantity of the grants of `kind` valid at `now` (capacity limits). Internal. */
export async function sumValidGrants(
  db: DbOrTx,
  orgId: string,
  kind: EntitlementKind,
  now: Date,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${grants.quantity}), 0)::int` })
    .from(grants)
    .where(and(eq(grants.orgId, orgId), eq(grants.kind, kind), validAt(now)));
  return Number(row?.total ?? 0);
}
