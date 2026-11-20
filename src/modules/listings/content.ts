// The canonical listing content (SP2 spec section 3, schema version 1) with the section 8.2
// field limits, and the draft schema the builder autosaves against.
//
// - ListingContentSchema validates a complete listing (a published revision's content): types,
//   limits and cross-field rules. The business checks (vague pay, prohibited wording and the
//   rest) are Task 24's issues, not schema errors.
// - ListingDraftSchema validates types only: every section optional, each object partial, and
//   each union member partial apart from its discriminator. It is derived from the content
//   shape, so the two can't drift.
//
// Neither uses transforms, so both convert to JSON Schema (paste-import uses structured output).
import { z } from 'zod';
import { CATEGORIES, PERKS } from '@/lib/taxonomy';
import { US_STATE_CODES } from '@/lib/us-states';

export const LISTING_SCHEMA_VERSION = 1;

/** Control characters other than \n and \t. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F]/;

const ITEM_MAX = 200;
const PERK_CODES = new Set(PERKS.map((p) => p.code));

/** Trimmed text of `min`-`max` characters without control characters. */
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !CONTROL_CHARS.test(s), { message: 'Remove control characters' });

/** Up to `max` list items of 1-200 characters each. */
const items = (max: number) => z.array(text(1, ITEM_MAX)).max(max);

const cents = z.number().int().min(0);
const code = z.string().regex(/^[a-z0-9_]+$/, 'Use lowercase letters, digits and _');
const category = z.enum(CATEGORIES);

/** A real calendar date written YYYY-MM-DD (zod checks month lengths and leap years). */
const date = z.iso.date();

const costSchema = z.discriminatedUnion('free', [
  z.object({ free: z.literal(true) }),
  z.object({
    free: z.literal(false),
    cents,
    period: z.enum(['day', 'week', 'month', 'season']),
    paidBy: z.enum(['deducted', 'direct']),
  }),
]);

const questionBase = {
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Use 1-40 letters, digits, _ or -'),
  prompt: text(1, ITEM_MAX),
  required: z.boolean(),
};

const questionSchema = z.discriminatedUnion('type', [
  z.object({ ...questionBase, type: z.literal('short_answer') }),
  z.object({ ...questionBase, type: z.literal('yes_no') }),
  z.object({
    ...questionBase,
    type: z.literal('multiple_choice'),
    choices: z.array(text(1, ITEM_MAX)).min(2).max(10),
    allowMultiple: z.boolean(),
  }),
]);

const contentShape = {
  basics: z.object({
    title: text(5, 80),
    primaryCategory: category,
    genre: code,
    secondaryCategory: category.nullable(),
    occupationCode: code,
    openings: z.number().int().min(1).max(999),
    employmentType: z.enum(['employee', 'contractor']),
    schedule: z.enum(['full_time', 'part_time']),
  }),

  where: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('onsite'), locationId: z.uuid() }),
    z.object({
      mode: z.literal('remote'),
      scope: z.enum(['all_us', 'states']),
      states: z.array(z.enum(US_STATE_CODES)).max(US_STATE_CODES.length),
      hostLocationId: z.uuid(),
    }),
  ]),

  when: z.object({
    dates: z.discriminatedUnion('mode', [
      z.object({ mode: z.literal('fixed'), start: date, end: date }),
      z.object({
        mode: z.literal('season'),
        season: z.enum(['spring', 'summer', 'fall', 'winter', 'year_round']),
        year: z.number().int().min(2000).max(2100),
      }),
      z.object({ mode: z.literal('ongoing'), start: date.nullable() }),
    ]),
    weeklyHours: z.number().min(1).max(120),
    minCommitment: text(1, ITEM_MAX).nullable(),
  }),

  pay: z.object({
    kind: z.enum(['fixed', 'range']),
    minCents: cents,
    maxCents: cents,
    unit: z.enum(['hour', 'day', 'week', 'month', 'season', 'year', 'crew_share']),
    crewShareEstimate: z
      .object({ minCents: cents, maxCents: cents, per: z.enum(['week', 'month', 'season']) })
      .nullable(),
    overtime: z.boolean(),
    tips: z.boolean(),
    bonuses: text(1, ITEM_MAX).nullable(),
    frequency: z.enum([
      'weekly',
      'biweekly',
      'semimonthly',
      'monthly',
      'end_of_season',
      'per_trip',
    ]),
    deductions: text(1, ITEM_MAX).nullable(),
  }),

  housing: z.discriminatedUnion('provided', [
    z.object({ provided: z.literal(false) }),
    z.object({
      provided: z.literal(true),
      type: z.enum(['dorm', 'shared_room', 'private_room', 'cabin', 'rv_site', 'berth']),
      cost: costSchema,
      photos: z.object({
        bedroom: z.uuid(),
        bathroom: z.uuid(),
        kitchen: z.uuid(),
        exterior: z.uuid(),
      }),
      note: text(0, 80),
      finePrint: z.object({
        roommates: z.number().int().min(0).max(99).nullable(),
        pets: z.boolean(),
        couples: z.boolean(),
        wifi: z.boolean(),
        utilitiesIncluded: z.boolean(),
        notes: text(1, 1_000).nullable(),
      }),
    }),
  ]),

  meals: z.discriminatedUnion('provided', [
    z.object({ provided: z.literal(false) }),
    z.object({
      provided: z.literal(true),
      perDay: z.union([z.literal(1), z.literal(2), z.literal(3)]),
      days: z.enum(['every_day', 'work_days']),
      cost: costSchema,
      photos: z.object({
        kitchen: z.uuid(),
        meal_example: z.uuid(),
        dining_area: z.uuid(),
        other: z.uuid(),
      }),
      note: text(0, 80),
      dietary: text(1, ITEM_MAX).nullable(),
    }),
  ]),

  genreDetails: z.discriminatedUnion('category', [
    z.object({
      category: z.literal('maritime'),
      vesselType: text(1, ITEM_MAX),
      homePort: text(1, ITEM_MAX),
      rotation: text(1, ITEM_MAX).nullable(),
      timeAtSea: text(1, ITEM_MAX).nullable(),
      documents: z.array(z.enum(['twic', 'mmc', 'stcw'])).max(3),
    }),
    z.object({
      category: z.literal('seasonal'),
      destinationSlug: z
        .string()
        .regex(/^[a-z0-9-]{1,80}$/)
        .nullable(),
      staffPerks: items(20),
    }),
    z.object({
      category: z.literal('farm'),
      operationType: text(1, ITEM_MAX),
      harvestWindow: text(1, ITEM_MAX).nullable(),
      equipment: items(20),
      certifications: items(15),
    }),
    z.object({
      category: z.literal('remote'),
      timeZoneOverlap: text(1, ITEM_MAX),
      equipmentProvided: text(1, ITEM_MAX).nullable(),
      internet: text(1, ITEM_MAX).nullable(),
      travel: z.enum(['none', 'occasional', 'regular']),
    }),
  ]),

  job: z.object({
    description: text(50, 10_000),
    responsibilities: items(20),
    typicalDay: text(1, 2_000).nullable(),
    requiredQualifications: items(15),
    preferredQualifications: items(15),
    skills: items(30),
    certifications: items(15),
    physicalDemands: text(1, 1_000).nullable(),
    minAge: z.number().int().min(18).max(99).default(18),
    perks: z
      .array(z.string())
      .max(PERKS.length)
      .refine((perks) => perks.every((p) => PERK_CODES.has(p)), { message: 'Unknown perk' }),
    visaSponsorship: z.enum(['none', 'j1', 'h2a', 'h2b']),
  }),

  photos: z.object({
    coverMediaId: z.uuid(),
    galleryMediaIds: z.array(z.uuid()).max(8),
  }),

  applying: z.object({
    questions: z.array(questionSchema).max(10),
    additionalStep: z
      .object({ url: z.string().trim().min(1).max(2_000), note: text(0, ITEM_MAX) })
      .nullable(),
    deadline: date.nullable(),
    notifyMemberIds: z.array(z.uuid()).max(50),
  }),
};

/** A complete listing (schema version 1). */
export const ListingContentSchema = z.object(contentShape).superRefine((c, ctx) => {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: 'custom', path, message });

  if (c.pay.maxCents < c.pay.minCents) {
    issue(['pay', 'maxCents'], 'The top of the range must be at least the bottom');
  }
  if (c.pay.kind === 'fixed' && c.pay.maxCents !== c.pay.minCents) {
    issue(['pay', 'maxCents'], 'A fixed rate has one amount');
  }
  const crew = c.pay.crewShareEstimate;
  if (crew && crew.maxCents < crew.minCents) {
    issue(
      ['pay', 'crewShareEstimate', 'maxCents'],
      'The top of the estimate must be at least the bottom',
    );
  }
  if (c.genreDetails.category !== c.basics.primaryCategory) {
    issue(['genreDetails', 'category'], 'The details must match the primary category');
  }
  const dates = c.when.dates;
  if (dates.mode === 'fixed' && dates.end < dates.start) {
    issue(['when', 'dates', 'end'], 'The end date must be on or after the start date');
  }
  if (c.where.mode === 'remote' && c.where.scope === 'states' && c.where.states.length === 0) {
    issue(['where', 'states'], 'Choose at least one state');
  }
});

export type ListingContent = z.output<typeof ListingContentSchema>;
/** What ListingContentSchema accepts (`job.minAge` may be omitted). */
export type ListingContentInput = z.input<typeof ListingContentSchema>;

/** Every field optional at every depth (union members keep their discriminator at runtime). */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends Date
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

export type ListingDraft = DeepPartial<ListingContent>;

/**
 * The draft version of a schema: the same types with no limits or refinements, every object
 * field optional except a discriminated union's discriminator.
 */
function toDraft(s: z.ZodType, keep?: string): z.ZodType {
  if (s instanceof z.ZodObject) {
    const shape: Record<string, z.ZodType> = {};
    for (const [key, field] of Object.entries(s.shape as Record<string, z.ZodType>)) {
      shape[key] = key === keep ? toDraft(field) : toDraft(field).optional();
    }
    return z.object(shape);
  }
  if (s instanceof z.ZodDiscriminatedUnion) {
    const discriminator = s.def.discriminator;
    const options = (s.options as z.ZodType[]).map((o) => toDraft(o, discriminator));
    return z.discriminatedUnion(
      discriminator,
      options as unknown as [z.ZodObject, z.ZodObject, ...z.ZodObject[]],
    );
  }
  if (s instanceof z.ZodUnion) {
    const options = (s.options as z.ZodType[]).map((o) => toDraft(o));
    return z.union(options as unknown as [z.ZodType, z.ZodType, ...z.ZodType[]]);
  }
  if (s instanceof z.ZodArray) return z.array(toDraft(s.element as z.ZodType));
  if (s instanceof z.ZodNullable) return toDraft(s.unwrap() as z.ZodType).nullable();
  if (s instanceof z.ZodOptional) return toDraft(s.unwrap() as z.ZodType).optional();
  if (s instanceof z.ZodDefault) return toDraft(s.unwrap() as z.ZodType);
  switch (s.def.type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'boolean':
      return z.boolean();
    case 'enum':
    case 'literal':
      return s;
    default:
      throw new Error(`toDraft: unsupported schema type ${s.def.type}`);
  }
}

type DraftShape<S extends Record<string, z.ZodType>> = {
  [K in keyof S]: z.ZodOptional<z.ZodType<DeepPartial<z.output<S[K]>>>>;
};

/** A builder draft: types only, every section optional and partial. */
export const ListingDraftSchema = toDraft(z.object(contentShape)) as unknown as z.ZodObject<
  DraftShape<typeof contentShape>
>;

export type ScreeningQuestion = z.output<typeof questionSchema>;
export type Cost = z.output<typeof costSchema>;
export type HousingSlot = 'bedroom' | 'bathroom' | 'kitchen' | 'exterior';
export type MealSlot = 'kitchen' | 'meal_example' | 'dining_area' | 'other';

export const HOUSING_SLOTS: readonly HousingSlot[] = ['bedroom', 'bathroom', 'kitchen', 'exterior'];
export const MEAL_SLOTS: readonly MealSlot[] = ['kitchen', 'meal_example', 'dining_area', 'other'];

export type BuilderSection =
  | 'basics'
  | 'where_when'
  | 'pay'
  | 'housing'
  | 'meals'
  | 'genre_details'
  | 'job'
  | 'photos'
  | 'applying';

/** The content keys each builder section edits. */
export const SECTION_CONTENT_KEYS: Record<BuilderSection, (keyof ListingContent)[]> = {
  basics: ['basics'],
  where_when: ['where', 'when'],
  pay: ['pay'],
  housing: ['housing'],
  meals: ['meals'],
  genre_details: ['genreDetails'],
  job: ['job'],
  photos: ['photos'],
  applying: ['applying'],
};
