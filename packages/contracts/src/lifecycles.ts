// Lifecycle Registry — Canonical V1 State Machines (contract mirror)
// MIRROR of the Notion "Lifecycle Registry". These transition maps are intended
// to back the assert_lifecycle_transition() DB trigger (G16) and server-side
// guards. Do NOT add a state or edge without updating the Lifecycle Registry +
// Canonical Enum Registry first (G13).

import {
  type ApplicationStatus,
  type InviteStatus,
  type OfferStatus,
  type HostAttestationStatus,
  type HostAccountStatus,
  type HostRemovalAppealStatus,
  type IdentityVerificationStatus,
  type RefundReviewStatus,
  type DisputeStatus,
  type ConversationStatus,
  type SchedulingStatus,
  type MediaProcessingStatus,
  type MediaModerationStatus,
  type CampaignStatus,
  type ReportStatus,
  type ModerationCaseStatus,
  type ReviewStatus,
  type CheckInStatus,
  LISTING_STATUS,
} from "./enums"

/**
 * A transition map: for each state, the set of states it may move to directly.
 * Partial — terminal states may be omitted or map to an empty array.
 */
export type TransitionMap<S extends string> = {
  readonly [K in S]?: ReadonlyArray<S>
}

/** Returns true if `from -> to` is a permitted transition in `map`. */
export function canTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return (map[from] ?? []).includes(to)
}

/** Canonical expiry / grace windows (days). */
export const LIFECYCLE_EXPIRY_DAYS = {
  /** Application auto-expires if still applied/reviewing/saved_by_host. */
  application: 30,
  /** Invite expires after sent/delivered with no application. */
  invite: 14,
  /** Offer expires after extended_at unless a shorter explicit expiry exists. */
  offer: 7,
  /** Grace after attestation policy bump before attested_stale -> not_attested. */
  hostAttestationStaleGrace: 30,
  /** Filing window from host_profiles.removed_at. */
  hostRemovalAppealWindow: 14,
} as const

/** Admin first-response SLA for host removal appeals (calendar days). */
export const HOST_REMOVAL_APPEAL_FIRST_RESPONSE_DAYS = 7

/* ----------------------------------------------------------- Application */
export const APPLICATION_TRANSITIONS = {
  applied: ["reviewing", "saved_by_host", "offered", "not_selected", "withdrawn", "expired"],
  reviewing: ["saved_by_host", "offered", "not_selected", "withdrawn", "expired"],
  saved_by_host: ["offered", "not_selected", "withdrawn", "expired"],
  offered: ["accepted", "withdrawn", "expired"],
  accepted: ["active"],
  active: ["completed"],
} as const satisfies TransitionMap<ApplicationStatus>

/* ----------------------------------------------------------- Invite */
export const INVITE_TRANSITIONS = {
  created: ["delivered", "withdrawn", "expired", "ignored"],
  delivered: ["viewed", "applied", "withdrawn", "expired", "ignored"],
  viewed: ["applied", "withdrawn", "expired", "ignored"],
} as const satisfies TransitionMap<InviteStatus>

/* ----------------------------------------------------------- Offer */
export const OFFER_TRANSITIONS = {
  created: ["delivered", "declined", "expired", "withdrawn"],
  delivered: ["viewed", "accepted", "declined", "expired", "withdrawn"],
  viewed: ["accepted", "declined", "expired", "withdrawn"],
} as const satisfies TransitionMap<OfferStatus>

/* ----------------------------------------------------------- Host attestation */
export const HOST_ATTESTATION_TRANSITIONS = {
  not_attested: ["attested"],
  attested: ["attested_stale", "withdrawn"],
  attested_stale: ["attested", "not_attested"],
  withdrawn: ["attested"],
} as const satisfies TransitionMap<HostAttestationStatus>

/* ----------------------------------------------------------- Host account */
export const HOST_ACCOUNT_TRANSITIONS = {
  active: ["paused", "removed"],
  paused: ["active"],
  removed: ["appealing", "active"],
  appealing: ["active", "removed"],
} as const satisfies TransitionMap<HostAccountStatus>

/* ----------------------------------------------------------- Host removal appeal */
export const HOST_REMOVAL_APPEAL_TRANSITIONS = {
  submitted: ["under_review", "withdrawn"],
  under_review: ["granted", "denied", "withdrawn"],
} as const satisfies TransitionMap<HostRemovalAppealStatus>

/* --------------------------------------------- Identity verification (non-host) */
export const IDENTITY_VERIFICATION_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["under_review"],
  under_review: ["approved", "awaiting_more_info", "rejected"],
  awaiting_more_info: ["submitted"],
  approved: ["revoked", "expired", "superseded"],
  rejected: ["superseded"],
  expired: ["superseded"],
} as const satisfies TransitionMap<IdentityVerificationStatus>

/* ----------------------------------------------------------- Refund review */
export const REFUND_REVIEW_TRANSITIONS = {
  opened: ["under_review"],
  under_review: ["approved", "denied", "cancelled"],
  approved: ["processed", "failed", "service_credit_issued"],
  failed: ["under_review"],
} as const satisfies TransitionMap<RefundReviewStatus>

/* ----------------------------------------------------------- Dispute case */
export const DISPUTE_TRANSITIONS = {
  open: ["under_review"],
  under_review: ["awaiting_user", "escalated", "resolved", "denied"],
  awaiting_user: ["under_review"],
  escalated: ["under_review", "resolved", "denied", "closed"],
  resolved: ["closed"],
  denied: ["closed"],
} as const satisfies TransitionMap<DisputeStatus>

/* ----------------------------------------------------------- Conversation thread */
export const CONVERSATION_TRANSITIONS = {
  active: ["restricted", "closed", "expired"],
  restricted: ["active", "closed"],
  closed: ["archived"],
  expired: ["archived"],
} as const satisfies TransitionMap<ConversationStatus>

/* ----------------------------------------------------------- Scheduling request */
export const SCHEDULING_TRANSITIONS = {
  proposed: ["selected", "alternate_requested", "cancelled", "expired"],
  selected: ["completed", "cancelled", "expired", "no_show"],
  alternate_requested: ["proposed", "selected"],
} as const satisfies TransitionMap<SchedulingStatus>

/* ----------------------------------------------------------- Media processing */
export const MEDIA_PROCESSING_TRANSITIONS = {
  uploaded: ["processing"],
  processing: ["ready", "failed"],
} as const satisfies TransitionMap<MediaProcessingStatus>

/* ----------------------------------------------------------- Media moderation */
export const MEDIA_MODERATION_TRANSITIONS = {
  pending: ["under_review", "approved", "rejected", "hidden", "removed"],
  under_review: ["approved", "rejected", "hidden", "removed"],
  approved: ["hidden", "removed"],
} as const satisfies TransitionMap<MediaModerationStatus>

/* ------------------------------------------- Boost / Featured employer campaign */
// FeaturedEmployerCampaign shares this machine (registry: "Same as BoostCampaign").
export const CAMPAIGN_TRANSITIONS = {
  scheduled: ["active", "paused", "cancelled"],
  active: ["completed", "paused", "cancelled", "removed"],
  paused: ["active", "cancelled"],
  completed: ["refunded"],
} as const satisfies TransitionMap<CampaignStatus>

/* ----------------------------------------------------------- Report case */
export const REPORT_TRANSITIONS = {
  submitted: ["triaged"],
  triaged: ["under_review"],
  under_review: ["action_taken", "dismissed", "escalated"],
  escalated: ["action_taken", "closed"],
  action_taken: ["closed"],
  dismissed: ["closed"],
} as const satisfies TransitionMap<ReportStatus>

/* ----------------------------------------------------------- Moderation case */
export const MODERATION_CASE_TRANSITIONS = {
  open: ["triaged"],
  triaged: ["under_review"],
  under_review: ["awaiting_user", "escalated", "action_taken"],
  awaiting_user: ["under_review"],
  escalated: ["under_review", "action_taken", "resolved"],
  action_taken: ["resolved"],
  resolved: ["closed"],
} as const satisfies TransitionMap<ModerationCaseStatus>

/* ----------------------------------------------------------- Review */
export const REVIEW_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["under_review", "hidden", "removed"],
  under_review: ["approved", "hidden", "removed"],
  approved: ["hidden", "removed"],
} as const satisfies TransitionMap<ReviewStatus>

/* ----------------------------------------------------------- Check-in */
export const CHECK_IN_TRANSITIONS = {
  scheduled: ["sent"],
  sent: ["completed", "skipped", "expired", "escalated"],
  completed: ["escalated"],
} as const satisfies TransitionMap<CheckInStatus>

/**
 * @deprecated Listing status now lives in ./enums (LISTING_STATUS / ListingStatus).
 * Kept as a value alias for back-compat with the prior stub export.
 */
export const LISTING_STATUSES = LISTING_STATUS
