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
  H2B_FIELDS,
  MESSAGES,
  SECTION_CONTENT,
  STEP_KEYS,
  fieldKeyFor,
  h2bFixLine,
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

  it('maps a server issue to the field that edits it', () => {
    for (const path of [
      'pay.kind',
      'pay.minCents',
      'pay.maxCents',
      'pay.crewShareEstimate.minCents',
    ]) {
      expect(fieldKeyFor(path)).toBe('pay.amount');
    }
    expect(fieldKeyFor('pay.crewShareEstimate')).toBe('pay.crewPer');
    expect(fieldKeyFor('housing.cost.cents')).toBe('housing.cost.amount');
    expect(fieldKeyFor('meals.cost.cents')).toBe('meals.cost.amount');
    expect(fieldKeyFor('basics.title')).toBe('basics.title');
  });

  it('sends a chosen location with its onsite mode, which the strict schema requires', () => {
    let draft = setPath(sampleDraft(), 'where', undefined);
    draft = setPath(draft, 'where.locationId', SAMPLE_IDS.location);
    const data = sectionPayload('where_when', draft, ctx);
    expect(data.where).toEqual({ mode: 'onsite', locationId: SAMPLE_IDS.location });
    expect(serverSectionSchema('where_when').safeParse(data).success).toBe(true);
  });

  it('keeps a remote job remote before its scope is chosen', () => {
    let draft = setPath(sampleDraft(), 'basics.primaryCategory', 'remote');
    draft = setPath(draft, 'where', { hostLocationId: SAMPLE_IDS.location });
    expect(sectionPayload('where_when', draft, ctx).where).toEqual({
      mode: 'remote',
      hostLocationId: SAMPLE_IDS.location,
      scope: 'all_us',
      states: [],
    });
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

// Issue 208 (Figma 01 Host, "H-2B fields" 215:23546; field map 220:24886): the five optional
// job order fields write job.h2b, a paste over a limit is kept whole and shown with an error.
describe('the H-2B job order fields', () => {
  const FILLED = {
    transportation:
      'We repay your fare here and meals on the way once you finish half the season. We pay your trip home when you finish or if we end the job early.',
    tools: 'Uniforms, cleaning supplies and carts, at no charge.',
    threeFourthsGuarantee:
      'We offer at least three-fourths of the job order hours in each 6-week period. If we offer fewer, we pay what you would have earned.',
    swaContact: 'Bozeman Job Service · (406) 555-0142',
    jobOrderNumber: 'MT 4417260',
  };
  /** The sample as an H-2B listing; 'absent' leaves job.h2b out, as before #121. */
  const h2bDraft = (h2b: Json | 'absent' = FILLED, visa = 'h2b') =>
    setPath(
      setPath(sampleDraft(), 'job.visaSponsorship', visa),
      'job.h2b',
      h2b === 'absent' ? undefined : h2b,
    );
  /** The 74-character paste of the error frame (215:23897). */
  const PASTED = `Job order MT 4417260, posted Nov 2, ${'x'.repeat(38)}`;

  it('lists the five schema fields with their limits, in the order of the frames', () => {
    expect(H2B_FIELDS.map((f) => [f.key, f.limit])).toEqual([
      ['transportation', 1000],
      ['tools', 1000],
      ['threeFourthsGuarantee', 1000],
      ['swaContact', 500],
      ['jobOrderNumber', 60],
    ]);
  });

  it('saves job.h2b with the job section, which the strict draft schema accepts', () => {
    const data = sectionPayload('job', h2bDraft(), ctx);
    expect(data.job).toMatchObject({ visaSponsorship: 'h2b', h2b: FILLED });
    expect(serverSectionSchema('job').safeParse(data).success).toBe(true);
    const finished = normalizedDraft(h2bDraft(), ctx);
    const parsed = ListingContentSchema.safeParse(finished);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.job.h2b).toEqual(FILLED);
  });

  it('saves an empty or missing answer as null, so each field stays optional', () => {
    const data = sectionPayload('job', h2bDraft({ tools: '', jobOrderNumber: 'MT 4417260' }), ctx);
    expect(data.job).toMatchObject({
      h2b: {
        transportation: null,
        tools: null,
        threeFourthsGuarantee: null,
        swaContact: null,
        jobOrderNumber: 'MT 4417260',
      },
    });
    expect(ListingContentSchema.safeParse(normalizedDraft(h2bDraft({}), ctx)).success).toBe(true);
    // An H-2B listing saved before #121 has no h2b at all, and is still complete.
    expect(sectionPayload('job', h2bDraft('absent'), ctx).job).not.toHaveProperty('h2b');
    expect(validateAll(h2bDraft('absent'), {})).toEqual({});
  });

  it('finds nothing wrong with answers at their limits', () => {
    const atLimit = Object.fromEntries(H2B_FIELDS.map((f) => [f.key, 'a'.repeat(f.limit)]));
    expect(validateStep('job', h2bDraft(atLimit), {})).toEqual({});
    expect(ListingContentSchema.safeParse(normalizedDraft(h2bDraft(atLimit), ctx)).success).toBe(
      true,
    );
  });

  it('keeps a pasted job order number over 60 characters whole, with the frame error', () => {
    expect(PASTED).toHaveLength(74);
    const draft = h2bDraft({ ...FILLED, jobOrderNumber: PASTED });
    expect(validateStep('job', draft, {})).toEqual({
      'job.h2b.jobOrderNumber':
        'Use 60 characters or fewer. This has 74. Enter just the number, like MT 4417260.',
    });
    // Nothing is cut: the draft saves all 74 characters, and the server's strict draft schema
    // takes them (it has no limits), while the published content is refused until it is fixed.
    const data = sectionPayload('job', draft, ctx);
    expect((data.job as Json).h2b).toMatchObject({ jobOrderNumber: PASTED });
    expect(serverSectionSchema('job').safeParse(data).success).toBe(true);
    expect(ListingContentSchema.safeParse(normalizedDraft(draft, ctx)).success).toBe(false);
    expect(validateAll(draft, {}).job).toHaveProperty('job.h2b.jobOrderNumber');
  });

  it.each([
    ['transportation', 1000, 'Use 1,000 characters or fewer. This has 1,001.'],
    ['tools', 1000, 'Use 1,000 characters or fewer. This has 1,001.'],
    ['threeFourthsGuarantee', 1000, 'Use 1,000 characters or fewer. This has 1,001.'],
    ['swaContact', 500, 'Use 500 characters or fewer. This has 501.'],
  ])('shows the same over-limit error on %s', (key, limit, message) => {
    const draft = h2bDraft({ ...FILLED, [key]: 'a'.repeat(limit + 1) });
    expect(validateStep('job', draft, {})).toEqual({ [`job.h2b.${key}`]: message });
  });

  it('counts what the server counts: the answer without its outer spaces', () => {
    const padded = `   ${'a'.repeat(60)}   `;
    expect(validateStep('job', h2bDraft({ jobOrderNumber: padded }), {})).toEqual({});
  });

  it('hides the group when the visa is not H-2B, and keeps the answers', () => {
    const draft = h2bDraft({ ...FILLED, jobOrderNumber: PASTED }, 'none');
    // The hidden fields never block Next.
    expect(validateStep('job', draft, {})).toEqual({});
    expect((sectionPayload('job', draft, ctx).job as Json).h2b).toEqual({
      ...FILLED,
      jobOrderNumber: PASTED,
    });
  });

  it('says what to fix above Next, by field', () => {
    expect(h2bFixLine({ 'job.h2b.jobOrderNumber': 'x' })).toBe(
      'Fix the job order number before you publish.',
    );
    expect(h2bFixLine({ 'job.h2b.tools': 'x' })).toBe(
      'Fix the tools and equipment before you publish.',
    );
    expect(h2bFixLine({ 'job.h2b.transportation': 'x', 'job.h2b.jobOrderNumber': 'x' })).toBe(
      'Fix your H-2B job order answers before you publish.',
    );
    expect(h2bFixLine({ 'job.description': 'x' })).toBeNull();
    expect(h2bFixLine({})).toBeNull();
  });

  it('focuses each field from a server issue on its own path', () => {
    for (const f of H2B_FIELDS) expect(fieldKeyFor(`job.h2b.${f.key}`)).toBe(`job.h2b.${f.key}`);
    expect(sectionOfPath('job.h2b.tools')).toBe('job');
  });
});
