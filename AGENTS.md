# AGENTS.md — Explore&Earn operating contract

This is the binding repository contract for human and automated contributors. Read it before changing the repository. Product truth lives in the approved canon; implementation truth lives in this repository and its GitHub artifacts. Reconcile conflicts explicitly in the work artifact instead of silently inventing an answer.

## 1. Venture thesis, users, and destination

Explore&Earn is a seeker-first seasonal and work-travel marketplace, **built for seekers by seekers**. Its invitation is: **“Where will you go next?”** The product helps people evaluate an opportunity as a whole life decision, not just a job opening.

- **Primary user:** the seeker choosing where to live, eat, work, and travel next. Seekers are free forever.
- **Primary buyer:** a legitimate host or employer paying for marketplace access, visibility, analytics, or recruiting tools.
- **Product destination:** a trusted two-sided marketplace where seekers discover and apply, hosts create evidence-rich listings and review candidates, and both sides maintain useful profiles and understand status.
- **Public taxonomy:** exactly four top-level opportunity categories — **Farm, Maritime, Remote, and Seasonal**. Sub-roles are filters, not categories. The existing `mix` contract value is an internal composite/compatibility mechanism, never a fifth public lane or destination tile.
- **Discovery system:** **Seek, Swipe, and Map** are three views of the same opportunity inventory. The seeker bottom navigation is pinned to **Seek / Swipe / Map / Profile**.

The **Discovery Card** is the core product primitive across Seek, Swipe, Map, listing rails, lifecycle surfaces, and host review. Every listing and card must make **Housing / Meals / Pay** clear before application:

- **Housing:** Where will I sleep?
- **Meals:** What will I eat?
- **Pay:** What will I earn?

Never collapse the triad into “Perks.” Host and seeker profiles are first-class identity and trust surfaces. Listing evidence, dates, location, role terms, host identity, and the limits of any verification claim must be honest and scannable.

## 2. Current stage and zero-user posture

As of **2026-07-12**, Explore&Earn has **zero real users, zero real customers, and no live marketplace inventory**. The repository contains substantial application code plus controlled Preview and test-mode evidence, but it is not cleared for Production users or real money. Treat README references to Sprint Zero as historical context where newer code and readiness evidence disagree.

This stage should increase useful execution, not create ceremony. There are no customer workflows, revenue streams, or live listings to preserve. Agents should use synthetic fixtures, disposable data, test accounts, protected previews, and reversible branches aggressively to prove the product. Do not pretend fixture activity or a green Preview is customer validation or production readiness.

Current production blockers include two-user tenant/RLS/role proof; production-ready Clerk recovery and administration; provider-delivered Stripe test webhooks plus durable handled-event idempotency; a complete Production environment contract; mail receipt/reply proof; Supabase migration, grant, policy, and Storage hardening; rollback proof; and transfer-grade provider ownership decisions. The current UI is not final; a future design overhaul is expected.

## 3. Execution doctrine and default authority

The default is to **ship meaningful, tested improvements**, not produce another audit that restates known gaps. Read enough to choose the smallest high-leverage change, implement it, prove it, document material decisions, and leave the branch easier to continue.

Without founder approval, agents may perform reversible, non-destructive work within the assigned scope, including:

- code, tests, UI, accessibility, documentation, refactors, and developer tooling;
- dependency, security, CI, and observability improvements that do not retire credentials or destroy resources;
- protected Preview deployments and rollback rehearsals;
- local, disposable, development, or Preview migrations and synthetic test data;
- isolated two-user/tenant fixtures and authorization tests;
- Stripe sandbox products, prices, Checkout, webhooks, and unpaid test transactions;
- internal transactional-email tests to controlled addresses, with suppression and reply-path checks; and
- non-production Clerk, Supabase, Resend, Mapbox, Cloudinary, PostHog, Sentry, Doppler, and Vercel configuration needed to prove a scoped change.

Use the least risky environment that can answer the question. Keep provider mutations traceable and reversible. “Ask the founder” is not a substitute for investigating repository evidence, running a protected proof, or making an ordinary engineering decision.

## 4. True hard stops

Stop and obtain explicit founder authorization only for:

- a paid provider plan upgrade;
- a domain purchase or DNS cutover;
- live-money mode, a real charge, refund, payout, subscription, invoice, or other real financial movement;
- destructive deletion of a provider project, deployment, environment, bucket, endpoint, or equivalent resource;
- a destructive Production database migration or destructive live-data operation;
- credential rotation or revocation;
- repository, domain, account, project, or other ownership transfer;
- a public launch announcement or removing protection in a way that constitutes public launch;
- an ad buy, public marketing campaign, or prospect campaign send;
- a legal filing on the venture’s behalf; or
- any action blocked by MFA when the authorized human is unavailable.

If a hard stop is encountered, prepare the plan, diff, rehearsal, or evidence up to the boundary and report the exact approval needed. Do not turn pricing copy, reversible schemas, test-mode billing, ordinary auth implementation, trust UI, or routine provider configuration into generic founder gates.

## 5. Product priorities

Prefer work in this order unless the assigned issue says otherwise:

1. Make the Discovery Card excellent and consistent, with Housing / Meals / Pay dominant, accurate, and evidence-backed.
2. Make founding-host onboarding and the host-lead pipeline usable, lawful, measurable, and easy to operate.
3. Improve listing evidence and quality: host identity, photos, terms, dates, location, provenance, completeness, and honest trust signals.
4. Unify Seek, Swipe, and Map around the same inventory, card contract, filters, and state.
5. Improve host and seeker profiles and application/status workflows.
6. Prove trust and isolation with two distinct users/tenants, role boundaries, RLS, Storage, and admin/recovery flows.
7. Prove the support and transactional-email loop, including delivery, receipt, replies, bounces, and suppression.
8. Close production-readiness gaps with provider-delivered sandbox payment evidence, protected rollback, environment parity, security, observability, and accessibility.

## 6. Low-value or prohibited work

- Do not stop at audits, inventories, speculative roadmaps, or cosmetic churn when a safe implementation and proof are available.
- Do not build generic job-board UI, split the four public lanes into extra categories, or fork the Discovery Card across surfaces.
- Do not create a competing design-token, component, icon, or domain-contract system. Compose from `packages/ui` and `packages/contracts`.
- Do not polish fixture-only dashboards ahead of discovery, host supply, listing quality, tenant proof, and support readiness.
- Do not scrape or repost third-party listings. A host lead is a private prospect record, not publishable marketplace inventory.
- Do not contact host leads through a campaign without the public-campaign approval above. Build the database, consent/provenance fields, templates, suppression logic, and internal proof first.
- Do not represent self-declared host information as platform verification or fabricate listings, usage, customers, conversion, or readiness.

## 7. Design and implementation boundaries

The current design system is an implementation substrate, not a final aesthetic. Improve it coherently and expect a future design overhaul.

- Preserve a single canonical Discovery Card renderer with variant props and adapters rather than surface-specific copies.
- Keep the four public lanes and the pinned seeker navigation stable.
- Use shared tokens and primitives; do not hardcode a parallel visual system.
- Use the typed Phosphor icon registry through `<Icon name="domain.name" />`; do not add an alternate icon library or ad hoc feature SVGs.
- Preserve the frame-not-filter photo rule: presentation may frame host media but must not misrepresent it.
- Design mobile-first, maintain visible focus, large tap targets, non-color status cues, reduced-motion behavior, and screenshot evidence at relevant viewports.
- Treat Housing / Meals / Pay media and details as trust evidence. Empty states must be honest and must not imply unavailable proof exists.

The canonical toolchain is Windows 11 ARM64 → WSL2 Ubuntu 24.04, Node 24.16.0, pnpm 10.12.4, Turborepo, and strict TypeScript. Change runtime or workspace tooling only with an explicit, dated repository decision.

## 8. Provider, data, money, email, and legal boundaries

Authorized provider access is for scoped evidence, not exploration without purpose. Never expose tokens, secret values, private URLs, cookies, private customer data, or provider recovery material in code, logs, screenshots, commits, or handoffs.

- **Supabase/data:** shared contracts in `packages/contracts` are canonical. Use local databases, disposable branches, synthetic fixtures, and dev/Preview migrations for proof. Test with at least two distinct identities where tenant isolation matters. Do not rewrite applied Production migration history or mutate live data destructively.
- **Clerk/auth:** dev and protected-Preview accounts, role flows, webhooks, recovery tests, and tenant proofs are allowed. Do not use real customer identities. Production activation still requires the public-launch boundary to be cleared.
- **Stripe/money:** sandbox work is encouraged. **No live-money work until a Stripe live migration is explicitly approved.** Never copy live objects into fixtures or describe unpaid test Checkout as revenue.
- **Resend/email:** transactional internal tests are allowed only to controlled recipients. Prove From, Reply-To, receipt, reply, bounce, and suppression behavior. Host outreach requires lawful provenance, consent/legitimate-basis review, suppression, monitoring, and the campaign approval above.
- **Vercel/Doppler:** protected previews, scoped environment updates, and reversible rollback rehearsals are allowed. Do not record secret values. A public alias/DNS cutover or public launch remains a hard stop.
- **Mapbox/Cloudinary/PostHog/Sentry:** non-production fixtures and scoped integration proofs are allowed. Minimize personal data, respect consent, retain replacement resources until rollback is proven, and do not manufacture analytics that could be mistaken for real usage.
- **Listings and leads:** store only data the venture may lawfully use, record source and provenance, honor deletion/suppression, and never publish a lead as a listing without an authorized host onboarding and rights to the content.

## 9. Branch, PR, and verification rules

Before work, record `git status -sb`, branch, HEAD, open PRs, assigned acceptance criteria, and file ownership. One agent owns one task, branch, and artifact set at a time. Coordinate through issues, PRs, and repository docs rather than private chat memory.

- Agent work: `agent/<scope>-<short-description>`
- Features: `feat/<lane>/<slug>`
- Fixes: `fix/<lane>/<slug>`
- Documentation: `docs/<lane>/<slug>`
- Chores: `chore/<lane>/<slug>`

Use kebab case. Never direct-push `main`, force-push, rewrite shared history, merge your own PR, delete an unmerged branch, or overwrite another agent’s lane. Keep PRs scoped to their issue and acceptance criteria. A maintainer or approved automation merges after independent review and required checks.

Package scripts verified on **2026-07-12**:

```text
pnpm install --frozen-lockfile
pnpm guardrails
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Run `pnpm test:e2e` for browser-flow changes. Add focused tests for non-trivial behavior. For UI changes, include screenshots at relevant mobile and desktop sizes plus accessibility evidence. Always run `git diff --check`. A docs-only change may use documentation-specific validation plus `git diff --check`; it does not need to claim application checks it did not run. Report every skipped or failing check precisely.

## 10. Definition of done

Work is done when:

- the change delivers a meaningful user, buyer, trust, supply, or production-readiness improvement;
- acceptance criteria and repository contracts are satisfied without unrelated edits;
- focused tests exist and pass, and the relevant commands above have fresh recorded results;
- affected UI is exercised through the real flow with responsive and accessibility evidence;
- tenant, provider, data, money, email, and legal effects are explicit and use only safe environments;
- no secrets, private URLs, real-user data, scraped listings, or unsupported launch/customer claims enter the diff;
- migrations and provider changes are reversible, traceable, and rehearsed where relevant;
- the PR is small, reviewable, conflict-aware, and documents risks, blockers, and rollback; and
- a future agent can continue without private context.

## 11. Current PRs and blockers

Verified **2026-07-12 Pacific time**:

- Draft PR **#246**, `agent/docs-operating-standards` → `main`: this docs-only operating-contract work.
- Draft PR **#247**, `agent/explore-earn-founding-host-acquisition` → `main`: founding-host acquisition pipeline. Its artifacts and ownership must not be overwritten; coordinate any overlapping host-lead work.

Both PRs currently report green GitHub checks, but that evidence belongs to their current remote heads and does not validate later local commits. Re-check before reporting or handoff. The production blockers in Section 2 remain open even when Preview CI is green.

## 12. Future-agent handoff format

Every handoff or PR report must include:

- venture outcome delivered and the acceptance criteria addressed;
- branch, HEAD, PR number/URL or `none`, and current conflict/check state;
- files changed and owned artifacts;
- exact commands run with pass/fail/skip results;
- UI proof and accessibility evidence when relevant;
- provider actions by environment, including `none`;
- data, tenant, money, email, legal, and security impact;
- migrations, fixtures, rollback, and cleanup performed;
- assumptions, risks, blockers, and the next highest-leverage action; and
- every founder hard stop encountered and the exact authorization still required.
