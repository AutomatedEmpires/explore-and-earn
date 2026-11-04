// Automatic checks (spec section 8.2): each blocking issue and warning with its exact code,
// section and field.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { FIXED_NOW, seedHostOrg, seedMedia, type SeededOrg } from '../../../tests/helpers/sp2';
import type { ListingContent } from './content';
import {
  ackKey,
  hourlyPayCents,
  normalizeForPhraseMatch,
  runListingChecks,
  type Issue,
} from './index';
import { seedListingFixture, type ListingFixture } from './test-fixtures';

vi.mock('@/modules/locations', async (orig) => ({
  ...(await orig<typeof import('@/modules/locations')>()),
  ...(await import('../../../tests/fakes/sp2/locations')).locationsFake,
}));

let t: TestDb;
let db: Db;
let org: SeededOrg;
let fx: ListingFixture;

beforeAll(async () => {
  t = await createTestDb();
  db = t.db;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  locationsFake.reset();
  org = await seedHostOrg(db);
  fx = await seedListingFixture(db, org);
});

const listing = { id: newId(), firstPublishedAt: null, sourceGenre: null };

async function check(edit?: (c: ListingContent) => void, draft?: unknown) {
  return runListingChecks(db, {
    orgId: org.orgId,
    listing,
    draft: draft ?? fx.content(edit),
    now: FIXED_NOW,
  });
}

const brief = (issues: Issue[]) =>
  issues.map(({ code, section, field }) => ({ code, section, field }));

describe('runListingChecks', () => {
  it('passes the complete fixture', async () => {
    const r = await check();
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.parsed?.basics.title).toBe('Lift Operator');
  });

  it('reports missing fields one by one, and no parsed content', async () => {
    const r = await check(undefined, { basics: { title: 'Lift Operator' } });
    expect(r.parsed).toBeNull();
    expect(r.errors.every((e) => e.code === 'required_missing')).toBe(true);
    expect(r.errors).toContainEqual({
      code: 'required_missing',
      section: 'basics',
      field: 'basics.primaryCategory',
      message: 'This is required.',
    });
    expect(r.errors.find((e) => e.field === 'pay')?.section).toBe('pay');
  });

  describe('pay_vague', () => {
    it.each<[string, (c: ListingContent) => void, string]>([
      [
        'a minimum of 0',
        (c) => {
          c.pay.minCents = 0;
        },
        'pay.minCents',
      ],
      [
        'a range of 1000-2600',
        (c) => {
          c.pay.minCents = 1000;
          c.pay.maxCents = 2600;
        },
        'pay.maxCents',
      ],
      [
        'crew share without an estimate',
        (c) => {
          c.pay.unit = 'crew_share';
          c.pay.crewShareEstimate = null;
        },
        'pay.crewShareEstimate',
      ],
    ])('fires for %s', async (_name, edit, field) => {
      const r = await check(edit);
      expect(brief(r.errors)).toEqual([{ code: 'pay_vague', section: 'pay', field }]);
      expect(r.errors[0]?.message).toBe(
        'Give a clear amount, or a range where the top is at most 2.5 times the bottom.',
      );
    });

    it('allows a range of 1000-2500', async () => {
      const r = await check((c) => {
        c.pay.minCents = 1000;
        c.pay.maxCents = 2500;
      });
      expect(r.errors).toEqual([]);
    });
  });

  it('needs a cost for provided housing and meals', async () => {
    const r = await check(undefined, {
      ...fx.content(),
      housing: { ...fx.content().housing, cost: undefined },
      meals: {
        provided: true,
        perDay: 3,
        days: 'every_day',
        photos: {
          kitchen: await seedMedia(db, org.orgId, 'meal_photo'),
          meal_example: await seedMedia(db, org.orgId, 'meal_photo'),
          dining_area: await seedMedia(db, org.orgId, 'meal_photo'),
          other: await seedMedia(db, org.orgId, 'meal_photo'),
        },
        note: '',
        dietary: null,
      },
    });
    expect(brief(r.errors)).toEqual([
      { code: 'housing_cost_missing', section: 'housing', field: 'housing.cost' },
      { code: 'meals_cost_missing', section: 'meals', field: 'meals.cost' },
    ]);
    expect(r.errors.map((e) => e.message)).toEqual([
      'Say what housing costs, or mark it free.',
      'Say what meals cost, or mark them free.',
    ]);
  });

  describe('prohibited_wording (Review Focus 2)', () => {
    const DESCRIPTION =
      'Run the chairlift, help riders on and off safely, and keep the loading area clear.';
    it.each([
      'US citizens only.',
      'US  citizens only',
      'US citizens only',
      'U.S. CITIZENS ONLY',
      'ＵＳ citizens only',
    ])('fires for %j', async (phrase) => {
      const r = await check((c) => {
        c.job.description = `${DESCRIPTION} ${phrase}`;
      });
      expect(brief(r.errors)).toEqual([
        { code: 'prohibited_wording', section: 'job', field: 'job.description' },
      ]);
      expect(r.errors[0]?.message).toBe(
        'Remove "US citizens only". You can ask about visa sponsorship instead.',
      );
    });

    it('doesn\'t fire for "focus on citizens\' only needs"', async () => {
      const r = await check((c) => {
        c.job.description = `${DESCRIPTION} We focus on citizens' only needs.`;
      });
      expect(r.errors).toEqual([]);
    });

    it('checks screening questions and the Additional step note', async () => {
      const r = await check((c) => {
        c.applying.questions = [
          {
            id: 'q1',
            prompt: 'Which applies to you?',
            required: true,
            type: 'multiple_choice',
            choices: ['No foreigners please', 'Other'],
            allowMultiple: false,
          },
        ];
        c.applying.additionalStep = {
          url: 'https://kettle.com/apply',
          note: 'Native English speaker',
        };
      });
      expect(brief(r.errors)).toEqual([
        {
          code: 'prohibited_wording',
          section: 'applying',
          field: 'applying.questions.0.choices.0',
        },
        { code: 'prohibited_wording', section: 'applying', field: 'applying.additionalStep.note' },
      ]);
    });
  });

  it.each(['http://a.com', 'https://bit.ly/x'])('flags the link %s', async (url) => {
    const r = await check((c) => {
      c.applying.additionalStep = { url, note: '' };
    });
    expect(brief(r.errors)).toEqual([
      { code: 'link_unsafe', section: 'applying', field: 'applying.additionalStep.url' },
    ]);
  });

  it('blocks a passed end date and deadline', async () => {
    const r = await check((c) => {
      c.when.dates = { mode: 'fixed', start: '2026-10-01', end: '2026-11-02' };
      c.applying.deadline = '2026-11-02';
    });
    expect(brief(r.errors)).toEqual([
      { code: 'end_date_past', section: 'where_when', field: 'when.dates.end' },
      { code: 'deadline_past', section: 'applying', field: 'applying.deadline' },
    ]);
    // Today (in the listing's timezone) is fine.
    const today = await check((c) => {
      c.when.dates = { mode: 'fixed', start: '2026-10-01', end: '2026-11-03' };
    });
    expect(today.errors).toEqual([]);
  });

  it('needs a current location of the org', async () => {
    locationsFake.setLocation({ id: fx.locationId, orgId: org.orgId, archived: true });
    expect(brief((await check()).errors)).toEqual([
      { code: 'location_unavailable', section: 'where_when', field: 'where.locationId' },
    ]);
    const other = await seedHostOrg(db, { name: 'Salt and Pine' });
    locationsFake.setLocation({ id: fx.locationId, orgId: other.orgId });
    expect(brief((await check()).errors).map((e) => e.code)).toEqual(['location_unavailable']);
  });

  it("needs the org's own usable photos of the right kind", async () => {
    const other = await seedHostOrg(db, { name: 'Salt and Pine' });
    const foreign = await seedMedia(db, other.orgId, 'listing_photo');
    const rejected = await seedMedia(db, org.orgId, 'housing_photo', 'rejected');
    const wrongKind = await seedMedia(db, org.orgId, 'avatar');
    const r = await check((c) => {
      c.photos.coverMediaId = foreign;
      c.photos.galleryMediaIds = [wrongKind];
      if (c.housing.provided) c.housing.photos.bathroom = rejected;
    });
    expect(brief(r.errors)).toEqual([
      { code: 'photo_unavailable', section: 'housing', field: 'housing.photos.bathroom' },
      { code: 'photo_unavailable', section: 'photos', field: 'photos.coverMediaId' },
      { code: 'photo_unavailable', section: 'photos', field: 'photos.galleryMediaIds.0' },
    ]);
    expect(r.errors[0]?.message).toBe('Choose another photo.');
  });

  it('needs a genre of the primary category', async () => {
    const r = await check((c) => {
      c.basics.genre = 'commercial_fishing';
    });
    expect(brief(r.errors)).toEqual([
      { code: 'genre_invalid', section: 'basics', field: 'basics.genre' },
    ]);
    expect(r.errors[0]?.message).toBe('Choose a genre for this category.');
  });

  describe('pay_below_min_wage', () => {
    const weekly = (cents: number) => (c: ListingContent) => {
      c.pay = { ...c.pay, kind: 'fixed', minCents: cents, maxCents: cents, unit: 'week' };
      c.when.weeklyHours = 40;
    };

    it('warns for $500 a week at 40 hours in WA', async () => {
      const r = await check(weekly(50000));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([
        {
          code: 'pay_below_min_wage',
          section: 'pay',
          field: 'pay.minCents',
          message: 'This looks below the minimum wage in WA. Check it before you publish.',
        },
      ]);
      expect(ackKey(r.warnings[0] as Issue)).toBe('pay_below_min_wage');
    });

    it("doesn't warn where the minimum is at most $12.50", async () => {
      locationsFake.setLocation({ id: fx.locationId, orgId: org.orgId, state: 'TX' });
      expect((await check(weekly(50000))).warnings).toEqual([]);
    });

    it('compares a remote listing with the federal minimum', async () => {
      const remote = (cents: number) => (c: ListingContent) => {
        weekly(cents)(c);
        c.where = { mode: 'remote', scope: 'all_us', states: [], hostLocationId: fx.locationId };
      };
      expect((await check(remote(50000))).warnings).toEqual([]);
      expect(brief((await check(remote(28000))).warnings)).toEqual([
        { code: 'pay_below_min_wage', section: 'pay', field: 'pay.minCents' },
      ]);
    });

    it('skips a day rate', async () => {
      const r = await check((c) => {
        c.pay = { ...c.pay, kind: 'fixed', minCents: 1000, maxCents: 1000, unit: 'day' };
      });
      expect(r.warnings).toEqual([]);
    });
  });

  it('warns about a photo that does not show its slot', async () => {
    await db.execute(sql`
      insert into app.photo_slot_checks (media_id, slot, result)
      values (${fx.housingPhotos.bathroom}, 'bathroom', 'mismatch')
    `);
    const r = await check();
    expect(r.warnings).toEqual([
      {
        code: 'photo_slot_mismatch',
        section: 'housing',
        field: 'housing.photos.bathroom',
        message: "This doesn't look like a bathroom.",
      },
    ]);
    expect(ackKey(r.warnings[0] as Issue)).toBe('photo_slot_mismatch:bathroom');
  });
});

describe('hourlyPayCents', () => {
  const pay = (unit: ListingContent['pay']['unit'], minCents: number) =>
    ({ minCents, unit }) as ListingContent['pay'];

  it('converts each unit with weekly hours', () => {
    expect(hourlyPayCents(pay('hour', 1900), 40)).toBe(1900);
    expect(hourlyPayCents(pay('week', 50000), 40)).toBe(1250);
    expect(hourlyPayCents(pay('month', 520000), 40)).toBe(3000);
    expect(hourlyPayCents(pay('year', 2080000), 40)).toBe(1000);
    expect(hourlyPayCents(pay('day', 20000), 40)).toBeNull();
    expect(hourlyPayCents(pay('season', 900000), 40)).toBeNull();
    expect(hourlyPayCents(pay('crew_share', 900000), 40)).toBeNull();
  });
});

describe('normalizeForPhraseMatch', () => {
  it('folds case, width, periods and spacing', () => {
    expect(normalizeForPhraseMatch('  ＵＳ  Citizens.  ONLY ')).toBe('us citizens only');
  });
});
