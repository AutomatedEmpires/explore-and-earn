# AGENTS.md — Explore&Earn

> A README **for coding agents**. If you are Copilot, Codex, Cursor, Claude, or any automation working in this repo, read this file before doing anything. It follows the [agents.md](https://agents.md) open standard.
>
> Claude reads `CLAUDE.md`, which imports this file. The content lives **here** so every engine inherits the same rules.

## 1. What this project is

Explore&Earn is a **mobile-first, lifestyle-driven opportunity marketplace** — *built by seekers for seekers*. It is **not** a generic job board. Think Airbnb × Patagonia × National Geographic: premium adventure, warm working landscapes, operational efficiency, card-first, zero bloat.

Every opportunity must answer three questions, always, as a first-class triad:

- **HOUSING** — Where will I sleep?
- **MEALS** — What will I eat?
- **PAY** — What will I earn?

Never reduce this triad to a generic "Perks" label.

## 2. The golden rule of this multi-agent system

**Agents communicate through shared, durable artifacts — never through private chat memory.** If it is not written into Notion, a GitHub issue/PR, repo markdown, or a status field, it did not happen, because the next agent cannot see it.

- **Notion** = product truth / strategic memory / decisions.
- **GitHub** = implementation truth / issues / PRs / repo docs / code.
- **VS Code (Copilot / Codex / Cursor / Claude)** = implementation workers.
- **The Notion (Opus) agent** = architect / reviewer / orchestrator.
- **Figma** = *optional* visual reference — **not** a required gate.
- **Streamline Freehand** = the icon language.

Mantra: **Notion decides. GitHub builds. Figma shows. Everything else runs.**

## 3. Build order (do not skip ahead)

1. **Sprint Zero** — repo foundation + control plane (we are here).
2. **Design System V1** — tokens, primitives, component shells.
3. **Discovery Card V1** — the core product primitive (HOUSING / MEALS / PAY), reused everywhere.
4. **Database V1** — schema from the canonical data dictionary.
5. **Feature surfaces** — discovery feed, listing detail, dashboards, auth, Stripe, matching — each as its own Build Pack → issue → PR.

## 4. Forbidden until explicitly scoped + founder-approved

Do **NOT** implement any of the following in Sprint Zero (or ever, without a Build Pack + founder approval):

- full authentication / session logic
- full database schema or final migrations
- Stripe billing / payment / refund logic
- the matching algorithm
- production dashboards or real marketplace flows
- any destructive operation (data deletion, schema drops, force-push, history rewrite)

These map to **permanent human approval gates**: pricing/plans, schema/migrations, auth, real payments/refunds, verification/trust, permissions/RLS, paid-asset licensing, and public launch/deploy. See [`docs/agents/founder-approval-gates.md`](./docs/agents/founder-approval-gates.md).

## 5. How to do a unit of work (the relay)

1. Pick up a **GitHub issue** labelled `ready-for-engineering`. One issue = one unit of work.
2. Set it **In Progress** and assign yourself. **One agent owns one task on one branch at a time** — never edit an artifact another agent owns.
3. Implement on a feature branch. Keep changes scoped to the issue + its Build Pack.
4. Open a **Pull Request** using the PR template. Link the issue and the Notion source.
5. Let CI guardrails run (lint, typecheck, tests, drift checks). Address failures.
6. On approval + merge, update repo docs; if **product truth** changed, flag the Notion update and the next issue `ready-for-engineering`.

Detail: [`docs/agents/handoff-protocol.md`](./docs/agents/handoff-protocol.md).

## 6. Design rules (codified — do not invent visual direction)

The founder's biggest concern is **visual quality**. Do not ship generic, ugly, default SaaS UI.

- Read [`docs/design/design-system-v1.md`](./docs/design/design-system-v1.md) and use the **locked tokens** verbatim. Never hardcode colors, type, spacing, or radius that bypass tokens.
- Use **one unified component system** across all lifestyle categories (Farm, Maritime, Remote, Seasonal). Vary imagery + accent color, never the component system.
- **One icon system only: Streamline Freehand**, via the `<Icon name="domain.name"/>` registry in `packages/ui`. No Lucide / Heroicons / Font Awesome / Material / react-icons / ad-hoc inline SVG in feature code (CI guardrail **G30**).
- **Never commit paid/proprietary Streamline asset files** to this public repo. Use placeholder icon components with stable names + TODO comments. See [`docs/design/icon-system.md`](./docs/design/icon-system.md).
- Photos get a **hand-drawn frame + paper mat around them** — never filters/overlays *on* host photos. See [`docs/design/photo-language.md`](./docs/design/photo-language.md).

## 7. Setup & commands

Canonical environment: **Windows 11 ARM64 → WSL2 Ubuntu 24.04 → VS Code → `/home/jackson/automatedempires/ventures/explore-and-earn`**. Assume **ARM64**, never an Intel/x86 path.

- Node **24.16.0** default (see open question on Node 20 LTS vs 24 in [`docs/source-of-truth/open-questions.md`](./docs/source-of-truth/open-questions.md)).
- Package manager: **pnpm + Turborepo** is the canonical target (Build Context §7). The repo currently contains an npm `package-lock.json` — this drift is flagged for reconciliation; do not assume both work.
- Common commands (once scaffolded): `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

## 8. Code style

- TypeScript everywhere; strict mode on.
- Shared types live in `packages/contracts` — never duplicate a contract in a feature.
- UI primitives live in `packages/ui` — features compose them, they do not re-implement them.
- Small, reviewable PRs. No unrelated drive-by changes.
- Cite the Notion canon page (or repo doc) in any PR that encodes a product decision.

## 9. When in doubt

- If a task is obvious and in-scope, proceed autonomously.
- If it touches a forbidden area or a founder approval gate, **stop and escalate** via [`docs/source-of-truth/founder-approval-queue.md`](./docs/source-of-truth/founder-approval-queue.md) instead of implementing.
- If two sources disagree: **Notion wins for product truth; the repo wins for what the code currently does.** The gap is a bug to reconcile, not to ignore.
