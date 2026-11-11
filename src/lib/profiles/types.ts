// The profiles contract types (SP4 spec 3.1, plan Task 4), shared by @/modules/profiles and
// client code. Client-safe: type-only imports.
import type { Category } from '@/modules/listings';

// --- Spec 3.1 ----------------------------------------------------------------------------------

export type AvailabilityPreset = 'now' | '1_month' | '3_months' | 'beyond' | 'exact';
export type VisaType = 'j1' | 'h2a' | 'h2b' | 'other';
export type WorkAuthorization =
  | { status: 'authorized' }
  | { status: 'needs_sponsorship'; visaTypes: VisaType[] } // 1-4
  | { status: 'has_visa'; visaType: VisaType; endsOn: string }; // YYYY-MM-DD
export type MissingItem =
  'name' | 'location' | 'availability' | 'availability_stale' | 'category' | 'work_authorization';
export type ProfileSnapshotV1 = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  city: string;
  region: string | null;
  countryCode: string;
  headline: string;
  bio: string;
  /** Only when "Show my photo to hosts" is on. */
  avatarMediaId: string | null;
  coverMediaId: string | null;
  availability: { date: string; confirmedAt: string } | null;
  /** null outside applications. */
  workAuthorization: WorkAuthorization | null;
  experience: {
    employer: string;
    title: string;
    location: string;
    startMonth: string;
    endMonth: string | null;
    isCurrent: boolean;
    description: string;
  }[];
  education: {
    school: string;
    program: string;
    startMonth: string | null;
    endMonth: string | null;
  }[];
  /** Highlighted first, by rank. */
  skills: { label: string; highlighted: boolean }[];
  certifications: {
    name: string;
    issuer: string;
    issuedOn: string | null;
    expiresOn: string | null;
  }[];
  languages: { language: string; level: 'basic' | 'conversational' | 'fluent' | 'native' }[];
  portfolioLinks: { label: string; url: string }[];
};
export type PoolCard = {
  seekerUserId: string;
  firstName: string;
  lastInitial: string;
  city: string;
  region: string | null;
  countryCode: string;
  availabilityDate: string;
  skills: { label: string; highlighted: boolean }[];
  avatarMediaId: string | null;
  coverMediaId: string | null;
  categories: Category[];
};
/** In the interested stage `profile.workAuthorization` is null. */
export type CandidateCard =
  | { stage: 'pool'; card: PoolCard }
  | { stage: 'interested'; card: PoolCard; profile: ProfileSnapshotV1 };
export type FitInputs = {
  seekerUserId: string;
  categories: Category[];
  occupationCodes: string[];
  availabilityDate: string | null;
  /** normalizeSkill().key */
  skillKeys: string[];
  certifications: { key: string; expiresOn: string | null }[];
  workAuthorization: WorkAuthorization | null;
  minPay: { cents: number; unit: 'hour' | 'day' | 'year' } | null;
  willingToRelocate: boolean;
  preferredStates: string[];
  region: string | null;
  countryCode: string;
};
export type PoolListing = {
  listingId: string;
  orgId: string;
  categories: Category[];
  occupationCode: string;
  sponsorsVisa: boolean;
};

// --- Plan Task 4 additions ---------------------------------------------------------------------

export type Month = string; // 'YYYY-MM'
export type EntrySection = 'experience' | 'education' | 'certifications';
export type Provenance = 'manual' | 'import';
export type ExperienceEntry = {
  id: string;
  employer: string;
  title: string;
  location: string;
  startMonth: Month;
  endMonth: Month | null;
  isCurrent: boolean;
  description: string;
  provenance: Provenance;
};
export type EducationEntry = {
  id: string;
  school: string;
  program: string;
  startMonth: Month | null;
  endMonth: Month | null;
  provenance: Provenance;
};
export type CertificationEntry = {
  id: string;
  name: string;
  issuer: string;
  issuedOn: string | null;
  expiresOn: string | null;
  provenance: Provenance;
};
/** Array order is display and rank order. */
export type Skill = { id: string; label: string; key: string; highlighted: boolean };
export type Preferences = {
  categories: Category[];
  occupations: string[];
  states: string[];
  minPay: { cents: number; unit: 'hour' | 'day' | 'year' } | null;
  housing: boolean;
  meals: boolean;
  willingToRelocate: boolean;
};
export type AvailabilityDto = {
  preset: AvailabilityPreset;
  date: string;
  confirmedAt: string;
  confirmedDaysAgo: number;
} | null;
export type ResumeMode = 'classic' | 'compact' | 'upload';
export type ResumeTemplate = 'classic@1' | 'compact@1';
export type OwnProfileDto = {
  identity: {
    firstName: string;
    lastName: string;
    headline: string;
    bio: string;
    city: string;
    region: string | null;
    countryCode: string;
    phone: string | null;
    email: string | null;
    avatarMediaId: string | null;
    coverMediaId: string | null;
  };
  preferences: Preferences;
  workAuthorization: WorkAuthorization | null;
  visibility: { visibleToHosts: boolean; showPhotoToHosts: boolean };
  resume: {
    mode: ResumeMode;
    uploadedMediaId: string | null;
    uploadStatus: 'none' | 'pending' | 'ready' | 'rejected';
  };
  languages: ProfileSnapshotV1['languages'];
  portfolioLinks: ProfileSnapshotV1['portfolioLinks'];
  aiImportConsent: { version: string; at: string } | null;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  skills: Skill[];
  availability: AvailabilityDto;
  missingItem: MissingItem | null;
  poolEligible: boolean;
  removedByModeration: boolean;
  /** 0 before the first write. */
  version: number;
};
export type IdentityField =
  'firstName' | 'lastName' | 'headline' | 'bio' | 'city' | 'region' | 'phone';
export type ImportStatus =
  'waiting_scan' | 'extracting' | 'review_ready' | 'merged' | 'canceled' | 'failed' | 'expired';
export type ImportFailure =
  'scan_rejected' | 'scan_timeout' | 'too_long' | 'unreadable' | 'ai_error' | 'ai_refused';
/** Item keys: 'exp_0', 'edu_0', 'skill_0', 'cert_0', 'lang_0', 'link_0', ... */
export type ResumeProposal = {
  /** Only the fields the file supplied. */
  identity: Partial<Record<IdentityField, string>>;
  experience: (Omit<ExperienceEntry, 'id' | 'provenance' | 'startMonth'> & {
    key: string;
    startMonth: Month | null;
  })[];
  education: (Omit<EducationEntry, 'id' | 'provenance'> & { key: string })[];
  skills: { key: string; label: string }[];
  certifications: (Omit<CertificationEntry, 'id' | 'provenance'> & { key: string })[];
  languages: (ProfileSnapshotV1['languages'][number] & { key: string })[];
  portfolioLinks: (ProfileSnapshotV1['portfolioLinks'][number] & { key: string })[];
  warnings: string[];
};
export type MergeDecisions = {
  identity: Partial<Record<IdentityField, 'replace' | 'keep'>>;
  items: Record<string, { action: 'add'; edit?: Record<string, unknown> } | { action: 'ignore' }>;
};
export type ImportView = {
  id: string;
  status: ImportStatus;
  failureReason: ImportFailure | null;
  proposal: ResumeProposal | null;
  current: Pick<
    OwnProfileDto,
    | 'identity'
    | 'experience'
    | 'education'
    | 'skills'
    | 'certifications'
    | 'languages'
    | 'portfolioLinks'
  >;
  duplicates: string[];
  alreadyStored: string[];
  expiresAt: string;
};
export type WritingHelpInput = {
  field: 'headline' | 'bio' | 'experience';
  experienceId?: string;
  text: string;
  action: 'draft' | 'improve' | 'shorten' | 'fix';
};

// --- W0 engineering decisions: inputs and outputs the stubs' signatures need -------------------

/** What `missingItem` reads: the visibility switch and the fields the pool rules need. */
export type MissingItemInput = {
  visibleToHosts: boolean;
  firstName: string;
  lastName: string;
  city: string;
  region: string | null;
  countryCode: string;
  availability: { date: string; confirmedAt: string } | null;
  categories: Category[];
  occupations: string[];
  workAuthorization: WorkAuthorization | null;
};

/** PUT /me/availability's body, as setAvailability takes it. */
export type AvailabilityInput = { preset: AvailabilityPreset; date?: string; clientToday: string };

/** The date a preset stores (spec 8.2), or why the input can't be stored. */
export type AvailabilityResolution =
  | { ok: true; date: string }
  | {
      ok: false;
      reason: 'date_required' | 'date_before_today' | 'beyond_too_soon' | 'date_too_far';
    };

/** SP7's community identity plus the first name and last initial SP4's host block list shows. */
export type CommunityIdentity = {
  /** The full profile name ("Maya Rodriguez"), SP7 8.1. */
  displayName: string;
  firstName: string;
  lastInitial: string;
  /** Not gated by "Show my photo to hosts": Community isn't a host surface. */
  avatarMediaId: string | null;
};

/** For SP6 feed targeting only. */
export type PreferenceTargets = { categories: Category[]; states: string[] };
