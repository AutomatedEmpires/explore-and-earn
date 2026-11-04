// Follows: following a public host page, the private follower list, paged new-job notifications
// and the privacy hooks (SP2 Task 33).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { emit, runWorker } from '@/modules/jobs';
import type { PublishedListing } from '@/modules/listings';
import { listingsFake } from '../../../tests/fakes/sp2/listings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import {
  buildListingContent,
  seedHostOrg,
  seedSeeker,
  type SeededOrg,
} from '../../../tests/helpers/sp2';
import {
  emptyHostPage,
  follow,
  jobHandlers,
  listFollowerIds,
  listFollows,
  privacyHandlers,
  unfollow,
  unfollowHost,
} from './index';

vi.mock('@/modules/orgs', async (orig) => ({
  ...(await orig<typeof import('@/modules/orgs')>()),
  ...(await import('../../../tests/fakes/sp2/orgs')).orgsFake,
}));
vi.mock('@/modules/billing', async (orig) => ({
  ...(await orig<typeof import('@/modules/billing')>()),
  ...(await import('../../../tests/fakes/sp2/billing')).billingFake,
}));
vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));
vi.mock('@/modules/listings', async (orig) => ({
  ...(await orig<typeof import('@/modules/listings')>()),
  ...(await import('../../../tests/fakes/sp2/listings')).listingsFake,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  listingsFake.reset();
  await t.db.execute(
    sql`truncate app.host_follows, app.host_pages, app.org_slugs, app.org_memberships,
      app.organizations, app.notification_batches, app.notifications, app.users, app.outbox
      cascade`,
  );
});

type PublicOrg = SeededOrg & { slug: string };

async function publicOrg(name = `Lodge ${newId().slice(-6)}`): Promise<PublicOrg> {
  const org = await seedHostOrg(t.db, { name });
  await t.db.execute(sql`
    insert into app.host_pages (org_id, content, first_public_at)
    values (${org.orgId}, ${JSON.stringify(emptyHostPage())}::jsonb, now())
  `);
  const [row] = await queryRows<{ slug: string }>(
    t.db,
    sql`select slug from app.organizations where id = ${org.orgId}`,
  );
  return { ...org, slug: row?.slug ?? '' };
}

const followRows = (orgId: string) =>
  queryRows<{ user_id: string }>(
    t.db,
    sql`select user_id from app.host_follows where org_id = ${orgId}`,
  );

async function addFollowers(orgId: string, count: number): Promise<void> {
  await t.db.execute(sql`
    with u as (
      insert into app.users (id, clerk_user_id, email, display_name, account_type, adult_attested_at)
      select gen_random_uuid(), 'user_' || gen_random_uuid()::text,
        'f-' || gen_random_uuid()::text || '@x.test', 'Follower', 'seeker', now()
      from generate_series(1, ${count}::int) g
      returning id
    )
    insert into app.host_follows (user_id, org_id) select id, ${orgId}::uuid from u
  `);
}

function listing(orgId: string, title: string): PublishedListing {
  const at = new Date('2026-11-03T17:00:00Z');
  return {
    listingId: newId(),
    revisionId: newId(),
    orgId,
    content: buildListingContent(
      {
        locationId: newId(),
        coverMediaId: newId(),
        housingPhotos: { bedroom: newId(), bathroom: newId(), kitchen: newId(), exterior: newId() },
      },
      (c) => {
        c.basics.title = title;
      },
    ),
    firstPublishedAt: at,
    publishedAt: at,
    confirmedActiveAt: null,
    autoCloseAt: null,
    applicationsCloseAt: null,
    provenance: 'host_created',
  };
}

describe('follow and unfollow', () => {
  it('follows a public host once, and unfollows', async () => {
    const org = await publicOrg();
    const seeker = await seedSeeker(t.db);

    expect(await follow(t.db, seeker.userId, org.slug)).toEqual({ following: true });
    expect(await follow(t.db, seeker.userId, org.slug)).toEqual({ following: true });
    expect(await followRows(org.orgId)).toEqual([{ user_id: seeker.userId }]);
    const [audit] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.audit_events
          where org_id = ${org.orgId} and action = 'hostpages.followed'`,
    );
    expect(audit?.n).toBe(1);

    await unfollow(t.db, seeker.userId, org.orgId);
    expect(await followRows(org.orgId)).toEqual([]);

    await follow(t.db, seeker.userId, org.slug);
    expect(await unfollowHost(t.db, seeker.userId, org.slug)).toEqual({ following: false });
    expect(await followRows(org.orgId)).toEqual([]);
  });

  it("can't follow a page that isn't public", async () => {
    const hidden = await seedHostOrg(t.db, { name: 'Hidden Lodge' });
    const seeker = await seedSeeker(t.db);
    await expect(follow(t.db, seeker.userId, 'hidden-lodge')).rejects.toMatchObject({
      code: 'not_found',
    });
    await expect(follow(t.db, seeker.userId, 'no-such-host')).rejects.toMatchObject({
      code: 'not_found',
    });
    expect(await followRows(hidden.orgId)).toEqual([]);
  });
});

describe('listFollowerIds', () => {
  it('pages through followers by user id', async () => {
    const org = await publicOrg();
    await addFollowers(org.orgId, 3);
    const all = (await followRows(org.orgId)).map((r) => r.user_id).sort();

    const first = await listFollowerIds(t.db, org.orgId, { limit: 2 });
    expect(first.userIds).toEqual(all.slice(0, 2));
    expect(first.next).toBe(all[1]);
    const second = await listFollowerIds(t.db, org.orgId, {
      limit: 2,
      after: first.next ?? undefined,
    });
    expect(second).toEqual({ userIds: all.slice(2), next: null });
  });
});

describe('hostpages.notify_followers', () => {
  it('tells every follower about a first publish, 500 per run', async () => {
    const org = await publicOrg('Kettle Ridge Lodge');
    await addFollowers(org.orgId, 1_200);
    const l = listing(org.orgId, 'Lift Operator');
    listingsFake.setListing(l);

    await emit(
      t.db,
      'listing.published',
      { listingId: l.listingId, revisionId: l.revisionId, orgId: org.orgId, first: true },
      newId(),
    );
    await runWorker(t.db, { handlers: jobHandlers, batchSize: 50 });

    const rows = await queryRows<{ n: number; users: number }>(
      t.db,
      sql`select count(*)::int as n, count(distinct user_id)::int as users
            from app.notifications where type = 'hosts.new_job'`,
    );
    expect(rows[0]).toEqual({ n: 1_200, users: 1_200 });
    const [one] = await queryRows<{ title: string; data: Record<string, unknown> }>(
      t.db,
      sql`select title, data from app.notifications where type = 'hosts.new_job' limit 1`,
    );
    expect(one?.title).toBe('Kettle Ridge Lodge posted a new job');
    expect(one?.data).toEqual({
      orgName: 'Kettle Ridge Lodge',
      listingTitle: 'Lift Operator',
      href: `/jobs/view/${l.listingId}`,
    });
    const runs = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.outbox
            where topic = 'hostpages.notify_followers' and status = 'done'`,
    );
    expect(runs[0]?.n).toBe(3);
    // Emails wait in each follower's host_follow digest.
    const [batches] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notification_batches where batch_key = 'host_follow'`,
    );
    expect(batches?.n).toBe(1_200);
  }, 120_000);

  it('stays quiet for an edit or a republish', async () => {
    const org = await publicOrg();
    await addFollowers(org.orgId, 3);
    const l = listing(org.orgId, 'Deckhand');
    listingsFake.setListing(l);
    await emit(
      t.db,
      'listing.published',
      { listingId: l.listingId, revisionId: l.revisionId, orgId: org.orgId, first: false },
      newId(),
    );
    await runWorker(t.db, { handlers: jobHandlers });
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.notifications where type = 'hosts.new_job'`,
    );
    expect(row?.n).toBe(0);
  });
});

describe('listFollows and privacy', () => {
  it('lists the hosts a seeker follows, exports them, and erases them', async () => {
    const a = await publicOrg('Alpha Farm');
    const b = await publicOrg('Beta Boats');
    const seeker = await seedSeeker(t.db);
    await follow(t.db, seeker.userId, a.slug);
    await follow(t.db, seeker.userId, b.slug);
    await t.db.execute(
      sql`update app.organizations set status = 'suspended' where id = ${b.orgId}`,
    );

    const { items } = await listFollows(t.db, seeker.userId);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ orgId: a.orgId, name: 'Alpha Farm', slug: a.slug });

    const exported = await privacyHandlers.export(t.db, seeker.userId);
    expect(exported).toMatchObject({
      follows: expect.arrayContaining([
        expect.objectContaining({ orgId: a.orgId, name: 'Alpha Farm' }),
        expect.objectContaining({ orgId: b.orgId, name: 'Beta Boats' }),
      ]),
    });

    await privacyHandlers.erase(t.db, seeker.userId);
    expect(await followRows(a.orgId)).toEqual([]);
    expect(await followRows(b.orgId)).toEqual([]);
    expect((await listFollows(t.db, seeker.userId)).items).toEqual([]);
  });
});
