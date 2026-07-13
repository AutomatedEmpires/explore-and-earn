import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../../supabase/migrations/058_community_photo_privacy.sql", import.meta.url),
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

describe("community photo report migration", () => {
  it("removes inherited grants before applying the explicit role allowlist", () => {
    expect(migration).toContain(
      "revoke all on table public.community_photo_reports from anon, authenticated, service_role, public;",
    );
  });

  it("allows reporters to insert only user-controlled columns", () => {
    expect(migration).toContain(
      "grant insert (photo_id, reporter_clerk_user_id, reason, detail) on table public.community_photo_reports to authenticated;",
    );
    expect(migration).not.toContain(
      "grant select, insert on table public.community_photo_reports to authenticated;",
    );
  });

  it("pins direct inserts to submitted status and bounded detail", () => {
    expect(migration).toContain("detail text check (detail is null or char_length(detail) <= 500)");
    expect(migration).toContain(
      "with check ( reporter_clerk_user_id = public.get_clerk_user_id() and status = 'submitted' );",
    );
  });
});
