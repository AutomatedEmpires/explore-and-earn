# Explore&Earn — Streamline Asset Selection Plan

> Phase 2. Generated 2026-06-15 by Claude Code (Opus 4.8).
> Pool of record: [`docs/design/streamline-cloudinary-inventory.md`](./docs/design/streamline-cloudinary-inventory.md)
> — **364 verified Streamline Freehand SVGs** already on Cloudinary (`dwiwyt9vi`, folder
> `explore-and-earn/icons`). **Every `cloudinaryId` below is from that list.** Nothing is invented.

## 1. Selected icon style family / set

**Streamline Freehand** — the founder-locked, CI-enforced (G30 / ADR-044) icon language. Hand-drawn,
24px grid, single coherent set. We do **not** introduce a second family. All three asset layers
(icons, illustrations, elements) draw from Freehand so the product reads as one hand. Two assets in
the pool are `--Streamline-Flex` (`Check-Thick`, `Warranty-Badge`) — pre-existing, retained.

## 2. Selected illustration style family / set

**Streamline Freehand "spot" assets** — the scene-scale Freehand glyphs (people, landscapes, travel,
work scenes) rendered large inside a framed paper "plate." We deliberately do **not** pull a separate
Streamline *Illustration* family (Milano/Brooklyn/UX/etc.).

**Why (access reality, stated honestly):** the Streamline VS Code extension *is* installed
(`streamline.streamline-icons-1.15.0`), but it is an interactive webview (search → drag-drop /
download-to-folder) behind login. It cannot be driven programmatically, and scripted bulk export is
forbidden by Streamline's Fair Use Policy and the repo's public-repo licensing rule. The only
**verified, deliverable** assets are the 364 Freehand SVGs already on Cloudinary. Using real Freehand
spot art as the illustration layer keeps the system honest (no faked IDs), on-brand (one hand-drawn
language), and license-clean. Pulling the dedicated Illustration families is documented as a future
human/extension step in §8.

## 3. Selected element style family / set

**Streamline Freehand decorative motifs** (sparkle, leaf, compass, sun, feather, flag, tree, road) +
a small number of **CSS/SVG primitives** (hand-drawn divider, paper-mat corner) that are explicitly
marked `source: "css-primitive"` — **not** Streamline assets — so the registry never implies an asset
that doesn't exist.

## 4. Rationale for consistency

- One family (Freehand) across all three layers → zero "mismatched icon library" drift.
- One delivery pipeline (Cloudinary inline-SVG + DOMPurify + `currentColor`) → uniform tinting,
  caching, and sanitization for icons, illustrations, and elements.
- Semantic keys (`{domain}.{name}`) decouple meaning from glyph → any asset can be re-pointed by
  editing one registry line, with zero component edits.

## 5. Selected counts vs. caps

| Layer | Cap | Selected after this plan | Headroom |
|---|---|---|---|
| Icons | 100 | **91** distinct (62 existing + 29 new) | 9 |
| Illustrations | 50 | **30** keys | 20 |
| Elements | 50 | **16** keys (13 Streamline + 3 CSS primitives) | 34 |

All within limits. Icon headroom is intentionally preserved (license cap = 100 distinct icons).

## 6. Exact selected assets (new wirings — all IDs verified in the inventory)

### 6a. New ICON keys (29) → real Cloudinary IDs

| Semantic key | Cloudinary ID | Concept |
|---|---|---|
| `action.edit` | `Form-Edition-Clipboard-Edit--Streamline-Freehand_uv1w2f` | edit |
| `action.delete` | `Delete-Bin-2--Streamline-Freehand` | delete |
| `action.search` | `Search-Magnifier-1--Streamline-Freehand_pceggu` | search |
| `action.settings` | `Settings-Cog--Streamline-Freehand_v76p9n` | settings/cog |
| `action.upload` | `Upload-Box--Streamline-Freehand_czknsq` | upload |
| `action.download` | `Download-Box--Streamline-Freehand_bgu6zq` | download |
| `action.view` | `View-Eye-1--Streamline-Freehand_m95ozx` | view/preview |
| `action.link` | `Link-Hyperlink-Chain--Streamline-Freehand_jgczpd` | copy link |
| `nav.notifications` | `Alert-Alarm-Bell--Streamline-Freehand_jdqyjr` | notifications |
| `nav.settings` | `Settings-Cog--Streamline-Freehand_v76p9n` | settings tab |
| `nav.logout` | `Logout-User--Streamline-Freehand_u13yqr` | sign out |
| `nav.help` | `Information-Desk-Question-Help--Streamline-Freehand_pggxdz` | help |
| `status.applied` | `Task-Clipboard-Check--Streamline-Freehand_bzwdmb` | application submitted |
| `status.offered` | `Notes-Paper-Approve--Streamline-Freehand_fjiksx` | offer extended |
| `status.accepted` | `Clap-Hand-1--Streamline-Freehand_v52xuf` | accepted |
| `status.declined` | `Remove-Delete-Circle--Streamline-Freehand_o9kcd6` | declined / not selected |
| `status.withdrawn` | `Arrow-Thick-Circle-Left-1--Streamline-Freehand_zrwxy8` | withdrawn |
| `status.draft` | `Form-Edition-Clipboard--Streamline-Freehand_xxulzo` | draft listing |
| `status.paused` | `Controls-Slider-Toggle-Left--Streamline-Freehand_ks9yk4` | paused |
| `status.archived` | `Floppy-Disk--Streamline-Freehand_izffz9` | archived |
| `trust.featured_employer` *(fix: was placeholder)* | `Pin-Star--Streamline-Freehand_tq0bkh` | featured star |
| `profile.resume` | `Task-To-Do-List--Streamline-Freehand_qz5iwz` | resume |
| `profile.skills` | `Tools-Box-3--Streamline-Freehand_u33mdc` | skills toolbox |
| `profile.experience` | `Job-Briefcase-Document--Streamline-Freehand_sn9udu` | experience |
| `profile.verification` | `Security-Shield-Check--Streamline-Freehand_cvdihp` | verification |
| `work.harvest` | `Farming-Wheat-Grain--Streamline-Freehand_iw9geq` | harvest/farm work |
| `work.hospitality` | `Hotel-Double-Bed-1--Streamline-Freehand_lr1l18` | hospitality/lodge |
| `work.kitchen` | `Restaurant-Fork-Knife--Streamline-Freehand_yj0wr3` | kitchen/F&B |
| `work.deckhand` | `Fishing-Rod-1--Streamline-Freehand_nypmte` | maritime/deckhand |
| `work.ranch` | `Free-Range-Cow--Streamline-Freehand_ihmjgj` | ranch/livestock |

> Stretch mappings flagged for review (real asset, approximate concept): `status.paused`
> (toggle-left), `status.archived` (floppy). The pre-existing `action.sort` (hourglass) and
> `analytics.funnel` (binoculars) mismatches are noted in the audit; no better Freehand asset exists
> in the current pool, so they are left as-is and flagged for a future pull.

### 6b. ILLUSTRATION keys (30) → real Cloudinary IDs

`empty.*` (14): `savedListings`→`Style-Three-Pin-Heart…_hzjmax` · `applications`→`Job-Search-Magnifier-Briefcase…_jvsgve` ·
`offers`→`Notes-Paper-Approve…_fjiksx` · `accepted`→`Trekking-Goal…_qg8kpp` · `notSelected`→`Worker-Lay-Off-Fired-User-Sad-Door…_qpbpiz` ·
`withdrawn`→`Login-Logout-Door…_zzxqel` · `invites`→`Send-Email-Paper-Plane-2…_xtierd` · `messages`→`Conversation-Text-1…_d4hl32` ·
`notifications`→`Alert-Alarm-Bell…_jdqyjr` · `schedule`→`Calendar-First--Streamline-Freehand` · `community`→`Meeting-Team…_tyigsb` ·
`photos`→`Picture-Stack-Human…_aotmcf` · `announcements`→`Advertising-Megaphone-Bubble…_tgtvha` · `searchNoResults`→`Search-Magnifier…_bikyxj`

`empty.host*` (3): `listings`→`Shop-Sign-Open…_i7cxkb` · `applicants`→`Job-Seach-Team-Man…_gncbfp` · `map`→`Earth-Globe-Model-Location-Arrow…_ldprba`

`onboarding.*` (2): `seeker`→`Outdoors-Backpack…_pzrfnw` · `host`→`House-Modern-1…_bow1jh`

`hero.*` (4): `discover`→`Landmarks-Telescope-Person…_zuwedm` · `adventure`→`Climbing-Mountain…_smfygx` ·
`maritime`→`Sailing-Boat-Person…_g4qyjl` · `camp`→`Camping-Tent-2…_go5xf7`

`success.*` (4): `applicationSubmitted`→`Send-Email-Paper-Plane-3…_ey3knh` · `offerReceived`→`Notes-Paper-Approve…_fjiksx` ·
`profileComplete`→`Strategy-Business-Success-Stairs…_qnckae` · `listingPublished`→`Product-Launch-Browser…_mlkdqz`

`error.*` (3): `generic`→`Server-Error-Document…_klrnwy` · `notFound`→`Server-Error-404-Not-Found…_cxwnrp` · `offline`→`Wifi-Off…_vpfvmg`

### 6c. ELEMENT keys (16)

Streamline (13): `sparkle`→`Sparkles-2…_q0yfrx` · `leaf`→`Plant-Leaf…_toycsh` · `compass`→`Compass…_xsrusn` ·
`sun`→`Weather-Sunny…_zftj7y` · `cloud`→`Weather-Cloud…_todtke` · `feather`→`Peacock-Feather…_fjwzup` ·
`starPin`→`Pin-Star…_tq0bkh` · `heartPin`→`Style-Three-Pin-Heart…_hzjmax` · `tree`→`Organic-Tree-Grow-1…_pjpicy` ·
`road`→`Road-Straight-1…_bykzs7` · `flag`→`Flag-Plain-Wave-2…_db4ezc` · `peace`→`Mood-Peace…_j9kedd` ·
`seasonalTree`→`Tree-Christmas…_d39csj`

CSS primitives (3, `source: "css-primitive"`, **no Cloudinary asset**): `divider` (hand-drawn rule) ·
`cornerAccent` (card corner mat) · `paperTexture` (paper grain).

## 7. Intended use cases

- **Icons** — inline meaning/scanning: nav, card triad, actions, lifecycle status, form section heads.
- **Illustrations** — empty states (via shared `EmptyState`), onboarding, dashboard/marketing heroes,
  success moments, error/404 pages. Rendered 64–120px inside a framed plate.
- **Elements** — small decorative accents on heroes, trust/featured badges, card corners, seasonal
  flourishes. Always `aria-hidden`, never load-bearing.

## 8. Replacement strategy for existing icons

- **Additive only.** The existing `Icon` + 62 keys + 98 call sites are untouched. New keys extend the
  union; the type-test (`registry.type-test.ts`) is kept in sync.
- **Re-point, don't rename.** To swap a glyph globally, change the one `cloudinaryId` in the registry.
- **Future Streamline Illustration/Element families:** when the founder selects them via the VS Code
  extension and uploads to a new Cloudinary folder (`explore-and-earn/illustrations`), only the
  `cloudinaryId` values in `illustrations.ts`/`elements.ts` change — keys, components, and call sites
  stay identical.

## 9. Accessibility strategy

- Meaningful standalone icon → `aria-label` (falls back to registry `label`); `role="img"`.
- Decorative icon/illustration/element → `aria-hidden` (the adjacent heading/text carries meaning).
- Empty-state illustrations are decorative (heading is the message) → `aria-hidden` by default.
- No color-only meaning: status uses glyph + text/`AccentPair` (bg+fg), per token rules.

## 10. Color / sizing strategy

- **Color:** SVGs inline `currentColor`; tint via CSS `color`/token. Illustrations render in a muted
  ink on a paper plate (token surfaces) → contrast safe on light *and* dark backgrounds.
- **Sizing:** icons use `ICON_SIZE` (sm16/md20/lg24, chip40/36). Illustrations use a token scale
  (sm64/md88/lg120) with responsive `clamp` and a hard max so mobile never overflows. Elements size
  to context (12–40px).

## 11. Implementation files / components

```
packages/ui/src/icons/registry.ts          ← expand (29 new icon keys + featured_employer fix)
packages/ui/src/icons/__type-tests__/…      ← keep invariant in sync
packages/ui/src/visual-assets/
  types.ts                                   ← shared asset types (size scale, base entry)
  useStreamlineSvg.ts                        ← shared Cloudinary inline-SVG hook (reused by all 3)
  illustrations.ts                           ← ILLUSTRATION_REGISTRY (30 keys)
  elements.ts                                ← ELEMENT_REGISTRY (16 keys)
  AppIcon.tsx                                ← ergonomic semantic wrapper over <Icon>
  AppIllustration.tsx                        ← framed-plate spot illustration
  AppElement.tsx                             ← decorative accent
  index.ts                                   ← barrel
packages/ui/src/index.ts                     ← re-export visual-assets
```

Decision: the registry stays in `packages/ui` (the CI-enforced, AGENTS-mandated UI home), **not** a new
`src/lib/visual-assets/` — the task explicitly permits "the app's existing shared UI/system location."
Creating a parallel home would fragment the one-icon-system rule and break G30. `visual-assets/` is a
sibling folder inside the sanctioned package.
