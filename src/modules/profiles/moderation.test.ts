import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { seedPoolReadySeeker } from '@tests/helpers/profiles';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { decide, openReviewItem } from '@/modules/trust';
import { notify } from '@/modules/notifications';
import { seekerProfiles } from './schema';
import { queryPoolCandidates } from './pools';
import { newId } from '@/lib/ids';

vi.mock('@/modules/notifications', async (orig) => {
  const actual = await orig<typeof import('@/modules/notifications')>();
  return { ...actual, notify: vi.fn(async () => undefined) };
});

vi.mock('@/modules/safety', async (orig) => {
  const actual = await orig<typeof import('@/modules/safety')>();
  return { ...actual, registerReportSubject: vi.fn() };
});

import './moderation';

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
});

afterAll(async () => {
  await t.close();
});

async function operator(): Promise<string> {
  const id = newId();
  await t.db.execute(sql`
    insert into app.users (id, clerk_user_id, email, display_name, account_type)
    values (${id}, ${`user_${id}`}, ${`${id}@ops.test`}, 'Operator', 'operator')
  `);
  await t.db.execute(sql`
    insert into app.operators (user_id, role, queues, shift_status)
    values (${id}, 'operator', '{"moderation"}'::text[], 'on_shift')
  `);
  return id;
}

describe('seeker profile moderation', () => {
  it('registers the report subject', async () => {
    vi.resetModules();
    const safety = await import('@/modules/safety');
    await import('./moderation');
    expect(safety.registerReportSubject).toHaveBeenCalledWith(
      'seeker_profile',
      expect.objectContaining({ trustSubjectType: 'seeker_profile' }),
    );
  });

  it('removes the public text and restores pool eligibility on approve', async () => {
    const user = await seedPoolReadySeeker(t.db, { categories: [], occupations: ['mod-hand'] });
    await t.db
      .update(seekerProfiles)
      .set({ headline: 'On the water', bio: 'Ten seasons', avatarMediaId: null, coverMediaId: null })
      .where(eq(seekerProfiles.userId, user.id));
    const operatorId = await operator();
    const listing = {
      listingId: newId(),
      orgId: newId(),
      categories: ['farm' as const],
      occupationCode: 'mod-hand',
      sponsorsVisa: false,
    };
    const opened = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'seeker_profile',
      subjectId: user.id,
      reason: 'Profile text',
    });
    await decide(t.db, opened.id, operatorId, 'remove');
    const [row] = await queryRows<{
      headline: string;
      bio: string;
      removed: string | null;
    }>(
      t.db,
      sql`
        select headline, bio, removed_by_moderation_at::text as removed
        from app.seeker_profiles where user_id = ${user.id}
      `,
    );
    expect(row).toMatchObject({ headline: '', bio: '' });
    expect(row?.removed).not.toBeNull();
    const page = await queryPoolCandidates(t.db, { listing, limit: 50 });
    expect(page.items.map((item) => item.seekerUserId)).not.toContain(user.id);
    const notices = (notify as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => call[1] === user.id && call[2] === 'profiles.content_removed',
    );
    expect(notices).toHaveLength(1);

    const again = await openReviewItem(t.db, {
      queue: 'moderation',
      subjectType: 'seeker_profile',
      subjectId: user.id,
      reason: 'Appeal',
    });
    await decide(t.db, again.id, operatorId, 'approve');
    const restored = await queryPoolCandidates(t.db, { listing, limit: 50 });
    expect(restored.items.map((item) => item.seekerUserId)).toContain(user.id);
  });
});
