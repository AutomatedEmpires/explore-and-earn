# Explore&Earn — Integration Provisioning State

> Audited: 2026-06-05 | Agent: Claude Code (Sonnet 4.6)
>
> All values go in **Doppler** (never committed). This doc records what is provisioned vs. pending
> and what config values to enter. Public/non-secret values are shown here; secrets must be
> obtained from each service dashboard and entered only in Doppler.

---

## Status legend

| Icon | Meaning |
|------|---------|
| ✅ | Provisioned and confirmed |
| ⚠️ | Partially provisioned — action needed |
| ❌ | Not yet provisioned |
| 🔒 | Blocked by founder approval gate |

---

## 1. Supabase (DB + Storage)

**Status:** ✅ Project exists, ACTIVE_HEALTHY — ⚠️ zero migrations applied remotely

| Field | Value |
|-------|-------|
| Project name | `explore&earn` |
| Ref / project ID | `mamosbzcbigcclafhmmr` |
| Region | `us-west-2` |
| DB host | `db.mamosbzcbigcclafhmmr.supabase.co` |
| PostgreSQL version | 17.6.1 |
| Project URL | `https://mamosbzcbigcclafhmmr.supabase.co` |
| Anon key (public) | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1hbW9zYnpjYmlnY2NsYWZobW1yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0NDczMDAsImV4cCI6MjA5NjAyMzMwMH0.0JCzmqGKYHLvvlspz-LNi1W66uWSufx7q17nF3h5H7E` |
| Publishable key | `sb_publishable_alxMOBFcsCMuTeI5nw_BdA_NzoelpTo` |
| Applied migrations | **0** (remote DB is empty) |
| Tables | **0** (no schema deployed) |

**Doppler keys to populate:**

```
NEXT_PUBLIC_SUPABASE_URL=https://mamosbzcbigcclafhmmr.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci... (full anon key above)
SUPABASE_PROJECT_REF_STAGING=mamosbzcbigcclafhmmr
SUPABASE_SERVICE_ROLE_KEY=<from Supabase dashboard → Project Settings → API>
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-us-west-2.pooler.supabase.com:6543/postgres
```

**Pending — 🔒 db-destructive gate:**

The repo has 8+ migration files on `origin/main`. They have NOT been applied to the remote
Supabase project. Run after founder approval:

```bash
cd /home/jackson/automatedempires/ventures/explore-and-earn
supabase link --project-ref mamosbzcbigcclafhmmr
supabase db push
```

---

## 2. Vercel (hosting)

**Status:** ❌ No project created yet

| Field | Value |
|-------|-------|
| Team | AutomatedEmpires |
| Team ID | `team_0IgwjPKkR3NmPUC5ugTK3cfi` |
| Team slug | `jackson-coles-projects-dd76106c` |
| Projects | **0** |

**Action required (manual):**

```bash
cd /home/jackson/automatedempires/ventures/explore-and-earn
vercel link --scope jackson-coles-projects-dd76106c
# Select: create new project → explore-and-earn
# Root directory: apps/web
# Framework: Next.js
```

After linking, configure environment variables in Vercel dashboard or via CLI:

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
# ... all keys from .env.example
```

**Doppler keys to populate:**

```
VERCEL_TOKEN=<from vercel.com → Account Settings → Tokens>
```

---

## 3. Clerk (auth)

**Status:** ❌ No MCP access — manual dashboard setup required

**Cross-app standard locked 2026-06-04 (Notion D013). Replaces Supabase Auth.**

**Action required:**

1. Go to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application named `explore-and-earn`
3. Enable sign-in methods (email, social: Google, Apple recommended)
4. Configure allowed origins: `https://exploreandearn.com`, `https://exploreandearn.vercel.app`, `http://localhost:3000`
5. Set redirect URLs for sign-in/sign-up: `/` (or onboarding route once built)
6. Get keys from **API Keys** tab

**Doppler keys to populate:**

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...  (after creating webhook endpoint in Clerk dashboard)
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
```

**SDK wiring needed in code:**
- `ClerkProvider` in `apps/web/app/layout.tsx`
- `clerkMiddleware` in `middleware.ts` (PR #102 adds this — pending merge)

---

## 4. Mapbox (maps / geo)

**Status:** ❌ No MCP access — manual token creation required

**Cross-app standard locked 2026-06-04 (Notion D013). Replaces Azure Maps.**

**Action required:**

1. Go to [account.mapbox.com](https://account.mapbox.com)
2. Create a new public token named `explore-and-earn-web`
   - Scopes: `styles:read`, `tiles:read`, `geocoding:read` (minimum for discovery map)
3. Optionally create a secret token for server-side use

**Doppler keys to populate:**

```
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1...  (public token, safe for browser)
MAPBOX_ACCESS_TOKEN=sk.eyJ1...       (secret token for server, if needed)
```

---

## 5. Stripe (payments)

**Status:** ✅ Account exists — ⚠️ 0 products, currently in live mode

| Field | Value |
|-------|-------|
| Account ID | `acct_1RMjIWIH4Hw2pSG9` |
| Display name | Explore&Earn |
| Live balance | $0 |
| Products | **0** (no test catalog created) |

**Important:** Use test mode keys (`sk_test_`, `pk_test_`) until go-live. The Stripe dashboard
API keys tab has both live and test key pairs.

**Doppler keys to populate:**

```
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  (from Stripe dashboard → Webhooks → local or hosted endpoint)
```

**Pending — 🔒 money/pricing gate:**

No test products exist yet. Needs a product catalog decision before creation:
- Listing boost (one-time)
- Application fee (per transaction)
- Subscription tiers (if any)

---

## 6. PostHog (product analytics)

**Status:** ✅ Project exists and configured

| Field | Value |
|-------|-------|
| Project | `exploreandearn` |
| Project ID | `291166` |
| Org ID | `019b3aba-2d00-0000-7e09-4aac88c36392` |
| Region | `us.posthog.com` |
| Project API token (public) | `phc_67Nw1vQub5gHQITDXnsD81CuWdng9piIzPUv27hGb8r` |
| SDK installed | **No** (`completed_snippet_onboarding: false`) |
| Events ingested | Yes (from manual testing) |
| App URLs configured | `exploreandearn.com`, `exploreandearn.vercel.app` |
| Session replay | Enabled (30-day retention) |
| Web vitals autocapture | Enabled |

**Doppler keys to populate:**

```
NEXT_PUBLIC_POSTHOG_KEY=phc_67Nw1vQub5gHQITDXnsD81CuWdng9piIzPUv27hGb8r
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
POSTHOG_PERSONAL_API_KEY=phx_...  (from PostHog → Account Settings → Personal API Keys)
```

**SDK wiring needed in code:**
- Add `posthog-js` to `apps/web/package.json`
- Wrap root layout or `_app.tsx` with PostHog provider
- Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` env vars

---

## 7. Sentry (error monitoring)

**Status:** ✅ Project just created (2026-06-05)

| Field | Value |
|-------|-------|
| Organization | `automated-empires` |
| Project name | `explore-and-earn` |
| Project slug | `explore-and-earn` |
| Project ID | `4511510781624320` |
| Platform | `javascript-nextjs` |
| DSN (public) | `https://b8cdf7a2ec0e39df6ba3257885215bbc@o4509295717711872.ingest.us.sentry.io/4511510781624320` |

**Doppler keys to populate:**

```
SENTRY_DSN=https://b8cdf7a2ec0e39df6ba3257885215bbc@o4509295717711872.ingest.us.sentry.io/4511510781624320
SENTRY_AUTH_TOKEN=sntrys_...  (from Sentry → Settings → Auth Tokens → Create new token)
```

**SDK wiring needed in code:**

```bash
cd apps/web
npx @sentry/wizard@latest -i nextjs
# Follow prompts — will create sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
```

---

## 8. Cloudinary (public image delivery)

**Status:** ❓ Account status unknown (MCP auth needed)

**Action required:**

1. Go to [cloudinary.com](https://cloudinary.com) → Dashboard
2. Copy cloud name, API key, API secret
3. Copy `CLOUDINARY_URL` (format: `cloudinary://api_key:api_secret@cloud_name`)

**Doppler keys to populate:**

```
CLOUDINARY_URL=cloudinary://...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=<your-cloud-name>
CLOUDINARY_API_KEY=<api-key>
CLOUDINARY_API_SECRET=<api-secret>
```

---

## 9. Resend (transactional email)

**Status:** ❓ Account status unknown — no MCP available

**Action required:**

1. Go to [resend.com](https://resend.com) → API Keys
2. Create key named `explore-and-earn`
3. Verify sending domain `exploreandearn.com` (DNS TXT + MX records)

**Doppler keys to populate:**

```
RESEND_API_KEY=re_...
```

---

## 10. Doppler (secrets manager)

**Status:** ❓ CLI not yet linked to this repo

**Action required:**

```bash
cd /home/jackson/automatedempires/ventures/explore-and-earn

# Authenticate (one-time)
doppler login

# Link this repo to the E&E project/config
doppler setup
# Select project: explore-and-earn (or create it)
# Select config: dev

# Populate all keys:
doppler secrets set NEXT_PUBLIC_SUPABASE_URL "https://mamosbzcbigcclafhmmr.supabase.co"
doppler secrets set NEXT_PUBLIC_SUPABASE_ANON_KEY "eyJ..."
doppler secrets set NEXT_PUBLIC_POSTHOG_KEY "phc_67Nw1vQub5gHQITDXnsD81CuWdng9piIzPUv27hGb8r"
doppler secrets set NEXT_PUBLIC_POSTHOG_HOST "https://us.posthog.com"
doppler secrets set SENTRY_DSN "https://b8cdf7a2ec0e39df6ba3257885215bbc@o4509295717711872.ingest.us.sentry.io/4511510781624320"
# ... then all remaining keys from each service above

# Run dev with injected secrets
doppler run -- pnpm dev
```

---

## 11. Streamline HQ (icon system)

**Status:** ⚠️ Account exists (jackson@automatedempires.com, Full Access $59/mo) — VS Code extension not yet installed

**Action required:**

1. In VS Code: Extensions → search "Streamline" → install **Streamline HQ Icons**
2. Use the extension to search/preview Freehand icons one at a time
3. Export SVG for each icon into `.streamline/` (gitignored) in the repo root
4. The `<Icon name="domain.name" />` component loads from `.streamline/` when `STREAMLINE_LOCAL_ASSETS=1`

**Never commit `.svg`/`.png` paid asset files to this public repo.**

See `EXPLORE_AND_EARN_STREAMLINE_ASSET_PLAN.md` for the first 20-icon pull plan.

---

## Summary: Next Actions by Owner

### Jackson (manual)

| # | Action | Service | Gate |
|---|--------|---------|------|
| 1 | `doppler login && doppler setup` in repo | Doppler | — |
| 2 | Create Clerk app, get keys | Clerk | — |
| 3 | Create Mapbox token | Mapbox | — |
| 4 | Get Cloudinary cloud name + keys | Cloudinary | — |
| 5 | Get Resend API key, verify domain | Resend | — |
| 6 | Get Stripe test mode keys + webhook secret | Stripe | — |
| 7 | `vercel link` + configure env vars | Vercel | — |
| 8 | `supabase link` + `supabase db push` | Supabase | 🔒 db-destructive |
| 9 | Design Stripe product catalog + create test products | Stripe | 🔒 money/pricing |
| 10 | Install Streamline VS Code extension, wire first icons | Streamline | — |

### Engineering (code changes needed)

| # | Work | Branch |
|---|------|--------|
| 1 | Wire Clerk `ClerkProvider` + `clerkMiddleware` | `auth/clerk-provider-wiring` |
| 2 | Wire PostHog SDK (`posthog-js`) | `analytics/posthog-sdk-wiring` |
| 3 | Wire Sentry (`@sentry/wizard`) | `observability/sentry-sdk-wiring` |
| 4 | Wire Mapbox in discovery/map surfaces | `feature/mapbox-discovery-map` |
| 5 | Apply CLAOS webhook env vars to CI/Doppler | `ci/claos-env-sync` |
