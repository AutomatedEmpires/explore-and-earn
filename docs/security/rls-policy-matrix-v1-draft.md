# RLS Policy Matrix — V1 (DRAFT, review-only)

> Per-table access matrix, verified against the canon **Permission, Visibility & RLS Registry** and the RLS Policy Plan. Deny-by-default + FORCE (DR-B11). Frontend locks are UX only; truth is enforced in Postgres RLS + server middleware (G14). NOT executed.

## Roles / claims model (verified)
- **anon** — logged-out; public-safe views only.
- **authenticated** with `scope` claim: `seeker` | `host` | `admin` | `platform`.
- **Host team scopes** (read from `team_memberships`, NOT JWT — DR-B9): `owner`, `admin`, `hiring_manager`, `analyst`, `billing`, `viewer`.
- **Admin sub-roles**: `super_admin`, `trust_safety_admin`, `billing_admin`, `verification_admin`, `support_admin`, `content_admin`, `read_only_admin`.
- **service_role** — server-only, used after `requireEntitlement()` passes.
- **demo_viewer** — denied on every production table (G19).

## Visibility classes (verified)
`public · authenticated · owner · owner_team · contextual(application|invite|offer|matched_bucket|accepted_active|dispute_support) · admin_internal · sensitive`. “Contextual” must always name its context (registry rule).

## Matrix

<table header-row="true">
<tr><td>Table</td><td>Public read</td><td>Authenticated write</td><td>Notes / context binding</td></tr>
<tr><td>seeker_profiles</td><td>none (raw); safe view only</td><td>owner where user_id=auth.uid()</td><td>matched-bucket exposes limited card via view, never raw row</td></tr>
<tr><td>host_profiles</td><td>public where account_status=active via safe view</td><td>owner/team (profile-edit scope)</td><td>attestation_status: read via safe view; full row admin-only; account_status admin-write only</td></tr>
<tr><td>host_attestations</td><td>none</td><td>INSERT by host owner/team(profile-edit) for own host_profile_id only</td><td>append-only; no admin queue; mirror updated via RPC trigger (G2)</td></tr>
<tr><td>team_memberships</td><td>none</td><td>owner manages; member reads own</td><td>source of host scopes</td></tr>
<tr><td>listings</td><td>public where status=live via safe view</td><td>owner/team (listing_* scopes)</td><td>publish gated by completion+capacity</td></tr>
<tr><td>applications</td><td>none</td><td>seeker owns (insert/withdraw); host reads where listing in host team</td><td>application context; host sees resume_snapshot</td></tr>
<tr><td>invites</td><td>none</td><td>host(invite_send) insert; recipient reads/acts</td><td>invite context; debit ledger; expires 14d</td></tr>
<tr><td>offers</td><td>none</td><td>host(offer_send) insert; recipient accept/decline</td><td>offer context; expires 7d</td></tr>
<tr><td>match_results</td><td>none</td><td>system-generated; host reads if entitled</td><td>matched_bucket context; starter can view, cannot invite w/o credits</td></tr>
<tr><td>messages</td><td>none</td><td>participants only</td><td>admin only via report/dispute/moderation/support case</td></tr>
<tr><td>conversation_threads</td><td>none</td><td>participants; created via start_conversation()</td><td>context_type ∈ {invite,application,offer,dispute,support} (G12)</td></tr>
<tr><td>travel_plans</td><td>none</td><td>seeker owner</td><td>host reads only if shared_with_host=true and context belongs to host</td></tr>
<tr><td>media_assets</td><td>public where moderation_status=approved AND visibility∈{authenticated,public}</td><td>owner/team upload</td><td>pending media owner/team/admin only (G10); sensitive media never permanent public URL</td></tr>
<tr><td>subscriptions / billing</td><td>none</td><td>host owner; billing-scoped member as permitted</td><td>Stripe IDs are admin_internal; non-billing member sees none</td></tr>
<tr><td>refund_reviews</td><td>none</td><td>host owner/billing insert; admin billing/support manage</td><td>only refund execution path (G5); invite_credit_purchase insert rejected</td></tr>
<tr><td>service_credit_ledger</td><td>none</td><td>system; host owner/billing read</td><td>FIFO, 12mo expiry (G29)</td></tr>
<tr><td>host_removal_appeals</td><td>none</td><td>INSERT removed-host owner within 14d; decision UPDATE super/trust_safety admin</td><td>grant -> account_status=active (audited)</td></tr>
<tr><td>positive_reactions</td><td>aggregate counts to authenticated</td><td>INSERT/DELETE seekers only</td><td>hosts/admins forbidden from writing reactions</td></tr>
<tr><td>audit_logs</td><td>none</td><td>system append-only (in-txn, G15)</td><td>admin read by role; 7yr retention (G28)</td></tr>
<tr><td>analytics_events</td><td>none</td><td>system append</td><td>demo excluded (G19); 24mo retention</td></tr>
<tr><td>demo_*</td><td>demo_viewer only</td><td>demo session only</td><td>denied to prod roles; reseeded nightly (G19)</td></tr>
</table>

## Safe public views (canon)
`public_listings_view`, `public_host_profiles_view`, `public_community_feed_view` — `security_barrier` views projecting only safe fields, stripping `trust_score`/`discovery_display_score`/`internal_*` (G11). Public reads hit views, never raw tables (DR-B11).

## Admin RLS note
Admin access may be enforced at the service layer for some queries, but sensitive data (Stripe IDs, raw resumes, trust components, case evidence) must still be protected at the row level so a service bug cannot leak it. Case-scoped admin reads (messages, evidence) require an open report/dispute/moderation/support case binding the target.
