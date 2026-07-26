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

const migration = readFileSync(
  new URL("../../../supabase/migrations/085_tier_features_and_addons.sql", import.meta.url),
  "utf8",
)
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

function assertAddOnAllowance(sql: string): void {
  expect(sql).toContain(
    "add column if not exists purchased_listing_slots integer not null default 0",
  );
  expect(sql).toContain("check (purchased_listing_slots >= 0)");
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

  it("floors the allowance at zero when an add-on subscription ends", () => {
    expect(migration).toContain(
      "set purchased_listing_slots = greatest(purchased_listing_slots - v_row.quantity, 0)",
    );
    expect(migration).toContain("if v_row.status = 'cancelled' then");
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
});
