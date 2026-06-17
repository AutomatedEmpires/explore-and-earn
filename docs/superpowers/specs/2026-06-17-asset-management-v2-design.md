# Explore&Earn — Asset Management System V2

> **Status:** Approved direction (Approach A — reconcile & govern in place). Authored 2026-06-17 by Claude (Opus 4.8) acting as asset manager, on founder delegation ("KISS — you are in control").
> **Supersedes / reconciles:** [`docs/design/cloudinary-system.md`](../../design/cloudinary-system.md), [`docs/design/streamline-cloudinary-inventory.md`](../../design/streamline-cloudinary-inventory.md), [`STREAMLINE_ASSET_REGISTRY.md`](../../../STREAMLINE_ASSET_REGISTRY.md) — those become read-only/redirect once this lands.
> **Companion contracts:** [`packages/contracts/src/media.ts`](../../../packages/contracts/src/media.ts) (`ImageSelection`, `MediaBucketType`, `CuratedPhotoScope`).

## 1. Goal (one sentence)

One **simple, clean, categorized** asset system: a single delivery hub, user uploads kept separate, one source-of-truth manifest, and a small set of typed pipelines that feed it — operationally comparable to Indeed/ZipRecruiter while the Freehand/duotone hand-drawn look stays the differentiator. **KISS.**

## 2. The 5-tool model — each tool, one job, assets flow one direction

| Tool | Job | Holds | Feeds |
|---|---|---|---|
| **Streamline Pro** | icon **source** | master SVGs (manual export) | → Cloudinary `icons/` |
| **Unsplash** (API) | photo **source** | raw stock | → Cloudinary `photos/curated/` |
| **Canva Pro** | design **studio** | logos + marketing working files + brand kit | → Cloudinary `brand/`, `marketing/` |
| **Cloudinary** (`dwiwyt9vi`) | **delivery DAM** — the runtime CDN the app reads | every app-served asset | → app |
| **Supabase Storage** | **user uploads** (auth/RLS) | host/seeker/listing photos | → app |

**Rule of thumb:** *Stuff we provide → Cloudinary. Stuff users give us → Supabase.* Sources never store the delivered copy; they hand off to Cloudinary.

## 3. Tenant isolation (we stay on the shared free cloud)

Cloudinary `dwiwyt9vi` is shared with other ventures (`sweepza`, `bidspace`, …). Isolation contract:

- **Every** E&E asset carries tag `venture:explore-and-earn` **and** lives under the `explore-and-earn/` prefix.
- All E&E tooling (sync script, manifest, CI) filters by that tag — never cloud-global queries.
- This also makes the future paid migration to a dedicated environment a clean `resources_by_tag` export. (Upgrade-ready, dormant until paid.)

## 4. Cloudinary taxonomy (the clean tree)

```
explore-and-earn/
  brand/                         logos, wordmark, app-icons, favicons, OG base plates
  icons/<family>/<domain-key>    family = freehand | plumpline | duotone
  illustrations/                 Streamline spot illustrations (EmptyState + accents)
  elements/                      decorative marks
  photos/
    curated/<category>/<scope>   people-free library for the picker
                                 category = farm|maritime|remote|seasonal ; scope = avatar(1:1) | cover(3:2)
    encouragement/               cross-category motivational pool
  seed/                          demo content for fixtures — NOT real user data
    listings/<housing|meals|facilities>/
    avatars/<seeker|host>/
  marketing/                     Canva exports: social, email, OG variants
  system/                        fallbacks, placeholders, map pins
```

Reconciliation calls baked in:
- **Cloudinary holds app-curated assets only.** The current live `housing/` & `meals/` folders are *seed/demo* content → moved under `seed/`. Real user uploads never go here (§7).
- **Icons are family × domain-keyed**, not by-screen. The live "by-screen" icon folders are a Figma/Canva working artifact, not the delivery structure.
- **Curated vs seed split** ends the sprawl: people-free library art → `photos/curated/`; specific-person/scene demo art → `seed/`.

## 5. Icons — family-aware registry

- `<Icon name="domain.key" family="freehand|plumpline|duotone" />`. Same registry keys, resolved per family. A **global default family** + optional **per-surface override** (this is what "mix" means — a config, not a 4th family).
- Cloudinary: `icons/<family>/<domain-key>` (one folder per family, fully parallel).
- **Duotone is two-color** — Freehand/Plump Line tint via `currentColor`; the `<Icon>` component gets a two-slot color path for the duotone family only.
- **Registry cap 100, with a retirement policy:** deprecate → 2-release grace → remove. (Currently 96 keys.)
- **Procurement is manual** (honest constraint): Streamline's extension is a login-gated webview; scripted bulk export violates their Fair Use + this repo's public-asset licensing rule. The founder exports SVGs in batches. **Phase 0 = evaluate:** export the Discovery Card's ~dozen icons in all three families to compare live; commit a direction afterward. The system is built family-aware regardless of which wins.

## 6. Photos — capture, picker, delivery

**Capture (Unsplash API):** a small `scripts/capture-unsplash.mjs` — search by category/keyword → founder picks → script downloads, uploads to the correct `photos/curated/<category>/<scope>` bucket, and **auto-captures attribution + license** into metadata (fixes the current license-hygiene gap). Triggers Unsplash's required download endpoint for ToS compliance.

**Picker (one component):** `PhotoPicker` — segmented **Upload | Choose from library**, parameterized by:
- `scope`: `avatar` (1:1) or `cover` (3:2)
- `category`: farm | maritime | remote | seasonal (selectable)
- `role`: host | seeker (later admin) — scopes which library + upload target
- Emits the existing `ImageSelection` union: `{ source: "curated", ref }` (Cloudinary) or `{ source: "uploaded", ref }` (Supabase).

**Canva is not a raw-photo source** — only composed *marketing* imagery, which lands in `marketing/`.

## 7. Supabase — user uploads

- One private-by-default bucket **`user-media`**, path: `<role>/<userId>/<kind>/<uuid>.<ext>` where `kind = avatar | cover | listing | verification`.
- **RLS:** a user may write/delete only their own prefix. `avatar | cover | listing` are public-read (profiles/listings are public); `verification` stays private (founder/trust gate).
- Delivered via Supabase image transforms (or Next `<Image>`); curated picks still come from Cloudinary. This is exactly the `uploaded` vs `curated` split already in `ImageSelection`.

## 8. Metadata schema (required on every Cloudinary asset; enforced by upload preset)

| Field | Values |
|---|---|
| tag `venture` | `explore-and-earn` (always) |
| `ee_type` | brand · icon · illustration · element · photo · seed · marketing · system |
| `ee_category` | farm · maritime · remote · seasonal · mix · encouragement · system · na |
| `ee_family` | freehand · plumpline · duotone · na (icons) |
| `ee_scope` | avatar · cover · landscape · registry · social · og · na |
| `ee_source` | streamline · unsplash · canva · generated · founder |
| `ee_license` | unsplash(+attribution) · streamline_paid · proprietary · cc0 |
| `ee_key` | registry key, icons only (e.g. `category.farm`) |

## 9. One source of truth + light drift-proofing

- **`scripts/assets-sync.mjs`** — pulls live Cloudinary (`venture:explore-and-earn`) → regenerates `scripts/assets.manifest.json` (the *only* inventory of record). Replaces the three hand-written, now-stale inventories.
- **`cloudinary.ts` becomes manifest-driven** — delivery helpers resolve from the manifest/taxonomy, not hardcoded `photos/{cat}/landscape` strings. Kills code↔asset path drift permanently.
- **One governance doc** = this file + a short living `docs/design/asset-management.md` (policy only). Old inventories become redirect stubs.
- **Light CI check** (fits existing G-guardrails): fail if code references an ID not in the manifest, or an E&E asset is missing required metadata. Keep it minimal.

## 10. What I need from the founder (the only blockers)

| Need | Why | Gate |
|---|---|---|
| **Unsplash API access key** | programmatic photo capture + auto-attribution | — |
| Confirm **Supabase project** `mamosbzcbigcclafhmmr` is the storage target | upload bucket + RLS | — |
| **Streamline SVG exports** (Discovery Card, 3 families) | manual procurement for the icon evaluation | — |
| (later) Paid-asset licensing sign-off for any non-Unsplash/Streamline imagery | public-repo licensing | 🔒 founder gate |

Cloudinary + Supabase writes are already reachable via MCP; no keys needed there for setup.

## 11. Out of scope (logged as their own follow-ups, not dropped)

- Canva **brand-template build + auto-pull-from-listings** marketing pipeline (its own project — "Phase 2/3").
- **Approach-B clean-room re-home** to a dedicated Cloudinary environment (when paid).
- **Figma seat/ownership** — flagged risk only (company design IP currently on a personal student seat; org team is View-only). Recommend moving to an org-owned seat; escalated to the founder-approval queue, not built here.
- Physical re-foldering of the ~1,009 existing live assets — handled by mapping in the manifest + metadata backfill, **not** by mass-moving (which would break live delivery URLs). New assets follow the clean tree; old assets converge forward.

## 12. Build order (preview — becomes the implementation plan)

1. **Metadata + isolation backfill** — tag every E&E asset `venture:explore-and-earn` + `ee_*` (non-destructive).
2. **`assets-sync.mjs`** → regenerate the canonical manifest from live reality.
3. **`cloudinary.ts`** → manifest-driven delivery + family-aware icon resolution.
4. **`PhotoPicker`** contract + the curated-library read path.
5. **Supabase `user-media`** bucket + RLS + upload path.
6. **`capture-unsplash.mjs`** (needs the API key).
7. **Light CI drift-check** + collapse old docs to stubs.
8. **Icon evaluation (Phase 0)** once the founder exports the Discovery Card families.
