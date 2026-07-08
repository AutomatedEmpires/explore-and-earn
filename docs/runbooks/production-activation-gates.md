# Production Activation Gates — Explore & Earn

> Prepared 2026-07-07 by the repo-resident agent. This is the single control
> surface for the four remaining infrastructure gates. **No secret or
> cryptographic values appear here** (this repo is public) — only names,
> locations, and steps. Fetch actual values from the named dashboards/CLIs at
> execution time.
>
> Infrastructure already verified operating: database, PostHog, Sentry, Resend
> API key + delivery, cron. The workspace-level `PORTFOLIO_ACTIVATION_STATE.md`
> (Automated Empires portfolio control surface, maintained outside this repo)
> holds the cross-product Explore & Earn entry.

---

## GATE A — Production Clerk instance (top launch blocker)

**Problem:** production runs the **development** Clerk instance
`calm-panther-70.clerk.accounts.dev` (`pk_test_…`). Dev instances have a low
user cap, a shared/"development" OAuth consent screen, and the dev banner. A
dedicated **production** Clerk instance is required for real auth at scale.

### A1. What the app actually consumes (full inventory — no rediscovery needed)

**Environment variables** (server reads `process.env`, client reads inlined `NEXT_PUBLIC_*`):

| Variable | Scope | In Vercel prod now? | Action on migration |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | client | ✅ (dev `pk_test_…`) | **Replace** with prod `pk_live_…` |
| `CLERK_SECRET_KEY` | server | ✅ (dev `sk_test_…`) | **Replace** with prod `sk_live_…` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | client | ✅ = `/sign-in` | Keep (path unchanged) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | client | ✅ = `/sign-up` | Keep (path unchanged) |
| `CLERK_WEBHOOK_SECRET` | server | ❌ **absent** | **Add** — Svix signing secret from the prod instance's webhook endpoint |
| `ADMIN_CLERK_USER_ID` | server | ❌ absent | **Add** — the founder's **new** prod Clerk `user_…` id (see A6) |

`ClerkProvider` is bare (`apps/web/app/layout.tsx:71`) — it reads the
publishable key from env, so no code change there. Sign-in uses
`forceRedirectUrl={redirect_url}` from the query string
(`apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx`).

**Doppler** (`explore-and-earn`): `dev` config holds the four dev Clerk values;
`prd` config is empty. Mirror the production values into `prd` for durability.

### A2. Domains / DNS (Clerk custom domain)

A production Clerk instance needs a custom **Frontend API** domain. Clerk emits
CNAME records to add at GoDaddy (authoritative DNS for `exploreandearn.com`):

- `clerk.exploreandearn.com` → Clerk Frontend API
- `accounts.exploreandearn.com` → Clerk Account Portal
- `clkmail.exploreandearn.com` (+ two DKIM `cl._domainkey…` CNAMEs) → Clerk email

Add them in the Clerk dashboard's "Add domain" flow; it verifies automatically.

### A3. OAuth / social providers ⚠️

The code contains **no** OAuth provider config — social sign-in is entirely
dashboard-managed on the instance. Production Clerk **cannot** use Clerk's shared
dev OAuth credentials: every social provider enabled on the dev instance
(check the dashboard — at minimum Google, given `accounts.google.com` is in the
CSP `frame-src`) must be **re-created on the prod instance with real OAuth app
credentials** (Google Cloud OAuth client id/secret, redirect URI
`https://clerk.exploreandearn.com/v1/oauth_callback`). This is the most common
production-Clerk footgun.

### A4. Supabase JWT template ⚠️⚠️ (breaks ALL authed data access if missed)

The app calls `getToken({ template: "supabase" })` in 10+ places
(`apps/web/lib/serverCache.ts:45`, every `(host)/*` page, `app/actions/messages.ts`,
`app/actions/swipe.ts`, `app/host/[id]/page.tsx`, …). This mints a Supabase-RLS
JWT. The new prod instance **must recreate a JWT template named exactly
`supabase`**:

- Signing algorithm **HS256**, signing key = the **Supabase project's JWT secret**
  (Supabase dashboard → Project `mamosbzcbigcclafhmmr` → Settings → API → JWT Settings).
- Claims must include `"role": "authenticated"` (RLS policies check
  `auth.jwt()->>'sub'` for the Clerk user id — Clerk includes `sub` automatically).

Without this template, every host/seeker data read and write returns empty or
denied. Zero code change required if the template name + claims match.

### A5. Webhook

Endpoint: `POST https://exploreandearn.com/api/webhooks/clerk` (already public in
middleware). Handler verifies Svix signatures and consumes exactly three events —
subscribe **only** these on the prod instance's webhook:

- `user.created` → inserts `users_profile_shadow` + `seeker_profiles` (+ best-effort welcome email)
- `user.updated` → updates cached email
- `user.deleted` → soft-deletes (`deleted_at`)

Copy the endpoint's **Signing Secret** into `CLERK_WEBHOOK_SECRET` (Vercel prod + Doppler `prd`).
Until this is set, the handler throws and **new signups never get a `seeker_profiles` row**.

### A6. Migration execution order (once the prod instance exists)

1. In Clerk dashboard: create/switch the E&E application to **Production**; add the A2 domains (add DNS at GoDaddy; verify).
2. Configure A3 OAuth providers (real credentials) and the A4 `supabase` JWT template.
3. Create the A5 webhook endpoint (3 events) → capture its signing secret.
4. Vercel prod (and Doppler `prd`): replace `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` with the `…_live_…` pair; add `CLERK_WEBHOOK_SECRET`.
5. Code: update `next.config.ts` CSP to add the prod Clerk domain (`https://clerk.exploreandearn.com`) to `script-src` / `connect-src` / `frame-src` (`*.clerk.com` is already allowed; `*.clerk.accounts.dev` can be dropped after cutover). This is the only required code change — ship via PR.
6. Redeploy production.
7. **Founder signs in once** on the prod instance → capture his new `user_…` id → set `ADMIN_CLERK_USER_ID` (Vercel prod) → redeploy so `/admin` unlocks.

### A7. Live verification (definition of done for Gate A)

- `curl -s https://exploreandearn.com/sign-in` bundle shows a `pk_live_…` key decoding to `clerk.exploreandearn.com` (not `*.accounts.dev`).
- Real signup → `user.created` webhook 200 → row appears in `seeker_profiles` (verify via SQL).
- Sign-in / sign-out / seeker-protected route / host-protected route / host-onboarding gate + return path all pass on the real domain.
- An authed host page loads data (proves the `supabase` JWT template works end to end).

---

## GATE B — Migration-ledger reconciliation (bookkeeping only; needs founder approval)

`db push` fails because the prod ledger diverges from the numbered convention.
The fix is `supabase migration repair`, which **only writes the
`supabase_migrations.schema_migrations` table — it never executes migration
SQL.** The schema is byte-identical before and after. The dry-run reconciliation
is enumerated below.

**Mark APPLIED (9)** — numbered files whose schema is already present under a
timestamp version (1:1 name match):

```text
049 announcement_checkout_idempotency   050 message_conversation_rls_hardening
051 matching_fields                     052 match_scores
053 assistant_threads                   054 host_spam_report_flagging
055 assistant_threads_host              056 host_profiles_public_tier_read
057 listing_passes
```

**Mark REVERTED (33)** — legacy timestamp rows (24 pre-numbering originals +
reconcile migrations, whose schema is subsumed by applied 001–048; and the 9
July-06 rows that are 049–057's content under timestamp names):

```text
20260606002452 20260606005108 20260606011452 20260606011530 20260606032746
20260606035409 20260606040420 20260606040823 20260606060012 20260607010310
20260607014403 20260607030038 20260607030129 20260607030139 20260607030206
20260607030718 20260612183547 20260612191021 20260625011121 20260625011401
20260625011515 20260625011632 20260625011808 20260625011942 20260706204154
20260706212154 20260706212225 20260706212300 20260706212323 20260706212356
20260706212437 20260706212459 20260706213005
```

**Exact commands** (run against the session pooler; `$DBURL` = the corrected
pooler URL — see `SUPABASE_DB_URL` GH secret / Doppler `dev` `DATABASE_URL`):

```bash
supabase migration repair --status applied 049 050 051 052 053 054 055 056 057 --db-url "$DBURL"
supabase migration repair --status reverted 20260606002452 20260606005108 20260606011452 \
  20260606011530 20260606032746 20260606035409 20260606040420 20260606040823 20260606060012 \
  20260607010310 20260607014403 20260607030038 20260607030129 20260607030139 20260607030206 \
  20260607030718 20260612183547 20260612191021 20260625011121 20260625011401 20260625011515 \
  20260625011632 20260625011808 20260625011942 20260706204154 20260706212154 20260706212225 \
  20260706212300 20260706212323 20260706212356 20260706212437 20260706212459 20260706213005 --db-url "$DBURL"
supabase migration list --db-url "$DBURL"   # expect: Local == Remote for 001-057, no orphans
```

Then re-run the CI: `gh workflow run db-migrate.yml --ref main` → expect green
(`db push` = "up to date", no-op). **Definition of done:** db-migrate CI green.

---

## GATE C — Resend sending domain (needs GoDaddy DNS access)

Domain `exploreandearn.com` is **registered** in Resend (status `not_started`).
`RESEND_API_KEY` is verified working and a real delivery was proven. Three DNS
records must be added at **GoDaddy** (authoritative DNS; `exploreandearn.com` is
**not** Vercel-managed, so Vercel can't add them), then verified:

| Type | Host | Value (fetch from Resend dashboard / `GET /domains/{id}`) |
| --- | --- | --- |
| TXT | `resend._domainkey` | DKIM public key (long `p=…` value — not reproduced here) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |
| MX  | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |

After the records propagate, verify the domain in Resend. Then production sends
from the default `notifications@exploreandearn.com` with no code change. (Until
then, `RESEND_FROM_EMAIL` could point at an already-verified domain as a stopgap,
but none exists yet.) **Definition of done:** Resend domain `verified` + a real
send from `@exploreandearn.com` delivered. No repo access to GoDaddy DNS exists
in this environment → founder action (or grant a GoDaddy API key).

---

## GATE D — Stripe account identification (do NOT wire until proven)

Production's `STRIPE_SECRET_KEY` is **not** the CLI's account
(`acct_1RMjIWIH4Hw2pSG9`, test) — proven: a signed webhook the prod key
processed returned 404 "No such customer" for a customer that **exists** in the
CLI account. Also, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is **used nowhere in the
code** (checkout is Stripe-hosted redirect), so there is **no public artifact**
that reveals prod's Stripe account. Current honest state preserved: webhook 503,
prices unset.

**Strong inference (unverified):** the shared founder account
`acct_1SpxXpDtcwz0cxzo` — identified by the Sweepza pass as KYC-complete
(`charges_enabled`/`payouts_enabled`/`details_submitted` true) and noted as
"also used by E&E" — in **live** mode.

**Exact evidence required to prove ownership (any ONE is sufficient):**

1. The account behind prod's `STRIPE_SECRET_KEY`. Authoritative check: run
   `stripe get /v1/account --api-key <prod STRIPE_SECRET_KEY>` (or
   `stripe accounts retrieve`) — the returned `id` + `livemode` prove the
   account and mode directly (better than eyeballing the `…_(live|test)_51…`
   key segment, which only encodes the account, not the mode). *Most direct.*
2. In the Stripe dashboard for the candidate account, a webhook endpoint or
   customer/product referencing `exploreandearn.com`.
3. A restricted key on the intended account granted to the CLI, so the agent can
   verify the tie and provision.

**Provisioning plan once proven (live account, KYC done):** create E&E-namespaced
live products/prices matching the founder-locked contract (Starter $199/$1990,
Professional $399/$3990, Enterprise $749/$7490 monthly/yearly; Announcement $149
one-time) + a live webhook → `https://exploreandearn.com/api/webhooks/stripe`
(events: `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`);
set `STRIPE_WEBHOOK_SECRET` + the 6 tier price ids + `STRIPE_PRICE_ANNOUNCEMENT`
(and matching `…_live_…` secret/publishable keys) in Vercel prod + Doppler `prd`;
redeploy; prove checkout→webhook→subscription→entitlement→billing UI (test-mode
first, then one real founder charge). **Definition of done:** correct account
identified + real billing proven.
