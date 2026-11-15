// The founding cohort (FD-7 in docs/decisions/2026-11-04-founder-decisions.md): the first 100
// host organizations, in signup order. Signup is the app creating the organization, so a number
// is taken when the app first records an Owner (applyClerkOrganization). A staff member joining
// an existing organization never takes one. Billing reads the number to decide the founding
// discount; whether the organization has paid yet does not matter here.
import { eq, max, sql } from 'drizzle-orm';
import type { Db, DbOrTx } from '@/lib/db';
import { foundingCohort } from './schema';

/** Organizations 1-100 by signup order are founding hosts; number 101 never is. */
export const FOUNDING_COHORT_SIZE = 100;

/**
 * Gives `orgId` the next founding number and returns it, or returns null once all 100 are
 * taken. An org that already has one keeps it. Signups take the lock one at a time, so numbers
 * follow signup order and two signups can never share the last one. The next number is one past
 * the highest ever given: a number is never reissued, even after its organization's row is
 * hard-deleted (the number's row stays, with no org).
 */
export async function reserveFoundingNumber(db: DbOrTx, orgId: string): Promise<number | null> {
  // A savepoint inside the caller's transaction (the lock lasts until that one ends).
  return (db as Db).transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('founding_cohort'))`);
    const [existing] = await tx
      .select({ n: foundingCohort.foundingNumber })
      .from(foundingCohort)
      .where(eq(foundingCohort.orgId, orgId));
    if (existing) return existing.n;

    const [row] = await tx.select({ last: max(foundingCohort.foundingNumber) }).from(foundingCohort);
    const next = (row?.last ?? 0) + 1;
    if (next > FOUNDING_COHORT_SIZE) return null;
    await tx.insert(foundingCohort).values({ foundingNumber: next, orgId });
    return next;
  });
}

/** The org's founding number (1-100), or null when it is not a founding host. */
export async function getFoundingNumber(db: DbOrTx, orgId: string): Promise<number | null> {
  const [row] = await db
    .select({ n: foundingCohort.foundingNumber })
    .from(foundingCohort)
    .where(eq(foundingCohort.orgId, orgId));
  return row?.n ?? null;
}

/** How many founding numbers are taken: the highest one given, since none is ever reissued. */
export async function countFoundingCohort(db: DbOrTx): Promise<number> {
  const [row] = await db.select({ last: max(foundingCohort.foundingNumber) }).from(foundingCohort);
  return row?.last ?? 0;
}
