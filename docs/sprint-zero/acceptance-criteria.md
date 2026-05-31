# Sprint Zero — Acceptance Criteria

A reviewer (or a future agent) can mark Sprint Zero done when **all** of the following pass.

## Agent context

- [ ] `AGENTS.md` exists at repo root and routes to `docs/agents/*`.
- [ ] `CLAUDE.md` imports `AGENTS.md`.
- [ ] `docs/agents/` contains: agent-operating-context, cross-agent-workflow, handoff-protocol, founder-approval-gates.
- [ ] Machine + runtime context (Windows 11 ARM64 → WSL2 Ubuntu 24.04 → VS Code; Node 24.16.0 default) is documented.

## Source of truth

- [ ] `docs/source-of-truth/` contains: source-of-truth-map, canon-registry, open-questions, founder-approval-queue.
- [ ] Notion is documented as product truth; GitHub as implementation truth.
- [ ] Open questions + approval gates are recorded, not silently resolved.

## Design system V1

- [ ] `docs/design/` contains: design-system-v1, visual-language, icon-system, streamline-freehand-map, photo-language, discovery-card-v1, listing-detail-v1, design-drift-prevention.
- [ ] Tokens (color, type, spacing, radius, elevation, motion, breakpoints) are codified.
- [ ] Photo rule "frame, not filter" is documented.
- [ ] Icon system is Streamline Freehand via registry; no paid assets committed.
- [ ] Anti-patterns / drift prevention documented.

## Product specs

- [ ] `docs/product/` contains: product-principles, discovery-card-v1, listing-detail-v1.
- [ ] Triad (Housing/Meals/Pay) is mandatory and never "Perks."
- [ ] Verified Host badge mandatory with "Self-Declared by Host" qualifier.

## Scaffold

- [ ] Monorepo placeholder layout exists: `apps/web`, `packages/ui|contracts|db`, `supabase`, `tools`.
- [ ] `packages/ui/src/icons/` has an icon registry + placeholder components.
- [ ] No production auth/schema/billing/matching code present.

## Collaboration

- [ ] `.github/pull_request_template.md` exists.
- [ ] `.github/ISSUE_TEMPLATE/` has build-pack, bug, and design-task templates + config.
- [ ] `.github/workflows/` has a CI skeleton including drift guardrails (G30 icon system, G22 verified badge).
- [ ] `CODEOWNERS` exists.

## Success test

- [ ] A fresh agent can open the repo and understand vision, design, icons, source-of-truth, handoff workflow, Sprint Zero scope, card/listing rules, approval gates, and what-not-to-build — **without private chat history**.
