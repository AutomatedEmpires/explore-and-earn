// The 3000 profile tables' constraints (SP4 spec 4.1, plan Task 7). Each test is a raw insert:
// the CHECKs are the last line of defence behind the zod schemas, so they are tested alone.
import { sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '@tests/helpers/db';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function newUser(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`insert into app.users (id, clerk_user_id) values (${id}, ${id})`);
  return id;
}

async function newOrg(): Promise<string> {
  const id = newId();
  await t.db.execute(
    sql`insert into app.organizations (id, clerk_org_id, name, slug) values (${id}, ${id}, 'Org', ${id})`,
  );
  return id;
}

/** A user with a profile row; `columns` are set on the insert (as raw SQL fragments). */
async function profile(columns: Record<string, SQL> = {}): Promise<string> {
  const userId = await newUser();
  await insertProfile(userId, columns);
  return userId;
}

function insertProfile(userId: string, columns: Record<string, SQL> = {}): Promise<unknown> {
  const names = ['user_id', ...Object.keys(columns)];
  const values = [sql`${userId}`, ...Object.values(columns)];
  return queryRows(
    t.db,
    sql`insert into app.seeker_profiles (${sql.raw(names.join(', '))})
        values (${sql.join(values, sql`, `)}) returning user_id`,
  );
}

async function accepted(columns: Record<string, SQL>): Promise<void> {
  await expect(insertProfile(await newUser(), columns)).resolves.toBeDefined();
}

async function rejected(columns: Record<string, SQL>): Promise<void> {
  await expect(insertProfile(await newUser(), columns)).rejects.toThrow();
}

function experience(userId: string, columns: Record<string, SQL>): Promise<unknown> {
  const all: Record<string, SQL> = {
    id: sql`${newId()}`,
    user_id: sql`${userId}`,
    sort_order: sql`0`,
    employer: sql`'Kettle Ridge Lodge'`,
    title: sql`'Deckhand'`,
    start_month: sql`'2024-05-01'`,
    ...columns,
  };
  return queryRows(
    t.db,
    sql`insert into app.seeker_experiences (${sql.raw(Object.keys(all).join(', '))})
        values (${sql.join(Object.values(all), sql`, `)}) returning id`,
  );
}

function skill(userId: string, key: string, rank: number | null): Promise<unknown> {
  return queryRows(
    t.db,
    sql`insert into app.seeker_skills (id, user_id, sort_order, label, skill_key, highlight_rank)
        values (${newId()}, ${userId}, 0, ${key}, ${key}, ${rank}) returning id`,
  );
}

describe('work authorization', () => {
  it('needs 1-4 visa types for needs_sponsorship', async () => {
    await rejected({
      work_auth_status: sql`'needs_sponsorship'`,
      work_auth_visa_types: sql`'{}'::text[]`,
    });
    await accepted({
      work_auth_status: sql`'needs_sponsorship'`,
      work_auth_visa_types: sql`'{j1,h2b}'::text[]`,
    });
  });

  it('needs one type and an end date for has_visa', async () => {
    await rejected({ work_auth_status: sql`'has_visa'`, work_auth_visa_types: sql`'{j1}'::text[]` });
    await accepted({
      work_auth_status: sql`'has_visa'`,
      work_auth_visa_types: sql`'{j1}'::text[]`,
      work_auth_visa_end: sql`'2027-09-30'`,
    });
  });

  it('takes no visa type when authorized', async () => {
    await rejected({ work_auth_status: sql`'authorized'`, work_auth_visa_types: sql`'{j1}'::text[]` });
    await accepted({ work_auth_status: sql`'authorized'` });
  });

  it('only knows the four visa types', async () => {
    await rejected({
      work_auth_status: sql`'needs_sponsorship'`,
      work_auth_visa_types: sql`'{tn}'::text[]`,
    });
  });
});

describe('experience', () => {
  it('has no end month while current', async () => {
    const user = await profile();
    await expect(
      experience(user, { is_current: sql`true`, end_month: sql`'2024-09-01'` }),
    ).rejects.toThrow();
    await expect(experience(user, { is_current: sql`true` })).resolves.toBeDefined();
  });

  it('ends on or after its start', async () => {
    const user = await profile();
    await expect(experience(user, { end_month: sql`'2024-04-01'` })).rejects.toThrow();
    await expect(experience(user, { end_month: sql`'2024-09-01'` })).resolves.toBeDefined();
  });

  it('stores months as the first day', async () => {
    const user = await profile();
    await expect(experience(user, { start_month: sql`'2026-03-15'` })).rejects.toThrow();
  });
});

describe('skills', () => {
  it('ranks at most 15 highlights', async () => {
    const user = await profile();
    await expect(skill(user, 'knots', 16)).rejects.toThrow();
    await expect(skill(user, 'knots', 15)).resolves.toBeDefined();
  });

  it('gives each rank to one skill', async () => {
    const user = await profile();
    await skill(user, 'knots', 1);
    await expect(skill(user, 'line-handling', 1)).rejects.toThrow();
  });

  it('stores each skill key once per seeker', async () => {
    const user = await profile();
    await skill(user, 'knots', null);
    await expect(skill(user, 'knots', null)).rejects.toThrow();
    // Another seeker may have the same skill.
    await expect(skill(await profile(), 'knots', null)).resolves.toBeDefined();
  });
});

describe('location and contact', () => {
  it('takes a USPS region in the US and free text elsewhere', async () => {
    await rejected({ country_code: sql`'US'`, region: sql`'Ontario'` });
    await accepted({ country_code: sql`'CA'`, region: sql`'Ontario'` });
    await accepted({ country_code: sql`'US'`, region: sql`'AK'` });
    // Territories are not profile regions (spec 4.1: the 50 states plus DC).
    await rejected({ country_code: sql`'US'`, region: sql`'PR'` });
  });

  it('stores phones in E.164', async () => {
    await rejected({ phone: sql`'555-1234'` });
    await accepted({ phone: sql`'+15415550123'` });
  });

  it('caps text lengths', async () => {
    await rejected({ headline: sql`${'x'.repeat(121)}` });
    await accepted({ headline: sql`${'x'.repeat(120)}` });
  });
});

describe('preferences and availability', () => {
  it('sets the minimum pay and its unit together', async () => {
    await rejected({ pref_min_pay_cents: sql`2000` });
    await accepted({ pref_min_pay_cents: sql`2000`, pref_min_pay_unit: sql`'hour'` });
  });

  it('only stores known categories', async () => {
    await rejected({ pref_categories: sql`'{maritime,space}'::text[]` });
    await accepted({ pref_categories: sql`'{maritime,farm}'::text[]` });
  });

  it('sets the preset, date and confirmation together', async () => {
    await rejected({ avail_preset: sql`'now'` });
    await accepted({
      avail_preset: sql`'now'`,
      avail_date: sql`'2026-11-10'`,
      avail_confirmed_at: sql`now()`,
    });
  });

  it('sends at most 3 reminders', async () => {
    await rejected({ avail_reminders_sent: sql`4` });
    await accepted({ avail_reminders_sent: sql`3` });
  });
});

describe('defaults', () => {
  it('starts visible, without the photo, in classic mode at version 1', async () => {
    const user = await profile();
    const [row] = await queryRows<{
      visible_to_hosts: boolean;
      show_photo_to_hosts: boolean;
      resume_mode: string;
      country_code: string;
      willing_to_relocate: boolean;
      version: number;
    }>(
      t.db,
      sql`select visible_to_hosts, show_photo_to_hosts, resume_mode, country_code,
            willing_to_relocate, version
          from app.seeker_profiles where user_id = ${user}`,
    );
    expect(row).toEqual({
      visible_to_hosts: true,
      show_photo_to_hosts: false,
      resume_mode: 'classic',
      country_code: 'US',
      willing_to_relocate: true,
      version: 1,
    });
  });
});

describe('reveals', () => {
  it('records each reveal once', async () => {
    const seeker = await profile();
    const org = await newOrg();
    const source = newId();
    const reveal = () =>
      queryRows(
        t.db,
        sql`insert into app.seeker_reveals (id, seeker_user_id, org_id, reason, source_id)
            values (${newId()}, ${seeker}, ${org}, 'applied', ${source}) returning id`,
      );
    await reveal();
    await expect(reveal()).rejects.toThrow();
  });
});

describe('cascades', () => {
  it('deletes the profile and its entries with the user', async () => {
    const user = await profile();
    await experience(user, {});
    await skill(user, 'knots', 1);
    await queryRows(
      t.db,
      sql`insert into app.seeker_education (id, user_id, sort_order, school)
          values (${newId()}, ${user}, 0, 'Juneau-Douglas High School') returning id`,
    );
    await queryRows(
      t.db,
      sql`insert into app.seeker_certifications (id, user_id, sort_order, name, cert_key)
          values (${newId()}, ${user}, 0, 'First Aid/CPR', 'first aid/cpr') returning id`,
    );

    await t.db.execute(sql`delete from app.users where id = ${user}`);

    const [counts] = await queryRows<Record<string, number>>(
      t.db,
      sql`select
            (select count(*)::int from app.seeker_profiles where user_id = ${user}) as profiles,
            (select count(*)::int from app.seeker_experiences where user_id = ${user}) as experiences,
            (select count(*)::int from app.seeker_education where user_id = ${user}) as education,
            (select count(*)::int from app.seeker_skills where user_id = ${user}) as skills,
            (select count(*)::int from app.seeker_certifications where user_id = ${user}) as certifications`,
    );
    expect(counts).toEqual({ profiles: 0, experiences: 0, education: 0, skills: 0, certifications: 0 });
  });
});
