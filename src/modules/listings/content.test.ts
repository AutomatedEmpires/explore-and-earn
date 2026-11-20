import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { newId } from '@/lib/ids';
import { buildListingContent } from '../../../tests/helpers/sp2';
import {
  ListingContentSchema,
  ListingDraftSchema,
  normalizeSkill,
  SECTION_CONTENT_KEYS,
  type ListingContent,
} from './index';

const photos = {
  bedroom: newId(),
  bathroom: newId(),
  kitchen: newId(),
  exterior: newId(),
};

const build = (edit?: (c: ListingContent) => void) =>
  buildListingContent({ locationId: newId(), coverMediaId: newId(), housingPhotos: photos }, edit);

const pathsOf = (value: unknown) => {
  const result = ListingContentSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
};

describe('ListingContentSchema', () => {
  it('parses the helper listing', () => {
    const content = build();
    expect(ListingContentSchema.parse(content)).toEqual(content);
    expect(content.basics.title).toBe('Lift Operator');
    expect(content.housing).toMatchObject({
      provided: true,
      type: 'shared_room',
      cost: { free: false, cents: 15000, period: 'week', paidBy: 'deducted' },
    });
  });

  it('defaults the minimum age to 18', () => {
    const content = build() as unknown as { job: Record<string, unknown> };
    delete content.job.minAge;
    expect(ListingContentSchema.parse(content).job.minAge).toBe(18);
  });

  it('rejects provided housing without a cost', () => {
    const content = build() as unknown as { housing: Record<string, unknown> };
    delete content.housing.cost;
    expect(pathsOf(content)).toContain('housing.cost');
  });

  it('rejects a housing photo set with three photos', () => {
    const content = build() as unknown as { housing: { photos: Record<string, unknown> } };
    delete content.housing.photos.exterior;
    expect(pathsOf(content)).toContain('housing.photos.exterior');
  });

  it('requires genre details of the primary category', () => {
    const content = build((c) => {
      c.genreDetails = {
        category: 'maritime',
        vesselType: 'Longliner',
        homePort: 'Kodiak',
        rotation: null,
        timeAtSea: null,
        documents: [],
      };
    });
    expect(pathsOf(content)).toEqual(['genreDetails.category']);
  });

  it('enforces the pay rules', () => {
    expect(
      pathsOf(
        build((c) => {
          c.pay.maxCents = 1000;
        }),
      ),
    ).toEqual(['pay.maxCents']);
    expect(
      pathsOf(
        build((c) => {
          c.pay.kind = 'fixed';
        }),
      ),
    ).toEqual(['pay.maxCents']);
    expect(
      pathsOf(
        build((c) => {
          c.pay.minCents = 0;
          c.pay.maxCents = 0;
        }),
      ),
    ).toEqual([]);
    expect(
      pathsOf(
        build((c) => {
          c.pay.minCents = 19.5;
        }),
      ),
    ).toContain('pay.minCents');
  });

  it('checks dates are real and in order', () => {
    expect(
      pathsOf(
        build((c) => {
          c.when.dates = { mode: 'fixed', start: '2027-06-01', end: '2027-05-31' };
        }),
      ),
    ).toEqual(['when.dates.end']);
    expect(
      pathsOf(
        build((c) => {
          c.when.dates = { mode: 'fixed', start: '2027-02-30', end: '2027-03-31' };
        }),
      ),
    ).toEqual(['when.dates.start']);
  });

  it('checks remote states', () => {
    const remote = (states: string[], scope: 'all_us' | 'states') =>
      build((c) => {
        c.where = { mode: 'remote', scope, states: states as never, hostLocationId: newId() };
      });
    expect(pathsOf(remote([], 'states'))).toEqual(['where.states']);
    expect(pathsOf(remote(['WA', 'PR'], 'states'))).toEqual([]);
    expect(pathsOf(remote([], 'all_us'))).toEqual([]);
    expect(pathsOf(remote(['ZZ'], 'states'))).toContain('where.states.0');
  });

  it('checks perks, genre codes, question ids and limits', () => {
    expect(pathsOf(build((c) => void (c.job.perks = ['ski_pass', 'pony'])))).toEqual(['job.perks']);
    expect(pathsOf(build((c) => void (c.basics.genre = 'Ski Resorts')))).toEqual(['basics.genre']);
    expect(
      pathsOf(
        build((c) => {
          c.applying.questions = [
            { id: 'has space', prompt: 'Can you ski?', required: true, type: 'yes_no' },
          ];
        }),
      ),
    ).toEqual(['applying.questions.0.id']);
    expect(
      pathsOf(
        build((c) => {
          c.applying.questions = [
            {
              id: 'q1',
              prompt: 'Pick one',
              required: true,
              type: 'multiple_choice',
              choices: ['Only one'],
              allowMultiple: false,
            },
          ];
        }),
      ),
    ).toEqual(['applying.questions.0.choices']);
    expect(pathsOf(build((c) => void (c.basics.title = 'Lift')))).toEqual(['basics.title']);
    expect(
      pathsOf(
        build((c) => void (c.photos.galleryMediaIds = Array.from({ length: 9 }, () => newId()))),
      ),
    ).toEqual(['photos.galleryMediaIds']);
    expect(pathsOf(build((c) => void (c.job.minAge = 17)))).toEqual(['job.minAge']);
  });

  it('trims text and rejects control characters other than newline and tab', () => {
    const trimmed = ListingContentSchema.parse(
      build((c) => void (c.basics.title = '  Lift Operator  ')),
    );
    expect(trimmed.basics.title).toBe('Lift Operator');
    const tabbed = build((c) => {
      c.job.description = `${c.job.description}\n\tWith tabs and newlines.`;
    });
    expect(pathsOf(tabbed)).toEqual([]);
    expect(pathsOf(build((c) => void (c.basics.title = 'Lift\u0007Operator')))).toEqual([
      'basics.title',
    ]);
  });

  it('converts to JSON Schema', () => {
    expect(() => z.toJSONSchema(ListingContentSchema, { io: 'input' })).not.toThrow();
  });
});

describe('ListingDraftSchema', () => {
  it('accepts an empty draft and partial sections', () => {
    expect(ListingDraftSchema.parse({})).toEqual({});
    expect(ListingDraftSchema.parse({ housing: { provided: true } })).toEqual({
      housing: { provided: true },
    });
    expect(
      ListingDraftSchema.parse({ basics: { title: 'Li' }, pay: { minCents: 0 }, job: {} }),
    ).toEqual({ basics: { title: 'Li' }, pay: { minCents: 0 }, job: {} });
  });

  it('still checks types', () => {
    expect(ListingDraftSchema.safeParse({ basics: { title: 5 } }).success).toBe(false);
    expect(ListingDraftSchema.safeParse({ basics: { primaryCategory: 'space' } }).success).toBe(
      false,
    );
    expect(ListingDraftSchema.safeParse({ housing: { type: 'dorm' } }).success).toBe(false);
  });

  it('accepts a complete listing', () => {
    expect(ListingDraftSchema.safeParse(build()).success).toBe(true);
  });

  it('converts to JSON Schema', () => {
    expect(() => z.toJSONSchema(ListingDraftSchema)).not.toThrow();
  });
});

describe('SECTION_CONTENT_KEYS', () => {
  it('maps builder sections to content keys', () => {
    expect(SECTION_CONTENT_KEYS.where_when).toEqual(['where', 'when']);
    expect(SECTION_CONTENT_KEYS.genre_details).toEqual(['genreDetails']);
    expect(Object.values(SECTION_CONTENT_KEYS).flat().sort()).toEqual(Object.keys(build()).sort());
  });
});

describe('normalizeSkill', () => {
  it('normalizes the label and derives a comparison key', () => {
    expect(normalizeSkill('  Customer   Service ')).toEqual({
      key: 'customer-service',
      label: 'Customer Service',
    });
    expect(normalizeSkill('C++').key).toBe('c++');
    expect(normalizeSkill('C#').key).toBe('c#');
    expect(normalizeSkill('Food & Beverage').key).toBe('food-and-beverage');
    expect(normalizeSkill('ＣＰＲ / First Aid')).toEqual({
      key: 'cpr-first-aid',
      label: 'CPR / First Aid',
    });
  });
});
