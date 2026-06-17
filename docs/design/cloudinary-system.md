# Cloudinary Asset Management System — Explore&Earn

> ⚠️ **SUPERSEDED (2026-06-17).** This hand-maintained doc drifted from reality (claimed 566 assets; live count is **974**). The **source of truth** is now the generated manifest [`scripts/assets.manifest.v2.json`](../../scripts/assets.manifest.v2.json) (regenerate via `node scripts/assets-sync.mjs`) and the design spec [`2026-06-17-asset-management-v2-design.md`](../superpowers/specs/2026-06-17-asset-management-v2-design.md). Kept below for historical transform/preset reference only.

> **Living document.** Update whenever you add, remove, or recategorize assets.  
> Last generated: 2026-06-07 | Cloud: `dwiwyt9vi` | Plan: Free (25 credits/mo)

---

## Quick reference

| What you need | Where |
|---|---|
| Add a new photo | [→ Adding photos](#adding-photos) |
| Swap an icon | [→ Replacing icons](#replacing-icons) |
| Change a photo size in code | [→ Named transformations](#named-transformations) |
| Check what's uploaded | Cloudinary console → Media Library → `explore-and-earn/` |
| Re-run the full upload | `node scripts/upload-assets.mjs` |
| Re-run account setup (transforms, presets) | `node scripts/setup-cloudinary.mjs` |

---

## Folder structure

```
explore-and-earn/
├── icons/
│   ├── category/          farm · maritime · remote · seasonal · mix
│   ├── benefit/           housing · meals · pay · transport · wifi
│   ├── mappin/            default · active · cluster
│   ├── trust/             verified_host · founding_host · featured_employer
│   ├── status/            open · partially_filled · filled · boosted · match
│   ├── action/            apply · save · share · report · message · filter · sort
│   │                      back · forward · close · more
│   ├── nav/               seek · swipe · map · saved · messages · dashboard · profile · admin
│   ├── analytics/         meter · funnel · trend · donut · source
│   └── system/            info · success · warning · error · lock · loading
│
├── icons-library/         129 raw Streamline Freehand SVGs (browseable, not in registry)
│
├── illustrations/         57 Streamline Milano illustrative SVGs
│
├── elements/              20 decorative SVG elements
│
└── photos/
    ├── farm/landscape/    ~90 curated Unsplash farm/orchard photos
    ├── maritime/landscape/~65 curated Unsplash maritime/fishery photos
    ├── remote/landscape/  ~38 curated Unsplash remote-work photos
    ├── seasonal/landscape/~70 curated Unsplash seasonal photos
    └── encouragement/     ~40 curated Unsplash encouragement/motivation photos
```

### Naming conventions

- **Icons / SVGs**: kebab-case matching the registry key suffix. `category.farm` → folder `icons/category/`, file `farm`.
- **Photos**: the Unsplash photographer slug as the public ID. `antonio-lapa-dlaiE5PkZ3o`.
- **No file extensions** in Cloudinary public IDs — Cloudinary handles format negotiation.

---

## Named transformations

These are pre-registered on the account and used in all delivery URLs via `t_<name>`.

| Name | Size | Ratio | Use |
|---|---|---|---|
| `t_ee-thumb` | 320×213 | 3:2 | Card rows, list items |
| `t_ee-card` | 640×427 | 3:2 | Discovery card (`<DiscoveryCard>`) |
| `t_ee-hero` | 1280×854 | 3:2 | Listing hero, page tops |
| `t_ee-full` | 1920×1280 | 3:2 | Full-bleed behind-glass moments |
| `t_ee-og` | 1200×630 | OG | Open Graph / social sharing |
| `t_ee-sq-sm` | 96×96 | 1:1 | Avatar small, map pin |
| `t_ee-sq-md` | 192×192 | 1:1 | Avatar medium |

**How they work:**  
`c_fill,g_auto` = AI smart crop to subject. `f_auto` = serves AVIF/WebP/JPEG by browser capability. `q_auto:good` = quality balanced for lifestyle photography.

**Example delivery URL:**
```
https://res.cloudinary.com/dwiwyt9vi/image/upload/t_ee-card/explore-and-earn/photos/farm/landscape/antonio-lapa-dlaiE5PkZ3o
```

**In code** — use the helper:
```ts
import { cloudinaryPhoto } from "@/lib/cloudinary"

// In a component:
<img src={cloudinaryPhoto("farm", "antonio-lapa-dlaiE5PkZ3o", "card")} />
// → https://res.cloudinary.com/dwiwyt9vi/image/upload/t_ee-card/explore-and-earn/photos/farm/landscape/antonio-lapa-dlaiE5PkZ3o
```

---

## Icon delivery

Icons are raw SVG files in Cloudinary. `<Icon name="category.farm" />` fetches the SVG, sanitizes it with DOMPurify, and inlines it — so `color` and `className` work via `currentColor`.

```ts
// In any component:
import { Icon } from "@explore-and-earn/ui"
<Icon name="category.farm" size={24} className="text-accent-farm" />
```

Do **not** import SVG files directly. Do **not** add inline SVG to feature code. Everything goes through `<Icon>`.

---

## Metadata / tagging

Every asset has tags and structured metadata set at upload time.

### Tags (applied to all assets)
| Tag | Meaning |
|---|---|
| `icon` | Registry icon or icon-library SVG |
| `photo` | Curated landscape photo |
| `illustration` | Streamline Milano illustration |
| `element` | Decorative element SVG |
| `farm` / `maritime` / `remote` / `seasonal` / `encouragement` | Category |
| `registry` | Part of the 54-key registry |
| `library` | Icon-library (browseable, not in registry) |
| `landscape` | 3:2 landscape photo |
| `curated` | Hand-selected asset |

### Structured metadata fields (filterable in console)
| Field | Values |
|---|---|
| `ee_asset_type` | `icon` · `icon_library` · `photo` · `illustration` · `element` |
| `ee_category` | `farm` · `maritime` · `remote` · `seasonal` · `mix` · `encouragement` · `system` |
| `ee_scope` | `registry` · `library` · `landscape` · `decoration` |
| `ee_registry_key` | e.g. `category.farm` (icons only) |
| `ee_source` | `streamline_freehand` · `streamline_milano` · `unsplash` · `generated` |

---

## Upload presets

| Preset | Use |
|---|---|
| `ee-photos` | Signed preset for curated photos (quality: auto:good, format: auto) |
| `ee-icons` | Signed preset for SVG icons (raw resource type) |
| `ee-illustrations` | Signed preset for illustration SVGs (raw resource type) |

Reference these in `upload-assets.mjs` when adding new assets.

---

## Adding photos

### Step 1 — Place photos in the local folder
```
C:\Users\autom\projects\automated_empires\explore&earn\photos\
  <category> photos\
    photographer-slug-unsplash-id.jpg
```

Use `photographer-firstname-lastname-unsplash-id` as the filename (Unsplash standard).

### Step 2 — Run the upload script
```bash
cd ventures/explore-and-earn
node scripts/upload-assets.mjs
```

The script is idempotent — it skips already-uploaded files (Cloudinary returns the existing asset). Failures are logged in `scripts/assets.manifest.json` under `errors[]`.

### Step 3 — Check the manifest
```bash
cat scripts/assets.manifest.json | grep '"status"'
```

Or open `scripts/assets.manifest.json` — each photo category has an array of `{ slug, url, width, height, format }` objects.

### Photo selection criteria
- Landscape only (3:2 ratio or wider, crops to 3:2 cleanly)
- No text/watermarks in frame
- Consistent with "adventure, warmth, belonging" tone (Airbnb × Patagonia × NatGeo)
- File size under 10MB (Cloudinary Free plan limit — compress if needed)

---

## Replacing icons

All 54 icon keys map to Streamline Freehand SVG files. The mapping is in:
- **Code**: `scripts/upload-assets.mjs` → `REGISTRY_MAP` constant
- **Registry**: `packages/ui/src/icons/registry.ts` → `cloudinaryId` fields

### Swapping an icon (same key, different SVG)
1. Place the new SVG in the `all-icons/` folder
2. Update `REGISTRY_MAP` in `upload-assets.mjs` to point to the new filename
3. Update `registry.ts` → the icon's `streamline` hint field (documentation only, not functional)
4. Run: `node scripts/upload-assets.mjs` — the script overwrites the Cloudinary asset
5. The new icon is live immediately (CDN may cache for up to 10s — use `?v=2` to bust if needed)

### Adding a new icon key
1. Add the key to `registry.ts` with a `cloudinaryId` set to `"explore-and-earn/icons/{domain}/{name}"`
2. Add the mapping to `REGISTRY_MAP` in `upload-assets.mjs`
3. Run the upload script
4. Add `<Icon name="domain.key" />` anywhere in feature code

**Hard rule**: Maximum 100 registry keys across all domains. Current count: **54**.

---

## Removing assets

### Remove a photo from a category
1. Find the photo's slug from `scripts/assets.manifest.json`
2. Delete from Cloudinary console (Media Library → navigate to folder → trash)
3. Remove from the local `photos/` folder so it doesn't re-upload
4. Remove from `assets.manifest.json` (or re-run the upload script to regenerate)

### Retire an icon key
Icons in the registry should be considered stable (they're used in code). Before retiring:
1. Search the codebase: `grep -r '"domain.key"' apps/ packages/`
2. Remove all usages
3. Remove from `registry.ts`
4. Remove from `REGISTRY_MAP` in `upload-assets.mjs`
5. (Optional) delete from Cloudinary via console

---

## File size limits (Free plan)

| Type | Max size | Action if exceeded |
|---|---|---|
| Images (jpg/png) | 10MB | Compress with `sharp` or Squoosh before upload |
| Raw files (SVG) | 10MB | N/A — Streamline SVGs are <100KB |

Photos that exceed 10MB are logged in `scripts/assets.manifest.json` under `errors[]`. To fix: compress the photo locally and re-run the script.

---

## Cloudinary console tips

**Filter by category in Media Library:**
1. Open Media Library → `explore-and-earn/photos/farm/landscape/`
2. Or use structured metadata filter: `ee_category = farm`

**Find a specific icon:**
1. Media Library → `explore-and-earn/icons/category/`
2. Or search by tag: `tag:icon registry:true`

**Check usage / bandwidth:**
- Dashboard → Usage → Transformations (named transforms are counted here)
- Free plan: 25 credits/month. Each unique transformation + delivery = 1 credit.

**Bulk tag update:**
- Select assets → Actions → "Manage tags"
- Or use Admin API with `resources_by_tag`

---

## Scripts reference

| Script | Purpose | Run |
|---|---|---|
| `scripts/upload-assets.mjs` | Upload / re-upload all assets (icons, photos, illustrations, elements) | `node scripts/upload-assets.mjs` |
| `scripts/setup-cloudinary.mjs` | One-time (idempotent) account setup: metadata fields, transforms, presets | `node scripts/setup-cloudinary.mjs` |

Both scripts read credentials from `.env.local`:
```
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

---

## Delivery URL patterns

```
# Photo at named size:
https://res.cloudinary.com/dwiwyt9vi/image/upload/t_ee-{size}/explore-and-earn/photos/{category}/landscape/{slug}

# Icon (raw SVG — fetched by Icon.tsx):
https://res.cloudinary.com/dwiwyt9vi/raw/upload/explore-and-earn/icons/{domain}/{name}

# Illustration:
https://res.cloudinary.com/dwiwyt9vi/raw/upload/explore-and-earn/illustrations/{slug}

# Element:
https://res.cloudinary.com/dwiwyt9vi/raw/upload/explore-and-earn/elements/{slug}
```

---

## Asset inventory (as of 2026-06-07)

| Type | Count | Notes |
|---|---|---|
| Registry icons | 54 | 9 domains, 54 keys, 0 missing |
| Icon library (browseable) | 129 | Full Streamline Freehand set |
| Illustrations | 57 | Streamline Milano |
| Elements | 20 | Decorative SVGs |
| Farm photos | 89 | 3 skipped (1 >10MB, 2 fetch failed) |
| Maritime photos | 67 | All uploaded |
| Remote photos | 39 | 1 skipped (>10MB) |
| Seasonal photos | 70 | 2 skipped (>10MB) |
| Encouragement photos | 41 | All uploaded |
| **Total** | **566** | 6 failed (logged in `errors[]`) |

**Skipped files** (compress to <10MB and re-run to upload):
- `farm/antonio-lapa-dlaie5pkz3o` (14.9MB)
- `farm/ricardo-gomez-angel-gh-oc8usme8` (fetch failed)
- `farm/ricardo-gomez-angel-j82dskoxvy8` (fetch failed)
- `remote/melina-kiefer-ndmglbywtxu` (16MB)
- `seasonal/abhi-verma-kbzxcaiz35m` (14.4MB)
- `seasonal/le-salama-marrakech-upsrgpkqxiw` (12.7MB)

See `scripts/assets.manifest.json` for exact per-asset URLs and dimensions.
