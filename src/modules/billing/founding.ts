// Founding host codes (SP2 spec section 8.7). An operator creates codes with
// `pnpm ops:founding-codes`; each is shown once and stored only as the sha256 of its normalized
// form. At checkout a code is held (under one advisory lock, so redeemed + held never passes
// founding.max_hosts) until its session expires, and redeemed when the subscription syncs.
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx, type Tx } from '@/lib/db';
import { badRequest, conflict } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { record } from '@/modules/audit';
import { getSetting } from '@/modules/settings';
import { foundingCodes } from './schema';

/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const NORMALIZED = /^EE[0-9A-HJKMNP-TV-Z]{8}$/;
const MAX_CODES_PER_BATCH = 100;

/** `EE-XXXX-XXXX`. `rand(n)` returns n random bytes; each byte picks one of the 32 letters. */
export function generateFoundingCode(rand: (n: number) => Uint8Array = randomBytes): string {
  const bytes = rand(8);
  let body = '';
  for (let i = 0; i < 8; i++) body += ALPHABET[(bytes[i] ?? 0) & 31];
  return `EE-${body.slice(0, 4)}-${body.slice(4)}`;
}

/**
 * The code as it is hashed: uppercase, without hyphens or spaces, with O read as 0 and I or L
 * as 1. Null unless it is `EE` plus 8 Crockford characters.
 */
export function normalizeFoundingCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]+/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  return NORMALIZED.test(s) ? s : null;
}

export function hashFoundingCode(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

/** Creates 1-100 codes and returns them in plaintext, once. Audit keeps only their last 4. */
export async function createFoundingCodes(
  db: Db,
  i: { count: number; note: string; operatorId: string | null },
): Promise<string[]> {
  if (!Number.isInteger(i.count) || i.count < 1 || i.count > MAX_CODES_PER_BATCH) {
    throw badRequest(`Create between 1 and ${MAX_CODES_PER_BATCH} codes at a time.`, {
      reason: 'invalid_count',
    });
  }
  return db.transaction(async (tx) => {
    const codes: string[] = [];
    while (codes.length < i.count) {
      const code = generateFoundingCode();
      const normalized = normalizeFoundingCode(code) as string;
      const inserted = await tx
        .insert(foundingCodes)
        .values({
          id: newId(),
          codeHash: hashFoundingCode(normalized),
          last4: normalized.slice(-4),
          note: i.note,
          createdBy: i.operatorId,
        })
        .onConflictDoNothing({ target: foundingCodes.codeHash })
        .returning({ id: foundingCodes.id });
      // A collision (1 in 2^40 per pair) just draws again.
      if (inserted.length > 0) codes.push(code);
    }
    await record(tx, {
      actorType: i.operatorId ? 'operator' : 'system',
      actorId: i.operatorId,
      action: 'billing.founding_codes_created',
      subjectType: 'founding_codes',
      subjectId: null,
      data: { count: codes.length, note: i.note, last4: codes.map((c) => c.slice(-4)) },
    });
    return codes;
  });
}

/** Redeemed codes, unexpired holds, and the founding.max_hosts cap. */
export async function getFoundingCount(
  db: DbOrTx,
  now: Date = new Date(),
): Promise<{ redeemed: number; held: number; max: number }> {
  const [row] = await queryRows<{ redeemed: number; held: number }>(
    db,
    sql`
      select
        count(*) filter (where status = 'redeemed')::int as redeemed,
        count(*) filter (where status = 'held' and held_until > ${now}::timestamptz)::int as held
      from app.founding_codes
    `,
  );
  return {
    redeemed: row?.redeemed ?? 0,
    held: row?.held ?? 0,
    max: await getSetting(db, 'founding.max_hosts'),
  };
}

/** Serializes every hold and redemption, so the cap holds under concurrent checkouts. */
async function lockFounding(tx: Tx): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('founding'))`);
}

const invalid = () => badRequest("That code isn't valid.", { reason: 'code_invalid' });

/**
 * Holds `code` for `orgId` until `until` (the Checkout session's expiry). The same org holding
 * it again moves the hold to `until`; an org holds at most one code at a time.
 */
export async function holdFoundingCode(
  tx: Tx,
  i: { orgId: string; code: string; until: Date },
): Promise<{ codeId: string }> {
  await lockFounding(tx);
  const now = new Date();
  const normalized = normalizeFoundingCode(i.code);
  if (!normalized) throw invalid();

  const [row] = await tx
    .select()
    .from(foundingCodes)
    .where(eq(foundingCodes.codeHash, hashFoundingCode(normalized)))
    .for('update');
  if (!row || row.status === 'revoked' || row.status === 'redeemed') throw invalid();

  const heldNow = row.status === 'held' && row.heldUntil !== null && row.heldUntil > now;
  if (heldNow && row.heldByOrgId !== i.orgId) throw invalid();

  // Another code this org was holding (an earlier checkout) is let go.
  await tx.execute(sql`
    update app.founding_codes
    set status = 'available', held_by_org_id = null, held_until = null
    where held_by_org_id = ${i.orgId}::uuid and status = 'held' and id <> ${row.id}::uuid
  `);

  if (!heldNow) {
    const { redeemed, held, max } = await getFoundingCount(tx, now);
    if (redeemed + held >= max) {
      throw conflict('Founding spots are all taken.', { reason: 'founding_unavailable' });
    }
  }

  await tx
    .update(foundingCodes)
    .set({ status: 'held', heldByOrgId: i.orgId, heldUntil: i.until })
    .where(eq(foundingCodes.id, row.id));
  return { codeId: row.id };
}

/**
 * Marks the code redeemed by `orgId` (when its founding subscription syncs). Returns whether it
 * changed anything: a code already redeemed, or an org that already redeemed one, is left alone.
 */
export async function redeemFoundingCode(
  tx: Tx,
  i: { codeId: string; orgId: string },
): Promise<boolean> {
  await lockFounding(tx);
  const [already] = await tx
    .select({ id: foundingCodes.id })
    .from(foundingCodes)
    .where(eq(foundingCodes.redeemedOrgId, i.orgId));
  if (already) return false;
  const updated = await tx
    .update(foundingCodes)
    .set({
      status: 'redeemed',
      redeemedOrgId: i.orgId,
      redeemedAt: new Date(),
      heldByOrgId: null,
      heldUntil: null,
    })
    .where(and(eq(foundingCodes.id, i.codeId), sql`${foundingCodes.status} <> 'redeemed'`))
    .returning({ id: foundingCodes.id });
  return updated.length > 0;
}

/** Lets go of any code the org holds (its Checkout session was replaced or failed). */
export async function releaseHold(tx: Tx, orgId: string): Promise<void> {
  await lockFounding(tx);
  await tx.execute(sql`
    update app.founding_codes
    set status = 'available', held_by_org_id = null, held_until = null
    where held_by_org_id = ${orgId}::uuid and status = 'held'
  `);
}
