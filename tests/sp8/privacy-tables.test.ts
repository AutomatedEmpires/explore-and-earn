import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../helpers/db';
import { seedHostOrg, seedSeeker } from '../helpers/sp2';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function rejection(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    const causeText = cause instanceof Error ? cause.message : '';
    return `${error instanceof Error ? error.message : String(error)}\n${causeText}`;
  }
  throw new Error('expected the statement to fail');
}

describe('privacy tables', () => {
  it('keeps the pending Clerk id nullable and enforces holds, reasons and one open export', async () => {
    const [column] = await queryRows<{ is_nullable: string }>(
      t.db,
      sql`select is_nullable from information_schema.columns
          where table_schema = 'app' and table_name = 'privacy_requests'
            and column_name = 'clerk_user_id_pending'`,
    );
    expect(column?.is_nullable).toBe('YES');

    const seeker = await seedSeeker(t.db);
    const org = await seedHostOrg(t.db);
    await expect(
      rejection(
        t.db.execute(sql`
          insert into app.privacy_legal_holds
            (id, user_id, org_id, scope, reason, review_at, created_by)
          values (
            ${newId()}, ${seeker.userId}, ${org.orgId}, 'all',
            'Held for a court order', '2026-12-01', ${seeker.userId}
          )
        `),
      ),
    ).resolves.toMatch(/check|violates|num_nonnulls/i);

    await expect(
      rejection(
        t.db.execute(sql`
          insert into app.privacy_legal_holds
            (id, user_id, scope, reason, review_at, created_by)
          values (${newId()}, ${seeker.userId}, 'all', 'too short', '2026-12-01', ${seeker.userId})
        `),
      ),
    ).resolves.toMatch(/check|violates/i);

    const open = newId();
    await t.db.execute(sql`
      insert into app.privacy_requests (id, user_id, kind, status)
      values (${open}, ${seeker.userId}, 'export', 'pending')
    `);
    await expect(
      rejection(
        t.db.execute(sql`
          insert into app.privacy_requests (id, user_id, kind, status)
          values (${newId()}, ${seeker.userId}, 'export', 'running')
        `),
      ),
    ).resolves.toMatch(/unique|duplicate/i);

    await t.db.execute(sql`
      update app.privacy_requests set status = 'completed' where id = ${open}
    `);
    await t.db.execute(sql`
      insert into app.privacy_requests (id, user_id, kind, status, clerk_user_id_pending)
      values (${newId()}, ${seeker.userId}, 'export', 'pending', null)
    `);
  });
});
