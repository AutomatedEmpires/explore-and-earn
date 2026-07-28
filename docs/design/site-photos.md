# Site photography — Explore & Earn

> Supersedes the retired image-CDN asset-management doc (deleted 2026-07-27).
> There is no image CDN in this product any more. **Host uploads live in
> Supabase Storage; the canonical marketing photography set ships IN-REPO.**

## Two libraries, two homes

| Library | Home | Written by |
|---|---|---|
| **Canonical site photography** (marketing surfaces) | `apps/web/public/photos/` — in-repo, optimized WebP | `scripts/fetch-unsplash-photos.mjs` (primary) + `scripts/fetch-commons-photos.mjs` (fallback) |
| **Photo buckets** (host/seeker/housing/meals pickers) | Supabase Storage bucket `site-photos` | `scripts/seed-site-photos.mjs` |
| **Host uploads** (listing + housing media) | Their own Supabase Storage buckets | The product itself |

The rest of this document describes the **photo buckets**, which are still
empty and still awaiting a key. The canonical in-repo set is described
immediately below and has **no runtime dependency** on Supabase Storage.

---

## Canonical site photography (in-repo)

24 photographs ship in `apps/web/public/photos/`, each as two WebP renditions
(`{slug}-1600.webp` hero, `{slug}-800.webp` card) beside
`manifest.json`, the licence + attribution record for the set.

### Reading it

```ts
import { SitePhoto } from "@/components/media/SitePhoto";

<SitePhoto slug="cda-lake-01" size="hero" priority />
```

`apps/web/lib/sitePhotos.ts` is the typed catalog; `SitePhoto` is the only way
these assets should be rendered. An unknown slug throws at render — deliberately
loud, so a typo surfaces at prerender instead of leaving a silent hole.

### The licence bar (never lower it)

Accepted: **Unsplash License · CC0 · Public domain · CC BY · CC BY-SA**.
Rejected: anything NonCommercial, anything NoDerivatives, GFDL-only, non-free /
fair-use, and anything whose licence cannot be determined from the provider API.
A CC-BY/CC-BY-SA file with no parseable author is rejected too — attribution is
a licence condition, and a credit we cannot render is a credit we do not have.

`tests/unit/site-photo-manifest.test.ts` enforces this against the shipped
bytes, so a hand-edited manifest or a swapped asset fails CI.

### Attribution

`/credits` renders **every** manifest entry with photographer, licence and
source link, and is linked from the Legal column of the footer on every page.
That page is how the CC-BY / CC-BY-SA attribution condition is satisfied and how
the Unsplash API guideline on crediting photographers is honoured — it is a
licence obligation, not decoration. `tests/unit/credits-page.test.ts` fails if a
manifest entry does not reach it.

### People safety

A licence is not a model release. People in these frames are incidental and not
identifiable, files flagged with Commons `Restrictions` (personality rights,
trademark) are rejected outright, and **no caption, alt text, or surrounding
copy may present a photographed person as an Explore & Earn host, worker, staff
member, or named individual.** Alt text describes the scene only.

### EXIF / GPS

Every output is re-encoded from decoded pixels and `sharp.withMetadata()` is
never called, so no EXIF block, GPS tag, or camera serial reaches the repo. The
manifest test walks each shipped file's RIFF chunk table and asserts no `EXIF`
or `XMP ` chunk exists — proven against bytes, not asserted in a comment.

### Weight budget

Each rendition is encoded down a quality ladder until it fits a 400 KB budget
(`MAX_ASSET_BYTES` in `scripts/site-photo-pipeline.mjs`). One frame
(`trail-03`, wall-to-wall conifer detail) does not compress under the budget
without visible degradation and ships at ~485 KB; the whole set is ~7.6 MB.

### Re-running acquisition

```
doppler run --project explore-and-earn --config prd -- \
  node scripts/fetch-unsplash-photos.mjs --discover
node scripts/fetch-commons-photos.mjs --discover     # no key needed
node scripts/fetch-commons-photos.mjs --verify-only  # re-audit licences
```

Both scripts pin an exact provider-side id/title per asset, so a rebuild is
reproducible and a file whose licence changed FAILS the run instead of shipping.
Unsplash demo keys allow 50 requests/hour; the client sleeps until the window
resets rather than writing a partial manifest. Pass `--no-trigger` **only** when
re-encoding already-acquired photos — the download endpoint records a *use*, and
firing it for a local re-compress would inflate a photographer's download count.

---

## Photo buckets (Supabase Storage) — still empty

## What changed, and why

The app-managed photo library used to be a curated stock set delivered by a
third-party image CDN. That provider is gone. Rather than repoint the old public
IDs at storage objects that do not exist, everything that referenced them was
removed:

- the delivery helper and its `PhotoSize`/`PhotoCategory` vocabulary,
- the seeded entries in every photo bucket,
- the curated cover presets, the homepage hero rotation's images, the `/jobs`
  and `/jobs/{lane}` hero photos, the `/for-hosts` hero, and the dev fixtures'
  cover + gallery URLs.

Every one of those surfaces now renders the **design system's own gradient
vocabulary** (`--cat-{lane}-cover`, `--gradient-cover-*`, `--gradient-category-*`
from `apps/web/styles/tokens.css`). Layout height, scrims, and contrast are
unchanged — only the fill changed.

This is the founder's standing rule applied literally: **remove the claim or the
asset rather than fake it.** A preset tile pointing at a missing object, or a
photo credit for a photo nobody can see, is the same class of defect as an
unearned badge.

## Storage layout

Bucket: **`site-photos`** (public).

```
site-photos/
├── buckets/
│   ├── manifest.json                       attribution for every object below
│   ├── homepageCover/{slug}.jpg            flat bucket
│   ├── hostCover/{slug}.jpg
│   ├── seekerCover/{slug}.jpg
│   ├── hostProfile/{farm|maritime|remote|seasonal}/{slug}.jpg
│   ├── housing/{bedrooms|bathrooms|exteriors|misc}/{slug}.jpg
│   └── meals/{meals|kitchens|dining|misc}/{slug}.jpg
```

`seekerIcon`, `adminProfile`, and `adminCover` are **never** photo-seeded —
identity buckets need a model release stock licences do not grant, and admin
chrome is brand-neutral gradient by design.

Host-uploaded listing/housing media is a **separate** concern and was untouched:
it already lives in its own Supabase Storage buckets and flows through the DB.

## Delivery URLs

Built by `bucketPhotoUrl(path, size)` in `apps/web/lib/photoBuckets.ts`:

| Size    | Shape |
|---------|-------|
| `full`  | `{SUPABASE_URL}/storage/v1/object/public/site-photos/{path}` |
| others  | `{SUPABASE_URL}/storage/v1/render/image/public/site-photos/{path}?width=&height=&resize=cover&quality=80` |

Named sizes (the direct translation of the old transformations):

| Name | Width | Height |
|---|---|---|
| `thumb` | 320 | — |
| `card` | 640 | — |
| `hero` | 1280 | — |
| `full` | original object | — |
| `og` | 1200 | 630 |
| `sq-sm` | 320 | 320 |
| `sq-md` | 640 | 640 |

**Plan note:** the `render/image` transformation endpoint is a Supabase **Pro**
feature. `full` always resolves to the raw public object, so the system still
delivers something real on a plan without transformations. If transformations are
not enabled, either upgrade or change `bucketPhotoUrl` to serve `full` for every
size — do not leave sized URLs that 4xx.

`next.config.ts` allow-lists both `*.supabase.co/storage/v1/object/**` and
`*.supabase.co/storage/v1/render/image/**` for `next/image`. The service worker
(`apps/web/public/sw.js`) bounded-caches cross-origin images **only** under the
`/public/` path segment, which is what makes shared-device caching safe.

## Bringing photography back

1. Get an Unsplash Access Key (<https://unsplash.com/oauth/applications>) and set
   `UNSPLASH_ACCESS_KEY`, plus `NEXT_PUBLIC_SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`.
2. Create the public `site-photos` bucket in the target Supabase project.
3. Dry run first:
   ```
   node scripts/seed-site-photos.mjs --dry-run --limit=3
   ```
4. Real run (per bucket while you tune the queries):
   ```
   node scripts/seed-site-photos.mjs --bucket=housing
   ```
5. Review the generated fragments and wire them in **together**, in one change:
   - `scripts/site-photos.entries.ts` → `apps/web/lib/photoBuckets.ts`
   - `scripts/site-photos.credits.ts` → `apps/web/lib/photoBucketCredits.ts`

The script triggers Unsplash's download endpoint per used photo (an API ToS
requirement), records full attribution, and uploads the attribution manifest to
`site-photos/buckets/manifest.json` so a credit always travels with its object.
It is idempotent — a re-run upserts the same deterministic paths.

Without the credentials the script exits with a clear error naming the missing
variables. It never writes a partial or fabricated entry.

## The one rule

**An entry exists only when the object exists.** `BucketEntry` has no nullable or
placeholder variant, and there are no "to populate" slots. An empty bucket
renders its honest empty state: the picker offers only "upload your own", and the
admin manager (`/admin/photo-buckets`) reports 0 photos.
