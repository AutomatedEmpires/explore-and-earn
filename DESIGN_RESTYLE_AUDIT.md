# Explore&Earn — Design Restyle Audit

_Audited 2026-06-14. Scope: full app visual + UX quality, mobile-first._

This is **not** a greenfield restyle. Explore&Earn already has a **founder-locked
design system** — "Adventure Paper & Sky" tokens (`apps/web/styles/tokens.css`),
`ui-*` primitives (`apps/web/styles/primitives.css`), Patrick Hand display + Inter
UI, Streamline Freehand icons, flat/borders-first surfaces, hand-drawn photo
frames. The mandate (AGENTS.md §6) is **use the locked tokens verbatim, never
invent visual direction, never hardcode values that bypass tokens.**

So the restyle is **elevation within the system**, not replacement: close the gaps,
fix the mobile-first regressions, and systematize the patterns that are currently
re-invented per-component. The strongest surfaces are already premium and must be
preserved.

---

## 1. Current visual problems

| # | Problem | Where | Severity |
|---|---------|-------|----------|
| P1 | **No shared input/textarea/select/checkbox primitive.** Every form re-invents padding, border, radius, focus, placeholder. Inconsistent and prototype-feeling. | onboarding, ReplyForm, HostListingForm, HostProfileForm, ImageUpload | **Critical** |
| P2 | **Onboarding inputs have no focus ring at all**; option/tag "selected" states use ad-hoc 2px outlines, not the token focus system. | `(seeker-onboard)/onboarding/*` | High |
| P3 | **Hardcoded hex bypassing tokens** in `color-mix()` fallbacks and gradients (`#fee2e2`, `#dc2626`, `#fdf5e3`, `#F5E6C0`, `#2F667A`, legal hero rgba). Violates drift rule; breaks palette lock. | HostHeader, HostListingCard, HostAnalytics, *FormDrawer, SeekerDashboard resume callout, legal | High |
| P4 | **Flat, low-hierarchy stat/summary strips.** Stat chips are uniform 1px-border boxes on paper; no emphasis on the value that matters (pending actions, "Can Apply", readiness). | SeekerDashboard stats bar, HostDashboard pending, HostStatStrip, ProfileHub status grid | High |
| P5 | **Skeletons are opacity-pulse only** — no shimmer/wave. Reads cheap vs. the premium loaded state. DiscoveryCardSkeleton cover AR (3:2) mismatches the card (4:3). | primitives.css `.ui-skeleton`, DiscoveryCardSkeleton | Medium |
| P6 | **No gradient token system.** Premium gradients exist but are hand-rolled per file (legal heroes, footer wordmark, PopupShell, resume callout) → unmaintainable, drifts off-palette. | legal, SiteFooter, PopupShell, SeekerDashboard | Medium |
| P7 | **No mid-tier elevation.** Only `--elevation-overlay` and `--elevation-pin`. No soft hover-lift token, so depth is either flat or modal-heavy. | tokens.css | Medium |
| P8 | **Clerk auth is completely unthemed** — generic Next/Clerk default, zero design continuity with the branded app. | `(auth)/sign-in`, `sign-up` | High |
| P9 | **CategoryBadge re-defined per component** via `data-category` attribute selectors instead of one reusable class. | listing, search, map | Low |

---

## 2. Mobile-first issues (audited at 375px)

- **No explicit small-screen breakpoint** in most seeker/host components. The token
  scale starts at `--bp-sm: 640px`, leaving 375–639px unserved. Layouts assume
  "480px+ is mobile-small."
- **Touch targets below 44px**: `.quickBtn` (32×32), `.clearSelected` (28×28), modal
  icon buttons (28–32), DashboardNav close (36), ReadinessSlider pills (~28). WCAG fail.
- **Grids that don't collapse at 375px**: HostListingCard stats (3-up compresses to
  ~100px cells), HostListingForm/`.row` (fixed `repeat(2,1fr)`), legal badge grid
  (3-up, text wraps/clips), SeekerDashboard lifecycle teasers.
- **Tables don't adapt**: HostAnalytics table keeps 16px body font + `nowrap`
  ellipsis on titles; columns collapse and cut mid-word below 480px.
- **Horizontal stat/match rails have no scroll affordance** — content beyond the
  edge is invisible (no fade/hint), reads as "that's all there is."
- **DiscoveryCard / showcase**: card text cramped under 320px container; showcase hero
  fixed at 15rem (240px) so a single card exceeds viewport height on a phone.
- **Map**: height locked to `max(34rem, …)`; tray takes ~48% of a short screen; tray
  handle layout differs mobile vs desktop (centered grid vs space-between flex).

---

## 3. Components that feel prototype-level

- **All forms** (the single biggest gap) — no primitive, no validation language, no
  placeholder styling, inconsistent focus.
- **Onboarding** — input focus missing, static progress dots, ad-hoc selected states.
- **Stat chips / summary strips** — uniform flat boxes, no hierarchy.
- **Auth** — unstyled Clerk.
- **DiscoveryCard CTA buttons** — styled via inline ternary `style={}` computations
  rather than CSS classes (`ctaBorderVal`, `ctaShadow`), hard to maintain.
- **MatchCardRail empty state** — generic placeholder, no story/CTA.

---

## 4. Screens to PRESERVE & improve (do not replace)

These are already at or near premium — touch only to extend mobile/hierarchy, never rebuild:

- **DiscoveryCard** (`packages/ui`) — multi-layer inset/catch-light/glow/vignette,
  container-query responsive, category atmospheres. **Locked skeleton — preserve.**
- **Homepage** (`app/page.tsx`) — full-bleed photo hero, auto-scroll category reel,
  tiered employer card, community teaser. Strong; make more premium, don't rebuild.
- **PopupShell** (`overlay/`) — layered scrim, catch-light, textured panel. Premium.
- **StatusCard** error/404 art — bespoke illustration. Leave the SVG alone.
- **GlobalHeader** — navy gradient, scope badge, hide-on-scroll, community tabs. Polished.
- **CommunityDashboard** — frame+mat photo cards, reactions, blog-grade layout.
- **Legal suite** — rich heroes, badge/provider grids (only tokenize + fix mobile grid).
- **SeekerHero / ProfileHub hero** — scrim gradient, avatar overlap, badge pulse.
- **BenefitTrustModal** — category atmospheres, silhouette pseudo-elements.

---

## 5. Design-system gaps (the heart of the work)

| Gap | Impact | Fix tier |
|-----|--------|----------|
| No `.ui-input / .ui-textarea / .ui-select / .ui-field / .ui-label / .ui-help / .ui-error` primitives | Forms can't be consistent or premium | Foundation |
| No `::placeholder` + disabled + error/validation language | Forms look unfinished | Foundation |
| No gradient tokens (`--gradient-*`) | Premium gradients drift off-palette | Foundation |
| No mid elevation (`--elevation-card`, `--elevation-hover`) | Depth is all-or-nothing | Foundation |
| Skeleton = opacity only; no shimmer | Loading feels cheap | Foundation |
| No reusable section-header pattern (each surface rolls its own) | Inconsistent rhythm | Foundation |
| No reusable empty-state pattern beyond discovery's one-off | Empty screens vary | Foundation |
| No small-screen spacing/breakpoint convention (`--bp-xs`) | Mobile-first not enforced | Foundation |
| Clerk `appearance` not wired to tokens | Auth off-brand | Foundation |
| CategoryBadge not a single class | Minor drift | Sweep |

---

## 6. Highest-impact fixes (ordered)

1. **Build the form foundation** — `.ui-input/.ui-textarea/.ui-select/.ui-field/
   .ui-label/.ui-help/.ui-error` + placeholder/disabled/focus/error states in
   `primitives.css`. Adopt across onboarding + host/seeker forms. _(Fixes P1, P2.)_
2. **Add token primitives** — gradient tokens, `--elevation-card/-hover`, shimmer
   skeleton, `--bp-xs: 380px`, focus-on-inputs. _(Fixes P5, P6, P7.)_
3. **Section-header + empty-state shared patterns** (`.ui-section-head`,
   `.ui-empty`) so every surface gets consistent rhythm and friendly empties.
4. **Hierarchy pass on stat strips / summary rows** — promote the one number that
   matters (accent value, subtle lift), tokenize the ad-hoc colors. _(Fixes P3, P4.)_
5. **Mobile-first pass** — add `--bp-xs` collapses, 44px min touch targets, table
   adaptation, rail scroll-affordance, responsive hero heights.
6. **Theme Clerk auth** to the palette. _(Fixes P8.)_
7. **De-hardcode** the `color-mix` fallback hexes → semantic tokens. _(Fixes P3.)_
8. **DiscoveryCard CTA → CSS classes** (carefully; see risks).

---

## 7. Risk areas (where careless edits break things)

- **DiscoveryCard** — container-query thresholds drive `--dc-*` consumed in inline
  styles; badge placement + CTA styling computed in JSX. CSS-class extraction must
  keep the JSX contract. Swipe physics use inline `will-change`. **Highest risk.**
- **JS-driven classnames** — active/selected/stage classes are toggled in TSX
  (nav, pipeline stages, chips, drag-drop `.zoneDragging`). Rename nothing; only
  restyle existing class names.
- **Avatar overlap** (ProfileHub/SeekerHero) — negative-margin math is load-bearing;
  changing identity-bar padding without matching avatar size clips the avatar.
- **Animation keyframes tied to px** — JourneyPipeline `urgent-pulse`, badge pulse:
  resizing the dot requires resizing the shadow.
- **Map** — `100dvh` + `calc(50% - 50vw)` centering is fragile; test iOS address-bar.
- **PopupShell** — enter animation on mount; no exit animation (don't add a close
  transition without checking unmount path).
- **Business logic untouchable** (AGENTS.md §4): auth/session, schema/migrations,
  Stripe, matching, RLS, pricing values, the Housing/Meals/Pay triad copy. Restyle
  is CSS/markup-class only — **no data, route, server-action, or contract changes.**
