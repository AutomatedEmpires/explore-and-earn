# Sprint Zero — Build Pack

> Goal: make the repo **intelligent before the app becomes large**. Sprint Zero establishes the **control plane** — agent context, source-of-truth mirror, design system V1, product specs, repo scaffolding, and guardrails — **not** product features.

## Definition

Sprint Zero is complete when a fresh VS Code / Copilot / Codex / Cursor agent can open the repo and understand, **without private chat history**:

- the machine + runtime context,
- the product vision + principles,
- the design direction (tokens, card, photo, icons, badges, motion, anti-patterns),
- the icon system,
- the source-of-truth model,
- the agent handoff workflow,
- the Sprint Zero scope,
- the Discovery Card + Listing Detail rules,
- the founder approval gates,
- what not to build yet.

## In scope (control plane)

1. **Agent operating context** — `AGENTS.md`, `docs/agents/*`.
2. **Source-of-truth mirror** — `docs/source-of-truth/*` (map, canon registry, open questions, approval queue).
3. **Design System V1** — `docs/design/*` (tokens, visual language, icons, photo, card, listing, drift prevention).
4. **Product specs** — `docs/product/*` (principles, discovery card, listing detail).
5. **Repo scaffold (placeholders)** — monorepo layout: `apps/web`, `packages/ui|contracts|db`, `supabase`, `tools`. (See `repo-scaffold-plan.md`.)
6. **Icon system scaffold** — `packages/ui/src/icons/` registry + placeholder components (no paid assets).
7. **Collaboration scaffolding** — `.github/` PR + issue templates, CI guardrail skeletons, `CODEOWNERS`.

## Explicitly NOT in scope

full auth · full DB schema · Stripe billing logic · matching algorithm · production dashboards · real marketplace flows · final migrations · destructive operations. These wait for scoped, approved build packs.

## Build order

1. Agent context + source-of-truth mirror (so later agents are oriented). ✅ (this PR)
2. Design System V1 + product specs (so UI has truth to build from). ✅ (this PR)
3. Repo scaffold placeholders + icon registry. ✅ (this PR)
4. `.github` templates + CI guardrail skeletons + CODEOWNERS. ✅ (this PR)
5. Resolve founder approval gates (Node, package manager, icon license cap, archive old repo). ⏳ (queued)
6. First feature build pack: **Discovery Card component in `packages/ui`** (next sprint, separate PR).

## Handoff

When this PR merges, the next agent picks up from `docs/source-of-truth/founder-approval-queue.md` (resolve gates) and `docs/sprint-zero/acceptance-criteria.md` (verify), then proceeds to the Discovery Card build pack per `docs/agents/handoff-protocol.md`.
