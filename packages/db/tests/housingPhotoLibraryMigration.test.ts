import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../supabase/migrations/072_housing_photo_library.sql", import.meta.url),
  "utf8",
)
  .toLowerCase()
  .replace(/\s+/g, " ");

const upgradeRunner = readFileSync(
  new URL("../../../tools/db-assert/assert-housing-photo-upgrade.mjs", import.meta.url),
  "utf8",
).toLowerCase();
const upgradeFixture = readFileSync(
  new URL("../../../tools/db-assert/sql/prepare_housing_photo_upgrade.sql", import.meta.url),
  "utf8",
).toLowerCase();
const upgradeAssertion = readFileSync(
  new URL("../../../tools/db-assert/sql/assert_housing_photo_upgrade.sql", import.meta.url),
  "utf8",
).toLowerCase();

function assertDatabaseBoundary(sql: string): void {
  expect(sql).toContain(
    "grant update (benefit_library) on public.host_profiles to authenticated;",
  );
  expect(sql).toContain(
    "revoke select on table public.host_profiles from authenticated;",
  );
  expect(sql).toContain(
    "revoke select (benefit_library) on public.host_profiles from anon, authenticated;",
  );
  expect(sql).toContain("revoke select on table public.listings from anon, authenticated;");
  expect(sql).toContain(
    "revoke select (benefit_details) on public.listings from anon, authenticated;",
  );
  expect(sql).not.toContain("grant update on public.host_profiles to authenticated");
  expect(sql).not.toContain("grant select on public.host_profiles to anon");
  expect(sql).toContain("create trigger trg_listings_housing_photos");
  expect(sql).toContain("create trigger trg_listings_claim_benefit_ownership");
  expect(sql).toContain("create trigger trg_host_profiles_housing_library");
  expect(sql).toContain("create trigger trg_storage_housing_photo_references");
  expect(sql).toContain("create or replace function public.get_public_housing_photos");
  expect(sql).toContain("create or replace function public.get_public_benefit_details");
  expect(sql).toContain("create or replace function public.get_owned_benefit_context");
  expect(sql).toContain("create or replace function public.get_my_host_benefit_library");
  expect(sql).toContain("create or replace function public.save_owned_benefit_detail");
  expect(sql).toContain("create or replace function public.set_my_housing_library_photo");
  expect(sql).toContain(
    "grant execute on function public.get_public_housing_photos(uuid) to anon, authenticated, service_role;",
  );
  expect(sql).toContain(
    "grant execute on function public.save_owned_benefit_detail(uuid, text, jsonb) to authenticated, service_role;",
  );
  expect(sql).toContain(
    "grant execute on function public.set_my_housing_library_photo(text, text) to authenticated, service_role;",
  );
  expect(sql).toContain("new.status not in ('under_review', 'live')");
  expect(sql).toContain("new.provenance = 'sourced'");
  expect(sql).toContain("from storage.objects o");
  expect(sql).toContain("housing_photo_roles_missing:");
  expect(sql).toContain("housing_photo_roles_in_use:");
  expect(sql).toContain("housing_photo_object_in_use");
  expect(sql).toContain("housing_photo_migration_paused_listings=%");
  expect(sql).toContain("set status = 'paused'");
  expect(sql).toContain("revoke execute on function private.enforce_listing_housing_photos()");
  expect(sql).toContain(
    "revoke execute on function private.preserve_claim_benefit_details()",
  );
  expect(sql).not.toContain("listing_media_overrides");
}

describe("housing photo library migration", () => {
  it("adds only narrow grants and every enforcement boundary", () => {
    assertDatabaseBoundary(source);
  });

  it("pins evidence to the current request origin and exact owned paths", () => {
    expect(source).toContain("current_setting('request.headers', true)");
    expect(source).toContain("v_url_host <> v_request_host");
    expect(source).toContain("mamosbzcbigcclafhmmr.supabase.co");
    expect(source).toContain("'127.0.0.1', 'localhost', '::1'");
    expect(source).toContain("p_host_profile_id::text || '/library/housing/' || v_role");
    expect(source).toContain(
      "p_host_profile_id::text || '/benefit/' || p_listing_id::text || '/housing/' || v_role",
    );
  });

  it("locks the rollout, constrains Storage, and reserves Housing writes for the server", () => {
    expect(source).toContain("lock table public.host_profiles in share row exclusive mode;");
    expect(source).toContain("lock table public.listings in share row exclusive mode;");
    expect(source).toContain("lock table storage.objects in share row exclusive mode;");
    expect(source).toContain("file_size_limit = 5242880");
    for (const mimetype of ["image/jpeg", "image/png", "image/webp", "image/heic"]) {
      expect(source).toContain(`'${mimetype}'`);
    }
    expect(source).toContain("create or replace function private.housing_photo_metadata_is_valid");
    expect(source).toContain("and private.housing_photo_metadata_is_valid(o.metadata)");
    expect(source).toContain("split_part(name, '/', 2) = 'library'");
    expect(source).toContain("split_part(name, '/', 4) = 'housing'");
  });

  it("serializes per-kind and per-role edits instead of overwriting whole JSON maps", () => {
    expect(source).toContain("for update of l");
    expect(source).toContain("jsonb_set(v_current, array[p_kind], p_detail, true)");
    expect(source).toContain("for update;");
    expect(source).toContain("jsonb_build_object(p_role, btrim(p_url))");
    expect(source).toContain("v_current #>> array['housing', 'photos', p_role]");
  });

  it("protects referenced objects independently of the Storage request origin", () => {
    expect(source).toContain("create or replace function private.stored_housing_photo_object_name");
    expect(source).toContain(
      "private.stored_housing_photo_object_name(hp.benefit_library #>> '{housing,photos,sleeping_area}')",
    );
    expect(source).toContain("before delete or update on storage.objects");
    expect(source).not.toContain(
      "if tg_op = 'update' and old.bucket_id = new.bucket_id and old.name = new.name",
    );
  });

  it("moves source and prior-host benefit details through the private claim snapshot", () => {
    expect(source).toContain("create or replace function private.preserve_claim_benefit_details");
    expect(source).toContain("candidate.status = 'confirming'");
    expect(source).toContain("'benefit_details', coalesce(old.benefit_details, '{}'::jsonb)");
    expect(source).toContain("new.benefit_details := '{}'::jsonb");
    expect(source).toContain("lc.status = 'revoked'");
    expect(source.indexOf("create trigger trg_listings_claim_benefit_ownership")).toBeLessThan(
      source.indexOf("create trigger trg_listings_housing_photos"),
    );
  });

  it("rehearses the real 071 to 072 upgrade and pauses only unsupported live claims", () => {
    expect(upgradeRunner).toContain('"--version",');
    expect(upgradeRunner).toContain('"071",');
    expect(upgradeRunner).toContain('"migration", "up", "--local", "--yes"');
    expect(upgradeFixture).toContain("legacy live listing without role photos");
    expect(upgradeFixture).toContain("legacy live listing with a complete role set");
    expect(upgradeAssertion).toContain("unsupported legacy live listing was not paused");
    expect(upgradeAssertion).toContain("complete legacy listing was unnecessarily paused");
  });

  it("has a negative control for accidental trigger removal", () => {
    expect(() =>
      assertDatabaseBoundary(
        source.replace("create trigger trg_listings_housing_photos", "-- trigger removed"),
      ),
    ).toThrow();
  });

  it("has a negative control for accidental effective-photo RPC removal", () => {
    expect(() =>
      assertDatabaseBoundary(
        source.replace(
          "grant execute on function public.get_public_housing_photos(uuid) to anon, authenticated, service_role;",
          "-- grant removed",
        ),
      ),
    ).toThrow();
  });
});
