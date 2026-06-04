# Migrations V1 - applications layer (007)

Stacked on the foundation (001-003) and core (004-006) layers, now on `main`.
**Authored review-only - not applied to any live DB by this PR.**

## Tables

- **applications** - seeker -> listing. Lifecycle machine `application`
  (applied -> reviewing/saved_by_host/offered -> accepted -> active ->
  completed, plus not_selected/withdrawn/expired terminals). One row per
  (listing, seeker) via `applications_listing_seeker_unique`. `origin_invite_id`
  is a plain uuid (no FK) to avoid a creation cycle with `invites.application_id`
  (same pattern as `host_profiles.current_attestation_id`).
- **invites** - host -> seeker invitation to apply. Lifecycle machine `invite`
  (created -> delivered -> viewed -> applied, plus ignored/expired/withdrawn).
  `application_id` (ON DELETE SET NULL) links the invite to the application it
  produced. One row per (listing, seeker).
- **offers** - host -> seeker formal offer. Lifecycle machine `offer`
  (created -> delivered -> viewed -> accepted/declined, plus expired/withdrawn).
  Money as integer cents (DR-B3); `compensation_unit` mirrors COMPENSATION_UNIT.
  `application_id` ON DELETE SET NULL.
- **saved_listings** - seeker bookmarks. SAVED_LISTING_STATUS (saved/removed).
  No canonical lifecycle map, so a plain CHECK and no guard trigger. One row per
  (seeker, listing).
- **host_seeker_dispositions** - host pipeline board view of a seeker per
  listing. HOST_SEEKER_DISPOSITION (saved/skipped/invited/offered/not_selected/
  accepted). No lifecycle map -> plain CHECK only. One row per (listing, seeker).

## Canon

- **G16** lifecycle guards on applications/invites/offers via
  `enforce_lifecycle_transition(<machine>, 'status')`, firing only when `status`
  actually changes (matches the 005 media guards).
- **DR-B1** text + CHECK mirroring `enums.ts`; **DR-B2** uuid PKs; **DR-B3**
  integer cents.
- Expiry windows (application 30d / invite 14d / offer 7d) come from
  `LIFECYCLE_EXPIRY_DAYS` and are applied by the scheduled-jobs layer, not by DB
  defaults.

## Review asks

1. Confirm the four status CHECK tuples exactly match APPLICATION_STATUS (10),
   INVITE_STATUS (7), OFFER_STATUS (7), and HOST_SEEKER_DISPOSITION (6) in
   `enums.ts`.
2. Sanity-check the FK delete semantics: `application_id` SET NULL on both
   invites and offers; everything else CASCADE from listing/host/seeker.
3. Confirm the (listing, seeker) uniqueness on applications/invites/dispositions
   and (seeker, listing) on saved_listings is the intended grain.

## Follow-ups

`008` notifications/events -> `009` monetization -> `010` messaging/scheduling
-> `011` moderation/audit -> `012` matching/discovery -> `013` community ->
`014` analytics, then RLS + `db:assert` / `rls:test`.
