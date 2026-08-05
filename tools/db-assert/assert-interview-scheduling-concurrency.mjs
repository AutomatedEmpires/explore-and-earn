#!/usr/bin/env node
// Connected proof that one seeker cannot confirm two overlapping interviews
// when both selections are submitted concurrently.
//
// The ordinary interview assertion suite runs in one psql transaction, so it
// can prove range semantics but cannot prove the advisory-lock interleaving.
// This runner opens two real psql sessions, observes the second backend waiting
// on the first session's seeker lock, and then verifies that exactly one of the
// overlapping selections commits. It also confirms that an exactly adjacent
// interview remains legal under the same half-open [start, end) range contract.
//
// Requires psql on PATH. No npm dependencies.

import { spawn, spawnSync } from "node:child_process"

import { assertLocalTarget } from "./run-sql.mjs"

const LABEL = "assert-interview-scheduling-concurrency"
const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL
const hasLibpqEnvironment = Boolean(process.env.PGHOST && process.env.PGUSER)

if (!dbUrl && !hasLibpqEnvironment) {
  console.error(
    `${LABEL}: set DATABASE_URL, SUPABASE_DB_URL, or standard libpq PG* variables.`,
  )
  process.exit(2)
}

try {
  assertLocalTarget(process.env)
} catch (error) {
  console.error(`${LABEL}: ${error instanceof Error ? error.message : error}`)
  process.exit(2)
}

const connectionArgs = dbUrl ? [dbUrl] : []
const HOST_ID = "88600000-0000-4000-8000-000000000001"
const SEEKER_ID = "88610000-0000-4000-8000-000000000001"
const HOST_CLERK_ID = "user_schedule_concurrency_host"
const SEEKER_CLERK_ID = "user_schedule_concurrency_seeker"
const LISTING_IDS = [
  "88620000-0000-4000-8000-000000000001",
  "88620000-0000-4000-8000-000000000002",
  "88620000-0000-4000-8000-000000000003",
]
const APPLICATION_IDS = [
  "88630000-0000-4000-8000-000000000001",
  "88630000-0000-4000-8000-000000000002",
  "88630000-0000-4000-8000-000000000003",
]
const runSuffix = `${process.pid}_${Date.now()}`
const SESSION_A_NAME = `schedule_concurrency_a_${runSuffix}`
const SESSION_B_NAME = `schedule_concurrency_b_${runSuffix}`

function sqlList(values) {
  return values.map((value) => `'${value}'`).join(", ")
}

/** Run SQL to completion and return trimmed stdout, failing on any SQL error. */
function psql(sql, { tuplesOnly = true } = {}) {
  const result = spawnSync(
    "psql",
    [
      ...connectionArgs,
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      ...(tuplesOnly ? ["-tA"] : []),
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  )
  if (result.error) {
    throw new Error(`failed to run psql - ${result.error.message}`)
  }
  if (result.status !== 0) {
    throw new Error(`psql failed\n${result.stderr}`)
  }
  return result.stdout.trim()
}

/** A psql session fed over stdin so its transaction can be held deliberately. */
function openSession() {
  const child = spawn(
    "psql",
    [...connectionArgs, "-X", "-v", "ON_ERROR_STOP=1", "-tA"],
    { stdio: ["pipe", "pipe", "pipe"] },
  )
  let stdout = ""
  let stderr = ""
  child.stdout.on("data", (chunk) => {
    stdout += String(chunk)
  })
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk)
  })
  // Ending stdin after an ON_ERROR_STOP exit can race with process teardown.
  child.stdin.on("error", () => {})

  const closed = new Promise((resolve) => {
    child.once("close", (code) => resolve({ code, stdout, stderr }))
  })
  let closing = null

  return {
    send(sql) {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) {
        child.stdin.write(`${sql}\n`)
      }
    },
    close() {
      if (!closing) {
        closing = (async () => {
          if (!child.stdin.destroyed && !child.stdin.writableEnded) {
            child.stdin.end()
          }
          let timer
          const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 10_000)
          })
          const result = await Promise.race([closed, timeout])
          clearTimeout(timer)
          if (result) return result
          child.kill("SIGTERM")
          await closed
          throw new Error("psql session did not exit within ten seconds")
        })()
      }
      return closing
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitUntil(label, predicate) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await sleep(100)
  }
  throw new Error(`timed out waiting for ${label}`)
}

function cleanup() {
  psql(`
    delete from public.events
     where subject_id in (
       select id from public.scheduling_requests
        where application_id in (${sqlList(APPLICATION_IDS)})
     )
        or subject_id in (${sqlList(APPLICATION_IDS)})
        or properties ->> 'applicationId' in (${sqlList(APPLICATION_IDS)})
        or listing_id in (${sqlList(LISTING_IDS)})
        or host_profile_id = '${HOST_ID}'
        or seeker_profile_id = '${SEEKER_ID}';
    delete from public.applications where id in (${sqlList(APPLICATION_IDS)});
    delete from public.listings where id in (${sqlList(LISTING_IDS)});
    delete from public.seeker_profiles where id = '${SEEKER_ID}';
    delete from public.host_profiles where id = '${HOST_ID}';
    delete from public.host_subscriptions where clerk_user_id = '${HOST_CLERK_ID}';
  `)
}

function seed() {
  psql(`
    insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
    values ('${HOST_CLERK_ID}', 'enterprise', 'active');

    insert into public.host_profiles (
      id, owner_user_id, clerk_user_id, company_name, slug, category_scopes,
      subscription_tier
    ) values (
      '${HOST_ID}', null, '${HOST_CLERK_ID}',
      'Scheduling concurrency host', 'scheduling-concurrency-host',
      array['farm']::text[], 'enterprise'
    );

    insert into public.seeker_profiles (id, clerk_user_id, display_name)
    values ('${SEEKER_ID}', '${SEEKER_CLERK_ID}', 'Scheduling concurrency seeker');

    insert into public.listings (id, host_profile_id, title, category, status)
    values
      ('${LISTING_IDS[0]}', '${HOST_ID}', 'Concurrent interview A', 'farm', 'draft'),
      ('${LISTING_IDS[1]}', '${HOST_ID}', 'Concurrent interview B', 'farm', 'draft'),
      ('${LISTING_IDS[2]}', '${HOST_ID}', 'Adjacent interview C', 'farm', 'draft');

    insert into public.applications (id, listing_id, seeker_profile_id)
    values
      ('${APPLICATION_IDS[0]}', '${LISTING_IDS[0]}', '${SEEKER_ID}'),
      ('${APPLICATION_IDS[1]}', '${LISTING_IDS[1]}', '${SEEKER_ID}'),
      ('${APPLICATION_IDS[2]}', '${LISTING_IDS[2]}', '${SEEKER_ID}');

    select public.propose_my_host_scheduling_request(
      '${HOST_CLERK_ID}', '${APPLICATION_IDS[0]}', 'video', 30, 'UTC',
      'Concurrency proposal A',
      array[date_trunc('hour', clock_timestamp()) + interval '30 days']
    );
    select public.propose_my_host_scheduling_request(
      '${HOST_CLERK_ID}', '${APPLICATION_IDS[1]}', 'video', 30, 'UTC',
      'Concurrency proposal B',
      array[date_trunc('hour', clock_timestamp()) + interval '30 days 15 minutes']
    );
    select public.propose_my_host_scheduling_request(
      '${HOST_CLERK_ID}', '${APPLICATION_IDS[2]}', 'video', 30, 'UTC',
      'Adjacent proposal C',
      array[date_trunc('hour', clock_timestamp()) + interval '30 days 30 minutes']
    );
  `)
}

function requestAndOption(applicationId) {
  const value = psql(`
    select r.id::text || '|' || o.id::text
      from public.scheduling_requests r
      join public.scheduling_options o
        on o.scheduling_request_id = r.id
       and o.proposal_round = r.current_round
     where r.application_id = '${applicationId}'
  `)
  const [requestId, optionId, extra] = value.split("|")
  if (!requestId || !optionId || extra) {
    throw new Error(`could not resolve one request and option for ${applicationId}`)
  }
  return { requestId, optionId }
}

function sessionStateCount(applicationName, predicate) {
  return Number(
    psql(`
      select count(*)
        from pg_catalog.pg_stat_activity
       where application_name = '${applicationName}'
         and ${predicate}
    `),
  )
}

async function main() {
  let failure = null
  let sessionA = null
  let sessionB = null

  try {
    // Leading cleanup makes a previously interrupted local run recoverable.
    // It sits inside the guarded region so a later fixture-resolution failure
    // still reaches final cleanup.
    cleanup()
    seed()

    const a = requestAndOption(APPLICATION_IDS[0])
    const b = requestAndOption(APPLICATION_IDS[1])
    const c = requestAndOption(APPLICATION_IDS[2])
    sessionA = openSession()
    sessionB = openSession()

    // A owns the exact advisory key used by the RPC and keeps the transaction
    // open. Waiting for idle-in-transaction proves the lock statement finished.
    sessionA.send("\\set VERBOSITY verbose")
    sessionA.send(`set application_name = '${SESSION_A_NAME}';`)
    sessionA.send("begin;")
    sessionA.send(
      `select pg_catalog.pg_advisory_xact_lock(` +
        `pg_catalog.hashtextextended('${SEEKER_ID}'::text, 8801));`,
    )
    await waitUntil("session A to hold the seeker selection lock", () =>
      sessionStateCount(
        SESSION_A_NAME,
        "state = 'idle in transaction' and exists (" +
          "select 1 from pg_catalog.pg_locks held_lock " +
          "where held_lock.pid = pg_stat_activity.pid " +
          "and held_lock.locktype = 'advisory' and held_lock.granted" +
          ")",
      ) === 1,
    )

    // B locks its own request row and then parks on A's seeker lock. The
    // pg_stat_activity wait is the proof that the two selection transactions
    // truly overlap; there is no timing guess here.
    sessionB.send("\\set VERBOSITY verbose")
    sessionB.send(`set application_name = '${SESSION_B_NAME}';`)
    sessionB.send(
      `select public.respond_to_my_scheduling_request(` +
        `'${SEEKER_CLERK_ID}', '${b.requestId}', 'selected', '${b.optionId}');`,
    )
    await waitUntil("session B to block on the seeker selection lock", () =>
      sessionStateCount(
        SESSION_B_NAME,
        "state = 'active' and wait_event_type = 'Lock' " +
          "and query like '%respond_to_my_scheduling_request%'",
      ) === 1,
    )

    // A confirms the baseline slot and commits. B must then wake, observe A's
    // committed selection, and fail with the stable overlap error/SQLSTATE.
    sessionA.send(
      `select public.respond_to_my_scheduling_request(` +
        `'${SEEKER_CLERK_ID}', '${a.requestId}', 'selected', '${a.optionId}');`,
    )
    sessionA.send("commit;")
    const aResult = await sessionA.close()
    if (aResult.code !== 0) {
      throw new Error(`baseline selection failed\n${aResult.stderr}`)
    }

    const bResult = await sessionB.close()
    if (bResult.code === 0) {
      throw new Error("both overlapping selections committed")
    }
    if (
      !bResult.stderr.includes("scheduling_time_conflict") ||
      !bResult.stderr.includes("23P01")
    ) {
      throw new Error(
        `overlapping selection failed for the wrong reason\n${bResult.stderr}`,
      )
    }

    const overlapStates = psql(`
      select application_id::text || ':' || status
        from public.scheduling_requests
       where application_id in ('${APPLICATION_IDS[0]}', '${APPLICATION_IDS[1]}')
       order by application_id
    `)
    const expectedOverlapStates =
      `${APPLICATION_IDS[0]}:selected\n${APPLICATION_IDS[1]}:proposed`
    if (overlapStates !== expectedOverlapStates) {
      throw new Error(
        `overlapping selections ended in unexpected states:\n${overlapStates}`,
      )
    }

    const adjacentResult = psql(`
      select public.respond_to_my_scheduling_request(
        '${SEEKER_CLERK_ID}', '${c.requestId}', 'selected', '${c.optionId}'
      )
    `)
    if (adjacentResult !== "t") {
      throw new Error("the exactly adjacent interview was not selectable")
    }

    const selectedCount = Number(
      psql(`
        select count(*)
          from public.scheduling_requests
         where application_id in ('${APPLICATION_IDS[0]}', '${APPLICATION_IDS[2]}')
           and status = 'selected'
      `),
    )
    if (selectedCount !== 2) {
      throw new Error(
        `expected baseline and adjacent interviews to be selected, found ${selectedCount}`,
      )
    }

    console.log(
      `${LABEL}: one overlapping selection committed, one was rejected, and the adjacent selection committed`,
    )
  } catch (error) {
    failure = error
  } finally {
    if (sessionA) await sessionA.close().catch(() => {})
    if (sessionB) await sessionB.close().catch(() => {})
    try {
      cleanup()
    } catch (error) {
      if (!failure) failure = error
      else {
        console.error(
          `${LABEL}: cleanup also failed - ${error instanceof Error ? error.message : error}`,
        )
      }
    }
  }

  if (failure) {
    console.error(`${LABEL}: ${failure instanceof Error ? failure.message : failure}`)
    process.exit(1)
  }
}

await main()
