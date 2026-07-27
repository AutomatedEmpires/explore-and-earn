# Owner-only live billing smoke

**What it is:** a real, live, $1/month charge on a private Stripe price, paid by
the owner with a real card, verified end to end, then cancelled and refunded.

**Why it exists:** test mode proves Stripe's behaviour. It cannot prove that
*this deployment's* live secret key, live webhook endpoint, webhook signing
secret and Supabase service role are wired to each other, because none of those
objects exist in test mode. Only a real charge proves that — and the founder
should not have to buy a $199 plan to find out.

**Script:** `tools/scripts/billing-live-smoke.mjs` (no dependencies; runs with
bare `node`).

---

## The instrument

| | |
|---|---|
| Product | `Internal billing smoke` |
| Catalog key | `internal_billing_smoke` (product `metadata.ee_catalog_key`) |
| Lookup key | `ee_internal_billing_smoke` |
| Price | $1.00 / month, live ledger |
| Marker | `metadata.internal_billing_test = "true"` on product, price, session, subscription and refund |
| Env var | **none, ever** |
| Tier granted | `starter`, via `session.metadata.subscriptionTier` |

It is defined once, in `packages/stripe-seed/internal-smoke.mjs`.

### Why a live price that grants a real tier is safe

`syncCheckoutCompleted` reads the tier from `session.metadata.subscriptionTier`,
not from the price. So an internal price can drive a real grant through the real
webhook without the price ever being publicly resolvable:

1. **It is unreachable by construction.** `resolveStripePriceId` returns only
   prices named by the public `STRIPE_PRICE_*` env vars, and
   `hasStripeCheckoutConfig` ignores anything outside that set. This price has no
   env var, so no public checkout surface can name it. The checkout URL is minted
   ad hoc by the script and **is never rendered by any UI**.
2. **It cannot quietly become reachable.**
   `packages/stripe-seed/internal-price-isolation.test.mjs` fails the build if
   the lookup key, catalog key or product name ever appears anywhere under
   `apps/web`, or if it ever enters the sellable catalog manifest. If that test
   fails, the fix is to remove the reference — **not** to add an exemption.

### Allowlist expectation

**Only the owner runs this.** A smoke run against someone else's Clerk id
charges a card and grants *that* account a plan.

This is enforced, not just documented: the script reads `ADMIN_CLERK_USER_ID`
(the same single-id allow-list `apps/web/lib/admin.ts` fails closed on) and
refuses when `--user` does not match. `--any-user` overrides it deliberately; an
unset `ADMIN_CLERK_USER_ID` produces a loud warning rather than silence.

### Revenue-reporting exclusion rule

> **Any figure computed from Stripe — revenue, MRR, active subscriptions, new
> customers, churn — MUST exclude objects carrying
> `metadata.internal_billing_test = "true"`.**

The marker is on the product, the price, the checkout session, the subscription
and the refund, so the filter works at whichever level the report is built. Use
`isInternalBillingTestObject()` from
`packages/stripe-seed/internal-smoke.mjs` rather than re-typing the string.

A smoke run that is left uncleaned otherwise shows up as $1 of recurring revenue
and one active starter host that does not exist.

---

## The full click path

### 0. Before you start

```bash
export STRIPE_SECRET_KEY="$(doppler secrets get STRIPE_SECRET_KEY --plain --project explore-and-earn --config prd)"
export ADMIN_CLERK_USER_ID="<your clerk user id>"
# optional but recommended — lets --verify check the granted row automatically
export NEXT_PUBLIC_SUPABASE_URL="https://<ref>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="..."
```

The script prints `Stripe ledger: LIVE (real money)` before doing anything. If it
says TEST, you are rehearsing, not proving.

### 1. Mint the checkout session

```bash
node tools/scripts/billing-live-smoke.mjs --mint --user "$ADMIN_CLERK_USER_ID"
```

Creates the product and price if they do not exist (idempotent — keyed on
`lookup_key` and `ee_catalog_key`, so re-running never makes a second one) and
prints a checkout URL.

### 2. Pay it

Open the printed URL in a browser. Pay with a **real card**. You are charged
$1.00.

### 3. Verify

```bash
node tools/scripts/billing-live-smoke.mjs --verify --user "$ADMIN_CLERK_USER_ID"
```

Four checks:

| Check | What it proves |
|---|---|
| `stripe subscription live` | Checkout completed and Stripe created an active subscription on the internal price. |
| `webhook endpoint configured` | An enabled endpoint whose URL ends `/api/webhooks/stripe` exists and is subscribed to `checkout.session.completed`. |
| `grant event handed to endpoints` | The `checkout.session.completed` event carrying your Clerk id exists and `pending_webhooks` is 0 — **nothing is still queued for delivery.** This is *not* a 2xx receipt. |
| `host_subscriptions row granted` | `tier = 'starter'` for your Clerk id. **This is the definitive receipt** — only a delivered, signature-verified request that ran the handler can produce it. |

The fourth check `SKIP`s if `SUPABASE_SERVICE_ROLE_KEY` is unset, printing the
SQL to run in the Supabase SQL editor instead. A SKIP is not a pass: run the SQL.

If the row is missing while the first three pass, the failure is in delivery,
signature verification or the handler — check the Stripe dashboard's delivery
attempts for the endpoint, then Sentry (the webhook route reports every sync
failure tagged with the Stripe event id).

Optionally also confirm the product side: the granted tier should now show in
the host surfaces the starter plan unlocks.

### 4. Clean up — **do not skip this**

```bash
node tools/scripts/billing-live-smoke.mjs --cleanup --user "$ADMIN_CLERK_USER_ID"
```

Cancels the subscription and refunds the $1.

Before refunding anything the script requires **both**: the subscription carries
`internal_billing_test = "true"`, **and** every item on it sits on the internal
smoke price. A mistyped id refunds nothing. (Metadata alone would not be enough
— it is free text anyone with dashboard access can set. The price identity is
the fact that cannot be accidentally true of a paying host's plan.)

If the Stripe API's invoice→payment shape has moved again and the script cannot
resolve the charge, it says so; open the invoice in the dashboard and re-run with
`--charge ch_...` or `--payment-intent pi_...`.

### 5. Revoke the entitlement

Cleanup deliberately does **not** revoke the grant — cancelling in Stripe leaves
`host_subscriptions` showing `starter` until the `customer.subscription.deleted`
webhook lands, and you want to *observe* whether it does.

Watch for it. Then, if it did not land (or once you are done observing):

```bash
SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
  node tools/scripts/grant-entitlement.mjs --user "$ADMIN_CLERK_USER_ID" --tier none --prod
```

**A revocation that had to be done by hand is a finding, not a cleanup step.**
Record it.

---

## On G-REFUND

The `explore-and-earn/no-direct-stripe-refund` eslint rule routes **customer**
refunds through the `refund_requests` admin-approval flow in
`apps/web/services/stripe/index.ts`, so they leave an audit trail. This script
refunds the owner's own $1 internal instrument, for which no customer, no
approval and no audit record are meaningful. It does not rely on being invisible
to that rule: the two-fact refusal above is the real guardrail, and it is
stricter than the rule it sits outside.

## Related

- `docs/runbooks/billing-verification.md` — how this layer fits with the other two.
- `docs/runbooks/launch-provisioning.md` — first-time Stripe/webhook provisioning.
