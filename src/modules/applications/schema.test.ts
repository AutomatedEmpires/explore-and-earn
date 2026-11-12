// The 3200 tables' constraints and guards (SP4 spec 4.3, plan Task 19). Each test is raw SQL:
// the CHECKs and triggers are the last line of defence behind the module, so they are tested
// alone.
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { mayaApplicationSnapshot } from '@tests/fixtures/sp4/snapshot';
import { createTestDb, type TestDb } from '@tests/helpers/db';

let t: TestDb;
let orgId: string;

beforeAll(async () => {
  t = await createTestDb();
  orgId = newId();
  await t.db.execute(
    sql`insert into app.organizations (id, clerk_org_id, name, slug) values (${orgId}, ${orgId}, 'Org', ${orgId})`,
  );
});

afterAll(async () => {
  await t.close();
});

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${id}, ${id})`);
  return id;
}

const SNAPSHOT = JSON.stringify(mayaApplicationSnapshot());

/** Inserts an application; `columns` override the defaults (as raw SQL fragments). */
async function application(columns: Record<string, SQL> = {}): Promise<string> {
  const id = newId();
  const all: Record<string, SQL> = {
    id: sql`${id}`,
    listing_id: sql`${newId()}`,
    listing_revision_id: sql`${newId()}`,
    org_id: sql`${orgId}`,
    seeker_user_id: sql`${await newUser()}`,
    source: sql`'seek'`,
    snapshot: sql`${SNAPSHOT}::jsonb`,
    ...columns,
  };
  await queryRows(
    t.db,
    sql`insert into app.applications (${sql.raw(Object.keys(all).join(', '))})
        values (${sql.join(Object.values(all), sql`, `)}) returning id`,
  );
  return id;
}

const update = (id: string, set: SQL) =>
  t.db.execute(sql`update app.applications set ${set} where id = ${id}::uuid`);

/** The database's own message: drizzle wraps it as the error's cause. */
async function dbError(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const cause = (err as { cause?: unknown }).cause;
    return `${(err as Error).message} ${cause instanceof Error ? cause.message : ''}`;
  }
  throw new Error('expected the statement to be rejected');
}

async function event(applicationId: string, note: string | null = null): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.application_events (id, application_id, type, to_status, actor_type, note)
    values (${id}, ${applicationId}, 'submitted', 'new', 'seeker', ${note})`);
  return id;
}

describe('app.applications CHECKs', () => {
  it('accepts a plain application with status new', async () => {
    const id = await application();
    const [row] = await queryRows<{ status: string; v: number }>(
      t.db,
      sql`select status, snapshot_version as v from app.applications where id = ${id}::uuid`,
    );
    expect(row).toEqual({ status: 'new', v: 1 });
  });

  it('rejects an invite id unless the source is invite', async () => {
    await expect(application({ invite_id: sql`${newId()}` })).rejects.toThrow();
    await expect(
      application({ invite_id: sql`${newId()}`, source: sql`'invite'` }),
    ).resolves.toBeDefined();
  });

  it('rejects a snapshot over 262144 bytes', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(262_144) });
    await expect(application({ snapshot: sql`${big}::jsonb` })).rejects.toThrow();
  });

  it('rejects a second application by the same seeker to the same listing', async () => {
    const listing = newId();
    const seeker = await newUser();
    await application({ listing_id: sql`${listing}`, seeker_user_id: sql`${seeker}` });
    await expect(
      application({ listing_id: sql`${listing}`, seeker_user_id: sql`${seeker}` }),
    ).rejects.toThrow();
  });

  it('rejects an unknown status, source or withdraw reason', async () => {
    await expect(application({ status: sql`'maybe'` })).rejects.toThrow();
    await expect(application({ source: sql`'bogus'` })).rejects.toThrow();
    await expect(application({ withdrawn_reason: sql`'bored'` })).rejects.toThrow();
  });

  it('turns row level security on for both tables, with no policy', async () => {
    const rows = await queryRows<{ name: string; rls: boolean }>(
      t.db,
      sql`select relname as name, relrowsecurity as rls from pg_class
          where relnamespace = 'app'::regnamespace
            and relname in ('applications', 'application_events') order by relname`,
    );
    expect(rows).toEqual([
      { name: 'application_events', rls: true },
      { name: 'applications', rls: true },
    ]);
    const policies = await queryRows(
      t.db,
      sql`select 1 from pg_policies where schemaname = 'app'
          and tablename in ('applications', 'application_events')`,
    );
    expect(policies).toEqual([]);
  });
});

describe('app.applications_guard', () => {
  it('lets the status, the tick and the withdraw reason change', async () => {
    const id = await application();
    await expect(
      update(
        id,
        sql`status = 'withdrawn', withdrawn_reason = 'other', additional_step_completed_at = now()`,
      ),
    ).resolves.toBeDefined();
  });

  it('refuses a change to the snapshot', async () => {
    const id = await application();
    expect(await dbError(update(id, sql`snapshot = '{"v":1}'::jsonb`))).toContain(
      'application fields are immutable',
    );
  });

  it.each([
    ['listing_id', sql`listing_id = ${newId()}::uuid`],
    ['listing_revision_id', sql`listing_revision_id = ${newId()}::uuid`],
    ['source', sql`source = 'map'`],
    ['snapshot_version', sql`snapshot_version = 2`],
    ['sponsorship_mismatch', sql`sponsorship_mismatch = true`],
    ['submitted_at', sql`submitted_at = now() - interval '1 day'`],
    ['id', sql`id = ${newId()}::uuid`],
  ])('refuses a change to %s', async (_name, set) => {
    const id = await application();
    expect(await dbError(update(id, set))).toContain('application fields are immutable');
  });

  it('refuses to move an application to another seeker or org', async () => {
    const id = await application();
    const other = await newUser();
    expect(await dbError(update(id, sql`seeker_user_id = ${other}::uuid`))).toContain(
      'application fields are immutable',
    );
  });

  it('lets privacy erasure redact the snapshot, and nothing else', async () => {
    const id = await application();
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
      await tx.execute(
        sql`update app.applications set snapshot = '{"v":1}'::jsonb where id = ${id}::uuid`,
      );
    });
    const [row] = await queryRows<{ snapshot: unknown }>(
      t.db,
      sql`select snapshot from app.applications where id = ${id}::uuid`,
    );
    expect(row?.snapshot).toEqual({ v: 1 });

    const message = await dbError(
      t.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
        await tx.execute(
          sql`update app.applications set listing_id = ${newId()}::uuid where id = ${id}::uuid`,
        );
      }),
    );
    expect(message).toContain('application fields are immutable');
  });

  it('keeps the setting to its own transaction', async () => {
    const id = await application();
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
    });
    expect(await dbError(update(id, sql`snapshot = '{"v":1}'::jsonb`))).toContain(
      'application fields are immutable',
    );
  });

  it('never deletes an application, even under privacy erasure', async () => {
    const id = await application();
    await expect(
      t.db.execute(sql`delete from app.applications where id = ${id}::uuid`),
    ).rejects.toThrow();
    await expect(
      t.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
        await tx.execute(sql`delete from app.applications where id = ${id}::uuid`);
      }),
    ).rejects.toThrow();
  });
});

describe('app.application_events', () => {
  it('is insert only', async () => {
    const eventId = await event(await application(), 'Strong fit');
    expect(
      await dbError(
        t.db.execute(
          sql`update app.application_events set to_status = 'hired' where id = ${eventId}::uuid`,
        ),
      ),
    ).toContain('append-only');
    expect(
      await dbError(
        t.db.execute(
          sql`update app.application_events set note = null where id = ${eventId}::uuid`,
        ),
      ),
    ).toContain('append-only');
    expect(
      await dbError(
        t.db.execute(sql`delete from app.application_events where id = ${eventId}::uuid`),
      ),
    ).toContain('append-only');
  });

  it('lets privacy erasure clear a note, and only that', async () => {
    const eventId = await event(await application(), 'My dates moved');
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
      await tx.execute(
        sql`update app.application_events set note = null where id = ${eventId}::uuid`,
      );
    });
    const [row] = await queryRows<{ note: string | null }>(
      t.db,
      sql`select note from app.application_events where id = ${eventId}::uuid`,
    );
    expect(row?.note).toBeNull();

    await expect(
      t.db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.privacy_erase', 'on', true)`);
        await tx.execute(
          sql`update app.application_events set to_status = 'hired' where id = ${eventId}::uuid`,
        );
      }),
    ).rejects.toThrow();
  });

  it('rejects a note over 500 characters and an unknown type', async () => {
    const id = await application();
    await expect(event(id, 'x'.repeat(501))).rejects.toThrow();
    await expect(
      t.db.execute(sql`
        insert into app.application_events (id, application_id, type, to_status, actor_type)
        values (${newId()}, ${id}, 'viewed', 'new', 'host')`),
    ).rejects.toThrow();
  });
});
