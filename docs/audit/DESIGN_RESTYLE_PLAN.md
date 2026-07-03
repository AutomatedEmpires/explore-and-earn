# Explore&Earn — Design Restyle Plan

_Companion to DESIGN_RESTYLE_AUDIT.md. Elevate within the founder-locked
"Adventure Paper & Sky" system — never replace it._

## 0. Operating principles

- **Tokens are law.** Every value references a semantic token. No raw hex/px in
  feature CSS. New shared values become tokens in `tokens.css` first.
- **Foundation before surfaces.** Improve `tokens.css` + `primitives.css` + shared
  patterns, then let ~100 token-driven CSS modules inherit the upgrade for free.
- **Preserve the strong surfaces** (homepage, DiscoveryCard, PopupShell, error art,
  GlobalHeader, community, legal). Extend them; don't rebuild.
- **CSS/markup-class only.** No changes to routing, data fetching, auth/session,
  Supabase, server actions, contracts, pricing, or the Housing/Meals/Pay triad.
- **Mobile-first at 375px**, then 768, then 1440. Add a `--bp-xs` (380px) tier.

---

## 1. Visual design direction

Keep the identity: **adventurous, practical, human field-journal meets cool sky-blue
action.** Push it from "clean prototype" to "premium marketplace" with:

- **More depth, carefully** — a single soft `--elevation-card` lift on raised
  surfaces and `--elevation-hover` on interactive cards. Stays borders-first; the
  shadow is a whisper, not a SaaS drop-shadow.
- **Intentional gradients** — tokenized warm-paper and sky gradients for heroes,
  section accents, and premium/boost moments only.
- **Stronger hierarchy** — one dominant number/CTA per module; everything else recedes.
- **Tactile inputs** — real focus rings, placeholder color, hover, error language.
- **Alive loading** — shimmer skeletons that match the loaded layout.

---

## 2. Mobile-first layout strategy

- Add `--bp-xs: 380px` token + a documented breakpoint ladder: xs 380 / sm 640 / md
  768 / lg 1024.
- **44px minimum** interactive height everywhere (add `--tap-min: 44px`).
- Collapse all `repeat(2–3, 1fr)` grids to 1–2 cols at `--bp-xs`.
- Tables → card-ish stacks or reduced type + wrap at ≤640px.
- Horizontal rails get an edge fade affordance.
- Responsive hero heights via `clamp()` (showcase, map, popup hero).

---

## 3. Design token strategy (`apps/web/styles/tokens.css`)

Add (names stable, values founder-aligned):

```
--bp-xs: 380px;
--tap-min: 44px;
--elevation-card:  0 1px 2px rgba(36,34,30,.05), 0 2px 8px rgba(36,34,30,.05);
--elevation-hover: 0 6px 18px rgba(36,34,30,.10);
--gradient-sky:        linear-gradient(135deg, var(--palette-sky) 0%, var(--palette-teal) 100%);
--gradient-paper-warm: linear-gradient(160deg, var(--palette-parchment) 0%, var(--palette-surface) 100%);
--gradient-gold:       linear-gradient(135deg, var(--palette-amber) 0%, var(--palette-amber-light) 100%);
--gradient-hero-scrim: linear-gradient(180deg, rgba(26,30,34,0) 0%, rgba(26,30,34,.55) 100%);
--field-bg: var(--color-surface-raised);
--field-border: var(--border-soft);
--field-border-focus: var(--color-cta);
--field-border-error: var(--status-error-fg);
--placeholder: var(--text-muted);
```

No existing token values change — additive only.

---

## 4. Typography strategy

Type scale is already solid (8 sizes, Patrick Hand display / Inter UI). Changes:

- Add a `.ui-section-head` pattern (display title + Inter sub) so every surface uses
  the same heading rhythm instead of bespoke pairs.
- Enforce **min 14px** for any interactive/label text on touch surfaces (several are
  10–12px today).
- Keep Patrick Hand for titles/values, Inter for body/meta/labels (canon).

---

## 5. Card system strategy

- `.ui-card` gains an optional `--elevation-card` and an `.ui-card--interactive`
  modifier with `--elevation-hover` + 2px lift (reduced-motion safe).
- Keep DiscoveryCard's bespoke system intact; only add the shared hover token where
  it doesn't conflict.
- One `.ui-category-badge` class replaces the per-component `data-category` selectors.

---

## 6. Navigation strategy

- GlobalHeader/bottom navs are polished — keep. Tokenize the one hardcoded shadow.
- Ensure all nav tap targets ≥ `--tap-min` and active state never color-only (already
  honored via weight + aria-current).
- Add a subtle top hairline + `--elevation-card` to bottom navs for separation from
  scrolling content.

---

## 7. Dashboard strategy

- **Stat strips**: introduce `.ui-stat` / `.ui-stat--primary` — primary promotes the
  value (display font, accent color, soft lift); rest recede. Replaces flat chips in
  SeekerDashboard, HostDashboard, HostStatStrip, ProfileHub.
- Consistent `.ui-section-head` across dashboard sections.
- Friendly `.ui-empty` for empty rails (MatchCardRail, lifecycle) with a CTA.

---

## 8. Form strategy (biggest lever)

Add to `primitives.css`:

- `.ui-field` (label+control+help stack), `.ui-label`, `.ui-input`, `.ui-textarea`,
  `.ui-select`, `.ui-help`, `.ui-error`, `.ui-field--invalid`.
- Real states: `:focus-visible` ring (token), `::placeholder` color, `:disabled`,
  error border + message color.
- Adopt incrementally: onboarding first (worst), then HostListingForm/HostProfileForm,
  ReplyForm, ImageUpload — by adding the `ui-*` classes alongside existing module
  classes (no structural/JS change).

---

## 9. Empty / loading / error state strategy

- **Loading**: shimmer keyframe variant on `.ui-skeleton` (gradient sweep), fix
  DiscoveryCardSkeleton cover AR to 4:3.
- **Empty**: `.ui-empty` shared pattern (icon pill + display title + body + optional
  CTA), retrofit discovery EmptyState and dashboard empties to it.
- **Error**: keep StatusCard art; ensure error.tsx routes reuse it (already do).

---

## 10. Execution phases (ordered by impact × safety)

| Phase | Work | Files | Risk |
|-------|------|-------|------|
| **F1 Tokens** | Add bp-xs, tap-min, elevation, gradient, field tokens | `styles/tokens.css` | none (additive) |
| **F2 Primitives** | Inputs/fields, section-head, empty, stat, category-badge, card-hover, shimmer skeleton, fix skeleton AR | `styles/primitives.css`, DiscoveryCardSkeleton.module.css | low |
| **F3 Nav shell** | Bottom-nav hairline+elevation, tokenize header shadow | `*BottomNav.module.css`, `GlobalHeader.module.css` | low |
| **F4 Forms adopt** | Onboarding → ui-field/input; then host/seeker forms | onboarding.module.css + tsx, Host*Form, ReplyForm | med (JS-toggled classes — additive only) |
| **F5 Dashboards** | Stat hierarchy + section heads + empties; tokenize hardcoded hex | SeekerDashboard, HostDashboard, HostStatStrip, ProfileHub, MatchCardRail | med |
| **F6 Cards/discovery** | category-badge class, showcase responsive hero, mobile gaps | DiscoveryShowcaseCard, discovery feed, CategoryBadge | med (avoid DiscoveryCard JSX) |
| **F7 Homepage polish** | gradient tokens, elevation on cards, mobile spacing | `app/page.module.css` | low |
| **F8 Auth theme** | Clerk `appearance` → tokens | `(auth)/sign-in`, `sign-up` | low |
| **F9 Mobile sweep** | bp-xs collapses, 44px targets, table adaptation, map heights | host + seeker + legal modules | med |
| **F10 QA** | lint, typecheck, build, Playwright @375/768/1440, fix regressions | — | — |

Phases F1–F3 are pure foundation and ship first. F4–F9 apply the foundation surface
by surface. Each phase keeps the build green before moving on.
