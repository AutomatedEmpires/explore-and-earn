import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryRows, type Db } from '@/lib/db';
import type { HostAnalytics } from '@/lib/host-analytics';
import { assignListing } from '@/modules/orgs';
import { asHost, call, request, setupRouteDb } from '@tests/helpers/sp4';
import { seedHostOrg, seedListingRow, seedMember } from '@tests/helpers/sp2';
import { GET as getAnalytics } from '../route';
import { GET as exportCsv } from './route';

vi.mock('@/lib/db', async (orig) => (await import('@tests/helpers/sp4')).mockDbModule(orig));
vi.mock('@/server/guards', async () => (await import('@tests/helpers/sp4')).guardMocks());

const mocks = vi.hoisted(() => ({
  getHostAnalytics: vi.fn(),
}));

vi.mock('@/modules/analytics', async (orig) => ({
  ...(await orig<typeof import('@/modules/analytics')>()),
  getHostAnalytics: mocks.getHostAnalytics,
}));

const tally = { yes: 0, partly: 0, no: 0 };
const analytics: HostAnalytics = {
  tiles: {
    views: { value: 4, previous: 1 },
    saves: { value: 0, previous: 0 },
    applications: { value: 1, previous: 0 },
    interviews: { value: 0, previous: 0 },
    hires: { value: 0, previous: 0 },
    followers: { value: 2, previous: 2 },
  },
  funnel: [],
  perListing: [],
  weekly: [],
  invites: [],
  boost: [],
  asDescribed: { responses: 0, visible: false, housing: tally, meals: tally, pay: tally },
  sources: [],
  statuses: [],
};

const t = setupRouteDb();

beforeEach(() => {
  mocks.getHostAnalytics.mockReset();
  mocks.getHostAnalytics.mockResolvedValue(analytics);
});

const query = { range: '7d', tz: 'America/Denver' };

async function publish(db: Db, orgId: string): Promise<string> {
  const id = await seedListingRow(db, { orgId });
  await db.execute(sql`update app.listings set first_published_at = now() where id = ${id}::uuid`);
  return id;
}

describe('host analytics routes', () => {
  it('exports a csv attachment and one audit row', async () => {
    const org = await seedHostOrg(t.db);
    asHost(org.owner.ctx);
    const res = await call(exportCsv, request('GET', '/api/v1/host/analytics/export.csv', { query }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="analytics-7d.csv"');
    expect(String(res.body)).toContain('card,label,value,previous_value');
    expect(String(res.body)).toContain('tiles,Views,4,1');

    const rows = await queryRows<{ data: { range?: string } | string }>(
      t.db,
      sql`select data from app.audit_events
          where action = 'analytics.exported' and org_id = ${org.orgId}::uuid`,
    );
    expect(rows).toHaveLength(1);
    const data = typeof rows[0]?.data === 'string' ? JSON.parse(rows[0].data) : rows[0]?.data;
    expect(data).toEqual({ range: '7d' });
    expect(mocks.getHostAnalytics).toHaveBeenCalledWith(
      t.db,
      expect.objectContaining({ orgId: org.orgId, range: '7d', listingIds: 'all' }),
    );
  });

  it('refuses Billing and the 21st export in an hour', async () => {
    const org = await seedHostOrg(t.db);
    const billing = await seedMember(t.db, org.orgId, 'billing');
    asHost(billing.ctx);
    const denied = await call(exportCsv, request('GET', '/api/v1/host/analytics/export.csv', { query }));
    expect(denied.status).toBe(403);
    expect(mocks.getHostAnalytics).not.toHaveBeenCalled();

    asHost(org.owner.ctx);
    for (let n = 0; n < 20; n += 1) {
      const ok = await call(exportCsv, request('GET', '/api/v1/host/analytics/export.csv', { query }));
      expect(ok.status).toBe(200);
    }
    const limited = await call(exportCsv, request('GET', '/api/v1/host/analytics/export.csv', { query }));
    expect(limited.status).toBe(429);
  });

  it('limits a Recruiter to listing A and 404s listing B', async () => {
    const org = await seedHostOrg(t.db);
    const recruiter = await seedMember(t.db, org.orgId, 'recruiter', { scope: 'assigned' });
    const listingA = await publish(t.db, org.orgId);
    const listingB = await publish(t.db, org.orgId);
    await assignListing(t.db, org.orgId, recruiter.userId, listingA);
    asHost(recruiter.ctx);

    const scoped = await call(getAnalytics, request('GET', '/api/v1/host/analytics', { query }));
    expect(scoped.status).toBe(200);
    expect(scoped.body).toMatchObject({ tiles: { views: { value: 4 } } });
    expect(mocks.getHostAnalytics).toHaveBeenCalledWith(
      t.db,
      expect.objectContaining({ listingIds: [listingA] }),
    );

    const outside = await call(
      getAnalytics,
      request('GET', '/api/v1/host/analytics', { query: { ...query, listingId: listingB } }),
    );
    expect(outside.status).toBe(404);

    const exported = await call(
      exportCsv,
      request('GET', '/api/v1/host/analytics/export.csv', { query: { ...query, listingId: listingB } }),
    );
    expect(exported.status).toBe(404);
  });
});
