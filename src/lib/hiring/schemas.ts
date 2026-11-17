// Hiring request schemas (zod 4). Path ids live in the param schemas and are merged with
// safeExtend so a body's refinements survive. Limits count code points.
import { z } from 'zod';
import { APPLICATION_STATUSES } from '@/lib/applications';
import { INTERVIEWS, OFFERS, POOL } from './constants';
import { idParamSchema } from '@/lib/messaging/schemas';

const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/;

function textMax(n: number) {
  return z
    .string()
    .trim()
    .refine((s) => [...s].length <= n, { message: `At most ${n} characters` })
    .refine((s) => !CONTROL.test(s), { message: 'Remove control characters' });
}

const instant = z.iso.datetime({ offset: true });
const declineReasons = ['dates', 'location', 'pay', 'role', 'not_looking', 'other'] as const;
const payUnits = ['hour', 'day', 'week', 'month', 'season', 'year', 'crew_share'] as const;
const answers = ['yes', 'partly', 'no'] as const;

export { idParamSchema };

export const applicationParamSchema = z.object({ applicationId: z.uuid() });
export const candidateParamSchema = z.object({ candidateId: z.uuid() });

export const homeQuerySchema = z.object({ tz: z.string().min(1) });

export const applicantsQuerySchema = z.object({
  listingId: z.uuid().optional(),
  status: z.array(z.enum(APPLICATION_STATUSES)).optional(),
  sort: z.enum(['newest', 'oldest', 'fit', 'activity']).default('newest'),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(25),
});

export const shortlistSchema = z.object({ on: z.boolean() });

const slot = z.object({ start: instant });

export const interviewProposalSchema = z
  .object({
    slots: z.array(slot).min(1).max(5),
    durationMinutes: z
      .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)])
      .default(30),
    timezone: z.string().min(1).optional(),
    format: z.enum(['video', 'phone', 'in_person']),
    videoUrl: z.string().optional(),
    phoneNote: textMax(INTERVIEWS.phoneNoteMax).optional(),
    address: textMax(INTERVIEWS.addressMax).optional(),
    note: textMax(INTERVIEWS.noteMax).optional(),
    expiryHours: z.union([z.literal(48), z.literal(72)]).default(72),
  })
  .superRefine((value, ctx) => {
    if (value.format === 'video' && !value.videoUrl?.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: ['videoUrl'], message: 'Use an https link' });
    }
    if (value.format === 'in_person' && !value.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Add an address' });
    }
  });

export const newRoundSchema = z.object({
  slots: z.array(slot).min(1).max(5),
  durationMinutes: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60), z.literal(90)]).default(30),
  timezone: z.string().min(1).optional(),
  expiryHours: z.union([z.literal(48), z.literal(72)]).default(72),
});

export const cancelInterviewSchema = z.object({
  reason: textMax(INTERVIEWS.cancelReasonMax).optional(),
});

export const outcomeSchema = z.object({ outcome: z.enum(['completed', 'no_show']) });

const offerPay = z
  .object({
    amountCents: z.number().int().min(0),
    maxCents: z.number().int().min(0).optional(),
    unit: z.enum(payUnits),
  })
  .refine((pay) => pay.maxCents === undefined || pay.maxCents >= pay.amountCents, {
    path: ['maxCents'],
    message: 'The top of the range must be at least the amount',
  });

export const offerInputSchema = z.object({
  position: textMax(OFFERS.positionMax).optional(),
  startDate: z.iso.date(),
  pay: offerPay,
  note: textMax(OFFERS.noteMax).optional(),
  letterMediaId: z.uuid().optional(),
});

export const candidatesQuerySchema = z.object({
  state: z.string().length(2).optional(),
  availableBy: z.iso.date().optional(),
  skills: z.array(z.string()).max(POOL.maxSkillFilters).optional(),
  view: z.enum(['all', 'saved', 'hidden']).default('all'),
  cursor: z.string().optional(),
});

export const sendInviteSchema = z.object({
  candidateId: z.uuid(),
  note: textMax(300).optional(),
});

export const hostInvitesQuerySchema = z.object({
  listingId: z.uuid().optional(),
  status: z.enum(['sent', 'interested', 'applied', 'not_interested', 'expired']).optional(),
  cursor: z.string().optional(),
});

export const hostInterviewsQuerySchema = z.object({
  from: instant,
  to: instant,
  listingId: z.uuid().optional(),
  needsAction: z.boolean().optional(),
});

export const inviteResponseSchema = z
  .object({
    response: z.enum(['interested', 'not_interested']),
    reason: z.enum(declineReasons).optional(),
  })
  .refine((value) => value.reason === undefined || value.response === 'not_interested', {
    path: ['reason'],
    message: 'A reason only goes with not interested',
  });

export const pickSlotSchema = z.object({ slotId: z.uuid(), round: z.number().int().min(1) });

const windowSchema = z
  .object({ start: instant, end: instant })
  .refine((w) => new Date(w.end).getTime() - new Date(w.start).getTime() >= 30 * 60_000, {
    message: 'Each window is at least 30 minutes',
  });

export const requestTimesSchema = z.object({
  windows: z.array(windowSchema).min(1).max(INTERVIEWS.maxWindows),
  note: textMax(INTERVIEWS.requestNoteMax).optional(),
});

export const declineInterviewSchema = z.object({ alsoWithdraw: z.boolean() });

export const asDescribedSubmitSchema = z.object({
  workedHere: z.boolean().optional(),
  housing: z.enum(answers).optional(),
  meals: z.enum(answers).optional(),
  pay: z.enum(answers),
});

export const cursorQuerySchema = z.object({ cursor: z.string().optional() });

export type ApplicantsQuery = z.infer<typeof applicantsQuerySchema>;
export type CandidatesQuery = z.infer<typeof candidatesQuerySchema>;
export type HostInterviewsQuery = z.infer<typeof hostInterviewsQuerySchema>;
export type InviteResponse = z.infer<typeof inviteResponseSchema>;
export type NewRound = z.infer<typeof newRoundSchema>;
export type RequestTimes = z.infer<typeof requestTimesSchema>;
export type AsDescribedSubmit = z.infer<typeof asDescribedSubmitSchema>;
