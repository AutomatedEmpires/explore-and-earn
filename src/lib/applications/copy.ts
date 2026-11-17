// Application copy the spec quotes (SP4 spec 7 and 8.4) and the labels around it. Client-safe.
import type { SeekerStatus, WithdrawReason } from './types';

/** Submitting needs the seeker's acknowledgement when the host doesn't sponsor visas. */
export const SPONSORSHIP_PROMPT = "This host doesn't sponsor visas. Apply anyway?";

/** The listing changed between the review step and Submit (409 `listing_changed`). */
export const LISTING_CHANGED_PROMPT =
  'This listing changed while you were applying. Review the changes before you submit.';

/** 403 `you_blocked`. */
export function youBlocked(org: string): string {
  return `You blocked ${org}. Unblock to apply.`;
}

/** 403 `unavailable`: the host blocked the seeker. The seeker is never told it was a block. */
export const UNAVAILABLE = "You can't apply to this host's listings.";

/** The apply page for a host account. */
export const HOSTS_CANT_APPLY = "Hosts can't apply. Sign in with a seeker account.";

/** The receipt's Additional step checkbox. */
export const ADDITIONAL_STEP_DONE = "I completed the employer's form";

/** How each status reads to the seeker (spec 8.5). */
export const SEEKER_STATUS_LABELS: Record<SeekerStatus, string> = {
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  hired: 'Hired',
  not_selected: 'Not selected',
  withdrawn: 'Withdrawn',
  offer_declined: 'Offer declined',
};

/** The withdraw dialog's reason Select (engineering decision). */
export const WITHDRAW_REASON_LABELS: Record<WithdrawReason, string> = {
  took_another_job: 'I took another job',
  dates_changed: 'My dates changed',
  not_interested: "I'm no longer interested",
  other: 'Other',
};
