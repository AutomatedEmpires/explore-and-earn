# Data readiness runbook

Owner: Lane D (data & observability). Scope: confirm the state of business data
and provide a reproducible path to populate empty environments.

## 1. Verified current state (read-only)

Verified **2026-06-07** against the Explore&Earn Supabase project
`mamosbzcbigcclafhmmr` (`explore&earn`, Postgres 17, region us-west-2) using
read-only count queries. RLS is enabled on every public table.

### Reference / configuration tables

| Table                  | Rows | Classification                 | Notes                                                                                                                                                             |
| ---------------------- | ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lifecycle_transition` | 171  | Reference (migration-seeded)   | Canonical state-machine transitions; read by `enforce_lifecycle_transition()`.                                                                                    |
| `event_types`          | 156  | Reference (migration-seeded)   | Analytics/event taxonomy.                                                                                                                                         |
| `attestation_policy`   | 0    | Reference (founder-configured) | **Empty.** No published host attestation policy exists yet, so no host can attest until a `version` is published and marked `is_current`. Pre-launch action item. |

### Business-critical tables — ALL EMPTY (0 rows)

`users_profile_shadow`, `seeker_profiles`, `host_profiles`, `host_attestations`,
`team_memberships`, `seeker_resume_experiences`, `seeker_resume_educations`,
`seeker_certifications`, `media_buckets`, `media_assets`, `listings`,
`listing_relevance_extensions`, `listing_media_overrides`, `applications`,
`invites`, `offers`, `saved_listings`, `host_seeker_dispositions`, `events`,
`notifications`, `notification_preferences`, `conversations`, `messages`.

**Conclusion:** the platform schema is fully migrated (through `021`) and
reference data is seeded, but there is **no business data**. Environments must be
populated either through real product usage or via the seed tooling below.

## 2. Re-running the verification

The check is read-only and safe in any environment, including production:

```bash
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  pnpm --filter @explore-and-earn/web exec node ../../tools/data/verify-data-state.mjs
```

Equivalent raw SQL (run in the Supabase SQL editor as a read-only check):

```sql
select c.relname as table,
       s.n_live_tup as live_rows
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where c.relkind = 'r' and n.nspname = 'public'
order by c.relname;
```

For exact (not estimated) counts of a single table:

```sql
select count(*) from public.listings;
```

## 3. Reproducible seeding

`tools/data/seed-demo-data.mjs` creates a small, FK-correct, enum-correct demo
dataset (2 hosts, 3 seekers, 3 live listings, 2 applications). It is idempotent:
auth users are matched by email and profiles/listings/applications use
deterministic UUIDv5 ids, so re-running converges without duplicates.

### Why this is founder-operated, not agent-run

- It **writes** to `auth.users` (via the admin API) plus business tables.
- `seeker_profiles.user_id` and `host_profiles.owner_user_id` are FKs to
  `auth.users(id)`, so real auth users must exist first — this is why a plain
  SQL insert is not sufficient and the script uses the service-role admin API.
- Per Lane D safety rules, agents do not mutate any environment without explicit
  founder authorization in-session.

### Founder-run steps (dev/staging only)

1. Choose a **non-production** project or a Supabase preview branch.
2. Confirm it is empty first:
   ```bash
   ... node ../../tools/data/verify-data-state.mjs --expect-business-empty
   ```
3. Run the seed (all gates required):
   ```bash
   SEED_ALLOW_NONPROD=true \
   SEED_TARGET_REF="<ref>" \
   SUPABASE_URL="https://<ref>.supabase.co" \
   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
     pnpm --filter @explore-and-earn/web exec node ../../tools/data/seed-demo-data.mjs --confirm
   ```
4. Re-run the verification to confirm the expected counts.

### Resetting seeded data (dev/staging only)

Seeded rows cascade from the seeded auth users. To remove them, delete the
seeded auth users (emails ending `@seed.exploreandearn.test`); the
`on delete cascade` FKs remove the dependent profiles, listings, applications,
etc. Never run this against production.

## 4. Production data readiness — founder action items

- [ ] Publish attestation policy `version` 1 and set `is_current = true`
      (`attestation_policy` is currently empty; hosts cannot attest until then).
- [ ] Decide whether production launches with real onboarded hosts/seekers or a
      curated seed; if seeding prod is ever desired it must be explicitly
      founder-authorized and is out of scope for any agent run.
- [ ] Confirm `SUPABASE_SERVICE_ROLE_KEY` is stored only in the founder's secret
      manager (Doppler), never committed.
