// Copy for the safety UI (SP4 spec 7 and 8.7; plan Tasks 33 and 34). Client-safe. Every line
// says only what the safety routes do (PR 205): a block or a report never tells the other side,
// and a mute only stops invites and the follow.
import type { ReportSubjectType } from '@/lib/safety';

/** The sheet's title and the /report page heading, per subject. */
export const REPORT_TITLES: Record<ReportSubjectType, string> = {
  listing: 'Report this job',
  org: 'Report this host',
  seeker_profile: 'Report this applicant',
  message: 'Report this message',
  thread: 'Report this conversation',
  community_post: 'Report this post',
  announcement: 'Report this announcement',
};

/** Above the reasons: the reported party never learns who reported or why. */
export const REPORT_PRIVACY = 'Reports are private. We never tell anyone who reported them or why.';

export const REPORT_REASON_LEGEND = "What's wrong?";
export const REPORT_DETAILS_LABEL = 'Details (optional)';
export const REPORT_SUBMIT = 'Send report';

/** 429 from POST /reports (plan Task 33). */
export const REPORT_RATE_LIMITED = "You've sent a lot of reports today. Try again tomorrow.";
export const REPORT_FAILED = "We couldn't send your report. Check your connection and try again.";
export const REPORT_NOT_FOUND = "We couldn't find what you're reporting. It may have been removed.";
export const REPORT_SIGN_IN = 'Sign in to send a report.';

/** /report with a missing or unreadable `subject`. */
export const REPORT_BAD_SUBJECT = "We couldn't tell what you want to report";
export const REPORT_BAD_SUBJECT_HINT =
  'Go back and use Report on the job, host or message you want to tell us about.';

/** "{chars} of 1000". */
export function detailsCounter(length: number, max: number): string {
  return `${length} of ${max}`;
}

// --- BlockDialog -----------------------------------------------------------------------------

export function blockTitle(name: string): string {
  return `Block ${name}?`;
}

/** A seeker blocking a host: what changes, and that the host isn't told. */
export function seekerBlocksOrg(name: string): string {
  return `You won't see ${name}'s jobs. You can't message each other, ${name} can't invite you, and you stop following them. ${name} isn't told.`;
}

/** A seeker blocking a person (Community). */
export function seekerBlocksUser(name: string): string {
  return `You won't hear from ${name}. ${name} isn't told.`;
}

/** Under "Also withdraw my applications to this host": nothing is withdrawn unless ticked. */
export const WITHDRAW_HINT = 'If you leave this off, your applications stay open.';

/** A host blocking an applicant. Never says the applicant is told. */
export function hostBlocksSeeker(firstName: string): string {
  return `${firstName} can't apply to your jobs or message your team, and your conversation with ${firstName} closes. ${firstName} isn't told.`;
}

export const BLOCK_CONFIRM = 'Block';
export const BLOCK_CANCEL = 'Cancel';

export function blockFailed(name: string): string {
  return `We couldn't block ${name}. Try again.`;
}

/** Host 403 `role_not_allowed`: billing members can't block. */
export const BLOCK_ROLE_NOT_ALLOWED = 'Only owners, admins and recruiters can block applicants.';

/** Host 404: the application is gone or out of reach. Says nothing about why. */
export const BLOCK_APPLICATION_UNAVAILABLE = "This application isn't available.";

// --- MuteToggle ------------------------------------------------------------------------------

export function muteLabel(orgName: string): string {
  return `Mute ${orgName}`;
}

/** What a mute does and doesn't do (spec 8.7). */
export function muteDescription(orgName: string): string {
  return `${orgName} can't invite you, and you stop following them. You still see their jobs and can apply.`;
}

export const MUTE_FAILED = "We couldn't change this. Try again.";
