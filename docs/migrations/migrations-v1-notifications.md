# Migrations V1 - notifications + events layer (008)

Stacked on foundation (001-003), core (004-006), and applications (007), all on
`main`. **Authored review-only - not applied to any live DB by this PR.**

## Tables

- **event_types** - seeded reference table mirroring
  `packages/contracts/src/events.ts` (EVENT_TYPES). 152 rows across 18 domains.
  `is_product_event = false` for the four AGENT_GOVERNANCE_EVENTS so analytics
  can exclude internal build-governance signals. Modeled as a seeded table + FK
  (same pattern as 001's `lifecycle_transition`) instead of a 152-value CHECK.
- **events** - append-only product/lifecycle/analytics log. `event_type` FKs
  `event_types`. Immutable: no `updated_at`, no lifecycle guard. Actor context
  (`actor_user_id` SET NULL on delete, `actor_scope` mirrors ACTIVE_SCOPES),
  polymorphic `subject_type`/`subject_id`, plus denormalized rollup dimensions
  (`listing_id`/`host_profile_id`/`seeker_profile_id`, all SET NULL) and a
  `properties` jsonb payload.
- **notifications** - per-recipient feed. `category` / `priority` / `channel`
  mirror NOTIFICATION_CATEGORY (10) / NOTIFICATION_PRIORITY (3) /
  NOTIFICATION_CHANNEL (2). No canonical status machine, so state is tracked via
  `delivered_at` / `read_at` / `dismissed_at` / `suppressed_at` timestamps. A
  partial unique index on `dedupe_key` (where not null) supports coalescing.
- **notification_preferences** - per (user, category, channel) opt-in toggle,
  unique on that triple.

## Canon

- **G13** event vocabulary stays single-sourced: `event_types` mirrors
  `events.ts`; the contract/registry must change first.
- **DR-B1** text+CHECK for notification category/priority/channel and
  `events.actor_scope`; **DR-B2** uuid PKs.
- No invented status enums: notification + event lifecycles are expressed by the
  registry and timestamps, not new vocabularies.

## Review asks

1. Confirm `event_types` is an exact 1:1 with `EVENT_TYPES` in `events.ts` (152
   names, no typos, no omissions) and that flagging only AGENT_GOVERNANCE_EVENTS
   as non-product is correct.
2. Confirm the seeded-table + FK approach for the event vocabulary is preferred
   over a CHECK (consistent with `lifecycle_transition`).
3. `notifications.event_id` intentionally has no FK to `events` - confirm that
   decoupling (retention divergence) is acceptable.
4. Confirm modeling notification state via timestamps (vs a status column) is
   acceptable given there is no NOTIFICATION_STATUS enum.

## Follow-ups

`009` monetization -> `010` messaging/scheduling -> `011` moderation/audit ->
`012` matching/discovery -> `013` community -> `014` analytics, then RLS +
`db:assert` / `rls:test`.
