// Concurrent submits on a real Postgres (SP4 plan Task 20; CI only): ten requests racing on
// the unique (listing, seeker) key create one application, one set of notifications and one
// outbox row per subscriber, and the nine losers get the winner's receipt.
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeClient, createDb, queryRows } from '@/lib/db';
import { resetSp2 } from '@tests/fakes/sp4/sp2';
// Registers the three notification types the real notify() needs.
import './notification-types';
import { submitApplication } from './submit';
import { deckhand, input, resetMocks, seedWorld, type World } from './test-fixtures';

vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('@tests/fakes/sp4/sp2')).listingsModule,
}));
vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('@tests/fakes/sp4/sp2')).orgsAdditions,
}));
vi.mock('@/modules/hostpages', async () => (await import('@tests/fakes/sp4/sp2')).hostpagesModule);
vi.mock('@/modules/locations', async () => (await import('@tests/fakes/sp4/sp2')).locationsModule);
vi.mock('@/modules/profiles', async () => (await import('./test-fixtures')).profilesMock());
vi.mock('@/modules/safety', async () => (await import('./test-fixtures')).safetyMock());
vi.mock('@/server/event-subscribers', () => ({
  eventSubscribers: {
    'application.submitted': ['applications.listing_event', 'hiring.application_submitted'],
    'application.withdrawn': ['hiring.application_withdrawn'],
  },
}));

// CI's postgis service, already migrated.
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required for integration tests');
const db = createDb(url);

let w: World;
const worlds: World[] = [];

const ids = (values: string[]) =>
  sql.join(
    values.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

// Applications are never deleted in the app (the guard refuses), so the cleanup switches the
// triggers off for its own transaction. Later integration files then find the tables as they
// expect them.
afterAll(async () => {
  const users = worlds.flatMap((x) =>
    [x.seeker, x.owner.user, x.admin.user, x.recruiter.user, x.billing.user].map((u) => u.id),
  );
  const orgs = worlds.map((x) => x.orgId);
  if (users.length > 0) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
      await tx.execute(sql`
        delete from app.application_events where application_id in
          (select id from app.applications where org_id in (${ids(orgs)}))`);
      await tx.execute(sql`delete from app.applications where org_id in (${ids(orgs)})`);
      await tx.execute(sql`delete from app.notifications where user_id in (${ids(users)})`);
      await tx.execute(sql`delete from app.org_memberships where org_id in (${ids(orgs)})`);
      await tx.execute(sql`delete from app.organizations where id in (${ids(orgs)})`);
      await tx.execute(sql`delete from app.users where id in (${ids(users)})`);
    });
  }
  await closeClient(db);
});

beforeEach(async () => {
  resetSp2();
  resetMocks();
  w = await seedWorld(db);
  worlds.push(w);
});

describe('submitApplication under concurrency', () => {
  it('creates one application from ten simultaneous submits', async () => {
    const l = deckhand(w);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitApplication(db, w.seeker.id, input(l))),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.application.applicationId)).size).toBe(1);
    const id = results[0]?.application.applicationId ?? '';

    const [count] = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.applications
          where listing_id = ${l.listingId}::uuid and seeker_user_id = ${w.seeker.id}::uuid`,
    );
    expect(count?.n).toBe(1);

    // Each listed member has exactly one new-applicant notification.
    const alerts = await queryRows<{ userId: string; n: number }>(
      db,
      sql`select user_id::text as "userId", count(*)::int as n from app.notifications
          where type = 'applications.new_applicant' and data->>'applicationId' = ${id}
          group by user_id order by user_id`,
    );
    expect(alerts.map((a) => a.n)).toEqual([1, 1]);
    expect(alerts.map((a) => a.userId).sort()).toEqual(
      [w.admin.user.id, w.recruiter.user.id].sort(),
    );

    const [event] = await queryRows<{ id: string }>(
      db,
      sql`select id::text from app.application_events where application_id = ${id}::uuid`,
    );
    const outbox = await queryRows<{ n: number }>(
      db,
      sql`select count(*)::int as n from app.outbox
          where dedupe_key = ${`${event?.id}:hiring.application_submitted`}`,
    );
    expect(outbox[0]?.n).toBe(1);
  });

  it('returns the receipt to a retry after the first submit committed', async () => {
    const l = deckhand(w);
    const first = await submitApplication(db, w.seeker.id, input(l));
    const retry = await submitApplication(db, w.seeker.id, input(l));
    expect(retry.created).toBe(false);
    expect(retry.application).toEqual(first.application);
  });
});
