// ADMIN ENTITLEMENT TOOL (commercial redesign D14c).
//
// Writes public.host_subscriptions directly under the service role so a tier or
// a billing state can be put in place WITHOUT Stripe. That separation is the
// whole point: it makes "does the app enforce this entitlement" answerable
// independently of "does Stripe produce this state", which are two different
// bugs that used to be provable only together.
//
//   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... \
//     node tools/scripts/grant-entitlement.mjs --user user_xxx --tier professional
//
//   # revoke
//   ... --user user_xxx --tier none
//   # simulate a recoverable lapse (tier kept, billing state degraded)
//   ... --user user_xxx --tier starter --status past_due
//
// Prints the row BEFORE and AFTER every write, because "what did this change"
// is the question you have five minutes later and the answer is otherwise gone.
//
// ── WHAT THIS IS NOT ──────────────────────────────────────────────────────────
//
// It is not a billing operation. It moves no money, creates no Stripe object
// and cancels nothing. A tier granted here is an entitlement the customer is
// not paying for; a tier revoked here leaves any live Stripe subscription
// running and still charging. Use it on test data. If you point it at prod, you
// are editing what a real person is entitled to, which is why --prod exists.
//
// ── NO SDK, ON PURPOSE ────────────────────────────────────────────────────────
//
// tools/scripts is not a workspace package and the repo root does not depend on
// @supabase/supabase-js. This talks to PostgREST over plain `fetch`, so it runs
// with bare `node` from a fresh clone with nothing installed.

const TIERS = ["none", "starter", "professional", "enterprise"];
// Mirrors the CHECK constraint on public.host_subscriptions (migration 083) and
// HostBillingStatusValue in packages/db. A value outside it is rejected by the
// database anyway; rejecting it here turns a 400 with a constraint name into a
// sentence.
const BILLING_STATUSES = [
  "none",
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "unpaid",
  "paused",
];

const TABLE = "host_subscriptions";
const SELECT_COLUMNS =
  "clerk_user_id,tier,billing_status,stripe_customer_id,stripe_subscription_id,current_period_end,updated_at";

const argv = process.argv.slice(2);

function flag(name) {
  return argv.includes(`--${name}`);
}

function option(name) {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function usage(message) {
  if (message) console.error(`[entitlement] ${message}\n`);
  console.error(
    "usage: node tools/scripts/grant-entitlement.mjs --user <clerk_user_id> --tier <none|starter|professional|enterprise>\n" +
      "  --status <none|trialing|active|past_due|cancelled|unpaid|paused>   billing_status override (default: derived from tier)\n" +
      "  --prod                                                            required to write a production Supabase project\n" +
      "  --dry-run                                                         read and print, change nothing",
  );
  process.exit(1);
}

const clerkUserId = option("user");
const tier = option("tier");
const statusOverride = option("status");
const DRY_RUN = flag("dry-run");

if (!clerkUserId) usage("--user <clerk_user_id> is required.");
if (!tier) usage("--tier is required.");
if (!TIERS.includes(tier)) usage(`--tier must be one of: ${TIERS.join(", ")}`);
if (statusOverride && !BILLING_STATUSES.includes(statusOverride)) {
  usage(`--status must be one of: ${BILLING_STATUSES.join(", ")}`);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) usage("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) must be set.");
if (!serviceRoleKey) {
  usage(
    "SUPABASE_SERVICE_ROLE_KEY must be set. host_subscriptions revokes all writes from anon and authenticated (083) — a host who could write it could award themselves a plan — so there is no lesser key that works.",
  );
}

// ── say where you are pointed, then refuse to guess ───────────────────────────
//
// The lesson tools/db-assert/run-sql.mjs already learned the hard way: nothing
// here knew where it was aimed, and a pasted connection string is one keystroke
// from production. This prints the resolved project ref every run — a target you
// can see is a target you can catch — and refuses anything that is not local
// unless --prod says so out loud.
//
// Unlike run-sql.mjs this does NOT hard-refuse remote hosts: granting a tier to
// a founder's own account on a staging or production project is a legitimate
// operation this tool exists for. The gate is explicitness, not prohibition.

/** The Supabase project ref, or null for a local/self-hosted URL. */
function projectRef(url) {
  try {
    const host = new URL(url).hostname;
    const match = /^([a-z0-9]+)\.supabase\.(co|in|red)$/.exec(host);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function isLocalUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

const ref = projectRef(supabaseUrl);
const local = isLocalUrl(supabaseUrl);
const target = local ? "LOCAL" : ref ? `HOSTED project ${ref}` : "UNRECOGNISED host";

console.log(`[entitlement] target   : ${target}`);
console.log(`[entitlement] url      : ${supabaseUrl}`);
console.log(`[entitlement] user     : ${clerkUserId}`);
console.log(`[entitlement] tier     : ${tier}`);
console.log(`[entitlement] status   : ${statusOverride ?? `(derived: ${tier === "none" ? "none" : "active"})`}`);
console.log("");

if (!local && !flag("prod") && !DRY_RUN) {
  console.error(
    `[entitlement] REFUSING: ${supabaseUrl} is not a local Supabase. This writes what a real person is entitled to. Re-run with --prod if that is what you mean, or --dry-run to look without touching.`,
  );
  process.exit(1);
}

// ── PostgREST over fetch ──────────────────────────────────────────────────────

function headers(extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra,
  };
}

async function readRow() {
  const query = new URLSearchParams({
    clerk_user_id: `eq.${clerkUserId}`,
    select: SELECT_COLUMNS,
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/${TABLE}?${query.toString()}`, {
    headers: headers(),
  });
  if (!response.ok) {
    throw new Error(`read failed (${response.status}): ${await response.text()}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function upsertRow(row) {
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${TABLE}?on_conflict=clerk_user_id&select=${SELECT_COLUMNS}`,
    {
      method: "POST",
      headers: headers({
        "Content-Type": "application/json",
        // merge-duplicates makes this an UPSERT keyed on the primary key, which
        // is what upsertHostSubscription does in the app. representation makes
        // PostgREST hand the written row back, so the AFTER print is what the
        // database now holds and not what this script hoped it wrote.
        Prefer: "resolution=merge-duplicates,return=representation",
      }),
      body: JSON.stringify([row]),
    },
  );
  if (!response.ok) {
    throw new Error(`write failed (${response.status}): ${await response.text()}`);
  }
  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function printRow(label, row) {
  console.log(`--- ${label} ---`);
  if (!row) {
    console.log("(no row)");
  } else {
    for (const key of SELECT_COLUMNS.split(",")) {
      console.log(`  ${key.padEnd(24)} ${row[key] ?? "(null)"}`);
    }
  }
  console.log("");
}

/**
 * `billing_status` defaults from the tier the same way upsertHostSubscription
 * does: a tier of 'none' means the subscription is not currently paying. Kept
 * in step deliberately — a tool that seeded a DIFFERENT default would be
 * testing a state the webhook can never produce.
 */
const billingStatus = statusOverride ?? (tier === "none" ? "none" : "active");

try {
  const before = await readRow();
  printRow("BEFORE", before);

  if (DRY_RUN) {
    console.log(
      `[entitlement] --dry-run: would upsert tier='${tier}' billing_status='${billingStatus}' for ${clerkUserId}. Nothing written.`,
    );
    process.exit(0);
  }

  const after = await upsertRow({
    clerk_user_id: clerkUserId,
    tier,
    billing_status: billingStatus,
    updated_at: new Date().toISOString(),
  });
  printRow("AFTER", after);

  // host_profiles.subscription_tier is the DENORMALIZED read copy that listing,
  // search and badge queries join (083). The webhook writes both; this tool
  // writes only the authority, on purpose — leaving the copy alone is what makes
  // "does the app read the authority or the cache" a testable question rather
  // than one this tool quietly answers for you. create_my_host_profile re-seeds
  // the copy from the authority on every call.
  console.log(
    "[entitlement] NOTE: host_profiles.subscription_tier (the denormalized read copy) was NOT written.\n" +
      "              That is deliberate — it keeps 'authority vs cache' testable. Re-run\n" +
      "              create_my_host_profile, or write the column directly, if a surface you are\n" +
      "              testing reads the copy.",
  );
  console.log("[entitlement] RESULT: OK");
} catch (error) {
  console.error(`[entitlement] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
