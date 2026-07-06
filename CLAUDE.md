# CLAUDE.md

This repository's agent instructions live in **[`AGENTS.md`](./AGENTS.md)**. Read it in full before acting.

@AGENTS.md

## Claude-only notes

- You are an *interchangeable implementer* at the single "engineer" station. One agent owns one task on one branch at a time — never edit files another engine is actively working.
- On a 16 GB ARM laptop, prefer running **one agent at a time** to avoid resource pressure.
- Everything else (build order, forbidden actions, design rules, handoff protocol) is in `AGENTS.md`. Do not duplicate rules here — keep this file thin so there is one source of truth.

## Design operating system — how to behave on any UI work

Explore&Earn is a **premium outdoor/seasonal-work marketplace** (Patagonia × Airbnb × National Geographic), not a SaaS dashboard. On *any* visual task, behave as a world-class design agent, not a code-completer:

- **Never produce generic SaaS UI.** No flat gray cards, drop-shadow depth, random gradients, "Perks" instead of HOUSING/MEALS/PAY, or default-component-library looks. If it could only live on a B2B SaaS site, it's wrong.
- **Inspect before editing.** Read the route/component, its CSS module, the primitives it uses, its data deps, and its 380px + 1024px behavior. Render it before judging it.
- **Preserve business logic.** Never break auth, data contracts, routing, Stripe, Supabase/RLS, server/client boundaries, SEO metadata, or the a11y baseline. Restructure the UI, not the logic.
- **Compose, don't reinvent.** Use `packages/ui` + `ui-*` primitives and the locked tokens (`apps/web/styles/tokens.css`). Zero raw hex / px type / ad-hoc radii. Borders-first, Phosphor icons only (via the `<Icon>` registry), frame-not-filter on photos.
- **Design mobile-first**, with intentional hierarchy (one dominant element per module) and **purposeful, physical motion** (transform/opacity only; name every animation's meaning or cut it).
- **Run checks** (`pnpm lint && pnpm typecheck && pnpm build`) and **render/screenshot** the result (Playwright / chrome-devtools MCP) at 380px + 1024px and with reduced-motion.
- **Self-critique before "done."** Score the rendered surface with `docs/design/page-scorecard.md`; it is not done until every dimension ≥ 8.

**The design brain (read as needed — single source of truth for visual decisions):**
`docs/design/` → [`brand-direction.md`](./docs/design/brand-direction.md) (who we are) · [`visual-system.md`](./docs/design/visual-system.md) (how to compose) · [`motion-system.md`](./docs/design/motion-system.md) · [`component-rules.md`](./docs/design/component-rules.md) · [`page-scorecard.md`](./docs/design/page-scorecard.md) (the gate) · [`inspiration-library.md`](./docs/design/inspiration-library.md) · [`reference-patterns.md`](./docs/design/reference-patterns.md). Founder-locked foundations remain [`design-system-v1.md`](./docs/design/design-system-v1.md), [`visual-language.md`](./docs/design/visual-language.md), [`photo-language.md`](./docs/design/photo-language.md) — when a design-brain doc and a locked doc disagree, the locked doc wins; flag the gap.

**Design skills (invoke by name; `.claude/skills/`):** `visual-upgrade` (redesign/polish a surface, with the scorecard gate) · `design-audit` (brutally critique a surface) · `premium-component-review` (review one component) · `motion-system-review` (review/fix motion). These force the full sequence — use them instead of ad-hoc design work.
