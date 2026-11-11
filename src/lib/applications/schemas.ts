// zod input schemas for every application route, and the frozen application snapshot (SP4 spec
// 4.3 and 5; plan Task 4). Client-safe.
import { z } from 'zod';
import { dateSchema, idParamSchema, profileSnapshotV1Schema } from '@/lib/profiles/schemas';
import { APPLICATION_LIMITS, APPLICATION_VIEWS, NOTE_MAX, WITHDRAW_REASONS } from './constants';
import type { ApplicationSnapshotV1 } from './types';

export { idParamSchema };

const QUESTION_ID = /^[A-Za-z0-9_-]{1,40}$/;

/** GET /apply/[listingId]/context. */
export const listingIdParamSchema = z.object({ listingId: z.uuid() });

/** One screening answer. Its type is checked against the question when the application is sent. */
export const answerValueSchema = z.union([
  z.string().max(APPLICATION_LIMITS.shortAnswerMax),
  z.boolean(),
  z.array(z.string().max(APPLICATION_LIMITS.shortAnswerMax)).max(10),
  z.null(),
]);

/**
 * POST /applications. `source` is any short string: a value outside DiscoverySource is stored as
 * `other` (spec 8.4), so an old or hand-edited link still applies.
 */
export const submitApplicationSchema = z.object({
  listingId: z.uuid(),
  listingRevisionId: z.uuid(),
  answers: z
    .array(z.object({ questionId: z.string().regex(QUESTION_ID), value: answerValueSchema }))
    .max(APPLICATION_LIMITS.maxQuestions),
  source: z.string().trim().max(40).default('other'),
  inviteId: z.uuid().optional(),
  acknowledgeSponsorship: z.boolean().default(false),
});

/** GET /me/applications?view=applied|interviews|offers&before=. */
export const myApplicationsQuerySchema = z.object({
  view: z.enum(APPLICATION_VIEWS).default('applied'),
  /** The `nextBefore` cursor of the previous page. */
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** POST /me/applications/[id]/withdraw. */
export const withdrawSchema = z.object({
  id: z.uuid(),
  reason: z.enum(WITHDRAW_REASONS).optional(),
  note: z.string().trim().max(NOTE_MAX).optional(),
});

/** PUT /me/applications/[id]/additional-step. */
export const additionalStepSchema = z.object({ id: z.uuid(), completed: z.boolean() });

/** Mirrors ApplicationSnapshotV1 exactly: an extra or missing key fails. */
export const applicationSnapshotV1Schema = z.strictObject({
  v: z.literal(1),
  listing: z.strictObject({
    id: z.uuid(),
    revisionId: z.uuid(),
    title: z.string(),
    orgId: z.uuid(),
    orgName: z.string(),
    orgLogoMediaId: z.uuid().nullable(),
    locationLabel: z.string(),
    startDate: dateSchema.nullable(),
    endDate: dateSchema.nullable(),
    visaSponsorship: z.enum(['none', 'j1', 'h2a', 'h2b']),
    additionalStep: z.strictObject({ note: z.string(), url: z.string() }).nullable(),
  }),
  profile: profileSnapshotV1Schema,
  answers: z
    .array(
      z.strictObject({
        questionId: z.string().regex(QUESTION_ID),
        prompt: z.string(),
        type: z.enum(['short_answer', 'yes_no', 'multiple_choice']),
        required: z.boolean(),
        value: answerValueSchema,
      }),
    )
    .max(APPLICATION_LIMITS.maxQuestions),
  // FD-2: a generated template only; no uploaded file reaches an employer.
  resume: z.strictObject({
    mode: z.enum(['classic', 'compact']),
    template: z.enum(['classic@1', 'compact@1']),
  }),
  sponsorshipMismatchAcknowledged: z.boolean(),
}) satisfies z.ZodType<ApplicationSnapshotV1>;
