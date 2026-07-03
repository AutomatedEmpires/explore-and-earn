# Design System V2 — "Golden Hour Hybrid" × Fraunces

**Status:** Approved foundation (founder-authorized, 2026-06-21). **Supersedes** the founder-locked "Adventure Paper & Sky" (V2 tokens, 2026-06-10) and the Patrick Hand / Cabin Sketch type era.
**Visual anchor:** `docs/design/reference/_shots/system_board.png` (+ direction boards `dir_{A,B,C}_*.png`).
**Why:** the founder found the prior palette dull/flat/"fake." This overhaul makes E&E read as a premium, cinematic, dynamic adventure marketplace (Patagonia × Airbnb × National Geographic, Rivian-grade depth) without sacrificing the legibility a data-dense marketplace needs.

---

## 1. The core principle — Hybrid (dark-immersive + light-working)

One system, two registers. The register is chosen by **surface job**, not by component:

| Register | Used for | Treatment |
|---|---|---|
| **Dark · immersive** | homepage/marketing heroes, seeker discovery hero, listing-detail hero, profile hero, onboarding, full-bleed "moments" | golden-hour gradient + grain + glow, Fraunces display, photography/video pop, motion-forward |
| **Light · working** | seeker dashboards, forms, listings/feeds, messages, settings, tables | warm paper, soft depth, Fraunces titles + Inter data, fast & legible, restrained motion |

> **Host scope exception — "Host OS" (founder-directed, 2026-06-21).** The *entire* host dashboard uses the **dark-immersive** register: a dark-glass golden-hour command center (glass sidebar → mobile bottom-nav + drawer, glowing accents, grain, Fraunces, spring motion), per the host benchmark. Implemented as a scoped token cascade in `apps/web/styles/host-os.css` + `HostShell` + `StaggerReveal`; every host surface inherits it. Seeker working surfaces remain light.

The **wow lives in the immersive moments**; the **work happens on light surfaces**. This is how Airbnb/Hopper operate and is why we did not go full-dark (Direction B).

## 2. Color system (the re-skin lever)

Token **names stay stable** (semantic layer unchanged) — only **values change**, so all 160 CSS modules re-skin automatically. Tier 1 primitives → Tier 2 semantics (feature code references semantics only).

### Neutrals (warm)
| Token | Value | Role |
|---|---|---|
| `--palette-paper` | `#FAF7F1` | page background (light) |
| `--palette-surface` | `#FFFFFF` | card surface |
| `--palette-surface-2` | `#F4EFE6` | sunken/subtle fill, inputs-rest |
| `--palette-ink` | `#1A1714` | primary text |
| `--palette-ink-soft` | `#57514A` | secondary text |
| `--palette-ink-muted` | `#8B847A` | muted text / labels |
| `--palette-line` | `#ECE5D8` | hairline borders |
| `--palette-line-strong` | `#DCD3C2` | emphasized borders |

### Brand / signature
| Token | Value | Role |
|---|---|---|
| `--palette-amber` | `#E0922F` | **primary accent / CTA** (signature) |
| `--palette-amber-deep` | `#B26A12` | amber text-on-light (contrast-safe) |
| `--palette-amber-light` | `#F8E7C6` | amber chip bg |
| `--palette-teal` | `#14756A` | **secondary accent** |
| `--palette-teal-deep` | `#0E574F` | teal text emphasis |
| `--palette-teal-light` | `#DCEAE7` | teal chip bg |
| `--palette-navy` | `#0E1730` | hero/immersive base |
| `--palette-navy-2` | `#2A2342` | golden-hour mid-stop |
| `--palette-plum` | `#9A4A46` | golden-hour mid-stop |
| `--palette-bone` | `#FBF4E8` | text on dark |

### Immersive (dark) surfaces
`--palette-dark #0C1226` · `--palette-dark-2 #141A30` · `--palette-on-dark #FBF4E8` · `--palette-on-dark-muted #C9C2B4` · dark hairline `rgba(255,255,255,.12)`.

### Status (semantic, paired bg/fg — never color-only)
success `#DCEAE7`/`#146A5E` · warning `#F8E7C6`/`#9A6A12` · error `#F6DDD2`/`#B23A22` · info `#E6E1F5`/`#5B53B0`. Lifecycle ready/soon/later/urgent re-tinted to teal/amber/clay/red.

### Category lanes (keep all 5; re-tinted)
farm `#E7EAD4`/`#4E6A2E` · maritime `#D6E7EE`/`#14756A` · remote `#E2E4E8`/`#44505E` · seasonal `#F4E2CB`/`#9A5A2E` · mix `#ECE0EC`/`#7A4A6E`. Each lane also gets a **deep atmosphere gradient** (golden-hour-tinted) for hero/cover surfaces — never re-rolled per component (drift rule holds).

### Gradients (locked set — never hand-roll raw-hex gradients)
- `--gradient-goldenhour` = `linear-gradient(135deg,#0E1730 0%,#2A2342 34%,#9A4A46 68%,#E0922F 100%)` — **the brand fingerprint** (hero base).
- `--gradient-aurora-soft` — soft radial teal→lilac→peach for light ambient "weather."
- `--gradient-amber`, `--gradient-teal`, `--gradient-meter` (teal→amber), `--gradient-hero-scrim` (bottom ink fade).
- `--gradient-cat-{farm,maritime,remote,seasonal,mix}` — per-lane atmospheres.

### Grain (the anti-"fake" move)
`--grain` = tiling SVG `feTurbulence` data-URI; applied via a `.grain::after` overlay at `--grain-opacity: 0.18`, `mix-blend-mode: overlay`. On every immersive surface and optionally subtle on light panels.

### Elevation (deliberate evolution: "borders + soft depth")
The prior "borders-first, no shadows" rule relaxes — premium depth is part of the brief. New warm-tinted scale: `--elev-whisper` (subtle), `--elev-card` (`0 12px 36px rgba(26,23,20,.08)`), `--elev-raised`, `--elev-overlay`, `--elev-glow` (amber/teal glow for immersive). Hairline borders remain; shadows now allowed on cards.

## 3. Typography

- `--font-display` = **Fraunces** (variable serif, opsz 9–144, wght 400–900) — hero headlines, page/section/card titles, **KPI numerals**.
- `--font-ui` = **Inter** (variable) — body, data, forms, buttons, meta, labels.
- **Retired:** Patrick Hand (`--font-display` old), Cabin Sketch (`--font-accent`). `--font-accent` is removed; references migrate to display or ui.
- Self-host both via `next/font` (zero CLS, no external requests). Fraunces uses optical sizing.
- **Fluid scale** (clamp, fluid mobile→desktop):

| Role | clamp |
|---|---|
| display | `clamp(40px, 5vw, 64px)` / 1.02 |
| page (h1) | `clamp(30px, 3.4vw, 40px)` / 1.1 |
| section | `clamp(22px, 2.4vw, 28px)` / 1.2 |
| card | `22px` / 1.25 |
| body | `16px` / 1.55 |
| meta | `14px` · caption `12px` · label `12px`+`.12em` · button `15px` |

Weights: display 500/600 (700 sparingly); body 400/500/600. No 800+ except numerals where Fraunces earns it. Body floor 14px; 16px on mobile (no iOS zoom).

## 4. Motion

- **Library:** `motion` (Framer Motion v12, `motion/react`). `LazyMotion` + `domAnimation` (~15KB). **Client-leaf only** — page shells stay server components; motion isolated in small `"use client"` leaves. React 19-compatible version.
- **Tokens:** `--motion-fast 140ms` · `--motion-base 240ms` · `--motion-slow 420ms` · `--motion-drawer 360ms` · `--ease-out cubic-bezier(0.16,1,0.3,1)` (expo-out, the premium curve).
- **Patterns:** spring state changes (Family-style), scroll-reveal + stagger ("things falling into place"), hero/gradient ambient drift (subtle), press/hover/focus on every interactive el.
- **Hard gates (from `motion-system.md`):** transform/opacity only; name every animation's meaning or cut it; `useReducedMotion()` wired once, all entrance/parallax gated; final state always reached.

## 5. Responsive system

- **Container queries inside components** (Discovery Card, KPI, panels adapt to *their slot*) + **media queries for the page shell**, dark mode, reduced-motion.
- **Breakpoints** (content-driven, min-width): 480 / 640 / 768 / 1024 / 1280 / 1536.
- **Nav reflow (one component set):** bottom tab bar (mobile) → collapsed icon **rail** (tablet) → labeled **sidebar/top bar** (desktop).
- **What reflows:** grid columns, type scale (`clamp()`), density, gutters. **What stays fixed (identity):** HOUSING/MEALS/PAY triad, photo aspect, accent system, golden-hour gradient.
- **Heroes:** art-directed — full-bleed cinematic on desktop → centered 4:5 crop on mobile (object-position, not naive scale).

## 6. Icons

- **Streamline HQ Pro**, **one family + one weight** as the system (a second role-scoped family only for filled/emphasis status, only if proportionally matched). Swapped behind the **existing `<Icon name="domain.name"/>` registry** under the same stable keys → no feature-code changes; CI G30 still bans stray icon sets.
- Licensed source files **stay out of the public repo**; export optimized SVGs (SVGO, `currentColor`, single stroke token) into the registry build.

## 7. Implementation strategy

1. **Tokens first** — rewrite `apps/web/styles/tokens.css` values (names stable) + mirror in `packages/ui/src/tokens.ts`. The whole app re-skins in one commit. Add fonts via `next/font`. Add `motion` dep. Add `--grain`, gradient, elevation, motion tokens.
2. **Verify the cascade** — render every major surface (dev bench: seeker/host/admin) before/after; fix contrast/legibility regressions from the palette shift; `lint + typecheck + build` green.
3. **Surface rollout** — per surface: apply immersive-vs-working register, motion, container-query responsive, Streamline icons; score with `page-scorecard.md` (every dim ≥ 8) at 380/768/1280 + reduced-motion.
4. **Preserve always:** auth, data contracts, routing, Stripe, Supabase/RLS, server/client boundaries, SEO metadata, a11y baseline. Restructure UI, not logic.

### First slice (approved)
**(a) tokens.css re-skin** (global) → **(b) homepage/marketing hero** + **(c) seeker discovery hero** as the two immersive proof surfaces (golden-hour gradient, Fraunces, grain, motion). Highest visual impact, fastest.

## 8. Governance / docs to update
Founder-authorized supersession. Update: `apps/web/styles/tokens.css`, `packages/ui/src/tokens.ts`, and the locked docs `docs/design/design-system-v1.md`, `visual-language.md`, `photo-language.md` (note the supersession + date); refresh design-brain `brand-direction.md`, `visual-system.md`, `motion-system.md`, `component-rules.md`, `page-scorecard.md` to the new direction. Keep one source of truth; flag any remaining "Adventure Paper & Sky" references.

## 9. Risks & mitigations
- **Palette-shift regressions** (contrast/legibility across 160 modules) → render-audit every surface post-cascade; WCAG check amber/teal on light.
- **Motion perf/jank** on the constrained dev box → LazyMotion, transform/opacity only, reduced-motion; measure.
- **Scope creep** (full-app redesign) → phased: foundation → 2 heroes → surface-by-surface, each shippable + scorecard-gated.
- **Dark/light contrast in hybrid** → define on-dark tokens explicitly; test both registers.
- **Streamline licensing** → source out of public repo (CI guard exists).

## 10. Success criteria
- Every redesigned surface scores **≥ 8 on all 13 `page-scorecard.md` dimensions** at 380 / 768 / 1280 + reduced-motion.
- No business-logic/auth/SEO/a11y regressions; `lint + typecheck + build` green.
- Reads unmistakably premium/cinematic/dynamic — "could open a National Geographic feature," not a flat SaaS app.
