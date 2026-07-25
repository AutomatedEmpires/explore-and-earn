# Cross-table policy sub-selects on host_profiles.clerk_user_id

**Status:** closed by migration `081_policy_host_identity_helpers.sql`.
Applying 081 to production is founder-operated; this PR applies nothing.

This is the prerequisite that migration 080's deferral note did not know it
needed. 080 scoped the remaining work as "~11 call sites" in application code.
That count was derived from code that *names* the column, and it is incomplete.

## The hazard

080:15 states, correctly, that an RLS policy on `host_profiles` is evaluated as
the table owner — which is why `host_profiles_select_own` is not affected by a
column revoke.

That property does **not** extend to a policy on a *different* table whose
`USING` / `WITH CHECK` contains a sub-select against `host_profiles`. There the
sub-select becomes an ordinary range-table entry in the rewritten query and is
permission-checked against the **invoking** role, column bitmap included.

Eleven such policies existed, all in the same shape:

```sql
<col> in (select hp.id from host_profiles hp
           where hp.clerk_user_id = auth.jwt() ->> 'sub')
```

| Table | Policies |
| --- | --- |
| `public.host_announcements` | `owner_read_all`, `owner_insert`, `owner_update` |
| `storage.objects` (`listing-media`) | `select` / `insert` / `update` / `delete` `_own_folder` |
| `storage.objects` (`profile-photos`) | `select` / `insert` / `update` / `delete` `_own_folder` |

They were enumerated from `pg_policy` on a database rebuilt through 080 — not by
grepping migrations — so a policy created in one migration and superseded in
another is counted once, in its live form. Four migrations (017, 023, 031, 072)
contributed to the live set.

## What would have happened

Had the revoke landed on its own, every **authenticated** operation below would
have failed with `42501 permission denied`:

- every listing cover and gallery upload, update and delete (`listing-media`)
- every profile photo upload — **host and seeker alike**
- every read of the host announcements community feed, for every signed-in user

None of that is `host_profiles` code, so none of it would have been found by
reviewing `host_profiles` call sites. Two further properties make it worse:

- **`OR` does not save the seeker branch.** The `profile-photos` policies are
  `(host branch OR seeker branch)`. Permission checking is per-range-table-entry
  and is not short-circuited by a branch that would have matched, so a seeker —
  who has no `host_profiles` row and no business reading one — fails on a
  `host_profiles` column.
- **A visual smoke test would not have caught it.** Public image delivery goes
  through `/storage/v1/object/public/`, which bypasses `storage.objects` RLS
  entirely (023 documents this). The site would have looked fine while every
  upload was broken.

## Evidence

Verified empirically against a local instance of this database rather than
reasoned about, using role `authenticated`, real column-level grants, and a
policy sub-select on a second table:

| Probe | Result |
| --- | --- |
| `SELECT` through a policy whose sub-select filters an **ungranted** column of another table | `42501` |
| identical shape, column **granted** (control) | row returned |
| an `OR` branch that would have matched, other branch touches ungranted column | `42501` |
| same sub-select routed through a `SECURITY DEFINER` helper | allowed |
| `WHERE ungranted_col = x`, selecting only granted columns | `42501` |
| `UPDATE ... WHERE ungranted_col = x` | `42501` |
| `.is(ungranted_col, null)` filter | `42501` |
| policy on **its own** table referencing an ungranted column | allowed |

The last two rows confirm 080's own reasoning: a column used only in a filter
still needs `SELECT`, and a same-table policy does not.

## The fix

Each sub-select is replaced by the `SECURITY DEFINER` helper that already exists
for exactly this purpose (`public.current_host_profile_ids()` /
`public.current_seeker_profile_ids()`, migration 013). This is not a new pattern
— it is the pattern already backing `listings_select_own`,
`listings_update_own`, `listings_delete_own`, `conversations_select_party`,
`host_attestations_all_own`, `host_seeker_dispositions_all_own`,
`team_memberships_all_host` and `invites_select_party`. The eleven policies were
the inconsistent ones.

Semantics are unchanged. `current_host_profile_ids()` is
`select id from public.host_profiles where clerk_user_id = get_clerk_user_id()`,
and `get_clerk_user_id()` is `auth.jwt() ->> 'sub'` gated on
`^user_[A-Za-z0-9_-]+$`. The only delta is that a malformed `sub` resolves to
NULL rather than being compared literally — strictly narrower, and unreachable
in practice.

072's Housing-evidence carve-out (`library/housing`, `benefit/housing` paths are
service-role-only) is reproduced verbatim in the rewritten `listing-media`
insert and update policies.

## Guardrails

Three, at different layers:

1. **In the migration.** 081 ends with a `DO` block that fails the migration —
   and therefore the db-migrate pipeline — if any policy reachable by `anon` or
   `authenticated` still sub-selects `host_profiles.clerk_user_id`. A future
   migration reintroducing the inline pattern cannot apply.
2. **In CI, static.** `G-POLICY-HOST-IDENTITY` in `tools/db-assert/check.mjs`
   (runs under `pnpm guardrails`) pins the rewritten policy set, requires both
   helpers, requires the Housing carve-out to survive, and rejects any inline
   `hp.clerk_user_id` in executable SQL. It strips `--` comments before that last
   check, because this migration explains the old expression in its header and a
   raw scan would fail on its own documentation.
3. **In CI, DB-connected.** `tools/db-assert/sql/assert_rpc_grants.sql` now
   *requires* the helper form for the two host-bearing storage SELECT policies
   rather than merely tolerating it — reverting to the inline sub-select fails
   the gate. `community_photos_owner_select` is untouched by 081 and keeps the
   legacy shape check.

`assert_housing_photo_library.sql` is the positive control: it sets
`role authenticated` with a Clerk-shaped JWT claim and performs a real insert
into a host's own `listing-media` folder. It passes against the rewritten
policies, which is what proves they still grant what they should.

## Not done here — the actual revoke (082)

081 deliberately revokes nothing. It only removes dependencies, so it is safe to
apply alone and safe to leave applied if the revoke is deferred.

Remaining before `clerk_user_id` / `deleted_at` can be withdrawn from
`authenticated`:

**Application call sites.** A 47-agent sweep classified 40 of 121 candidate
sites and found 24 at risk; the remaining 81 candidates were not classified and
are mostly tests, type files and migrations, but that has **not** been verified —
treat 24 as a floor, not a total. The shapes are:

- Six near-identical private resolvers doing
  `.from("host_profiles").select("id").eq("clerk_user_id", clerkUserId)`
  (`listings.ts:984`, `listingLifecycle.ts:80`, `invites.ts:422`,
  `benefitDetails.ts:78`, `messages.ts:183`, `hostAnalytics.ts:19`, plus
  `applications.ts:363,510`, `inviteEntitlements.ts:128`, `community.ts:60,696`,
  `hostSourcing.ts:76`, `seekerResume.ts:295`). All of these can call the
  **existing** `current_host_profile_ids()` RPC — no new function needed.
- `hostProfiles.ts:134-135` (`getHostProfile`) uses **both** columns as filters
  and throws on error. It gates the entire `/host` lane. Needs a
  `get_my_host_profile()` RPC that resolves the row from the JWT internally.
- `hostProfiles.ts:174` (`getHostSubscriptionTier`) and `hostProfiles.ts:241`
  (`updateHostProfileDetails` — an **UPDATE** whose `WHERE` names the column, so
  saving a profile breaks, not just reading).
- Two genuine **cross-host** reads that an owner-scoped RPC cannot cover, and
  which need an authorization contract of their own:
  - `applications.ts:119` — the self-application guard. It reads another host's
    `clerk_user_id` through an embed, and **discards the error**, so a revoke
    would silently stop enforcing `cannot_apply_to_own_listing` rather than fail
    loudly. This one must become an RPC, never merely be allowed to fail.
  - `emailContext.ts:54` (and `:39`, `:197`, `:217`) — the invite-accept and
    new-message email paths. All swallow errors, so a revoke silently stops
    sending transactional email.

**CI.** `tools/db-assert/sql/assert_profile_onboarding.sql:209` filters
`host_profiles.clerk_user_id` while `set local role authenticated` is in effect
(set at 202, reset at 215). It breaks at the same moment the app does and must
be rewritten in the same change.

**Verification.** The failure mode is a runtime 403, not a type error, and the
dev bench runs as `service_role` — it will pass regardless and is worthless
here. Use the `role: "authenticated"` JWT harnesses
(`packages/db/tests/rlsIsolation.test.ts:41`,
`listingHostStatusIntegration.test.ts:34`) or a `set local role authenticated`
SQL probe. Note that the two negative controls in
`assert_housing_photo_library.sql:199-221` swallow `insufficient_privilege`, so
they would keep passing for the wrong reason post-revoke; line 224 is the one
that discriminates.

**Timing.** Production currently holds zero hosts, zero seekers and zero live
listings, so this is the cheapest moment this change will ever have.

## Adjacent, deliberately not changed

- `seeker_profiles` grants all 40 columns to `anon` and `authenticated`, but its
  only policies are owner-scoped (`clerk_user_id = get_clerk_user_id()`) and
  there is no public policy, so `anon` reaches zero rows and an authenticated
  user reaches only their own. Not a leak; left alone.
- `community_photos_owner_select` and the `community_photos` policies still
  inline a `seeker_profiles.clerk_user_id` sub-select. Same class of coupling,
  but `seeker_profiles.clerk_user_id` is not being revoked, so changing them
  would add risk without benefit. Tracked as a consistency follow-up.
