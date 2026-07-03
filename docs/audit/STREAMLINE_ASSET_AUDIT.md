# Explore&Earn — Streamline Visual Asset Audit

> Phase 1 of the visual-asset ownership pass. Generated 2026-06-15 by Claude Code (Opus 4.8).
> Companion docs: [`STREAMLINE_ASSET_SELECTION_PLAN.md`](./STREAMLINE_ASSET_SELECTION_PLAN.md) · [`STREAMLINE_ASSET_REGISTRY.md`](./STREAMLINE_ASSET_REGISTRY.md)

## 0. Executive summary

Explore&Earn already has a **mature, governed icon system** — this is not a greenfield icon pass. The
real gaps are **illustrations** and **decorative elements**, plus a handful of consistency issues
(decorative emoji standing in for real glyphs, a few raw `<svg>` marks in feature code).

| Layer | Today | Verdict |
|---|---|---|
| **Icons** | `<Icon name="domain.name"/>` registry in `packages/ui/src/icons` — 62 canonical keys, used in **98 files**, CI-guarded (G30). Delivery via Cloudinary inline-SVG with `currentColor` tinting. | ✅ Strong foundation. Expand coverage, fix emoji-as-icon. |
| **Illustrations** | **None.** No registry, no component, no empty-state art. ~38 empty states share one `EmptyState` that shows a small icon-in-a-pill. | ❌ Missing — biggest opportunity. |
| **Elements** | **None** as a system. A few ad-hoc decorative `<svg>`/emoji marks (`✦`, `★`) live inline in feature CSS. | ❌ Missing / inconsistent. |
| **Asset supply** | **364 real Streamline Freehand SVGs already uploaded** to Cloudinary (`dwiwyt9vi`, folder `explore-and-earn/icons`). Registry wires only ~62. | ✅ Large verified pool — see [`docs/design/streamline-cloudinary-inventory.md`](./docs/design/streamline-cloudinary-inventory.md). |

**The thesis:** keep the one icon system, extend it with sibling **illustration** and **element**
registries that reuse the exact same Cloudinary delivery pipeline, then assign illustrations to the
shared `EmptyState` (one change → 38 surfaces) and a few hero/dashboard accents. Every wired asset
must map to one of the 364 verified Cloudinary IDs; gaps stay as named placeholders (the established
pattern), never faked.

## 1. Current icon usage

- **Single source of truth:** `packages/ui/src/icons/registry.ts` — typed `ICON_REGISTRY` keyed by
  `{domain}.{name}` across 9 domains (`category, benefit, mappin, trust, status, action, nav,
  analytics, system`). 62 canonical keys + 4 deprecated aliases.
- **Render path:** `<Icon name>` (`Icon.tsx`) resolves the key → fetches the processed SVG from
  Cloudinary → DOMPurify-sanitizes → inlines it so `currentColor`/CSS `color` tints the glyph
  (critical for category-tinted map pins). Falls back to a neutral skeleton slab when no
  `cloudinaryId` is set (never raw emoji bleed-through).
- **Reach:** `<Icon>` appears in **98 files**. Heaviest consumers: `CommunityDashboard` (33),
  `HostDashboard` (25), `DiscoveryCard` (21), legal pages (about 20, terms 16, privacy 11),
  `host/[id]` profile (19), `ResumeBuilder` (14), `HostSettings`/`HostProfileHero` (11 each).
- **Sizing:** numeric `16 | 20 | 24` from `ICON_SIZE` tokens; chips 40/36 handled by containers.
- **Compliance:** **G30 is clean** — no `lucide-react`, `@heroicons`, `react-icons`,
  `@fortawesome`, or `@mui/icons` imports anywhere in feature code.

## 2. Current illustration / visual-element usage

- **Illustrations: none.** There is no illustration registry, no `AppIllustration`, and no spot art
  on any empty/hero/onboarding/dashboard surface.
- **Photos** are handled separately (Cloudinary curated library + hand-drawn frame/paper-mat per
  `docs/design/photo-language.md`) — out of scope here, but the frame/mat aesthetic is the visual
  language illustrations should match.
- **Ad-hoc decorative marks (the "element" gap):**
  - Raw inline `<svg>` in feature code: `SiteFooter.tsx`, `GlobalHeader.tsx`, `SeekerDashboard.tsx`,
    `SeekerSidebar.tsx`, `StatusCard.tsx`. These are decorative (logo marks, the 404 scene, sidebar
    flourishes) — not G30 icon violations, but they are *un-systematized* and should be catalogued
    as elements or explicitly exempted.
  - Decorative emoji used as pseudo-glyphs: `✦` sparkle (`FeaturedEmployersRail`, `CommunityDashboard`
    employer star), `★` rating stars (`PayDetailsDrawer`, `StatusCard`), `✓`/`✕` chips
    (`ResumeBuilder`). These render inconsistently across OS/browser and bypass the asset system.

## 3. Areas with missing icons

| Surface | Gap |
|---|---|
| Action vocabulary | No registry keys for **edit, delete, settings, search, upload, download, view, copy/link, notifications, logout, add** — all are real product actions present in the UI (resume editor, host settings, profile edit, image upload). |
| Lifecycle statuses | `status.*` covers fill/boost/match but **not** application lifecycle: `applied, offered, accepted, declined, withdrawn, draft, paused, archived` — these drive the seeker journey + host listing manager. |
| Applications / offers / invites | No dedicated glyphs for application submitted, offer received, invite — currently borrow `action.apply`/`action.message`. |
| Amenities | Triad (housing/meals/pay) + transport/wifi exist; **no** `parking, laundry, kitchen, bathroom, pets, gym, accessible` etc. for richer listing detail. |
| Work categories | Category lanes exist; **no** finer work-type glyphs (harvest, kitchen/hospitality, deckhand, ranch/livestock, trail/outdoor) even though scene assets exist in the pool. |
| Profile / resume | `nav.profile` only; no `resume, skills, experience, education, verification` section glyphs. |

## 4. Areas with inconsistent icons

- **Emoji vs. registry:** `✦`/`★` stars appear both as emoji spans *and* conceptually as
  `trust.featured_employer` / `status.featured`. Pick one (registry) for trust/featured surfaces.
- **Deprecated keys still reachable:** `status.featured`, `status.seasonal`, `mappin.location`,
  `nav.host` remain as aliases. Confirm no new code references them (currently used only via
  back-compat). Documented in the registry; new code should use canonical replacements.
- **Sort glyph mismatch:** `action.sort` is wired to `Time-Hourglass-Triangle` (an hourglass), which
  reads as "loading/time," not "sort." A real sort/arrows asset should replace it.
- **Funnel mismatch:** `analytics.funnel` is wired to `View-Binocular` (binoculars), not a funnel.

## 5. Areas where icons are decorative but unhelpful

- Legal pages (`about` 20, `terms` 16, `privacy` 11 icons) lean heavily on icons next to every
  heading. This is mostly fine for scannability but verges on decorative density — keep section
  icons, avoid one-per-paragraph.
- `StatusCard` 404 scene mixes emoji (`🐄`, `🌿`) into body copy as decoration; acceptable as
  playful brand voice but should not be confused with the asset system.

## 6. Areas where icons would improve scanning

- **Listing cards / DiscoveryCard:** triad already iconned; add lifecycle/status clarity
  (boosted/featured/verified are present — keep). Date range (`status.begins`/`ends`) is wired.
- **Seeker lifecycle lists** (applied, offered, accepted, not-selected, withdrawn, invites): each
  state deserves a distinct status glyph in the row + empty state, improving at-a-glance triage.
- **Host listings manager / applicants:** draft/paused/archived/open status glyphs speed scanning of a
  long list.
- **Forms** (resume builder, listing new/edit, host/seeker profile edit, settings): section headers
  benefit from a leading glyph (location, dates, housing, meals, pay, skills, verification).
- **Search / filter / sort controls:** `action.filter` exists; add a proper `action.search` and a
  corrected `action.sort`.

## 7. Where illustrations / elements would help

**Illustrations (empty / onboarding / hero / community):**

- **Empty states (~38 surfaces via shared `EmptyState`)** — saved, applied, offered, accepted,
  not-selected, withdrawn, invites, messages, notifications, schedule, travel, journey; host
  listings, applicants, invites, messages, analytics. Each is currently a small icon-in-a-pill.
- **No results** — discovery feed / swipe deck / map / search with zero matches.
- **Onboarding** — seeker + host onboarding flows (no welcoming art today).
- **Dashboards** — seeker `home`, host command center hero accents.
- **Community** — feed/photos/announcements empty states (a `CommunityEmptyState` exists per prior
  work but uses an icon, not art).
- **Success moments** — application submitted, offer received, listing published, profile/resume
  complete.
- **Error pages** — `app/error.tsx`, `not-found.tsx` (the 404 `StatusCard` scene), per-segment
  `error.tsx` (seeker/host/admin/legal).

**Elements (accents, never clutter):**

- Hero/section flourishes (sparkle, leaf, compass, sun) on marketing + dashboard heroes.
- Trust/featured badge flourishes (formalize the `✦`/`★`).
- Card corner / map-panel travel accents.
- Seasonal accents (leaf/tree/sun) tied to category lanes.

## 8. Route-by-route recommendations

| Route group | Surface | Recommendation |
|---|---|---|
| `(public)` / `(marketing)` `/` | Homepage hero, category reels, featured rail | Keep iconography; add 1–2 **elements** (sparkle/compass) as hero accents; formalize `✦` → `element.sparkle`. |
| `(public)` nav | `GlobalHeader` | Audit the inline `<svg>` logo mark (exempt as brand art). Nav links already use icons. |
| Footer | `SiteFooter` | Inline `<svg>` social/marks → catalogue as elements or exempt; ensure social links have labels. |
| Listing card | `DiscoveryCard` | Already strong (21 icons). Verify boosted/featured/verified glyphs; no change needed beyond corrected `status.*`. |
| Listing detail | `app/listing/[id]`, drawers | Add **amenity** icons + form-style section glyphs; `BenefitTrustModal` already iconned. |
| Seeker dashboard | `home`, `SeekerDashboard`, `StatusStrip`, `SeekerSidebar` | Replace sidebar inline `<svg>` with registry/elements; add hero **element** accent; lifecycle status glyphs. |
| Seeker lifecycle | `applied/offered/accepted/not-selected/withdrawn/invites` | Per-state status glyph + per-state **illustration** in empty state. |
| Host dashboard | `HostDashboard`, listings, applicants, analytics | Add draft/paused/archived status glyphs; fix `analytics.funnel`; hero **element** accent. |
| Community | feed / photos / announcements | `CommunityEmptyState` → use **illustration**; formalize employer `✦`. |
| Messages | seeker + host threads/transcripts | Empty-state **illustration** (no messages yet). |
| Forms | resume, listing new/edit, profile edit, settings, onboarding | Section-header glyphs; replace `✓`/`✕` chips with registry glyphs where they are status, not text. |
| Empty states | shared `EmptyState` | **Add an `illustration` prop** — highest-leverage single change. |
| Error/loading | `error.tsx`, `not-found.tsx`, `loading.tsx` | Error **illustration**; loading already uses skeletons. |
| Admin / official | `(admin)` tables, listings | Status glyphs for moderation states; admin nav iconned. |
| Boosted / featured | `BoostListingPopup`, card badges | Keep `status.boosted`/`trust.featured_employer`; formalize the gold flourish as an **element**. |

## 9. Existing components that should consume a centralized registry

- **`EmptyState` (`discovery/EmptyState.tsx`)** — consumed by ~38 surfaces. Add illustration support
  here; it is the single biggest leverage point.
- **`StatusCard`** — the 404/status scene; migrate its emoji/inline art toward elements/illustration.
- **`FeaturedEmployersRail`, `CommunityDashboard`** — replace `✦` employer star with
  `element.sparkle` / `AppIcon trust.featured_employer`.
- **`PayDetailsDrawer`, `ResumeBuilder`** — `★`, `✓`, `✕` → registry glyphs where semantic.
- **`SeekerSidebar`, `SiteFooter`, `GlobalHeader`, `SeekerDashboard`** — audit inline `<svg>`;
  catalogue as elements or mark exempt brand art.

## 10. Risk areas (layout / accessibility)

- **Heavy consumer files** (`CommunityDashboard` 33, `HostDashboard` 25, `DiscoveryCard` 21): any
  change to `<Icon>` props ripples widely — keep all changes **additive** (new optional props only).
- **The 98 existing `<Icon>` call sites**: do **not** rename `Icon` or change its required props.
  Introduce `AppIcon` as an additive wrapper; leave `Icon` intact.
- **Type-test invariant**: `icons/__type-tests__/registry.type-test.ts` fails the build if
  `CanonicalIconKey`, `ICON_REGISTRY`, and `CANONICAL_ICON_KEYS` drift. Any new icon key must be
  added to all three.
- **`currentColor` tinting**: illustrations rendered from Freehand line art inherit `currentColor`;
  ensure sufficient contrast on both paper and dark surfaces — render inside a framed "plate" with
  token colors, never a raw colored glyph on a same-color background.
- **Mobile**: illustrations must cap their max size and never force horizontal scroll; use responsive
  clamp sizing.
- **Accessibility**: empty-state illustrations are decorative (the heading carries meaning) →
  `aria-hidden`. Meaningful standalone icons keep `aria-label`. Do not regress existing labels.
- **License**: repo is public — **never commit Streamline SVG/PNG files**; assets stay on Cloudinary
  and are fetched at runtime. Stay ≤100 distinct icons (license cap).
