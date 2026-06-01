# Migration Manifest — V1 (DRAFT, review-only)

> The dependency-ordered migration plan, verified against the canon **Supabase Migration Order, RLS Policy Plan & Seed Data Strategy**. NOT executed. No file under `supabase/migrations/` is created by this PR. Executing any migration is a founder/ops gate (see founder-approval-queue).

## Principle (canon)
Migrations follow strict dependency order — never create advanced tables before identity/profile/listing foundations exist. Each migration is forward-only with a paired rollback; `CREATE INDEX CONCURRENTLY` steps (see indexes doc) run outside a txn block as their own steps.

## Manifest (canon 001–014 + DR-B7 fold-ins)

<table header-row="true">
<tr><td>#</td><td>Migration</td><td>Core tables (canon)</td><td>DR-B7 fold-ins (justified)</td><td>RLS</td></tr>
<tr><td>001</td><td>extensions_and_enums</td><td>pgcrypto/uuid ext; updated_at helper; enum CHECK domains (DR-B1)</td><td>enum text+CHECK generated from Enum Registry</td><td>n/a</td></tr>
<tr><td>002</td><td>user_profile_shadow</td><td>users (shadow of auth.users, scope+status)</td><td>trigger to mirror auth.users (DR-B9)</td><td>owner</td></tr>
<tr><td>003</td><td>profiles</td><td>seeker_profiles, host_profiles, team_memberships</td><td>host_attestations (append-only) + set_host_attestation() RPC; attestation mirror cols on host_profiles (G2/G3)</td><td>owner/team</td></tr>
<tr><td>004</td><td>resume_tables</td><td>seeker_resume_experiences, _educations, certifications</td><td>—</td><td>seeker owner</td></tr>
<tr><td>005</td><td>media</td><td>media_buckets, media_assets</td><td>moderation_status + visibility predicates (G10)</td><td>public(approved)/owner</td></tr>
<tr><td>006</td><td>listings</td><td>listings, listing_relevance_extensions, listing_media_overrides</td><td>proposed listings.mix_domains text[] (DR-B6, FQ-2)</td><td>public(live)/host</td></tr>
<tr><td>007</td><td>applications_invites_offers</td><td>saved_listings, applications, host_saved_seekers, host_skipped_seekers, invites, offers</td><td>unique active-application guard; invite_credit debit hook</td><td>seeker/host ctx</td></tr>
<tr><td>008</td><td>notifications_events</td><td>notifications, notification_preferences, analytics_events</td><td>notification_suppression_rules (G18); analytics_events partitioning candidate</td><td>owner</td></tr>
<tr><td>009</td><td>billing_entitlements</td><td>subscriptions, plan_entitlements, add_on_purchases, invite_credit_ledger, boost_campaigns, featured_employer_campaigns</td><td>stripe_webhook_events(event_id PK, G17); service_credit_ledger (G29); refund_reviews; founding_program_state + claim_founding_seat() (G24)</td><td>host owner/billing</td></tr>
<tr><td>010</td><td>messaging_scheduling_travel</td><td>conversation_threads, messages, scheduling_requests, travel_plans</td><td>start_conversation() context binding (G12); rate-limit metadata (G26)</td><td>participant</td></tr>
<tr><td>011</td><td>reports_moderation_audit</td><td>reports, moderation_cases, moderation_actions, audit_logs</td><td>host_removal_appeals (ADR-029) + appeal-grant reinstatement trigger</td><td>admin/case ctx</td></tr>
<tr><td>012</td><td>matching_discovery</td><td>match_results, discovery_sessions, discovery_impressions</td><td>match_results.is_stale + uq(listing,seeker)</td><td>host ctx (gated)</td></tr>
<tr><td>013</td><td>community_content_feed</td><td>community_photo_posts, host_announcements, platform_posts, feed_items</td><td>positive_reactions (seeker-only writes, G-permission)</td><td>scoped</td></tr>
<tr><td>014</td><td>analytics_snapshots</td><td>analytics_snapshots, dashboard snapshot structures</td><td>retention sweep hooks (G28)</td><td>admin/host</td></tr>
</table>

## Why fold-ins land where they do (DR-B7 defense)
- **Attestation in 003** — it is a property of `host_profiles`; the RPC + mirror columns must exist with the profile, not bolted on later.
- **Billing cluster in 009** — `stripe_webhook_events`, `service_credit_ledger`, `refund_reviews`, and `founding_program_state` are all entitlement/money tables; co-locating them keeps FK and trigger cohesion (a refund references a subscription; a founding seat references a subscription).
- **Appeals in 011** — a removal appeal is a moderation/audit artifact and reinstatement writes audit rows; it belongs with moderation, not billing.
- **Suppression in 008** — governs notification fan-out (G18), so it ships with notifications.

## RLS enablement point
RLS is authored alongside each table but **enabled** as an explicit, founder-gated step after policy tests pass (DR-B11). No migration here flips `ENABLE ROW LEVEL SECURITY` on a live project.

## Open sequencing TODOs (escalated)
- TODO(verify): whether `reviews` + `check_ins` (present in Enum/Lifecycle registries) get a 015 migration or fold into 011/012. Defaulting to a **deferred 015_reviews_checkins** since they are post-role trust signals, not core marketplace flow.
