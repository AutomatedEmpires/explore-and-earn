// Client-safe hiring types (SP5 spec section 3). Screens import these, never a module.
import type {
  ApplicationSnapshotV1,
  ApplicationSource,
  ApplicationStatus,
  HostApplicationCard,
  SeekerStatus,
} from '@/lib/applications';
import type { JobCardData } from '@/lib/discovery';
import type { PoolCard } from '@/lib/profiles';
import type { Category } from '@/lib/taxonomy';

export type { ApplicationSnapshotV1, ApplicationSource, ApplicationStatus, HostApplicationCard, SeekerStatus };
export type { Category };
export type { JobCardData, PoolCard };

export type Page<T> = { items: T[]; nextCursor: string | null };

export type FitFactor =
  | 'occupation'
  | 'availability'
  | 'skills'
  | 'certifications'
  | 'work_authorization'
  | 'pay'
  | 'location';
export type FitWeights = Record<Category, Record<FitFactor, number>>;
export type FitListing = {
  category: Category;
  secondCategory: Category | null;
  occupation: string;
  occupationLabel: string;
  startDate: string;
  endDate: string | null;
  weeklyHours: number;
  skillKeys: string[];
  requiredCertificationKeys: string[];
  sponsorship: 'none' | 'j1' | 'h2a' | 'h2b';
  state: string | null;
  remoteStates: string[] | 'all_us' | null;
  maxPayHourlyCents: number | null;
};
export type FitLine = { factor: FitFactor; weight: number; value: number; text: string };
export type FitResult = { score: number; weightsVersion: string; lines: FitLine[] };

export type PipelineEventKind =
  | 'applied'
  | 'shortlisted'
  | 'unshortlisted'
  | 'interview_invited'
  | 'interview_scheduled'
  | 'interview_completed'
  | 'interview_no_show'
  | 'offered'
  | 'offer_canceled'
  | 'hired'
  | 'not_selected'
  | 'withdrawn'
  | 'offer_declined'
  | 'invite_sent'
  | 'invite_interested'
  | 'invite_not_interested'
  | 'invite_applied'
  | 'invite_expired';

export type ScanState = 'pending' | 'clear' | 'warn' | 'held';
export type InviteStatus = 'sent' | 'interested' | 'applied' | 'not_interested' | 'expired';
export type HostInviteStatus = InviteStatus | 'not_delivered';
export type InviteDeclineReason = 'dates' | 'location' | 'pay' | 'role' | 'not_looking' | 'other';
export type InterviewStatus =
  | 'invited'
  | 'scheduled'
  | 'reschedule_requested'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'completed'
  | 'no_show';
export type InterviewFormat = 'video' | 'phone' | 'in_person';
export type InterviewWhere =
  | { kind: 'video'; url: string }
  | { kind: 'phone'; note: string | null }
  | { kind: 'in_person'; address: string };
export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'canceled';
export type PayUnit = 'hour' | 'day' | 'week' | 'month' | 'season' | 'year' | 'crew_share';
export type OfferPay = { amountCents: number; maxCents: number | null; unit: PayUnit; currency: string };
export type ApplicantSort = 'newest' | 'oldest' | 'fit' | 'activity';

export type ApplicantCardData = {
  applicationId: string;
  listingId: string;
  listingTitle: string;
  status: ApplicationStatus;
  source: ApplicationSource;
  appliedAt: string;
  lastStatusAt: string;
  card: HostApplicationCard;
  avatarUrl: string | null;
  coverUrl: string | null;
  fitScore: number | null;
  interviewState: InterviewStatus | null;
  offerState: OfferStatus | null;
  undoUntil: string | null;
  threadId: string | null;
};

export type InterviewSlotView = {
  id: string;
  round: number;
  startsAt: string;
  endsAt: string;
  passed: boolean;
};
export type HostInterviewView = {
  id: string;
  applicationId: string;
  status: InterviewStatus;
  format: InterviewFormat;
  where: InterviewWhere;
  round: number;
  slots: InterviewSlotView[];
  durationMinutes: number;
  timezone: string;
  expiresAt: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  requestedWindows: { start: string; end: string }[] | null;
  requestNote: string | null;
  note: string | null;
  noteState: ScanState;
  organizerUserId: string;
};
export type SeekerInterviewItem = Omit<HostInterviewView, 'status' | 'noteState' | 'organizerUserId'> & {
  status: Exclude<InterviewStatus, 'completed' | 'no_show'> | 'past';
  orgName: string;
  title: string;
  threadId: string;
};
export type InterviewItem = {
  interviewId: string;
  applicationId: string;
  listingId: string;
  listingTitle: string;
  firstName: string;
  lastName: string;
  status: InterviewStatus;
  format: InterviewFormat;
  round: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  expiresAt: string | null;
  timezone: string;
  needsAction: boolean;
  threadId: string;
};
export type HostOfferView = {
  id: string;
  applicationId: string;
  status: OfferStatus;
  position: string;
  startDate: string;
  pay: OfferPay;
  note: string | null;
  noteState: ScanState;
  hasLetter: boolean;
  priorStatus: ApplicationStatus;
  sentAt: string;
  respondedAt: string | null;
};
export type SeekerOfferItem = Omit<HostOfferView, 'noteState' | 'priorStatus'> & {
  orgName: string;
  title: string;
  threadId: string;
};
export type PipelineHistoryItem = {
  kind: PipelineEventKind;
  actorType: 'host' | 'seeker' | 'system';
  at: string;
};
export type ApplicantDetail = {
  card: ApplicantCardData;
  snapshot: ApplicationSnapshotV1;
  fit: FitResult | null;
  history: PipelineHistoryItem[];
  interview: HostInterviewView | null;
  offer: HostOfferView | null;
  threadId: string | null;
  additionalStepDone: boolean;
};
export type PoolCardData = {
  candidateId: string;
  card: PoolCard;
  avatarUrl: string | null;
  coverUrl: string | null;
  fit: FitResult | null;
  invite: { inviteId: string; status: HostInviteStatus } | null;
  saved: boolean;
  hidden: boolean;
};
export type HostInviteItem = {
  inviteId: string;
  listingId: string;
  listingTitle: string;
  candidateId: string;
  firstName: string;
  lastInitial: string;
  status: HostInviteStatus;
  declineReason: InviteDeclineReason | null;
  sentAt: string;
  expiresAt: string;
  respondedAt: string | null;
  threadId: string | null;
};
export type SeekerInviteItem = {
  inviteId: string;
  listingId: string;
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  title: string;
  note: string | null;
  warn: boolean;
  status: InviteStatus;
  sentAt: string;
  expiresAt: string;
  threadId: string | null;
  applyHref: string;
};
export type InterviewProposal = {
  slots: { start: string }[];
  durationMinutes: 15 | 30 | 45 | 60 | 90;
  timezone?: string;
  format: InterviewFormat;
  videoUrl?: string;
  phoneNote?: string;
  address?: string;
  note?: string;
  expiryHours: 48 | 72;
};
export type OfferInput = {
  position?: string;
  startDate: string;
  pay: { amountCents: number; maxCents?: number; unit: PayUnit };
  note?: string;
  letterMediaId?: string;
};
export type HostHome = {
  todayApplicants: number;
  todayInterviews: InterviewItem[];
  unreadThreads: number;
  openingsFilled: { listingId: string; title: string }[];
};
export type CardPayload =
  | { type: 'application'; applicationId: string; title: string; submittedAt: string; status: ApplicationStatus | SeekerStatus }
  | { type: 'invite'; invite: SeekerInviteItem | HostInviteItem }
  | { type: 'interview'; interview: SeekerInterviewItem | HostInterviewView }
  | { type: 'offer'; offer: SeekerOfferItem | HostOfferView };
export type AsDescribedAnswer = 'yes' | 'partly' | 'no';
export type Tally = { yes: number; partly: number; no: number };
export type AsDescribedSummary = {
  responses: number;
  visible: boolean;
  housing: Tally;
  meals: Tally;
  pay: Tally;
};
export type AsDescribedPrompt = {
  id: string;
  orgName: string;
  title: string;
  asksWorkedHere: boolean;
  asksHousing: boolean;
  asksMeals: boolean;
  state: 'open' | 'submitted' | 'closed';
  closesAt: string | null;
};
