# Billing verification

Three layers. Each proves something the other two cannot. Decision **D14** of
`docs/design/commercial-redesign-2026-07.md`; the governing requirement is that
**the founder never has to pay full price to verify billing**, and that every
lifecycle path is provable by someone other than the person who wrote it.

| Layer | Command | Costs | Proves |
|---|---|---|---|
| 1. Test-mode lifecycle | `pnpm --filter @explore-and-earn/stripe-seed lifecycle` | nothing | Stripe really renews, prorates, dunns and cancels the catalog this repo seeds |
| 2. Owner-only live smoke | `node tools/scripts/billing-live-smoke.mjs` | $1, refunded | live keys → live checkout → live webhook → signature → granted row |
| 3. Admin entitlement tool | `node tools/scripts/grant-entitlement.mjs` | nothing | the app enforces an entitlement, independent of Stripe |

Plus the layer that is already in CI: **`apps/web/tests/unit/stripe-*.test.ts`**
pin the webhook *handler's* behaviour (idempotent grants, recorded-plan-id
cancellation, terminal-vs-recoverable lapse classification) against synthetic
events. Those run on every PR; the three layers below do not.

---

## Layer 1 — test-mode lifecycle

`packages/stripe-seed/lifecycle-test.mjs`

```bash
export STRIPE_TEST_SECRET_KEY="$(doppler secrets get STRIPE_SECRET_KEY --plain --project explore-and-earn --config dev)"
pnpm --filter @explore-and-earn/contracts build     # the catalog reads the pricing contracts
pnpm --filter @explore-and-earn/stripe-seed lifecycle
```

Creates a Stripe **test clock**, provisions the catalog into test mode
(idempotently, via the same `provisionCatalog` that `seed.mjs` uses — not a
fork), and drives a whole subscription lifetime through it in minutes:

| Step | Assertion |
|---|---|
| `test_clock` | clock created, frozen at now |
| `customer_with_card` | customer on the clock, `pm_card_visa` as default |
| `subscribe_monthly` | subscription reaches `active` on the starter monthly price |
| `first_invoice_paid` | an invoice exists, is `paid`, and `amount_paid > 0` |
| `advance_to_renewal` | clock advanced past period end; a **second** paid invoice exists; subscription still `active` |
| `switch_monthly_to_yearly` | item moved to the yearly price; an invoice carries **proration** lines |
| `addon_subscribe` | separate add-on subscription `active`, quantity 1, carrying `productType=additional_listing` |
| `addon_quantity_change` | quantity 1→3 and a prorated invoice was raised |
| `addon_cancel` | add-on `canceled` |
| `downgrade_yearly_to_monthly` | back on the monthly price, cycle anchored to now |
| `cancel_plan` | subscription `canceled` |
| `payment_failure_on_renewal` | a **second** customer on the same clock subscribes with a good card, swaps to `pm_card_chargeCustomerFail`, and renews: the renewal invoice is unpaid (`amount_paid` 0) and the subscription reaches **`past_due`** |
| `events_emitted` | `customer.subscription.{created,updated,deleted}` all exist, read back through the API |

### Why the dunning step uses a second customer

Not tidiness — it is load-bearing, and it was measured rather than assumed.
After the upgrade-then-downgrade steps the first customer ends up holding a
**~$1,452 credit balance** (they prepaid a year, then moved back to monthly).
Their next renewal invoice is therefore for $0 and settles out of that credit
**without touching a card at all**, so a failing card attached to them proves
nothing and the subscription stays cheerfully `active`.

That is correct Stripe behaviour, not something to work around, so the dunning
proof gets a customer with no credit history. The failing card is also swapped in
only *after* a successful first charge: `pm_card_chargeCustomerFail` attaches
fine but fails every charge, so subscribing with it yields `incomplete` — a
first-payment failure, which is a different fact from a renewal failure.

The generic lesson, worth keeping: **a lifecycle assertion that shares a customer
with earlier steps inherits their financial state.** A green run can mean the
thing under test never ran.

Each step prints `PASS`/`FAIL` with the Stripe object ids it asserted on. The run
exits non-zero on the first failure. The test clock (and everything created on
it) is deleted at the end; `--keep` leaves it for inspection.

**Refuses to run against a live key**, unconditionally, with no override — it
attaches failing cards and cancels subscriptions, which against live keys is
damage to a real customer. An unrecognised key prefix is also refused: it fails
closed rather than guessing which ledger it is addressing.

**What it cannot prove.** It never calls the app. It says nothing about
delivery, signature verification, or whether a delivered event grants anything.
Where a step would otherwise need a delivered webhook it reads the event back
through the API — which proves the event *exists*, and is deliberately not
described as proof of delivery. That gap is exactly what layer 2 closes.

---

## Layer 2 — owner-only live smoke

`tools/scripts/billing-live-smoke.mjs` — **full procedure, safety argument,
allowlist and revenue-exclusion rule: [`billing-live-smoke.md`](./billing-live-smoke.md).**

In one line: a private live $1/month price (`ee_internal_billing_smoke`, never
wired to any env var, never rendered in any UI) that the owner buys with a real
card, verifies, then cancels and refunds. It is the only layer where live keys,
the live webhook endpoint, the signing secret and the Supabase service role are
exercised together — and the granted `host_subscriptions` row is the only
artefact that can only exist if all four worked.

**What it cannot prove.** Anything about time. It buys one month and refunds it
within the hour, so it never observes a renewal, a dunning cycle or a
cancellation-at-period-end. That is layer 1's job.

---

## Layer 3 — admin entitlement tool

`tools/scripts/grant-entitlement.mjs`

```bash
SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
  node tools/scripts/grant-entitlement.mjs --user user_xxx --tier professional
```

Upserts `public.host_subscriptions` under the service role — the authority
`create_my_host_profile` and every entitlement gate read (migration 083). Prints
the row **before and after** every write.

| Want | Flags |
|---|---|
| grant a tier | `--tier professional` |
| revoke | `--tier none` |
| simulate a **recoverable** lapse | `--tier starter --status past_due` |
| simulate a **terminal** lapse | `--tier none --status cancelled` |
| look without touching | `--dry-run` |

Why it exists separately: it makes *"does the app enforce this entitlement"*
answerable independently of *"does Stripe produce this state"*. Those are two
different bugs, and before this they were only provable together.

**Safety.** It prints the resolved Supabase project ref on every run, and
refuses any non-local project unless `--prod` is passed explicitly. (It does not
hard-refuse remote hosts the way `tools/db-assert/run-sql.mjs` does — granting a
tier on staging or prod is a legitimate use — so the gate is explicitness, not
prohibition.) Requires the service-role key because 083 revokes all writes on
this table from `anon` and `authenticated`: a host who could write it could award
themselves a plan.

**What it cannot prove.** Anything about billing. It moves no money, creates no
Stripe object and cancels nothing. A tier granted here is an entitlement nobody
is paying for; a tier revoked here leaves any live Stripe subscription running
and still charging.

It deliberately writes only the **authority** (`host_subscriptions`) and not the
denormalized read copy (`host_profiles.subscription_tier`) — which keeps
"authority vs cache" a testable question rather than one the tool silently
answers for you. The script says so on every run.

---

## When to run which

| Situation | Run |
|---|---|
| Changed the catalog, pricing contracts or `seed.mjs` | Layer 1 |
| Changed webhook handling, grant or revoke logic | Unit tests (CI) + Layer 1 |
| Changed an entitlement gate, allowance or tier-feature surface | Layer 3 |
| Rotated Stripe keys, moved the webhook endpoint, changed the signing secret | **Layer 2** |
| First production deploy of a billing change | Layer 2 |
| Seeded a fresh Stripe account | Layer 1, then Layer 2 |
| Before a launch gate that says "billing works" | All three |

## What none of them prove

- **Dunning configuration.** Retry schedule and end-of-retries behaviour live in
  the Stripe *dashboard*, not in this repo. `services/stripe/index.ts` documents
  the requirement: retries must end in **cancel**, not "mark as unpaid" —
  otherwise a lapse parks forever with the host's shopfront up at zero revenue.
  Layer 1 proves `past_due` is reached; it does not prove what happens after the
  last retry. Check it in the dashboard.
- **Billing portal configuration.** The portal must not offer pause, for the same
  reason. Dashboard-side; unverified by any script here.
- **Tax, invoicing and receipts.**
- **That a webhook delivery failure is noticed.** The route reports to Sentry;
  whether anyone is paged is an alerting question (`docs/runbooks/sentry-alerts.md`).
