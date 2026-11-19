// Runs against a real Postgres (CI's postgis service, already migrated by `pnpm db:migrate`).
// PGlite has a single connection, so only a real server shows two requests racing on row locks.
// A host who submits the onboarding form twice at once must get exactly one organization.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { makeFakeClerkAdmin } from './clerk-admin';
import { completeOnboarding, setAccountType } from './onboarding';
import { syncClerkUser } from './sync';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const created: string[] = [];

afterAll(async () => {
  for (const userId of created) {
    await db.execute(sql`delete from app.org_memberships where user_id = ${userId}`);
    // org_slugs references organizations (org_slugs_org_id_fkey), so it is cleared first.
    await db.execute(
      sql`delete from app.org_slugs where org_id in (select id from app.organizations where owner_user_id = ${userId})`,
    );
    await db.execute(sql`delete from app.organizations where owner_user_id = ${userId}`);
    await db.execute(sql`delete from app.users where id = ${userId}`);
  }
  await closeClient(db);
});

describe('host onboarding submitted twice at once', () => {
  it('creates exactly one organization', async () => {
    const clerkUserId = `user_int_${newId()}`;
    const userId = await syncClerkUser(db, {
      id: clerkUserId,
      public_metadata: {},
      updated_at: Date.now(),
    });
    created.push(userId);
    // The account type is saved; the race is over creating the organization.
    await setAccountType(db, makeFakeClerkAdmin(), userId, { accountType: 'host' });

    // Clerk takes a while to create an organization, long enough for both requests to overlap.
    const clerk = makeFakeClerkAdmin({ onCreateOrganization: () => sleep(200) });
    const name = `Kettle Ridge Lodge ${newId().slice(-8)}`;
    const input = { accountType: 'host', organizationName: name } as const;

    const results = await Promise.allSettled([
      completeOnboarding(db, clerk, userId, input),
      completeOnboarding(db, clerk, userId, input),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({ code: 'conflict' });
    expect(clerk.organizations).toHaveLength(1);

    const orgs = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.organizations where owner_user_id = ${userId}`,
    );
    expect(orgs).toEqual([{ n: 1 }]);
  });
});

// The age screen (legal review 2.6) on the real schema: only "adult: yes" and the year are kept,
// and drizzle/0102's constraints hold.
describe('seeker onboarding with a date of birth', () => {
  async function newUser(): Promise<string> {
    const userId = await syncClerkUser(db, {
      id: `user_int_${newId()}`,
      public_metadata: {},
      updated_at: Date.now(),
    });
    created.push(userId);
    return userId;
  }

  it('keeps the birth year with the adult confirmation, and no month or day', async () => {
    const userId = await newUser();
    await completeOnboarding(db, makeFakeClerkAdmin(), userId, {
      accountType: 'seeker',
      dateOfBirth: '1990-04-03',
    });

    const [row] = await queryRows<{ birth_year: number; adult: boolean; whole: string }>(
      db,
      sql`select birth_year, adult_attested_at is not null as adult, to_jsonb(u)::text as whole
          from app.users u where id = ${userId}`,
    );
    expect(row?.birth_year).toBe(1990);
    expect(row?.adult).toBe(true);
    expect(row?.whole).not.toMatch(/1990-04-03|04-03/);
  });

  /** The database's own message for a failed statement (drizzle keeps it as the cause). */
  async function failure(statement: Promise<unknown>): Promise<string> {
    const err = await statement.then(
      () => null,
      (e: unknown) => e,
    );
    if (!(err instanceof Error)) return 'no error';
    return err.cause instanceof Error ? err.cause.message : err.message;
  }

  it('never keeps a year without the adult confirmation, or outside 1900 to 2100', async () => {
    const userId = await newUser();
    expect(
      await failure(db.execute(sql`update app.users set birth_year = 1990 where id = ${userId}`)),
    ).toMatch(/users_birth_year_adult/);

    const seeker = await newUser();
    await setAccountType(db, makeFakeClerkAdmin(), seeker, {
      accountType: 'seeker',
      adultAttested: true,
    });
    expect(
      await failure(db.execute(sql`update app.users set birth_year = 1850 where id = ${seeker}`)),
    ).toMatch(/users_birth_year_range/);
  });

  // The refusal holds on the account (drizzle/0103). An under-age try and an adult try sent at
  // once race on the row: whichever lands first wins, and the row is never both.
  it('leaves an account refused or a seeker when a refusal races an adult try, never both', async () => {
    const child = {
      accountType: 'seeker',
      dateOfBirth: `${new Date().getUTCFullYear() - 10}-06-01`,
    } as const;
    const adult = { accountType: 'seeker', dateOfBirth: '1990-04-03' } as const;

    for (let n = 0; n < 5; n++) {
      const userId = await newUser();
      const clerk = makeFakeClerkAdmin();
      const [refusal, adultTry] = await Promise.allSettled([
        completeOnboarding(db, clerk, userId, child),
        completeOnboarding(db, clerk, userId, adult),
      ]);
      expect(refusal).toMatchObject({
        status: 'rejected',
        reason: { details: { reason: 'signup_refused' } },
      });
      const [row] = await queryRows<{ account_type: string | null; refused: boolean }>(
        db,
        sql`select account_type, signup_refused_at is not null as refused
            from app.users where id = ${userId}`,
      );
      const adultOutcome =
        adultTry?.status === 'rejected'
          ? (adultTry.reason as { details?: { reason?: string } }).details?.reason
          : adultTry?.status;
      expect([
        // The refusal landed first: the adult try is refused too, and nothing is set.
        'none/refused/signup_refused',
        // The adult try landed first: the account is a seeker and the refusal stamped nothing.
        'seeker/open/fulfilled',
      ]).toContain(
        `${row?.account_type ?? 'none'}/${row?.refused ? 'refused' : 'open'}/${adultOutcome}`,
      );
    }
  });
});
