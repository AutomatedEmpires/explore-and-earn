# Migrations V1 — Core (004-006)

**Status:** authored for review only; not applied to any live DB by this PR.
Stacked on `backend/migrations-v1-foundation` (PR #87). References tables from
001-003 (`seeker_profiles`, `host_profiles`) and the lifecycle engine from 001.

| File | Contents |
| --- | --- |
| `004_seeker_resume.sql` | `seeker_resume_experiences`, `seeker_resume_educations`, `seeker_certifications` (cascade from `seeker_profiles`). |
| `005_media.sql` | `media_buckets`, `media_assets` + media moderation/processing lifecycle guards. |
| `006_listings.sql` | `listings`, `listing_relevance_extensions`, `listing_media_overrides`. |

## Canon decisions enforced

- **G7** — one canonical `listings` object across all categories; category-
  specific depth is rows in `listing_relevance_extensions`, not separate tables.
- **DR-B6** — `listings.mix_domains` constrained to the four non-mix domains
  (`farm`/`maritime`/`remote`/`seasonal`); a CHECK forbids mix_domains on a
  non-`mix` listing.
- **DR-B3** — listing compensation + seeker pay stored as integer cents.
- **Discovery Card triad** — Housing/Meals/Pay are first-class columns; there is
  no generic `perks` bucket on `listings`.
- **DR-B1 / DR-B2** — text+CHECK enums (mirroring `enums.ts`), uuid PKs.
- **G16** — `media_assets.moderation_status` and `.processing_status` validated
  by `enforce_lifecycle_transition()`. Listings have no canonical transition map
  yet, so no listing lifecycle guard is attached.

## Data-integrity CHECKs & guards

- Resume experiences/educations: `end_date >= start_date`; experiences also
  enforce `is_current => end_date is null`.
- Certifications: `expires_at >= issued_at`.
- Listings: `ends_at >= begins_at`, `compensation_max >= compensation_min`, and
  `listings_role_counts_chk` (`accepted_count <= role_count` and
  `remaining_role_count = role_count - accepted_count`) so the redundant
  availability counters can't drift.
- All `<@` array CHECKs also assert no NULL elements
  (`array_position(col, null) is null`); a NULL element would otherwise make the
  containment test evaluate to NULL and pass.

## Notes for review

- `category_tags` on resume rows are constrained to the canonical marketplace
  categories for matching consistency; `skill_tags` are freeform.
- `listing_media_overrides.bucket_type` is narrowed to the user-uploaded
  listing-media buckets from `packages/contracts/src/media.ts`
  (`housing`, `meals`, `facilities`, `cover_photo`, `community_photo`,
  `verification_evidence`). `media_asset_id` is `NOT NULL` and
  `enforce_listing_media_override()` additionally requires the referenced asset
  to live in a media bucket owned by the same listing with a matching
  `bucket_type`, so evidence/travel/icon media can't be relabeled into a listing
  gallery.
- `media_assets.bucket_id` is `NOT NULL` with `on delete restrict`: every asset
  belongs to exactly one bucket, and a bucket cannot be deleted while it still
  owns assets (remove the assets first — that cascades to any
  `listing_media_overrides`). `listing_media_overrides.media_asset_id` cascades
  on asset deletion.
- Deferred to the RLS / integrity migration: an update-time guard that prevents
  an asset's `bucket_id` (or a bucket's `owner_type`/`owner_id`/`bucket_type`)
  from being changed out from under an existing `listing_media_overrides` or
  `listings.cover_asset_id` reference. Inserts/updates of the references
  themselves are already validated by `enforce_listing_media_override()` and
  `enforce_listing_cover_asset()`.
