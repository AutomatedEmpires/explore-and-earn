<!-- ae-control-plane v1 (2026-07-16). Machine operating contract; product docs follow below. -->
# Operating contract — Automated Empires control plane

- **Canonical clone (the ONLY writable copy):** WSL `Ubuntu-24.04-Recovered` → `/home/jackson/automatedempires/ventures/explore-and-earn`.
  Never clone this repository anywhere else on the machine. Parallel work uses controlled
  worktrees: `ae start explore-and-earn -t <task> -a <agent> --worktree`.
- **Sessions:** acquire the single-writer lease first (`ae start explore-and-earn -t <task> -a <agent>`);
  end with `ae finish explore-and-earn`. Work counts as done ONLY when pushed and remote-SHA-verified.
- **Deploys:** merging `main` auto-deploys production via Vercel.
- **Validate before merge:** `pnpm typecheck && pnpm guardrails` (CI must be green; squash merges).
- **Providers (fixed — never swap or cross-wire):** db=supabase, auth=clerk, email=resend (+ webhooks: bounces/complaints -> suppressions), payments=stripe, storage=supabase (host uploads + the 9-bucket `site-photos` system; there is NO image CDN — see docs/design/site-photos.md), ai=anthropic (Guide/assistant surfaces), analytics=posthog (project exploreandearn / 291166).
- **LOCKED:** MARKETPLACE_CATEGORIES locked: farm|maritime|remote|seasonal (+mix); MIX_DOMAIN is DR-B6 LOCKED
- **LOCKED:** Value triad is Housing/Meals/Pay — OpportunityTriad must never gain a 'perks' key (guardrail 2b). 'Perks & benefits' is allowed only as a SEPARATE section (founder, 2026-07-15)
- **LOCKED:** Design ratchets are law: raw-color (G50), tokenization (G51), locale-literal (G52) baselines only tighten
- **LOCKED:** Invite quotas: enterprise 20 / pro 10 / starter 3
- **LOCKED:** Verified-Host badge is subscription-gated (G22)
- **LOCKED:** Dark theme is the default entry
- **Warn before:** applying migrations 058-065 (additive, NOT yet applied — founder pipeline)
- **Warn before:** activating listing-source ingestion (each source needs complianceStatus approval)
- **Warn before:** enabling notification sends (needs founder env)
- **Warn before:** charging payments
- Full policy: `github.com/AutomatedEmpires/ae-control` → `POLICY.md`. Briefing: `ae info explore-and-earn`.

---

# AGENTS.md — Explore&Earn

> A README **for coding agents**. If you are Copilot, Codex, Cursor, Claude, or any automation working in this repo, read this file before doing anything. It follows the [agents.md](https://agents.md) open standard.
>
> Claude reads `CLAUDE.md`, which imports this file. The content lives **here** so every engine inherits the same rules.

## 1. What this project is

Explore&Earn is a **built by seekers, for seekers discovery marketplace that rewards real-world exploration.** It keeps **housing, meals, and pay** upfront, and it still aims for premium adventure, warm working landscapes, operational efficiency, card-first UX, and zero bloat.

Every opportunity must answer three questions, always, as a first-class triad:

- **HOUSING** — Where will I sleep?
- **MEALS** — What will I eat?
- **PAY** — What will I earn?

Never reduce this triad to a generic "Perks" label.

## 2. The golden rule of this multi-agent system

**Agents communicate through shared, durable artifacts — never through private chat memory.** If it is not written into Notion, a GitHub issue/PR, repo markdown, or a status field, it did not happen, because the next agent cannot see it.

- **Notion** = product truth / strategic memory / decisions — and where the bulk of the build (specs, architecture, data models, copy) is authored before code moves.
- **GitHub** = implementation truth — where Notion's output is validated, reviewed, and shipped; issues / PRs / repo docs / code.
- **VS Code (Copilot / Codex / Cursor / Claude)** = implementation workers.
- **The Notion (Opus) agent** = architect / reviewer / orchestrator.
- **Figma** = *optional* visual reference — **not** a required gate.
- **Phosphor** = the icon language (via the `<Icon>` registry; free MIT set, replaced paid Streamline 2026-07-02).

Mantra: **Notion decides and builds. GitHub reviews and ships. Figma shows. Everything else runs.**

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
- **One icon system only: Phosphor** (free MIT `@phosphor-icons/react`), via the `<Icon name="domain.name"/>` registry in `packages/ui`. No Lucide / Heroicons / Font Awesome / Material / react-icons / ad-hoc inline SVG in feature code (CI guardrail **G30**, a `no-restricted-imports` eslint rule). Re-map an icon by editing one registry entry; the whole set is swappable from `registry.ts` alone.
- Icons ship as a normal dependency — **nothing fetched at runtime, no icon assets committed**. The `visual-assets` illustration system is likewise self-contained; no runtime asset fetch remains anywhere. See [`docs/design/icon-system.md`](./docs/design/icon-system.md).
- Photos get a **hand-drawn frame + paper mat around them** — never filters/overlays *on* host photos. See [`docs/design/photo-language.md`](./docs/design/photo-language.md) and [`docs/design/media-buckets.md`](./docs/design/media-buckets.md).

## 7. Setup & commands

Canonical environment: **Windows 11 ARM64 → WSL2 Ubuntu 24.04 → VS Code → `/home/jackson/automatedempires/ventures/explore-and-earn`**. Assume **ARM64**, never an Intel/x86 path.

- Node **24.16.0** is the canonical baseline for this repo.
- Package manager: **pnpm + Turborepo** is the canonical workspace toolchain for Sprint Zero.
- Common commands (once scaffolded): `pnpm install`, `pnpm dev`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`.

## 8. Code style

- TypeScript everywhere; strict mode on.
- Shared types live in `packages/contracts` — never duplicate a contract in a feature.
- UI primitives live in `packages/ui` — features compose them, they do not re-implement them.
- Small, reviewable PRs. No unrelated drive-by changes.
- Cite the Notion canon page (or repo doc) in any PR that encodes a product decision.

## 8.5. Start here: the typed substrate (compose, don't reinvent)

Before writing any feature code, compose against the shared substrate. These are the canonical, typed homes — never redefine these shapes inside a feature:

- **Contracts** (`packages/contracts/src`): import shared types from `@explore-and-earn/contracts`, never duplicate them.
  - `enums.ts` — `MARKETPLACE_CATEGORIES` (`farm · maritime · remote · seasonal · mix`) and other locked enum tuples. The single source for category lanes.
  - `categories.ts` — `OpportunityCategory`, `CuratedPhotoCategory`, `CURATED_PHOTO_CATEGORIES` (curated buckets exclude `mix`).
  - `benefits.ts` — the Housing/Meals/Pay triad: `BenefitTriad`, `HousingInfo`, `MealsInfo`, `PayInfo`, `BenefitProvision`. The triad is product law (§1) — never collapse to "Perks".
  - `media.ts` — `MediaBucketType`, `CuratedPhotoScope`, `ResponsiveImage`, `ListingMedia`, `ImageSelection`. See the strategy doc below.
  - `card.ts` — the canonical Discovery Card contract (surfaces, zones, fields, Verified-Host qualifier). Build the card against this.
- **UI primitives** (`packages/ui/src`): compose these, do not re-implement them — `Badge`, `Button`, `Chip`, `Meter`, `Skeleton`, plus existing `Card`, `Modal`, `VerifiedHostBadge`, `FoundingCountdown`. All are token-className-driven (no hardcoded colors/spacing); the `ui-*` classes are styled by Design System V1.
- **Icons** (`packages/ui/src/icons`): one system only — `<Icon name="domain.name"/>` via the registry. `category.*` keys mirror `MARKETPLACE_CATEGORIES` exactly (no `lodge`; lodge is a Seasonal setting). See §6 and [`docs/design/icon-system.md`](./docs/design/icon-system.md).
- **Media strategy**: [`docs/design/media-buckets.md`](./docs/design/media-buckets.md) — two media systems (user-uploaded buckets vs the curated library), frame-not-filter, the responsive pipeline, and the Figma/AI→repo seed flow. No image binaries in git.

If a contract or primitive you need is missing, add it to `packages/contracts` or `packages/ui` (with a Notion canon citation) — never inline a one-off in feature code.

## 9. When in doubt

- If a task is obvious and in-scope, proceed autonomously.
- If it touches a forbidden area or a founder approval gate, **stop and escalate** via [`docs/source-of-truth/founder-approval-queue.md`](./docs/source-of-truth/founder-approval-queue.md) instead of implementing.
- If two sources disagree: **Notion wins for product truth; the repo wins for what the code currently does.** The gap is a bug to reconcile, not to ignore.
