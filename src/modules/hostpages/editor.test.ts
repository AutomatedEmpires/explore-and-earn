// The host page editor: saving, held changes and the text check, operator decisions on held
// changes, and the first-public stamp (SP2 Task 31).
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { runWorker, type HandlerMap } from '@/modules/jobs';
import { jobHandlers as notificationHandlers } from '@/modules/notifications';
import { decide, listOpenReviewItems } from '@/modules/trust';
import { billingFake } from '../../../tests/fakes/sp2/billing';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMedia, seedMember, type SeededOrg } from '../../../tests/helpers/sp2';
import { getHostPageForEditor, jobHandlers, saveHostPage, type HostPageContent } from './index';

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

// hostpage.updated has no SP2 subscriber (SP3 projects it later); a test topic makes it visible.
vi.mock('@/server/event-subscribers', async (orig) => {
  const m = await orig<typeof import('@/server/event-subscribers')>();
  return {
    ...m,
    eventSubscribers: { ...m.eventSubscribers, 'hostpage.updated': ['test.hostpage_updated'] },
  };
});

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  billingFake.reset();
  await t.db.execute(
    sql`truncate app.host_follows, app.host_pages, app.review_actions, app.review_notes,
      app.review_items, app.trust_checks, app.media, app.org_slugs, app.org_memberships,
      app.organizations, app.notification_batches, app.notifications, app.operators, app.users,
      app.outbox cascade`,
  );
});

const handlers: HandlerMap = {
  ...jobHandlers,
  ...notificationHandlers,
  'test.hostpage_updated': async () => {},
};

const drain = () => runWorker(t.db, { handlers });

function page(edit?: (c: HostPageContent) => void): HostPageContent {
  const c: HostPageContent = {
    logoMediaId: null,
    coverMediaId: null,
    about: { story: '', perks: [], social: [] },
    photos: [],
    team: [],
    teamConsent: false,
    faq: [],
  };
  edit?.(c);
  return c;
}

const outboxTopics = async () =>
  (
    await queryRows<{ topic: string }>(t.db, sql`select topic from app.outbox order by created_at`)
  ).map((r) => r.topic);

const notificationsOf = (type: string) =>
  queryRows<{ user_id: string; data: Record<string, unknown> }>(
    t.db,
    sql`select user_id, data from app.notifications where type = ${type} order by created_at`,
  );

const auditCount = async (orgId: string, action: string) => {
  const [row] = await queryRows<{ n: number }>(
    t.db,
    sql`select count(*)::int as n from app.audit_events
        where org_id = ${orgId} and action = ${action}`,
  );
  return row?.n ?? 0;
};

/** Makes `story` the live story (saved, then checked by the stub). */
async function liveStory(org: SeededOrg, story: string): Promise<void> {
  await saveHostPage(
    t.db,
    org.owner.ctx,
    page((c) => (c.about.story = story)),
  );
  await drain();
  const { content, status } = await getHostPageForEditor(t.db, org.owner.ctx);
  expect(status).toBe('live');
  expect(content.about.story).toBe(story);
}

async function addOwnerOperator(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, 'Operator', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${id}, 'owner', '{}'::text[], 'on_shift')
  `);
  return id;
}

describe('getHostPageForEditor', () => {
  it('returns an empty live page before the first save', async () => {
    const org = await seedHostOrg(t.db);
    expect(await getHostPageForEditor(t.db, org.owner.ctx)).toEqual({
      content: page(),
      pending: null,
      status: 'live',
    });
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(getHostPageForEditor(t.db, recruiter.ctx)).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('saveHostPage', () => {
  it('checks changed text before it goes live, then applies it', async () => {
    const org = await seedHostOrg(t.db);
    const story = 'We run a family lodge in the Cascades and hire every winter.';

    expect(
      await saveHostPage(
        t.db,
        org.owner.ctx,
        page((c) => (c.about.story = story)),
      ),
    ).toEqual({ status: 'checking' });
    expect(await outboxTopics()).toEqual(['hostpages.check_content']);
    const held = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(held.status).toBe('checking');
    expect(held.content.about.story).toBe('');
    expect(held.pending?.about.story).toBe(story);

    await drain();
    const live = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(live).toMatchObject({ status: 'live', pending: null });
    expect(live.content.about.story).toBe(story);
    expect(await outboxTopics()).toContain('test.hostpage_updated');
    expect(await auditCount(org.orgId, 'hostpages.updated')).toBe(1);
  });

  it('holds a flagged change in review while the current page stays live', async () => {
    const org = await seedHostOrg(t.db);
    const admin = await seedMember(t.db, org.orgId, 'admin');
    await seedMember(t.db, org.orgId, 'recruiter');
    await liveStory(org, 'Old story about our lodge.');

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'New story __flag__')),
    );
    await drain();

    const held = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(held.status).toBe('in_review');
    expect(held.content.about.story).toBe('Old story about our lodge.');
    expect(held.pending?.about.story).toBe('New story __flag__');
    const rows = await notificationsOf('hostpages.content_held');
    expect(rows.map((r) => r.user_id).sort()).toEqual([org.owner.userId, admin.userId].sort());
    expect(rows[0]?.data).toMatchObject({ rejected: false });
    expect(await listOpenReviewItems(t.db, 'host_page', org.orgId)).toHaveLength(1);
  });

  it('discards a rejected change and says why', async () => {
    const org = await seedHostOrg(t.db);
    await liveStory(org, 'Old story about our lodge.');

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.faq = [{ q: 'Pets?', a: '__block__' }])),
    );
    await drain();

    const after = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(after).toMatchObject({ status: 'live', pending: null });
    expect(after.content.faq).toEqual([]);
    const [row] = await notificationsOf('hostpages.content_held');
    expect(row?.user_id).toBe(org.owner.userId);
    expect(row?.data).toMatchObject({ rejected: true, reason: 'stub' });
  });

  it('checks the same change again when it is saved again after a rejection', async () => {
    const org = await seedHostOrg(t.db);
    const blocked = page((c) => (c.about.story = 'Story __block__'));
    await saveHostPage(t.db, org.owner.ctx, blocked);
    await drain();
    expect((await getHostPageForEditor(t.db, org.owner.ctx)).pending).toBeNull();

    expect(await saveHostPage(t.db, org.owner.ctx, blocked)).toEqual({ status: 'checking' });
    await drain();
    expect(await getHostPageForEditor(t.db, org.owner.ctx)).toMatchObject({
      status: 'live',
      pending: null,
    });
    expect(await notificationsOf('hostpages.content_held')).toHaveLength(2);
  });

  it('applies a change without new text at once', async () => {
    const org = await seedHostOrg(t.db);
    await liveStory(org, 'Old story about our lodge.');
    const logo = await seedMedia(t.db, org.orgId, 'logo');
    await t.db.execute(sql`truncate app.outbox`);

    const result = await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => {
        c.about.story = 'Old story about our lodge.';
        c.logoMediaId = logo;
      }),
    );
    expect(result).toEqual({ status: 'live' });
    expect(await outboxTopics()).toEqual(['test.hostpage_updated']);
    const live = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(live.content.logoMediaId).toBe(logo);
    expect(await auditCount(org.orgId, 'hostpages.updated')).toBe(2);
  });

  it('accepts the org media of the right kinds', async () => {
    const org = await seedHostOrg(t.db);
    const ids = {
      logo: await seedMedia(t.db, org.orgId, 'logo'),
      cover: await seedMedia(t.db, org.orgId, 'cover'),
      photo: await seedMedia(t.db, org.orgId, 'listing_photo', 'scanning'),
      avatar: await seedMedia(t.db, org.orgId, 'avatar'),
    };
    const result = await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => {
        c.logoMediaId = ids.logo;
        c.coverMediaId = ids.cover;
        c.photos = [{ mediaId: ids.photo, caption: null }];
        c.team = [{ name: 'Sam', title: 'Owner', mediaId: ids.avatar, bio: null }];
        c.teamConsent = true;
      }),
    );
    expect(result.status).toBe('checking');
  });

  it("refuses another org's media, the wrong kind of media and a team without consent", async () => {
    const org = await seedHostOrg(t.db);
    const other = await seedHostOrg(t.db, { name: 'Other Lodge' });
    const theirs = await seedMedia(t.db, other.orgId, 'logo');
    const avatar = await seedMedia(t.db, org.orgId, 'avatar');

    for (const content of [
      page((c) => (c.logoMediaId = theirs)),
      page((c) => (c.coverMediaId = avatar)),
      page((c) => (c.photos = [{ mediaId: newId(), caption: null }])),
      page((c) => (c.team = [{ name: 'Sam', title: 'Owner', mediaId: null, bio: null }])),
    ]) {
      await expect(saveHostPage(t.db, org.owner.ctx, content)).rejects.toMatchObject({
        code: 'bad_request',
      });
    }
    expect(await outboxTopics()).toEqual([]);
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');
    await expect(saveHostPage(t.db, billing.ctx, page())).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('operator decisions on a held change', () => {
  it('approve applies the pending content; remove discards it', async () => {
    const org = await seedHostOrg(t.db);
    const operatorId = await addOwnerOperator();
    await liveStory(org, 'Old story about our lodge.');

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'Approved __flag__')),
    );
    await drain();
    const [first] = await listOpenReviewItems(t.db, 'host_page', org.orgId);
    await decide(t.db, first?.id ?? '', operatorId, 'approve');
    const approved = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(approved).toMatchObject({ status: 'live', pending: null });
    expect(approved.content.about.story).toBe('Approved __flag__');

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'Removed __flag__')),
    );
    await drain();
    const [second] = await listOpenReviewItems(t.db, 'host_page', org.orgId);
    await decide(t.db, second?.id ?? '', operatorId, 'remove');
    const removed = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(removed).toMatchObject({ status: 'live', pending: null });
    expect(removed.content.about.story).toBe('Approved __flag__');
  });

  it('never applies a newer change on an item about an older one', async () => {
    const org = await seedHostOrg(t.db);
    const operatorId = await addOwnerOperator();

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'First __flag__')),
    );
    await drain();
    const [stale] = await listOpenReviewItems(t.db, 'host_page', org.orgId);
    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'Second __flag__')),
    );

    await decide(t.db, stale?.id ?? '', operatorId, 'approve');
    const held = await getHostPageForEditor(t.db, org.owner.ctx);
    expect(held.content.about.story).toBe('');
    expect(held.pending?.about.story).toBe('Second __flag__');
  });

  it('ask_info tells the Owner and Admins; suspend sanctions the org', async () => {
    const org = await seedHostOrg(t.db);
    const operatorId = await addOwnerOperator();
    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'Story __flag__')),
    );
    await drain();
    const [item] = await listOpenReviewItems(t.db, 'host_page', org.orgId);
    await decide(t.db, item?.id ?? '', operatorId, 'ask_info', { note: 'Who is in the photo?' });
    const rows = await notificationsOf('hostpages.content_held');
    expect(rows.at(-1)?.data).toMatchObject({ note: 'Who is in the photo?' });

    await saveHostPage(
      t.db,
      org.owner.ctx,
      page((c) => (c.about.story = 'Again __flag__')),
    );
    await drain();
    const [next] = await listOpenReviewItems(t.db, 'host_page', org.orgId);
    await decide(t.db, next?.id ?? '', operatorId, 'suspend');
    expect(billingFake.callsTo('sanctionOrg')).toEqual([
      [org.orgId, 'suspend', { type: 'operator', id: null }],
    ]);
  });
});

describe('hostpages.mark_public', () => {
  const envelope = (orgId: string, status: string) => ({
    event: 'subscription.changed',
    eventId: newId(),
    data: { orgId, status, plan: 'professional' },
  });

  const firstPublicAt = async (orgId: string) => {
    const [row] = await queryRows<{ first_public_at: string | null }>(
      t.db,
      sql`select first_public_at from app.host_pages where org_id = ${orgId}`,
    );
    return row?.first_public_at ? new Date(row.first_public_at) : null;
  };

  it('stamps first_public_at the first time the org is entitled, and keeps it', async () => {
    const org = await seedHostOrg(t.db);
    const markPublic = jobHandlers['hostpages.mark_public'];
    if (!markPublic) throw new Error('no handler');

    await markPublic(envelope(org.orgId, 'incomplete'), { db: t.db, now: new Date() });
    expect(await firstPublicAt(org.orgId)).toBeNull();

    const first = new Date('2026-11-03T17:00:00Z');
    await markPublic(envelope(org.orgId, 'active'), { db: t.db, now: first });
    expect(await firstPublicAt(org.orgId)).toEqual(first);

    await markPublic(envelope(org.orgId, 'trialing'), {
      db: t.db,
      now: new Date('2026-12-01T00:00:00Z'),
    });
    expect(await firstPublicAt(org.orgId)).toEqual(first);
    // The editor still sees an empty page.
    expect((await getHostPageForEditor(t.db, org.owner.ctx)).content).toEqual(page());
  });
});
