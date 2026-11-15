// Application limits and code lists (SP4 spec 4.3 and 8.1; plan Task 4). Client-safe.
import { DISCOVERY_SOURCES } from '@/lib/discovery/types';
import type {
  ApplicationSource,
  ApplicationStatus,
  ApplicationView,
  SeekerStatus,
  WithdrawReason,
} from './types';

export const APPLICATION_STATUSES = [
  'new',
  'shortlisted',
  'interviewing',
  'offered',
  'hired',
  'not_selected',
  'withdrawn',
  'offer_declined',
] as const satisfies readonly ApplicationStatus[];

/** No move leaves these (spec 8.5). */
export const TERMINAL_STATUSES = [
  'hired',
  'not_selected',
  'withdrawn',
] as const satisfies readonly ApplicationStatus[];

export const SEEKER_STATUSES = [
  'applied',
  'interviewing',
  'offer',
  'hired',
  'not_selected',
  'withdrawn',
  'offer_declined',
] as const satisfies readonly SeekerStatus[];

/** Where an application came from; anything else is stored as `other` (spec 8.4). */
export const APPLICATION_SOURCES: readonly ApplicationSource[] = DISCOVERY_SOURCES;

export const APPLICATION_VIEWS = [
  'applied',
  'interviews',
  'offers',
] as const satisfies readonly ApplicationView[];

export const WITHDRAW_REASONS = [
  'took_another_job',
  'dates_changed',
  'not_interested',
  'other',
] as const satisfies readonly WithdrawReason[];

export const APPLICATION_LIMITS = {
  perDay: 30,
  shortAnswerMax: 1000,
  maxQuestions: 10,
  snapshotMaxBytes: 262_144,
  signedUrlSeconds: 300,
  pageSize: 20,
} as const;

/** A withdraw note, and a host's internal event note (spec 4.3). */
export const NOTE_MAX = 500;
