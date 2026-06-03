// Canonical Event Registry — Product, Lifecycle & Analytics Events (contract mirror)
// MIRROR of the Notion "Canonical Event Registry". snake_case, past-tense for
// completed actions, no duplicate synonyms. Do NOT invent event names without
// updating the registry first (G13).

export const DISCOVERY_EVENTS = [
  "search_performed",
  "filter_applied",
  "filter_removed",
  "empty_search_shown",
  "seek_results_loaded",
  "swipe_stack_loaded",
  "map_results_loaded",
  "listing_impression",
  "boosted_listing_impression",
  "featured_employer_impression",
  "map_pin_impression",
  "listing_card_opened",
  "listing_detail_opened",
  "listing_saved",
  "listing_unsaved",
  "listing_swiped_yes",
  "listing_swiped_no",
  "listing_shared",
] as const

export const LISTING_HOST_EVENTS = [
  "listing_draft_created",
  "listing_updated",
  "listing_submitted_for_review",
  "listing_published",
  "listing_paused",
  "listing_closed",
  "listing_archived",
  "listing_quality_recalculated",
  "host_profile_updated",
  "host_profile_completion_prompt_shown",
] as const

export const APPLICATION_EVENTS = [
  "application_started",
  "application_submitted",
  "application_viewed_by_host",
  "application_status_changed",
  "application_withdrawn",
  "application_not_selected",
  "application_expired",
  "application_accepted",
  "application_completed",
] as const

export const INVITE_EVENTS = [
  "invite_created",
  "invite_sent",
  "invite_delivered",
  "invite_viewed",
  "invite_applied",
  "invite_ignored",
  "invite_expired",
  "invite_withdrawn",
  "invite_credit_consumed",
  "invite_credit_restored",
] as const

export const OFFER_EVENTS = [
  "offer_created",
  "offer_sent",
  "offer_delivered",
  "offer_viewed",
  "offer_accepted",
  "offer_declined",
  "offer_expired",
  "offer_withdrawn",
] as const

export const MATCHING_EVENTS = [
  "match_generated",
  "match_marked_stale",
  "match_refreshed",
  "matched_bucket_viewed",
  "match_reason_opened",
  "match_score_clicked",
  "empty_match_bucket_shown",
  "match_pool_building_prompt_shown",
] as const

export const MESSAGING_EVENTS = [
  "conversation_opened",
  "message_sent",
  "message_read",
  "message_reported",
  "conversation_restricted",
  "conversation_closed",
] as const

export const SCHEDULING_EVENTS = [
  "scheduling_request_created",
  "scheduling_request_sent",
  "scheduling_time_selected",
  "scheduling_alternate_requested",
  "scheduling_cancelled",
  "scheduling_completed",
  "scheduling_expired",
  "scheduling_no_show_reported",
] as const

export const TRAVEL_PLAN_EVENTS = [
  "travel_plan_created",
  "travel_plan_updated",
  "travel_plan_shared_with_host",
  "travel_plan_cancelled",
  "travel_attachment_uploaded",
] as const

export const BILLING_EVENTS = [
  "checkout_started",
  "checkout_completed",
  "checkout_failed",
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_renewed",
  "entitlement_snapshot_generated",
  "add_on_purchased",
  "add_on_failed",
  "invite_pack_purchased",
  "team_seat_purchased",
  "additional_listing_purchased",
] as const

export const REFUND_EVENTS = [
  "refund_review_opened",
  "refund_review_under_review",
  "refund_review_approved",
  "refund_review_denied",
  "refund_processed",
  "refund_failed",
  "service_credit_issued",
  "service_credit_consumed",
] as const

export const VERIFICATION_EVENTS = [
  "verification_started",
  "verification_submitted",
  "verification_under_review",
  "verification_more_info_requested",
  "verification_approved",
  "verification_rejected",
  "verification_revoked",
  "verification_expired",
  "reverification_required",
] as const

export const MODERATION_EVENTS = [
  "report_submitted",
  "report_triaged",
  "moderation_case_created",
  "moderation_case_escalated",
  "moderation_action_taken",
  "content_hidden",
  "content_removed",
  "account_restricted",
  "account_suspended",
  "account_banned",
  "account_reinstated",
  "appeal_submitted",
  "appeal_resolved",
] as const

export const MEDIA_EVENTS = [
  "media_uploaded",
  "media_processing_started",
  "media_processing_failed",
  "media_approved",
  "media_rejected",
  "media_hidden",
  "media_removed",
  "housing_media_added",
  "meals_media_added",
] as const

export const COMMUNITY_EVENTS = [
  "community_feed_loaded",
  "community_photo_post_created",
  "community_photo_post_viewed",
  "community_reaction_added",
  "host_announcement_created",
  "host_announcement_viewed",
  "platform_post_viewed",
] as const

export const NOTIFICATION_EVENTS = [
  "notification_created",
  "notification_delivered",
  "notification_read",
  "notification_dismissed",
  "notification_suppressed",
  "notification_digest_sent",
] as const

export const DEMO_EVENTS = [
  "demo_started",
  "demo_tier_selected",
  "demo_section_viewed",
  "demo_upgrade_clicked",
  "demo_signup_started",
] as const

// Internal/build-governance only — never user-facing product instrumentation.
export const AGENT_GOVERNANCE_EVENTS = [
  "source_registry_conflict_found",
  "adr_violation_detected",
  "ci_guardrail_failed",
  "schema_drift_detected",
] as const

/** Flattened catalogue of every product/lifecycle/analytics event name. */
export const EVENT_TYPES = [
  ...DISCOVERY_EVENTS,
  ...LISTING_HOST_EVENTS,
  ...APPLICATION_EVENTS,
  ...INVITE_EVENTS,
  ...OFFER_EVENTS,
  ...MATCHING_EVENTS,
  ...MESSAGING_EVENTS,
  ...SCHEDULING_EVENTS,
  ...TRAVEL_PLAN_EVENTS,
  ...BILLING_EVENTS,
  ...REFUND_EVENTS,
  ...VERIFICATION_EVENTS,
  ...MODERATION_EVENTS,
  ...MEDIA_EVENTS,
  ...COMMUNITY_EVENTS,
  ...NOTIFICATION_EVENTS,
  ...DEMO_EVENTS,
  ...AGENT_GOVERNANCE_EVENTS,
] as const
export type EventType = (typeof EVENT_TYPES)[number]

// Back-compat with the prior stub. NOTE: `scope_changed` is NOT in the Canonical
// Event Registry; retained here only so existing imports keep resolving. Flagged
// for registry reconciliation (either add scope_changed to the registry or drop
// this).
export const CORE_EVENT_TYPES = ["scope_changed"] as const
export type CoreEventType = (typeof CORE_EVENT_TYPES)[number]
