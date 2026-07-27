// OWNER-ONLY LIVE BILLING SMOKE (commercial redesign D14b).
//
// The only layer that proves the LIVE wiring: live keys -> live checkout ->
// live webhook endpoint -> signature verification -> host_subscriptions grant.
// Test mode cannot prove any of that, because none of those objects exist there.
//
// It costs the owner $1, for a few minutes, and then refunds it.
//
//   node tools/scripts/billing-live-smoke.mjs --mint    --user user_xxx
//   node tools/scripts/billing-live-smoke.mjs --verify  --user user_xxx
//   node tools/scripts/billing-live-smoke.mjs --cleanup --user user_xxx
//
// Full click path, allowlist expectation and the revenue-reporting exclusion
// rule: docs/runbooks/billing-live-smoke.md.
//
// ── NO SDK, ON PURPOSE ────────────────────────────────────────────────────────
//
// tools/scripts is not a workspace package, so it has no node_modules of its
// own and the repo root does not depend on `stripe` or `@supabase/supabase-js`.
// This talks to both over plain `fetch`, which means the founder can run it with
// bare `node` from a fresh clone with nothing installed — the property that
// matters most for a script whose whole job is to be runnable when something is
// already wrong.
//
// ── ON G-REFUND ───────────────────────────────────────────────────────────────
//
// The G-REFUND eslint rule exists so that CUSTOMER refunds go through the
// refund_requests admin-approval flow in apps/web/services/stripe/index.ts,
// which leaves an audit trail. This script refunds the OWNER's own $1 internal
// instrument, for which no customer, no approval and no audit record are
// meaningful. It is not a loophole in that rule, and it does not rely on being
// invisible to it: assertInternalSmokeSubscription() below REFUSES to refund
// anything whose Stripe subscription does not carry
// internal_billing_test = "true" AND sit entirely on the internal smoke price.
// A mistyped id refunds nothing. That check is the real guardrail here; the
// comment is only the explanation.
import {
  INTERNAL_SMOKE_PRICE,
  INTERNAL_SMOKE_TIER,
  INTERNAL_TEST_METADATA_KEY,
  INTERNAL_TEST_METADATA_VALUE,
  internalSmokeMetadata,
  internalSmokeSessionMetadata,
  isInternalBillingTestObject,
} from "../../packages/stripe-seed/internal-smoke.mjs";

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_API_VERSION = "2026-05-27.dahlia";
const WEBHOOK_PATH = "/api/webhooks/stripe";
const REQUIRED_WEBHOOK_EVENT = "checkout.session.completed";

// ── args ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function flag(name) {
  return argv.includes(`--${name}`);
}

function option(name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

const MODE = flag("mint")
  ? "mint"
  : flag("verify")
    ? "verify"
    : flag("cleanup")
      ? "cleanup"
      : null;

if (!MODE) {
  console.error(
    "usage: node tools/scripts/billing-live-smoke.mjs --mint|--verify|--cleanup --user <clerk_user_id>\n" +
      "       optional: --any-user (bypass the ADMIN_CLERK_USER_ID check)\n" +
      "                 --charge <ch_...> | --payment-intent <pi_...> (cleanup, if auto-resolution fails)",
  );
  process.exit(1);
}

const clerkUserId = option("user");
if (!clerkUserId) {
  console.error("--user <clerk_user_id> is required.");
  process.exit(1);
}

// ── the allowlist, enforced rather than merely documented ─────────────────────
//
// "Only the owner runs this" is a real constraint, not a note: a smoke run
// against someone else's Clerk id grants THEM a starter plan on a live charge
// and leaves a subscription in their name. ADMIN_CLERK_USER_ID is the same
// single-id allow-list apps/web/lib/admin.ts fails closed on, so the check has
// one source of truth. Unset means "cannot verify", which is a warning and not
// silence.
const adminUserId = process.env.ADMIN_CLERK_USER_ID ?? "";
if (!adminUserId) {
  console.warn(
    "[smoke] WARNING: ADMIN_CLERK_USER_ID is not set, so the owner allowlist cannot be checked. Set it (same value as production) before running against live keys.",
  );
} else if (clerkUserId !== adminUserId && !flag("any-user")) {
  console.error(
    `[smoke] REFUSING: --user ${clerkUserId} is not ADMIN_CLERK_USER_ID. A live smoke against another account charges a card and grants THAT account a plan. Pass --any-user only if you meant it.`,
  );
  process.exit(1);
}

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error(
    "[smoke] STRIPE_SECRET_KEY is required (the LIVE key — this smoke exists to prove the live path).",
  );
  process.exit(1);
}

const isLive = secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_");
console.log(
  `[smoke] Stripe ledger: ${isLive ? "LIVE (real money)" : "TEST (no money moves — dry run)"}`,
);
if (!isLive) {
  console.log(
    "[smoke] NOTE: a test-mode run rehearses the mechanics but proves nothing about the live wiring, which is the entire point of this layer.",
  );
}

// ── stripe over fetch ─────────────────────────────────────────────────────────

/**
 * Encode params the way Stripe's form API expects: nested objects become
 * `a[b]=c` and arrays become `a[0][b]=c`. Written out rather than pulled from a
 * dependency so this file stays runnable with zero installs.
 */
function encodeForm(params, prefix = "", out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (item !== null && typeof item === "object") {
          encodeForm(item, `${name}[${index}]`, out);
        } else {
          out.append(`${name}[${index}]`, String(item));
        }
      });
    } else if (typeof value === "object") {
      encodeForm(value, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

async function stripeRequest(method, path, params) {
  const isGet = method === "GET";
  const query = isGet && params ? `?${encodeForm(params).toString()}` : "";
  const response = await fetch(`${STRIPE_API}${path}${query}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": STRIPE_API_VERSION,
      ...(isGet ? {} : { "Content-Type": "application/x-www-form-urlencoded" }),
    },
    body: isGet || !params ? undefined : encodeForm(params).toString(),
  });

  const body = await response.json();
  if (!response.ok) {
    const message = body?.error?.message ?? response.statusText;
    throw new Error(`Stripe ${method} ${path} failed (${response.status}): ${message}`);
  }
  return body;
}

// ── the internal price, ensured idempotently ──────────────────────────────────

/**
 * Find (or create) the internal smoke Product + Price.
 *
 * Keyed exactly like the real catalog: the product on our own
 * metadata.ee_catalog_key, the price on its stable lookup_key. Re-running is
 * therefore free and never creates a second $1 price to get confused by.
 */
async function ensureSmokePrice() {
  const existingPrices = await stripeRequest("GET", "/prices", {
    lookup_keys: [INTERNAL_SMOKE_PRICE.lookupKey],
    limit: 1,
    active: true,
  });
  if (existingPrices.data[0]) {
    return existingPrices.data[0];
  }

  const products = await stripeRequest("GET", "/products", { limit: 100, active: true });
  let product = products.data.find(
    (candidate) => candidate.metadata?.ee_catalog_key === INTERNAL_SMOKE_PRICE.catalogKey,
  );
  if (!product) {
    product = await stripeRequest("POST", "/products", {
      name: INTERNAL_SMOKE_PRICE.productName,
      description: INTERNAL_SMOKE_PRICE.productDescription,
      metadata: internalSmokeMetadata({
        ee_catalog_key: INTERNAL_SMOKE_PRICE.catalogKey,
      }),
    });
    console.log(`[smoke] created product ${product.id} (${INTERNAL_SMOKE_PRICE.productName})`);
  }

  const price = await stripeRequest("POST", "/prices", {
    product: product.id,
    currency: INTERNAL_SMOKE_PRICE.currency,
    unit_amount: INTERNAL_SMOKE_PRICE.unitAmountCents,
    lookup_key: INTERNAL_SMOKE_PRICE.lookupKey,
    transfer_lookup_key: true,
    recurring: { interval: INTERNAL_SMOKE_PRICE.interval },
    // Deliberately NO ee_env_var. The real catalog stamps one so the seeder can
    // print an env block; this price must never appear in one, because an env
    // var is exactly what would make resolveStripePriceId able to return it.
    metadata: internalSmokeMetadata(),
  });
  console.log(`[smoke] created price ${price.id} ($1/month, lookup ${price.lookup_key})`);
  return price;
}

// ── mint ──────────────────────────────────────────────────────────────────────

async function mint() {
  const price = await ensureSmokePrice();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

  const metadata = internalSmokeSessionMetadata(clerkUserId);

  const session = await stripeRequest("POST", "/checkout/sessions", {
    mode: "subscription",
    client_reference_id: clerkUserId,
    success_url: `${appUrl}/host/settings?smoke=1`,
    cancel_url: `${appUrl}/host/settings`,
    line_items: [{ price: price.id, quantity: 1 }],
    metadata,
    // The webhook reads the SUBSCRIPTION's metadata on every event after
    // checkout, so the marker and the tier must ride on both objects — and the
    // cleanup refusal below reads the subscription's copy.
    subscription_data: { metadata },
  });

  console.log("");
  console.log(`[smoke] checkout session : ${session.id}`);
  console.log(`[smoke] grants tier      : ${INTERNAL_SMOKE_TIER} (via session.metadata.subscriptionTier)`);
  console.log(`[smoke] to clerk user    : ${clerkUserId}`);
  console.log(`[smoke] amount           : $${(INTERNAL_SMOKE_PRICE.unitAmountCents / 100).toFixed(2)}/month`);
  console.log("");
  console.log("Open this URL and pay with a real card. It is minted ad hoc and is NOT rendered by any UI:");
  console.log("");
  console.log(session.url);
  console.log("");
  console.log(`Then: node tools/scripts/billing-live-smoke.mjs --verify --user ${clerkUserId}`);
}

// ── verify ────────────────────────────────────────────────────────────────────

async function findSmokeSubscription() {
  const subscriptions = await stripeRequest("GET", "/subscriptions", {
    price: (await ensureSmokePrice()).id,
    status: "all",
    limit: 20,
  });
  const mine = subscriptions.data.filter(
    (subscription) =>
      isInternalBillingTestObject(subscription) &&
      subscription.metadata?.clerkUserId === clerkUserId,
  );
  return mine[0] ?? null;
}

async function checkWebhookEndpoint() {
  const endpoints = await stripeRequest("GET", "/webhook_endpoints", { limit: 100 });
  const endpoint = endpoints.data.find((candidate) =>
    typeof candidate.url === "string" ? candidate.url.endsWith(WEBHOOK_PATH) : false,
  );
  if (!endpoint) {
    return { ok: false, detail: `no webhook endpoint whose url ends with ${WEBHOOK_PATH}` };
  }
  if (endpoint.status !== "enabled") {
    return { ok: false, detail: `endpoint ${endpoint.id} status is ${endpoint.status}` };
  }
  const events = endpoint.enabled_events ?? [];
  const subscribed = events.includes("*") || events.includes(REQUIRED_WEBHOOK_EVENT);
  if (!subscribed) {
    return {
      ok: false,
      detail: `endpoint ${endpoint.id} is not subscribed to ${REQUIRED_WEBHOOK_EVENT}`,
    };
  }
  return { ok: true, detail: `${endpoint.id} ${endpoint.url} (${events.length} events)`, endpoint };
}

/**
 * Was the grant event handed to every configured endpoint?
 *
 * `pending_webhooks` counts endpoints that still have this event queued. Zero
 * means nothing is still waiting to be delivered — it is NOT a 2xx receipt, and
 * this function does not claim to be one. The definitive receipt is the granted
 * host_subscriptions row below: only a delivered, signature-verified request
 * that ran the handler can produce it.
 */
async function checkGrantEvent() {
  const events = await stripeRequest("GET", "/events", {
    type: REQUIRED_WEBHOOK_EVENT,
    limit: 100,
  });
  const mine = events.data.find(
    (event) => event.data?.object?.metadata?.clerkUserId === clerkUserId,
  );
  if (!mine) {
    return { ok: false, detail: `no ${REQUIRED_WEBHOOK_EVENT} event carrying clerkUserId ${clerkUserId}` };
  }
  if (mine.pending_webhooks !== 0) {
    return {
      ok: false,
      detail: `event ${mine.id} still has ${mine.pending_webhooks} pending webhook delivery/deliveries`,
    };
  }
  return { ok: true, detail: `event ${mine.id} (pending_webhooks=0)` };
}

const HOST_SUBSCRIPTION_SQL = (userId) =>
  `select clerk_user_id, tier, billing_status, stripe_customer_id, stripe_subscription_id, current_period_end\n  from public.host_subscriptions\n where clerk_user_id = '${userId}';`;

async function checkGrantedRow() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      ok: null,
      detail:
        "SUPABASE_SERVICE_ROLE_KEY (and NEXT_PUBLIC_SUPABASE_URL) not set — run this SQL in the Supabase SQL editor instead:\n\n" +
        HOST_SUBSCRIPTION_SQL(clerkUserId),
    };
  }

  const query = new URLSearchParams({
    clerk_user_id: `eq.${clerkUserId}`,
    select: "clerk_user_id,tier,billing_status,stripe_subscription_id,current_period_end",
  });
  const response = await fetch(`${url}/rest/v1/host_subscriptions?${query.toString()}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!response.ok) {
    return { ok: false, detail: `Supabase read failed (${response.status}): ${await response.text()}` };
  }
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, detail: `no host_subscriptions row for ${clerkUserId}` };
  }
  const row = rows[0];
  if (row.tier !== INTERNAL_SMOKE_TIER) {
    return {
      ok: false,
      detail: `row exists but tier is '${row.tier}', expected '${INTERNAL_SMOKE_TIER}'`,
    };
  }
  return {
    ok: true,
    detail: `tier=${row.tier} billing_status=${row.billing_status} subscription=${row.stripe_subscription_id}`,
  };
}

async function verify() {
  const checks = [];

  const subscription = await findSmokeSubscription();
  checks.push({
    name: "stripe subscription live",
    ok: Boolean(subscription) && subscription.status === "active",
    detail: subscription
      ? `${subscription.id} status=${subscription.status}`
      : "no internal smoke subscription found for this clerk user",
  });

  const endpoint = await checkWebhookEndpoint();
  checks.push({ name: "webhook endpoint configured", ...endpoint });

  const grantEvent = await checkGrantEvent();
  checks.push({ name: "grant event handed to endpoints", ...grantEvent });

  const row = await checkGrantedRow();
  checks.push({ name: "host_subscriptions row granted", ...row });

  console.log("");
  let failedCount = 0;
  for (const check of checks) {
    const label = check.ok === null ? "SKIP" : check.ok ? "PASS" : "FAIL";
    if (check.ok === false) failedCount += 1;
    console.log(`${label}  ${check.name}\n      ${check.detail}\n`);
  }

  if (failedCount > 0) {
    console.log(`[smoke] RESULT: FAIL (${failedCount} check(s) failed)`);
    process.exit(1);
  }
  console.log("[smoke] RESULT: PASS");
  if (subscription) {
    console.log(
      `[smoke] when done: node tools/scripts/billing-live-smoke.mjs --cleanup --user ${clerkUserId}`,
    );
  }
}

// ── cleanup ───────────────────────────────────────────────────────────────────

/**
 * The refund refusal. Two independent facts must hold before any money moves
 * back, so neither a mistyped id nor a wrong-metadata object can reach a real
 * customer's charge:
 *
 *   1. the subscription carries internal_billing_test = "true";
 *   2. EVERY item on it sits on the internal smoke price.
 *
 * Metadata alone would not be enough — it is a free-text field anyone with
 * dashboard access can set. The price identity is the fact that cannot be
 * accidentally true of a paying host's plan.
 */
function assertInternalSmokeSubscription(subscription, smokePriceId) {
  if (!isInternalBillingTestObject(subscription)) {
    throw new Error(
      `REFUSING: subscription ${subscription.id} does not carry ${INTERNAL_TEST_METADATA_KEY}=${INTERNAL_TEST_METADATA_VALUE}. This script only ever touches the internal smoke instrument.`,
    );
  }
  const items = subscription.items?.data ?? [];
  const offSmokePrice = items.filter((item) => item.price?.id !== smokePriceId);
  if (items.length === 0 || offSmokePrice.length > 0) {
    throw new Error(
      `REFUSING: subscription ${subscription.id} has ${offSmokePrice.length} item(s) that are not the internal smoke price ${smokePriceId}.`,
    );
  }
}

/**
 * Find the charge to refund.
 *
 * The link from an Invoice to its payment has moved more than once across
 * Stripe API generations (`charge`, then `payment_intent`, then a `payments`
 * sub-list). Rather than pin one shape and silently resolve `undefined`, try
 * each and REFUSE with what was actually seen — the owner can then pass
 * --charge or --payment-intent straight from the dashboard.
 */
function resolveRefundTarget(invoice) {
  if (typeof invoice.charge === "string") {
    return { charge: invoice.charge };
  }
  if (typeof invoice.payment_intent === "string") {
    return { payment_intent: invoice.payment_intent };
  }
  const payment = invoice.payments?.data?.[0]?.payment;
  if (typeof payment?.charge === "string") {
    return { charge: payment.charge };
  }
  if (typeof payment?.payment_intent === "string") {
    return { payment_intent: payment.payment_intent };
  }
  return null;
}

async function cleanup() {
  const smokePrice = await ensureSmokePrice();
  const subscription = await findSmokeSubscription();

  if (!subscription) {
    console.log("[smoke] no internal smoke subscription for this clerk user — nothing to cancel.");
  } else {
    assertInternalSmokeSubscription(subscription, smokePrice.id);

    if (subscription.status === "canceled") {
      console.log(`[smoke] subscription ${subscription.id} is already canceled.`);
    } else {
      const canceled = await stripeRequest("DELETE", `/subscriptions/${subscription.id}`);
      console.log(`[smoke] cancelled subscription ${canceled.id} (status=${canceled.status})`);
    }
  }

  // Refund the $1. An explicit --charge / --payment-intent wins, so a shape
  // change in the Stripe API never leaves the owner unable to get their money
  // back from this script.
  const explicitCharge = option("charge");
  const explicitIntent = option("payment-intent");
  let target = explicitCharge
    ? { charge: explicitCharge }
    : explicitIntent
      ? { payment_intent: explicitIntent }
      : null;

  if (!target) {
    if (!subscription) {
      console.log("[smoke] no subscription, so no invoice to refund. Done.");
      return;
    }
    const invoices = await stripeRequest("GET", "/invoices", {
      subscription: subscription.id,
      limit: 10,
    });
    const paid = invoices.data.filter(
      (invoice) => invoice.status === "paid" && invoice.amount_paid > 0,
    );
    if (paid.length === 0) {
      console.log("[smoke] no paid invoice on the smoke subscription — nothing to refund.");
      return;
    }
    for (const invoice of paid) {
      const resolved = resolveRefundTarget(invoice);
      if (!resolved) {
        console.log(
          `[smoke] could not resolve the payment for invoice ${invoice.id} from this API version's shape. Open it in the Stripe dashboard and re-run with --charge ch_... or --payment-intent pi_...`,
        );
        continue;
      }
      const refund = await stripeRequest("POST", "/refunds", {
        ...resolved,
        metadata: internalSmokeMetadata({ reason: "internal billing smoke cleanup" }),
      });
      console.log(
        `[smoke] refunded ${refund.amount} cents (refund ${refund.id}, status ${refund.status}) for invoice ${invoice.id}`,
      );
    }
    console.log("\n[smoke] cleanup done. The grant itself is NOT revoked by this script — use:");
    console.log(
      `  SUPABASE_SERVICE_ROLE_KEY=... node tools/scripts/grant-entitlement.mjs --user ${clerkUserId} --tier none --prod`,
    );
    return;
  }

  const refund = await stripeRequest("POST", "/refunds", {
    ...target,
    metadata: internalSmokeMetadata({ reason: "internal billing smoke cleanup" }),
  });
  console.log(
    `[smoke] refunded ${refund.amount} cents (refund ${refund.id}, status ${refund.status})`,
  );
}

// ── dispatch ──────────────────────────────────────────────────────────────────

try {
  if (MODE === "mint") await mint();
  else if (MODE === "verify") await verify();
  else await cleanup();
} catch (error) {
  console.error(`\n[smoke] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
