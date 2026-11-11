// Safety limits and code lists (SP4 spec 4.4, 8.1 and 8.7; plan Task 4). Client-safe.
import type { ReportSubjectType, SafetyReportReason } from './types';

export const REPORT_SUBJECT_TYPES = [
  'listing',
  'org',
  'seeker_profile',
  'message',
  'thread',
  'community_post',
  'announcement',
] as const satisfies readonly ReportSubjectType[];

export const SAFETY_REPORT_REASONS = [
  'scam',
  'asks_for_money',
  'discrimination',
  'harassment',
  'not_as_described',
  'inappropriate',
  'spam',
  'child_safety',
  'other',
] as const satisfies readonly SafetyReportReason[];

export const PARTY_TYPES = ['user', 'org'] as const;

export const SAFETY_LIMITS = {
  reportsPerDay: 20,
  /** A repeat by the same reporter on the same subject within this returns the first report. */
  repeatWindowHours: 24,
  /** Reports from this many distinct reporters within the window raise the priority. */
  escalateReporters: 3,
  escalateWindowDays: 7,
  escalatedPriority: 50,
  /** Raises Foundation's critical alert. */
  childSafetyPriority: 1000,
  detailsMax: 1000,
  /** The review item's reason quotes at most this much of the details. */
  reasonExcerpt: 500,
} as const;
