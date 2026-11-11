// The applications contract types (SP4 spec 3.1, plan Task 4), shared by @/modules/applications
// and client code. Client-safe: type-only imports.
import type { DiscoverySource } from '@/modules/discovery';
import type { ScreeningQuestion } from '@/modules/listings';
import type { ProfileSnapshotV1, ResumeMode, ResumeTemplate } from '@/lib/profiles/types';

// --- Spec 3.1 ----------------------------------------------------------------------------------

export type ApplicationStatus =
  | 'new'
  | 'shortlisted'
  | 'interviewing'
  | 'offered'
  | 'hired'
  | 'not_selected'
  | 'withdrawn'
  | 'offer_declined';
export type SeekerStatus =
  'applied' | 'interviewing' | 'offer' | 'hired' | 'not_selected' | 'withdrawn' | 'offer_declined';
/** SP3: 'seek' | 'swipe' | 'map' | 'invite' | 'boost' | 'landing' | 'other'. */
export type ApplicationSource = DiscoverySource;
export type Actor =
  | { type: 'seeker'; userId: string }
  | { type: 'host'; userId: string; orgId: string }
  | { type: 'system' };
export type ApplicationSnapshotV1 = {
  v: 1;
  listing: {
    id: string;
    revisionId: string;
    title: string;
    orgId: string;
    orgName: string;
    orgLogoMediaId: string | null;
    locationLabel: string;
    startDate: string | null;
    endDate: string | null;
    visaSponsorship: 'none' | 'j1' | 'h2a' | 'h2b';
    additionalStep: { note: string; url: string } | null;
  };
  /** Includes workAuthorization. */
  profile: ProfileSnapshotV1;
  answers: {
    questionId: string;
    prompt: string;
    type: 'short_answer' | 'yes_no' | 'multiple_choice';
    required: boolean;
    value: string | boolean | string[] | null;
  }[];
  /**
   * The generated representation current at submit (FD-2): the employer gets this PDF, rendered
   * from the frozen profile with the frozen template version, never an uploaded file.
   */
  resume: { mode: ResumeMode; template: ResumeTemplate };
  sponsorshipMismatchAcknowledged: boolean;
};
export type HostApplicationCard = {
  applicationId: string;
  listingId: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  submittedAt: string;
  firstName: string;
  lastName: string;
  city: string;
  region: string | null;
  avatarMediaId: string | null;
  coverMediaId: string | null;
  availabilityDate: string | null;
  skills: { label: string; highlighted: boolean }[];
  additionalStepCompletedAt: string | null;
};

// --- Plan Task 4 additions ---------------------------------------------------------------------

export type ApplicationView = 'applied' | 'interviews' | 'offers';
export type WithdrawReason = 'took_another_job' | 'dates_changed' | 'not_interested' | 'other';
/** Country always has a value ('US' by default). */
export type MissingField = 'first_name' | 'last_name' | 'city' | 'region' | 'work_authorization';
export type SubmitInput = {
  listingId: string;
  listingRevisionId: string;
  answers: { questionId: string; value: string | boolean | string[] | null }[];
  source: string;
  inviteId?: string;
  acknowledgeSponsorship: boolean;
};
export type MyApplicationRow = {
  applicationId: string;
  listingId: string;
  title: string;
  orgName: string;
  orgLogoMediaId: string | null;
  seekerStatus: SeekerStatus;
  submittedAt: string;
};
export type ReceiptDto = {
  applicationId: string;
  submittedAt: string;
  seekerStatus: SeekerStatus;
  snapshot: ApplicationSnapshotV1;
  events: {
    type: 'submitted' | 'status_changed' | 'withdrawn';
    seekerStatus: SeekerStatus;
    at: string;
  }[];
  additionalStepCompletedAt: string | null;
  canWithdraw: boolean;
  canTickAdditionalStep: boolean;
};
export type ApplyContextDto = {
  listing: ApplicationSnapshotV1['listing'] & { status: 'active' | 'closed' };
  questions: ScreeningQuestion[];
  sponsorshipWarning: boolean;
  blocked: 'none' | 'you_blocked' | 'unavailable';
  existingApplicationId: string | null;
  missingFields: MissingField[];
  preview: ProfileSnapshotV1;
  resume: { mode: ResumeMode };
};
export type HostApplicationRef = {
  applicationId: string;
  listingId: string;
  orgId: string;
  seekerUserId: string;
  status: ApplicationStatus;
  submittedAt: Date;
};
export type HostApplicationDto = {
  applicationId: string;
  listingId: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  submittedAt: string;
  snapshot: ApplicationSnapshotV1;
  additionalStepCompletedAt: string | null;
  events: {
    type: 'submitted' | 'status_changed' | 'withdrawn' | 'additional_step_changed';
    fromStatus: ApplicationStatus | null;
    toStatus: ApplicationStatus;
    actorType: 'seeker' | 'host' | 'system';
    note: string | null;
    at: string;
  }[];
};

// --- W0 engineering decisions ------------------------------------------------------------------

/** The transition table's shape (spec 8.5). */
export type TransitionTable = Record<
  ApplicationStatus,
  { host: readonly ApplicationStatus[]; seeker: readonly ApplicationStatus[] }
>;

/** setStatus's compare-and-set input (spec 3.2). */
export type SetStatusInput = {
  applicationId: string;
  from: ApplicationStatus[];
  to: ApplicationStatus;
  actor: Actor;
};
