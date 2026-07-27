/**
 * Migration 085 — the DATABASE half of team seats and the additional-listing
 * add-on.
 *
 * Why this exists as a static assertion (the house pattern —
 * listingHostStatusMigration.test.ts, communityPhotoPrivacyMigration.test.ts):
 * the server-side checks in queries/hostTeam.ts and queries/listingLifecycle.ts
 * are not the last line. Supabase's default table grants hand `authenticated`
 * full INSERT/UPDATE/DELETE on every public table, and team_memberships_all_host
 * (015) is FOR ALL with an ownership-only predicate — so without the revoke
 * below, a host could PATCH themselves unlimited members through PostgREST and
 * never run a line of application code. The same is true of the purchased
 * allowance column: if it were writable, or merely readable by every signed-in
 * user, the add-on would be free / public.
 *
 * These assertions fail if any of those properties is dropped from the SQL.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rawMigration = readFileSync(
  new URL("../../../supabase/migrations/085_tier_features_and_addons.sql", import.meta.url),
  "utf8",
);

const migration = rawMigration.toLowerCase().replace(/\s+/g, " ");

/** The same SQL with `-- line comments` removed. Needed wherever the assertion
 * is about what the DATABASE does: a comment claiming a property is exactly the
 * thing being checked, so it must not be able to satisfy the check itself. */
const migrationCode = rawMigration
  .split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join("\n")
  .toLowerCase()
  .replace(/\s+/g, " ");

function assertSeatEnforcement(sql: string): void {
  // The write path is closed to the role a host actually holds.
  expect(sql).toContain(
    "revoke insert, update, delete on table public.team_memberships from anon, authenticated;",
  );
  // The limit is an ARGUMENT, so the server supplies it from the real tier.
  expect(sql).toContain("p_seat_limit integer");
  // …and it is re-counted inside the function, over BOTH seat-consuming states.
  expect(sql).toContain("where host_profile_id = p_host_profile_id and status in ('invited', 'active')");
  expect(sql).toContain("if v_used >= coalesce(p_seat_limit, 0) then");
  expect(sql).toContain("'error', 'seat_limit_reached'");
  // A null limit must floor at zero, not at "unlimited".
  expect(sql).toContain("coalesce(p_seat_limit, 0)");
  // Concurrent invites cannot both claim the last seat.
  expect(sql).toContain("pg_advisory_xact_lock( hashtextextended('team_seat:' || p_host_profile_id::text, 0) )");
  // Only service_role may call the write functions.
  expect(sql).toContain(
    "revoke execute on function public.invite_host_team_member(uuid, text, text, integer, uuid, integer) from public, anon, authenticated;",
  );
  expect(sql).toContain(
    "grant execute on function public.invite_host_team_member(uuid, text, text, integer, uuid, integer) to service_role;",
  );
}

/**
 * An expired invitation must give its seat back.
 *
 * The defect: nothing ever moved a stale 'invited' row. accept_host_team_
 * invitation only flips one when somebody presents its token — and nobody can,
 * because it has expired. So the seat was spent forever, the invite form (hidden
 * at zero remaining) never appeared, and uq_team_memberships_pending_email kept
 * refusing a fresh invitation to the same address. The sweep runs inside the
 * advisory lock, BEFORE the count, or it would race a concurrent invite.
 */
function assertExpirySweep(sql: string): void {
  expect(sql).toContain(
    "update public.team_memberships set status = 'expired', invite_token = null " +
      "where host_profile_id = p_host_profile_id and status = 'invited' " +
      "and invite_expires_at is not null and invite_expires_at < now();",
  );
  const sweepAt = sql.indexOf("and invite_expires_at < now();");
  const lockAt = sql.indexOf("hashtextextended('team_seat:");
  const countAt = sql.indexOf("select count(*) into v_used");
  expect(lockAt).toBeGreaterThan(-1);
  expect(sweepAt).toBeGreaterThan(lockAt);
  expect(countAt).toBeGreaterThan(sweepAt);
}

/**
 * The add-on allowance must follow the subscription, not only its deletion.
 *
 * The defect: syncSubscriptionEvent's add-on branch acted on `deleted` alone, so
 * a subscription parked in a non-paying status ('unpaid', 'incomplete_expired',
 * 'paused' — Stripe may never emit deleted for these) and a quantity changed in
 * the billing portal both left the host holding slots they were not paying for.
 */
function assertLifecycleSync(sql: string): void {
  expect(sql).toContain(
    "create or replace function public.sync_listing_slot_subscription( p_subscription_id text, p_quantity integer, p_entitled boolean )",
  );
  // The allowance moves by a DELTA against what this purchase contributes, so a
  // redelivered event is a no-op rather than a second decrement.
  expect(sql).toContain(
    "v_current := case when v_row.status = 'active' then v_row.quantity else 0 end;",
  );
  expect(sql).toContain(
    "set purchased_listing_slots = greatest(purchased_listing_slots + (v_target - v_current), 0)",
  );
  // Not entitled means zero contribution, whatever the quantity says.
  expect(sql).toContain("when coalesce(p_entitled, false)");
  // Serialized and re-read under the lock, like every other allowance write.
  expect(sql).toContain(
    "pg_advisory_xact_lock( hashtextextended('listing_slots:' || v_row.host_profile_id::text, 0) )",
  );
  expect(sql).toContain("for update;");
  // Service-role only, like the other write functions.
  expect(sql).toContain(
    "revoke execute on function public.sync_listing_slot_subscription(text, integer, boolean) from public, anon, authenticated;",
  );
  expect(sql).toContain(
    "grant execute on function public.sync_listing_slot_subscription(text, integer, boolean) to service_role;",
  );
}

function assertAddOnAllowance(sql: string): void {
  // host_profiles.purchased_listing_slots and its CHECK are declared in 083,
  // next to the enforcement trigger that has to add it up — asserted there by
  // entitlementEnforcement.test.ts. Restating the column here would put two
  // declarations of one column in the tree.
  //
  // Idempotency is structural, not procedural.
  expect(sql).toContain(
    "create unique index if not exists uq_host_listing_slot_purchase_session on public.host_listing_slot_purchases (stripe_checkout_session_id);",
  );
  expect(sql).toContain("on conflict (stripe_checkout_session_id) do nothing;");
  expect(sql).toContain("if v_inserted = 0 then");
  expect(sql).toContain("'already_credited', true");
  // The ledger row and the allowance move together or not at all.
  expect(sql).toContain(
    "update public.host_profiles set purchased_listing_slots = purchased_listing_slots + p_quantity",
  );
  // Nobody but service_role can write the allowance.
  expect(sql).toContain(
    "revoke insert, update, delete on table public.host_listing_slot_purchases from anon, authenticated;",
  );
  expect(sql).toContain(
    "revoke execute on function public.credit_listing_slot_purchase(uuid, integer, integer, text, text, text) from public, anon, authenticated;",
  );
}

/**
 * THE OVER-ALLOWANCE SWEEP MUST RUN FOR THE ADD-ON, NOT ONLY THE PLAN.
 *
 * public.close_host_listings_over_allowance (083) had exactly ONE caller in the
 * whole system: syncHostSubscriptionTier, on the plan path. The add-on branch of
 * syncSubscriptionEvent returns before it, so cancelling an add-on, letting it
 * go unpaid, or reducing its quantity in the billing portal lowered the
 * allowance and left every listing above it live indefinitely — Stripe billing
 * for one slot while the database served four public listings.
 *
 * The three functions below are the only writers of
 * host_profiles.purchased_listing_slots, so the sweep belongs in them rather
 * than at a fourth call site that the next branch would miss. Asserted as an
 * ORDER inside each body, because a sweep that runs BEFORE the write it follows
 * reads the old allowance and closes the wrong number of listings.
 *
 * The behaviour itself — how many listings each path actually closes — is proved
 * against a real database in
 * tools/db-assert/sql/assert_listing_allowance_enforcement.sql, section 5.
 */
function assertAddOnSweep(sql: string): void {
  const SWEEP = "perform public.close_host_listings_over_allowance(";

  for (const [fn, write] of [
    ["credit_listing_slot_purchase", "update public.host_profiles set purchased_listing_slots = purchased_listing_slots + p_quantity"],
    ["revoke_listing_slot_purchase", "set purchased_listing_slots = greatest(purchased_listing_slots - v_quantity, 0)"],
    ["sync_listing_slot_subscription", "set purchased_listing_slots = greatest(purchased_listing_slots + (v_target - v_current), 0)"],
  ] as const) {
    const body = functionBody(sql, fn);
    const writeAt = body.indexOf(write);
    const sweepAt = body.indexOf(SWEEP);
    expect(writeAt, `${fn} must still move the purchased allowance`).toBeGreaterThan(-1);
    expect(sweepAt, `${fn} must sweep the over-allowance listings`).toBeGreaterThan(-1);
    expect(sweepAt, `${fn} must sweep AFTER it moves the allowance`).toBeGreaterThan(
      writeAt,
    );
  }
}

/** The dollar-quoted body of one function in the given migration text. */
function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start, `public.${name} must exist in migration 085`).toBeGreaterThan(-1);
  const bodyStart = sql.indexOf("as $$", start);
  const bodyEnd = sql.indexOf("$$", bodyStart + "as $$".length);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return sql.slice(bodyStart, bodyEnd);
}

/**
 * The revoke path must decide under the lock, not from a pre-lock snapshot.
 * Written as an ORDER assertion because every individual ingredient can be
 * present and the function still be wrong: the original had the lock AND the
 * status test AND the update, in the order that double-decrements.
 */
function assertRevokeIsSerialized(sql: string): void {
  const body = functionBody(sql, "revoke_listing_slot_purchase");

  const lockAt = body.indexOf("pg_advisory_xact_lock");
  const updateAt = body.indexOf("update public.host_listing_slot_purchases");
  const decrementAt = body.indexOf("update public.host_profiles");
  expect(lockAt).toBeGreaterThan(-1);
  expect(updateAt).toBeGreaterThan(-1);
  expect(decrementAt).toBeGreaterThan(-1);

  // Lock BEFORE the write that decides, and both before the allowance moves.
  expect(lockAt).toBeLessThan(updateAt);
  expect(updateAt).toBeLessThan(decrementAt);

  // The write itself refuses a row somebody else already cancelled…
  expect(body).toContain("where id = v_id and status = 'active'");
  // …and the decrement is gated on that write having actually happened.
  expect(body).toContain("get diagnostics v_count = row_count;");
  expect(body).toMatch(/if v_count <> 1 then[^$]*'already_revoked', true/);

  // No decision may be taken from a row read before the lock. `select *` into a
  // rowtype is how the stale snapshot got there in the first place.
  expect(body).not.toContain("select * into v_row");
  expect(body).not.toContain("if v_row.status = 'cancelled'");
}

describe("migration 085 — tier features and add-ons", () => {
  it("wraps everything in one transaction", () => {
    expect(migration).toContain("begin;");
    expect(migration).toContain("commit;");
  });

  it("enforces the seat limit at the database, not only in the server action", () => {
    assertSeatEnforcement(migration);
  });

  it("makes the purchased listing allowance real, idempotent, and unforgeable", () => {
    assertAddOnAllowance(migration);
  });

  it("gives an expired invitation's seat back", () => {
    assertExpirySweep(migration);
  });

  it("takes the allowance back on non-payment and follows a quantity change", () => {
    assertLifecycleSync(migration);
  });

  it("brings the host's live listings back inside every add-on allowance change", () => {
    assertAddOnSweep(migration);
  });

  it("has exactly ONE security definer function, and the prose agrees", () => {
    // The comments used to describe the write functions as SECURITY DEFINER for
    // functions whose pg_proc.prosecdef is false. Only my_purchased_listing_slots
    // is a definer function — it has to be, because it reads a column 080
    // deliberately withholds from `authenticated`. The rest are invoker-rights
    // functions with EXECUTE granted to service_role alone.
    expect(migrationCode.split("security definer")).toHaveLength(2);

    const definerAt = migrationCode.indexOf("security definer");
    const selfReadAt = migrationCode.indexOf(
      "create or replace function public.my_purchased_listing_slots()",
    );
    expect(selfReadAt).toBeGreaterThan(-1);
    expect(definerAt).toBeGreaterThan(selfReadAt);

    // …and no comment describes any of the others as one.
    for (const fn of [
      "invite_host_team_member",
      "accept_host_team_invitation",
      "revoke_host_team_member",
      "credit_listing_slot_purchase",
      "revoke_listing_slot_purchase",
      "sync_listing_slot_subscription",
    ]) {
      const body = migration.slice(
        migration.indexOf(`create or replace function public.${fn}`),
      );
      const nextDefiner = body.indexOf("security definer");
      const nextFunctionEnd = body.indexOf("$$;");
      expect(
        nextDefiner === -1 || nextDefiner > nextFunctionEnd,
        `${fn} is described as security definer but is not declared one`,
      ).toBe(true);
    }
  });

  it("NEVER grants the purchased allowance column to anon or authenticated", () => {
    // 080 revoked table-wide SELECT and re-granted an allow-list; adding this
    // column to it would publish every host's add-on spend, because
    // host_profiles_select_public (013) is `to anon, authenticated`.
    expect(migration).not.toMatch(
      /grant select \([^)]*purchased_listing_slots[^)]*\) on (table )?public\.host_profiles/,
    );
    // The host reads their own figure through a scoped SECURITY DEFINER read.
    expect(migration).toContain("create or replace function public.my_purchased_listing_slots()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain(
      "where hp.id in (select public.current_host_profile_ids());",
    );
  });

  it("repoints team_memberships at the Clerk-era user table so an invite can be accepted at all", () => {
    expect(migration).toContain(
      "drop constraint if exists team_memberships_user_id_fkey",
    );
    expect(migration).toContain("alter column user_id drop not null");
    expect(migration).toContain(
      "foreign key (user_id) references public.users_profile_shadow(id) on delete cascade",
    );
  });

  it("makes an invitation single-use and time-limited", () => {
    expect(migration).toContain("invite_token = null");
    expect(migration).toContain("v_row.invite_expires_at < now()");
    expect(migration).toContain("'error', 'invitation_expired'");
    expect(migration).toContain(
      "create unique index if not exists uq_team_memberships_invite_token",
    );
  });

  it("scopes revocation by host, so a membership id alone cannot reach another host's team", () => {
    expect(migration).toContain(
      "where id = p_membership_id and host_profile_id = p_host_profile_id and status in ('invited', 'active')",
    );
  });

  /**
   * A REDELIVERED cancellation must decrement exactly once.
   *
   * The first version read the ledger row into a variable BEFORE taking the
   * advisory lock, decided from that stale snapshot, and issued an unguarded
   * `update ... where id = v_row.id`. Two overlapping deliveries both read
   * 'active', both passed the test, and both subtracted: an allowance of 3 went
   * to 0 against ONE cancelled row, with greatest(..., 0) hiding it because a
   * second subtraction from 0 still reports a valid 0.
   *
   * The shape that fixes it — the one credit_listing_slot_purchase already uses
   * — is lock first, let the guarded UPDATE be the arbiter, move the allowance
   * only when row_count is exactly 1.
   */
  it("decrements the allowance only for the caller that actually cancelled the row", () => {
    assertRevokeIsSerialized(migration);
  });

  it("floors the allowance at zero when an add-on subscription ends", () => {
    expect(migration).toContain(
      "set purchased_listing_slots = greatest(purchased_listing_slots - v_quantity, 0)",
    );
  });

  // ── Negative controls ─────────────────────────────────────────────────────
  // Each assertion block must actually depend on the property it names.

  it("negative control: dropping the write revoke fails the seat assertions", () => {
    expect(() =>
      assertSeatEnforcement(
        migration.replace(
          "revoke insert, update, delete on table public.team_memberships from anon, authenticated;",
          "-- revoke removed",
        ),
      ),
    ).toThrow();
  });

  it("negative control: dropping the status guard fails the revoke assertions", () => {
    // Restore the shape that double-decremented — an unguarded UPDATE — and
    // confirm the assertion above actually depends on it rather than passing on
    // the surrounding scaffolding.
    expect(() =>
      assertRevokeIsSerialized(
        migration.replace("where id = v_id and status = 'active'", "where id = v_id"),
      ),
    ).toThrow();
  });

  it("negative control: dropping the session unique index fails the add-on assertions", () => {
    expect(() =>
      assertAddOnAllowance(
        migration.replace(
          "create unique index if not exists uq_host_listing_slot_purchase_session",
          "create index if not exists uq_host_listing_slot_purchase_session",
        ),
      ),
    ).toThrow();
  });

  it("negative control: dropping the sweep fails the expiry assertions", () => {
    expect(() =>
      assertExpirySweep(
        migration.replace("and invite_expires_at < now();", "and false;"),
      ),
    ).toThrow();
  });

  it("negative control: moving the sweep AFTER the count fails the expiry assertions", () => {
    // Order is the invariant, not mere presence: a sweep that runs after the
    // count frees the seat one invitation too late.
    const sweep =
      "update public.team_memberships set status = 'expired', invite_token = null " +
      "where host_profile_id = p_host_profile_id and status = 'invited' " +
      "and invite_expires_at is not null and invite_expires_at < now();";
    expect(() =>
      assertExpirySweep(
        migration
          .replace(sweep, "")
          .replace(
            "if v_used >= coalesce(p_seat_limit, 0) then",
            `${sweep} if v_used >= coalesce(p_seat_limit, 0) then`,
          ),
      ),
    ).toThrow();
  });

  it.each([
    "credit_listing_slot_purchase",
    "revoke_listing_slot_purchase",
    "sync_listing_slot_subscription",
  ])("negative control: removing the sweep from %s fails the sweep assertions", (fn) => {
    // Drop the call from ONE function at a time. Each must be independently
    // load-bearing, or two of the three branches could quietly lose it while the
    // suite stayed green — which is exactly how the add-on gap survived a round
    // that claimed to have closed this for the plan.
    const start = migration.indexOf(`create or replace function public.${fn}(`);
    const end = migration.indexOf("$$;", start);
    const body = migration.slice(start, end);
    const mutated =
      migration.slice(0, start) +
      body.replace("perform public.close_host_listings_over_allowance(", "perform (") +
      migration.slice(end);

    expect(() => assertAddOnSweep(mutated)).toThrow();
  });

  it("negative control: sweeping BEFORE the allowance moves fails the sweep assertions", () => {
    // Order is the invariant, not presence: a sweep that runs first reads the
    // allowance the host is leaving, not the one they are landing on.
    const write = "set purchased_listing_slots = greatest(purchased_listing_slots - v_quantity, 0)";
    const sweepStart = migration.indexOf(
      "perform public.close_host_listings_over_allowance(",
      migration.indexOf(write),
    );
    const sweepEnd = migration.indexOf(");", sweepStart) + 2;
    const sweep = migration.slice(sweepStart, sweepEnd);

    expect(() =>
      assertAddOnSweep(
        migration.replace(sweep, "").replace(write, `${sweep} ${write}`),
      ),
    ).toThrow();
  });

  it("negative control: dropping the delta fails the lifecycle-sync assertions", () => {
    expect(() =>
      assertLifecycleSync(
        migration.replace(
          "set purchased_listing_slots = greatest(purchased_listing_slots + (v_target - v_current), 0)",
          "set purchased_listing_slots = purchased_listing_slots",
        ),
      ),
    ).toThrow();
  });
});
