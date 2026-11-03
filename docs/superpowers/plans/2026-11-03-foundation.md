# Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Foundation sub-project for Explore&Earn. It covers:

- the locked design system
- identity and the three app shells
- the API skeleton
- the outbox, worker and scheduler
- the audit log and settings
- media scanning
- the trust and moderation framework, with multi-operator review queues
- notifications
- the operator console
- CI

**Architecture:** One Next.js 16 app at the repo root, organized as a modular monolith. Each module lives in its own folder under `src/modules/<name>/`. Other code imports a module only through its `index.ts`.

- **Data:** Postgres (Supabase in the cloud; PGlite with PostGIS locally and in unit tests), using hand-written SQL migrations and Drizzle for types and queries.
- **Side effects:** these always go through a transactional outbox, which a worker drains. The scheduler calls the worker.
- **Cross-workstream interfaces:** Phase A creates them as typed stubs, so the workstreams can build in parallel and replace their stubs later.

**Tech Stack:**

| Area | Packages |
|---|---|
| Framework | Next.js 16.4, React 19, TypeScript 6.0 (strict) |
| Styling and UI | Tailwind 4.3, shadcn/ui and Radix, lucide-react, Recharts 3 |
| Identity | Clerk (`@clerk/nextjs` 7), svix |
| Data | Drizzle ORM 0.45, postgres.js 4, PGlite 0.5 with PostGIS 0.2 and pglite-socket, Supabase JS 2 (storage) |
| Validation | zod 4 |
| Media | sharp, file-type |
| AI | `@anthropic-ai/sdk` 1.4 |
| Messaging | Resend 6 with React Email, web-push |
| Jobs | cron-parser |
| Testing | Vitest 5, Playwright 1.64 with `@axe-core/playwright` and `@clerk/testing` |
| Repo checks | ESLint 10 with typescript-eslint, gitleaks |

**Spec:** `docs/superpowers/specs/2026-11-03-foundation-design.md`. Its parent is `docs/superpowers/specs/2026-11-03-explore-earn-product-design.md`. Read both.

## Global Constraints

- **Package manager:** pnpm. TypeScript `strict: true` and `noUncheckedIndexedAccess: true`, with `@typescript-eslint/no-explicit-any` set to error. TypeScript is pinned to `~6.0.3`, because typescript-eslint requires a version below 6.1.
- **Database tables:** every app table lives in the Postgres schema `app`, with `ENABLE ROW LEVEL SECURITY` and **no policies**. The browser never queries the database.
- **Data types:**
  - IDs are UUIDv7 from `newId()`.
  - Timestamps are `timestamptz` in UTC; calendar dates use `date`.
  - Money is integer cents plus `currency text not null default 'USD'`.
  - Enumerations are `text` columns with a `CHECK (... IN (...))` constraint.
  - Every table has `created_at timestamptz not null default now()` and `updated_at`, with the `app.set_updated_at()` trigger.
- **Migrations:** `drizzle/NNNN_<module>.sql`. Each workstream uses only its own number range:

  | Range | Owner |
  |---|---|
  | 0000–0099 | Phase A |
  | 0100–0199 | W2 identity |
  | 0200–0299 | W3 audit, settings, jobs |
  | 0300–0399 | W4 rate limiting |
  | 0400–0499 | W5 trust |
  | 0500–0599 | W6 notifications |
  | 0600–0699 | W7 media |

- **Module imports:** code outside a module imports it only from `@/modules/<name>`, never a deeper path. `src/ui/**` never imports `@/modules/*`. `drizzle-orm` is imported only in `src/modules/**`, `src/lib/db.ts`, `src/lib/migrate.ts` and `tests/**`.
- **No raw colors outside `src/ui/**`:** no hex, `rgb(` or `hsl(` literals, and no arbitrary Tailwind values (`-[`), anywhere in `src/`.
- **Errors:** every API error uses this shape: `{ "error": { "code": string, "message": string, "details"?: unknown, "requestId": string } }`.
- **AI models:** `claude-haiku-5-5` for moderation and classification. `claude-sonnet-5-5` is not used in Foundation. Implementers who touch `src/lib/ai.ts` load the `claude-api` skill first.
- **Stub providers:** these environment variables can be set to `stub`: `AI_PROVIDER`, `CHILD_SAFETY_PROVIDER`, `MALWARE_PROVIDER`, `EMAIL_PROVIDER` and `STORAGE_PROVIDER` (which also accepts `local`). When `APP_ENV=prod`, a stub or `local` value makes startup throw `Stub provider not allowed in prod: <name>`.
- **Accessibility:** text contrast ≥ 4.5:1; UI elements and large text ≥ 3:1; touch targets ≥ 44 px; `prefers-reduced-motion` respected; real `<button>` and `<a>` elements; `aria-label` on every icon-only control.
- **Copy:**
  - The product name is written exactly **Explore&Earn**.
  - No emoji in the interface.
  - Placeholder screens read: **"Coming in sub-project N: <name>"**.
- **Time limits per queue:** `child_safety` 1 hour; `fraud` 4 hours; `reports`, `support`, `moderation`, `billing`, `appeals` and `audit_sample` 24 hours.
- **Second sign-off:** when the count of operators is ≥ 2, the actions `ban` and `refund` with `amountCents > 50000` require a second, different operator.
- **Worker:** at most 8 attempts, then status `dead`. The retry delay is `min(30s × 2^attempt, 6h)` with ±20% jitter. A `processing` lock older than 10 minutes is reclaimed.
- **Accuracy sampling:** a random **1%** of the past 7 days' automatic decisions, copied weekly into the `audit_sample` queue.
- **Accounts:** a seeker must attest to being 18 or older. Account type is `seeker`, `host` or `operator`, set once and never changed. Operators exist by invitation only. Operators need a passkey. Host Owners and Admins need a passkey or two-step sign-in.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push; the founder decides on making the repo private first.

## Review Focus

1. **Clerk webhooks arrive duplicated or out of order**, for example a membership before its organization, or `user.updated` before `user.created`. Every event is applied idempotently, and the final state is the same as if the events had arrived in order. Pinned in Task 6.
2. **The worker runs twice at the same time** (the cron tick overlapping a post-commit kick). Each outbox event is handled exactly once. Pinned in Task 9.
3. **A file's claimed type doesn't match its contents**, for example a `.jpg` that is really a PDF, an SVG, or a PNG wrapping a script. The file is rejected with `type_mismatch`, and SVG is never accepted for images. Pinned in Task 20.
4. **Nobody is on shift for a queue.** The item is still created (unassigned), the SLA sweep alerts the Owner, and nothing is lost. Pinned in Task 15.
5. **The AI fails:** it errors, times out, or returns JSON that doesn't match the schema. The check becomes `needs_review` with the reason `classifier_error`. It is never approved automatically. Pinned in Task 14.

---

## Phase A: Scaffold (one agent, sequential)

### Task 1: Tooling and Next.js app

**Files:**

- Create:
  - `package.json`
  - `pnpm-lock.yaml`
  - `tsconfig.json`
  - `next.config.ts`
  - `.prettierrc.json`
  - `.gitignore` (append to the existing one)
  - `.npmrc`
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/app/globals.css`
  - `vitest.config.ts`
  - `playwright.config.ts`
  - `tests/smoke.test.ts`

**Interfaces:**

- **Produces:**
  - scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test` (vitest run), `test:integration` (vitest run with `--project integration`), `e2e` (playwright test), `db:local`, `db:migrate`, `check:tokens`, `ops:bootstrap-owner`
  - path alias `@/*` → `src/*`

- [ ] **Step 1:** Run `npm i -g pnpm`, then confirm with `pnpm -v`.
- [ ] **Step 2:** Write `package.json` with every dependency for all workstreams. Installing them all now keeps the lockfile from conflicting later.
  - **Runtime:** `next@16.4.5 react@19 react-dom@19 @clerk/nextjs@^7 svix drizzle-orm@^0.45 postgres@^4 @electric-sql/pglite@^0.5 @electric-sql/pglite-postgis@^0.2 @electric-sql/pglite-socket@^0.2 @supabase/supabase-js@^2 zod@^4 uuid@^14 sharp@^0.35 file-type@^22 @anthropic-ai/sdk@^1.4 resend@^6 @react-email/components@^1 react-email@^6 web-push@^3.6 cron-parser@^5 recharts@^3 lucide-react @radix-ui/react-dialog @radix-ui/react-tabs @radix-ui/react-switch @radix-ui/react-slider @radix-ui/react-tooltip @radix-ui/react-select @radix-ui/react-popover class-variance-authority clsx tailwind-merge @sentry/nextjs posthog-js posthog-node`
  - **Dev:** `typescript@~6.0.3 @types/node @types/react @types/react-dom @types/web-push tailwindcss@^4.3 @tailwindcss/postcss eslint@^10 typescript-eslint eslint-config-next prettier @testing-library/react @testing-library/jest-dom jsdom vitest@^5 @vitest/coverage-v8 @playwright/test@^1.64 @axe-core/playwright @clerk/testing tsx`
- [ ] **Step 3:** Write `tsconfig.json` with `strict`, `noUncheckedIndexedAccess`, `paths: {"@/*": ["./src/*"]}`, `moduleResolution: "bundler"`.
- [ ] **Step 4:** Write the smoke test `tests/smoke.test.ts`: `expect(1 + 1).toBe(2)`.
  - `vitest.config.ts` defines two projects:
    - `unit`: `tests/**/*.test.ts` and `src/**/*.test.ts`, excluding `*.int.test.ts`
    - `integration`: `**/*.int.test.ts`
- [ ] **Step 5:** Write a minimal layout and a page that renders `<h1>Explore&amp;Earn</h1>`.
  - Run `pnpm typecheck && pnpm test && pnpm build`. Expected: all three pass.
- [ ] **Step 6:** Commit: `chore: scaffold Next.js 16 app and tooling`.

### Task 2: Environment validation

**Files:**

- Create: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.local.example`

**Interfaces:**

- **Produces:**
  - `parseEnv(source: Record<string, string | undefined>): Env`
  - `getEnv(): Env` (parses `process.env` once and caches the result)
  - `type Env` with these keys:
    - **App:** `APP_ENV: 'dev'|'preview'|'prod'`, `APP_URL`, `ADMIN_HOST`, `DATABASE_URL`
    - **Clerk:** `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`
    - **Storage:** `STORAGE_PROVIDER: 'supabase'|'local'|'stub'`, `SUPABASE_URL?`, `SUPABASE_SERVICE_ROLE_KEY?`, `LOCAL_STORAGE_DIR` (default `.data/storage`)
    - **AI:** `AI_PROVIDER: 'anthropic'|'stub'`, `ANTHROPIC_API_KEY?`
    - **Child safety:** `CHILD_SAFETY_PROVIDER: 'photodna'|'stub'`, `PHOTODNA_KEY?`
    - **Malware:** `MALWARE_PROVIDER: 'cloudmersive'|'stub'`, `CLOUDMERSIVE_API_KEY?`
    - **Email:** `EMAIL_PROVIDER: 'resend'|'stub'`, `RESEND_API_KEY?`, `EMAIL_FROM`
    - **Push:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
    - **Secrets:** `JOBS_SECRET` (at least 32 characters), `UNSUBSCRIBE_SECRET` (at least 32 characters)
    - **Monitoring:** `SENTRY_DSN?`, `NEXT_PUBLIC_POSTHOG_KEY?`

- [ ] **Step 1: Write the failing tests.**
  - `parseEnv` without `DATABASE_URL` throws, and the message includes `DATABASE_URL`.
  - `parseEnv({..., APP_ENV: 'prod', MALWARE_PROVIDER: 'stub'})` throws `Stub provider not allowed in prod: MALWARE_PROVIDER`.
  - `STORAGE_PROVIDER: 'local'` in prod throws with `STORAGE_PROVIDER`.
  - `AI_PROVIDER: 'anthropic'` without `ANTHROPIC_API_KEY` throws with `ANTHROPIC_API_KEY`.
  - `STORAGE_PROVIDER: 'supabase'` requires both `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] **Step 2:** Run `pnpm test src/lib/env.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement with a zod object and a `superRefine` for the provider rules. Write `.env.local.example` listing every key, with dev defaults: providers set to `stub` or `local`, and `DATABASE_URL=postgres://postgres:postgres@localhost:5433/postgres`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: validated environment with prod stub guard`.

### Task 3: Database client, IDs, migrator and test harness

**Files:**

- Create:
  - `src/lib/db.ts`
  - `src/lib/ids.ts`
  - `src/lib/migrate.ts`
  - `src/lib/errors.ts`
  - `src/lib/logger.ts`
  - `src/db/schema.ts`
  - `drizzle/0000_init.sql`
  - `scripts/db-local.ts`
  - `scripts/db-migrate.ts`
  - `tests/helpers/db.ts`
  - `src/lib/migrate.test.ts`
  - `src/lib/ids.test.ts`

**Interfaces:**

- **Produces:**
  - `type Db` (a Drizzle `PgDatabase` that works with both the postgres.js and PGlite drivers, typed with `typeof schema`), `type Tx`, `type DbOrTx = Db | Tx`
  - `getDb(): Db` (postgres.js on `DATABASE_URL`, with `prepare: false` for the pooler)
  - `withTx<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T>`
  - `newId(): string` (UUIDv7)
  - `runMigrations(db: Db, dir = 'drizzle'): Promise<string[]>` (returns the file names it applied)
  - `createTestDb(): Promise<{ db: Db; close(): Promise<void> }>` (in-memory PGlite with the postgis extension, all migrations applied)
  - `class AppError extends Error { code: ErrorCode; status: number; details?: unknown }`, where `ErrorCode = 'bad_request'|'unauthorized'|'forbidden'|'not_found'|'conflict'|'rate_limited'|'internal'`
  - helpers `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `rateLimited`
  - `logger.info|warn|error(msg: string, fields?: Record<string, unknown>)`, which writes one JSON line per call
  - `src/db/schema.ts` re-exports `./../modules/<m>/schema` for every module in Task 4

- [ ] **Step 1: Write the failing tests.**
  - `runMigrations` on a fresh test database returns `['0000_init.sql', ...]`, and a second run returns `[]`.
  - After migrating, `select postgis_version()` returns a non-empty string.
  - `select to_regclass('app.schema_migrations')` is not null.
  - `newId()` called twice in a row returns values that sort in increasing order, and each matches the UUID v7 regex `/^[0-9a-f]{8}-[0-9a-f]{4}-7/`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Write `0000_init.sql`. It creates:
  - `create schema if not exists app`
  - `create extension if not exists postgis`
  - `app.schema_migrations(name text primary key, applied_at timestamptz default now())`
  - `app.set_updated_at()`, a trigger function that sets `new.updated_at = now()`
- [ ] **Step 4:** Write the migrator. It reads the `*.sql` files sorted by name and runs each unapplied file inside its own transaction, then inserts its name.
  - `scripts/db-local.ts` starts a `PGLiteSocketServer` on port 5433, with the postgis extension, data in `.pglite/`.
  - `scripts/db-migrate.ts` runs the migrator against `getDb()`.
- [ ] **Step 5:** Run the tests. Expected: PASS.
- [ ] **Step 6:** Commit: `feat: db client, uuidv7 ids, sql migrator and PGlite harness`.

### Task 4: Module skeletons, stubs at shared touchpoints, lint rules and CI

**Files:**

- Create:
  - for each module `identity orgs media trust audit jobs notifications operator settings`:
    - `src/modules/<m>/index.ts`
    - `src/modules/<m>/schema.ts` (containing `export {}`)
  - `src/server/job-handlers.ts`
  - `src/server/schedules.ts`
  - `src/server/counts.ts`
  - `eslint.config.mjs`
  - `scripts/check-design-tokens.mjs`
  - `tests/lint/boundaries.test.ts`
  - `tests/lint/fixtures/**`
  - `.github/workflows/ci.yml`
  - `.gitleaks.toml`

**Interfaces.** These stubs are replaced by their owning workstream, and **their signatures are binding**:

- `@/modules/audit`:
  - `record(db: DbOrTx, e: AuditEventInput): Promise<void>` (no-op stub)
  - `AuditEventInput = { actorType: 'user'|'operator'|'system'; actorId: string | null; orgId?: string | null; action: string; subjectType: string; subjectId: string | null; data?: Record<string, unknown>; requestId?: string | null; ipHash?: string | null }`
- `@/modules/jobs`:
  - `enqueue(db: DbOrTx, e: { topic: string; payload: unknown; dedupeKey?: string; availableAt?: Date }): Promise<void>` (stub throws `not implemented`)
  - `type Handler = (payload: unknown, ctx: { db: Db; now: Date }) => Promise<void>`
  - `type HandlerMap = Record<string, Handler>`
- `@/modules/notifications`:
  - `notify(db: DbOrTx, userId: string, type: string, data: Record<string, unknown>): Promise<void>` (no-op stub)
- `@/modules/trust`:
  - `openReviewItem(db: DbOrTx, i: OpenReviewItemInput): Promise<{ id: string }>` (stub throws)
  - `runCheck(db: DbOrTx, i: RunCheckInput): Promise<CheckResult>` (stub returns `{ checkId: newId(), decision: 'approved', score: 0, labels: [], reason: 'stub' }`)
  - the types `OpenReviewItemInput`, `RunCheckInput` and `CheckResult` (exactly as written in Task 14)
- `@/modules/settings`:
  - `getSetting<K extends SettingKey>(db: DbOrTx, key: K): Promise<SettingValue<K>>` (stub returns the default)
- Every module's `index.ts` exports `jobHandlers: HandlerMap = {}`.
- `src/server/job-handlers.ts` exports `handlers: HandlerMap`, which spreads every module's `jobHandlers`.
- `src/server/schedules.ts` exports `schedules: { topic: string; cron: string }[] = []`, and each workstream appends its own lines.
- `src/server/counts.ts` exports `getCounts(db: DbOrTx, userId: string): Promise<{ inbox: number; notifications: number }>`, returning zeros.
- `src/server/guards.ts` exports these as stubs that throw `not implemented`; Task 8 replaces them:
  - `requireUser`, `requireSeeker`, `requireHost`, `requireOperator`
  - the types `CurrentUser`, `HostContext`, `OperatorContext` and `OrgRole`, exactly as written in Task 8
- `.github/dependabot.yml`: weekly updates for npm and GitHub Actions.

- [ ] **Step 1: Write the failing lint tests.** They run ESLint programmatically on fixtures:
  - `fixtures/deep-import.ts` (imports `@/modules/trust/service`) produces an error from `no-restricted-imports`.
  - `fixtures/ui-imports-module.tsx`, placed under a `src/ui`-like path, produces an error.
  - `check-design-tokens.mjs` on `fixtures/raw-color.tsx` (`className="text-[#fff]"` and `style={{color:'#123456'}}`) exits with 1 and prints `raw-color.tsx:<line>`.
  - The same script on `fixtures/ok.tsx` exits with 0.
- [ ] **Step 2:** Run `pnpm test tests/lint`. Expected: FAIL.
- [ ] **Step 3:** Implement `eslint.config.mjs`:
  - typescript-eslint strict, plus `next/core-web-vitals`.
  - `no-restricted-imports` patterns: `@/modules/*/*`; `drizzle-orm*` outside the allowed paths; `@/modules/*` inside `src/ui/**`.
  - `check-design-tokens.mjs` scans `src/**/*.{ts,tsx,css}` excluding `src/ui/**` and `src/app/globals.css`.
- [ ] **Step 4:** Write `ci.yml`. It runs on every PR and on pushes to `main`. Jobs:
  - `lint` (`pnpm lint && pnpm check:tokens`)
  - `typecheck`
  - `test`
  - `integration`, with a `postgis/postgis:17-3.5` service and `DATABASE_URL`, running `pnpm db:migrate && pnpm test:integration`
  - `build`
  - `gitleaks` (the gitleaks action)
- [ ] **Step 5:** Run `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test`. Expected: PASS.
- [ ] **Step 6:** Commit: `chore: module skeletons, interface stubs, boundary and token lint, CI`.

---

## Phase B1 (in parallel: W1, W2, W3, W4; each in its own worktree, based on Phase A)

### Task 5 (W1): Design tokens and contrast test

**Files:**

- Create: `src/ui/tokens.css`, `src/ui/tokens.ts`, `src/ui/contrast.ts`, `src/ui/tokens.test.ts`
- Modify: `src/app/globals.css` (add `@import "../ui/tokens.css"`), `src/app/layout.tsx` (load Figtree through `next/font/google`, as the variable `--font-sans`)

**Interfaces:**

- **Produces:**
  - Tailwind theme tokens: `bg`, `surface`, `surface-2`, `ink`, `ink-2`, `muted`, `line`, `primary`, `on-primary`, `success`, `success-bg`, `warning`, `danger`, `focus`, and `{maritime,seasonal,farm,remote}-{fg,bg,solid}`
  - radius tokens `sm 8, md 12, lg 14, xl 20, 2xl 24`
  - shadow tokens `card`, `raised`, `overlay`
  - the type scale `12/13/14/15/16/17/19/21/24/28/32`
  - `tokenPairs: { name: string; fg: string; bg: string; min: 4.5 | 3 }[]` for both themes
  - `contrastRatio(fgHex: string, bgHex: string): number`

- [ ] **Step 1: Write the failing tests.**
  - `contrastRatio('#000000', '#FFFFFF')` is 21, to two decimal places.
  - Every entry in `tokenPairs`, for both light and dark, has `contrastRatio(fg, bg) >= min`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Define the tokens.**
  - **Light values from the design board:** bg `#FBFAF7`, surface `#FFFFFF`, ink `#1C1B19`, ink-2 `#4A4740`, muted `#6B675F`, line `#E6E1D8`, primary `#1C1B19`, success `#1F6B43` on `#E3F1E8`, maritime `#1A4F9C`/`#E6EEFA`/`#1D5FBF`, seasonal `#8F4E06`/`#FBEEDD`/`#B45F06`, farm `#24622E`/`#E5F2E6`/`#2F7D3B`, remote `#A12C23`/`#FBE7E5`/`#C8382E`.
  - **Dark values:** derived so that every pair passes the contrast test.
  - **Theme switching:** `@media (prefers-color-scheme: dark)`, with an override under `[data-theme="dark"]` or `[data-theme="light"]` on `<html>`.
  - **Pairs to check:** ink, ink-2 and muted on bg, surface and surface-2; on-primary on primary; each category fg on its bg (4.5); each category solid on surface (3); success on success-bg (4.5).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): design tokens with WCAG contrast test`.

### Task 6 (W2): Identity schema and Clerk webhook sync

**Files:**

- Create:
  - `drizzle/0100_identity.sql`
  - `src/modules/identity/schema.ts`
  - `src/modules/identity/sync.ts`
  - `src/modules/identity/sync.test.ts`
  - `src/modules/orgs/schema.ts`
  - `src/app/api/webhooks/clerk/route.ts`
- Modify: `src/modules/identity/index.ts`, `src/modules/orgs/index.ts`

**Interfaces:**

- **Tables:**
  - `app.users(id uuid pk, clerk_user_id text unique not null, email text, display_name text, account_type text null check in ('seeker','host','operator'), adult_attested_at timestamptz, deleted_at timestamptz, created_at, updated_at)`
  - `app.organizations(id uuid pk, clerk_org_id text unique not null, name text not null, slug text unique not null, owner_user_id uuid references app.users, deleted_at, created_at, updated_at)`
  - `app.org_memberships(id uuid pk, org_id uuid not null references app.organizations, user_id uuid not null references app.users, role text not null check in ('owner','admin','recruiter','billing'), unique(org_id,user_id), created_at, updated_at)`
  - `app.operators(user_id uuid pk references app.users, role text check in ('owner','operator'), queues text[] not null default '{}', shift_status text check in ('on_shift','away') default 'away', last_assigned_at timestamptz, created_at, updated_at)`
  - `app.webhook_events(id text pk, source text, received_at)` (for deduplication)
- **Produces:**
  - `handleClerkEvent(db: Db, evt: { id: string; type: string; data: unknown }): Promise<'applied' | 'duplicate'>`
  - `mapClerkRole(clerkRole: string, isOwner: boolean): OrgRole`, where `OrgRole = 'owner'|'admin'|'recruiter'|'billing'`
- **Event handling:**
  - Handles `user.created`, `user.updated` and `user.deleted`. Deleting sets `deleted_at` and keeps the row.
  - Handles `organization.created`, `organization.updated` and `organization.deleted`.
  - Handles `organizationMembership.created`, `organizationMembership.updated` and `organizationMembership.deleted`.
  - A `user.created` event whose `public_metadata.account_type` is `'operator'` creates an `app.operators` row with `role = public_metadata.operator_role ?? 'operator'`.

- [ ] **Step 1: Write the failing tests.**
  - `user.created` followed by the same event again (same `id`) returns `'applied'` then `'duplicate'`, and leaves exactly one user.
  - An `organizationMembership.created` event for an organization and user not yet seen (with the payload's `organization` and `public_user_data`) creates both placeholder rows. A later `organization.created` event fills in the name **without creating a duplicate**. *(Review Focus 1)*
  - `user.updated` arriving before `user.created` ends with one user carrying the newest email.
  - `mapClerkRole('org:admin', true)` returns `'owner'`; `mapClerkRole('org:admin', false)` returns `'admin'`; `'org:recruiter'` maps to `'recruiter'` and `'org:billing'` to `'billing'`. An unknown role throws `AppError` with the code `bad_request`.
  - A `user.created` event with `public_metadata { account_type: 'operator', operator_role: 'owner' }` creates an operators row with the role `owner`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, upserting by Clerk ID inside one transaction. The route verifies the signature with `verifyWebhook` from `@clerk/nextjs/webhooks`, then calls `handleClerkEvent(getDb(), evt)`, then `audit.record`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(identity): users/orgs/memberships/operators with idempotent Clerk sync`.

### Task 7 (W2): Onboarding and account type

**Files:**

- Create:
  - `src/modules/identity/onboarding.ts`
  - `src/modules/identity/onboarding.test.ts`
  - `src/modules/identity/clerk-admin.ts`
  - `src/modules/orgs/create.ts`
  - `src/modules/orgs/create.test.ts`
  - `src/app/api/v1/onboarding/route.ts`

**Interfaces:**

- **Produces:**
  - `interface ClerkAdmin { setPublicMetadata(clerkUserId: string, md: Record<string, unknown>): Promise<void>; createOrganization(input: { name: string; createdBy: string }): Promise<{ clerkOrgId: string }>; hasPasskey(clerkUserId: string): Promise<boolean>; hasStrongAuth(clerkUserId: string): Promise<boolean>; inviteOperator(email: string, role: 'owner'|'operator'): Promise<void> }`
  - `clerkAdmin()`, which returns the real implementation using `clerkClient()`
  - `makeFakeClerkAdmin()`, for tests only
  - `setAccountType(db: Db, clerk: ClerkAdmin, userId: string, input: { accountType: 'seeker'; adultAttested: true } | { accountType: 'host' }): Promise<void>`
  - `createOrganization(db: Db, clerk: ClerkAdmin, input: { ownerUserId: string; name: string }): Promise<{ id: string; slug: string }>`
  - `slugify(name: string): string`
- **API:** `POST /api/v1/onboarding` takes the body `{ accountType: 'seeker', adultAttested: true } | { accountType: 'host', organizationName: string (2–80 chars) }`. It returns `{ redirectTo: '/' | '/host' }`.

- [ ] **Step 1: Write the failing tests.**
  - Setting `seeker` sets `account_type` and `adult_attested_at`, and calls `setPublicMetadata` with `{ account_type: 'seeker' }`.
  - A seeker with `adultAttested: false` is rejected by the schema, with code `bad_request`.
  - Calling `setAccountType` a second time, with any type, throws `conflict`.
  - `setAccountType` with `operator` is not possible: the input type forbids it, and the route returns 400.
  - `createOrganization` with the name "Kettle Ridge Lodge" gives the slug `kettle-ridge-lodge`. A second organization with the same name gives `kettle-ridge-lodge-2`. The owner's membership row has the role `owner`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, recording an audit event `identity.account_type_set` or `orgs.created`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(identity): onboarding with immutable account type and org creation`.

### Task 8 (W2): Guards and operator bootstrap

**Files:**

- Create:
  - `src/server/guards.ts`
  - `src/modules/identity/access.ts`
  - `src/modules/identity/access.test.ts`
  - `scripts/ops-bootstrap-owner.ts`

**Interfaces:**

- **Produces:**
  - `evaluateHostAccess(i: { role: OrgRole | null; strongAuth: boolean; required?: OrgRole[] }): 'ok' | 'needs_strong_auth' | 'forbidden'`
  - `evaluateOperatorAccess(i: { operator: { role: 'owner'|'operator'; queues: string[] } | null; hasPasskey: boolean; queue?: string }): 'ok' | 'needs_passkey' | 'forbidden'`
  - `requireUser(): Promise<CurrentUser>`, `requireSeeker(): Promise<CurrentUser>`, `requireHost(opts?: { roles?: OrgRole[] }): Promise<HostContext>`, `requireOperator(opts?: { queue?: string; sensitive?: boolean }): Promise<OperatorContext>`
  - `CurrentUser = { id: string; clerkUserId: string; accountType: 'seeker'|'host'|'operator'|null; email: string | null }`
  - `HostContext = { user: CurrentUser; orgId: string; role: OrgRole }`
  - `OperatorContext = { user: CurrentUser; role: 'owner'|'operator'; queues: string[] }`
- A guard throws `AppError` (`unauthorized` or `forbidden`). Page callers redirect: a host who `needs_strong_auth` goes to `/host/security`, and an operator who `needs_passkey` goes to `/admin/passkey`.
- With `sensitive: true`, `requireOperator` also requires Clerk reverification within the last 10 minutes.

- [ ] **Step 1: Write the failing tests** (all in `access.test.ts`).
  - An Owner without strong authentication gets `'needs_strong_auth'`.
  - A Recruiter without strong authentication gets `'ok'`.
  - A Billing member with `required: ['admin','owner']` gets `'forbidden'`.
  - An operator without a passkey gets `'needs_passkey'`.
  - An operator with queues `['moderation']` asking for the queue `'fraud'` gets `'forbidden'`.
  - An operator with the role `owner` passes for any queue.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the pure evaluators and the guards, using `auth()` and `currentUser()`.
  - `ops-bootstrap-owner.ts <email>` calls `clerkAdmin().inviteOperator(email, 'owner')`. It refuses if an owner already exists.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(identity): host/operator guards with strong-auth and passkey rules`.

### Task 9 (W3): Outbox, worker and scheduler

**Files:**

- Create:
  - `drizzle/0200_jobs.sql`
  - `src/modules/jobs/schema.ts`
  - `src/modules/jobs/outbox.ts`
  - `src/modules/jobs/worker.ts`
  - `src/modules/jobs/schedule.ts`
  - `src/modules/jobs/worker.int.test.ts`
  - `src/modules/jobs/worker.test.ts`
  - `src/app/api/jobs/run/route.ts`
- Modify: `src/modules/jobs/index.ts`

**Interfaces:**

- **Tables:**
  - `app.outbox(id uuid pk, topic text not null, payload jsonb not null, dedupe_key text unique, status text check in ('pending','processing','done','dead') default 'pending', attempts int default 0, available_at timestamptz default now(), locked_at timestamptz, last_error text, created_at, updated_at)`, with an index on `(status, available_at)`
  - `app.schedule_runs(topic text pk, last_run_at timestamptz not null)`
- **Produces** (replacing the stubs):
  - `enqueue(...)`: with `on conflict (dedupe_key) do nothing`
  - `runWorker(db: Db, opts?: { batchSize?: number; now?: Date; handlers?: HandlerMap }): Promise<{ processed: number; retried: number; dead: number }>`
  - `nextDelayMs(attempt: number, rand?: () => number): number`
  - `enqueueDueSchedules(db: Db, now: Date, list?: { topic: string; cron: string }[]): Promise<string[]>`
  - `kickWorker(): void`: fires `fetch(APP_URL + '/api/jobs/run', { method: 'POST', headers: { 'x-jobs-secret': JOBS_SECRET } })` without waiting, and logs any error
- **Route:** `POST /api/jobs/run` returns 401 unless the `x-jobs-secret` header equals `JOBS_SECRET` (compared in constant time). Otherwise it runs `enqueueDueSchedules` then `runWorker`, and returns the counts as JSON.

- [ ] **Step 1: Write the failing tests.**
  - `enqueue` twice with the same `dedupeKey` creates one row.
  - A handler that throws: after one run, `attempts=1` and `status='pending'`, with `available_at` moved forward. After the 8th failure, `status='dead'` and `logger.error` is called.
  - `nextDelayMs(0, () => 0.5)` is 30000. `nextDelayMs(20, () => 0.5)` is 21600000, the 6-hour cap.
  - A `processing` row with `locked_at` 11 minutes ago is reclaimed and processed.
  - **Integration test** in `worker.int.test.ts` against the real Postgres in CI, because PGlite is single-connection. It runs two `runWorker` calls concurrently over 10 events, and each handler is called exactly once per event. *(Review Focus 2)*
  - For `enqueueDueSchedules` with `[{ topic: 't', cron: '*/5 * * * *' }]`: at 10:00 it returns `['t']`; at 10:01 it returns `[]`; at 10:05 it returns `['t']`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the claim with this query:

  ```sql
  update app.outbox set status='processing', locked_at=now()
  where id in (
    select id from app.outbox
    where (status='pending' and available_at <= $now)
       or (status='processing' and locked_at < $now - interval '10 minutes')
    order by available_at limit $n for update skip locked
  ) returning *
  ```
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Run the integration test in CI.
- [ ] **Step 5:** Commit: `feat(jobs): transactional outbox, skip-locked worker, cron schedules`.

### Task 10 (W3): Audit log and settings

**Files:**

- Create:
  - `drizzle/0210_audit_settings.sql`
  - `src/modules/audit/schema.ts`
  - `src/modules/audit/record.ts`
  - `src/modules/audit/search.ts`
  - `src/modules/audit/audit.test.ts`
  - `src/modules/settings/schema.ts`
  - `src/modules/settings/registry.ts`
  - `src/modules/settings/settings.test.ts`
- Modify: `src/modules/audit/index.ts`, `src/modules/settings/index.ts`

**Interfaces:**

- **Tables:**
  - `app.audit_events(id uuid pk, actor_type text check in ('user','operator','system'), actor_id uuid, org_id uuid, action text not null, subject_type text not null, subject_id text, data jsonb, request_id text, ip_hash text, created_at)`. A trigger `app.audit_immutable()` raises an exception on UPDATE or DELETE.
  - `app.settings(key text pk, value jsonb not null, updated_by uuid, created_at, updated_at)`
- **Produces:**
  - `record(...)` (replacing the stub)
  - `redact(data: Record<string, unknown>): Record<string, unknown>`: replaces the value of any key matching `/secret|token|password|api[_-]?key/i` with `'[redacted]'`, at any depth
  - `searchAudit(db: DbOrTx, f: { action?: string; actorId?: string; subjectType?: string; subjectId?: string; from?: Date; to?: Date; limit?: number; before?: string }): Promise<{ items: AuditEvent[]; nextBefore: string | null }>`
  - `getSetting(...)` (replacing the stub)
  - `setSetting<K extends SettingKey>(db: Db, key: K, value: SettingValue<K>, actor: { operatorId: string }): Promise<void>`: validates with zod, upserts and records `settings.updated`
- **`SettingKey` defaults:**

  | Key | Default |
  |---|---|
  | `limits.invites_per_seeker_per_week` | `10` |
  | `trust.thresholds` | `{ image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 }, text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 } }` |
  | `trust.audit_sample_rate` | `0.01` |
  | `business.mailing_address` | `''` |
  | `business.support_email` | `''` |
  | `ops.second_signoff_refund_cents` | `50000` |

- [ ] **Step 1: Write the failing tests.**
  - `record` followed by an `update app.audit_events` throws. So does `delete`.
  - `redact({ a: 1, apiKey: 'x', nested: { token: 'y' } })` returns `{ a: 1, apiKey: '[redacted]', nested: { token: '[redacted]' } }`.
  - `searchAudit` with `limit: 2` over 3 events returns 2 items and a non-null `nextBefore`. The next page returns 1 item.
  - `getSetting` for `limits.invites_per_seeker_per_week` returns `10` with no row stored.
  - `setSetting` with `-1` for that key throws `bad_request`.
  - `setSetting` writes an audit event with the action `settings.updated`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(audit,settings): append-only audit log and typed settings`.

### Task 11 (W4): API wrapper, errors and rate limiting

**Files:**

- Create:
  - `src/server/api.ts`
  - `src/server/api.test.ts`
  - `src/server/request-context.ts`
  - `drizzle/0300_rate_limits.sql`
  - `src/lib/rate-limit.ts`
  - `src/lib/rate-limit.test.ts`
  - `src/app/api/v1/health/route.ts`

**Interfaces:**

- **Table:** `app.rate_limits(key text, window_start timestamptz, count int not null, primary key(key, window_start))`
- **Produces:**
  - `consume(db: DbOrTx, key: string, limit: number, windowSec: number, now?: Date): Promise<{ allowed: boolean; remaining: number; resetAt: Date }>`
  - `apiRoute<I, O>(opts: { input?: z.ZodType<I>; auth?: 'none'|'user'|'seeker'|'host'|'operator'; rateLimit?: { key: (ctx) => string; limit: number; windowSec: number }; openapi?: { method: 'GET'|'POST'|'PATCH'|'DELETE'; path: string; summary: string; output?: z.ZodType<O> }; handler: (ctx: ApiContext<I>) => Promise<O> }): (req: Request) => Promise<Response>`
  - `ApiContext<I> = { input: I; requestId: string; db: Db; user: CurrentUser | null; req: Request }`
  - `toErrorResponse(err: unknown, requestId: string): Response`
- **Behavior:**
  - Every response carries the `x-request-id` header.
  - A non-GET request whose `Origin` doesn't match `APP_URL` or `https://${ADMIN_HOST}` returns 403 `forbidden`.
  - Input is read from the JSON body (or the query string for GET). A zod failure returns 400 `bad_request`, with `details` set to `issues`.
  - Unknown errors return 500 `internal` and are logged; the message is never leaked.

- [ ] **Step 1: Write the failing tests.**
  - A handler throwing `notFound('x')` returns status 404 and the body `{ error: { code: 'not_found', message: 'x', requestId } }`.
  - A POST with `Origin: https://evil.test` returns 403.
  - An invalid body returns 400 with `details` as an array.
  - A thrown `new Error('db password=...')` returns 500 with the message `'Internal error'`.
  - `consume` with limit 2 inside one window returns allowed, allowed, then not allowed. The next window resets it.
  - `GET /api/v1/health` returns `{ ok: true, env: APP_ENV }`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): apiRoute wrapper, error envelope, origin check, rate limits`.

### Task 12 (W4): Proxy, security headers, OpenAPI and SSE

**Files:**

- Create:
  - `src/proxy.ts`: Next 16's name for middleware. Use `middleware.ts` if the installed Next version requires it.
  - `src/lib/security-headers.ts`
  - `src/lib/security-headers.test.ts`
  - `src/server/openapi.ts`
  - `src/app/api/v1/openapi.json/route.ts`
  - `src/app/api/v1/me/stream/route.ts`
  - `src/server/host-routing.ts`
  - `src/server/host-routing.test.ts`
  - `src/lib/analytics.ts`
  - `src/lib/analytics.test.ts`
  - Sentry files: `instrumentation.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`. Each starts Sentry only when `SENTRY_DSN` is set.

**Interfaces:**

- **Analytics:** `track(event: string, props?: Record<string, unknown>, distinctId?: string): void` (server side, posthog-node; client side through a `PostHogProvider`). Before sending, it removes any prop whose key matches `/email|name|phone|address|message|body/i`. **Test:** `track('x', { email: 'a@b', listingId: '1' })` sends only `{ listingId: '1' }`.

- **Produces:**
  - `buildSecurityHeaders(i: { nonce: string; appEnv: 'dev'|'preview'|'prod' }): Record<string, string>`. It returns:
    - a CSP with `script-src 'self' 'nonce-<n>' 'strict-dynamic'` and the Clerk, Sentry and PostHog hosts allowed
    - `frame-ancestors 'none'`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
    - HSTS, only in prod
  - `routeForHost(i: { host: string; pathname: string; adminHost: string; appEnv: string }): { action: 'next' } | { action: 'rewrite'; to: string } | { action: 'notFound' }`
  - `registerRoute(r)` and `buildOpenApi(): object` (OpenAPI 3.1, built from `z.toJSONSchema`)
- **SSE:** `GET /api/v1/me/stream` (requires a user) sends `event: counts` with `data: {"inbox":n,"notifications":n}` immediately, then every 15 seconds, using `getCounts`.

- [ ] **Step 1: Write the failing tests.**
  - With `host` set to the admin host and path `/queues`, `routeForHost` rewrites to `/admin/queues`.
  - With the app host and path `/admin`, it returns `notFound`.
  - With `/design-system` and `appEnv: 'prod'`, it returns `notFound`; with `preview`, it returns `next`.
  - Security headers in prod include `Strict-Transport-Security`, and in dev they don't. The CSP contains `nonce-abc` when given `nonce: 'abc'`.
  - `buildOpenApi().paths['/api/v1/health'].get` is defined.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. `proxy.ts` composes `clerkMiddleware`, `routeForHost` and the headers. Signed-in users without an account type are redirected to `/onboarding`, using `sessionClaims.metadata.account_type`; configure the Clerk session token to include `metadata: {{user.public_metadata}}`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(api): proxy routing, CSP/security headers, OpenAPI, SSE counts`.

### Task 13 (W1): Design system components

**Files:**

- Create: `src/ui/components/*.tsx`, one file per component below, plus `src/ui/components/index.ts`, `src/ui/cn.ts`, `src/ui/icons.ts`, `src/ui/components/*.test.tsx` (render tests with `@testing-library/react` under `jsdom`, both installed in Task 1).
- **Components:**
  - `Button` (variants primary, secondary, ghost, danger; sizes md 44 and lg 48; `asChild`)
  - `IconButton` (requires `label`, used as its `aria-label`; 44×44)
  - `Chip` (two lines: `label`, `value`, `icon?`, `tone?: 'default'|'success'|'muted'`; renders a button opening `onOpen`)
  - `Pill`
  - `CategoryBadge` (`category: 'maritime'|'seasonal'|'farm'|'remote'`, with icon and label)
  - `Badge`
  - `Avatar` (circle, image or initials)
  - `OrgLogo` (rounded square)
  - `Card` (slots `cover`, `coverBadge`, `coverAction`, `identity`, `title`, `subtitle`, `info`, `chips` (exactly 3), `actions`)
  - `JobCard`, `CandidateCard` (typed props that map into `Card`; field mapping per product spec section 4)
  - `Sheet` (bottom sheet below 768 px wide, right-side panel above it; Radix Dialog)
  - `Dialog`, `Tabs`, `SegmentedControl`, `Switch` (role switch), `Input`, `Textarea`, `Select`, `Slider`, `Checkbox`, `Radio`
  - `Toast` (with undo action support), `Tooltip`
  - `TopBar`, `BottomNav` (items with `aria-current`), `Sidebar`, `OrgSwitcher` (presentational)
  - `EmptyState`, `ErrorState` (icon plus text), `Skeleton`
  - `StatTile`, `BarChart`, `StackedBar`, `DonutChart` (Recharts, token colors only; each takes `view: 'chart'|'table'` and renders an accessible `<table>` in table mode)

- [ ] **Step 1: Write the failing render tests.**
  - `IconButton` without `label` is a type error (checked with `// @ts-expect-error`), and with a label it renders `aria-label`.
  - `Card` with 2 chips is a type error, because `chips` is a 3-tuple.
  - `JobCard` with `housing: { provided: true }` renders "Housing" and "Provided" plus the check icon. With `{ provided: false }` it renders "No housing".
  - `CandidateCard` with `showPhoto: false` renders initials, not an `<img>`.
  - `BottomNav` marks the active item with `aria-current="page"`.
  - `DonutChart` with `view="table"` renders a `<table>` with one row per slice.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement the components, matching the design board (`docs` link in the spec): 44 px minimum targets, focus rings that use the `focus` token, and `motion-safe:` on every transition.
- [ ] **Step 4:** Run the tests. Expected: PASS. Run `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): design system components and shared card template`.

---

## Phase B2 (in parallel: W5, W6, W7; based on B1 merged)

### Task 14 (W5): AI classifier and runCheck

**Files:**

- Create:
  - `src/lib/ai.ts`
  - `src/lib/ai.test.ts`
  - `drizzle/0400_trust.sql`
  - `src/modules/trust/schema.ts`
  - `src/modules/trust/checks.ts`
  - `src/modules/trust/checks.test.ts`

**Interfaces:**

- **Tables:**
  - `app.trust_checks(id uuid pk, kind text, subject_type text, subject_id text, provider text, model text, prompt_version text, score real, labels text[], reason text, decision text check in ('approved','rejected','needs_review'), latency_ms int, created_at)`
  - `app.review_items(id uuid pk, queue text check in ('moderation','fraud','reports','support','child_safety','billing','appeals','audit_sample'), status text check in ('open','assigned','escalated','resolved') default 'open', subject_type text, subject_id text, check_id uuid, reason text, ai_confidence real, priority int default 0, assignee_operator_id uuid, assigned_at timestamptz, escalated_to uuid, sla_due_at timestamptz not null, sla_breached_at timestamptz, decided_by uuid, original_item_id uuid, resolution text, resolved_at timestamptz, created_at, updated_at)`
  - `app.review_notes(id, item_id, author_operator_id, body text, mentions uuid[], created_at)`
  - `app.review_actions(id, item_id, action text, actor_operator_id, data jsonb, status text check in ('pending_second','applied','rejected'), second_operator_id uuid, created_at, updated_at)`
- **Produces:**
  - `classify<T>(opts: { model: 'claude-haiku-5-5'; system: string; content: ClassifyContent[]; schema: z.ZodType<T>; promptVersion: string; timeoutMs?: number }): Promise<T>`, where `ClassifyContent = { type: 'text'; text: string } | { type: 'image'; mime: string; bytes: Uint8Array }`
    - Uses Anthropic structured output (the Messages API with a JSON-schema tool); load the claude-api skill. The default timeout is 15,000 ms.
    - **Stub provider:** for text, returns `{ score: 0.95 }` if the text contains `__block__`, `{ score: 0.5 }` if it contains `__flag__`, else `{ score: 0.02 }`. Images behave the same way based on the byte marker. The rest of the result is `labels: [], reason: 'stub'`, and for image safety also `altText: 'Test image'`.
  - `RunCheckInput = { kind: 'image_safety' | 'text_safety'; subjectType: string; subjectId: string; text?: string; image?: { mime: string; bytes: Uint8Array }; wantAltText?: boolean }`
  - `CheckResult = { checkId: string; decision: 'approved'|'rejected'|'needs_review'; score: number; labels: string[]; reason: string; altText?: string }`
  - `runCheck(db, i)` (replacing the stub):
    - `score < approveBelow` is approved; `score >= rejectAtOrAbove` is rejected; anything else is `needs_review`, which opens a `moderation` item.
    - Any error from `classify`, or a schema mismatch, results in `needs_review` with reason `'classifier_error'`.
  - `Queue = 'moderation'|'fraud'|'reports'|'support'|'child_safety'|'billing'|'appeals'|'audit_sample'`
  - `OpenReviewItemInput = { queue: Queue; subjectType: string; subjectId: string; reason: string; checkId?: string; aiConfidence?: number; priority?: number; excludeOperatorIds?: string[]; originalItemId?: string }`

- [ ] **Step 1: Write the failing tests.**
  - With the stub, `text: 'hello'` is approved; `'__flag__'` is `needs_review` and one review item exists in the `moderation` queue; `'__block__'` is rejected.
  - A `classify` that throws, or returns `{ score: 'high' }`, results in `needs_review` with reason `'classifier_error'`. *(Review Focus 5)*
  - Thresholds read through `getSetting('trust.thresholds')`: setting `approveBelow: 0.6` makes `'__flag__'` (0.5) approved.
  - Every call stores one `trust_checks` row, with `prompt_version` set.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Prompts live in `src/modules/trust/prompts/<kind>.ts`, exporting `{ version: 'image_safety@1', system }`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trust): Claude classifier with fail-closed runCheck and thresholds`.

### Task 15 (W5): Review routing, SLA sweep and alerts

**Files:**

- Create:
  - `src/modules/trust/routing.ts`
  - `src/modules/trust/routing.test.ts`
  - `src/modules/trust/alerts.ts`
  - `src/modules/trust/sla.ts`
  - `src/modules/trust/sla.test.ts`
- Modify: `src/server/schedules.ts` (add `{ topic: 'review.sla_sweep', cron: '*/5 * * * *' }`)

**Interfaces:**

- **Produces:**
  - `SLA_HOURS: Record<Queue, number> = { child_safety: 1, fraud: 4, reports: 24, support: 24, moderation: 24, billing: 24, appeals: 24, audit_sample: 24 }`
  - `pickAssignee(db, queue: Queue, exclude?: string[]): Promise<string | null>`: picks from on-shift operators whose `queues` include `queue` (owners match every queue), taking the fewest items with status `assigned` or `escalated`, ties broken by the oldest `last_assigned_at` (nulls first)
  - `openReviewItem(db, i)` (replacing the stub): sets `sla_due_at = now + SLA_HOURS[queue]`, assigns through `pickAssignee` and sets `assigned_at`; if nobody is free the item stays `open`
  - `raiseAlert(db, a: { severity: 'critical'|'warning'; kind: string; message: string; data?: Record<string, unknown> }): Promise<void>`: notifies every owner operator with type `operator.alert`, and records audit `trust.alert`
  - `slaSweep(db, now: Date): Promise<{ reassigned: number; breached: number }>`: for each unresolved item past `sla_due_at`, reassigns it to another operator (excluding the current one) and pushes `sla_due_at` forward by its queue's SLA. If nobody else is available, it sets `sla_breached_at` (once) and raises a critical alert.
  - `jobHandlers['review.sla_sweep']`
  - When `queue === 'child_safety'`, `openReviewItem` always calls `raiseAlert({ severity: 'critical', kind: 'child_safety', ... })`.

- [ ] **Step 1: Write the failing tests.**
  - Operators A (2 open items) and B (0) are both on shift with `['moderation']`: a new item goes to B.
  - A and B both have 0 open items: the item goes to the one with the older `last_assigned_at`.
  - An operator who is `away` is never picked.
  - Nobody is on shift: the item is created with status `open` and no assignee. `slaSweep` 25 hours later sets `sla_breached_at` and calls `notify` for the owner with `operator.alert`. *(Review Focus 4)*
  - An overdue item assigned to A, with B on shift, is reassigned to B.
  - A child-safety item calls `raiseAlert` with severity `critical`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. For the `notify` dependency, use the module index; in tests, use `vi.mock('@/modules/notifications')`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trust): least-loaded routing, SLA sweep, owner alerts`.

### Task 16 (W5): Operator actions, second sign-off, appeals and accuracy sampling

**Files:**

- Create:
  - `src/modules/trust/actions.ts`
  - `src/modules/trust/actions.test.ts`
  - `src/modules/trust/subjects.ts`
  - `src/modules/trust/sampling.ts`
  - `src/modules/trust/sampling.test.ts`
- Modify: `src/server/schedules.ts` (add `{ topic: 'trust.audit_sample', cron: '0 9 * * 1' }`)

**Interfaces:**

- **Produces:**
  - `claim(db, itemId, operatorId): Promise<void>`: an atomic `update ... where assignee_operator_id is null or assignee_operator_id = $op`; throws `conflict` if another operator holds the item
  - `handOff(db, itemId, fromOperatorId, toOperatorId): Promise<void>`
  - `escalate(db, itemId, fromOperatorId, i: { toOperatorId?: string; reason: string }): Promise<void>`: with no `toOperatorId`, escalates to the owner with the fewest open items; sets `status='escalated'` and `priority = priority + 100`; notes the reason
  - `addNote(db, itemId, operatorId, body: string): Promise<void>`: parses `@[Display Name](operator-uuid)` tokens into `mentions`, and calls `notify(userId, 'operator.mention', { itemId })` for each
  - `ReviewAction = 'approve'|'remove'|'ask_info'|'suspend'|'ban'|'refund'`
  - `decide(db, itemId, operatorId, action: ReviewAction, data?: { amountCents?: number; note?: string }): Promise<{ status: 'applied' | 'pending_second' }>`
    - It needs a second sign-off when `action === 'ban'`, or `action === 'refund' && amountCents > getSetting('ops.second_signoff_refund_cents')`, and the count of operators is ≥ 2.
    - When applied, it calls the subject handler, resolves the item, sets `decided_by`, and records audit `trust.decided`.
  - `approveSecond(db, actionId, operatorId): Promise<void>`: throws `forbidden` if `operatorId` equals the first actor; otherwise applies the action
  - `registerSubjectHandlers(subjectType: string, h: Partial<Record<ReviewAction, (db: DbOrTx, subjectId: string, data?: unknown) => Promise<void>>>): void`
    - Foundation registers `'test_item'` (a no-op recorder). `media` is registered in Task 21.
  - `openAppeal(db, i: { originalItemId: string; reason: string }): Promise<{ id: string }>`: queue `appeals`, excluding the original `decided_by`
  - `auditSample(db, now, rate?: number, rand?: () => number): Promise<number>`: samples `trust_checks` from the last 7 days with decision `approved` or `rejected` into `audit_sample` items, about `rate × total` of them
  - `jobHandlers['trust.audit_sample']`

- [ ] **Step 1: Write the failing tests.**
  - Two operators each call `claim` at the same time: one succeeds, the other gets `conflict`.
  - `ban` with 2 operators returns `pending_second`. `approveSecond` by the same operator is `forbidden`; by the other operator the action is applied.
  - `ban` with 1 operator is applied immediately.
  - `refund` with 40000 cents is applied immediately; with 60000 cents (and 2 operators) it is `pending_second`.
  - An appeal on an item decided by A is never assigned to A while B is on shift.
  - `addNote` with `"@[Bo](<uuid-B>) check this"` stores `mentions=[uuid-B]` and calls `notify` once.
  - `auditSample` with rate 0.01, 1,000 automatic decisions and `rand` returning `i/1000` in sequence creates 10 items.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trust): claim/handoff/escalate, two-operator sign-off, appeals, audit sampling`.

### Task 17 (W6): Notification store, preferences and notify

**Files:**

- Create:
  - `drizzle/0500_notifications.sql`
  - `src/modules/notifications/schema.ts`
  - `src/modules/notifications/types.ts`
  - `src/modules/notifications/notify.ts`
  - `src/modules/notifications/notify.test.ts`
  - `src/app/api/v1/notifications/route.ts`
  - `src/app/api/v1/notifications/read/route.ts`
- Modify: `src/modules/notifications/index.ts`, `src/server/counts.ts`

**Interfaces:**

- **Tables:**
  - `app.notifications(id, user_id, type, category, title, body, data jsonb, read_at, created_at)`
  - `app.notification_preferences(user_id, category, channel text check in ('email','push'), enabled boolean, primary key(user_id, category, channel))`
  - `app.push_subscriptions(id, user_id, endpoint text unique, p256dh, auth, last_success_at, created_at)`
  - `app.email_suppressions(email text pk, reason, created_at)`
  - `app.notification_batches(id, user_id, batch_key, channel, notification_ids uuid[], send_after timestamptz, status text check in ('pending','sent'), created_at, updated_at)`, with a unique pending batch per `(user_id, batch_key, channel)`
- **Produces:**
  - `Category = 'messages'|'applications'|'jobs'|'alerts'|'community'|'account'|'security'|'billing'|'operator'`
  - `EmailTemplateName = 'SystemTest'|'OperatorAlert'|'OperatorMention'|'Digest'` (Task 18 builds the templates)
  - `defineType(t: { type: string; category: Category; mandatory?: boolean; title: (d) => string; body: (d) => string; email?: { template: EmailTemplateName; batch?: { key: string; delayMinutes: number } }; push?: boolean }): void`
  - **Foundation types:**
    - `system.test`
    - `operator.mention`
    - `operator.alert` (mandatory, email and push)
    - `security.new_sign_in` (mandatory)
  - `notify(...)` (replacing the stub):
    1. Writes the in-app row.
    2. For each channel the type uses: if the type is mandatory, or the preference is enabled (the default is enabled), and the email isn't suppressed, it either enqueues `notifications.email` / `notifications.push` (dedupe key `notif:<id>:<channel>`) or appends to a batch.
  - `unreadCount(db, userId): Promise<number>`, `markRead(db, userId, ids: string[] | 'all'): Promise<void>`
  - **API:** `GET /api/v1/notifications?before=` and `POST /api/v1/notifications/read`
  - `counts.ts` updated so that `notifications: unreadCount(...)`

- [ ] **Step 1: Write the failing tests.**
  - Notifying `system.test` creates one in-app row and enqueues one email job.
  - With the email preference disabled for `account`, no email job is enqueued, but the in-app row still exists.
  - `operator.alert` ignores a disabled preference, because it's mandatory.
  - A suppressed email address gets no email job.
  - A type with `batch { key: 'messages', delayMinutes: 15 }` notified twice produces one pending batch with 2 IDs and `send_after = first + 15 minutes`.
  - `unreadCount` returns 1, then 0 after `markRead('all')`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notifications): in-app store, preferences, mandatory types, batching`.

### Task 18 (W6): Email sending, unsubscribe and batch flush

**Files:**

- Create:
  - `src/modules/notifications/email/send.ts`
  - `src/modules/notifications/email/templates/{Layout,SystemTest,OperatorAlert,OperatorMention,Digest}.tsx`
  - `src/modules/notifications/email/unsubscribe.ts`
  - `src/modules/notifications/email/email.test.ts`
  - `src/app/api/v1/unsubscribe/route.ts`
  - `src/modules/notifications/batches.ts`
- Modify: `src/server/schedules.ts` (add `{ topic: 'notifications.flush_batches', cron: '* * * * *' }`)

**Interfaces:**

- **Produces:**
  - `EmailProvider { send(m: { to: string; subject: string; html: string; text: string; headers: Record<string, string> }): Promise<{ id: string }> }`, with a Resend implementation and a stub that collects messages in `stubOutbox: Message[]`
  - `buildUnsubscribeToken(userId: string, category: Category): string` (HMAC-SHA256 with `UNSUBSCRIBE_SECRET`, base64url)
  - `verifyUnsubscribeToken(t: string): { userId: string; category: Category } | null`
  - **Unsubscribe route:** both `GET` and `POST /api/v1/unsubscribe?token=`. `POST` covers one-click unsubscribe (RFC 8058). The route disables the email preference for that category and returns a plain confirmation page.
  - **Email headers:** every email carries `List-Unsubscribe: <APP_URL/api/v1/unsubscribe?token=...>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  - **Footer:** the `Layout` template shows `business.mailing_address` and a link to manage notifications.
  - **Handlers:** `jobHandlers['notifications.email']` and `jobHandlers['notifications.flush_batches']`. The flush job sends one Digest email per due batch, listing only the notifications still unread, and skips the email if none are left.

- [ ] **Step 1: Write the failing tests.**
  - A token round-trips through build and verify. A token with one character changed verifies to `null`.
  - The email job for `system.test` with the stub puts one message in `stubOutbox`, carrying both List-Unsubscribe headers and the mailing address in the HTML.
  - `POST` unsubscribe with a valid token disables the preference.
  - Flushing a due batch with 2 IDs, one already read, sends a digest listing 1 item. A batch whose items were all read sends nothing and is marked `sent`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Render templates with `@react-email/components` `render`.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notifications): Resend email, one-click unsubscribe, digest flush`.

### Task 19 (W6): Web push

**Files:**

- Create:
  - `src/modules/notifications/push.ts`
  - `src/modules/notifications/push.test.ts`
  - `src/app/api/v1/push/subscriptions/route.ts`
  - `public/sw.js`
  - `scripts/gen-vapid.ts`

**Interfaces:**

- **Produces:**
  - `jobHandlers['notifications.push']`: sends to every subscription the user has, using `web-push`. A 404 or 410 response deletes the subscription; success sets `last_success_at`.
  - **API:** `POST /api/v1/push/subscriptions` with `{ endpoint, keys: { p256dh, auth } }` (upserts by endpoint), and `DELETE` with `{ endpoint }`.
  - `public/sw.js` shows the notification and, when it's clicked, opens `data.url`.

- [ ] **Step 1: Write the failing tests** (with `web-push` mocked).
  - When the first subscription returns 410 and the second 201, the first is deleted and the second gets `last_success_at`.
  - Upserting the same endpoint twice leaves one row.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notifications): web push with dead-subscription cleanup`.

### Task 20 (W7): Media records, storage adapters and upload API

**Files:**

- Create:
  - `drizzle/0600_media.sql`
  - `src/modules/media/schema.ts`
  - `src/modules/media/kinds.ts`
  - `src/modules/media/storage.ts`
  - `src/modules/media/uploads.ts`
  - `src/modules/media/uploads.test.ts`
  - `src/app/api/v1/media/uploads/route.ts`
  - `src/app/api/v1/media/uploads/[id]/complete/route.ts`

**Interfaces:**

- **Table:** `app.media(id uuid pk, owner_user_id uuid, owner_org_id uuid, kind text check in ('avatar','cover','logo','listing_photo','housing_photo','meal_photo','community_photo','resume','attachment'), status text check in ('uploaded','scanning','in_review','approved','rejected','blocked') default 'uploaded', bucket text, path text, declared_mime text, detected_mime text, size_bytes int, sha256 text, width int, height int, alt_text text, variants jsonb, rejection_reason text, created_at, updated_at)`
- **Produces:**
  - `MediaKind`: the union of the `kind` values in the CHECK above
  - `MediaStatus`: the union of the `status` values in the CHECK above
  - `KIND_RULES`:
    - every image kind allows `image/jpeg`, `image/png`, `image/webp` and `image/heic`, up to 15 MB
    - `resume` allows `application/pdf` up to 10 MB
    - `attachment` allows `application/pdf`, `image/jpeg`, `image/png` and `image/heic`, up to 10 MB
    - **SVG is never allowed**
  - `interface Storage { signedUploadUrl(bucket, path): Promise<{ url: string; token: string }>; read(bucket, path): Promise<Uint8Array>; write(bucket, path, bytes, contentType): Promise<void>; copy(from: {bucket,path}, to: {bucket,path}): Promise<void>; remove(bucket, path): Promise<void>; signedUrl(bucket, path, expiresSec: number): Promise<string>; publicUrl(bucket, path): string }`
  - three implementations: `supabaseStorage()`, `localStorage(dir)` (served through `/api/v1/media/local/[...path]`, dev only) and `memoryStorage()` (tests)
  - buckets: `quarantine`, `media-public`, `media-private`, `evidence`
  - `requestUpload(db, storage, actor: { userId: string; orgId?: string }, i: { kind: MediaKind; mime: string; sizeBytes: number }): Promise<{ mediaId: string; uploadUrl: string; token: string }>`: rejects with `bad_request` if the mime type or size breaks `KIND_RULES`; the path is `quarantine/<mediaId>`
  - `completeUpload(db, actor, mediaId): Promise<void>`: only the owner may call it; it sets status `scanning` and enqueues `media.scan` (dedupe key `scan:<id>`)

- [ ] **Step 1: Write the failing tests.**
  - `requestUpload` with `{ kind: 'avatar', mime: 'image/svg+xml' }` is rejected with `bad_request`. *(Review Focus 3, request side)*
  - A 16 MB `listing_photo` is rejected.
  - A valid request creates the row and returns an upload URL from memory storage.
  - `completeUpload` by another user returns `forbidden`.
  - `completeUpload` called twice enqueues one job.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Routes use `apiRoute` with `auth: 'user'` and a rate limit of `uploads:<userId>`, 60 per hour.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(media): media records, storage adapters, upload API`.

### Task 21 (W7): Scan pipeline (type check, sharp, child safety, malware, AI)

**Files:**

- Create:
  - `src/modules/media/scan.ts`
  - `src/modules/media/scan.test.ts`
  - `src/modules/media/scanners.ts`
  - `src/modules/media/urls.ts`
  - `src/modules/media/urls.test.ts`
  - `tests/fixtures/media/*` (a small JPEG and PNG with EXIF GPS data, a PDF, a PDF disguised as `.jpg`, an SVG, the EICAR text)
  - `src/app/api/v1/media/[id]/url/route.ts`

**Interfaces:**

- **Produces:**
  - `interface ChildSafetyScanner { scanImage(bytes: Uint8Array): Promise<{ match: boolean; provider: string; reference?: string }> }`, with a PhotoDNA implementation and a stub that matches when the bytes' sha256 is in `CHILD_SAFETY_STUB_HASHES` (comma-separated environment variable)
  - `interface MalwareScanner { scanFile(bytes: Uint8Array, filename: string): Promise<{ clean: boolean; threat?: string }> }`, with a Cloudmersive implementation and a stub that flags files containing the EICAR string
  - `scanMedia(db, deps: { storage: Storage; childSafety: ChildSafetyScanner; malware: MalwareScanner }, mediaId: string): Promise<MediaStatus>`. Steps:
    1. Read the file from quarantine.
    2. Detect its type with `file-type`. If the detected type differs from the declared type or isn't allowed for the kind, reject it with `type_mismatch`.
    3. **Images:**
       - Re-encode with `sharp().rotate()` and no metadata.
       - Write WebP variants at 320, 640 and 1280 px.
       - Store the width and height.
       - Run the child-safety scan. **A match:** set status `blocked`, copy the original to `evidence/<id>`, call `openReviewItem({ queue: 'child_safety', priority: 1000 })`, and stop.
       - Run `runCheck({ kind: 'image_safety', wantAltText: kind in ['listing_photo','housing_photo','meal_photo','community_photo'] })`. Approved moves the file to `media-public` (images) and stores the alt text. `needs_review` sets `in_review`. Rejected sets `rejected`.
    4. **PDFs:** run the malware scan. Infected files are rejected with `malware`; clean ones move to `media-private` and are approved.
    5. Delete the quarantine copy unless the file is blocked.
  - `jobHandlers['media.scan']`
  - Registers the trust subject `'media'`: `approve` finalizes the file; `remove` rejects it.
  - `getMediaUrl(db, storage, viewer: { userId: string; orgIds: string[]; isOperator: boolean }, mediaId: string, variant?: 320|640|1280): Promise<string>`: approved public files return their public URL. Private files return a 300-second signed URL, but only to the owner, a member of the owning organization, or an operator; anyone else gets `forbidden`.

- [ ] **Step 1: Write the failing tests.**
  - A PDF declared as `image/jpeg` is rejected with `type_mismatch`. *(Review Focus 3)*
  - An SVG declared as `image/png` is rejected with `type_mismatch`.
  - After scanning a JPEG with GPS EXIF data, the public variant has no EXIF block (checked with sharp metadata), and there are 3 variants.
  - A stub child-safety match gives status `blocked`, an evidence copy, a child-safety review item, and no copy in public storage.
  - An image with the `__flag__` marker becomes `in_review` with a moderation item. Approving it through `decide(..., 'approve')` moves it to `media-public`.
  - A PDF containing EICAR is rejected with `malware`.
  - A private resume URL requested by a stranger is `forbidden`; requested by the owner it returns a signed URL.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(media): scan pipeline with EXIF strip, child-safety block, malware, AI review`.

---

## Phase B3 (W8; based on B2 merged)

### Task 22 (W8): Design gallery and reference screens

**Files:**

- Create:
  - `src/app/design-system/page.tsx`
  - `src/app/design-system/[section]/page.tsx`
  - `src/app/design-system/reference/{seek,candidate,housing,host-header,profile-header,community-post}/page.tsx`
  - `src/app/design-system/topbar-options/page.tsx`
  - `tests/e2e/design-system.spec.ts`

**Interfaces:**

- **Consumes:** `@/ui/components` (Task 13).
- **The gallery shows** every component in every state (default, hover, focus, disabled, loading, error), side by side in light and dark (`data-theme`).
- **The reference screens recreate the design board's Direction B artboards** using only design-system components, with the same sample content (Kettle Ridge Lodge, Maya Rodriguez).
- **The top bar options page** shows three variants side by side:
  - icons only
  - icons with a role badge
  - a hamburger menu with a role badge

- [ ] **Step 1: Write the failing e2e test.**
  - Every gallery and reference route returns 200.
  - `AxeBuilder` finds 0 violations at the `serious` or `critical` level.
  - Screenshots `design-<route>-<theme>.png` match their baselines (the first run creates them).
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/design-system.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the pages.
- [ ] **Step 4:** Run it again. Expected: PASS. Commit the baselines.
- [ ] **Step 5:** Commit: `feat(ui): design-system gallery, reference screens, top-bar options`.

### Task 23 (W8): Sign-in, onboarding UI and the seeker and host shells

**Files:**

- Create:
  - `src/app/sign-in/[[...sign-in]]/page.tsx`
  - `src/app/sign-up/[[...sign-up]]/page.tsx`
  - `src/app/onboarding/page.tsx`
  - `src/app/(seeker)/layout.tsx`
  - `src/app/(seeker)/{page,swipe/page,map/page,profile/page,community/page,inbox/page,notifications/page}.tsx`
  - `src/app/host/layout.tsx`
  - `src/app/host/{page,listings/page,applicants/page,candidates/page,interviews/page,messages/page,promote/page,analytics/page,host-page/page,team/page,billing/page,settings/page,security/page}.tsx`
  - `src/ui/patterns/Placeholder.tsx`
  - `tests/e2e/shells.spec.ts`

**Interfaces:**

- **Consumes:** `requireSeeker`, `requireHost`, `POST /api/v1/onboarding`, `getCounts` (via SSE), and the ui components.
- **Clerk appearance:** sign-in and sign-up use Clerk components themed with the tokens (an `appearance` built from CSS variables).
- **Onboarding page:**
  - Step 1 asks "I'm looking for work" or "I'm hiring".
  - **Seeker:** the "I'm 18 or older" checkbox, which is required, with the line "Work worth going somewhere for."
  - **Host:** the organization name field.
- **Seeker shell:** TopBar with the Explore&Earn wordmark, Community, Inbox with its unread badge and Notifications. BottomNav with Seek, Swipe, Map and Profile on mobile; top navigation on desktop.
- **Host shell:** a Sidebar with the order from product spec section 15.2, OrgSwitcher (Clerk `useOrganizationList`), and mobile bottom tabs Home, Applicants, Messages, Listings and More. `/host/security` shows Clerk's security settings, for when strong sign-in is missing.
- **Placeholder copy:** `Coming in sub-project <N>: <name>`. When `APP_ENV=prod`, placeholder pages call `notFound()`.

- [ ] **Step 1: Write the failing e2e test** (with Clerk testing tokens).
  - A new user signs up, chooses seeker, ticks 18+, and lands on `/` with the bottom nav visible and "Seek" marked `aria-current`.
  - A new user signs up, chooses host, enters "Kettle Ridge Lodge", and lands on `/host`, where the sidebar shows "Home".
  - Visiting `/onboarding` again redirects to their shell.
  - Tabbing through either shell reaches every nav item.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(app): sign-in, onboarding and seeker/host shells`.

### Task 24 (W8): Operator console

**Files:**

- Create:
  - `src/app/admin/layout.tsx`
  - `src/app/admin/{page,passkey/page}.tsx`
  - `src/app/admin/queues/{page,[id]/page}.tsx`
  - `src/app/admin/operators/page.tsx`
  - `src/app/admin/settings/page.tsx`
  - `src/app/admin/audit/page.tsx`
  - `src/app/admin/actions.ts` (server actions)
  - `src/modules/operator/stats.ts`
  - `src/modules/operator/stats.test.ts`
  - `tests/e2e/operator.spec.ts`

**Interfaces:**

- **Consumes:**
  - `requireOperator`
  - trust: `claim`, `handOff`, `escalate`, `addNote`, `decide`, `approveSecond`, `openReviewItem`
  - `searchAudit`, `getSetting`, `setSetting`
  - `identity.inviteOperator` through `clerkAdmin()`
- **Produces:** `operatorStats(db, operatorId, since: Date): Promise<{ handled: number; avgHandleMinutes: number | null; overturnedOnAppeal: number }>`, where:
  - **handled** counts resolved items where `decided_by` is the operator
  - **average handling time** is `resolved_at - assigned_at`
  - **overturned on appeal** counts appeal items with `original_item_id` pointing to the operator's decisions and a resolution of `approve`, when the original was `remove`, `suspend` or `ban`
- **Pages:**
  - **Home:** counts by queue and status, the operator's own open items, recent alerts.
  - **Queues:** filters for queue, status and "mine"; Claim.
  - **Item detail:** a subject preview (a media thumbnail through `getMediaUrl`, or text), the AI reason and confidence, action buttons, notes with an @mention picker, escalate and hand off, and the pending second sign-off with Approve.
  - **Operators:** invite (Owner only), queue checkboxes, the shift switch, stats.
  - **Settings:** a typed form per setting key (sensitive, so reverification is required).
  - **Audit:** filters and pagination.
- **Server actions:** every action calls `requireOperator({ queue })`, and calls `requireOperator({ sensitive: true })` for ban, refund, settings and operator invites.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `operatorStats` over seeded data (2 handled, average 30 minutes, 1 overturned) returns exactly those numbers.
  - **E2E:** a bootstrapped owner operator (with a testing passkey) creates a test text item containing `__flag__` through a dev-only "Create test item" button. The item appears in the moderation queue; the operator claims it, adds a note, and chooses Approve. The item is resolved, and the audit page shows `trust.decided`.
  - **E2E:** a host user visiting `admin.` gets a 404 or `forbidden` response.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(operator): console home, queues, item actions, operators, settings, audit`.

---

## Phase C: Integration and release plumbing

### Task 25: Exit-criteria end-to-end tests and the release workflows

**Files:**

- Create:
  - `tests/e2e/exit-criteria.spec.ts`
  - `.github/workflows/migrate-preview.yml`
  - `.github/workflows/release.yml`
  - `vercel.json` (if needed for cron or headers)
  - `docs/runbooks/foundation-setup.md`
- Modify: `README.md` (add a "Develop locally" section)

**Interfaces:**

- **Consumes:** everything above.
- **`migrate-preview.yml`:** on push to `main`, runs `pnpm db:migrate` with `DATABASE_URL` set to the `PREVIEW_DATABASE_URL` secret.
- **`release.yml`:** `workflow_dispatch` in the protected `production` GitHub environment, which needs approval. It runs `pnpm db:migrate` against `PROD_DATABASE_URL`, then calls the Vercel production deploy hook from the `VERCEL_DEPLOY_HOOK_PROD` secret.
- **`foundation-setup.md`** gives the exact steps to:
  - create the Supabase `ee-dev`, `ee-preview` and `ee-prod` projects, each with PostGIS, the `pg_cron` and `pg_net` extensions, and a cron job that POSTs to `/api/jobs/run` with `x-jobs-secret` every minute
  - create the buckets `quarantine`, `media-public` (public), `media-private` and `evidence` (private, with restricted access)
  - configure Clerk: custom roles `org:recruiter` and `org:billing`; session token claim `metadata`; webhook to `/api/webhooks/clerk`; passkeys enabled
  - set every environment variable in Vercel
  - generate the VAPID keys

- [ ] **Step 1: Write the failing e2e test**, covering the Foundation exit criteria in one run against `pnpm db:local` with local storage and stub providers:
  - a seeker, a host and an operator each land in their own shell
  - an uploaded JPEG passes scanning and is approved, and its URL loads
  - an uploaded PDF containing EICAR is rejected
  - a `__flag__` text test item goes through the queue to resolved
  - the audit log contains `identity.account_type_set`, `orgs.created` and `trust.decided`
- [ ] **Step 2:** Run it. Expected: FAIL until it is wired together.
- [ ] **Step 3:** Fix the integration gaps. Write the workflows and the runbook.
- [ ] **Step 4:** Run the full suite: `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test && pnpm e2e`. Expected: all pass.
- [ ] **Step 5:** Commit: `test: foundation exit-criteria e2e; ci: preview migrate and gated release`.

### Task 26: Design review package (gate)

**Files:**

- Create: `artifacts/design-review/*.png`, captured from the Task 22 gallery and reference routes in light and dark at 390 px and 1280 px wide.

- [ ] **Step 1:** Run `pnpm e2e tests/e2e/design-system.spec.ts --update-snapshots=none`, and copy the screenshots into `artifacts/design-review/`.
- [ ] **Step 2:** Commit: `docs: design review package for founder approval`.
- [ ] **Step 3:** The orchestrating agent (not this task's implementer) publishes the screenshots to the design board and asks the founder to approve. **No sub-project 2 screen work starts until they do.**
