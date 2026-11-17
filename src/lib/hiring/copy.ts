// Exact hiring copy (SP5 spec). The name is Explore&Earn.
import type { FitFactor, HostInviteStatus, InviteDeclineReason } from './types';

export const EMPTY = {
  applicants: 'No applicants yet. Share your listing or invite candidates.',
  applicantsToday: 'No new applicants today',
  candidates: 'No candidates match these filters',
  interviews: 'No interviews scheduled',
  analytics: 'No data for this period',
  seekerInvites: 'No invites yet',
  seekerInterviews: 'No interviews yet',
};

export const APPLICATION_UNAVAILABLE = "This application isn't available";
export const INVITE_EXPIRED = 'This invite expired';
export const AS_DESCRIBED_CLOSED = 'This check has closed';
export const SEEKER_UNAVAILABLE = 'Not accepting invites right now';
export const NO_CREDITS = "You're out of invite credits";
export const FIT_UNAVAILABLE = "Fit scores aren't available for this listing";
export const FIT_NONE = '—';
export const ALL_OPENINGS_FILLED = 'All openings filled';
export const ALSO_WITHDRAW = 'Also withdraw your application?';
export const AS_DESCRIBED_THRESHOLD = "Shown after 3 responses, to protect workers' privacy";
export const NO_BOOSTS = 'No boosts in this period';

export const INVITE_STATUS_LABELS: Record<HostInviteStatus, string> = {
  sent: 'Sent',
  interested: 'Interested',
  applied: 'Applied',
  not_interested: 'Not interested',
  expired: 'Expired',
  not_delivered: 'Not delivered',
};

export const DECLINE_REASON_LABELS: Record<InviteDeclineReason, string> = {
  dates: "Dates don't work",
  location: "Location doesn't work",
  pay: 'Pay is too low',
  role: 'Not the right role',
  not_looking: 'Not looking right now',
  other: 'Other',
};

export const SOURCE_LABELS = {
  seek: 'Seek',
  swipe: 'Swipe',
  map: 'Map',
  invite: 'Invites',
  boost: 'Boost',
  landing: 'Landing pages',
  other: 'Other',
} as const;

export const RANGE_LABELS = {
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
  season: 'This season',
  all: 'All time',
} as const;

export const FACTOR_LABELS: Record<FitFactor, string> = {
  occupation: 'Occupation',
  availability: 'Availability',
  skills: 'Skills',
  certifications: 'Certifications',
  work_authorization: 'Work authorization',
  pay: 'Pay',
  location: 'Location',
};
