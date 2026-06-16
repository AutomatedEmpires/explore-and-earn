# Explore&Earn — Visual Asset Registry (Streamline)

> Phase 7. The authoring & governance guide for the Explore&Earn visual-asset system.
> Generated 2026-06-15 by Claude Code (Opus 4.8).
> Companion docs: [`STREAMLINE_ASSET_AUDIT.md`](./STREAMLINE_ASSET_AUDIT.md) ·
> [`STREAMLINE_ASSET_SELECTION_PLAN.md`](./STREAMLINE_ASSET_SELECTION_PLAN.md) ·
> verified pool: [`docs/design/streamline-cloudinary-inventory.md`](./docs/design/streamline-cloudinary-inventory.md)

## 1–3. Totals selected

| Layer | Selected | Cap | Source of truth |
|---|---|---|---|
| **Icons** | **91 canonical** (62 prior + 29 new) + 4 deprecated aliases | 100 | `packages/ui/src/icons/registry.ts` |
| **Illustrations** | **30** | 50 | `packages/ui/src/visual-assets/illustrations.ts` |
| **Elements** | **16** (13 Streamline + 3 CSS primitives) | 50 | `packages/ui/src/visual-assets/elements.ts` |

All within limits. Every Streamline-backed entry's `cloudinaryId` is one of the **364 verified**
assets in the Cloudinary `explore-and-earn/icons` folder (validated: 117/117 distinct refs found in
the inventory; 0 fakes).

## 4. Registry file locations

```
packages/ui/src/
  icons/
    registry.ts          ICON_REGISTRY, CanonicalIconKey, CANONICAL_ICON_KEYS, getIcon
    Icon.tsx             <Icon> primitive (fetch → DOMPurify → inline; currentColor)
    __type-tests__/      compile-time invariant (union ⇔ array ⇔ record)
  visual-assets/
    types.ts             ILLUSTRATION_SIZE, ELEMENT_SIZE, AssetSource, VisualAssetEntry
    useStreamlineSvg.ts  shared Cloudinary loader (sanitize + scale-to-fill + currentColor tint)
    illustrations.ts     ILLUSTRATION_REGISTRY, IllustrationKey, getIllustration
    elements.ts          ELEMENT_REGISTRY, ElementKey, getElement
    AppIcon.tsx          ergonomic semantic wrapper over <Icon>
    AppIllustration.tsx  framed-plate spot illustration
    AppElement.tsx       decorative accent (Streamline or CSS primitive)
    index.ts             barrel
    __type-tests__/      compile-time completeness for illustration & element keys
  index.ts               re-exports ./icons, ./tokens, ./visual-assets
```

Everything is re-exported from `@explore-and-earn/ui`.

## 5. Naming conventions

- Keys are `{domain}.{name}`, lowercase, `camelCase` within the name segment
  (e.g. `empty.savedListings`, `status.applied`, `accent.sparkle`).
- **Stable identity:** never rename a key once a component references it. To change the *glyph*,
  re-point the `cloudinaryId`; to change *meaning*, add a new key and deprecate the old one.
- Good: `listing` intent via `benefit.housing`, `status.boosted`, `action.apply`.
  Bad: `icon1`, `coolArrow`, `blueThing`.

## 6. Category taxonomy

| Layer | Domains |
|---|---|
| Icons | `category` · `benefit` · `mappin` · `trust` · `status` · `action` · `nav` · `profile` · `work` · `analytics` · `system` |
| Illustrations | `empty` · `onboarding` · `hero` · `success` · `error` |
| Elements | `accent` (Streamline motifs) · `mark` (CSS primitives: divider / cornerAccent / paperTexture) |

## 7. How to add a new icon

1. Pick a **real** asset from `docs/design/streamline-cloudinary-inventory.md` (or have the founder
   pull a new one via the Streamline VS Code extension → upload to Cloudinary `explore-and-earn/icons`).
2. In `registry.ts`, add the key in **three** places (the type-test enforces this):
   the `CanonicalIconKey` union, the `ICON_REGISTRY` record (with `cloudinaryId`, `label`,
   `streamline` hint, `placeholder`), and the `CANONICAL_ICON_KEYS` array.
3. Keep the canonical count ≤ 100. `pnpm --filter @explore-and-earn/ui typecheck` validates the invariant.
4. Illustrations/elements: add the key to its union **and** its `*_KEYS` array; the record type
   forces an entry. No three-way sync — just union + array.

## 8. How to replace an icon globally

Change the single `cloudinaryId` on its registry entry. Zero component edits — every `<Icon>` /
`<AppIcon>` / `<AppIllustration>` / `<AppElement>` for that key updates everywhere.

## 9. Decorative vs. accessible

- **Meaningful** standalone glyph → pass `aria-label` (AppIcon/AppIllustration) → `role="img"` + label.
- **Decorative** (adjacent text carries meaning) → `aria-hidden` / `decorative`.
- **Illustrations** default to decorative (the empty-state heading is the message).
- **Elements** are *always* decorative (`aria-hidden` is forced in `AppElement`).

## 10. How to use the components

```tsx
import { AppIcon, AppIllustration, AppElement } from "@explore-and-earn/ui";

// Icons (or keep using the lower-level <Icon> — 98 existing call sites are unchanged)
<AppIcon name="benefit.housing" aria-hidden />
<AppIcon name="action.save" aria-label="Save" size="sm" />

// Illustrations (framed paper plate by default)
<AppIllustration name="empty.savedListings" />          // decorative
<AppIllustration name="hero.discover" size="lg" framed={false} aria-label="Discover" />

// Elements (always decorative)
<AppElement name="accent.sparkle" color="var(--status-featured-fg)" />
<AppElement name="mark.divider" />

// Shared empty state now takes an illustration:
<EmptyState illustration="empty.applications" title="No applications yet" message="…" />
```

## 11. How to avoid hardcoded imports

- **One system:** all icons render through `<Icon>` / `<AppIcon>` (registry-keyed). No
  `lucide-react` / `@heroicons` / `react-icons` / `@fortawesome` / `@mui/icons`, and no ad-hoc inline
  `<svg>` in feature code (CI guardrail **G30**). Verified clean across the app.
- Illustrations/elements render only through `<AppIllustration>` / `<AppElement>`.
- The SVG-injection (`dangerouslySetInnerHTML`) lives **only** inside the `packages/ui` asset system,
  always after DOMPurify sanitization — never in feature code.

## 12. Staying within the 100 / 50 / 50 limits

- Icons: 91/100. Track the canonical count; the license caps distinct icons at ~100 (Extended Vector
  License is a founder gate beyond that).
- Illustrations 30/50, Elements 16/50 — ample headroom.
- Before adding, check whether an existing key already covers the concept (re-point beats add).

## Known limitations (honest)

- **Tinting:** the processed Cloudinary SVGs ship with hardcoded `fill="#000000"`. The original
  `<Icon>` renders them as black line art (consistent with the warm-paper look) and its `color` prop
  is effectively inert. The new `useStreamlineSvg` loader swaps `#000000 → currentColor` so
  illustrations/elements **can** be token-tinted; `<Icon>` was left unchanged to avoid altering 98
  call sites. Recommendation: re-export the icon SVGs with `currentColor` to make tinting work
  everywhere.
- **Illustration/Element families:** the dedicated Streamline *Illustration* (Milano/Brooklyn/…) and
  *Element* product families were **not** programmatically accessible — the VS Code extension is an
  interactive webview behind login and bulk export is forbidden. The illustration/element layers use
  real, available Freehand spot/motif assets instead. Migrating to dedicated families later only
  changes `cloudinaryId` values.
- **Stretch icon mappings** (real asset, approximate concept): `status.paused` (toggle-left),
  `status.archived` (floppy), and the pre-existing `action.sort` (hourglass) / `analytics.funnel`
  (binoculars). Flagged for a future asset pull.
- **Error/404 scene:** `StatusCard` keeps its bespoke custom scene; `error.*` illustration keys are
  registered and ready if it is ever migrated to the registry.

## Visual map (representative — full set in the registry files)

| Semantic Key | Asset Type | Category | Streamline Asset (Cloudinary id) | Primary Usage | Accessible? |
|---|---|---|---|---|---|
| benefit.housing | icon | benefit | Home-2--Streamline-Freehand | Listing housing label | Decorative (label nearby) |
| benefit.meals | icon | benefit | Fast-Food-Tacos…_ny6elu | Listing meals label | Decorative |
| benefit.pay | icon | benefit | Currency-Dollar-Symbol--Streamline-Freehand | Listing pay label | Decorative |
| action.save | icon | action | Love-It-Bookmark--Streamline-Freehand | Save / favorite | Labelled |
| action.apply | icon | action | Send-Email-Paper-Plane-1…_ledwtk | Quick Apply | Labelled |
| action.edit | icon | action | Form-Edition-Clipboard-Edit…_uv1w2f | Edit affordance | Labelled |
| action.settings | icon | action | Settings-Cog…_v76p9n | Settings | Labelled |
| status.applied | icon | status | Task-Clipboard-Check…_bzwdmb | Application submitted | Decorative + text |
| status.offered | icon | status | Notes-Paper-Approve…_fjiksx | Offer extended | Decorative + text |
| status.boosted | icon | status | Connect-Flash…_shywaj | Boosted listing | Decorative + text |
| trust.verified_host | icon | trust | Form-Validation-Check-Badge…_wpbhf3 | Verified host badge | Labelled |
| trust.featured_employer | icon | trust | Pin-Star…_tq0bkh | Featured employer (was unwired) | Decorative + text |
| profile.resume | icon | profile | Task-To-Do-List…_qz5iwz | Resume section | Labelled |
| work.harvest | icon | work | Farming-Wheat-Grain…_iw9geq | Farm work type | Decorative + text |
| empty.savedListings | illustration | empty | Style-Three-Pin-Heart…_hzjmax | Saved empty state | Decorative |
| empty.applications | illustration | empty | Job-Search-Magnifier-Briefcase…_jvsgve | Applied empty state | Decorative |
| empty.messages | illustration | empty | Conversation-Text-1…_d4hl32 | Messages empty (seeker+host) | Decorative |
| empty.community | illustration | empty | Meeting-Team…_tyigsb | Community feed empty | Decorative |
| empty.hostListings | illustration | empty | Shop-Sign-Open…_i7cxkb | Host listings empty | Decorative |
| hero.discover | illustration | hero | Landmarks-Telescope-Person…_zuwedm | Discovery hero accent | Decorative |
| success.applicationSubmitted | illustration | success | Send-Email-Paper-Plane-3…_ey3knh | App submitted success | Decorative |
| error.notFound | illustration | error | Server-Error-404-Not-Found…_cxwnrp | 404 (ready) | Decorative |
| accent.sparkle | element | accent | Sparkles-2…_q0yfrx | Featured/premium flourish | aria-hidden |
| accent.compass | element | accent | Compass…_xsrusn | Explore accent | aria-hidden |
| mark.divider | element | divider | — (CSS primitive) | Hand-drawn rule | aria-hidden |
