# Reference Patterns — Explore&Earn

> **Status:** Design-brain. A **cookbook of reusable, composable building blocks** that implement the vision in [`inspiration-library.md`](./inspiration-library.md), mapped to real tokens ([`tokens.css`](../../apps/web/styles/tokens.css)) and primitives ([`packages/ui`](../../packages/ui/src)). **Patterns and principles, not copied designs.** Each: *Solves · When · Structure · Premium-makers · Mistakes · E&E mapping.*

---

## P1 · Hero-as-thesis
- **Solves:** land a feeling + focal point in 0.5s. **When:** homepage, category, listing detail, dashboard/profile headers.
- **Structure:**
  ```
  ┌──────────────────────────────────────┐
  │  [ framed scenic photo / lane gradient ]│
  │                                        │
  │     EYEBROW (label, tracked)           │
  │     Display headline (Patrick Hand)    │
  │     one supporting line                 │
  │     [ Primary CTA ]                     │  ← scrim fades up behind text
  └──────────────────────────────────────┘
  ```
- **Premium:** one headline, one CTA, warm photo, bottom-weighted `--gradient-hero-scrim`. **Mistakes:** competing CTAs, centered everything, filter-on-photo, CLS.
- **E&E:** `--type-display-size` + `--font-display`; `next/image` reserved; balance lanes.

## P2 · Frame-not-filter photo
- **Solves:** premium keepsake imagery without mutating host photos. **When:** every host photo, hero, card, community post.
- **Structure:** `paper mat (--color-parchment) → --border-ink → --radius-image → photo`. Legibility only via `--gradient-hero-scrim` *overlay*, never a wash on the pixels.
- **Premium:** the frame says "made/curated." **Mistakes:** filters/overlays on the photo, gray box when absent. **E&E:** see [`photo-language.md`](./photo-language.md); no-photo → lane `--gradient-category-*` + silhouette.

## P3 · Depth-without-shadow (borders-first card)
- **Solves:** depth that fits the journal aesthetic. **When:** all cards/rows/panels.
- **Structure:** `--color-surface` + `--border-ink` + `--radius-card` + `--space-card`, **no shadow**. Interactive: + `--elevation-hover` lift + 2px rise on hover, press-scale on tap.
- **Premium:** warm-on-warm + ink line + framed media. **Mistakes:** drop-shadow stacks, flat gray. **E&E:** `Card` / `ui-card`.

## P4 · Triad chip row (HOUSING / MEALS / PAY)
- **Solves:** the product's core promise, scannable. **When:** every listing/discovery surface.
- **Structure:** `[🏠 Housing: bunk] [🍽 Meals: included] [💲 Pay: $640/wk]` — icon + label + value, three `--benefit-*` chips.
- **Premium:** first-class, specific values. **Mistakes:** collapsing to "Perks," color-only, vague. **E&E:** `Chip`/`ui-chip` + `--benefit-housing|meals|pay`; Streamline icons.

## P5 · Peek rail (horizontal scroller)
- **Solves:** browse many without leaving; signal "there's more." **When:** matched/saved/applied/community rails.
- **Structure:** `ui-section-head` (Patrick Hand + "See all") → horizontal scroll of cards with a **visible affordance**: edge fade and/or a peek of the next card at the gutter.
- **Premium:** the peek/fade. **Mistakes:** content clipped flush at the edge (looks like the row ends), fixed-px widths that don't reflow. **E&E:** `ui-rail` + `DiscoveryCard`; reveal-on-scroll stagger (P12).

## P6 · Bottom-sheet escalation
- **Solves:** depth on mobile without a new page. **When:** map detail, filters, listing quick-view, confirm flows.
- **Structure:** scrim (`--elevation-overlay`) + draggable sheet from bottom, `--motion-drawer`, swipe-down dismiss, safe-area inset. **Enter and exit both animated.**
- **Premium:** momentum + symmetric exit. **Mistakes:** center dialog on mobile, no exit animation, dismiss without unsaved-changes confirm. **E&E:** `Modal`/`PopupShell` in sheet mode.

## P7 · Promoted-KPI strip
- **Solves:** hierarchy in stats. **When:** dashboards.
- **Structure:**
  ```
  ┌──────────────┐  ┌─────┐ ┌─────┐ ┌─────┐
  │  12          │  │  3  │ │  8  │ │ 94% │   ← one big promoted metric,
  │  applicants  │  │ new │ │live │ │ fill│      the rest subordinate
  └──────────────┘  └─────┘ └─────┘ └─────┘
  ```
- **Premium:** one dominant value (Patrick Hand, larger). **Mistakes:** a row of identical flat boxes. **E&E:** `ui-stat`.

## P8 · Intent-grouped dashboard
- **Solves:** kills "generic admin" by grouping by *what the user should do*. **When:** seeker & host dashboards.
- **Structure:** hero/next-action band → **Needs me** → **In motion** → **Done**. Each group = a titled section of cards.
- **Premium:** opens on a next-action, not a grid. **Mistakes:** grouping by data type; dense table as the front door. **E&E:** `ui-section-head` + intent sections.

## P9 · Map + list duality
- **Solves:** explore location as a feeling. **When:** `/map`, `/saved`.
- **Structure:** *mobile* = full map + draggable sheet w/ selected `DiscoveryCard`; *desktop* = split map+list, hover↔pin highlight. Branded pins, clustering.
- **Premium:** linked highlight, custom pins. **Mistakes:** default pins, gray load box, unreserved height. **E&E:** Mapbox (`react-map-gl`) + `--elevation-pin`, lane-tinted pins.

## P10 · Journey / readiness surface
- **Solves:** profile as a story, not a form. **When:** `/profile`, `/journey`, resume.
- **Structure:** scrim hero + avatar overlap → readiness state chip (`--state-ready|soon|later|urgent`) → been/headed sections → saved/applied rails.
- **Premium:** narrative + readiness. **Mistakes:** flat field dump; résumé-form framing. **E&E:** `ui-avatar`, `Meter` for completion, `--state-*`.

## P11 · Designed empty state
- **Solves:** turn "nothing here" into momentum. **When:** every list/rail/feed that can be empty.
- **Structure:** illustration + Patrick-Hand one-liner + plain supporting line + **one CTA**.
- **Premium:** an invitation in the product's voice. **Mistakes:** bare placeholder, apology, real-content-worse-than-fixtures. **E&E:** `ui-empty` + `AppIllustration`.

## P12 · Shimmer skeleton mirroring layout
- **Solves:** "alive" loading that doesn't jump. **When:** every async surface (`loading.tsx`).
- **Structure:** skeleton shaped like the *real* result (card → card-skeleton), with a shimmer sweep — **not** an opacity pulse.
- **Premium:** load→loaded with no layout jump. **Mistakes:** opacity-pulse (reads cheap), generic spinner, mismatched shapes. **E&E:** `Skeleton`/`ui-skeleton` (+shimmer).

## P13 · Reveal + stagger
- **Solves:** confident entrance. **When:** hero load, rails, lists.
- **Structure:** fade + 8–12px rise, `--motion-base`/`--ease-standard`; stagger 30–50ms/item (capped); reveal once. **Mistakes:** animate-on-every-scroll, all-too-slow, no reduced-motion. **E&E:** [`motion-system.md`](./motion-system.md) §reveal.

## P14 · State trio (press · hover · focus)
- **Solves:** every interactive element feels responsive & accessible. **When:** all buttons/cards/chips/links.
- **Structure:** **press** scale 0.97 + dim (`--motion-fast`, mobile-primary, most-skipped); **hover** lift/color (pointer); **focus** `--color-cta` ring (always visible, instant).
- **Mistakes:** hover-only (no tap/focus), removed focus ring. **E&E:** every primitive supports `COMPONENT_STATES`.

## P15 · Guided stepper ("why this matters")
- **Solves:** forms that feel like a journey, not a chore. **When:** onboarding, resume builder, listing builder.
- **Structure:** legible progress (not absolute-positioned over the bar) → per-step intro line ("why this matters") → composed `ui-field`s → sticky mobile CTA → save state (loading/success).
- **Mistakes:** flat steps, bespoke inputs, static dots, sub-44px controls. **E&E:** build/compose `ui-field`; `Meter` for progress.

## P16 · Trust band
- **Solves:** make the promise believable at the decision point. **When:** listing detail, application/offer, host profile.
- **Structure:** triad (P4) + `VerifiedHostBadge` **+ "Self-Declared by Host" qualifier** + specific honest data.
- **Mistakes:** logo-wall trust, dropped qualifier (CI G22 fail), implied guarantees. **E&E:** `VerifiedHostBadge`, `--status-verified_host`.

## P17 · Reserved gold (boosted/premium)
- **Solves:** sell upgrades as valuable, not spammy. **When:** boosted cards, billing, founding-host.
- **Structure:** a single tasteful gold accent (`--color-gold`/`--status-boosted`) + clear "why it helps"; `FoundingCountdown` for tasteful scarcity.
- **Mistakes:** gold everywhere (kills specialness), flashing "BOOST!!!", dark-pattern urgency. **E&E:** reserve gold; `FoundingCountdown`.

---

**Composition example — a discovery feed surface:** P1 hero → P5 peek rails of [P3 cards: P2 framed photo + P4 triad + P16 trust + P14 states] → P12 skeletons while loading → P11 empty state if none → P13 reveal on scroll. Every block maps to a token and a primitive; nothing is invented per-surface.
