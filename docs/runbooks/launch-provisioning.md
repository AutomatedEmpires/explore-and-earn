# Launch Provisioning Runbook

The ordered, founder-executed steps to take Explore & Earn from "code-ready" to
"selling in production". Everything here is **outside the codebase** — dashboards,
secrets, and one-time setup that an agent cannot do. Code is already wired (Phase
1) and the Stripe catalog is one command (Phase 2).

> Secrets source of truth is **Doppler** (`.env.example` documents every name).
> Set values in Doppler → sync to Vercel, or set directly in Vercel Project →
> Settings → Environment Variables. Set **Production AND Preview** — preview
> deployments are publicly reachable and enforce the same auth.

Current state (2026-06-30): Phase 1 merged to a feature branch (not `main` yet);
domains `exploreandearn.com` + `www` are attached; the Vercel project has **no
production deployment yet** (`live: false`, latest deploy is a preview). Migration
049 is committed but **not yet applied** to prod.

---

## 1. Supabase (DB) — likely already done

RLS is live and verified. Confirm these are set: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. The service-role key
powers the admin panel + the expire-listings cron; the app **throws at boot**
without the first three.

## 2. Clerk (auth) — the highest-risk step

The entire RLS model depends on Clerk minting a Supabase-compatible JWT. If this
is wrong, every authed DB read/write fails (or, worse, silently returns nothing).

1. Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
   `CLERK_WEBHOOK_SECRET`, `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
   `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`.
2. **Create the JWT template named exactly `supabase`** (Clerk → Configure → JWT
   Templates → New → Supabase). The app calls `getToken({ template: "supabase" })`
   everywhere; the name must match.
   - **Signing key = the Supabase project's JWT secret** (Supabase → Settings →
     API → JWT Settings → JWT Secret), HS256. PostgREST must be able to verify it.
   - Claims must include **`"role": "authenticated"`** (so PostgREST applies the
     `authenticated` RLS policies) and carry **`sub` = the Clerk user id** (Clerk's
     default). The RLS helpers key ownership on `auth.jwt() ->> 'sub'`.
3. Point the Clerk **webhook** at `https://exploreandearn.com/api/webhooks/clerk`
   (events: `user.*`); the signing secret is `CLERK_WEBHOOK_SECRET`.
4. Set **`ADMIN_CLERK_USER_ID`** to the founder's Clerk user id (admin panel fails
   closed — denies everyone — when unset).

Verify: sign in on a preview deploy, open `/seek` and `/profile`; if listings/data
load, the template is correct.

## 3. Stripe (payments)

1. Set `STRIPE_SECRET_KEY` (test key first), `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.
2. **Seed the catalog** (idempotent — see `packages/stripe-seed/README.md`):
   ```bash
   pnpm --filter @explore-and-earn/stripe-seed seed > stripe.env   # uses $STRIPE_SECRET_KEY
   ```
   Paste the printed `STRIPE_PRICE_*` block into Vercel. The 9 required vars
   (`requireEnv` throws at checkout without them): `STRIPE_PRICE_{STARTER,
   PROFESSIONAL,ENTERPRISE}_{MONTHLY,YEARLY}` + `STRIPE_PRICE_ANNOUNCEMENT_{7D,14D,
   28D}`. `STRIPE_PRICE_BOOST_*` are optional (inline `price_data` fallback).
3. Create a Stripe **webhook** → `https://exploreandearn.com/api/webhooks/stripe`,
   events: `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`. Copy the
   signing secret to **`STRIPE_WEBHOOK_SECRET`** (the webhook returns 503 until set).
4. Run a **test-mode checkout end-to-end** before switching to live keys. Then
   repeat the seed + webhook with the `sk_live_` key.

> Drift note: `pricing.ts` `ADDON_PRICING.additionalAnnouncement` is a newer
> "$149 flat / 7-day" directive, but the live announcement code
> (`contracts/community.ts` `ANNOUNCEMENT_PRICING`) still charges 7/14/28-day at
> $150/$250/$350 and the seed matches the **code**. Reconcile before relying on
> announcement revenue.

## 4. Vercel env matrix (Production + Preview)

Beyond the Supabase/Clerk/Stripe vars above, set: `NEXT_PUBLIC_MAPBOX_TOKEN`
(+ `MAPBOX_ACCESS_TOKEN`), `NEXT_PUBLIC_POSTHOG_KEY` + `NEXT_PUBLIC_POSTHOG_HOST`,
`SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`/
`SENTRY_AUTH_TOKEN` for source maps), `RESEND_API_KEY`, **`CRON_SECRET`** (the
expire-listings cron 401s without it — Vercel injects it as the cron's Bearer
automatically once set), and `NEXT_PUBLIC_APP_URL=https://exploreandearn.com`
(production) / the preview URL (preview).

Boot-critical (app 500s / throws if missing): the three Supabase vars, both Clerk
keys (middleware throws at boot in production), and the Stripe price/secret/webhook
vars at checkout time. Verify with `vercel env ls production`.

## 5. Migration 049

Applies automatically via `.github/workflows/db-migrate.yml` on merge to `main`
(gated by the `production` GitHub Environment reviewer). Verify afterward that
`supabase_migrations.schema_migrations` contains `049`, or that
`host_announcements.stripe_checkout_session_id` exists. Do not hand-apply unless
the pipeline is unavailable.

## 6. GitHub branch protection

On `main`: require **≥1 approving review** and enable **"Include administrators"**
(`enforce_admins`). Today red CI can be merged and admins bypass checks — close
both before launch so a broken build can't reach production.

## 7. Deploy to production

The project has no production deployment yet. Merge the launch branch(es) to
`main`, then promote the resulting build to Production in Vercel (or `vercel
--prod`). Confirm `exploreandearn.com` serves the new build.

## 8. CSP → enforcing (after a report-only window)

CSP currently ships **Report-Only** (it logs violations to Sentry via
`/api/csp-report` but blocks nothing). To enforce:
1. Find the **production Clerk Frontend-API host** (Clerk → API Keys → "Frontend
   API", e.g. `clerk.exploreandearn.com`) and add it to `script-src` **and**
   `connect-src` in `apps/web/next.config.ts` — an enforcing policy without it
   white-screens the whole app.
2. Deploy, watch `/api/csp-report` (Sentry) across sign-in / map / swipe / listing
   / billing for a real-traffic window with zero blocking violations.
3. Rename the header key `Content-Security-Policy-Report-Only` →
   `Content-Security-Policy`.

## 9. Go-live smoke test (on production)

1. A real host signs up → completes host onboarding → creates a listing →
   **Submit for review**.
2. Admin (you) approves it → it appears live in `/seek` + `/map`.
3. A seeker signs up → applies → host sees the applicant → host messages them →
   seeker replies.
4. A host subscribes (live Stripe) → tier syncs; do one refund to confirm the
   admin refund path.

Inventory is **real hosts only** — no seed/demo data in production. Pair this
runbook with the founding-host acquisition plan to populate the marketplace.
