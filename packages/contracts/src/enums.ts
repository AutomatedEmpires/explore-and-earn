// Canonical Enum Registry — V1 Implementation Constants
// MIRROR of the Notion "Canonical Enum Registry" (single source of truth).
// Do NOT add, remove, or rename values here without updating that page first
// (CI guardrail G13 fails on divergence). Stored in Postgres as text + CHECK
// (DR-B1); these tuples are the one source the schema, API contracts, events,
// and UI filters all reference.

/* ----------------------------------------------------------- User / Account */
export const USER_STATUS = [
  "pending_email_verification",
  "active",
  "restricted",
  "suspended",
  "banned",
  "deleted",
] as const
export type UserStatus = (typeof USER_STATUS)[number]

// Canonical user scopes. ACTIVE_SCOPES is the in-file single source; UserScope
// is an alias so there is exactly one definition of this set.
export const ACTIVE_SCOPES = ["seeker", "host", "admin", "platform"] as const
export type ActiveScope = (typeof ACTIVE_SCOPES)[number]
export const USER_SCOPE = ACTIVE_SCOPES
export type UserScope = ActiveScope

/* ----------------------------------------------------------- Host / Seeker */
export const HOST_PUBLIC_STATUS = [
  "draft",
  "under_review",
  "active",
  "hidden",
  "restricted",
  "suspended",
  "banned",
] as const
export type HostPublicStatus = (typeof HOST_PUBLIC_STATUS)[number]

// HostVerificationStatus is RETIRED by ADR-029 (unverified/pending/verified/
// rejected/revoked). New code must not use it; replaced by HostAttestationStatus
// + HostAccountStatus below. Intentionally not exported.

export const HOST_ATTESTATION_STATUS = [
  "not_attested",
  "attested",
  "attested_stale",
  "withdrawn",
] as const
export type HostAttestationStatus = (typeof HOST_ATTESTATION_STATUS)[number]

export const HOST_ACCOUNT_STATUS = [
  "active",
  "paused",
  "removed",
  "appealing",
] as const
export type HostAccountStatus = (typeof HOST_ACCOUNT_STATUS)[number]

export const HOST_REMOVED_REASON_CODE = [
  "listing_misrepresentation",
  "identity_misrepresentation",
  "housing_misrepresentation",
  "meals_misrepresentation",
  "pay_misrepresentation",
  "safety_violation",
  "fraud",
  "repeated_policy_violation",
  "legal_compliance",
  "other_breach",
] as const
export type HostRemovedReasonCode = (typeof HOST_REMOVED_REASON_CODE)[number]

export const HOST_REMOVAL_APPEAL_STATUS = [
  "submitted",
  "under_review",
  "denied",
  "granted",
  "withdrawn",
] as const
export type HostRemovalAppealStatus = (typeof HOST_REMOVAL_APPEAL_STATUS)[number]

export const HOST_REMOVAL_APPEAL_DECISION_REASON_CODE = [
  "evidence_insufficient",
  "evidence_compelling",
  "policy_misapplied",
  "mitigating_circumstance",
  "other",
] as const
export type HostRemovalAppealDecisionReasonCode =
  (typeof HOST_REMOVAL_APPEAL_DECISION_REASON_CODE)[number]

export const SEEKER_VISIBILITY_STATUS = [
  "platform",
  "hidden",
  "restricted",
] as const
export type SeekerVisibilityStatus = (typeof SEEKER_VISIBILITY_STATUS)[number]

/* ----------------------------------------------------------- Listing */
export const LISTING_STATUS = [
  "draft",
  "under_review",
  "live",
  "paused",
  "closed",
  "archived",
] as const
export type ListingStatus = (typeof LISTING_STATUS)[number]

// Marketplace categories. MARKETPLACE_CATEGORIES is the in-file single source;
// LISTING_CATEGORY / ListingCategory alias it (registry: ListingCategory).
// `lodge` is NOT a category — it is a setting under `seasonal` (#6).
export const MARKETPLACE_CATEGORIES = [
  "farm",
  "maritime",
  "remote",
  "seasonal",
  "mix",
] as const
export type MarketplaceCategory = (typeof MARKETPLACE_CATEGORIES)[number]
export const LISTING_CATEGORY = MARKETPLACE_CATEGORIES
export type ListingCategory = MarketplaceCategory

// DR-B6 (LOCKED): values allowed in listings.mix_domains — the four non-mix
// categories. A `mix` listing matches category-only against these domains.
export const MIX_DOMAIN = ["farm", "maritime", "remote", "seasonal"] as const
export type MixDomain = (typeof MIX_DOMAIN)[number]

export const COMPENSATION_UNIT = [
  "hour",
  "day",
  "week",
  "month",
  "year",
  "stipend",
  "exchange",
  "other",
] as const
export type CompensationUnit = (typeof COMPENSATION_UNIT)[number]

export const FILLED_STATUS = [
  "open",
  "partially_filled",
  "filled",
  "overfilled",
] as const
export type FilledStatus = (typeof FILLED_STATUS)[number]

/* ----------------------------------------------- Application / Invite / Offer */
export const APPLICATION_STATUS = [
  "applied",
  "reviewing",
  "saved_by_host",
  "offered",
  "accepted",
  "active",
  "completed",
  "not_selected",
  "withdrawn",
  "expired",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUS)[number]

export const INVITE_STATUS = [
  "created",
  "delivered",
  "viewed",
  "applied",
  "ignored",
  "expired",
  "withdrawn",
] as const
export type InviteStatus = (typeof INVITE_STATUS)[number]

export const OFFER_STATUS = [
  "created",
  "delivered",
  "viewed",
  "accepted",
  "declined",
  "expired",
  "withdrawn",
] as const
export type OfferStatus = (typeof OFFER_STATUS)[number]

/* ----------------------------------------------- Saved / Host dispositions */
export const SAVED_LISTING_STATUS = ["saved", "removed"] as const
export type SavedListingStatus = (typeof SAVED_LISTING_STATUS)[number]

export const HOST_SEEKER_DISPOSITION = [
  "saved",
  "skipped",
  "invited",
  "offered",
  "not_selected",
  "accepted",
] as const
export type HostSeekerDisposition = (typeof HOST_SEEKER_DISPOSITION)[number]

/* ----------------------------------------------------------- Verification */
// For hosts this is superseded by HostAttestationStatus (ADR-029). Retained for
// future non-host identity/KYC use (e.g. payout / age verification).
export const IDENTITY_VERIFICATION_STATUS = [
  "draft",
  "submitted",
  "under_review",
  "awaiting_more_info",
  "approved",
  "rejected",
  "revoked",
  "expired",
  "superseded",
] as const
export type IdentityVerificationStatus =
  (typeof IDENTITY_VERIFICATION_STATUS)[number]

export const VERIFICATION_SUBJECT_TYPE = [
  "host_profile",
  "seeker_profile",
  "user",
] as const
export type VerificationSubjectType = (typeof VERIFICATION_SUBJECT_TYPE)[number]

export const VERIFICATION_LEVEL = ["basic", "business", "enhanced"] as const
export type VerificationLevel = (typeof VERIFICATION_LEVEL)[number]

/* ----------------------------------------------------------- Refund / Billing */
export const PLAN_TIER = [
  "none",
  "starter",
  "professional",
  "enterprise",
] as const
export type PlanTier = (typeof PLAN_TIER)[number]

export const BILLING_STATUS = [
  "none",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "unpaid",
  "paused",
] as const
export type BillingStatus = (typeof BILLING_STATUS)[number]

export const REFUND_REVIEW_STATUS = [
  "opened",
  "under_review",
  "approved",
  "denied",
  "processed",
  "service_credit_issued",
  "failed",
  "cancelled",
] as const
export type RefundReviewStatus = (typeof REFUND_REVIEW_STATUS)[number]

export const REFUND_OUTCOME_TYPE = [
  "stripe_refund",
  "service_credit",
  "denied",
  "cancelled",
] as const
export type RefundOutcomeType = (typeof REFUND_OUTCOME_TYPE)[number]

export const REFUND_REASON_CODE = [
  "duplicate_charge",
  "billing_error",
  "unused_service",
  "platform_error",
  "moderation_action",
  "goodwill",
  "fraud_denied",
  "other",
] as const
export type RefundReasonCode = (typeof REFUND_REASON_CODE)[number]

export const PURCHASE_OBJECT_TYPE = [
  "subscription",
  "add_on",
  "boost",
  "featured",
  "announcement",
  "invite_credit",
  "team_seat",
  "additional_listing",
  "dispute_case",
  "other",
] as const
export type PurchaseObjectType = (typeof PURCHASE_OBJECT_TYPE)[number]

/* ----------------------------------------------- Campaigns / Monetization */
export const CAMPAIGN_STATUS = [
  "scheduled",
  "active",
  "paused",
  "completed",
  "cancelled",
  "refunded",
  "removed",
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]

export const CAMPAIGN_DELIVERY_STATUS = [
  "under_delivered",
  "on_track",
  "over_delivered",
  "blocked",
  "completed",
] as const
export type CampaignDeliveryStatus = (typeof CAMPAIGN_DELIVERY_STATUS)[number]

export const BOOST_PLACEMENT_SURFACE = [
  "seek",
  "swipe",
  "map_drawer",
  "map_pin",
  "community_feed",
  "homepage",
] as const
export type BoostPlacementSurface = (typeof BOOST_PLACEMENT_SURFACE)[number]

export const FEATURED_EMPLOYER_SURFACE = [
  "homepage",
  "seek_dashboard",
  "category_dashboard",
] as const
export type FeaturedEmployerSurface = (typeof FEATURED_EMPLOYER_SURFACE)[number]

/* ----------------------------------------------------------- Media */
export const MEDIA_OWNER_TYPE = [
  "host_profile",
  "seeker_profile",
  "listing",
  "application",
  "platform_post",
  "travel_plan",
  "identity_verification",
  "dispute_case",
  "refund_review",
  "report_case",
  "moderation_case",
] as const
export type MediaOwnerType = (typeof MEDIA_OWNER_TYPE)[number]

// NOTE: media.ts (PR #4) already exports a NARROWER user-upload `MediaBucketType`
// (6 values: housing/meals/facilities/cover_photo/community_photo/
// verification_evidence). This registry tuple is the FULL DB-level enum (12
// values) and is exported under a distinct type name to avoid an ambiguous
// barrel re-export. The name clash is flagged for canon reconciliation
// (Canonical Enum Registry vs Photo Buckets V1).
export const MEDIA_BUCKET_TYPE = [
  "profile_gallery",
  "cover_photo",
  "icon_photo",
  "housing",
  "meals",
  "facilities",
  "listing_specific",
  "community_photo",
  "travel_attachment",
  "verification_evidence",
  "dispute_evidence",
  "report_evidence",
] as const
export type MediaBucketTypeRegistry = (typeof MEDIA_BUCKET_TYPE)[number]

export const MEDIA_VISIBILITY = [
  "private",
  "owner_team",
  "authenticated",
  "public",
] as const
export type MediaVisibility = (typeof MEDIA_VISIBILITY)[number]

export const MEDIA_MODERATION_STATUS = [
  "pending",
  "under_review",
  "approved",
  "rejected",
  "hidden",
  "removed",
] as const
export type MediaModerationStatus = (typeof MEDIA_MODERATION_STATUS)[number]

export const MEDIA_PROCESSING_STATUS = [
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const
export type MediaProcessingStatus = (typeof MEDIA_PROCESSING_STATUS)[number]

/* ----------------------------------------------- Messaging / Scheduling */
export const CONVERSATION_STATUS = [
  "active",
  "restricted",
  "closed",
  "archived",
  "expired",
] as const
export type ConversationStatus = (typeof CONVERSATION_STATUS)[number]

// accepted_role is NOT a context type (use application context where
// Application.status is accepted/active).
export const CONVERSATION_CONTEXT_TYPE = [
  "invite",
  "application",
  "offer",
  "dispute",
  "support",
] as const
export type ConversationContextType = (typeof CONVERSATION_CONTEXT_TYPE)[number]

export const SCHEDULING_STATUS = [
  "proposed",
  "selected",
  "alternate_requested",
  "cancelled",
  "completed",
  "expired",
  "no_show",
] as const
export type SchedulingStatus = (typeof SCHEDULING_STATUS)[number]

export const MEETING_TYPE = [
  "phone",
  "video",
  "in_person",
  "other",
] as const
export type MeetingType = (typeof MEETING_TYPE)[number]

/* ----------------------------------------------- Disputes / Moderation / Reports */
export const DISPUTE_STATUS = [
  "open",
  "under_review",
  "awaiting_user",
  "escalated",
  "resolved",
  "denied",
  "closed",
] as const
export type DisputeStatus = (typeof DISPUTE_STATUS)[number]

export const DISPUTE_CATEGORY = [
  "refund_dispute",
  "billing_dispute",
  "offer_dispute",
  "host_cancellation",
  "seeker_no_show",
  "housing_misrepresentation",
  "pay_or_terms_dispute",
  "travel_plan_dispute",
  "platform_error",
  "other",
] as const
export type DisputeCategory = (typeof DISPUTE_CATEGORY)[number]

export const DISPUTE_RESOLUTION = [
  "upheld",
  "reversed",
  "partial",
  "refund_review_opened",
  "refund_approved",
  "refund_denied",
  "warning",
  "no_action",
  "other",
] as const
export type DisputeResolution = (typeof DISPUTE_RESOLUTION)[number]

export const REPORT_TARGET_TYPE = [
  "listing",
  "seeker_profile",
  "host_profile",
  "message",
  "community_photo",
  "announcement",
  "review",
  "platform_post",
] as const
export type ReportTargetType = (typeof REPORT_TARGET_TYPE)[number]

export const REPORT_STATUS = [
  "submitted",
  "triaged",
  "under_review",
  "action_taken",
  "dismissed",
  "escalated",
  "closed",
] as const
export type ReportStatus = (typeof REPORT_STATUS)[number]

export const MODERATION_CASE_STATUS = [
  "open",
  "triaged",
  "under_review",
  "awaiting_user",
  "action_taken",
  "escalated",
  "resolved",
  "closed",
] as const
export type ModerationCaseStatus = (typeof MODERATION_CASE_STATUS)[number]

export const MODERATION_ACTION_TYPE = [
  "no_action",
  "warning",
  "content_hidden",
  "content_removed",
  "listing_paused",
  "account_restricted",
  "account_suspended",
  "account_banned",
  "verification_revoked",
  "refund_review_opened",
  "reinstated",
] as const
export type ModerationActionType = (typeof MODERATION_ACTION_TYPE)[number]

export const PRIORITY = ["low", "medium", "high", "critical"] as const
export type Priority = (typeof PRIORITY)[number]

/* ----------------------------------------------------------- Notifications */
export const NOTIFICATION_PRIORITY = [
  "critical",
  "important",
  "informational",
] as const
export type NotificationPriority = (typeof NOTIFICATION_PRIORITY)[number]

export const NOTIFICATION_CHANNEL = ["in_app", "email"] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number]

export const NOTIFICATION_CATEGORY = [
  "applications",
  "offers",
  "invites",
  "billing",
  "safety",
  "community",
  "scheduling",
  "verification",
  "refunds",
  "system",
] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORY)[number]

/* ----------------------------------------------------------- Reviews / Check-ins */
export const REVIEW_VISIBILITY = [
  "private_internal",
  "host_shared",
  "public_approved",
] as const
export type ReviewVisibility = (typeof REVIEW_VISIBILITY)[number]

export const REVIEW_STATUS = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "hidden",
  "removed",
] as const
export type ReviewStatus = (typeof REVIEW_STATUS)[number]

export const CHECK_IN_TYPE = [
  "pre_arrival",
  "early_role",
  "mid_season",
  "end_season",
  "post_role",
] as const
export type CheckInType = (typeof CHECK_IN_TYPE)[number]

export const CHECK_IN_STATUS = [
  "scheduled",
  "sent",
  "completed",
  "skipped",
  "escalated",
  "expired",
] as const
export type CheckInStatus = (typeof CHECK_IN_STATUS)[number]

/* ----------------------------------------------------------- Analytics */
export const ANALYTICS_FRESHNESS_LABEL = [
  "realtime",
  "hourly",
  "daily",
  "weekly",
] as const
export type AnalyticsFreshnessLabel =
  (typeof ANALYTICS_FRESHNESS_LABEL)[number]

export const SNAPSHOT_TYPE = [
  "listing",
  "host",
  "campaign",
  "platform",
  "admin",
] as const
export type SnapshotType = (typeof SNAPSHOT_TYPE)[number]

/* ----------------------------------------------------------- Badges */
export const BADGE_TYPE = [
  "verified_host",
  "founding_host",
  "featured_employer",
  "housing_photos_added",
  "meals_photos_added",
  "community_contributor",
  "review_contributor",
  "seasonal_experience",
  "farm_experience",
  "maritime_experience",
  "remote_experience",
] as const
export type BadgeType = (typeof BADGE_TYPE)[number]

export const BADGE_VISIBILITY = ["public", "scoped", "internal"] as const
export type BadgeVisibility = (typeof BADGE_VISIBILITY)[number]

export const BADGE_STATUS = [
  "active",
  "revoked",
  "expired",
  "hidden",
] as const
export type BadgeStatus = (typeof BADGE_STATUS)[number]
