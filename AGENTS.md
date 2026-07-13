# AGENTS.md — Explore&Earn

This is the binding repository contract for human and automated contributors. Read it before inspecting or changing the repository. Product truth lives in the approved Notion canon; implementation truth lives in this repository and its GitHub artifacts. When those sources disagree, record and reconcile the gap rather than silently choosing one.

## 1. App purpose

Explore&Earn is a seeker-first seasonal/work-travel marketplace built by seekers, for seekers. Every opportunity must make the **Housing / Meals / Pay** triad explicit:

- **Housing** — Where will I sleep?
- **Meals** — What will I eat?
- **Pay** — What will I earn?

The triad is product law and must never be collapsed into a generic “Perks” field. The **Discovery Card** is the central product primitive and must remain consistent across discovery, listing, and dashboard surfaces.

## 2. Business vision

The product should make lawful seasonal-work discovery feel trustworthy, warm, adventurous, and operationally clear across Farm, Maritime, Remote, Seasonal, and mixed experiences. Premium presentation must not obscure the seeker’s practical decision criteria.

Do not scrape or repost third-party listings. Build a lawful host-lead database and founding-host onboarding pipeline instead. Lead records are prospects, not publishable marketplace inventory; they may become listings only through an authorized host onboarding process with appropriate outreach, consent, rights, and provenance.

The build order remains foundation/control plane, Design System V1, Discovery Card V1, canonical database, then separately scoped feature surfaces. Do not skip ahead into production marketplace behavior.

## 3. Current rollout status

Snapshot: **2026-07-12**. Status: **active · blocked · no-go**. There are **no open PRs** at this snapshot. Refresh current branch, HEAD, PR, issue, acceptance-criteria, and rollout status before acting; this snapshot is context, not permission to rely on stale state.

Proven Preview or test-mode pieces do not establish production readiness. Production blockers include Clerk production readiness; Stripe production webhooks and Checkout; incomplete production environment configuration; data, storage, and tenant-isolation tests; email delivery and reply handling; rollback proof; and the Mapbox fixture. Public launch and production activation remain no-go until the relevant approvals and evidence exist.

## 4. Branch naming rules

Before work, record `git status -sb`, the current branch and HEAD, open PRs, the issue and acceptance criteria, and artifact ownership. One agent owns one task, one branch, and one artifact set at a time. Coordinate and hand off through durable repository artifacts such as issues, PRs, and repo documentation; never depend on private chat memory.

- Agent work: `agent/<scope>-<short-description>`
- Normal feature work: `feat/<lane>/<slug>`
- Fixes: `fix/<lane>/<slug>`
- Documentation: `docs/<lane>/<slug>`
- Chores: `chore/<lane>/<slug>`

Use kebab case. Never direct-push `main`, merge, delete branches, rewrite history, force-push, or overwrite another agent’s lane or artifact. Keep each PR small, scoped to its issue and acceptance criteria, and cite the governing canon or repo document.

## 5. Required checks before PR

Run from the repository root and report the exact command and result:

```text
pnpm install --frozen-lockfile
pnpm guardrails
pnpm lint
pnpm typecheck
pnpm test
pnpm build
git diff --check
```

Also run `pnpm test:e2e` for browser-flow changes. Add focused tests for non-trivial behavior and include screenshots plus accessibility evidence for UI work. If a check cannot run, report why; do not describe an unrun check as passing.

## 6. Forbidden actions

- Do not scrape or repost third-party listings, or treat prospect leads as publishable inventory.
- Do not implement unscoped auth/session logic, final schemas or live migrations, billing/refund logic, matching algorithms, production dashboards, or real marketplace flows.
- Do not delete data, drop schemas, bypass review, perform unrelated drive-by edits, or duplicate shared domain shapes inside features.
- Do not hardcode product decisions that belong in the approved canon or skip a founder approval gate.
- Do not deploy, change domains or DNS, expose secrets, or perform any live/production mutation without explicit task approval.

## 7. Provider no-touch zones

Doppler, Vercel, Supabase, Clerk, Stripe, Resend and DNS, Mapbox, Cloudinary, PostHog, Sentry, and all provider-specific resources are no-touch unless the task explicitly approves the exact action. No deploy, environment, domain, DNS, secret, live migration or SQL, auth, storage, product, price, webhook, email, or telemetry writes are authorized by ordinary repository work.

Do not activate production database, auth, email, maps, storage, payments, observability, or other provider integrations based on test-mode or Preview evidence. Inspecting provider state also requires task authority and the appropriate provider workflow.

## 8. Data, money, email, and auth guardrails

Never use or expose secrets, live data, private user or customer data, real money, real email, or production auth. Use typed fixtures and test-mode resources only when the task explicitly permits them.

- **Data:** Shared contracts in `packages/contracts` are canonical. Do not duplicate types. No live Supabase SQL, migrations, RLS changes, storage writes, tenant changes, or customer-data handling without approval.
- **Money:** Stripe live migration is blocked until explicitly approved. No live Checkout, payment, refund, price, product, payout, or webhook action.
- **Email:** No production sending, domain/DNS changes, recipient imports, or reply-path activation. Outreach to host prospects requires approved consent, suppression, provenance, and reply-handling rules.
- **Auth:** No production Clerk activation, user mutation, role/permission change, or session-policy change without approval.

Permanent human approval gates include pricing/plans, schema and migrations, auth, real payments/refunds, verification/trust, permissions/RLS, paid-asset licensing, and public launch/deploy.

## 9. Design notes

Design is not final, and a future design overhaul is expected. Preserve the current token system, typed substrate, UI composition, and Phosphor semantic registry; avoid incidental redesign or a competing component/icon system.

- Compose shared types from `packages/contracts` and shared primitives from `packages/ui`; never redefine a domain contract or primitive inside a feature.
- Preserve the canonical Discovery Card zones and the Housing / Meals / Pay contract across surfaces.
- Use locked tokens rather than hardcoded color, typography, spacing, or radius values.
- Use `<Icon name="domain.name"/>` through the Phosphor registry; do not add an alternate icon library or ad hoc feature SVGs.
- Keep the frame-not-filter photo language: presentation may frame host media, but must not alter it with overlays or filters.
- Preserve the responsive media-bucket strategy and do not commit image binaries merely to bypass it.

The canonical baseline remains Windows 11 ARM64 → WSL2 Ubuntu 24.04, Node 24.16.0, pnpm, Turborepo, and strict TypeScript. Runtime or workspace-tooling changes require an explicit, dated decision.

## 10. Current known PRs and blockers

As of **2026-07-12**, there are no open PRs. Re-check before starting or reporting work.

Known blockers are production Clerk; Stripe webhooks and Checkout; production environment completion; data/storage/tenant test evidence; email delivery and reply handling; rollback proof; and the Mapbox fixture. Preview and test-mode success does not clear these blockers or authorize provider/live actions.

## 11. Output format for future agents

Every handoff or PR report must include:

- branch and HEAD;
- scope, owned artifacts, and files changed;
- exact commands run and their results;
- explicit provider/live actions (`none` normally);
- data, money, email, and auth impact;
- screenshots and accessibility evidence for UI work;
- risks, blockers, assumptions, and unrun checks; and
- PR URL, or `none` with the reason.
