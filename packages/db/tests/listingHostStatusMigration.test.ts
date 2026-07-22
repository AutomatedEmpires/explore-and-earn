import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/077_listing_host_status_transitions.sql",
    import.meta.url,
  ),
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

function assertLifecycleBoundary(sql: string): void {
  expect(sql).toContain(
    "create or replace function private.enforce_listing_host_status_transition()",
  );
  expect(sql).toContain("security invoker");
  expect(sql).toContain("set search_path = ''");
  expect(sql).toContain("current_user = 'authenticated'");
  expect(sql).toContain("auth.jwt() ->> 'role'");
  expect(sql).toContain("if tg_op = 'insert' then");
  expect(sql).toContain("new.status is distinct from 'draft'");
  expect(sql).toContain("old.status = 'draft' and new.status = 'under_review'");
  expect(sql).toContain("old.status = 'under_review' and new.status = 'draft'");
  expect(sql).toContain("old.status = 'live' and new.status in ('paused', 'archived')");
  expect(sql).toContain("old.status = 'paused' and new.status in ('live', 'archived')");
  expect(sql).toContain("errcode = '23514'");
  expect(sql).toContain(
    "revoke execute on function private.enforce_listing_host_status_transition() from public, anon, authenticated;",
  );
  expect(sql).toContain(
    "create trigger trg_listings_host_status_transition before insert or update on public.listings",
  );
}

describe("listing host status transition migration", () => {
  it("enforces the canonical host graph at the authenticated database boundary", () => {
    assertLifecycleBoundary(migration);
  });

  it("keeps trusted moderation outside the authenticated-only guard", () => {
    expect(migration).toContain("if not v_is_authenticated_request then return new; end if;");
    expect(migration).not.toContain("current_user = 'service_role'");
  });

  it("has a negative control for accidental trigger removal", () => {
    expect(() =>
      assertLifecycleBoundary(
        migration.replace(
          "create trigger trg_listings_host_status_transition",
          "-- trigger removed",
        ),
      ),
    ).toThrow();
  });
});
