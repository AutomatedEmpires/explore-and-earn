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
- **DR-B1 / DR-B2** — text+CHECK enums (mirroring `enums.ts`), uuid PKs.
- **G16** — `media_assets.moderation_status` and `.processing_status` validated
  by `enforce_lifecycle_transition()`. Listings have no canonical transition map
  yet, so no listing lifecycle guard is attached.

## Notes for review

- `category_tags` on resume rows are constrained to the canonical marketplace
  categories for matching consistency; `skill_tags` are freeform.
- `listing_media_overrides.bucket_type` uses the full `MEDIA_BUCKET_TYPE` set;
  flag if listing overrides should be restricted to a narrower subset.
- `media_assets.bucket_id` is `on delete set null` so assets survive bucket
  deletion; `listing_media_overrides.media_asset_id` cascades on asset deletion.
