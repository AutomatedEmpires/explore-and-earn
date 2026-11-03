# Sub-project 1: Foundation technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md), sections 22–25.
- **Goal:** build everything that every later sub-project depends on.
  - **Done when:** the design system is locked; a seeker, a host and an operator each sign in and land in their own shell; uploads are scanned; a test item flows through moderation and the operator queues; migrations deploy from dev to preview to prod through CI.

## 1. Repository layout

The app is a single Next.js 16 project at the repo root, organized as a modular monolith. We don't use a monorepo: native apps will come later and use the HTTP API, not shared packages.

```
src/
  app/
    (public)/            marketing, landing pages, /hosts/[slug] (later)
    (seeker)/            seeker shell: Seek, Swipe, Map, Profile, Community, Inbox
    host/                host workspace shell (/host/...)
    admin/               operator console (served on the admin.* host via middleware)
    design-system/       internal component gallery (blocked in production)
    api/v1/              versioned JSON API
    api/webhooks/        clerk, stripe (later), resend
    api/jobs/run         worker endpoint (called by the scheduler)
  modules/               one folder per domain module
    identity/ orgs/ media/ trust/ audit/ jobs/ notifications/ operator/ settings/
      index.ts           the module's public API (the only file other modules may import)
      schema.ts          Drizzle tables for this module
      service.ts         domain logic
      *.test.ts
  ui/                    design system: tokens.css, components/, icons, charts, patterns/
  lib/                   env, db, ids, errors, logger, http, ai, rate-limit
  server/                request context, auth guards (requireSeeker/Host/Operator)
drizzle/                 generated SQL migrations (committed)
tests/e2e/               Playwright
```

**Rules enforced by lint (they fail CI):**

- **Module boundaries.** Code outside a module imports it only through `@/modules/<name>`, never a deeper path. `src/ui` imports no modules. Only modules import Drizzle tables.
- **Design tokens.** Outside `src/ui` there are no raw color values (hex, rgb or hsl) and no arbitrary Tailwind values (`[...]`). Screens are built only from `src/ui` components and token classes.
- **Strict TypeScript.** `strict` and `noUncheckedIndexedAccess` are on, and `any` is not allowed.

**Tooling:** pnpm, ESLint (flat config), Prettier, Vitest, Playwright and gitleaks. gitleaks matters because **the repo is public** (see section 14).

## 2. Data conventions

| Convention | Rule |
|---|---|
| Database | Supabase Postgres with PostGIS. Every app table lives in the `app` schema, which Supabase's auto-generated API doesn't expose. RLS is enabled on every table with no policies, so access is denied by default. Clients never query the database directly; everything goes through the server. |
| Access | Drizzle ORM over `postgres.js`, using Supabase's transaction-mode pooler. Drizzle provides the table types and queries. **Migrations are hand-written SQL files** in `drizzle/`, named `NNNN_<module>.sql`. Each workstream has its own number range, so parallel branches never conflict over drizzle-kit's journal file. A small migrator applies them in order and records each one in `app.schema_migrations`. Schema changes go through migrations only. |
| Local database | There's no Docker on the dev machine, so `pnpm db:local` runs PGlite with PostGIS behind a Postgres wire server (`@electric-sql/pglite-socket`). Local development and end-to-end tests run against it until the Supabase `ee-dev` project exists. File storage likewise has a `local` adapter (files on disk) for development, and production refuses to start with it. |
| IDs | UUIDv7, generated in the app |
| Time | `timestamptz` in UTC. Calendar dates such as job dates use `date`. |
| Money | Integer cents plus a `currency` field (always `USD` at launch) |
| Enumerations | `text` columns with CHECK constraints, which are easier to change than Postgres enums |
| Audit fields | `created_at` and `updated_at` on every table; `created_by` where an actor exists |
| Deletion | Hard delete plus an audit event by default. Where retention rules require keeping data, records use soft delete (`deleted_at`). |
| Tests | Unit and domain tests run on **PGlite with the PostGIS extension**, in memory, so no Docker is needed locally. CI also runs the integration suite against a real `postgis/postgis` container. |

## 3. Identity, accounts and guards

**Clerk is the identity provider.** Signed webhooks (verified with svix) sync users, organizations and memberships into `app.users`, `app.organizations` and `app.org_memberships`.

**Account type**

- `app.users.account_type` is `seeker`, `host` or `operator`. It is mirrored into Clerk's `publicMetadata`.
- It is set once, during onboarding, and can't be changed afterwards.
- Operator accounts exist only by invitation.

**Onboarding**

1. A user who signs up chooses Seeker or Host.
2. **A seeker** confirms "I'm 18 or older" (stored with a timestamp) and lands on Seek.
3. **A host** creates an organization (just a name for now) and lands on host Home.

**Host organization roles**

| Role in our system | Clerk role | Notes |
|---|---|---|
| Owner | `org:admin` | Plus `organizations.owner_user_id` in our database |
| Admin | `org:admin` | |
| Recruiter | `org:recruiter` | Custom role. Its listing and location scopes arrive in sub-project 2. |
| Billing | `org:billing` | Custom role |

Permissions are worked out on the server from our database, never from what the client sends.

**Guards:** `requireSeeker()`, `requireHost({ roles })`, `requireOperator({ queue?, sensitive? })`.

- **Owners and Admins** must have a passkey or two-step sign-in. Without one, they see a set-up screen and can't continue.
- **Operators** must have a passkey to use the console. Sensitive actions also require Clerk reverification.

**Host addresses**

- Seeker app: the apex domain (staging uses a staging subdomain).
- Host workspace: `/host`.
- Operator console: `admin.` subdomain, rewritten to `/admin`. Middleware blocks `/admin` on any other host.

## 4. HTTP API skeleton

- **Routes:** `/api/v1/*` route handlers. Every input is validated with zod v4.
- **One error format:** `{ error: { code, message, details?, requestId } }`.
- **Request IDs:** every request gets one, and it is passed through to logs and Sentry.
- **Authentication:** a Clerk session cookie for the web, or a Bearer token (a Clerk session JWT) for future native apps.
- **Schema:** OpenAPI is generated from the zod schemas (`z.toJSONSchema`) and served at `/api/v1/openapi.json`.
- **Protection:**
  - CSRF: `SameSite=Lax` cookies plus an Origin check on every request that changes data.
  - Rate limiting: a Postgres fixed-window limiter (`app.rate_limits`) on sensitive endpoints (sign-up, uploads, messages, AI calls), plus Vercel Firewall rules.
- **Live counts:** a server-sent events endpoint, `/api/v1/me/stream`, pushes unread counts. Clients fall back to polling every 30 seconds.

## 5. Background jobs and outbox

- **Outbox.** `app.outbox` holds every side effect (email, push, scans, AI checks, webhook fan-out). It is written **in the same transaction** as the change that caused it, so a side effect is never lost or duplicated by a failed commit.
  - **Columns:** `id`, `topic`, `payload`, `dedupe_key` (unique), `available_at`, `attempts`, `status`, `last_error`.
- **Worker:** `POST /api/jobs/run`, authenticated with a shared secret header.
  - It claims batches with `FOR UPDATE SKIP LOCKED` and sends each event to the handler registered for its topic.
  - Failed events are retried with exponential backoff and jitter. After 8 attempts they move to a dead-letter state and raise an alert.
- **Scheduler:** Supabase Cron calls the worker every minute through `pg_net`. After a commit, the app also calls the worker immediately (without waiting) so latency stays low.
  - Scheduled topics are registered in code, for example `review.sla_sweep` every 5 minutes and `trust.audit_sample` weekly.
- **Why a table:** a table-based outbox in Postgres fills the "Supabase Queues" role in the product spec. It is simpler to test, and the topic and handler API won't change if we move to pgmq later.

## 6. Audit log

`app.audit_events` is append-only. A trigger rejects any UPDATE or DELETE.

- **Columns:** `actor_type` (user, operator or system), `actor_id`, `org_id`, `action`, `subject_type`, `subject_id`, `data` (jsonb, with secrets removed), `request_id`, `ip_hash`, `created_at`.
- **Writing:** `audit.record()` is called inside domain transactions.
- **Reading:** the operator console has a searchable viewer.

## 7. Media pipeline

1. **Upload request.** The client asks the server for a signed upload URL. The server checks the kind, size and mime type, then writes an `app.media` row with status `uploaded`.
2. **Upload.** The file goes into the private `quarantine` bucket.
3. **Scan job.** An outbox job runs the checks:
   - It verifies the real file type from the file's bytes, not its name.
   - **For images:**
     - Re-encode with sharp, stripping EXIF data and GPS location.
     - Create WebP variants at 320, 640 and 1280 px, and store the dimensions.
     - Run a **child-safety hash check**.
     - Run an **AI safety check**, which also generates alt text where needed (Community, listing photos).
   - **For documents (PDF):** run a **malware scan** and a basic structure check.
4. **Decision.**
   - **Approved:** the file moves to `media-public` (photos for public pages) or `media-private` (resumes, attachments, private images, served by signed URL).
   - **Rejected:** the uploader is told why.
   - **Child-safety match:** status becomes `blocked`. The original is preserved in the restricted `evidence` bucket, a child-safety review item is created and the alert fires. Nothing else happens automatically.

**Media kinds:** `avatar`, `cover`, `logo`, `listing_photo`, `housing_photo`, `meal_photo`, `community_photo`, `resume`, `attachment`.

**Providers (behind swappable adapters)**

| Check | Provider | Notes |
|---|---|---|
| Child safety | **PhotoDNA Cloud Service** | The founder applies to Microsoft. Fallback: Thorn Safer (paid). The Cloudflare CSAM Scanning Tool adds a check when images are served, once DNS is on Cloudflare. |
| Malware | **Cloudmersive Virus Scan API** | |
| AI image and text checks | **Claude Haiku 5.5** | |

**Stubs:** in dev and preview, a stub adapter stands in for each provider. **Production refuses to start if any stub is configured**; the environment validation checks this.

## 8. Trust and moderation framework

**`trust.runCheck(kind, subject, input)`**

1. Calls the classifier: Claude Haiku 5.5, with a JSON-schema structured output of labels, score and reason.
2. Applies the thresholds from settings to decide `approved`, `rejected` or `needs_review`.
3. Stores the result in `app.trust_checks`: provider, model, prompt version, labels, score, decision and latency.
4. On `needs_review`, opens a review item.

Foundation registers the `image_safety` and `text_safety` kinds. Later sub-projects add their own (listing, message scam, business verification).

**Review queues**

- **Tables:** `app.review_items`, `app.review_notes`, `app.review_actions`.
- **Queues:** `moderation`, `fraud`, `reports`, `support`, `child_safety`, `billing`, `appeals`, `audit_sample`.

**Operators:** `app.operators` holds each operator's `user_id`, `role` (owner or operator), assigned `queues` and `shift_status` (on_shift or away).

**Routing**

- A new item goes to the on-shift operator covering its queue who has the fewest open items, with ties broken round-robin.
- Each item has one assignee at a time. Claiming an item is an atomic update.

**Time limits**

| Queue | Time limit |
|---|---|
| Child safety | 1 hour |
| Fraud | 4 hours |
| Reports and support | 24 hours |
| Everything else | 24 hours |

The `review.sla_sweep` job moves overdue items to someone else. An item that nobody can take alerts the Owner.

**Other rules**

- **Escalate:** to a named operator or to the Owner, with a reason; escalated items jump to the top. **Hand off:** reassign to another operator.
- **Notes:** internal notes support @mentions, which send a console notification and an email.
- **Second sign-off:** when 2 or more operators exist, a ban, or a refund over $500, waits for a second operator's approval.
- **Appeals:** routed to an operator other than the one who made the original decision, when one is available.
- **Accuracy sampling:** the `trust.audit_sample` job copies a random 1% of the week's automatic decisions into `audit_sample`.

## 9. Notifications

**Tables:** `app.notifications` (in-app), `app.notification_preferences` (per user, per category, per channel) and `app.push_subscriptions`.

**`notifications.notify(userId, type, data)`**

1. Looks up the type's category.
2. Checks the user's preferences. Security and billing types are mandatory and ignore preferences.
3. Writes the in-app row.
4. Puts one outbox job per channel.

| Channel | How it works |
|---|---|
| Email | Resend with React Email templates (versioned). Every email gets the `List-Unsubscribe` and one-click headers. Marketing emails carry the mailing address from settings. |
| Push | Web Push with VAPID keys, using the `web-push` library. Subscriptions that stop working are removed. |
| Batching | Rules are set per type: a batching key plus a delay. For example, a message email waits 15 minutes unread, then batches. |

## 10. Design system (gated deliverable)

**Tokens**

- Defined in `src/ui/tokens.css` with Tailwind v4's `@theme` and CSS variables.
- Light and dark sets, following `prefers-color-scheme`. A `data-theme` attribute can override.

| Group | Tokens |
|---|---|
| Color roles | `bg`, `surface`, `surface-2`, `ink`, `ink-2`, `muted`, `line`, `primary` (near-black), `on-primary`, `success`, `warning`, `danger`, `focus` |
| Category colors | `maritime`, `seasonal`, `farm`, `remote`, each with `fg`, `bg` and `solid` |
| Typography | Figtree (via `next/font`). Size scale 12 / 13 / 14 / 15 / 16 / 17 / 19 / 21 / 24 / 28 / 32, with set line-heights and weights. |
| Spacing | Multiples of 4 px |
| Radius | sm 8, md 12, lg 14, xl 20, 2xl 24, pill |
| Shadows | card, raised, overlay |
| Motion | Durations and easings. Reduced motion is respected. |

**Components** (shadcn/ui and Radix underneath, restyled to the tokens):

- Button, IconButton
- Chip (two lines), Pill, Badge, CategoryBadge
- Card: the shared slot template, with `JobCard` and `CandidateCard` filling it
- Sheet: a bottom sheet on mobile and a side panel on desktop
- Dialog, Tabs, SegmentedControl, Switch
- Form controls: Input, Textarea, Select, Combobox, Slider, Checkbox, Radio
- Toast, Tooltip
- Avatar (circle), OrgLogo (rounded square)
- Navigation: TopBar, BottomNav, Sidebar, OrgSwitcher
- States: EmptyState, ErrorState, Skeleton
- StatTile and charts (bar, stacked bar, donut). Charts use Recharts, wrapped so they only take token colors.
- Icons: lucide-react

**The gallery**

- Lives at `/design-system` and is blocked in production.
- Shows every component, in every state, in light and dark.
- Includes **composed reference screens** matching the design board: the Seek card, the candidate card, the Housing pop-up, the host page header, the profile header, a Community post.

**Automated checks**

- A unit test computes the WCAG contrast ratio of every text and background token pair: at least 4.5:1 for text, 3:1 for UI elements and large text.
- Playwright takes screenshots of the gallery for visual regression.
- axe runs on every gallery page.

**The gate:** the founder reviews the gallery on a Vercel preview, with screenshots also posted to the design board. Until it's approved, **no product screen work starts**. The top bar options (a Seeker or Host badge, a hamburger menu) are compared in the gallery and decided there.

## 11. App shells

**Seeker shell**

- Mobile: top bar plus bottom tabs (Seek, Swipe, Map, Profile).
- Desktop: top navigation.

**Host shell**

- Desktop: sidebar with the organization switcher.
- Mobile: bottom tabs (Home, Applicants, Messages, Listings, More).

**Operator shell**

- Sidebar with: Home, Review queues, Users & orgs (placeholder), Audit log, Operators, Settings.

Every navigation destination exists. Destinations not built yet show an EmptyState naming the sub-project that delivers them, and those placeholders are hidden in production.

## 12. Operator console (Foundation scope)

- **Sign-in and guard:** passkey required.
- **Home:** counts of review items by queue and alerts. Other numbers are placeholders until later sub-projects feed them.
- **Review queue:** list, filters, claim, detail with the AI's reason and confidence, actions, notes, escalate, hand off, second sign-off.
- **Operators:** invite, assign queues, shift switch, per-operator stats.
- **Settings:** limits, AI thresholds, mailing address, support email. Every change is audited.
- **Audit log:** a searchable viewer.

## 13. Environments, CI/CD and observability

| Environment | App | Database | Clerk | Stripe |
|---|---|---|---|---|
| dev | local `next dev` | Supabase `ee-dev` | development instance | test mode |
| preview | Vercel previews | Supabase `ee-preview` | development instance | test mode |
| prod | Vercel production | Supabase `ee-prod` | production instance | live mode |

**CI** (GitHub Actions, on every PR):

- install, lint (including the boundary and token rules), typecheck
- unit tests on PGlite
- integration tests on a `postgis` container
- build
- gitleaks
- once the Vercel preview is ready: Playwright end-to-end tests and axe

**Releases**

- Merging to `main` applies migrations to `ee-preview`.
- **Production** migrations run through a `release` workflow in the protected GitHub `production` environment, which **needs the founder's approval**. The production deploy is triggered after the migrations succeed.

**Observability**

- **Sentry:** client, server and edge, plus source maps.
- **PostHog:** events never contain personal data. Server events carry IDs only. EU visitors are covered by the cookie consent added in sub-project 8.
- **Logs:** structured JSON with request IDs.
- **Uptime:** an uptime check.

**Security**

- CSP with nonces, HSTS and the standard security headers.
- Secrets live only in Vercel and GitHub environments. `.env.local` is gitignored, and `.env.local.example` lists every key.
- Dependabot, and gitleaks in CI.

## 14. Risks and decisions for the founder

- **The repo is public.** The specs are already visible. **Recommendation:** make the repo private before any product code is pushed. Until the founder decides, code stays local or in an unpushed branch.
- **Child-safety provider approval takes time.** PhotoDNA requires an application, so apply now. Community and image uploads can't launch without a real provider, which is a launch gate.
- **Connectors not yet authorized** (Supabase, Vercel, Stripe, Resend, PostHog, Sentry). Code, schema and tests can go ahead now, on PGlite and stubs. The real environments get wired in as each connector is authorized.

## 15. Build order and parallel workstreams

| Phase | Workstreams | Depends on |
|---|---|---|
| **A: Scaffold** (one agent) | Tooling, Next app, lint rules, env validation, database client and migration tooling, PGlite test harness, CI skeleton, folder skeleton for every module | n/a |
| **B1** (in parallel) | **W1** design system and gallery · **W2** identity, onboarding and guards · **W3** audit log, outbox, worker and scheduler · **W4** API skeleton, rate limiting, security headers, SSE | A |
| **B2** (in parallel) | **W5** trust framework and review routing · **W6** notifications · **W7** media pipeline | W3 (all three); W5 also needs W2, and W7 also needs W5 for its AI checks |
| **B3** | **W8** app shells and operator console screens | W1, W2, W5 |
| **C** | Integration, end-to-end flows matching the exit criteria, the gallery review package | everything above |

**Ownership rule:** each workstream owns its module folder and its own migration files. It touches shared files (`package.json`, the Drizzle schema index, the topic registry) only at the touchpoints Phase A creates, so parallel agents don't conflict.
