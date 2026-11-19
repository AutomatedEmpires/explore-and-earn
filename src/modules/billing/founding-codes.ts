// Founding host codes: RETIRED by FD-7 (docs/decisions/2026-11-04-founder-decisions.md). Under
// FD-7 signup order decides the founding cohort (./founding.ts), so a code no longer gates or
// grants anything, and checkout ignores one. What is left is kept only because code outside
// billing still imports it: scripts/ops-founding-codes.ts (createFoundingCodes) and the shared
// billing fake in tests/fakes/sp2/billing.ts (createFoundingCodes, getFoundingCount). Remove it
// with them.
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { queryRows, type Db, type DbOrTx } from '@/lib/db';
import { badRequest } from '@/lib/errors';
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

/** Redeemed codes, unexpired holds, and the founding.max_hosts cap (legacy; see the header). */
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
