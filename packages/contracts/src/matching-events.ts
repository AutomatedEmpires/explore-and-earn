// Matching/hiring analytics event names — TYPE-ONLY. No PostHog client, no sending.
// Source of truth: Canonical Event Registry (registry wins over directive draft names).
// Convention: snake_case, past-tense.
//
// These mirror the registry. When events.ts is regenerated (Contracts V1) to mirror
// the full registry, prefer importing from there.

export type MatchingEventType =
	| "match_generated"
	| "match_marked_stale"
	| "match_refreshed"
	| "matched_bucket_viewed"
	| "match_reason_opened"
	| "match_score_clicked"
	| "empty_match_bucket_shown"
	| "match_pool_building_prompt_shown"

export type InviteEventType =
	| "invite_created"
	| "invite_sent"
	| "invite_delivered"
	| "invite_viewed"
	| "invite_applied"
	| "invite_ignored"
	| "invite_expired"
	| "invite_withdrawn"
	| "invite_credit_consumed"
	| "invite_credit_restored"

export type OfferEventType =
	| "offer_created"
	| "offer_sent"
	| "offer_delivered"
	| "offer_viewed"
	| "offer_accepted"
	| "offer_declined"
	| "offer_expired"
	| "offer_withdrawn"

export type ApplicationEventType =
	| "application_started"
	| "application_submitted"
	| "application_viewed_by_host"
	| "application_status_changed"
	| "application_withdrawn"
	| "application_not_selected"
	| "application_expired"
	| "application_accepted"
	| "application_completed"

export type MatchingHiringEventType =
	| MatchingEventType
	| InviteEventType
	| OfferEventType
	| ApplicationEventType

// TODO(?) proposed additions NOT yet in Event Registry — require founder/registry update:
//   candidate_card_opened, candidate_profile_popup_opened, quick_apply_clicked
// CONFLICT: directive "candidate_shortlisted" uses prohibited "shortlisted" term;
//   propose candidate_saved instead. "candidate_invited"/"invite_responded"/
//   "candidate_not_selected" duplicate canonical events; prefer canonical names.
