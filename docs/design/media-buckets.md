# Media & Photo Bucket Strategy — V1 (incl. Figma / AI-generated assets)

> Read-only mirror of Notion canon: *Curated Photo Library (Photo Buckets) — V1*, *Icon & Illustration Manifest — V1*, *Figma AI — Design Brief & Prompts*. Notion stays canonical; this file is drift-prevention doctrine for agents. Contracts: [`packages/contracts/src/media.ts`](../../packages/contracts/src/media.ts).

## Two separate media systems (do not conflate)

1. **User-uploaded media** — classified by `MediaBucketType`: `housing · meals · facilities · cover_photo · community_photo · verification_evidence`. These are real listing / host evidence photos.
2. **Curated library** (`curated_photos`) — a read-only, app-provided pool users pick from for **avatar, cover, and host-page carousel**. Organized by **category × scope**.

A user's final image resolves through a small union (`ImageSelection`): `uploaded` vs `curated`.

## Curated library — locked decisions

- **Categories:** farm · maritime · remote · seasonal (**no `mix`** for buckets — see `CURATED_PHOTO_CATEGORIES`).
- **Scopes / master crops:** `icon` (1:1, 2048×2048) and `landscape` (3:2, 2400×1600). Cover + carousel **share** the 3:2 landscape pool.
- **Volume:** ~50 per category per pool (≈ 400 masters).
- **Strictly people-free** — no faces, figures, text, logos, or signage.
- **Style:** warm golden-hour documentary; premium editorial; matches the paper palette.

## Frame-not-filter (locked)

Host photos get a **hand-drawn frame + paper mat around the untouched photo** — never filters / painted overlays *on* the photo. When a listing has no photo, the media zone renders the category **fallback illustration** (Freehand-native), never a blank or stretched image. See [`icon-system.md`](./icon-system.md) and [`streamline-freehand-map.md`](./streamline-freehand-map.md).

## Responsive pipeline (best practice)

- Store **one high-res master**; derive widths on demand (Next `<Image>` + Supabase / CDN transforms). Serve **AVIF / WebP** with `srcset` / `sizes` and DPR 1x/2x/3x.
  - Icon widths: 48 / 96 / 144. Landscape widths: 640 / 960 / 1280 / 1920 / 2400.
- Generate a **blurhash / LQIP** per photo for instant paint.
- **Never** pre-bake per-screen sizes; **never** hardcode pixel dimensions in components.

## Figma / AI-generated assets -> repo flow

Generated imagery (Figma AI, image-gen, or curated batches) is **never committed as binaries to this repo**. Instead:

1. Masters are generated in staged batches, reviewed for cohesion.
2. A **manifest** (category, scope, index, prompt, alt text, dimensions) + a `seed-curated-photos` script upscales -> converts to AVIF / WebP (sharp) -> uploads to the `curated-photos` storage bucket -> inserts `curated_photos` rows + blurhash.
3. The founder / Codex runs the script. **Only the script + manifest live in git.**

Figma-generated **UI** (screens / components) is design reference only — not a build gate, not committed as assets; it informs the token + primitive layer in `packages/ui`.

## Storage layout (planned)

```
curated-photos/                       # public-read bucket
  {farm|maritime|remote|seasonal}/icon/{nnn}.avif
  {farm|maritime|remote|seasonal}/landscape/{nnn}.avif
```

User uploads go to a separate bucket per `MediaBucketType` with its own access policy.

## Shared picker (later — not Sprint Zero)

One `PhotoPicker` for avatar / cover / carousel — segmented **Upload | Choose from library**, mobile-first bottom sheet, reusing `Card` / `Chip` / `Skeleton`. Emits `{ source, ref }`.

## Out of scope for Sprint Zero

No storage writes, no upload handlers, no `PhotoPicker` implementation, no image binaries, no seed execution. This doc + [`packages/contracts/src/media.ts`](../../packages/contracts/src/media.ts) define the **contract and strategy** only.

## Open questions / gates

- Final per-category subject lists (founder may trim).
- Exact `curated_photos` + listing-media column placement — reconcile against the Exact Data Dictionary in Database V1.
- Paid-asset licensing for any non-generated imagery (founder gate).

Tracked in [`../source-of-truth/open-questions.md`](../source-of-truth/open-questions.md).
