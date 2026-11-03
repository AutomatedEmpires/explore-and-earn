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
