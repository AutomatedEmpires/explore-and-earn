-- 008_notifications_events.sql
-- Notification delivery model + the append-only product/lifecycle/analytics
-- event log and its seeded type registry.
--
-- Canon honored:
--   G13 / Canonical Event Registry: event_types is a seeded MIRROR of
--     packages/contracts/src/events.ts (EVENT_TYPES). New event names must be
--     added to the registry/contract first, then here. Modeled as a seeded
--     reference table + FK (same pattern as 001's lifecycle_transition) rather
--     than a 152-value CHECK, so the vocabulary stays in one queryable place.
--   AGENT_GOVERNANCE_EVENTS are internal build-governance signals, never
--     user-facing product instrumentation: seeded with is_product_event = false
--     so analytics rollups can exclude them.
--   DR-B1 text+CHECK mirroring enums.ts (NOTIFICATION_CATEGORY / PRIORITY /
--     CHANNEL, ACTIVE_SCOPES for actor_scope). DR-B2 uuid PK.
-- The events log is immutable (append-only): no updated_at column / trigger and
-- no lifecycle guard. Notifications carry no canonical status machine, so their
-- state is modeled by timestamps (delivered/read/dismissed/suppressed), not a
-- status enum (avoids inventing a non-canonical vocabulary, G13).

-- ---------------------------------------------------------------------------
-- Event type registry (seeded mirror of contracts events.ts)
-- ---------------------------------------------------------------------------
create table event_types (
  event_type       text primary key,
  domain           text not null,
  is_product_event boolean not null default true,
  created_at       timestamptz not null default now()
);

create index idx_event_types_domain on event_types (domain);

insert into event_types (event_type, domain, is_product_event) values
  -- discovery
  ('search_performed','discovery',true),
  ('filter_applied','discovery',true),
  ('filter_removed','discovery',true),
  ('empty_search_shown','discovery',true),
  ('seek_results_loaded','discovery',true),
  ('swipe_stack_loaded','discovery',true),
  ('map_results_loaded','discovery',true),
  ('listing_impression','discovery',true),
  ('boosted_listing_impression','discovery',true),
  ('featured_employer_impression','discovery',true),
  ('map_pin_impression','discovery',true),
  ('listing_card_opened','discovery',true),
  ('listing_detail_opened','discovery',true),
  ('listing_saved','discovery',true),
  ('listing_unsaved','discovery',true),
  ('listing_swiped_yes','discovery',true),
  ('listing_swiped_no','discovery',true),
  ('listing_shared','discovery',true),
  -- listing_host
  ('listing_draft_created','listing_host',true),
  ('listing_updated','listing_host',true),
  ('listing_submitted_for_review','listing_host',true),
  ('listing_published','listing_host',true),
  ('listing_paused','listing_host',true),
  ('listing_closed','listing_host',true),
  ('listing_archived','listing_host',true),
  ('listing_quality_recalculated','listing_host',true),
  ('host_profile_updated','listing_host',true),
  ('host_profile_completion_prompt_shown','listing_host',true),
  -- application
  ('application_started','application',true),
  ('application_submitted','application',true),
  ('application_viewed_by_host','application',true),
  ('application_status_changed','application',true),
  ('application_withdrawn','application',true),
  ('application_not_selected','application',true),
  ('application_expired','application',true),
  ('application_accepted','application',true),
  ('application_completed','application',true),
  -- invite
  ('invite_created','invite',true),
  ('invite_sent','invite',true),
  ('invite_delivered','invite',true),
  ('invite_viewed','invite',true),
  ('invite_applied','invite',true),
  ('invite_ignored','invite',true),
  ('invite_expired','invite',true),
  ('invite_withdrawn','invite',true),
  ('invite_credit_consumed','invite',true),
  ('invite_credit_restored','invite',true),
  -- offer
  ('offer_created','offer',true),
  ('offer_sent','offer',true),
  ('offer_delivered','offer',true),
  ('offer_viewed','offer',true),
  ('offer_accepted','offer',true),
  ('offer_declined','offer',true),
  ('offer_expired','offer',true),
  ('offer_withdrawn','offer',true),
  -- matching
  ('match_generated','matching',true),
  ('match_marked_stale','matching',true),
  ('match_refreshed','matching',true),
  ('matched_bucket_viewed','matching',true),
  ('match_reason_opened','matching',true),
  ('match_score_clicked','matching',true),
  ('empty_match_bucket_shown','matching',true),
  ('match_pool_building_prompt_shown','matching',true),
  -- messaging
  ('conversation_opened','messaging',true),
  ('message_sent','messaging',true),
  ('message_read','messaging',true),
  ('message_reported','messaging',true),
  ('conversation_restricted','messaging',true),
  ('conversation_closed','messaging',true),
  -- scheduling
  ('scheduling_request_created','scheduling',true),
  ('scheduling_request_sent','scheduling',true),
  ('scheduling_time_selected','scheduling',true),
  ('scheduling_alternate_requested','scheduling',true),
  ('scheduling_cancelled','scheduling',true),
  ('scheduling_completed','scheduling',true),
  ('scheduling_expired','scheduling',true),
  ('scheduling_no_show_reported','scheduling',true),
  -- travel_plan
  ('travel_plan_created','travel_plan',true),
  ('travel_plan_updated','travel_plan',true),
  ('travel_plan_shared_with_host','travel_plan',true),
  ('travel_plan_cancelled','travel_plan',true),
  ('travel_attachment_uploaded','travel_plan',true),
  -- billing
  ('checkout_started','billing',true),
  ('checkout_completed','billing',true),
  ('checkout_failed','billing',true),
  ('subscription_created','billing',true),
  ('subscription_updated','billing',true),
  ('subscription_cancelled','billing',true),
  ('subscription_renewed','billing',true),
  ('entitlement_snapshot_generated','billing',true),
  ('add_on_purchased','billing',true),
  ('add_on_failed','billing',true),
  ('invite_pack_purchased','billing',true),
  ('team_seat_purchased','billing',true),
  ('additional_listing_purchased','billing',true),
  -- refund
  ('refund_review_opened','refund',true),
  ('refund_review_under_review','refund',true),
  ('refund_review_approved','refund',true),
  ('refund_review_denied','refund',true),
  ('refund_processed','refund',true),
  ('refund_failed','refund',true),
  ('service_credit_issued','refund',true),
  ('service_credit_consumed','refund',true),
  -- verification
  ('verification_started','verification',true),
  ('verification_submitted','verification',true),
  ('verification_under_review','verification',true),
  ('verification_more_info_requested','verification',true),
  ('verification_approved','verification',true),
  ('verification_rejected','verification',true),
  ('verification_revoked','verification',true),
  ('verification_expired','verification',true),
  ('reverification_required','verification',true),
  -- moderation
  ('report_submitted','moderation',true),
  ('report_triaged','moderation',true),
  ('moderation_case_created','moderation',true),
  ('moderation_case_escalated','moderation',true),
  ('moderation_action_taken','moderation',true),
  ('content_hidden','moderation',true),
  ('content_removed','moderation',true),
  ('account_restricted','moderation',true),
  ('account_suspended','moderation',true),
  ('account_banned','moderation',true),
  ('account_reinstated','moderation',true),
  ('appeal_submitted','moderation',true),
  ('appeal_resolved','moderation',true),
  -- media
  ('media_uploaded','media',true),
  ('media_processing_started','media',true),
  ('media_processing_failed','media',true),
  ('media_approved','media',true),
  ('media_rejected','media',true),
  ('media_hidden','media',true),
  ('media_removed','media',true),
  ('housing_media_added','media',true),
  ('meals_media_added','media',true),
  -- community
  ('community_feed_loaded','community',true),
  ('community_photo_post_created','community',true),
  ('community_photo_post_viewed','community',true),
  ('community_reaction_added','community',true),
  ('host_announcement_created','community',true),
  ('host_announcement_viewed','community',true),
  ('platform_post_viewed','community',true),
  -- notification
  ('notification_created','notification',true),
  ('notification_delivered','notification',true),
  ('notification_read','notification',true),
  ('notification_dismissed','notification',true),
  ('notification_suppressed','notification',true),
  ('notification_digest_sent','notification',true),
  -- demo
  ('demo_started','demo',true),
  ('demo_tier_selected','demo',true),
  ('demo_section_viewed','demo',true),
  ('demo_upgrade_clicked','demo',true),
  ('demo_signup_started','demo',true),
  -- agent_governance (internal build-governance only; never product analytics)
  ('source_registry_conflict_found','agent_governance',false),
  ('adr_violation_detected','agent_governance',false),
  ('ci_guardrail_failed','agent_governance',false),
  ('schema_drift_detected','agent_governance',false);

-- ---------------------------------------------------------------------------
-- Events log (append-only; immutable -> no updated_at, no lifecycle guard)
-- ---------------------------------------------------------------------------
create table events (
  id                uuid primary key default gen_random_uuid(),
  event_type        text not null references event_types(event_type),
  occurred_at       timestamptz not null default now(),
  -- Actor context. ON DELETE SET NULL preserves the audit/analytics record if
  -- the acting user is later deleted.
  actor_user_id     uuid references auth.users(id) on delete set null,
  actor_scope       text
                      check (actor_scope in ('seeker','host','admin','platform')),
  -- Polymorphic primary subject of the event (e.g. application/offer/listing).
  subject_type      text,
  subject_id        uuid,
  -- Denormalized rollup dimensions (nullable; SET NULL on parent delete).
  listing_id        uuid references listings(id) on delete set null,
  host_profile_id   uuid references host_profiles(id) on delete set null,
  seeker_profile_id uuid references seeker_profiles(id) on delete set null,
  session_id        text,
  source_surface    text,
  properties        jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index idx_events_event_type on events (event_type);
create index idx_events_occurred_at on events (occurred_at);
create index idx_events_actor on events (actor_user_id);
create index idx_events_subject on events (subject_type, subject_id);
create index idx_events_listing on events (listing_id);
create index idx_events_host on events (host_profile_id);
create index idx_events_seeker on events (seeker_profile_id);

-- ---------------------------------------------------------------------------
-- Notifications (per-recipient; state via timestamps, no status machine)
-- ---------------------------------------------------------------------------
create table notifications (
  id                uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  category          text not null
                      check (category in ('applications','offers','invites','billing','safety','community','scheduling','verification','refunds','system')),
  priority          text not null default 'informational'
                      check (priority in ('critical','important','informational')),
  channel           text not null default 'in_app'
                      check (channel in ('in_app','email')),
  title             text not null,
  body              text,
  -- Soft link to the event that produced this notification. No FK: the events
  -- log is high-volume/append-only and may have a different retention horizon
  -- than a user's notification feed.
  event_id          uuid,
  subject_type      text,
  subject_id        uuid,
  action_url        text,
  -- Idempotency key for dedupe/coalescing of repeated triggers.
  dedupe_key        text,
  delivered_at      timestamptz,
  read_at           timestamptz,
  dismissed_at      timestamptz,
  suppressed_at     timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_notifications_recipient on notifications (recipient_user_id);
create index idx_notifications_category on notifications (category);
create index idx_notifications_recipient_unread on notifications (recipient_user_id, read_at);
create index idx_notifications_created_at on notifications (created_at);
create unique index idx_notifications_dedupe_key on notifications (dedupe_key) where dedupe_key is not null;

create trigger trg_notifications_updated_at
  before update on notifications
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Notification preferences (per user, per category, per channel)
-- ---------------------------------------------------------------------------
create table notification_preferences (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  category    text not null
                check (category in ('applications','offers','invites','billing','safety','community','scheduling','verification','refunds','system')),
  channel     text not null
                check (channel in ('in_app','email')),
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint notification_preferences_user_cat_channel_unique unique (user_id, category, channel)
);

create index idx_notification_preferences_user on notification_preferences (user_id);

create trigger trg_notification_preferences_updated_at
  before update on notification_preferences
  for each row execute function set_updated_at();
