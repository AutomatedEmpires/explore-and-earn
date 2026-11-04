# Explore&Earn

Explore&Earn connects seekers with **Maritime, Seasonal, Farm, and Remote** work through three equal discovery modes: **Seek, Swipe, and Map**. Mobile seekers have pinned bottom navigation in this order: **Seek / Swipe / Map / Profile**.

This repository holds the product specifications and the Explore&Earn web app, a single Next.js app built one sub-project at a time, starting with [Foundation](docs/superpowers/specs/2026-11-03-foundation-design.md). Setting up the cloud environments is covered in the [Foundation setup runbook](docs/runbooks/foundation-setup.md).

## Develop locally

You need Node.js 22.12 or newer and pnpm (`npm i -g pnpm`). Docker isn't needed: the local database is PGlite with PostGIS, served over the Postgres wire protocol.

1. **Install:** `pnpm install`
2. **Configure:** `cp .env.local.example .env.local`. The defaults use local file storage and stub providers. Production refuses to start with either.
3. **Start the database** in its own shell: `pnpm db:local`. It listens on `localhost:5433` and keeps its data in `.pglite/`.
4. **Apply the migrations:** `pnpm db:migrate`
5. **Run the app:** `pnpm dev`
   - The app is at <http://localhost:3000>.
   - The operator console is at <http://admin.localhost:3000>.

**Sign-in** needs the keys of a Clerk development instance, never a production one. Put `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` in `.env.local`.

- Without keys, the app runs signed out and the proxy logs a warning.
- Clerk's keyless mode works too: copy the keys it saves in `.clerk/.tmp/keyless.json` (gitignored) into `.env.local`.
- Clerk webhooks can't reach your machine. A new user's row is created from Clerk's API on their first request instead.
- To make yourself the first operator Owner, run `pnpm ops:bootstrap-owner you@example.com` and accept the invitation email.

**Background jobs.** Locally, nothing calls the worker on a schedule. The app runs it after uploads, but scheduled topics (the SLA sweep, digests) only run when you call the worker yourself:

```sh
curl -X POST -H "x-jobs-secret: <JOBS_SECRET from .env.local>" http://localhost:3000/api/jobs/run
```

**Stub providers** are deterministic, so you can trigger each outcome on purpose:

| Provider | What it does |
|---|---|
| AI (`AI_PROVIDER=stub`) | Text or image bytes containing `__flag__` go to review in the moderation queue. `__block__` is rejected. Anything else is approved. |
| Malware (`MALWARE_PROVIDER=stub`) | A file containing the EICAR test string is rejected. |
| Child safety (`CHILD_SAFETY_PROVIDER=stub`) | An image whose SHA-256 is listed in `CHILD_SAFETY_STUB_HASHES` is blocked. |
| Email (`EMAIL_PROVIDER=stub`) | Messages are kept in memory and nothing is sent. |
| Storage (`STORAGE_PROVIDER=local`) | Files are written under `.data/storage` and served by `/api/v1/media/local/...`, in development only. |

**Checks.** Run these before you commit:

```sh
pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test
```

- **Unit and domain tests** run on in-memory PGlite.
- **Integration tests** (`*.int.test.ts`) need a real Postgres with PostGIS. CI runs them with `pnpm test:integration`.
- **End-to-end tests:** `pnpm e2e`. Start `pnpm db:local` first; Playwright starts `pnpm dev` itself.
  - The Foundation exit criteria also need Clerk keys: `pnpm e2e tests/e2e/exit-criteria.spec.ts --project chromium`.
  - The host steps (in the exit criteria and `shells.spec.ts`) need Organizations and passkeys turned on in the Clerk development instance ([runbook](docs/runbooks/foundation-setup.md), section 4). A fresh keyless app has both off. With passkeys off, set `ALLOW_OPERATOR_WITHOUT_PASSKEY=true` for the operator steps; the host Owner still needs a passkey.

## V1 specification

Read [Product and scope](docs/v1/00-product-and-scope.md) first, then the domain and interaction contracts. This is a living specification, not evidence of implemented features. **Confirmed** means an explicit current user choice; **Recommended** means a proposed design/default; **Open** means unresolved; **Inherited** means an earlier assistant architecture proposal retained for review. MUST/SHOULD describe strength within a contract, not who approved it. The [decision register](docs/v1/08-sources-and-decisions.md) governs status and overrides older assistant assumptions.

| Document | Purpose |
| --- | --- |
| [00 · Product and scope](docs/v1/00-product-and-scope.md) | Product rules, scope, navigation, architecture, success measures |
| [01 · Domain model](docs/v1/01-domain-model.md) | Canonical listing, housing/meals, category modules, entities and invariants |
| [02 · Discovery and cards](docs/v1/02-discovery-and-cards.md) | Wireframe interpretation, Seek/Swipe/Map behavior, search and matching |
| [03 · Profiles and host workspace](docs/v1/03-profiles-and-host-workspace.md) | Host storefront, seeker profile/resumes, dashboard and page inventory |
| [04 · Workflows and API](docs/v1/04-workflows-and-api.md) | State machines, endpoints, transactions, notifications and failures |
| [05 · Security, permissions and admin](docs/v1/05-security-permissions-admin.md) | Access matrix, privacy, uploads, moderation and operations |
| [06 · Pricing and entitlements](docs/v1/06-pricing-and-entitlements.md) | Proposed prices, enforceable limits and billing lifecycle |
| [07 · Delivery plan](docs/v1/07-delivery-plan.md) | Phased, GitHub-ready issues with dependencies and acceptance criteria |
| [08 · Sources and decisions](docs/v1/08-sources-and-decisions.md) | Conversation/wireframe provenance, resolved choices and launch gates |
| [09 · GitHub issue index](docs/v1/09-github-issues.md) | Historical issue links and reconciliation policy after repository rename |
| [10 · Screen inventory and sitemap](docs/v1/10-screen-inventory.md) | Every planned route, sheet and desktop/mobile screen contract |
| [11 · Resume, availability and privacy](docs/v1/11-resume-availability-privacy.md) | Native profile, reviewed import, templates, skills, affiliations and credential verification |
| [12 · Community and campaigns](docs/v1/12-community-and-campaigns.md) | Three-tab community, deduplication, photos, moderation and paid inventory |
| [13 · Journeys and acceptance](docs/v1/13-journeys-and-acceptance.md) | Full lifecycle, extension API contracts, release scenarios and brainstorming priorities |

## Working agreement

**Source of truth:** [the product design spec](docs/superpowers/specs/2026-11-03-explore-earn-product-design.md), approved 2026-11-03. It replaces `docs/v1` wherever the two conflict.

The active repository is `AutomatedEmpires/explore-and-earn`. `AutomatedEmpires/explore-earn` is not a separate repository; it is this repository's old name, and GitHub redirects it here. The predecessor app is `AutomatedEmpires/exploreearn`. Use it as a reference only: don't copy it wholesale and don't change it. Implement the scoped issues incrementally, keeping one listing model and one card system across all three discovery modes. Resolve the documented launch gates before accepting live users or payments. The linked GitHub issues are an implementation backlog; their creation does not mean features are implemented.

## Current refinement

V1.2 records the latest host-first Map preference, seeker/host dashboard brainstorm and monthly **Starter / Professional / Enterprise** naming. Host-logo pins favor public host pages with relevant jobs; final preview/collapse behavior remains open. Pricing recommends concurrent active listings and only Boosted job / Announcement initially; allowances/prices, invitation credits and analytics split remain open. See [discovery](docs/v1/02-discovery-and-cards.md), [dashboards](docs/v1/03-profiles-and-host-workspace.md), [commercial model](docs/v1/06-pricing-and-entitlements.md) and D25–D28 in [decisions](docs/v1/08-sources-and-decisions.md).
