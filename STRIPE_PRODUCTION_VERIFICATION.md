# Stripe Production Verification — Explore&Earn

_Verified 2026-06-15 on branch `restyle/premium-design-system`. Account/env confirmed via the
local Stripe CLI + Doppler CLI. **No secret values are printed in this document.**_

> **Bottom line:** The Stripe *code* is production-grade and fails closed safely. The Stripe
> *account is confirmed* (Explore&Earn, `acct_1RMj…`). But the **catalog is empty** (0 products /
> 0 prices in both test and live), and the live env (Doppler `dev`) is **missing the webhook secret
> and all 9 price IDs**. Billing therefore cannot function until the founder provisions the catalog
> + env. One latent code bug (redirect-in-try) was found and fixed. See verdict (§11).

---

## 1. Exact files inspected

| File | Role |
|---|---|
| `apps/web/services/stripe/index.ts` | Stripe client, checkout, announcement checkout, portal, webhook handlers, tier sync |
| `apps/web/app/api/webhooks/stripe/route.ts` | Webhook endpoint (sig verify, 503 when unconfigured) |
| `apps/web/app/actions/hostBilling.ts` | `startHostCheckoutAction`, `startHostBillingPortalAction` (**bug fixed here**) |
| `apps/web/app/(host)/host/billing/page.tsx` + `.module.css` | Billing UI, plan cards, config-gated CTAs |
| `packages/contracts/src/pricing.ts` | `FOUNDER_LOCKED_PRICING`, `FOUNDING_LOCKED_PRICING`, `PLAN_ENTITLEMENTS`, `ADDON_PRICING`, invite packs |
| `packages/contracts/src/community.ts` | `ANNOUNCEMENT_PRICING` (7d/14d/28d) |
| `packages/stripe-seed/expected-stripe-manifest.json` | **Still a placeholder** (catalog seeding TODO) |
| `tools/scripts/verify-stripe-manifest.mjs` | Manifest drift guardrail |
| `tools/eslint-plugin-explore-and-earn/rules/no-direct-stripe-refund.ts` | Governance: blocks direct refunds in code |
| `.env.example` | Documents Stripe vars (price IDs added in prior session) |

**Tooling present:** Stripe CLI `1.42.1`, Doppler CLI `3.76.0`, Vercel CLI — all installed.

---

## 2. Stripe account / environment confirmed

- **Account:** `acct_1RMj…` — display name **"Explore&Earn"** (confirmed via `stripe config --list`).
- **CLI profiles:** two local profiles (`[default]` and `['explore&earn']`) both resolve to the **same
  account** `acct_1RMj…`. The CLI is correctly connected to the Explore&Earn account.
- **Keys on the CLI:** both **test** and **live** API keys exist, expiring **2026-08-28 / 2026-08-31**.
- **App runtime mode (Doppler `dev` config):** **TEST** — verified secret-safe by reading only the
  `STRIPE_SECRET_KEY` prefix (`sk_test…`) via `doppler run`. Matches `.env.example` ("test mode until go-live").

> ⚠️ **Operational security note:** `stripe config --list` prints the **test-mode secret key in full**
> (it masks only live keys). Treat that command's output as sensitive. If there is any concern it was
> exposed, rotate the **test-mode** key in the Stripe dashboard (low risk — test keys cannot move real
> money — but good hygiene). This document and all logs have keys redacted.

---

## 3. Required env vars

| Var | Consumer | In Doppler `dev`? |
|---|---|---|
| `STRIPE_SECRET_KEY` | `getStripeClient()` | ✅ present (test) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | client | ✅ present |
| `STRIPE_WEBHOOK_SECRET` | `verifyStripeWebhookEvent`, `hasStripeServerConfig` | ❌ **MISSING** |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_YEARLY` | subscription checkout | ❌ **MISSING** |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` / `_YEARLY` | subscription checkout | ❌ **MISSING** |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` / `_YEARLY` | subscription checkout | ❌ **MISSING** |
| `STRIPE_PRICE_ANNOUNCEMENT_7D` / `_14D` / `_28D` | announcement checkout | ❌ **MISSING** |

**Doppler:** project `explore-and-earn`, configs `dev`, `dev_personal`, `stg`, `prd`. The local Doppler
token is **dev-scoped** — `stg` and `prd` are **not readable here** (access boundary). `dev` and
`dev_personal` both contain only `STRIPE_SECRET_KEY` + publishable; **no webhook secret, no price IDs.**

---

## 4. Price ID inventory (live verification)

Ran `stripe products list` and `stripe prices list` against the connected account, **test and live**:

```
TEST  products: 0    prices: 0
LIVE  products: 0    prices: 0
```

**There are no products or prices in the Explore&Earn Stripe account in either mode.** Consequently
none of the 9 `STRIPE_PRICE_*` IDs can resolve to a real price — the catalog must be created first.

---

## 5. Product / price mapping (the spec to provision — from the founder-locked contract)

Money is **integer cents** (guardrail G1/G23). Annual = exactly 10× monthly ("2 months free").

**Host subscriptions (recurring):**
| Tier | Monthly | Yearly | Env (monthly / yearly) |
|---|---|---|---|
| Starter | $199.00 | $1,990.00 | `STRIPE_PRICE_STARTER_MONTHLY` / `_YEARLY` |
| Professional | $399.00 | $3,990.00 | `STRIPE_PRICE_PROFESSIONAL_MONTHLY` / `_YEARLY` |
| Enterprise | $749.00 | $7,490.00 | `STRIPE_PRICE_ENTERPRISE_MONTHLY` / `_YEARLY` |

**Community announcements (one-time `payment`):**
| Duration | Price | Env |
|---|---|---|
| 7 days | $150.00 | `STRIPE_PRICE_ANNOUNCEMENT_7D` |
| 14 days | $250.00 | `STRIPE_PRICE_ANNOUNCEMENT_14D` |
| 28 days | $350.00 | `STRIPE_PRICE_ANNOUNCEMENT_28D` |

> **Not yet wired to Stripe env (contract-defined, no integration code yet):** Founding-host discounted
> tiers (`FOUNDING_LOCKED_PRICING`), Boost/Featured add-ons (`ADDON_PRICING`), team seats, invite-credit
> packs. These are future Build-Pack work — do **not** invent checkout for them now.

---

## 6. Checkout routes / actions

- **`startHostCheckoutAction(formData)`** (`actions/hostBilling.ts`): validates `tier`+`interval`
  (`isHostSubscriptionTier`/`isBillingInterval`), requires Clerk auth + an existing `host_profile`
  (else `?error=host_profile_missing`), then `createCheckoutSession` (mode `subscription`,
  `client_reference_id` + metadata = clerkUserId/tier, `allow_promotion_codes`, success/cancel URLs).
- **`createAnnouncementCheckoutSession`** (mode `payment`, success → `/community?...purchased=1`).
- **Fails fast on missing env:** `resolveStripePriceId`/`requireEnv` throw → caught → `?error=checkout_failed`.
- **Entry point:** `/host/billing` plan cards. **CTAs are config-gated** — when
  `hasStripeCheckoutConfig()` is false the buttons are `disabled` and the page shows "Stripe is not
  fully configured yet…". **No unsafe billing path is exposed.** ✅

## 7. Portal routes / actions

- **`startHostBillingPortalAction()`**: requires auth; `createBillingPortalSession` looks up the Stripe
  customer by `clerkUserId` metadata → email; **throws if no customer** → `?error=portal_unavailable`.
- A Stripe **Customer Portal configuration** must exist in the dashboard for the portal to open
  (founder/dashboard setup, not code).

## 8. Webhook assumptions

- Endpoint: `POST /api/webhooks/stripe` (runtime `nodejs`, in the middleware public matcher).
- Requires `stripe-signature`; verifies via `verifyStripeWebhookEvent` (needs `STRIPE_WEBHOOK_SECRET`).
- Returns **503** if `hasStripeServerConfig()` is false (current dev state), **400** on bad signature,
  **200** otherwise. Handles `checkout.session.completed`, `customer.subscription.{created,updated,deleted}`;
  syncs `host_profiles.subscription_tier` via the **service-role** client.
- **Action required:** register the endpoint URL in the Stripe dashboard (per environment) and store the
  resulting signing secret as `STRIPE_WEBHOOK_SECRET` in Doppler `dev`/`stg`/`prd`.

## 9. Local / preview / production differences

- **Local/dev (verified):** TEST key present; **webhook secret + price IDs absent** → billing disabled
  (safe). 
- **Staging/prod (Doppler `stg`/`prd`):** **could not verify** — local token is dev-scoped. The founder
  must confirm these configs contain `STRIPE_WEBHOOK_SECRET` + all 9 `STRIPE_PRICE_*`, and that Vercel's
  Preview/Production env is wired to the matching Doppler config + the intended **test-vs-live** account.
- **Vercel project:** `explore-and-earn` (rootDirectory `apps/web`) — confirmed via `.vercel/project.json`.

## 10. Blockers requiring founder action (with exact steps)

**BLOCKER B1 — Stripe catalog is empty.** No products/prices exist (test or live).
- _Action:_ In the Stripe dashboard (test mode first), create products + recurring prices for the 3
  subscription tiers (monthly + yearly) and 3 one-time announcement prices, with the exact amounts in §5.
- _Then:_ paste the 9 resulting `price_…` IDs into Doppler `dev`/`stg`/`prd` under the env names in §3.

**BLOCKER B2 — Webhook secret + price IDs missing from Doppler.**
- _Action:_ `stripe listen`/dashboard → create the webhook endpoint, set `STRIPE_WEBHOOK_SECRET`; add the
  9 price IDs (B1). Verify with: `doppler secrets --only-names --config dev | grep STRIPE` (expect 11 vars).

**BLOCKER B3 — Staging/prod env unverifiable from here (access boundary).**
- _Action (founder):_ confirm `stg`/`prd` Doppler configs + Vercel Preview/Production contain the same 11
  Stripe vars and point at the intended account/mode.

**BLOCKER B4 — Stripe Customer Portal not confirmed configured.**
- _Action:_ enable a Customer Portal configuration in the Stripe dashboard (per mode) so
  `startHostBillingPortalAction` can open it.

**Optional B5 — `expected-stripe-manifest.json` is a placeholder.** Populate it from the real catalog so
the `verify-stripe-manifest` guardrail can detect drift.

## 10a. Code fix applied this session (safe, no Stripe-API change)

**Bug:** In `startHostCheckoutAction` and `startHostBillingPortalAction`, the **success `redirect()` was
inside the `try` block**. Next.js `redirect()` signals by throwing `NEXT_REDIRECT`; the surrounding
`catch` swallowed it and re-routed to `?error=checkout_failed` / `?error=portal_unavailable`. Net effect:
**checkout/portal would never reach Stripe even once the catalog is provisioned.** No `isRedirectError`
guard existed anywhere in the codebase.

**Fix:** hoisted the success `redirect()` **outside** the try/catch (canonical Next.js pattern), capturing
the URL in a `let` that the `never`-returning error path leaves provably assigned. **No Stripe call,
pricing value, metadata, or webhook logic changed.** `pnpm typecheck` ✅ after the change.

## 11. Final Stripe readiness verdict

**NOT READY — blocked on external founder/provider provisioning (B1–B4), not on code.**

- ✅ Account confirmed (Explore&Earn `acct_1RMj…`); app runs in **TEST** mode.
- ✅ Code is production-grade: sig-verified webhook, ownership-checked actions, env-fail-fast, config-gated
  UI that disables CTAs and shows a safe "not configured" state. The redirect bug is now fixed.
- ❌ Catalog empty; webhook secret + 9 price IDs absent from the reachable env; stg/prd unverifiable here.
- **The frontend is safe to ship** (billing degrades gracefully), but **billing is non-functional until
  B1–B4 are completed by the founder.** Re-run §4 + §3 checks after provisioning to flip this to READY.
