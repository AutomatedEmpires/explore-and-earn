# Motion System — Explore&Earn

> **Status:** Design-brain. Motion tokens are locked in [`tokens.css`](../../apps/web/styles/tokens.css) (`--motion-fast` 120 · `--motion-base` 200 · `--motion-drawer` 320 · `--ease-standard` `cubic-bezier(0.2,0.8,0.2,1)`). This file defines *how and where* to move. Pairs with [`visual-system.md`](./visual-system.md) and the [`motion-system-review`](../../.claude/skills/motion-system-review/SKILL.md) skill.
>
> **Current reality:** there is **no animation library installed** (no Framer Motion / motion / GSAP). All motion today is **CSS transitions/animations**. That is the default and is enough for ~90% of what we need. Adding a library is an *approval-gated* enhancement — see [`mcp-tooling-proposal.md`](./mcp-tooling-proposal.md) §Motion. Until approved, **author motion in CSS.**

## 1. Principles — motion has a job or it doesn't ship

1. **Physical, not flashy.** Things slide, settle, lift, and reveal like real paper and objects. **No bounce, no spring overshoot, no sparkle, no decorative loops.** The locked ease `--ease-standard` has no overshoot for this reason.
2. **Motion conveys cause → effect.** Every animation explains *what just happened* or *where something came from/went*. If you can't name the meaning, delete it.
3. **Fast and interruptible.** Micro-interactions 120–200ms; surfaces ≤320ms. Never block input. The user's gesture always wins.
4. **One orchestrated moment beats ten scattered effects.** A single confident reveal (hero load, sheet open, status change) lands harder than animating everything. The founder hates gimmicks — restraint *is* the premium signal.
5. **Accessibility is a hard gate.** Everything degrades under `prefers-reduced-motion: reduce` to opacity-only or instant. Gate non-essential motion behind `@media (prefers-reduced-motion: no-preference)`.
6. **Performance is a hard gate.** Animate **`transform` and `opacity` only.** Never animate width/height/top/left/margin (layout thrash → CLS). Use `will-change` sparingly and only on elements about to move (already done on `DiscoveryCard` swipe).

## 2. The motion token contract

| Token | Value | Use for |
|---|---|---|
| `--motion-fast` | 120ms | hover, tap/press, focus, chip/badge state, small toggles |
| `--motion-base` | 200ms | card reveal, fade/slide-in, content swap, status change |
| `--motion-drawer` | 320ms | bottom sheets, drawers, modals, map detail panel, page-level surfaces |
| `--ease-standard` | cubic-bezier(0.2,0.8,0.2,1) | **the only easing.** Decelerate-in. No bounce. |

Need a value off this list? You almost certainly don't. If a genuine new need exists (e.g. a stagger interval), propose a token — don't inline a magic number.

## 3. Approved patterns

### Hover (desktop / pointer)
- Interactive **card:** lift via `--elevation-hover` + `transform: translateY(-2px)` over `--motion-fast`. A whisper, not a pop. Borders-first still applies — the lift supplements the ink border, never replaces it.
- **Button/CTA:** background/brightness shift + optional 1px lift, `--motion-fast`.
- **Chip/link:** color/underline transition, `--motion-fast`.
- Image inside a frame may scale ≤1.03 *within* its frame (frame clips, photo never escapes the mat).

### Tap / press (the mobile primary — don't skip it)
- Visible press feedback within ~80–120ms: scale `0.97–0.98` + slight dim, `--motion-fast`. Restore on release.
- This is the **#1 most-skipped state**. Every tappable element gets a press state. Use `:active` and pointer events; honor `--tap-min` 44px hit area.

### Focus
- Instant, always visible: `--color-cta` ring (keyboard nav). Never animate focus away or remove the ring.

### Card reveal / scroll reveal
- On first paint or scroll-into-view: fade + 8–12px rise over `--motion-base`, `--ease-standard`.
- **Stagger** lists/rails 30–50ms per item (cap the stagger so the last item isn't slow). All-at-once is acceptable; too-slow sequential is not.
- Reveal **once** — don't re-animate on every scroll pass. Under reduced-motion: appear instantly.

### Surfaces — sheets, drawers, modals, map panel
- Enter: slide from origin (sheet from bottom, drawer from side) + scrim fade, `--motion-drawer`.
- **Exit must mirror enter.** A documented gap: `PopupShell` animates in but not out. Surfaces that pop out of existence feel broken — give every surface a symmetric exit.
- Scrim uses `--elevation-overlay` depth + a fade; content tracks the gesture on draggable sheets.

### Page / route transitions
- Keep restrained. A short cross-fade or directional slide (forward = up/left, back = down/right) at `--motion-base`. Never a heavy full-page animation that delays interactivity. Respect reduced-motion (instant).

### Loading — "alive," not cheap
- **Shimmer skeletons**, not opacity pulse. Opacity-pulse-only is a documented "reads cheap" defect. Skeletons mirror the real layout (card → card-shaped skeleton) so load→loaded doesn't jump.
- Use a skeleton for anything that can take >300ms. For instantaneous swaps, no spinner.
- Progress that's real (uploads, multi-step) gets a real progress affordance, not a fake indeterminate bar.

### State changes (status, meters, readiness)
- Animate the *change*: meter fills over `--motion-base`; a status chip cross-fades label+color together; "live/now" uses the locked `--state-live-dot` pulse (the one sanctioned ambient loop).
- Count-ups / value changes ease, they don't snap — but keep them ≤ `--motion-base`.

## 4. Where motion specifically belongs (and where it doesn't)

| Belongs | Stays still |
|---|---|
| Swipe cards (`/swipe`), sheet/drawer/map panel open-close, skeleton shimmer, status/meter/readiness changes, hover lift on interactive cards, tap press feedback, hero/rail reveal-on-load, "live" dot, toast in/out | Static body text, data tables, form fields at rest, decorative imagery, anything purely to "look dynamic" |

## 5. Motion limits — the anti-gimmick guardrails

Ship **none** of these:
- ❌ Bounce / elastic / spring overshoot (violates `--ease-standard`).
- ❌ Continuous/ambient loops other than the sanctioned `--state-live-dot` and shimmer (no floating blobs, no perpetual gradients, no breathing buttons).
- ❌ Parallax that disorients or ignores reduced-motion.
- ❌ Animating layout properties (width/height/top/left) → jank/CLS.
- ❌ Entrance animations on *every* element (animate 1–2 key elements per view).
- ❌ Motion >500ms on UI; anything that delays the user acting.
- ❌ Hover-only meaning with no tap/focus equivalent.
- ❌ Decorative motion with no nameable cause→effect.

**Self-check:** *Name the meaning of this animation in one sentence.* Can't? Cut it. *Does it still work instantly under reduced-motion?* Must. *Does it animate only transform/opacity?* Must.

## 6. Reduced-motion reference pattern

```css
.card { opacity: 0; transform: translateY(10px); }
@media (prefers-reduced-motion: no-preference) {
  .card { transition: opacity var(--motion-base) var(--ease-standard),
                      transform var(--motion-base) var(--ease-standard); }
}
.card.is-in { opacity: 1; transform: none; }
/* reduced-motion users: no transition is registered, so the .is-in class
   simply shows the final state instantly. Never trap content at opacity:0. */
```

Guarantee: under reduced motion, **the final visual state is always reached** — never leave content stuck mid-animation. Test with reduced-motion on before calling motion work done.
