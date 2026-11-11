// Profile limits and code lists (SP4 spec 4.1, 8.1 and 8.2; plan Task 4). Client-safe. The
// database CHECKs in drizzle/3000_profiles.sql enforce the same numbers.
import { US_STATE_CODES } from '@/lib/us-states';
import type {
  AvailabilityPreset,
  EntrySection,
  ResumeMode,
  ResumeTemplate,
  VisaType,
} from './types';

export const AVAILABILITY_PRESETS = [
  'now',
  '1_month',
  '3_months',
  'beyond',
  'exact',
] as const satisfies readonly AvailabilityPreset[];

export const VISA_TYPES = ['j1', 'h2a', 'h2b', 'other'] as const satisfies readonly VisaType[];

export const WORK_AUTH_STATUSES = ['authorized', 'needs_sponsorship', 'has_visa'] as const;

export const LANGUAGE_LEVELS = ['basic', 'conversational', 'fluent', 'native'] as const;

export const ENTRY_SECTIONS = [
  'experience',
  'education',
  'certifications',
] as const satisfies readonly EntrySection[];

/** FD-2: generated templates only (no upload mode). */
export const RESUME_MODES = ['classic', 'compact'] as const satisfies readonly ResumeMode[];

export const RESUME_TEMPLATES = [
  'classic@1',
  'compact@1',
] as const satisfies readonly ResumeTemplate[];

export const MIN_PAY_UNITS = ['hour', 'day', 'year'] as const;

/** A profile's region when its country is US: a USPS code for the 50 states or DC (spec 4.1). */
export const PROFILE_US_REGIONS: readonly string[] = US_STATE_CODES.filter(
  (code) => !['PR', 'VI', 'GU', 'AS', 'MP'].includes(code),
);

/** How many of each a profile holds. */
export const PROFILE_CAPS = {
  experience: 30,
  education: 20,
  skills: 60,
  highlighted: 15,
  certifications: 30,
  languages: 15,
  portfolioLinks: 5,
  prefOccupations: 10,
} as const;

/** Text lengths in characters (spec 4.1). */
export const PROFILE_LENGTHS = {
  firstName: 50,
  lastName: 50,
  headline: 120,
  bio: 2000,
  city: 80,
  /** A free-text region outside the US. */
  region: 80,
  employer: 100,
  title: 100,
  location: 100,
  description: 2000,
  school: 120,
  program: 120,
  skillLabel: 60,
  certificationName: 100,
  certificationIssuer: 100,
  language: 60,
  linkLabel: 60,
  linkUrl: 2000,
} as const;

/** Availability rules (spec 8.2). */
export const AVAILABILITY_RULES = {
  /** Exact and Beyond dates go up to clientToday + 2 years. */
  maxYearsAhead: 2,
  /** Beyond is a date after clientToday + 3 months. */
  beyondMinMonths: 3,
  /** clientToday may differ from the server's UTC date by at most this. */
  clientTodaySkewDays: 1,
  /** The sweep's reminders, by days since the last confirmation. */
  remindAtDays: [30, 60],
  /** Then the availability is stale and the seeker leaves pools. */
  staleAtDays: 90,
} as const;

/** AI resume import (spec 8.1 and 8.6). */
export const IMPORT_LIMITS = {
  maxBytes: 10_485_760,
  maxPages: 10,
  perDay: 5,
  expiresDays: 30,
  scanPollSeconds: 5,
  maxScanPolls: 60,
  timeoutMs: 60_000,
  maxTokens: 8_000,
  consentVersion: 'resume_import@1',
} as const;

/** Writing help (spec 8.1 and 8.6). */
export const WRITING_HELP_LIMITS = { perDay: 30, maxSuggestions: 3, timeoutMs: 20_000 } as const;
