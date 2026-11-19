// Pure rules for the apply screen: which step opens, what the submit body contains, and how an
// API refusal is read. The component renders these; it does not decide them.
import {
  SEEKER_STATUS_LABELS,
  type ApplyContextDto,
  type MissingField,
  type SeekerStatus,
  type SubmitInput,
} from '@/lib/applications';
import type { ProfilePatch } from '@/lib/profiles/schemas';
import type { AnswerValue, Draft } from './draft';
import { isAnswered } from './draft';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApplyStep = 'details' | 'questions' | 'review';

/**
 * `invite` is sent only for an invite link with a real id (spec 8.4). Any other source drops
 * it, including a hand-edited `?source=swipe&invite=`.
 */
export function inviteIdFor(source: string, invite: string | null): string | undefined {
  if (source !== 'invite' || invite === null || !UUID.test(invite)) return undefined;
  return invite;
}

/**
 * Missing profile fields first. A required question cannot be skipped (design audit: the
 * answers step stays when the host asks one). Optional questions are answered on the review
 * step, so a returning seeker with a finished profile and no required question lands on review.
 */
export function openingStep(context: ApplyContextDto): ApplyStep {
  if (context.missingFields.length > 0) return 'details';
  if (context.questions.some((question) => question.required)) return 'questions';
  return 'review';
}

export function missingAnswers(
  questions: ApplyContextDto['questions'],
  answers: Draft['answers'],
): string[] {
  return questions
    .filter((question) => question.required && !isAnswered(question, answers[question.id]))
    .map((question) => question.id);
}

export function submitBody(i: {
  listingId: string;
  listingRevisionId: string;
  source: string;
  invite: string | null;
  questions: ApplyContextDto['questions'];
  answers: Draft['answers'];
  acknowledgeSponsorship: boolean;
}): SubmitInput {
  const inviteId = inviteIdFor(i.source, i.invite);
  return {
    listingId: i.listingId,
    listingRevisionId: i.listingRevisionId,
    answers: i.questions.map((question) => ({
      questionId: question.id,
      value: i.answers[question.id] ?? null,
    })),
    source: i.source,
    ...(inviteId ? { inviteId } : {}),
    acknowledgeSponsorship: i.acknowledgeSponsorship,
  };
}

/** The profile patch for the fields the apply context still needs. Null when nothing is filled. */
export function profilePatchFor(missing: readonly MissingField[], draft: Draft): ProfilePatch | null {
  const identity: NonNullable<ProfilePatch['identity']> = {};
  if (missing.includes('first_name') && draft.firstName.trim() !== '') {
    identity.firstName = draft.firstName.trim();
  }
  if (missing.includes('last_name') && draft.lastName.trim() !== '') {
    identity.lastName = draft.lastName.trim();
  }
  if (missing.includes('city') && draft.city.trim() !== '') identity.city = draft.city.trim();
  if (missing.includes('region') && draft.region.trim() !== '') {
    identity.region = draft.region.trim();
    identity.countryCode = 'US';
  }
  const patch: ProfilePatch = {};
  if (Object.keys(identity).length > 0) patch.identity = identity;
  if (missing.includes('work_authorization') && draft.workAuthorization !== '') {
    patch.workAuthorization =
      draft.workAuthorization === 'needs_sponsorship'
        ? { status: 'needs_sponsorship', visaTypes: ['other'] }
        : { status: 'authorized' };
  }
  return patch.identity || patch.workAuthorization ? patch : null;
}

export function detailsReady(missing: readonly MissingField[], draft: Draft): boolean {
  return missing.every((field) => {
    if (field === 'first_name') return draft.firstName.trim() !== '';
    if (field === 'last_name') return draft.lastName.trim() !== '';
    if (field === 'city') return draft.city.trim() !== '';
    if (field === 'region') return draft.region.trim() !== '';
    return draft.workAuthorization !== '';
  });
}

/** The approved frames say "Sent" where the API says applied. */
export function screenStatus(status: SeekerStatus): string {
  if (status === 'applied') return 'Sent';
  return SEEKER_STATUS_LABELS[status];
}

export function formatDay(iso: string | null): string {
  if (!iso) return 'Dates to be set';
  const day = iso.slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function answerText(value: AnswerValue | null | undefined): string {
  if (value === undefined || value === null || value === '') return 'Not answered';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'Not answered';
  return value;
}

export type ApiFailure = {
  status: number;
  code: string;
  message: string;
  reason?: string;
};

export async function readFailure(response: Response): Promise<ApiFailure> {
  let message = 'Something went wrong';
  let code = 'internal';
  let reason: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: { reason?: string } };
    };
    if (body.error?.message) message = body.error.message;
    if (body.error?.code) code = body.error.code;
    if (typeof body.error?.details?.reason === 'string') reason = body.error.details.reason;
  } catch {
    // A non-JSON body still has a status.
  }
  return { status: response.status, code, message, reason };
}
