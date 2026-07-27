# Visual System — Explore&Earn

> **Status:** Design-brain *how-to*. The **values are founder-locked** in [`apps/web/styles/tokens.css`](../../apps/web/styles/tokens.css) and mirrored typed in [`packages/ui/src/tokens.ts`](../../packages/ui/src/tokens.ts); the canon narrative is [`design-system-v1.md`](./design-system-v1.md). **This file never invents values** — it tells you how to *compose* the locked tokens into premium surfaces. Token name vs. value conflict → the `.css` file wins; flag drift.
> Pairs with [`brand-direction.md`](./brand-direction.md) (the *why*), [`component-rules.md`](./component-rules.md) (per-component), [`motion-system.md`](./motion-system.md) (movement).

## 0. The five non-negotiable laws (from AGENTS.md §6 + drift-prevention)

1. **Tokens are law.** No raw hex, raw px type sizes, or ad-hoc radii in feature code. Reference semantic tokens only. (CI raw-hex check is planned.)
2. **Borders-first, not shadow-first.** Cards and rows = hand-drawn ink border (`--border-ink`) + **no shadow**. Shadows (`--elevation-overlay`, `--elevation-pin`) are reserved for *overlays and map pins only*.
3. **Frame, not filter, on host photos.** Never mutate a host photo. Frame *around* it (paper mat + ink border). Scrims for legibility use `--gradient-hero-scrim` only.
4. **One icon system:** Phosphor via the `<Icon name="domain.name"/>` registry (swapped from Streamline 2026-07-02 — see [`icon-system.md`](./icon-system.md)). No Lucide / Heroicons / Material / inline SVG in feature code (CI **G30**).
5. **No color-only meaning.** Status = icon **+** text (+ optional color). The triad and verification follow the same rule.

---

## 1. Color philosophy

The palette is **"Adventure Paper & Sky"**: a warm paper-and-ink base (the field journal) lifted by cool sky-blue actions, chrome neutrals, and earthy clay/gold accents. Three jobs:

| Job | Tokens | Rule |
|---|---|---|
| **Ground (paper & ink)** | `--color-paper` `#F6F1E7`, `--color-surface` `#FFFCF5`, `--text-primary` `#24221E`, `--text-secondary`, `--text-muted`, `--border-ink`, `--border-soft` | This is ~85% of every screen. Warm, calm, readable. The default is paper, not white, not gray. |
| **Act (sky)** | `--color-cta` `#2F667A`, `--color-header-bg`, `--palette-sky-*` | One clear action color. Primary CTAs, active nav, links, focus rings. Used **sparingly** so it always means "do this." |
| **Signal (earth & gold)** | `--color-gold` `#D8A84E`, category accents, `--status-*`, `--state-*` | Category lanes, boost/premium (gold), lifecycle (ready/soon/later/urgent), trust. Always paired bg+fg, never color-only. |

**Category atmospheres are pre-baked — never re-roll them.** Each lane has ONE locked gradient: `--gradient-category-{maritime|farm|remote|seasonal|mix|default}`. Apply on hero / cover / rail surfaces so every "maritime" surface renders the *same* deep blue. Hardcoding category hex in JS is the #1 documented drift defect — do not.

**Gradients:** use the locked set only — `--gradient-sky`, `--gradient-sky-soft`, `--gradient-paper-warm`, `--gradient-gold`, `--gradient-hero-scrim`, the `--gradient-category-*` and `--gradient-cover-*` presets, and `--gradient-state-*`. **Never** write a one-off `linear-gradient(...)` with raw hex in feature CSS. "Random gradients" is an explicit founder anti-pattern.

## 2. Typography hierarchy

**One typeface, three roles** (commercial redesign, founder directive 2026-07-27 — see [`commercial-redesign-2026-07.md`](./commercial-redesign-2026-07.md) D1; supersedes the three-family stack this section used to lock):

- `--font-display` = **Manrope**, paired with `--font-weight-bold` (700) → display/page/section/card *titles*.
- `--font-ui` = **Manrope**, regular/medium → all body, UI, data, forms, buttons, meta. The product voice.
- `--font-accent` = **Manrope**, paired with `--font-weight-semibold` (600) → marketing accent **only**. Never in app chrome or data.

All three role tokens now resolve to the same loaded family — they survive as *roles*, not typefaces, so nothing that already references `var(--font-display)` / `var(--font-ui)` / `var(--font-accent)` needed to change. Personality moved from typeface novelty to weight, scale, and spacing. **Any rule that sets `font-family: var(--font-display)` or `var(--font-accent)` must also set a weight in the same declaration block** — Manrope's default (regular, 400) reads as plain body text at display sizes, which the old hand-drawn face never did.

Locked scale (use the role tokens, never raw px):

| Role | Size / LH token | Use for |
|---|---|---|
| display | `--type-display-size` 30 / 1.15 | Hero headline, marketing |
| page | `--type-page-size` 26 / 1.2 | Page H1 (dashboard title) |
| section | `--type-section-size` 22 / 1.2 | Section heads, rail titles |
| card | `--type-card-size` 20 / 1.25 | Card titles |
| body | `--type-body-size` 16 / 1.5 | Paragraphs, descriptions |
| meta | `--type-meta-size` 14 / 1.45 | Secondary info, captions-in-card |
| caption | `--type-caption-size` 12 / 1.4 | Timestamps, fine print |
| button | `--type-button-size` 15 / 1 | Button labels |
| label | `--type-label-size` 12 / 1 + `--type-label-tracking` 0.06em | Eyebrows, chip labels (uppercase) |

Weights: `--font-weight-regular|medium|semibold|bold|extrabold` (400/500/600/700/800). Display titles pair with `--font-weight-bold`; accent pairs with `--font-weight-semibold`; body/UI stays regular/medium. The old "no 700+" rule is retired — it existed to stop a decorative hand-drawn face from competing with itself at heavy weights, and Manrope has no such conflict; heavy weight is now how display type earns its hierarchy. **No body text below 14px**; 16px is the body floor on mobile (also prevents iOS input zoom). The founder explicitly dislikes "tiny text everywhere."

**Hierarchy recipe (every module):** one display/page title (Manrope bold) → one supporting line in `--text-secondary` (Manrope regular) → content. Weight and scale now carry the hierarchy a second typeface used to.

## 3. Spacing rhythm

2px base scale: `--space-2 … --space-48`. Semantic aliases: `--space-card` (16, inner card padding), `--space-row-gap` (12), `--space-section` (24, between sections), `--space-gutter` (16, page edge). Bottom nav reserves `--size-bottom-nav` (64).

Rules:
- **Rhythm tiers, not random gaps.** Within-component 8/12; component→component 16; section→section 24; major breaks 32/40/48. Never pick a number off-scale.
- **Generous over cramped.** Whitespace is how paper feels premium. When unsure, go up one step.
- **Page gutter = `--space-gutter`** consistently; content never touches the viewport edge.
- Fixed bars (header, bottom nav) must reserve their height as scroll inset so content never hides behind them.

## 4. Surfaces & cards

| Token | Value | Use |
|---|---|---|
| `--color-paper` | warm paper | page background — the default ground |
| `--color-surface` / `--color-card-warm` | warm white | card surface |
| `--color-surface-raised` | white | inputs, raised cells |
| `--color-parchment` | warm panel | grouped panels, journal blocks |
| `--radius-card` 24 / `--radius-image` 16 / `--radius-button` 16 / `--radius-pill` 999 / `--radius-modal` 28 | | match the radius to the element role; don't mix |

**Card anatomy (borders-first):** warm surface + `--border-ink` (hand-drawn ink line) + `--radius-card` + `--space-card` padding + **no shadow**. Depth comes from the *border + warm surface against warm paper*, framed photography, and layering — not from box-shadow. A flat gray card with a drop shadow is the exact thing we reject; do not produce it.

Hover/active depth is allowed via the locked `--elevation-hover` lift **on interactive cards only**, paired with motion (see motion-system). It is a whisper, not a pop.

## 5. Imagery rules (the #1 premium lever)

- **Image-first.** Real, warm, golden-hour scenic *work* photography. Balance across all five lanes — never let the product become alpine-only (Farm/greenhouse is co-equal).
- **Frame, never filter.** Hand-drawn frame + paper mat around the photo. Legibility via `--gradient-hero-scrim` overlay only when text sits on the image — never a color wash *on* the photo. (Full rules: [`photo-language.md`](./photo-language.md), [`media-buckets.md`](./media-buckets.md).)
- **Always `next/image`** with width/height or aspect-ratio to reserve space (prevents CLS). Lazy-load below the fold; eager-load the hero.
- **Category atmosphere as photo fallback:** when no photo exists, use the lane's `--gradient-category-*` (with a silhouette/illustration), never a bare gray box. Real content must never look *worse* than fixture content.

## 6. Icons & badges

- **Icons:** `<Icon name="domain.name"/>` (Phosphor registry) only. `category.*` keys mirror the lanes exactly. Sizes from `--icon-sm|md|lg|chip` (16/20/24/40). Consistent stroke, consistent size per layer. **No emoji as structural icons. No icon spam** — an icon earns its place by adding meaning.
- **Badges/chips:** compose `Badge` / `Chip` / category + status primitives. Always **bg+fg pair** from the token set (`--status-*`, `--accent-*-*`, `--benefit-*`). Always **icon + label**. Gold (`--status-boosted`, `--color-gold`) = boosted/premium/pay highlight; reserve it so it stays special.
- **Triad chips (HOUSING/MEALS/PAY):** first-class, never "Perks." Use `--benefit-housing|meals|pay` pairs. (CI **G22** enforces the Verified-Host badge + "Self-Declared by Host" qualifier.)

## 7. Signature surface patterns

These are the repeating "rooms" of the product. Detailed component contracts live in [`component-rules.md`](./component-rules.md); this is the visual intent.

- **Discovery / listing card** (`DiscoveryCard`, locked skeleton — preserve JSX, class-CSS only): framed scenic photo → category eyebrow + Manrope-bold title → HOUSING/MEALS/PAY triad → pay/location meta → CTA. Atmosphere by lane. The product's core primitive; reused everywhere.
- **Scenic hero** (homepage, dashboard, profile): full-bleed framed photography or lane gradient + scrim, display headline, one primary action. Sells the *place* first.
- **Rails** (matched / saved / applied / community): horizontal card scrollers with a **visible scroll affordance** (edge fade or peek of the next card) — a documented gap to never repeat. Section head (Manrope bold) + "see all" link.
- **Map surface** (`/map`, saved): Mapbox is wired. Map is a first-class explore surface — custom ink/paper pins (`--elevation-pin`), bottom-sheet detail on mobile, list+map split on desktop. Location is a feeling, not a filter.
- **Profile / journey**: profile is a *journey* (been / headed / readiness), not a résumé form. Scrim hero + avatar overlap + readiness state + rails of saved/applied.
- **Stat / KPI strip** (dashboards): **one promoted dominant metric**, the rest subordinate. Never a row of identical flat boxes (a documented amateur tell).

## 8. Dashboard layout rules

The founder's sharpest critique is "reads as a generic admin template." Antidotes:

- **Every dashboard opens with a hero or a dominant next-action**, not a stat grid. Give the user a feeling and a clear first move.
- **Hierarchy over uniformity.** Promote one primary metric/action; subordinate the rest by size, weight, and color. No wall of equal cards, no dense corporate table as the primary surface.
- **Group by intent** (what needs me / what's in motion / what's done), not by data type.
- **Cards as assets, applicants/seekers as people** — review surfaces show faces and stories, not table rows.
- **Empty/loading/error are designed**, not default: `ui-empty` with a story + CTA; shimmer skeletons (not opacity pulse); branded errors with a recovery path.

## 9. Mobile / desktop behavior

**Mobile-first is the law** (most traffic, and the harder constraint). Breakpoints: `--bp-xs` 380 / `--bp-sm` 640 / `--bp-md` 768 / `--bp-lg` 1024 / `--bp-xl` 1280.

- **Mobile (default):** single column, cards stack, bottom nav (64), bottom sheets for depth, large tap targets (**≥ `--tap-min` 44px — non-negotiable**, a recurring WCAG failure here), media-forward, bottom action rows. **Grids must collapse to 1 column at 380px** — multi-column grids that don't collapse are a documented defect.
- **Desktop (≥1024):** same components, *denser* — add rails, side panels, hover previews, multi-column, map+list split. Do **not** design a different component system per breakpoint; reflow the same one.
- **Quality floor on every surface:** responsive to 380px, visible keyboard focus (`--color-cta` ring), `prefers-reduced-motion` respected, contrast ≥ 4.5:1 body / 3:1 large.

## 10. Copy (design material, not decoration)

- From the user's side of the screen; name things by what they control.
- Active verbs; the verb survives the flow ("Apply" → "Applied", "Publish" → "Published").
- Empty = invitation + action. Error = what happened + how to fix, in the product's voice (no apologizing, never vague).
- Sentence case, plain verbs, no filler. Specific > clever. One element, one job.

## 11. Before you ship — quick visual gate

- [ ] Paper ground, not white/gray; ink borders, no card shadows.
- [ ] One dominant element per module; hierarchy obvious in a 0.5s squint.
- [ ] All color from tokens; zero raw hex; gradients from the locked set.
- [ ] Photos framed (not filtered), `next/image`, space reserved.
- [ ] Phosphor registry icons only; status = icon + text; triad never "Perks."
- [ ] Collapses cleanly at 380px; all tap targets ≥44px; visible focus; reduced-motion ok.
- [ ] Empty/loading/error designed, not default.
- [ ] Could it hang in a Patagonia store? If it only fits a B2B SaaS site, redo it.
