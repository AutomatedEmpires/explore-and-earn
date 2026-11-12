// The builder model against the real listing contract: every section it saves passes the
// server's strict draft schema, and the finished sample passes ListingContentSchema.
import { describe, expect, it } from 'vitest';
import {
  BUILDER_SECTIONS,
  ListingContentSchema,
  ListingDraftSchema,
  SECTION_CONTENT_KEYS,
  checklist,
} from '@/modules/listings';
import {
  MESSAGES,
  SECTION_CONTENT,
  STEP_KEYS,
  normalizedDraft,
  sectionOfPath,
  sectionPayload,
  stepTitle,
  validateAll,
  validateStep,
} from './model';
import { setPath, type Json } from './paths';
import { SAMPLE_IDS, sampleDraft } from './sample';

const ctx = { viewerUserId: SAMPLE_IDS.viewer };

/** The server's per-section schema (drafts.ts `sectionSchema`). */
function serverSectionSchema(section: (typeof BUILDER_SECTIONS)[number]) {
  const mask = Object.fromEntries(SECTION_CONTENT_KEYS[section].map((k) => [k, true as const]));
  return ListingDraftSchema.pick(mask as never).strict();
}

describe('the builder model', () => {
  it('saves the same sections and content keys as the server', () => {
    expect(Object.keys(SECTION_CONTENT)).toEqual([...BUILDER_SECTIONS]);
    for (const section of BUILDER_SECTIONS) {
      expect(SECTION_CONTENT[section]).toEqual(SECTION_CONTENT_KEYS[section]);
    }
    expect(STEP_KEYS).toEqual([...BUILDER_SECTIONS, 'review']);
    expect(sectionOfPath('when.dates.start')).toBe('where_when');
    expect(sectionOfPath('genreDetails.staffPerks')).toBe('genre_details');
  });

  it('sends section payloads the strict draft schema accepts', () => {
    const draft = sampleDraft();
    for (const section of BUILDER_SECTIONS) {
      const parsed = serverSectionSchema(section).safeParse(sectionPayload(section, draft, ctx));
      expect(parsed.success, `${section}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it('fills the defaults that make a finished draft complete', () => {
    const draft = sampleDraft();
    // A host who never touched the optional fields still ends with a complete listing.
    let sparse: Json = draft;
    for (const path of [
      'basics.secondaryCategory',
      'pay.crewShareEstimate',
      'pay.tips',
      'pay.deductions',
      'housing.finePrint.pets',
      'housing.finePrint.notes',
      'meals.dietary',
      'job.responsibilities',
      'job.certifications',
      'job.minAge',
      'applying.additionalStep',
      'applying.deadline',
      'applying.notifyMemberIds',
    ]) {
      sparse = setPath(sparse, path, undefined);
    }
    const finished = normalizedDraft(sparse, ctx);
    const parsed = ListingContentSchema.safeParse(finished);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(finished.applying).toMatchObject({ notifyMemberIds: [SAMPLE_IDS.viewer] });
    expect(checklist(finished).every((s) => s.complete)).toBe(true);
  });

  it('reads an empty optional text as null', () => {
    const draft = setPath(sampleDraft(), 'job.typicalDay', '');
    expect(sectionPayload('job', draft, ctx).job).toMatchObject({ typicalDay: null });
  });

  it('drops housing details when housing is not provided', () => {
    const draft = setPath(sampleDraft(), 'housing.provided', false);
    expect(sectionPayload('housing', draft, ctx)).toEqual({ housing: { provided: false } });
    expect(validateStep('housing', draft, {})).toEqual({});
  });

  it('titles the details step after the category', () => {
    expect(stepTitle('genre_details', sampleDraft())).toBe('Seasonal details');
    expect(stepTitle('genre_details', {})).toBe('Job type details');
  });
});

describe('inline validation', () => {
  it('finds nothing wrong with the finished sample', () => {
    expect(validateAll(sampleDraft(), {})).toEqual({});
  });

  it('keeps an unreadable pay amount as an error, not a value', () => {
    const errors = validateStep('pay', sampleDraft(), { 'pay.amount': 'Good wages' });
    expect(errors['pay.amount']).toBe(MESSAGES.payAmount);
    expect(validateStep('pay', sampleDraft(), { 'pay.amount': '22-18' })['pay.amount']).toBe(
      MESSAGES.payOrder,
    );
    expect(validateStep('pay', sampleDraft(), { 'pay.amount': '$18–$20' })).toEqual({});
  });

  it('asks for every required basic on a blank draft', () => {
    expect(Object.keys(validateStep('basics', {}, {})).sort()).toEqual(
      [
        'basics.employmentType',
        'basics.genre',
        'basics.occupationCode',
        'basics.openings',
        'basics.primaryCategory',
        'basics.schedule',
        'basics.title',
      ].sort(),
    );
  });

  it('checks the last day against the first', () => {
    const draft = setPath(sampleDraft(), 'when.dates.end', '2027-05-01');
    expect(validateStep('where_when', draft, {})['when.dates.end']).toBe(MESSAGES.endBeforeStart);
  });

  it('needs all four housing photos and a cost', () => {
    let draft = setPath(sampleDraft(), 'housing.photos.kitchen', undefined);
    draft = setPath(draft, 'housing.cost', { free: false });
    const errors = validateStep('housing', draft, {});
    expect(errors['housing.photos.kitchen']).toBe('Add a kitchen photo.');
    expect(errors['housing.cost.amount']).toBe(MESSAGES.costAmount);
  });

  it('needs a description guests can read', () => {
    const draft = setPath(sampleDraft(), 'job.description', 'Too short.');
    expect(validateStep('job', draft, {})['job.description']).toBe(MESSAGES.description);
  });

  it('needs a secure additional step link', () => {
    const draft = setPath(sampleDraft(), 'applying.additionalStep', {
      url: 'http://example.com',
      note: '',
    });
    expect(validateStep('applying', draft, {})['applying.additionalStep.url']).toBe(MESSAGES.link);
  });
});
