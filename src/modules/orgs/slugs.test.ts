// Host page addresses (SP2 Task 19, spec section 8.5): format, reserved words, retired slugs.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg, seedMember } from '../../../tests/helpers/sp2';
import { changeSlug, resolveSlug } from './index';

// hostpage.updated has no SP2 subscriber (SP3 adds one); a test topic makes it visible.
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
  await t.db.execute(
    sql`truncate app.member_assignments, app.org_invitations, app.org_slugs, app.org_memberships,
      app.organizations, app.users, app.outbox cascade`,
  );
});

const retiredAt = async (slug: string) => {
  const [row] = await queryRows<{ retired_at: string | null }>(
    t.db,
    sql`select retired_at from app.org_slugs where slug = ${slug}`,
  );
  return row?.retired_at;
};

describe('changeSlug', () => {
  it('rejects a malformed slug and a reserved word', async () => {
    const org = await seedHostOrg(t.db);
    for (const slug of [
      'ab',
      'Kettle',
      'kettle--ridge',
      '-kettle',
      'kettle_ridge',
      'a'.repeat(61),
    ]) {
      await expect(changeSlug(t.db, org.owner.ctx, slug)).rejects.toMatchObject({
        code: 'bad_request',
      });
    }
    for (const slug of ['pricing', 'admin', 'join', 'hosts']) {
      await expect(changeSlug(t.db, org.owner.ctx, slug)).rejects.toMatchObject({
        code: 'bad_request',
        details: { reason: 'slug_reserved' },
      });
    }
  });

  it("refuses another org's slug, current or retired", async () => {
    const other = await seedHostOrg(t.db, { name: 'Salt and Pine' });
    await changeSlug(t.db, other.owner.ctx, 'salt-pine');
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });

    for (const slug of ['salt-and-pine', 'salt-pine']) {
      await expect(changeSlug(t.db, org.owner.ctx, slug)).rejects.toMatchObject({
        code: 'conflict',
        details: { reason: 'slug_taken' },
      });
    }
  });

  it('retires the old slug, which then redirects, and lets the org reclaim it', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });

    await expect(changeSlug(t.db, org.owner.ctx, 'kettle-ridge')).resolves.toEqual({
      slug: 'kettle-ridge',
    });
    expect(await resolveSlug(t.db, 'kettle-ridge-lodge')).toEqual({
      orgId: org.orgId,
      currentSlug: 'kettle-ridge',
      retired: true,
    });
    expect(await resolveSlug(t.db, 'kettle-ridge')).toEqual({
      orgId: org.orgId,
      currentSlug: 'kettle-ridge',
      retired: false,
    });
    expect(await retiredAt('kettle-ridge-lodge')).not.toBeNull();

    await changeSlug(t.db, org.owner.ctx, 'kettle-ridge-lodge');
    expect(await resolveSlug(t.db, 'kettle-ridge-lodge')).toEqual({
      orgId: org.orgId,
      currentSlug: 'kettle-ridge-lodge',
      retired: false,
    });
    expect(await retiredAt('kettle-ridge-lodge')).toBeNull();
    expect(await resolveSlug(t.db, 'kettle-ridge')).toMatchObject({ retired: true });
  });

  it('records orgs.slug_changed and emits hostpage.updated', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    const admin = await seedMember(t.db, org.orgId, 'admin');
    await changeSlug(t.db, admin.ctx, 'kettle');

    const audit = await queryRows<{ actor_id: string; data: unknown }>(
      t.db,
      sql`select actor_id, data from app.audit_events
          where org_id = ${org.orgId} and action = 'orgs.slug_changed'`,
    );
    expect(audit).toEqual([
      { actor_id: admin.userId, data: { from: 'kettle-ridge-lodge', to: 'kettle' } },
    ]);
    const events = await queryRows<{ payload: { data: unknown } }>(
      t.db,
      sql`select payload from app.outbox where topic = 'test.hostpage_updated'`,
    );
    expect(events.map((e) => e.payload.data)).toEqual([{ orgId: org.orgId }]);

    // The same slug again changes nothing.
    await changeSlug(t.db, admin.ctx, 'kettle');
    expect(
      await queryRows(t.db, sql`select 1 from app.outbox where topic = 'test.hostpage_updated'`),
    ).toHaveLength(1);
  });

  it('is for Owners and Admins only', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter');
    await expect(changeSlug(t.db, recruiter.ctx, 'kettle')).rejects.toMatchObject({
      code: 'forbidden',
    });
  });
});

describe('resolveSlug', () => {
  it('is null for an unknown slug and a deleted org', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    expect(await resolveSlug(t.db, 'nobody-here')).toBeNull();
    await t.db.execute(
      sql`update app.organizations set deleted_at = now() where id = ${org.orgId}`,
    );
    expect(await resolveSlug(t.db, 'kettle-ridge-lodge')).toBeNull();
  });

  it('treats another letter case as a non-canonical address of the same page', async () => {
    const org = await seedHostOrg(t.db, { name: 'Kettle Ridge Lodge' });
    expect(await resolveSlug(t.db, 'Kettle-Ridge-Lodge')).toEqual({
      orgId: org.orgId,
      currentSlug: 'kettle-ridge-lodge',
      retired: true,
    });
  });
});
