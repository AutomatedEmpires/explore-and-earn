import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { seedUser } from '@tests/helpers/sp4';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { addEntry, reorderEntries, setSkills, updateEntry } from './entries';
import { getOwnProfile } from './profile';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

const experience = {
  employer: 'Harbor Co',
  title: 'Deckhand',
  startMonth: '2024-06',
};

async function seeker() {
  return seedUser(t.db, { accountType: 'seeker' });
}

describe('entries and skills', () => {
  it('stops at 30 experience entries and 20 education entries', async () => {
    const user = await seeker();
    await t.db.execute(sql`
      insert into app.seeker_profiles (user_id) values (${user.id})
    `);
    await t.db.execute(sql`
      insert into app.seeker_experiences (id, user_id, sort_order, employer, title, start_month)
      select gen_random_uuid(), ${user.id}::uuid, g, 'Harbor Co', 'Hand', '2020-01-01'
      from generate_series(0, 29) as g
    `);
    await expect(addEntry(t.db, user.id, 'experience', experience)).rejects.toMatchObject({
      status: 400,
      details: { reason: 'cap_reached', cap: 30 },
    });

    await t.db.execute(sql`
      insert into app.seeker_education (id, user_id, sort_order, school)
      select gen_random_uuid(), ${user.id}::uuid, g, 'Juneau High'
      from generate_series(0, 19) as g
    `);
    await expect(
      addEntry(t.db, user.id, 'education', { school: 'One More' }),
    ).rejects.toMatchObject({
      status: 400,
      details: { reason: 'cap_reached', cap: 20 },
    });
  });

  it('reorders only the seeker\'s own ids', async () => {
    const user = await seeker();
    const first = await addEntry(t.db, user.id, 'experience', experience);
    const second = await addEntry(t.db, user.id, 'experience', {
      ...experience,
      title: 'Mate',
    });
    await expect(
      reorderEntries(t.db, user.id, 'experience', [first.id, newId()]),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'ids_mismatch' } });
    await reorderEntries(t.db, user.id, 'experience', [second.id, first.id]);
    const view = await getOwnProfile(t.db, user.id);
    expect(view.experience.map((entry) => entry.id)).toEqual([second.id, first.id]);
  });

  it('hides another seeker\'s entry', async () => {
    const owner = await seeker();
    const other = await seeker();
    const entry = await addEntry(t.db, owner.id, 'experience', experience);
    await expect(
      updateEntry(t.db, other.id, 'experience', entry.id, { title: 'Stolen' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('replaces skills, keeping the first spelling and the highlight order', async () => {
    const user = await seeker();
    const stored = await setSkills(t.db, user.id, [
      { label: 'Deckhand', highlighted: true },
      { label: 'deckhand ', highlighted: false },
      { label: 'Cooking', highlighted: false },
      { label: 'First aid', highlighted: true },
    ]);
    expect(stored.map((skill) => [skill.label, skill.highlighted])).toEqual([
      ['Deckhand', true],
      ['First aid', true],
      ['Cooking', false],
    ]);
    await expect(
      setSkills(
        t.db,
        user.id,
        Array.from({ length: 16 }, (_, index) => ({ label: `Skill ${index}`, highlighted: true })),
      ),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'too_many_highlighted' } });
    expect((await getOwnProfile(t.db, user.id)).skills).toHaveLength(3);
    await expect(
      setSkills(
        t.db,
        user.id,
        Array.from({ length: 61 }, (_, index) => ({ label: `Skill ${index}`, highlighted: false })),
      ),
    ).rejects.toMatchObject({ status: 400, details: { reason: 'cap_reached', cap: 60 } });
  });

  it('stores a certification key without the skill hyphen rules', async () => {
    const user = await seeker();
    await addEntry(t.db, user.id, 'certifications', { name: '  First   Aid ' });
    const [row] = await queryRows<{ cert_key: string }>(
      t.db,
      sql`select cert_key from app.seeker_certifications where user_id = ${user.id}::uuid`,
    );
    expect(row?.cert_key).toBe('first aid');
  });

  it('refuses a current job that also has an end month before writing', async () => {
    const user = await seeker();
    await expect(
      addEntry(t.db, user.id, 'experience', {
        ...experience,
        isCurrent: true,
        endMonth: '2024-08',
      }),
    ).rejects.toBeInstanceOf(ZodError);
    const [row] = await queryRows<{ n: number }>(
      t.db,
      sql`select count(*)::int as n from app.seeker_experiences where user_id = ${user.id}::uuid`,
    );
    expect(row?.n).toBe(0);
  });
});
