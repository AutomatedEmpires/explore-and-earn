import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import {
  handleClerkEvent,
  makeFakeClerkAdmin,
  setAccountType,
  syncClerkUser,
} from '@/modules/identity';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { createOrganization, slugify } from './create';

const audit = vi.hoisted(() => ({ record: vi.fn(async () => {}) }));
vi.mock('@/modules/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/audit')>()),
  record: audit.record,
}));

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  audit.record.mockClear();
  await t.db.execute(
    sql`truncate app.org_memberships, app.organizations, app.operators, app.users, app.webhook_events cascade`,
  );
});

async function newHost(clerkUserId = 'user_1'): Promise<string> {
  const id = await syncClerkUser(t.db, {
    id: clerkUserId,
    public_metadata: {},
    updated_at: Date.parse('2026-11-01T00:00:00Z'),
  });
  await setAccountType(t.db, makeFakeClerkAdmin(), id, { accountType: 'host' });
  return id;
}

const memberships = () =>
  queryRows<{ org_id: string; user_id: string; role: string }>(
    t.db,
    sql`select org_id, user_id, role from app.org_memberships order by created_at`,
  );

describe('slugify', () => {
  it.each([
    ['Kettle Ridge Lodge', 'kettle-ridge-lodge'],
    ['  Kettle   Ridge -- Lodge!  ', 'kettle-ridge-lodge'],
    ['Café Mañana', 'cafe-manana'],
    ['Salt & Pine', 'salt-and-pine'],
    ['!!!', 'org'],
  ])('%s -> %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('caps the length without a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});

describe('createOrganization', () => {
  it('creates the organization in Clerk and here, with the owner as an owner member', async () => {
    const owner = await newHost();
    const clerk = makeFakeClerkAdmin();

    const org = await createOrganization(t.db, clerk, {
      ownerUserId: owner,
      name: 'Kettle Ridge Lodge',
    });

    expect(org.slug).toBe('kettle-ridge-lodge');
    expect(clerk.organizations).toEqual([
      { clerkOrgId: expect.any(String), name: 'Kettle Ridge Lodge', createdBy: 'user_1' },
    ]);
    const rows = await queryRows<{ id: string; clerk_org_id: string; owner_user_id: string }>(
      t.db,
      sql`select id, clerk_org_id, owner_user_id from app.organizations`,
    );
    expect(rows).toEqual([
      { id: org.id, clerk_org_id: clerk.organizations[0]?.clerkOrgId, owner_user_id: owner },
    ]);
    expect(await memberships()).toEqual([{ org_id: org.id, user_id: owner, role: 'owner' }]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorType: 'user',
        actorId: owner,
        orgId: org.id,
        action: 'orgs.created',
        subjectType: 'organization',
        subjectId: org.id,
      }),
    );
  });

  it('gives a second organization with the same name a numbered slug', async () => {
    const a = await newHost('user_a');
    const b = await newHost('user_b');
    const clerk = makeFakeClerkAdmin();

    const first = await createOrganization(t.db, clerk, {
      ownerUserId: a,
      name: 'Kettle Ridge Lodge',
    });
    const second = await createOrganization(t.db, clerk, {
      ownerUserId: b,
      name: 'Kettle Ridge Lodge',
    });

    expect(first.slug).toBe('kettle-ridge-lodge');
    expect(second.slug).toBe('kettle-ridge-lodge-2');
    expect((await memberships()).map((m) => m.role)).toEqual(['owner', 'owner']);
  });

  it("doesn't duplicate anything when Clerk's webhooks arrive before or after", async () => {
    const owner = await newHost();
    // The webhooks land between the Clerk call and our own insert.
    const clerk = makeFakeClerkAdmin({
      onCreateOrganization: async ({ clerkOrgId, name, createdBy }) => {
        const org = {
          object: 'organization',
          id: clerkOrgId,
          name,
          created_by: createdBy,
          updated_at: Date.parse('2026-11-01T00:00:00Z'),
        };
        await handleClerkEvent(t.db, { id: 'msg_org', type: 'organization.created', data: org });
        await handleClerkEvent(t.db, {
          id: 'msg_mem',
          type: 'organizationMembership.created',
          data: {
            role: 'org:admin',
            organization: org,
            public_user_data: { user_id: createdBy },
            updated_at: Date.parse('2026-11-01T00:00:00Z'),
          },
        });
      },
    });

    const org = await createOrganization(t.db, clerk, {
      ownerUserId: owner,
      name: 'Kettle Ridge Lodge',
    });

    expect(org.slug).toBe('kettle-ridge-lodge');
    const orgs = await queryRows<{ id: string }>(t.db, sql`select id from app.organizations`);
    expect(orgs).toEqual([{ id: org.id }]);
    expect(await memberships()).toEqual([{ org_id: org.id, user_id: owner, role: 'owner' }]);

    // A redelivered membership event afterwards changes nothing.
    await handleClerkEvent(t.db, {
      id: 'msg_mem_2',
      type: 'organizationMembership.updated',
      data: {
        role: 'org:admin',
        organization: { id: clerk.organizations[0]?.clerkOrgId },
        public_user_data: { user_id: 'user_1' },
        updated_at: Date.parse('2026-11-01T00:00:00Z'),
      },
    });
    expect(await memberships()).toEqual([{ org_id: org.id, user_id: owner, role: 'owner' }]);
  });

  it.each(['K', ' K ', 'K'.repeat(81)])('rejects the name %j with bad_request', async (name) => {
    const owner = await newHost();
    const clerk = makeFakeClerkAdmin();
    await expect(
      createOrganization(t.db, clerk, { ownerUserId: owner, name }),
    ).rejects.toMatchObject({
      code: 'bad_request',
    });
    expect(clerk.organizations).toEqual([]);
  });

  it('only lets a host account own an organization', async () => {
    const seeker = await syncClerkUser(t.db, {
      id: 'user_s',
      public_metadata: {},
      updated_at: Date.parse('2026-11-01T00:00:00Z'),
    });
    await setAccountType(t.db, makeFakeClerkAdmin(), seeker, {
      accountType: 'seeker',
      adultAttested: true,
    });
    const clerk = makeFakeClerkAdmin();
    await expect(
      createOrganization(t.db, clerk, { ownerUserId: seeker, name: 'Kettle Ridge Lodge' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(clerk.organizations).toEqual([]);
  });
});
