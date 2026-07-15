# Component Rules — Explore&Earn

> **Status:** Design-brain. Per-surface contracts. Composes the locked tokens ([`tokens.css`](../../apps/web/styles/tokens.css)) and the existing primitives in [`packages/ui/src`](../../packages/ui/src). **Reuse before create** — check `packages/ui` and the `ui-*` class primitives first; only add a primitive (with a canon citation) if one is genuinely missing. Pairs with [`visual-system.md`](./visual-system.md), [`motion-system.md`](./motion-system.md), and the [`premium-component-review`](../../.claude/skills/premium-component-review/SKILL.md) skill.

## Existing primitives — your starting palette (do not re-implement)

`packages/ui`: `Button` · `Card` · `Badge` · `Chip` · `Meter` · `Skeleton` · `Modal` · `DiscoveryCard` · `VerifiedHostBadge` · `FoundingCountdown` · `Icon` (Phosphor registry) · `visual-assets` (`AppIllustration` framed plates over the same registry).
Class primitives in CSS: `ui-button` `ui-card` `ui-badge` `ui-chip` `ui-meter` `ui-skeleton`(+shimmer) `ui-modal` `ui-section-head` `ui-empty` `ui-stat` `ui-category-badge` `ui-avatar` `ui-rail` `ui-response-actions`.
**Known biggest gap:** there is **no shared form field primitive** — forms re-invent inputs everywhere. Building `ui-field` / `ui-input` / `ui-textarea` is the highest-value primitive work (see §Forms).

Every interactive primitive must support the locked state set (`COMPONENT_STATES` in `tokens.ts`): default · hover · focus · active · disabled · locked · loading · empty · error · success · warning · critical.

---

## 1. Cards

**Default anatomy (borders-first):** warm surface (`--color-surface`) + `--border-ink` + `--radius-card` 24 + `--space-card` 16 padding + **no box-shadow**. Depth = border + warm-on-warm + framed media + layering. A flat gray card with a drop shadow is the rejected default — never produce it.

- **Discovery / listing card = `DiscoveryCard`** (the locked core primitive, reused everywhere). **Preserve its JSX skeleton; change class-level CSS only.** Anatomy: framed scenic photo (atmosphere by lane) → category eyebrow + Patrick-Hand title → **HOUSING/MEALS/PAY triad chips** → pay + location meta → CTA. Never collapse the triad to "Perks."
- **CTA buttons inside cards:** use `ui-button` classes — **not** inline `style={}` ternaries computing borders/shadows (a documented anti-pattern in `DiscoveryCard`). Style state via classes.
- **Interactive cards:** hover lift via `--elevation-hover` + 2px rise (`--motion-fast`) + press state on tap. Static cards don't lift.
- **Content cards** (dashboard modules): a title (Patrick Hand `--type-card-size`), a supporting line in `--text-secondary`, then content. One dominant element each.

## 2. Dashboards

Antidote to "reads like a generic admin template":

- **Open with a hero or a dominant next-action**, never a stat grid. Give a feeling + a first move (e.g. SeekerHero scrim + readiness; Host: "3 applicants need you").
- **KPI/stat strip:** promote **one** dominant metric (largest, Patrick Hand value); subordinate the rest. Never a row of identical flat boxes (documented amateur tell). Use `ui-stat`.
- **Group by intent**, not data type: *Needs me* / *In motion* / *Done*.
- **People as people, assets as assets:** applicant/seeker review shows faces + story (not table rows); listings show as visual assets.
- Avoid dense corporate tables as a primary surface; if tabular data is unavoidable (analytics), make it mobile-adaptive (cards on small screens) and never the first thing the user sees.
- Every dashboard ships `loading.tsx` shimmer skeletons mirroring its layout.

## 3. Headers

- **App header (`GlobalHeader`):** deep-sky (`--color-header-bg`) gradient, scope/role badge, hide-on-scroll, section tabs where relevant. Already polished — preserve, don't rebuild.
- **Page header:** Patrick-Hand page title (`--type-page-size`) + one-line context in `--text-secondary` + at most one primary action. Don't stack multiple H1-weight elements.
- **Scenic page hero** (homepage, profile): full-bleed framed photo or lane gradient + `--gradient-hero-scrim` + display headline + single CTA. Reserve image space (no CLS).

## 4. Modals / overlays / popups

- Use `Modal` / `ui-modal` / `PopupShell` (the layered-scrim, catch-light, textured premium shell — preserve it; one shell, many payloads).
- **Radius `--radius-modal` 28; scrim via `--elevation-overlay`.** Enter + **exit** animation must both exist (`--motion-drawer`); `PopupShell` provides the canonical lifecycle, including reduced-motion handling.
- **Mobile = bottom sheet**, not center dialog, for anything content-heavy; draggable, swipe-down to dismiss, safe-area aware. Use `PopupShell.onBeforeClose` for synchronous unsaved/busy vetoes so confirmation happens before exit motion or focus cleanup.
- One primary action; clear close affordance; focus trap; `Esc` closes; return focus to trigger.

## 5. Empty states

Empty is an **invitation**, never a blank or a bare placeholder (documented defect: generic placeholder rails with no story/CTA).

- Use `ui-empty`: an illustration (`AppIllustration` — framed Phosphor plate) + a one-line Patrick-Hand headline + a plain supporting line + **one clear CTA**.
- Speak from the user's side ("No saved places yet — start exploring"), action-oriented, in the product's voice.
- **Real content must never look worse than fixtures** — if real listings/announcements lack images, supply the lane atmosphere gradient + silhouette, never a naked text block.

## 6. Mobile navigation

- **Bottom nav**, height `--size-bottom-nav` 64, ≤5 destinations, **icon + label** (never icon-only), active item highlighted (color + weight, not color alone), safe-area inset at the bottom.
- Tap targets **≥ `--tap-min` 44px** — a recurring violation (`.quickBtn` 32×32, icon buttons 28×28). Expand hit area with padding/hitSlop when the glyph is smaller.
- Bottom **action rows** for primary actions on detail surfaces; bottom **sheets** for escalation/depth. Primary nav stays reachable from deep pages.

## 7. Map surfaces

Mapbox (`mapbox-gl` + `react-map-gl`) is wired. Location is a first-class explore surface, not a filter.

- **Custom pins** in the ink/paper language (`--elevation-pin` is the one card-exception shadow); cluster at zoom-out; category-tinted by lane.
- **Mobile:** full-bleed map + draggable bottom sheet with the selected listing's `DiscoveryCard`; tap pin → sheet rises (`--motion-drawer`).
- **Desktop:** split map + list; hovering a list card highlights its pin and vice-versa.
- Reserve map height (no layout shift on load); show a branded loading state, not a gray box.

## 8. Profile surfaces

Profile is a **journey**, not a résumé form (key differentiator from job boards).

- Scrim hero (`--gradient-hero-scrim`) + avatar overlap (`ui-avatar`) + name (Patrick Hand) + readiness state (`--state-ready|soon|later|urgent`).
- Sections as a story: where you've been / where you're headed / readiness / saved & applied rails — not a flat field dump.
- **Resume builder:** stepper with a per-step "why this matters" intro; progress label legible (not `position:absolute` over the bar); compose `ui-field` (not bespoke `.input/.textarea/.tag`); sticky mobile CTA; ≥44px controls; loading/success states on every save.

## 9. CTA sections

- **One primary action per view**, in sky `--color-cta` with white text; secondary actions visually subordinate (ghost/outline). Never two competing primaries.
- Button radius `--radius-button` 16; label `--type-button-size`; loading state disables + spinner; the verb survives the flow ("Apply" → "Applied").
- Marketing CTA sections may use a scenic frame or `--gradient-sky`/`--gradient-gold`, but stay disciplined — the CTA, not the decoration, is the hero.

## 10. Forms (the highest-value gap to fix)

Today every form rolls its own input → "reads prototype-level." Fix with a shared field system; until it exists, follow these rules and prefer building `ui-field` first.

- **Field anatomy:** visible label (never placeholder-as-label) → input (`--field-bg`, `--field-border`, `--radius-input` 12) → helper text → inline error below the field. Focus = `--field-border-focus` (`--color-cta`) ring. Error = `--field-border-error`.
- **States:** default/focus/error/disabled (`--field-disabled-bg`)/loading/success — all present, all token-driven.
- **Mobile:** input height ≥44px; semantic `type`/`inputmode` (email/tel/number) for the right keyboard; 16px font (no iOS zoom); autocomplete attributes on.
- **Validation:** on blur, not per keystroke; error states *cause + fix* ("Add a start date so hosts can plan," not "Invalid"); on submit error, focus the first invalid field; group related fields.
- **Feedback:** submit → loading → success/error with a recovery path; auto-save drafts on long forms; confirm before discarding unsaved changes.
- **No phantom tokens.** (A community photo form references `--surface-card`/`--radius-xl`/`--color-error` which don't exist → renders unstyled.) Every token you reference must exist in `tokens.css`.

## 11. Trust & safety surfaces

Trust is the product's core promise — design it to be *believed*, not decorated.

- **HOUSING / MEALS / PAY triad:** always first-class, always icon+label+value, never "Perks," using `--benefit-*` pairs. Present on every listing/discovery surface.
- **Verified Host:** `VerifiedHostBadge` with the **"Self-Declared by Host" qualifier** (CI **G22** enforces this — never strip the qualifier; honesty *is* the trust).
- **Founding host / boosted:** `FoundingCountdown`, gold (`--status-boosted`/`--color-gold`) — reserved and special, never spammy "boost" treatments.
- Safety/moderation actions stay **server-enforced**; the UI surfaces state but never becomes the authority. Show report/flag/help affordances with calm, plain copy.
- Never imply a guarantee the product doesn't make; qualify claims; specific honest data ("Sleeps 2 · meals included · $640/wk") beats vague "great perks."

---

## Per-component review gate (use before calling any component done)

- [ ] Reuses an existing primitive (or justifies a new one with a citation).
- [ ] Borders-first; tokens only; zero raw hex; Phosphor registry icons only.
- [ ] All required states present (esp. **tap/press, focus, loading, empty, error**).
- [ ] ≥44px targets; collapses at 380px; visible focus; reduced-motion ok; contrast pass.
- [ ] Triad never collapsed; status never color-only; verified qualifier intact.
- [ ] Empty/error are designed invitations; real content ≥ fixture content.
- [ ] Reads premium (Patagonia/Airbnb/NatGeo), not admin/SaaS. Score it with [`page-scorecard.md`](./page-scorecard.md).
