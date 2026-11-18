// Automatic checks (spec section 8.2): each blocking issue and warning with its exact code,
// section and field.
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/db';
import { newId } from '@/lib/ids';
import { SETTING_DEFAULTS, type SettingValue } from '@/modules/settings';
import { createTestDb, type TestDb } from '../../../tests/helpers/db';
import { locationsFake } from '../../../tests/fakes/sp2/locations';
import { FIXED_NOW, seedHostOrg, seedMedia, type SeededOrg } from '../../../tests/helpers/sp2';
import { findFlaggedWording, questionTopic } from './checks';
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

  it('blocks the added no-lawful-use phrases', async () => {
    const r = await check((c) => {
      c.job.requiredQualifications = ['Green card holders only'];
      c.job.description += ' No immigrants.';
    });
    expect(brief(r.errors)).toEqual([
      { code: 'prohibited_wording', section: 'job', field: 'job.description' },
      { code: 'prohibited_wording', section: 'job', field: 'job.requiredQualifications.0' },
    ]);
  });

  describe('wording_flagged (legal review 2.2, issue 121)', () => {
    const DESCRIPTION =
      'Run the chairlift, help riders on and off safely, and keep the loading area clear.';

    it('warns, says why, offers neutral wording, and is acknowledged by its code', async () => {
      const r = await check((c) => {
        c.job.description = `${DESCRIPTION} We are hiring a waitress for the lodge.`;
      });
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([
        {
          code: 'wording_flagged',
          section: 'job',
          field: 'job.description',
          message:
            '"waitress" can read as a preference for men or for women. Try "server". If the job needs it, you can keep it: we will review the listing before it goes live.',
        },
      ]);
      expect(ackKey(r.warnings[0] as Issue)).toBe('wording_flagged');
    });

    it('reads the title, qualifications, screening questions and housing notes', async () => {
      const r = await check((c) => {
        c.basics.title = 'Lodge Hostess';
        c.job.preferredQualifications = ['Recent college graduates'];
        c.applying.questions = [
          { id: 'q1', prompt: 'Do you have a clean record?', required: true, type: 'yes_no' },
          {
            id: 'q2',
            prompt: 'Which shift suits you?',
            required: false,
            type: 'multiple_choice',
            choices: ['Mornings', 'Evenings with the guys'],
            allowMultiple: false,
          },
        ];
        if (c.housing.provided) c.housing.finePrint.notes = 'Cabins are for couples only.';
      });
      expect(r.errors).toEqual([]);
      expect(brief(r.warnings)).toEqual([
        { code: 'wording_flagged', section: 'basics', field: 'basics.title' },
        { code: 'wording_flagged', section: 'housing', field: 'housing.finePrint.notes' },
        { code: 'wording_flagged', section: 'job', field: 'job.preferredQualifications.0' },
        { code: 'wording_flagged', section: 'applying', field: 'applying.questions.0.prompt' },
        {
          code: 'wording_flagged',
          section: 'applying',
          field: 'applying.questions.1.choices.1',
        },
      ]);
    });

    it('leaves a field with blocked wording to the block', async () => {
      const r = await check((c) => {
        c.job.description = `${DESCRIPTION} US citizens only. Young team.`;
      });
      expect(brief(r.errors)).toEqual([
        { code: 'prohibited_wording', section: 'job', field: 'job.description' },
      ]);
      expect(r.warnings).toEqual([]);
    });
  });

  describe('question_not_allowed (legal review 2.2 item 2, issue 121)', () => {
    const ask = (prompt: string, choices?: string[]) => (c: ListingContent) => {
      c.applying.questions = [
        choices
          ? {
              id: 'q1',
              prompt,
              required: true,
              type: 'multiple_choice',
              choices,
              allowMultiple: false,
            }
          : { id: 'q1', prompt, required: true, type: 'yes_no' },
      ];
    };

    it.each<[string, string, string]>([
      [
        'age',
        'How old are you?',
        'The only question about age you can ask is "Are you at least 18?" or "Are you at least 21?".',
      ],
      [
        'marital status',
        'Are you married?',
        "You can't ask about marriage, partners or children. Ask about what the job needs, like the schedule or shared housing.",
      ],
      ['pregnancy', 'Are you pregnant?', "You can't ask about pregnancy or plans for a family."],
      [
        'disability',
        'Do you have any medical conditions?',
        'You can\'t ask about disabilities, health or medication. You can ask "Can you do the tasks in this listing, with or without a reasonable accommodation?"',
      ],
      [
        'religion',
        'What church do you attend?',
        "You can't ask about religion. You can ask whether someone can work the days in this listing.",
      ],
      [
        'national origin',
        'What country are you from?',
        'You can\'t ask about national origin, citizenship or first language. You can ask "Are you authorized to work in the US?" and "Will you need visa sponsorship?"',
      ],
      ['arrest record', 'Have you ever been arrested?', "You can't ask about arrests or charges."],
    ])('blocks a question about %s', async (_topic, prompt, message) => {
      const r = await check(ask(prompt));
      expect(r.errors).toEqual([
        {
          code: 'question_not_allowed',
          section: 'applying',
          field: 'applying.questions.0.prompt',
          message,
        },
      ]);
    });

    it.each([
      'Are you at least 18?',
      'Are you at least 21 years old?',
      'Are you 18 or older?',
      'Are you 21 years of age or older?',
      'Are you over 21?',
      'Are you 18+?',
    ])('allows %j', async (prompt) => {
      const r = await check(ask(prompt));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    });

    it.each([
      'Are you at least 25?',
      'Are you under 40?',
      'What is your date of birth?',
      'What year did you graduate high school?',
      'Are you of legal age?',
    ])('blocks the age question %j', async (prompt) => {
      expect(brief((await check(ask(prompt))).errors)).toEqual([
        { code: 'question_not_allowed', section: 'applying', field: 'applying.questions.0.prompt' },
      ]);
    });

    it('checks the choices too', async () => {
      const r = await check(ask('Which describes you?', ['Single', 'Married']));
      expect(brief(r.errors)).toEqual([
        {
          code: 'question_not_allowed',
          section: 'applying',
          field: 'applying.questions.0.choices.1',
        },
      ]);
    });

    it.each([
      'Are you authorized to work in the US?',
      'Will you need visa sponsorship?',
      'Can you lift 50 lb?',
      'Can you do the tasks in this listing, with or without a reasonable accommodation?',
      'Can you work weekends and holidays?',
      "Do you have a valid driver's license?",
      'Do you have childcare experience?',
      'Have you managed a stage crew?',
    ])('allows the lawful question %j', async (prompt) => {
      const r = await check(ask(prompt));
      expect(r.errors).toEqual([]);
      expect(r.warnings).toEqual([]);
    });

    it('runs on screening questions only', async () => {
      const r = await check((c) => {
        c.job.description +=
          ' We never ask your age, religion or whether you are married or have been arrested.';
      });
      expect(r.errors).toEqual([]);
    });
  });

  describe('visa sponsorship (legal review 2.3, issue 121)', () => {
    it('blocks H-2A without free housing, linking 20 CFR 655.122(d)', async () => {
      const paid = await check((c) => {
        c.job.visaSponsorship = 'h2a';
      });
      expect(paid.errors).toEqual([
        {
          code: 'h2a_housing_not_free',
          section: 'housing',
          field: 'housing.cost',
          message:
            'H-2A workers must get housing at no cost (20 CFR 655.122(d)). Make housing free, or choose another visa sponsorship.',
          href: 'https://www.ecfr.gov/current/title-20/section-655.122#p-655.122(d)',
        },
      ]);

      const none = await check((c) => {
        c.job.visaSponsorship = 'h2a';
        c.housing = { provided: false };
      });
      expect(brief(none.errors)).toEqual([
        { code: 'h2a_housing_not_free', section: 'housing', field: 'housing.provided' },
      ]);
    });

    it('allows H-2A with free housing, and paid housing without H-2A', async () => {
      const free = await check((c) => {
        c.job.visaSponsorship = 'h2a';
        if (c.housing.provided) c.housing.cost = { free: true };
      });
      expect(free.errors).toEqual([]);
      for (const visa of ['none', 'j1'] as const) {
        expect((await check((c) => void (c.job.visaSponsorship = visa))).errors).toEqual([]);
      }
    });

    it('asks an H-2B host to confirm the job order, acknowledged by its code', async () => {
      for (const h2b of [
        undefined,
        {
          transportation: null,
          tools: 'All tools are free.',
          threeFourthsGuarantee: null,
          swaContact: null,
          jobOrderNumber: 'AK10582913',
        },
      ]) {
        const r = await check((c) => {
          c.job.visaSponsorship = 'h2b';
          if (h2b) c.job.h2b = h2b;
        });
        expect(r.errors).toEqual([]);
        expect(r.warnings).toEqual([
          {
            code: 'h2b_job_order',
            section: 'job',
            field: 'job.visaSponsorship',
            message:
              'H-2B listings must offer pay and terms at least as good as your job order (20 CFR 655.41). Publishing confirms they match it.',
            href: 'https://www.ecfr.gov/current/title-20/section-655.41',
          },
        ]);
        expect(ackKey(r.warnings[0] as Issue)).toBe('h2b_job_order');
      }
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

  it('reads dashes as spaces and folds curly apostrophes', () => {
    expect(normalizeForPhraseMatch('Able-bodied, ages 18–30, workers’ comp')).toBe(
      "able bodied, ages 18 30, workers' comp",
    );
  });
});

// The pure matchers, against the shipped lists. "Each list entry" (#121 acceptance) is tested by
// running the entry on its own, so no other entry can be the one that matched.
describe('the wording lists', () => {
  const flagged = SETTING_DEFAULTS['listings.flagged_phrases'];
  const nationalities = SETTING_DEFAULTS['listings.flagged_nationalities'];
  const topics = SETTING_DEFAULTS['listings.question_topics'];
  type Topics = SettingValue<'listings.question_topics'>;
  const lists = { flagged, nationalities };
  /** A phrase with its wildcards filled in: `*` a word, `#` a number. */
  const sample = (phrase: string) => phrase.replace(/\*/g, 'spanish').replace(/#/g, '40');
  const inDescription = (text: string) => ({ job: { description: `We are hiring. ${text}.` } });

  it.each(flagged.map((f) => [f.phrase, f] as const))('flags %j', (_phrase, entry) => {
    expect(
      findFlaggedWording(inDescription(sample(entry.phrase)), {
        flagged: [entry],
        nationalities: [],
      }),
    ).toEqual([
      expect.objectContaining({
        field: 'job.description',
        phrase: entry.phrase,
        ground: entry.ground,
      }),
    ]);
  });

  it.each(nationalities)('flags people named as %s', (n) => {
    for (const text of [`${n} workers preferred`, `${n}s only`, `Must be ${n}`]) {
      expect(
        findFlaggedWording(inDescription(text), { flagged: [], nationalities: [n] }),
        text,
      ).toEqual([expect.objectContaining({ field: 'job.description', ground: 'national_origin' })]);
    }
  });

  it.each(
    Object.entries(topics).flatMap(([topic, phrases]) => phrases.map((p) => [topic, p] as const)),
  )('treats a %s question with %j as not allowed', (topic, phrase) => {
    const only = Object.fromEntries(
      Object.keys(topics).map((k) => [k, k === topic ? [phrase] : []]),
    ) as unknown as Topics;
    expect(questionTopic(`Question: ${sample(phrase)}?`, only)).toBe(topic);
  });

  it.each<[string, string, string]>([
    ['We need a young, energetic team', 'young', 'age'],
    ['Perfect for recent college graduates', 'recent college graduates', 'age'],
    ['Applicants under 30 preferred', 'under 30', 'age'],
    ['Ages 18–30 only', 'ages 18 30', 'age'],
    ['Girls camp counselor', 'girls', 'sex'],
    ['Native Spanish speaker preferred', 'native spanish speaker', 'national_origin'],
    ['Mexican workers preferred', 'mexican workers', 'national_origin'],
    ['Must be able-bodied', 'able bodied', 'disability'],
    ['Christian camp: staff lead morning devotions', 'christian', 'religion'],
    ['Housing is for couples only', 'couples only', 'family_status'],
    ['No felons', 'no felons', 'criminal_history'],
    ['Must be good-looking', 'good looking', 'appearance'],
    ['Teens welcome!', 'teens welcome', 'minors'],
    ['Great for high school students', 'high school students', 'minors'],
  ])('flags %j as %j (%s), the longest match winning', (text, matched, ground) => {
    expect(findFlaggedWording(inDescription(text), lists)).toEqual([
      expect.objectContaining({ field: 'job.description', matched, ground }),
    ]);
  });

  it.each([
    'Our office is in Youngstown',
    'Rooms are single occupancy',
    'A clean driving record is required',
    'Guests raft the American River with us',
    'Bilingual in Spanish and English is a plus',
    'You must pass a background check',
    'Able to lift 50 lb',
  ])('does not flag %j', (text) => {
    expect(findFlaggedWording(inDescription(text), lists)).toEqual([]);
  });

  it('reads prose fields only, not codes', () => {
    expect(
      findFlaggedWording(
        { basics: { occupationCode: 'waitress', genre: 'young' }, job: { perks: ['girls'] } },
        lists,
      ),
    ).toEqual([]);
  });
});
