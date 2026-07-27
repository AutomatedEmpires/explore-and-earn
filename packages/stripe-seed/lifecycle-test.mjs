// TEST-MODE BILLING LIFECYCLE PROVER (commercial redesign D14a).
//
// Drives a complete subscription lifetime against Stripe's TEST ledger using a
// test clock, so renewal, proration, dunning and cancellation are proven in
// minutes instead of a year — and without anyone paying anything.
//
//   STRIPE_TEST_SECRET_KEY=sk_test_... node packages/stripe-seed/lifecycle-test.mjs
//   pnpm --filter @explore-and-earn/stripe-seed lifecycle
//
// Exits 0 only when every step passed. Each step prints PASS/FAIL with the
// Stripe object ids it asserted on, so a failure is diagnosable in the Stripe
// dashboard without re-running.
//
// ── WHAT THIS PROVES, AND WHAT IT DOES NOT ────────────────────────────────────
//
// PROVES: the STRIPE side. That the catalog this repo seeds produces
// subscriptions that actually renew, actually prorate on an interval switch,
// actually go past_due when the card fails, and actually cancel — and that the
// lifecycle emits the events the webhook subscribes to.
//
// DOES NOT PROVE: that a delivered webhook grants an entitlement. This script
// never calls the app. Handler behaviour is unit-pinned separately
// (apps/web/tests/unit/stripe-*.test.ts); DELIVERY and SIGNATURE VERIFICATION
// are proven by (a) production's configured, signature-verifying endpoint and
// (b) the owner-only live smoke (tools/scripts/billing-live-smoke.mjs), which
// is the only layer that exercises all three at once. Where a step here would
// otherwise need a delivered webhook, it reads the event back through the API
// instead — see the `events_emitted` step, which asserts the lifecycle really
// emitted the event types the endpoint is subscribed to.
//
// Reading an event through the API is deliberately NOT called proof of
// delivery. It proves the event exists. Nothing less, nothing more.
//
// ── SAFETY ────────────────────────────────────────────────────────────────────
//
// Refuses to run against a live key, unconditionally and with no override. This
// script attaches failing cards and cancels subscriptions; against live keys
// that is damage to a real customer. There is deliberately no --force.
import Stripe from "stripe";

import {
  isLiveModeKey,
  isTestModeKey,
  provisionCatalog,
  resolveLifecyclePrices,
  STRIPE_API_VERSION,
} from "./provision.mjs";

// Stripe's shared test payment methods. Documented, stable, and attachable to
// any number of test customers.
const CARD_OK = "pm_card_visa";
const CARD_FAILS_ON_CHARGE = "pm_card_chargeCustomerFail";

/** The subscription-lifecycle event types the production endpoint handles. */
const HANDLED_SUBSCRIPTION_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

const ADDITIONAL_LISTING_PRODUCT_TYPE = "additional_listing";
const HOUR_SECONDS = 3600;
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 180_000;

const KEEP = process.argv.includes("--keep");

// ── key resolution ────────────────────────────────────────────────────────────

const secretKey =
  process.env.STRIPE_TEST_SECRET_KEY || process.env.STRIPE_SECRET_KEY || "";

if (!secretKey) {
  console.error(
    "[lifecycle] no key. Set STRIPE_TEST_SECRET_KEY (preferred) or STRIPE_SECRET_KEY to a TEST-mode key.",
  );
  process.exit(1);
}

if (isLiveModeKey(secretKey)) {
  console.error(
    "[lifecycle] REFUSING TO RUN: that is a LIVE key. This script attaches failing cards, forces dunning and cancels subscriptions — against live keys that is damage to a real customer. Use STRIPE_TEST_SECRET_KEY with a test-mode key. There is no override.",
  );
  process.exit(1);
}

if (!isTestModeKey(secretKey)) {
  console.error(
    "[lifecycle] REFUSING TO RUN: key prefix is not recognised as test mode. Expected sk_test_ or rk_test_. Failing closed rather than guessing which ledger this addresses.",
  );
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });

// ── reporting ─────────────────────────────────────────────────────────────────

const results = [];

function pass(step, detail) {
  results.push({ step, ok: true });
  console.log(`PASS  ${step}  ${detail}`);
}

function fail(step, detail) {
  results.push({ step, ok: false });
  console.log(`FAIL  ${step}  ${detail}`);
}

function assertOrThrow(condition, message) {
  if (!condition) throw new Error(message);
}

/** Run one named step; a throw becomes a FAIL and aborts the run. */
async function step(name, fn) {
  try {
    const detail = await fn();
    pass(name, detail ?? "");
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll `read` until `predicate` holds. Times out rather than hanging forever —
 * a test clock that never reaches `ready` is a real failure, not a reason to
 * wait indefinitely in CI.
 */
async function pollUntil(label, read, predicate) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let latest;
  while (Date.now() < deadline) {
    latest = await read();
    if (predicate(latest)) return latest;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `timed out waiting for ${label} (last seen: ${JSON.stringify(describe(latest))})`,
  );
}

/** Compact shape for timeout messages — never dump a whole Stripe object. */
function describe(object) {
  if (!object || typeof object !== "object") return object;
  return { id: object.id, status: object.status };
}

/**
 * When does this subscription next bill?
 *
 * `current_period_end` moved from the Subscription to its ITEMS in the 2025-03
 * API generation, and this package pins a version past that — but a caller may
 * run against an older pinned version, and reading the wrong one silently
 * yields `undefined` and an advance to the epoch. Read the item first, fall
 * back to the subscription, and refuse rather than guess.
 */
function subscriptionPeriodEnd(subscription) {
  const fromItem = subscription.items?.data?.[0]?.current_period_end;
  const value = fromItem ?? subscription.current_period_end;
  assertOrThrow(
    typeof value === "number" && Number.isFinite(value),
    `subscription ${subscription.id} exposes no current_period_end on item or subscription`,
  );
  return value;
}

/** Advance the test clock to `frozenTime` and wait for Stripe to settle. */
async function advanceClock(clockId, frozenTime) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: frozenTime });
  const settled = await pollUntil(
    `test clock ${clockId} to settle`,
    () => stripe.testHelpers.testClocks.retrieve(clockId),
    (clock) => clock.status === "ready" || clock.status === "internal_failure",
  );
  assertOrThrow(
    settled.status === "ready",
    `test clock ${clockId} ended in status ${settled.status}`,
  );
  return settled;
}

/** Newest-first invoices for a customer. */
async function listInvoices(customerId, limit = 10) {
  const page = await stripe.invoices.list({ customer: customerId, limit });
  return page.data;
}

/**
 * Is this invoice line a proration?
 *
 * The flag lives at `line.proration` in the older shape and moved under
 * `line.parent.subscription_item_details.proration` in the newer one. Checking
 * only one would make the proration assertion pass or fail on API version
 * rather than on behaviour.
 */
function lineIsProration(line) {
  return (
    line.proration === true ||
    line.parent?.subscription_item_details?.proration === true
  );
}

function invoiceHasProration(invoice) {
  return (invoice.lines?.data ?? []).some(lineIsProration);
}

/**
 * Attach one of Stripe's shared test cards and make it the customer's default.
 *
 * Attaching does NOT reuse the shared token as the payment method id — Stripe
 * clones it into a fresh `pm_...` per customer. Setting
 * `default_payment_method` to the token you passed IN therefore fails with "the
 * payment method must be attached to the customer", which is exactly the shape
 * of bug that makes a lifecycle script look broken when the lifecycle is fine.
 * Always use the id the attach call hands back.
 *
 * @returns {Promise<string>} the attached payment method id
 */
async function attachDefaultCard(customerId, sharedTestToken) {
  const attached = await stripe.paymentMethods.attach(sharedTestToken, {
    customer: customerId,
  });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: attached.id },
  });
  return attached.id;
}

// ── run ───────────────────────────────────────────────────────────────────────

const runStartedAt = Math.floor(Date.now() / 1000);
let testClockId = null;
let failed = false;

console.log("[lifecycle] mode: TEST — provisioning the catalog first (idempotent)\n");

try {
  // 0. The catalog under test is the SAME one seed.mjs writes. If test mode is
  //    empty this creates it; if it already exists this reuses it.
  const { priceIds } = await provisionCatalog(stripe, {
    log: (line) => console.log(line),
  });
  const prices = resolveLifecyclePrices(priceIds);
  console.log("");

  let clock;
  await step("test_clock", async () => {
    clock = await stripe.testHelpers.testClocks.create({
      frozen_time: runStartedAt,
      name: "ee billing lifecycle",
    });
    testClockId = clock.id;
    return `clock=${clock.id} frozen_at=${clock.frozen_time}`;
  });

  let customer;
  await step("customer_with_card", async () => {
    customer = await stripe.customers.create({
      name: "EE lifecycle prover",
      email: `ee-lifecycle-${runStartedAt}@example.com`,
      test_clock: clock.id,
      metadata: { ee_lifecycle_test: "true" },
    });
    const paymentMethodId = await attachDefaultCard(customer.id, CARD_OK);
    return `customer=${customer.id} default_pm=${paymentMethodId} (${CARD_OK})`;
  });

  // 1. SUBSCRIBE MONTHLY — the grant path. Metadata mirrors what
  //    createCheckoutSession stamps, because syncSubscriptionEvent reads the
  //    SUBSCRIPTION's metadata (not the session's) on later events.
  let plan;
  await step("subscribe_monthly", async () => {
    plan = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: prices.planMonthly }],
      metadata: { clerkUserId: `user_lifecycle_${runStartedAt}`, subscriptionTier: "starter" },
      expand: ["latest_invoice"],
    });
    plan = await pollUntil(
      `subscription ${plan.id} to become active`,
      () => stripe.subscriptions.retrieve(plan.id, { expand: ["latest_invoice"] }),
      (s) => s.status === "active" || s.status === "incomplete_expired",
    );
    assertOrThrow(
      plan.status === "active",
      `expected active, got ${plan.status} (card ${CARD_OK} should always succeed)`,
    );
    return `subscription=${plan.id} status=${plan.status} price=${prices.planMonthly}`;
  });

  // 2. FIRST INVOICE PAID — money actually moved, not just a subscription row.
  await step("first_invoice_paid", async () => {
    const invoices = await listInvoices(customer.id);
    assertOrThrow(invoices.length >= 1, "no invoice was raised for the new subscription");
    const first = invoices[0];
    assertOrThrow(
      first.status === "paid",
      `first invoice ${first.id} is ${first.status}, expected paid`,
    );
    assertOrThrow(
      first.amount_paid > 0,
      `first invoice ${first.id} paid ${first.amount_paid} cents`,
    );
    return `invoice=${first.id} status=paid amount_paid=${first.amount_paid}`;
  });

  // 3. RENEWAL — the fact a year of wall-clock time would otherwise be needed to
  //    observe. Advance to just past the period end and assert a SECOND paid
  //    invoice exists.
  await step("advance_to_renewal", async () => {
    const before = await listInvoices(customer.id);
    const periodEnd = subscriptionPeriodEnd(plan);
    await advanceClock(clock.id, periodEnd + HOUR_SECONDS);
    const after = await pollUntil(
      "a renewal invoice",
      () => listInvoices(customer.id),
      (list) => list.length > before.length,
    );
    const renewal = after[0];
    assertOrThrow(
      renewal.status === "paid",
      `renewal invoice ${renewal.id} is ${renewal.status}, expected paid`,
    );
    plan = await stripe.subscriptions.retrieve(plan.id);
    assertOrThrow(
      plan.status === "active",
      `subscription ${plan.id} is ${plan.status} after renewal`,
    );
    return `renewal_invoice=${renewal.id} status=paid invoices=${before.length}->${after.length}`;
  });

  // 4. MONTHLY -> YEARLY WITH PRORATION. `always_invoice` forces the proration
  //    onto an invoice immediately, so the assertion is on a real, finalized
  //    document rather than on a preview that nobody is ever charged for.
  await step("switch_monthly_to_yearly", async () => {
    const itemId = plan.items.data[0].id;
    plan = await stripe.subscriptions.update(plan.id, {
      items: [{ id: itemId, price: prices.planYearly }],
      proration_behavior: "always_invoice",
    });
    const invoices = await listInvoices(customer.id);
    const prorated = invoices.find(invoiceHasProration);
    assertOrThrow(
      prorated,
      "no invoice carries a proration line after the interval switch",
    );
    const priceOnItem = plan.items.data[0].price.id;
    assertOrThrow(
      priceOnItem === prices.planYearly,
      `subscription item is on ${priceOnItem}, expected ${prices.planYearly}`,
    );
    const prorationLines = prorated.lines.data.filter(lineIsProration).length;
    return `subscription=${plan.id} price=${priceOnItem} proration_invoice=${prorated.id} proration_lines=${prorationLines}`;
  });

  // 5. ADD-ON SUBSCRIBE. A SEPARATE subscription on the same customer, carrying
  //    the productType the webhook's add-on branch keys on — the arrangement
  //    that stops a cancelled add-on from zeroing the host's plan tier.
  let addOn;
  await step("addon_subscribe", async () => {
    addOn = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: prices.addOnMonthly, quantity: 1 }],
      metadata: {
        clerkUserId: `user_lifecycle_${runStartedAt}`,
        productType: ADDITIONAL_LISTING_PRODUCT_TYPE,
      },
    });
    addOn = await pollUntil(
      `add-on ${addOn.id} to become active`,
      () => stripe.subscriptions.retrieve(addOn.id),
      (s) => s.status === "active" || s.status === "incomplete_expired",
    );
    assertOrThrow(addOn.status === "active", `add-on is ${addOn.status}, expected active`);
    const quantity = addOn.items.data[0].quantity;
    assertOrThrow(quantity === 1, `add-on quantity is ${quantity}, expected 1`);
    return `addon=${addOn.id} status=active quantity=1 price=${prices.addOnMonthly}`;
  });

  // 6. ADD-ON QUANTITY CHANGE. The allowance term 085 reads is the QUANTITY, so
  //    "can it be changed and does Stripe charge for the change" is the question.
  await step("addon_quantity_change", async () => {
    const before = await listInvoices(customer.id);
    const itemId = addOn.items.data[0].id;
    addOn = await stripe.subscriptions.update(addOn.id, {
      items: [{ id: itemId, quantity: 3 }],
      proration_behavior: "always_invoice",
    });
    const quantity = addOn.items.data[0].quantity;
    assertOrThrow(quantity === 3, `add-on quantity is ${quantity}, expected 3`);
    const after = await listInvoices(customer.id);
    assertOrThrow(
      after.length > before.length && invoiceHasProration(after[0]),
      `quantity increase raised no prorated invoice (invoices ${before.length}->${after.length})`,
    );
    return `addon=${addOn.id} quantity=1->3 proration_invoice=${after[0].id}`;
  });

  // 7. ADD-ON CANCEL.
  await step("addon_cancel", async () => {
    addOn = await stripe.subscriptions.cancel(addOn.id);
    assertOrThrow(
      addOn.status === "canceled",
      `add-on is ${addOn.status}, expected canceled`,
    );
    return `addon=${addOn.id} status=canceled`;
  });

  // 8. YEARLY -> MONTHLY, with the cycle re-anchored to now.
  await step("downgrade_yearly_to_monthly", async () => {
    const itemId = plan.items.data[0].id;
    plan = await stripe.subscriptions.update(plan.id, {
      items: [{ id: itemId, price: prices.planMonthly }],
      proration_behavior: "none",
      billing_cycle_anchor: "now",
    });
    const priceOnItem = plan.items.data[0].price.id;
    assertOrThrow(
      priceOnItem === prices.planMonthly,
      `subscription item is on ${priceOnItem}, expected ${prices.planMonthly}`,
    );
    return `subscription=${plan.id} price=${priceOnItem} cycle_anchored=now`;
  });

  // 9. CANCEL THE PLAN.
  await step("cancel_plan", async () => {
    plan = await stripe.subscriptions.cancel(plan.id);
    assertOrThrow(
      plan.status === "canceled",
      `subscription is ${plan.status}, expected canceled`,
    );
    return `subscription=${plan.id} status=canceled`;
  });

  // 10. PAYMENT FAILURE ON A RENEWAL. The state the entitlement code classifies
  //     as a RECOVERABLE lapse: Stripe can still collect, so the app must not
  //     treat it as terminal (see the TERMINAL_SUBSCRIPTION_STATUSES comment in
  //     services/stripe/index.ts). Proving Stripe really produces past_due is
  //     what makes that classification testable at all.
  //
  //     ON A SECOND CUSTOMER, ON THE SAME CLOCK — and this is not tidiness.
  //     Measured on 2026-07-27: after the upgrade-then-downgrade above, the
  //     customer above ends the run holding a ~$1,452 CREDIT BALANCE (they
  //     prepaid a year and moved back to monthly). Their next renewal invoice is
  //     therefore for $0 and settles out of that credit WITHOUT TOUCHING A CARD,
  //     so a failing card attached to them proves exactly nothing and the
  //     subscription stays cheerfully `active`. That is correct Stripe
  //     behaviour, not a bug to work around, so the dunning proof gets a
  //     customer with no credit history instead of a doctored one.
  //
  //     It runs AFTER cancel_plan so its clock advance cannot disturb anything.
  //     The failing card must be swapped in AFTER the first successful charge:
  //     pm_card_chargeCustomerFail attaches fine but fails every charge, so
  //     subscribing with it produces `incomplete` — a FIRST-payment failure,
  //     which is a different fact from a RENEWAL failure.
  await step("payment_failure_on_renewal", async () => {
    const dunningCustomer = await stripe.customers.create({
      name: "EE lifecycle prover (dunning)",
      email: `ee-lifecycle-dunning-${runStartedAt}@example.com`,
      test_clock: clock.id,
      metadata: { ee_lifecycle_test: "true" },
    });
    await attachDefaultCard(dunningCustomer.id, CARD_OK);

    let dunning = await stripe.subscriptions.create({
      customer: dunningCustomer.id,
      items: [{ price: prices.planMonthly }],
      metadata: {
        clerkUserId: `user_lifecycle_dunning_${runStartedAt}`,
        subscriptionTier: "starter",
      },
    });
    dunning = await pollUntil(
      `dunning subscription ${dunning.id} to become active`,
      () => stripe.subscriptions.retrieve(dunning.id),
      (s) => s.status === "active" || s.status === "incomplete_expired",
    );
    assertOrThrow(
      dunning.status === "active",
      `dunning subscription is ${dunning.status} before the card swap, expected active`,
    );

    // A subscription can carry its OWN default_payment_method, which WINS over
    // the customer's. Swapping only the customer default would leave the renewal
    // charging the good card and the subscription active — a green-looking run
    // that proved nothing. Set it in both places.
    const failingPaymentMethodId = await attachDefaultCard(
      dunningCustomer.id,
      CARD_FAILS_ON_CHARGE,
    );
    dunning = await stripe.subscriptions.update(dunning.id, {
      default_payment_method: failingPaymentMethodId,
    });

    const before = await listInvoices(dunningCustomer.id);
    await advanceClock(clock.id, subscriptionPeriodEnd(dunning) + HOUR_SECONDS);

    // TWO facts, polled separately, so a failure says WHICH one broke. "Still
    // active" alone cannot distinguish "the renewal never happened" from "the
    // renewal happened and the charge succeeded" — opposite bugs.
    const after = await pollUntil(
      "a renewal invoice after the clock advance",
      () => listInvoices(dunningCustomer.id),
      (list) => list.length > before.length,
    );
    const renewal = after[0];

    dunning = await pollUntil(
      `dunning subscription ${dunning.id} to leave 'active' after the failed charge`,
      () => stripe.subscriptions.retrieve(dunning.id),
      (s) => s.status !== "active",
    );

    assertOrThrow(
      renewal.status !== "paid" && renewal.amount_paid === 0,
      `renewal invoice ${renewal.id} was PAID (${renewal.amount_paid} cents) — the failing card ${failingPaymentMethodId} was not what settled it. A customer credit balance will do this.`,
    );

    // past_due is Stripe's DEFAULT dunning outcome for a failed renewal. A
    // different lapse status here is not a repo bug — it is dashboard dunning
    // configuration, which no script here can see. Say which, rather than
    // reporting a generic mismatch.
    assertOrThrow(
      dunning.status === "past_due",
      `subscription is '${dunning.status}' after a failed renewal, expected 'past_due'. That is DASHBOARD dunning configuration, not repo code — check Stripe > Settings > Billing > Subscriptions > failed payments.`,
    );

    return `subscription=${dunning.id} status=past_due failing_pm=${failingPaymentMethodId} unpaid_invoice=${renewal.id} (${renewal.status}, due ${renewal.amount_due})`;
  });

  // 11. EVENTS EMITTED. Read back through the API — NOT a delivery proof, see
  //     the header. It answers only: did this lifecycle actually produce the
  //     event types the production endpoint is subscribed to?
  await step("events_emitted", async () => {
    const seen = new Set();
    for (const type of HANDLED_SUBSCRIPTION_EVENTS) {
      const page = await stripe.events.list({
        type,
        created: { gte: runStartedAt - HOUR_SECONDS },
        limit: 100,
      });
      if (page.data.length > 0) seen.add(type);
    }
    const missing = HANDLED_SUBSCRIPTION_EVENTS.filter((type) => !seen.has(type));
    assertOrThrow(
      missing.length === 0,
      `lifecycle emitted no ${missing.join(", ")} event(s)`,
    );
    return `types=${[...seen].join(", ")} (read via API; delivery+signature proven by prod + the live smoke)`;
  });
} catch {
  failed = true;
} finally {
  // Deleting the test clock deletes every customer, subscription and invoice
  // created on it — the whole run is one disposable object, which is why the
  // script leaves no litter in the test dashboard by default.
  if (testClockId && !KEEP) {
    try {
      await stripe.testHelpers.testClocks.del(testClockId);
      console.log(`\n[lifecycle] cleaned up test clock ${testClockId} (and everything on it)`);
    } catch (error) {
      console.log(
        `\n[lifecycle] WARNING: could not delete test clock ${testClockId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else if (testClockId) {
    console.log(`\n[lifecycle] --keep: test clock ${testClockId} left in place for inspection`);
  }
}

const passed = results.filter((r) => r.ok).length;
const total = results.length;
console.log(`\n[lifecycle] ${passed}/${total} steps passed`);

if (failed || passed !== total) {
  console.log("[lifecycle] RESULT: FAIL");
  process.exit(1);
}

console.log("[lifecycle] RESULT: PASS");
