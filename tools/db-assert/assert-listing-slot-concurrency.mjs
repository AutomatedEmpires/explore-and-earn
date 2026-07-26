#!/usr/bin/env node
// Connected proof that a REDELIVERED add-on cancellation takes the allowance
// back exactly once (migration 085's revoke_listing_slot_purchase).
//
// WHY THIS IS ITS OWN RUNNER. Every other suite here is a single psql script in
// a single transaction. This defect only appears when two transactions OVERLAP,
// so it needs two sessions whose interleaving is under our control — something a
// single script cannot express, and something dblink cannot supply either (the
// local `postgres` role is not a superuser, and a non-superuser dblink
// connection is refused unless the server actually consumed a password, which
// a trust-authenticated local connection never does).
//
// THE DEFECT. revoke_listing_slot_purchase used to `select * into v_row` BEFORE
// taking the per-host advisory lock, decide from that snapshot, and then issue
// an unguarded `update ... where id = v_row.id`. Two overlapping deliveries of
// customer.subscription.deleted — which Stripe sends at least once — both read
// status 'active', both passed the check, and both subtracted. A balance of 5
// went to 2 and then to 0 against ONE cancelled ledger row.
//
// THE INTERLEAVING, driven explicitly rather than by luck:
//
//   A  BEGIN; take the per-host advisory lock; hold it
//   B  call revoke -> its pre-lock read of the ledger row happens HERE, seeing
//      'active', and it then blocks on A's lock
//   A  call revoke (already holds the lock, so no wait); COMMIT; lock released
//   B  wakes and runs the rest of the function
//
// B is guaranteed to be blocked before A commits, because A waits until B's
// backend is observably in a lock wait (pg_stat_activity) before proceeding.
//
// THE NUMBERS ARE CHOSEN SO THE TWO OUTCOMES DIFFER. quantity 3 against a
// balance of 5: correct is 2, double-decrement is 0. Had they been equal, the
// greatest(..., 0) floor would report 0 either way — which is exactly how the
// original defect stayed invisible.
//
// Usage:
//   DATABASE_URL=postgres://... node ./assert-listing-slot-concurrency.mjs
//
// Requires `psql` on PATH. No npm dependencies (keeps the lockfile untouched).

import { spawn, spawnSync } from "node:child_process"

const LABEL = "assert-listing-slot-concurrency"

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const hasLibpqEnvironment = Boolean(process.env.PGHOST && process.env.PGUSER)
if (!dbUrl && !hasLibpqEnvironment) {
  console.error(
    `${LABEL}: set DATABASE_URL, SUPABASE_DB_URL, or standard libpq PG* variables.`,
  )
  process.exit(2)
}
const connectionArgs = dbUrl ? [dbUrl] : []

const HOST_ID = "08500000-0000-4000-8000-000000000001"
const CLERK_ID = "user_db_assert_slots"
const SUBSCRIPTION_ID = "sub_assert_slots"
const LOCK_KEY = `listing_slots:${HOST_ID}`
const STARTING_BALANCE = 5
const PURCHASE_QUANTITY = 3

/** Run SQL to completion and return trimmed stdout, failing the process on error. */
function psql(sql, { tuplesOnly = true } = {}) {
  const result = spawnSync(
    "psql",
    [...connectionArgs, "-v", "ON_ERROR_STOP=1", ...(tuplesOnly ? ["-tA"] : []), "-c", sql],
    { encoding: "utf8" },
  )
  if (result.error) {
    console.error(`${LABEL}: failed to run psql - ${result.error.message}`)
    process.exit(2)
  }
  if (result.status !== 0) {
    console.error(`${LABEL}: psql failed\n${result.stderr}`)
    process.exit(result.status === null ? 1 : result.status)
  }
  return result.stdout.trim()
}

/** A psql session fed over stdin, so statements can be issued one at a time. */
function openSession() {
  const child = spawn(
    "psql",
    [...connectionArgs, "-v", "ON_ERROR_STOP=1", "-tA"],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
  let stderr = ""
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })
  child.stdout.resume()

  // One promise, created once. The finally block closes both sessions
  // unconditionally, so close() is called a second time on a child that has
  // already exited — and a fresh Promise there would wait forever for a "close"
  // event that already fired, hanging the process on an unsettled await.
  let closed = null
  return {
    send: (sql) => child.stdin.write(`${sql}\n`),
    close: () => {
      if (!closed) {
        closed = new Promise((resolve) => {
          child.on("close", (code) => resolve({ code, stderr }))
          child.stdin.end()
        })
      }
      return closed
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function cleanup() {
  psql(`
    delete from public.host_listing_slot_purchases where host_profile_id = '${HOST_ID}';
    delete from public.host_profiles where id = '${HOST_ID}';
    delete from public.host_subscriptions where clerk_user_id = '${CLERK_ID}';
  `)
}

function seed() {
  psql(`
    insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
    values ('${CLERK_ID}', 'starter', 'active');

    insert into public.host_profiles (
      id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
      purchased_listing_slots
    ) values (
      '${HOST_ID}', null, '${CLERK_ID}', 'Slot revoke assertion host',
      'slot-revoke-assertion-host', array['farm']::text[], ${STARTING_BALANCE}
    );

    insert into public.host_listing_slot_purchases (
      host_profile_id, quantity, unit_amount_cents, tier_at_purchase,
      status, stripe_checkout_session_id, stripe_subscription_id
    ) values (
      '${HOST_ID}', ${PURCHASE_QUANTITY}, 9900, 'starter', 'active',
      'cs_assert_slots', '${SUBSCRIPTION_ID}'
    );
  `)
}

/** True once some backend is waiting on our advisory lock — i.e. B is parked. */
function blockedBackendCount() {
  return Number(
    psql(`
      select count(*)
        from pg_stat_activity
       where wait_event_type = 'Lock'
         and state = 'active'
         and query like '%revoke_listing_slot_purchase%'
    `),
  )
}

async function main() {
  // Leading cleanup so an interrupted earlier run cannot fail this one.
  cleanup()
  seed()

  const sessionA = openSession()
  const sessionB = openSession()
  let failure = null

  try {
    // A takes and holds the lock revoke_listing_slot_purchase serializes on.
    sessionA.send("begin;")
    sessionA.send(`select pg_advisory_xact_lock(hashtextextended('${LOCK_KEY}', 0));`)
    await sleep(400)

    // B enters the function: it reads the ledger row (status 'active') and then
    // blocks on A's lock. This is the exact window the defect lived in.
    sessionB.send(`select public.revoke_listing_slot_purchase('${SUBSCRIPTION_ID}');`)

    // Wait for B to be observably parked rather than guessing at a duration —
    // if B had not reached the lock, this would prove nothing at all.
    let waited = 0
    while (blockedBackendCount() < 1 && waited < 10_000) {
      await sleep(100)
      waited += 100
    }
    if (blockedBackendCount() < 1) {
      throw new Error(
        "the second caller never blocked on the advisory lock — the interleaving this proves did not happen",
      )
    }

    // A performs the real revocation and commits, releasing the lock.
    sessionA.send(`select public.revoke_listing_slot_purchase('${SUBSCRIPTION_ID}');`)
    sessionA.send("commit;")
    await sessionA.close()

    // B wakes and finishes.
    await sessionB.close()

    const balance = Number(
      psql(`select purchased_listing_slots from public.host_profiles where id = '${HOST_ID}'`),
    )
    const expected = STARTING_BALANCE - PURCHASE_QUANTITY
    if (balance !== expected) {
      throw new Error(
        `a redelivered cancellation left the allowance at ${balance}, expected ${expected} ` +
          `(${STARTING_BALANCE} - ${PURCHASE_QUANTITY} exactly once)`,
      )
    }

    const cancelled = Number(
      psql(`
        select count(*) from public.host_listing_slot_purchases
         where stripe_subscription_id = '${SUBSCRIPTION_ID}' and status = 'cancelled'
      `),
    )
    if (cancelled !== 1) {
      throw new Error(`the ledger row was cancelled ${cancelled} times, expected exactly 1`)
    }

    console.log(
      `${LABEL}: two overlapping cancellations decremented the allowance once (${STARTING_BALANCE} -> ${balance})`,
    )
  } catch (error) {
    failure = error
  } finally {
    await sessionA.close().catch(() => {})
    await sessionB.close().catch(() => {})
    cleanup()
  }

  if (failure) {
    console.error(`${LABEL}: ${failure.message}`)
    process.exit(1)
  }
}

await main()
