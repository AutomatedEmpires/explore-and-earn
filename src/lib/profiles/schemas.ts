// zod input schemas for every profile and resume-import route, and the frozen snapshot schema
// (SP4 spec 4.1 and 5; plan Task 4). Client-safe: the screens validate with the same schemas.
// Months are 'YYYY-MM' and dates 'YYYY-MM-DD' at the API.
import { z } from 'zod';
import { CATEGORIES } from '@/lib/taxonomy';
import {
  AVAILABILITY_PRESETS,
  ENTRY_SECTIONS,
  IMPORT_LIMITS,
  LANGUAGE_LEVELS,
  MIN_PAY_UNITS,
  PROFILE_CAPS,
  PROFILE_LENGTHS as L,
  PROFILE_US_REGIONS,
  RESUME_MODES,
  VISA_TYPES,
} from './constants';
import type { ProfileSnapshotV1, WorkAuthorization } from './types';

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const E164 = /^\+[1-9][0-9]{7,14}$/;
const OCCUPATION_CODE = /^[a-z0-9_]{1,60}$/;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const unique = <T>(items: readonly T[]) => new Set(items).size === items.length;

export const monthSchema = z.string().regex(MONTH, 'Use YYYY-MM');
export const dateSchema = z.iso.date();
export const phoneSchema = z
  .string()
  .regex(E164, 'Use the international format, like +15415550123');

/** `https:` links only (spec 4.1). */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(L.linkUrl)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Use a link that starts with https://');

/** A region fits its country: a USPS code (50 states and DC) in the US, else free text. */
export function regionFits(countryCode: string, region: string | null): boolean {
  if (region === null) return true;
  return countryCode === 'US' ? PROFILE_US_REGIONS.includes(region) : region.length <= L.region;
}

/** One route param `id`, for routes on a single profile, import or application row. */
export const idParamSchema = z.object({ id: z.uuid() });

// --- Profile fields ----------------------------------------------------------------------------

export const workAuthorizationSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('authorized') }),
  z.object({
    status: z.literal('needs_sponsorship'),
    visaTypes: z.array(z.enum(VISA_TYPES)).min(1).max(4).refine(unique, 'List each visa once'),
  }),
  z.object({ status: z.literal('has_visa'), visaType: z.enum(VISA_TYPES), endsOn: dateSchema }),
]) satisfies z.ZodType<WorkAuthorization>;

export const languagesSchema = z
  .array(z.object({ language: text(1, L.language), level: z.enum(LANGUAGE_LEVELS) }))
  .max(PROFILE_CAPS.languages);

export const portfolioLinksSchema = z
  .array(z.object({ label: text(1, L.linkLabel), url: httpsUrlSchema }))
  .max(PROFILE_CAPS.portfolioLinks);

const identityPatchSchema = z
  .object({
    firstName: text(0, L.firstName),
    lastName: text(0, L.lastName),
    headline: text(0, L.headline),
    bio: text(0, L.bio),
    city: text(0, L.city),
    region: z.string().trim().min(1).max(L.region).nullable(),
    countryCode: z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code'),
    phone: phoneSchema.nullable(),
    avatarMediaId: z.uuid().nullable(),
    coverMediaId: z.uuid().nullable(),
  })
  .partial()
  .superRefine((v, ctx) => {
    // When the patch names both, they must fit; otherwise the stored country decides (W1).
    if (
      v.countryCode !== undefined &&
      v.region !== undefined &&
      !regionFits(v.countryCode, v.region)
    ) {
      ctx.addIssue({ code: 'custom', path: ['region'], message: 'Use a US state code' });
    }
  });

const preferencesPatchSchema = z
  .object({
    categories: z.array(z.enum(CATEGORIES)).max(CATEGORIES.length).refine(unique),
    occupations: z
      .array(z.string().regex(OCCUPATION_CODE))
      .max(PROFILE_CAPS.prefOccupations)
      .refine(unique),
    states: z
      .array(z.string().refine((s) => PROFILE_US_REGIONS.includes(s), 'Use a US state code'))
      .max(PROFILE_US_REGIONS.length)
      .refine(unique),
    minPay: z
      .object({ cents: z.number().int().positive(), unit: z.enum(MIN_PAY_UNITS) })
      .nullable(),
    housing: z.boolean(),
    meals: z.boolean(),
    willingToRelocate: z.boolean(),
  })
  .partial();

/** PATCH /me/profile: any of these sections (spec 5). */
export const profilePatchSchema = z
  .object({
    identity: identityPatchSchema.optional(),
    preferences: preferencesPatchSchema.optional(),
    workAuthorization: workAuthorizationSchema.nullable().optional(),
    visibility: z
      .object({ visibleToHosts: z.boolean(), showPhotoToHosts: z.boolean() })
      .partial()
      .optional(),
    // FD-2: the seeker picks a generated template; an uploaded file can't be the resume.
    resume: z.strictObject({ mode: z.enum(RESUME_MODES) }).optional(),
    languages: languagesSchema.optional(),
    portfolioLinks: portfolioLinksSchema.optional(),
  })
  .refine(
    (v) => Object.values(v).some((section) => section !== undefined),
    'Change at least one field',
  );

export type ProfilePatch = z.output<typeof profilePatchSchema>;

// --- Availability ------------------------------------------------------------------------------

/** PUT /me/availability. Beyond and Exact need a date (spec 8.2). */
export const availabilityInputSchema = z
  .object({
    preset: z.enum(AVAILABILITY_PRESETS),
    date: dateSchema.optional(),
    clientToday: dateSchema,
  })
  .superRefine((v, ctx) => {
    if ((v.preset === 'beyond' || v.preset === 'exact') && v.date === undefined) {
      ctx.addIssue({ code: 'custom', path: ['date'], message: 'Pick a date' });
    }
  });

/** POST /me/availability/confirm. */
export const confirmAvailabilitySchema = z.object({ clientToday: dateSchema });

// --- Entries and skills ------------------------------------------------------------------------

const experienceShape = {
  employer: text(1, L.employer),
  title: text(1, L.title),
  location: text(0, L.location),
  startMonth: monthSchema,
  endMonth: monthSchema.nullable(),
  isCurrent: z.boolean(),
  description: text(0, L.description),
};
const educationShape = {
  school: text(1, L.school),
  program: text(0, L.program),
  startMonth: monthSchema.nullable(),
  endMonth: monthSchema.nullable(),
};
const certificationShape = {
  name: text(1, L.certificationName),
  issuer: text(0, L.certificationIssuer),
  issuedOn: dateSchema.nullable(),
  expiresOn: dateSchema.nullable(),
};

type Dated = {
  isCurrent?: boolean;
  startMonth?: string | null;
  endMonth?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
};

/** The cross-field rules the entry CHECKs also hold (spec 4.1). Strings compare as dates. */
function checkDates(v: Dated, ctx: z.RefinementCtx): void {
  if (v.isCurrent === true && v.endMonth) {
    ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'A current job has no end month' });
  }
  if (v.startMonth && v.endMonth && v.endMonth < v.startMonth) {
    ctx.addIssue({ code: 'custom', path: ['endMonth'], message: 'End after the start' });
  }
  if (v.issuedOn && v.expiresOn && v.expiresOn < v.issuedOn) {
    ctx.addIssue({ code: 'custom', path: ['expiresOn'], message: 'Expire after the issue date' });
  }
}

/** An experience entry's fields, as addEntry and the import merge take them. */
export const experienceFieldsSchema = z
  .object({
    ...experienceShape,
    location: experienceShape.location.default(''),
    endMonth: experienceShape.endMonth.default(null),
    isCurrent: experienceShape.isCurrent.default(false),
    description: experienceShape.description.default(''),
  })
  .superRefine(checkDates);

export const educationFieldsSchema = z
  .object({
    ...educationShape,
    program: educationShape.program.default(''),
    startMonth: educationShape.startMonth.default(null),
    endMonth: educationShape.endMonth.default(null),
  })
  .superRefine(checkDates);

export const certificationFieldsSchema = z
  .object({
    ...certificationShape,
    issuer: certificationShape.issuer.default(''),
    issuedOn: certificationShape.issuedOn.default(null),
    expiresOn: certificationShape.expiresOn.default(null),
  })
  .superRefine(checkDates);

/** POST /me/profile/[section]: the entry's fields, by the `section` route param. */
export const entryCreateSchema = z.discriminatedUnion('section', [
  z
    .object({ section: z.literal('experience'), ...experienceFieldsSchema.shape })
    .superRefine(checkDates),
  z
    .object({ section: z.literal('education'), ...educationFieldsSchema.shape })
    .superRefine(checkDates),
  z
    .object({ section: z.literal('certifications'), ...certificationFieldsSchema.shape })
    .superRefine(checkDates),
]);

/** PATCH /me/profile/[section]/[id]: any of the entry's fields. */
export const entryUpdateSchema = z.discriminatedUnion('section', [
  z
    .object({
      section: z.literal('experience'),
      id: z.uuid(),
      ...z.object(experienceShape).partial().shape,
    })
    .superRefine(checkDates),
  z
    .object({
      section: z.literal('education'),
      id: z.uuid(),
      ...z.object(educationShape).partial().shape,
    })
    .superRefine(checkDates),
  z
    .object({
      section: z.literal('certifications'),
      id: z.uuid(),
      ...z.object(certificationShape).partial().shape,
    })
    .superRefine(checkDates),
]);

/** DELETE /me/profile/[section]/[id]. */
export const entryParamsSchema = z.object({ section: z.enum(ENTRY_SECTIONS), id: z.uuid() });

/** PUT /me/profile/[section]/order: exactly the seeker's ids, in the new order. */
export const reorderSchema = z.object({
  section: z.enum(ENTRY_SECTIONS),
  ids: z.array(z.uuid()).max(PROFILE_CAPS.experience).refine(unique, 'List each entry once'),
});

/** PUT /me/profile/skills: in rank order, at most 15 highlighted. */
export const skillsSchema = z.object({
  skills: z
    .array(z.object({ label: text(1, L.skillLabel), highlighted: z.boolean() }))
    .max(PROFILE_CAPS.skills)
    .refine(
      (skills) => skills.filter((s) => s.highlighted).length <= PROFILE_CAPS.highlighted,
      `Highlight at most ${PROFILE_CAPS.highlighted} skills`,
    ),
});

// --- Resume, import and writing help -----------------------------------------------------------

/** GET /me/resume.pdf?template=classic|compact. */
export const resumeTemplateQuerySchema = z.object({
  template: z.enum(['classic', 'compact']).default('classic'),
});

/** POST /me/resume-imports. */
export const createImportSchema = z.object({
  mediaId: z.uuid(),
  consentVersion: z.literal(IMPORT_LIMITS.consentVersion),
});

const IDENTITY_FIELDS = [
  'firstName',
  'lastName',
  'headline',
  'bio',
  'city',
  'region',
  'phone',
] as const;
const ITEM_KEY = /^(exp|edu|skill|cert|lang|link)_[0-9]{1,3}$/;

export const mergeDecisionsSchema = z.object({
  identity: z.partialRecord(z.enum(IDENTITY_FIELDS), z.enum(['replace', 'keep'])),
  items: z.record(
    z.string().regex(ITEM_KEY),
    z.discriminatedUnion('action', [
      z.object({ action: z.literal('add'), edit: z.record(z.string(), z.unknown()).optional() }),
      z.object({ action: z.literal('ignore') }),
    ]),
  ),
});

/**
 * POST /me/resume-imports/[id]/merge. Spec 8.6's `useAsResume` is gone: under FD-2 the source
 * file is an import source only and is never kept as the seeker's resume.
 */
export const mergeImportSchema = z.object({ id: z.uuid(), decisions: mergeDecisionsSchema });

/** POST /me/writing-help. An experience description names its entry. */
export const writingHelpSchema = z
  .object({
    field: z.enum(['headline', 'bio', 'experience']),
    experienceId: z.uuid().optional(),
    text: z.string().max(L.bio),
    action: z.enum(['draft', 'improve', 'shorten', 'fix']),
  })
  .superRefine((v, ctx) => {
    if (v.field === 'experience' && v.experienceId === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['experienceId'],
        message: 'Name the experience entry',
      });
    }
  });

// --- The frozen snapshot -----------------------------------------------------------------------

/** Mirrors ProfileSnapshotV1 exactly: an extra or missing key fails. */
export const profileSnapshotV1Schema = z.strictObject({
  firstName: z.string().max(L.firstName),
  lastName: z.string().max(L.lastName),
  email: z.string(),
  phone: z.string().nullable(),
  city: z.string().max(L.city),
  region: z.string().nullable(),
  countryCode: z.string().length(2),
  headline: z.string().max(L.headline),
  bio: z.string().max(L.bio),
  avatarMediaId: z.uuid().nullable(),
  coverMediaId: z.uuid().nullable(),
  availability: z
    .strictObject({ date: dateSchema, confirmedAt: z.iso.datetime({ offset: true }) })
    .nullable(),
  workAuthorization: workAuthorizationSchema.nullable(),
  experience: z
    .array(
      z.strictObject({
        employer: z.string(),
        title: z.string(),
        location: z.string(),
        startMonth: monthSchema,
        endMonth: monthSchema.nullable(),
        isCurrent: z.boolean(),
        description: z.string(),
      }),
    )
    .max(PROFILE_CAPS.experience),
  education: z
    .array(
      z.strictObject({
        school: z.string(),
        program: z.string(),
        startMonth: monthSchema.nullable(),
        endMonth: monthSchema.nullable(),
      }),
    )
    .max(PROFILE_CAPS.education),
  skills: z
    .array(z.strictObject({ label: z.string(), highlighted: z.boolean() }))
    .max(PROFILE_CAPS.skills),
  certifications: z
    .array(
      z.strictObject({
        name: z.string(),
        issuer: z.string(),
        issuedOn: dateSchema.nullable(),
        expiresOn: dateSchema.nullable(),
      }),
    )
    .max(PROFILE_CAPS.certifications),
  languages: z
    .array(z.strictObject({ language: z.string(), level: z.enum(LANGUAGE_LEVELS) }))
    .max(PROFILE_CAPS.languages),
  portfolioLinks: z
    .array(z.strictObject({ label: z.string(), url: httpsUrlSchema }))
    .max(PROFILE_CAPS.portfolioLinks),
}) satisfies z.ZodType<ProfileSnapshotV1>;
