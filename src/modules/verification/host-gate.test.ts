// The host gate (legal review section 7): every verification status, and the silent-host alert.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { seedHostOrg } from '../../../tests/helpers/sp2';
import { alertSilentHost, hostApplicantGate } from './host-gate';

const OPEN = ['unverified', 'verified'] as const;
const BLOCKED = ['running', 'needs_review', 'needs_info', 'failed'] as const;

describe('hostApplicantGate', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await createTestDb();
  });

  afterAll(async () => {
    await t.close();
  });

  it.each(OPEN)('allows %s', async (status) => {
    const org = await seedHostOrg(t.db);
    await t.db.execute(
      sql`update app.organizations set verification_status = ${status} where id = ${org.orgId}`,
    );
    expect(await hostApplicantGate(t.db, org.orgId)).toEqual({ ok: true });
  });

  it.each(BLOCKED)('refuses %s with that reason', async (status) => {
    const org = await seedHostOrg(t.db);
    await t.db.execute(
      sql`update app.organizations set verification_status = ${status} where id = ${org.orgId}`,
    );
    expect(await hostApplicantGate(t.db, org.orgId)).toEqual({ ok: false, reason: status });
  });

  it('alerts operators when a host opens many applications and never replies', async () => {
    const org = await seedHostOrg(t.db);
    expect(await alertSilentHost(t.db, org.orgId, 9, 0)).toBe(false);
    expect(await alertSilentHost(t.db, org.orgId, 10, 1)).toBe(false);
    expect(await alertSilentHost(t.db, org.orgId, 10, 0)).toBe(true);
    const rows = await queryRows<{ reason: string }>(
      t.db,
      sql`select reason from app.review_items where subject_id = ${org.orgId}`,
    );
    expect(rows.map((r) => r.reason)).toEqual(['silent_host:opened=10']);
  });
});
