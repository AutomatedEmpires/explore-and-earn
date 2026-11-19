# Agent environment

Every environment variable Explore&Earn reads, **by name only**, grouped by what it unblocks. Never
add a value to this file. Values live in Doppler (and, today, partly in Vercel and GitHub
environment secrets).

- **Sources:** `src/lib/env.ts` (the schema), `.env.local.example`, `next.config.ts`,
  `vitest.config.ts`, `playwright.config.ts`, `scripts/`, `.github/workflows/` and
  `docs/runbooks/foundation-setup.md`, on `integrate/sp2-20261104` at `03dfdbe`.
- **Doppler state:** checked 8 November 2026 with `doppler secrets --only-names`. No values were read.

## Where values live

Doppler workplace `automatedempires`, project **`exploreandearn`**. It has five configs, all locked:
`dev`, `dev_personal`, `stg`, `prd` and `ops`. Older docs name a project `explore-and-earn` or
`ee-ops`, or say there are no `dev` or `stg` configs. Those statements are stale.

| Config | Should hold | Holds today |
|---|---|---|
| `dev` | Local development and E2E: test-mode keys, Clerk development instance | nothing (only Doppler's own `DOPPLER_*`) |
| `dev_personal` | Unused; purpose undecided | nothing |
| `stg` | Vercel preview and staging (`APP_ENV=preview`); test-mode keys | nothing |
| `prd` | Vercel production (`APP_ENV=prod`); live keys | 13 names, mostly operator tokens (see section 5) |
| `ops` | Operator and account tokens, and CI deploy secrets; never synced to Vercel | nothing |

This mapping is the proposal in AE-Control `policy/doppler.md`. Creating, renaming, importing,
rotating or syncing anything in Doppler needs founder approval first.

Until launch the Vercel Production target serves staging with `APP_ENV=preview`
(`foundation-setup.md`). So the current Vercel production target needs the `stg` set, not `prd`.

## 1. Local development (`pnpm dev`, `pnpm db:local`)

**No credentials needed.** Copy `.env.local.example` to `.env.local`. Every key there has a stub,
local or public placeholder default that the schema accepts when `APP_ENV=dev`.

Required by the schema in every environment (the example supplies dev defaults):

- App: `APP_ENV`, `APP_URL`, `ADMIN_HOST`, `DATABASE_URL`
- Provider switches: `STORAGE_PROVIDER`, `AI_PROVIDER`, `CHILD_SAFETY_PROVIDER`,
  `MALWARE_PROVIDER`, `EMAIL_PROVIDER`, `BILLING_PROVIDER`, `GEOCODER_PROVIDER`,
  `WEATHER_PROVIDER`, `LINK_SAFETY_PROVIDER`
- `EMAIL_FROM`
- Push: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Secrets of at least 32 characters: `JOBS_SECRET`, `UNSUBSCRIBE_SECRET`

Optional in dev:

- Clerk: `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`. Leave
  them empty and Clerk runs keyless, writing `.clerk/.tmp/keyless.json`.
- `LOCAL_STORAGE_DIR` (default `.data/storage`), `CHILD_SAFETY_STUB_HASHES`,
  `ALLOW_OPERATOR_WITHOUT_PASSKEY`
- `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`
- Local database server (`scripts/db-local.ts`): `PGLITE_DATA_DIR`, `PGLITE_PORT`

You need a provider key only when you switch that provider off `stub`:

| Switch | Then also requires |
|---|---|
| `STORAGE_PROVIDER=supabase` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| `AI_PROVIDER=anthropic` | `ANTHROPIC_API_KEY` |
| `CHILD_SAFETY_PROVIDER=photodna` | `PHOTODNA_KEY` |
| `MALWARE_PROVIDER=cloudmersive` | `CLOUDMERSIVE_API_KEY` |
| `EMAIL_PROVIDER=resend` | `RESEND_API_KEY` |
| `BILLING_PROVIDER=stripe` | `STRIPE_SECRET_KEY` (`sk_test_` outside prod), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIG_FULL`, `STRIPE_PORTAL_CONFIG_BILLING` |
| `WEATHER_PROVIDER=nws` | `NWS_USER_AGENT` |
| `LINK_SAFETY_PROVIDER=webrisk` | `WEB_RISK_API_KEY` |

Doppler `dev` holds none of these today. That does not block local work, because the example file
covers it.

## 2. Tests

| Run | Needs | Doppler |
|---|---|---|
| `pnpm lint`, `pnpm typecheck` | nothing | none |
| `pnpm test` (unit; CI job `test`) | nothing. `vitest.config.ts` fills every unset key from `.env.local.example`; the database is PGlite. The runner sets `VITEST` and `NODE_ENV`. | none |
| `pnpm test:integration` (CI job `integration`) | `DATABASE_URL` pointing at a real Postgres with PostGIS. CI supplies a service container. | none |
| `pnpm e2e` (Playwright, local only) | `.env.local`, plus a Clerk development instance: `CLERK_SECRET_KEY` (must be `sk_test_`) and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, or the keyless file. Also `ALLOW_OPERATOR_WITHOUT_PASSKEY`, `DATABASE_URL`, `ADMIN_HOST`, and optionally `PORT`, `E2E_BASE_URL`, `CI`. | `dev` should hold the Clerk development pair. **Missing.** |

## 3. Build (`pnpm build`; CI job `build`)

- **CI needs no secrets.** It copies `.env.local.example` to `.env.local` before building.
- **A prod build validates everything.** With `APP_ENV=prod`, `next.config.ts` runs the full
  schema at build time, so the build needs every production name in section 4.
- **Some names are inlined into the browser bundle at build time.** They must be in the Vercel
  build environment, not only at runtime:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_MAPBOX_TOKEN`
  - `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_APP_ENV`. Do not set these two: `next.config.ts`
    derives them from `SENTRY_DSN` and `APP_ENV`.
- **No Sentry source-map token.** The build does not upload source maps, so it does not read
  `SENTRY_AUTH_TOKEN`.

## 4. Preview and production (Vercel)

The server validates its environment when it starts (`src/instrumentation.ts`):

- Outside dev, it requires the three Clerk names and `NEXT_PUBLIC_MAPBOX_TOKEN`.
- Outside dev, it refuses the example placeholders for `JOBS_SECRET`, `UNSUBSCRIBE_SECRET` and
  `VAPID_*`.
- In prod, it refuses any `stub` or `local` provider and `ALLOW_OPERATOR_WITHOUT_PASSKEY=true`.
- Outside prod, it refuses an `sk_live_` Stripe key.

"Present" below means the name exists in Doppler. Nobody has verified that its value works or
belongs to this product.

| Name | Preview: `stg` | Production: `prd` |
|---|---|---|
| `APP_ENV`, `APP_URL`, `ADMIN_HOST`, `DATABASE_URL` | missing | missing |
| `CLERK_SECRET_KEY` | missing | present (instance unverified) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET` | missing | missing |
| `STORAGE_PROVIDER` (`supabase`), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | missing | missing |
| `AI_PROVIDER` | missing | missing |
| `ANTHROPIC_API_KEY` | missing | present |
| `CHILD_SAFETY_PROVIDER`, `PHOTODNA_KEY` (stub allowed in preview; PhotoDNA is a launch gate) | missing | missing |
| `MALWARE_PROVIDER`, `CLOUDMERSIVE_API_KEY` | missing | missing |
| `EMAIL_PROVIDER`, `EMAIL_FROM` | missing | missing |
| `RESEND_API_KEY` | missing | present |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (one pair per environment) | missing | missing |
| `JOBS_SECRET`, `UNSUBSCRIBE_SECRET` | missing | missing |
| `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY` | missing | missing |
| `BILLING_PROVIDER` | missing | missing |
| `STRIPE_SECRET_KEY` | missing | present (mode unverified; live billing stays off) |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_CONFIG_FULL`, `STRIPE_PORTAL_CONFIG_BILLING` | missing | missing |
| `GEOCODER_PROVIDER`, `WEATHER_PROVIDER`, `NWS_USER_AGENT` | missing | missing |
| `LINK_SAFETY_PROVIDER`, `WEB_RISK_API_KEY` | missing | missing |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | missing | missing |

Leave these unset in the cloud: `LOCAL_STORAGE_DIR` and `CHILD_SAFETY_STUB_HASHES`. In
production, also leave `ALLOW_OPERATOR_WITHOUT_PASSKEY` unset.

The founder decisions keep live billing off, so preview uses `BILLING_PROVIDER=stub` or an
`sk_test_` key. The runbook says the generated secrets (`JOBS_SECRET`, `UNSUBSCRIBE_SECRET`, VAPID
keys, database passwords) were put directly into Vercel. Doppler cannot show whether that happened.

## 5. CI, deploys and operator credentials (not read by the app)

GitHub environment secrets read by the workflows. Each should live in Doppler `ops` and reach
GitHub by sync or Doppler OIDC. **All are missing from Doppler.**

| Name | Used by |
|---|---|
| `PREVIEW_DATABASE_URL` | `migrate-preview.yml`, GitHub environment `preview` |
| `PROD_DATABASE_URL`, `VERCEL_DEPLOY_HOOK_PROD` | `release.yml`, GitHub environment `production` |
| `GITLEAKS_LICENSE` | `ci.yml`. Optional; only needed under an organization account. |

`GITHUB_TOKEN` is supplied automatically.

Operator scripts take the config of the environment they target:

- `pnpm ops:bootstrap-owner`: `DATABASE_URL`, `CLERK_SECRET_KEY`
- `pnpm ops:founding-codes`: `DATABASE_URL`
- `pnpm stripe:seed`: `BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`. It prints the two
  `STRIPE_PORTAL_CONFIG_*` names to store.

Names in `prd` today that the app never reads:

- **Account tokens that belong in `ops`:** `GODADDY_API_KEY`, `GODADDY_API_KEY_CLASSIC`,
  `GODADDY_API_SECRET`, `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG`, `POSTHOG_PERSONAL_API_KEY`. Syncing `prd` to Vercel as it is now would expose
  them.
  - `SUPABASE_ACCESS_TOKEN` is not `SUPABASE_SERVICE_ROLE_KEY`.
  - `SENTRY_AUTH_TOKEN` is not `SENTRY_DSN`.
  - `POSTHOG_PERSONAL_API_KEY` must never be renamed to `NEXT_PUBLIC_POSTHOG_KEY`.
- **`STRIPE_SECRET_KEY_TEST`:** a test key belongs in `dev` and `stg` under the name
  `STRIPE_SECRET_KEY`.

Platforms and tools set these, so never configure them: `NODE_ENV`, `NEXT_RUNTIME`, `VITEST`, `CI`.

## What is missing today

| Config | Missing | Blocks |
|---|---|---|
| `dev` | Everything | E2E (Clerk development pair) and real-provider local runs. Not plain local dev: the example file covers that. |
| `stg` | Everything | Any preview or staging deploy |
| `prd` | Every runtime name except `ANTHROPIC_API_KEY`, `CLERK_SECRET_KEY`, `RESEND_API_KEY` and `STRIPE_SECRET_KEY` | Production |
| `ops` | Everything | It should hold the eight account tokens now in `prd` and the three workflow secrets |

An agent that hits one of these gaps records the variable name and the config on the issue and
keeps working. It never asks for or pastes a value.
