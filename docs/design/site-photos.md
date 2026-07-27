# Site photography — Explore & Earn

> Supersedes the retired image-CDN asset-management doc (deleted 2026-07-27).
> There is no image CDN in this product any more. **All imagery — host uploads
> and app-managed site photography alike — lives in Supabase Storage.**

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
