import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { queryRows } from '@/lib/db';
import { newId } from '@/lib/ids';
import { missingItem, profileSnapshotV1Schema, type MissingItemInput, type PoolListing } from '@/lib/profiles';
import * as safety from '@/modules/safety';
import { seedOrg } from '@tests/helpers/sp4';
import { seedPoolReadySeeker } from '@tests/helpers/profiles';
import { createTestDb, type TestDb } from '@tests/helpers/db';
import { setSkills } from './entries';
import {
  getCandidateCards,
  getFitInputs,
  grantReveal,
  queryPoolCandidates,
} from './pools';

let t: TestDb;
let orgId: string;

beforeAll(async () => {
  t = await createTestDb();
  orgId = (await seedOrg(t.db)).orgId;
});

afterAll(async () => {
  await t.close();
});

function listing(over: Partial<PoolListing> = {}): PoolListing {
  return {
    listingId: newId(),
    orgId,
    categories: ['maritime'],
    occupationCode: 'deckhand',
    sponsorsVisa: false,
    ...over,
  };
}

const DAY = 24 * 60 * 60 * 1000;

async function idsFor(wanted: PoolListing): Promise<string[]> {
  const page = await queryPoolCandidates(t.db, { listing: wanted, limit: 500 });
  return page.items.map((item) => item.seekerUserId);
}

describe('candidate pools', () => {
  it('returns a ready seeker and drops them when they hide', async () => {
    const user = await seedPoolReadySeeker(t.db);
    expect(await idsFor(listing())).toContain(user.id);
    const [card] = (await queryPoolCandidates(t.db, { listing: listing(), limit: 500 })).items.filter(
      (item) => item.seekerUserId === user.id,
    );
    expect(Object.keys(card ?? {}).sort()).toEqual([
      'availabilityDate',
      'avatarMediaId',
      'categories',
      'city',
      'countryCode',
      'coverMediaId',
      'firstName',
      'lastInitial',
      'region',
      'seekerUserId',
      'skills',
    ]);
    expect(card).not.toHaveProperty('lastName');
    expect(card).not.toHaveProperty('email');
    expect(card).toMatchObject({
      firstName: 'Maya',
      lastInitial: 'R',
      city: 'Juneau',
      region: 'AK',
      countryCode: 'US',
      categories: ['maritime'],
    });
    await t.db.execute(sql`
      update app.seeker_profiles set visible_to_hosts = false where user_id = ${user.id}
    `);
    expect(await idsFor(listing())).not.toContain(user.id);
  });

  it.each([
    ['not visible', `visible_to_hosts = false`],
    ['no availability', `avail_preset = null, avail_date = null, avail_confirmed_at = null`],
    ['no category or occupation', `pref_categories = '{}', pref_occupations = '{}'`],
    ['no work authorization', `work_auth_status = null`],
    ['an empty first name', `first_name = ''`],
    ['an empty city', `city = ''`],
    ['moderation removal', `removed_by_moderation_at = now()`],
  ])('excludes a seeker with %s', async (_name, set) => {
    const user = await seedPoolReadySeeker(t.db, { categories: ['remote'] });
    await t.db.execute(
      sql.raw(
        `update app.seeker_profiles set ${set} where user_id = '${user.id}'`,
      ),
    );
    const found = await idsFor(listing({ categories: ['remote'], occupationCode: 'none' }));
    expect(found).not.toContain(user.id);
  });

  it('excludes a seeker confirmed exactly 90 days ago and keeps one at 89', async () => {
    const stale = await seedPoolReadySeeker(t.db, {
      categories: [],
      occupations: ['deckhand'],
      availDate: '2026-04-01',
    });
    const fresh = await seedPoolReadySeeker(t.db, {
      categories: [],
      occupations: ['deckhand'],
      availDate: '2026-04-02',
    });
    await t.db.execute(sql`
      update app.seeker_profiles
      set avail_confirmed_at = now() - interval '90 days'
      where user_id = ${stale.id}
    `);
    await t.db.execute(sql`
      update app.seeker_profiles
      set avail_confirmed_at = now() - interval '89 days'
      where user_id = ${fresh.id}
    `);
    const found = await idsFor(listing({ categories: ['farm'], occupationCode: 'deckhand' }));
    expect(found).toContain(fresh.id);
    expect(found).not.toContain(stale.id);

    const rows = await queryRows<{ user_id: string; confirmed: string }>(
      t.db,
      sql`
        select user_id, avail_confirmed_at::text as confirmed
        from app.seeker_profiles
        where user_id in (${stale.id}::uuid, ${fresh.id}::uuid)
      `,
    );
    for (const row of rows) {
      const confirmedAt = new Date(row.confirmed);
      const input: MissingItemInput = {
        visibleToHosts: true,
        firstName: 'Maya',
        lastName: 'Rodriguez',
        city: 'Juneau',
        region: 'AK',
        countryCode: 'US',
        availability: { date: '2026-04-01', confirmedAt: confirmedAt.toISOString() },
        categories: [],
        occupations: ['deckhand'],
        workAuthorization: { status: 'authorized' },
      };
      const days = row.user_id === stale.id ? 90 : 89;
      const item = missingItem(input, new Date(confirmedAt.getTime() + days * DAY));
      expect(item).toBe(days === 90 ? 'availability_stale' : null);
    }
  });

  it('excludes needs_sponsorship unless the listing sponsors a visa', async () => {
    const user = await seedPoolReadySeeker(t.db, {
      categories: ['seasonal'],
      workAuthorization: { status: 'needs_sponsorship', visaTypes: ['h2b'] },
    });
    const closed = listing({ categories: ['seasonal'], sponsorsVisa: false });
    const open = listing({ categories: ['seasonal'], sponsorsVisa: true });
    expect(await idsFor(closed)).not.toContain(user.id);
    expect(await idsFor(open)).toContain(user.id);
  });

  it('matches an occupation when the categories do not overlap', async () => {
    const match = await seedPoolReadySeeker(t.db, {
      categories: [],
      occupations: ['deckhand'],
    });
    const neither = await seedPoolReadySeeker(t.db, {
      categories: ['farm'],
      occupations: ['cook'],
    });
    const found = await idsFor(listing({ categories: ['maritime'], occupationCode: 'deckhand' }));
    expect(found).toContain(match.id);
    expect(found).not.toContain(neither.id);
  });

  it('pages by availability date then user id', async () => {
    const dates = ['2026-02-01', '2026-03-01', '2026-04-01'];
    const users = [];
    for (const availDate of dates) {
      users.push(
        await seedPoolReadySeeker(t.db, {
          categories: [],
          occupations: ['page-hand'],
          availDate,
        }),
      );
    }
    const wanted = listing({ categories: ['maritime'], occupationCode: 'page-hand' });
    const first = await queryPoolCandidates(t.db, { listing: wanted, limit: 2 });
    expect(first.items.map((item) => item.seekerUserId)).toEqual([users[0]?.id, users[1]?.id]);
    expect(first.next).not.toBeNull();
    const second = await queryPoolCandidates(t.db, {
      listing: wanted,
      limit: 2,
      after: first.next ?? undefined,
    });
    expect(second.items.map((item) => item.seekerUserId)).toEqual([users[2]?.id]);
    expect(second.next).toBeNull();
    await expect(queryPoolCandidates(t.db, { listing: wanted, limit: 501 })).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('drops a deleted seeker and someone the org has blocked', async () => {
    const deleted = await seedPoolReadySeeker(t.db, { categories: ['remote'] });
    await t.db.execute(sql`update app.users set deleted_at = now() where id = ${deleted.id}`);
    const blocked = await seedPoolReadySeeker(t.db, { categories: ['remote'] });
    const spy = vi.spyOn(safety, 'blockedUserIdsForOrg').mockResolvedValue([blocked.id]);
    try {
      const found = await idsFor(listing({ categories: ['remote'], occupationCode: 'none' }));
      expect(found).not.toContain(deleted.id);
      expect(found).not.toContain(blocked.id);
    } finally {
      spy.mockRestore();
    }
  });

  it('reveals a profile once, then shows it at the interested stage without work authorization', async () => {
    const user = await seedPoolReadySeeker(t.db);
    const sourceId = newId();
    expect(
      await getCandidateCards(t.db, {
        orgId,
        seekerUserIds: [user.id],
        stage: 'interested',
      }),
    ).toEqual([]);
    expect(
      await grantReveal(t.db, {
        seekerUserId: user.id,
        orgId,
        reason: 'invite_interested',
        sourceId,
      }),
    ).toEqual({ created: true });
    expect(
      await grantReveal(t.db, {
        seekerUserId: user.id,
        orgId,
        reason: 'invite_interested',
        sourceId,
      }),
    ).toEqual({ created: false });
    const [audits] = await queryRows<{ n: number }>(
      t.db,
      sql`
        select count(*)::int as n from app.audit_events
        where action = 'profiles.reveal_granted' and subject_id = ${user.id}
      `,
    );
    expect(audits?.n).toBe(1);
    const [card] = await getCandidateCards(t.db, {
      orgId,
      seekerUserIds: [user.id],
      stage: 'interested',
    });
    expect(card?.stage).toBe('interested');
    if (card?.stage !== 'interested') throw new Error('expected an interested card');
    expect(card.profile.lastName).toBe('Rodriguez');
    expect(card.profile.email).toBe(user.email);
    expect(card.profile.phone).toBe('+19075550123');
    expect(card.profile.workAuthorization).toBeNull();
    expect(Object.keys(card.profile).sort()).toEqual(
      Object.keys(profileSnapshotV1Schema.shape).sort(),
    );
  });

  it('drops a blocked seeker at both stages', async () => {
    const user = await seedPoolReadySeeker(t.db);
    await grantReveal(t.db, {
      seekerUserId: user.id,
      orgId,
      reason: 'invite_interested',
      sourceId: newId(),
    });
    const spy = vi.spyOn(safety, 'getRelationships').mockImplementation(async (_db, input) =>
      input.seekerUserIds.map((seekerUserId) => ({
        seekerUserId,
        blocked: true,
        muted: false,
      })),
    );
    try {
      expect(
        await getCandidateCards(t.db, { orgId, seekerUserIds: [user.id], stage: 'pool' }),
      ).toEqual([]);
      expect(
        await getCandidateCards(t.db, { orgId, seekerUserIds: [user.id], stage: 'interested' }),
      ).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('returns the twelve fit-input fields and normalized skill keys', async () => {
    const user = await seedPoolReadySeeker(t.db, { occupations: ['deckhand'] });
    await setSkills(t.db, user.id, [{ label: 'Deckhand', highlighted: true }]);
    const [fit] = await getFitInputs(t.db, [user.id]);
    expect(Object.keys(fit ?? {}).sort()).toEqual([
      'availabilityDate',
      'categories',
      'certifications',
      'countryCode',
      'minPay',
      'occupationCodes',
      'preferredStates',
      'region',
      'seekerUserId',
      'skillKeys',
      'willingToRelocate',
      'workAuthorization',
    ]);
    expect(fit?.skillKeys).toEqual(['deckhand']);
    expect(fit?.occupationCodes).toEqual(['deckhand']);
    expect(fit?.workAuthorization).toEqual({ status: 'authorized' });
  });
});
