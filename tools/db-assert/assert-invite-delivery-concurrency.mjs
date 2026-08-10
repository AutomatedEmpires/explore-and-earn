#!/usr/bin/env node
// Two-session proof for migration 094's invite notification/refund boundary.
//
// Scenario A (delivery first): claim establishes a processing lease and the
// exact worker-bound pre-send recheck renews it. Withdrawal cannot cross that
// provider gap. Settlement then owns the invite lock while a concurrent retry
// waits; delivery wins and withdrawal cannot restore the spent credit.
//
// Scenario B (withdrawal first): withdrawal owns the invite lock while the
// provider pre-send recheck waits on get_invite_notification_state's FOR SHARE.
// The recheck wakes only after withdrawal commits and fails its exact
// worker/status fence; the unsent delivery/digest work remains cancelled and
// cannot later be claimed or settled, while credit is restored once.
//
// Scenario C (outcome unknown): the discriminator is immutable at the table
// boundary and withdrawal preserves that audit row without restoring credit.
//
// Requires psql on PATH. No npm dependencies.

import { spawn, spawnSync } from "node:child_process"

import { assertLocalTarget } from "./run-sql.mjs"

const LABEL = "assert-invite-delivery-concurrency"
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
const HOST_ID = "9490a000-0000-4000-8000-000000000001"
const SEEKER_IDS = [
  "94901000-0000-4000-8000-000000000001",
  "94901000-0000-4000-8000-000000000002",
  "94901000-0000-4000-8000-000000000003",
]
const LISTING_ID = "94906000-0000-4000-8000-000000000001"
const INVITE_IDS = [
  "94907000-0000-4000-8000-000000000001",
  "94907000-0000-4000-8000-000000000002",
  "94907000-0000-4000-8000-000000000003",
]
const EVENT_IDS = [
  "9490f000-0000-4000-8000-000000000001",
  "9490f000-0000-4000-8000-000000000002",
  "9490f000-0000-4000-8000-000000000003",
]
const DELIVERY_IDS = [
  "9490d000-0000-4000-8000-000000000001",
  "9490d000-0000-4000-8000-000000000002",
  "9490d000-0000-4000-8000-000000000003",
]
const HOST_CLERK_ID = "user_invite_delivery_concurrency_host"
const SEEKER_CLERK_IDS = [
  "user_invite_delivery_concurrency_seeker_a",
  "user_invite_delivery_concurrency_seeker_b",
  "user_invite_delivery_concurrency_seeker_c",
]
const runSuffix = `${process.pid}_${Date.now()}`
let originalRolloutAppliedAtEpoch = null

function sqlList(values) {
  return values.map((value) => `'${value}'`).join(", ")
}

function psql(sql) {
  const result = spawnSync(
    "psql",
    [...connectionArgs, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-tA", "-c", sql],
    { encoding: "utf8" },
  )
  if (result.error) throw new Error(`failed to run psql - ${result.error.message}`)
  if (result.status !== 0) throw new Error(`psql failed\n${result.stderr}`)
  return result.stdout.trim()
}

function openSession(applicationName) {
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
  child.stdin.on("error", () => {})
  const closed = new Promise((resolve) => {
    child.once("close", (code) => resolve({ code, stdout, stderr }))
  })
  let closing = null
  child.stdin.write(`set application_name = '${applicationName}';\n`)

  return {
    send(sql) {
      if (!child.stdin.destroyed && !child.stdin.writableEnded) {
        child.stdin.write(`${sql}\n`)
      }
    },
    async close() {
      if (!closing) {
        closing = (async () => {
          if (!child.stdin.destroyed && !child.stdin.writableEnded) child.stdin.end()
          let timer
          const timeout = new Promise((resolve) => {
            timer = setTimeout(() => resolve(null), 10_000)
          })
          const result = await Promise.race([closed, timeout])
          clearTimeout(timer)
          if (result) return result
          child.kill("SIGTERM")
          await closed
          throw new Error(`${applicationName} did not exit within ten seconds`)
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

function sessionCount(applicationName, predicate) {
  return Number(
    psql(`
      select count(*)
        from pg_catalog.pg_stat_activity
       where application_name = '${applicationName}'
         and ${predicate}
    `),
  )
}

function cleanup() {
  psql(`
    delete from public.digest_memberships
     where delivery_id in (${sqlList(DELIVERY_IDS)})
        or event_id in (${sqlList(EVENT_IDS)});
    delete from public.notification_deliveries where id in (${sqlList(DELIVERY_IDS)});
    delete from public.invite_credit_events where invite_id in (${sqlList(INVITE_IDS)});
    delete from public.events where id in (${sqlList(EVENT_IDS)});
    delete from public.invites where id in (${sqlList(INVITE_IDS)});
    delete from public.listings where id = '${LISTING_ID}';
    delete from public.seeker_profiles where id in (${sqlList(SEEKER_IDS)});
    delete from public.host_profiles where id = '${HOST_ID}';
    delete from public.host_subscriptions where clerk_user_id = '${HOST_CLERK_ID}';
  `)
}

function seed() {
  psql(`
    begin;

    update public.invite_authority_rollout_094
       set applied_at = clock_timestamp() - interval '331 seconds'
     where singleton is true;

    insert into public.host_subscriptions (clerk_user_id, tier, billing_status)
    values ('${HOST_CLERK_ID}', 'starter', 'active');

    insert into public.host_profiles (
      id, clerk_user_id, company_name, slug, category_scopes,
      public_status, account_status
    ) values (
      '${HOST_ID}', '${HOST_CLERK_ID}', 'Invite concurrency host',
      'invite-concurrency-host', array['farm'], 'active', 'active'
    );

    insert into public.seeker_profiles (
      id, clerk_user_id, display_name, visibility_status,
      host_discovery_enabled, onboarding_complete
    ) values
      ('${SEEKER_IDS[0]}', '${SEEKER_CLERK_IDS[0]}', 'Invite concurrency seeker A', 'platform', true, true),
      ('${SEEKER_IDS[1]}', '${SEEKER_CLERK_IDS[1]}', 'Invite concurrency seeker B', 'platform', true, true),
      ('${SEEKER_IDS[2]}', '${SEEKER_CLERK_IDS[2]}', 'Invite concurrency seeker C', 'platform', true, true);

    insert into public.listings (
      id, host_profile_id, title, category, status, provenance,
      housing_included, meals_included, housing_evidence, meals_evidence,
      pay_evidence, compensation_min_cents, compensation_unit, expires_at
    ) values (
      '${LISTING_ID}', '${HOST_ID}', 'Invite concurrency listing', 'farm',
      'live', 'verified', false, false, 'confirmed', 'confirmed', 'confirmed',
      2500, 'hour', clock_timestamp() + interval '30 days'
    );

    insert into public.invites (
      id, listing_id, host_profile_id, seeker_profile_id, status, expires_at
    ) values
      ('${INVITE_IDS[0]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[0]}', 'created', clock_timestamp() + interval '14 days'),
      ('${INVITE_IDS[1]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[1]}', 'created', clock_timestamp() + interval '14 days'),
      ('${INVITE_IDS[2]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[2]}', 'created', clock_timestamp() + interval '14 days');

    insert into public.invite_credit_events (
      host_profile_id, kind, source, credits, invite_id, period_key
    ) values
      ('${HOST_ID}', 'consume', 'monthly', 1, '${INVITE_IDS[0]}', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')),
      ('${HOST_ID}', 'consume', 'monthly', 1, '${INVITE_IDS[1]}', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM')),
      ('${HOST_ID}', 'consume', 'monthly', 1, '${INVITE_IDS[2]}', to_char(clock_timestamp() at time zone 'utc', 'YYYY-MM'));

    insert into public.events (
      id, event_type, actor_scope, subject_type, subject_id,
      listing_id, host_profile_id, seeker_profile_id, source_surface, properties
    ) values
      ('${EVENT_IDS[0]}', 'invite_created', 'host', 'invite', '${INVITE_IDS[0]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[0]}', 'db_assert_concurrency', '{}'::jsonb),
      ('${EVENT_IDS[1]}', 'invite_created', 'host', 'invite', '${INVITE_IDS[1]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[1]}', 'db_assert_concurrency', '{}'::jsonb),
      ('${EVENT_IDS[2]}', 'invite_created', 'host', 'invite', '${INVITE_IDS[2]}', '${LISTING_ID}', '${HOST_ID}', '${SEEKER_IDS[2]}', 'db_assert_concurrency', '{}'::jsonb);

    insert into public.notification_deliveries (
      id, event_id, recipient_clerk_user_id, channel, category,
      notification_type, variant, dedup_key, status, cadence,
      worker_id, lease_expires_at, next_attempt_at, failure_class,
      provider_started_at
    ) values
      ('${DELIVERY_IDS[0]}', '${EVENT_IDS[0]}', '${SEEKER_CLERK_IDS[0]}', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-invite-concurrency-a', 'pending', 'immediate', null, null, clock_timestamp() - interval '2 minutes', null, null),
      ('${DELIVERY_IDS[1]}', '${EVENT_IDS[1]}', '${SEEKER_CLERK_IDS[1]}', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-invite-concurrency-b', 'dead_letter', 'immediate', null, null, clock_timestamp() - interval '1 minute', 'known_unsent', null),
      ('${DELIVERY_IDS[2]}', '${EVENT_IDS[2]}', '${SEEKER_CLERK_IDS[2]}', 'email', 'offers_invites', 'invite_received', 'default', 'db-assert-invite-concurrency-c', 'dead_letter', 'immediate', null, null, clock_timestamp() - interval '1 minute', 'outcome_unknown', clock_timestamp());

    alter table public.digest_memberships
      disable trigger trg_digest_memberships_no_invite_queue_094;
    insert into public.digest_memberships (
      recipient_clerk_user_id, cadence, category, event_id, delivery_id, status
    ) values (
      '${SEEKER_CLERK_IDS[1]}', 'daily', 'offers_invites',
      '${EVENT_IDS[1]}', '${DELIVERY_IDS[1]}', 'queued'
    );
    alter table public.digest_memberships
      enable trigger trg_digest_memberships_no_invite_queue_094;

    commit;
  `)
}

async function runDeliveryFirst() {
  const claimed = psql(`
    begin;
    set local role service_role;
    select count(*)::text || '|' ||
           bool_and(
             claimed.lease_expires_at >= clock_timestamp() + interval '320 seconds'
           )::text
      from public.claim_notification_deliveries_v2(
        'worker-concurrency-a', 1, 120
      ) claimed
     where claimed.id = '${DELIVERY_IDS[0]}';
    commit;
  `)
  if (claimed !== "1|true") {
    throw new Error(`invite claim/initial lease drifted: ${claimed}`)
  }

  const rechecked = psql(`
    begin;
    set local role service_role;
    select coalesce((
      select state.status
        from public.get_invite_notification_state(
          '${INVITE_IDS[0]}', '${DELIVERY_IDS[0]}', 'worker-concurrency-a'
        ) state
    ), 'NO_ROW');
    commit;
  `)
  if (rechecked !== "created") {
    throw new Error(`worker-bound pre-send recheck drifted: ${rechecked}`)
  }
  const renewed = psql(`
    select lease_expires_at >= clock_timestamp() + interval '320 seconds'
      from public.notification_deliveries
     where id = '${DELIVERY_IDS[0]}'
  `)
  if (renewed !== "t") {
    throw new Error(`worker-bound recheck did not renew the provider-gap lease: ${renewed}`)
  }

  const providerStarted = psql(`
    begin;
    set local role service_role;
    select coalesce((
      select state.status
        from public.begin_invite_notification_delivery(
          '${INVITE_IDS[0]}', '${DELIVERY_IDS[0]}', 'worker-concurrency-a'
        ) state
    ), 'NO_ROW');
    commit;
  `)
  if (providerStarted !== "created") {
    throw new Error(`final provider boundary drifted: ${providerStarted}`)
  }
  const providerGap = psql(`
    select provider_started_at is not null and
           claim_authority_version = '094' and
           lease_expires_at >= clock_timestamp() + interval '320 seconds'
      from public.notification_deliveries
     where id = '${DELIVERY_IDS[0]}'
  `)
  if (providerGap !== "t") {
    throw new Error(`provider-start marker/lease drifted: ${providerGap}`)
  }

  const blockedWithdrawal = JSON.parse(
    psql(`
      set role service_role;
      select public.withdraw_host_invite('${HOST_ID}', '${INVITE_IDS[0]}');
    `),
  )
  if (
    blockedWithdrawal.ok !== false ||
    blockedWithdrawal.error !== "invite_delivery_in_progress"
  ) {
    throw new Error(
      `processing delivery did not block withdrawal: ${JSON.stringify(blockedWithdrawal)}`,
    )
  }
  const blockedState = psql(`
    select i.status || '|' || d.status || '|' || count(r.id)::text
      from public.invites i
      join public.notification_deliveries d on d.id = '${DELIVERY_IDS[0]}'
      left join public.invite_credit_events r
        on r.invite_id = i.id and r.kind = 'restore'
     where i.id = '${INVITE_IDS[0]}'
     group by i.status, d.status
  `)
  if (blockedState !== "created|processing|0") {
    throw new Error(
      `processing barrier state ${blockedState}, expected created|processing|0`,
    )
  }

  const settleName = `invite_settle_first_${runSuffix}`
  const withdrawName = `invite_withdraw_wait_${runSuffix}`
  const settle = openSession(settleName)
  const withdraw = openSession(withdrawName)
  try {
    settle.send("begin;")
    settle.send(`select id from public.invites where id = '${INVITE_IDS[0]}' for update;`)
    await waitUntil("settlement session to hold invite lock", () =>
      sessionCount(settleName, "state = 'idle in transaction'") === 1,
    )

    withdraw.send("begin;")
    withdraw.send("set local role service_role;")
    withdraw.send(`select public.withdraw_host_invite('${HOST_ID}', '${INVITE_IDS[0]}');`)
    await waitUntil("withdrawal to wait behind settlement", () =>
      sessionCount(withdrawName, "state = 'active' and wait_event_type = 'Lock'") === 1,
    )

    settle.send("set local role service_role;")
    settle.send(
      `select public.settle_invite_notification_delivery(` +
        `'${DELIVERY_IDS[0]}', 'worker-concurrency-a', 'provider-concurrency-a', clock_timestamp());`,
    )
    settle.send("commit;")
    const settleResult = await settle.close()
    if (settleResult.code !== 0) throw new Error(`settlement session failed\n${settleResult.stderr}`)

    withdraw.send("commit;")
    const withdrawResult = await withdraw.close()
    if (withdrawResult.code !== 0) throw new Error(`withdrawal session failed\n${withdrawResult.stderr}`)

    const state = psql(`
      select i.status || '|' || d.status || '|' ||
             count(r.id)::text
        from public.invites i
        join public.notification_deliveries d on d.id = '${DELIVERY_IDS[0]}'
        left join public.invite_credit_events r
          on r.invite_id = i.id and r.kind = 'restore'
       where i.id = '${INVITE_IDS[0]}'
       group by i.status, d.status
    `)
    if (state !== "withdrawn|delivered|0") {
      throw new Error(`delivery-first state ${state}, expected withdrawn|delivered|0`)
    }
  } finally {
    await settle.close().catch(() => {})
    await withdraw.close().catch(() => {})
  }
}

async function runWithdrawalFirst() {
  const knownUnsentRequeue = psql(`
    set role service_role;
    update public.notification_deliveries
       set status = 'pending'
     where id = '${DELIVERY_IDS[1]}';
    update public.notification_deliveries
       set status = 'dead_letter',
           failure_class = 'known_unsent'
     where id = '${DELIVERY_IDS[1]}';
    select status || '|' || failure_class
      from public.notification_deliveries
     where id = '${DELIVERY_IDS[1]}';
  `)
  if (knownUnsentRequeue !== "dead_letter|known_unsent") {
    throw new Error(`known-unsent dead letter was not requeueable: ${knownUnsentRequeue}`)
  }

  const withdrawName = `invite_withdraw_first_${runSuffix}`
  const recheckName = `invite_recheck_wait_${runSuffix}`
  const withdraw = openSession(withdrawName)
  const recheck = openSession(recheckName)
  try {
    withdraw.send("begin;")
    withdraw.send("set local role service_role;")
    withdraw.send(`select public.withdraw_host_invite('${HOST_ID}', '${INVITE_IDS[1]}');`)
    await waitUntil("withdrawal session to hold invite lock", () =>
      sessionCount(withdrawName, "state = 'idle in transaction'") === 1,
    )

    recheck.send("begin;")
    recheck.send("set local role service_role;")
    recheck.send(`
      do $fence$
      begin
        perform 1
          from public.get_invite_notification_state(
            '${INVITE_IDS[1]}', '${DELIVERY_IDS[1]}', 'worker-after-withdrawal'
          );
        raise exception 'withdrawn/deferred delivery unexpectedly recheckable';
      exception
        when sqlstate '55000' then
          if sqlerrm <> 'delivery_not_recheckable' then
            raise;
          end if;
      end;
      $fence$;
      select 'FENCED_NO_ROW';
    `)
    await waitUntil("pre-send recheck to wait behind withdrawal", () =>
      sessionCount(recheckName, "state = 'active' and wait_event_type = 'Lock'") === 1,
    )

    withdraw.send("commit;")
    const withdrawResult = await withdraw.close()
    if (withdrawResult.code !== 0) throw new Error(`withdrawal session failed\n${withdrawResult.stderr}`)

    recheck.send("commit;")
    const recheckResult = await recheck.close()
    if (recheckResult.code !== 0) throw new Error(`recheck session failed\n${recheckResult.stderr}`)
    if (!recheckResult.stdout.includes("FENCED_NO_ROW")) {
      throw new Error(
        `recheck did not fail its worker/status fence after waiting: ${recheckResult.stdout}`,
      )
    }

    const reclaimed = Number(
      psql(`
        begin;
        set local role service_role;
        select count(*)
          from public.claim_notification_deliveries_v2(
            'worker-after-withdrawal', 100, 120
          ) claimed
         where claimed.id = '${DELIVERY_IDS[1]}';
        rollback;
      `),
    )
    if (reclaimed !== 0) {
      throw new Error(`withdrawn delivery was reclaimed ${reclaimed} times`)
    }

    const lateSettle = JSON.parse(
      psql(`
        set role service_role;
        select public.settle_invite_notification_delivery(
          '${DELIVERY_IDS[1]}', 'worker-after-withdrawal', null,
          clock_timestamp()
        );
      `),
    )
    if (lateSettle.ok !== false || lateSettle.error !== "delivery_not_settleable") {
      throw new Error(`withdrawn delivery late-settle result drifted: ${JSON.stringify(lateSettle)}`)
    }

    const state = psql(`
      select i.status || '|' || d.status || '|' || dm.status || '|' ||
             count(r.id)::text
        from public.invites i
        join public.notification_deliveries d on d.id = '${DELIVERY_IDS[1]}'
        join public.digest_memberships dm on dm.delivery_id = d.id
        left join public.invite_credit_events r
          on r.invite_id = i.id and r.kind = 'restore'
       where i.id = '${INVITE_IDS[1]}'
       group by i.status, d.status, dm.status
    `)
    if (state !== "withdrawn|cancelled|cancelled|1") {
      throw new Error(
        `withdrawal-first state ${state}, expected withdrawn|cancelled|cancelled|1`,
      )
    }
  } finally {
    await withdraw.close().catch(() => {})
    await recheck.close().catch(() => {})
  }
}

async function runOutcomeUnknown() {
  const immutable = psql(`
    set role service_role;
    do $guard$
    begin
      update public.notification_deliveries
         set status = 'pending'
       where id = '${DELIVERY_IDS[2]}';
      raise exception 'outcome-unknown delivery unexpectedly requeued';
    exception
      when sqlstate '23514' then
        if sqlerrm <> 'invite_dead_letter_immutable' then
          raise;
        end if;
    end;
    $guard$;
    select 'IMMUTABLE';
  `)
  if (immutable !== "IMMUTABLE") {
    throw new Error(`outcome-unknown immutability drifted: ${immutable}`)
  }

  const withdrawal = JSON.parse(
    psql(`
      set role service_role;
      select public.withdraw_host_invite('${HOST_ID}', '${INVITE_IDS[2]}');
    `),
  )
  if (
    withdrawal.ok !== true ||
    withdrawal.disposition !== "withdrawn" ||
    withdrawal.credit_restored !== false
  ) {
    throw new Error(`outcome-unknown withdrawal drifted: ${JSON.stringify(withdrawal)}`)
  }

  const state = psql(`
    select i.status || '|' || d.status || '|' || d.failure_class || '|' ||
           count(r.id)::text
      from public.invites i
      join public.notification_deliveries d on d.id = '${DELIVERY_IDS[2]}'
      left join public.invite_credit_events r
        on r.invite_id = i.id and r.kind = 'restore'
     where i.id = '${INVITE_IDS[2]}'
     group by i.status, d.status, d.failure_class
  `)
  if (state !== "withdrawn|dead_letter|outcome_unknown|0") {
    throw new Error(
      `outcome-unknown state ${state}, expected withdrawn|dead_letter|outcome_unknown|0`,
    )
  }
}

async function main() {
  let failure = null
  try {
    originalRolloutAppliedAtEpoch = psql(`
      select extract(epoch from applied_at)::text
        from public.invite_authority_rollout_094
       where singleton is true
    `)
    if (!/^\d+(?:\.\d+)?$/.test(originalRolloutAppliedAtEpoch)) {
      throw new Error(`rollout epoch fixture is malformed: ${originalRolloutAppliedAtEpoch}`)
    }
    cleanup()
    seed()
    await runDeliveryFirst()
    await runWithdrawalFirst()
    await runOutcomeUnknown()
    console.log(
      `${LABEL}: claim/recheck lease fenced the provider gap; known-unsent withdrawal restored once; outcome-unknown delivery stayed immutable/non-refundable`,
    )
  } catch (error) {
    failure = error
  } finally {
    cleanup()
    if (originalRolloutAppliedAtEpoch) {
      psql(`
        update public.invite_authority_rollout_094
           set applied_at = to_timestamp(${originalRolloutAppliedAtEpoch})
         where singleton is true
      `)
    }
  }

  if (failure) {
    console.error(`${LABEL}: ${failure instanceof Error ? failure.message : failure}`)
    process.exit(1)
  }
}

await main()
