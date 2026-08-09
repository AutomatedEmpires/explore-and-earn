import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  new URL(
    "../../../supabase/migrations/092_listing_media_ownership.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const CONNECTED_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_listing_media_ownership.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const ASSERTION_DRIVER = readFileSync(
  new URL("../../../tools/db-assert/assert-authorization.mjs", import.meta.url),
  "utf8",
);
const PRODUCTION_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_production_launch.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const DB_MIGRATE_WORKFLOW = readFileSync(
  new URL("../../../.github/workflows/db-migrate.yml", import.meta.url),
  "utf8",
).toLowerCase();
const MIGRATION_ALLOCATIONS = readFileSync(
  new URL("../../../tools/scripts/migration-allocations.json", import.meta.url),
  "utf8",
);

function functionBody(source: string, functionName: string): string {
  const start = source.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

describe("migration 092 listing media ownership", () => {
  it("validates every authenticated insert and effective update", () => {
    const enforcement = functionBody(
      MIGRATION,
      "private.enforce_listing_media_ownership",
    );
    const trigger = MIGRATION.slice(
      MIGRATION.indexOf("create trigger trg_listings_media_ownership"),
      MIGRATION.indexOf(
        "private.enforce_listing_media_ownership();",
        MIGRATION.indexOf("create trigger trg_listings_media_ownership"),
      ) + "private.enforce_listing_media_ownership();".length,
    );

    expect(trigger).toContain("before insert or update");
    expect(trigger).not.toMatch(/before insert or update of/i);
    expect(enforcement).toMatch(/current_user\s*=\s*'authenticated'/i);
    expect(enforcement).toContain("listing_media_reference_not_owned");
    expect(enforcement).toContain("errcode = '23514'");
    expect(enforcement).toContain("security invoker");
    expect(enforcement).toContain("set search_path = ''");
  });

  it("pins URLs to the exact deployment, bucket, owner path, and Storage object", () => {
    const enforcement = functionBody(
      MIGRATION,
      "private.enforce_listing_media_ownership",
    );

    expect(enforcement).toContain("current_setting('request.headers', true)");
    expect(enforcement).toContain("mamosbzcbigcclafhmmr.supabase.co");
    expect(enforcement).toContain(
      "/storage/v1/object/public/listing-media/",
    );
    expect(enforcement).toMatch(/new\.host_profile_id::text\s*\|\|\s*'\/'/i);
    expect(enforcement).toMatch(/from storage\.objects/i);
    expect(enforcement).toMatch(/bucket_id\s*=\s*'listing-media'/i);
    expect(enforcement).toMatch(/o\.name\s*=|name\s*=\s*v_object_name/i);

    // Object keys are URL paths, not filesystems. Encoded, dot, empty,
    // whitespace, or backslash segments must never be normalized into safety.
    expect(enforcement).toMatch(/position\('%' in|like\s+'%\\%%'/i);
    expect(enforcement).toMatch(/like\s+'%\/\/%'|strpos\([^)]*,\s*'\/\/'/i);
    expect(enforcement).toMatch(/\[\.\]\{1,2\}|\/\.\.?\//i);
    expect(enforcement).toMatch(/\\\\|backslash/i);
    expect(enforcement).toMatch(/\[:space:\]|btrim|whitespace/i);
  });

  it("grandfathers converted source media only while byte-identical", () => {
    const enforcement = functionBody(
      MIGRATION,
      "private.enforce_listing_media_ownership",
    );

    expect(enforcement).toMatch(/new\.claim_summary\s*=\s*'converted'/i);
    expect(enforcement).toContain(
      "new.cover_photo_url is distinct from old.cover_photo_url",
    );
    expect(enforcement).toContain(
      "new.gallery_photo_urls is distinct from old.gallery_photo_urls",
    );
  });

  it("snapshots and restores source media at the claim authorship boundary", () => {
    const preservation = functionBody(
      MIGRATION,
      "private.preserve_listing_media_truth",
    );

    expect(preservation).toContain("'cover_photo_url', old.cover_photo_url");
    expect(preservation).toContain("'gallery_photo_urls'");
    expect(preservation).toContain("candidate.status = 'confirming'");
    expect(preservation).toContain("lc.status = 'revoked'");
    expect(preservation).toMatch(/new\.cover_photo_url\s*:=\s*null/i);
    expect(preservation).toMatch(
      /new\.gallery_photo_urls\s*:=\s*'\{\}'::text\[\]/i,
    );
    expect(preservation).toContain("claim_media_snapshot_missing");
    expect(preservation).toContain("errcode = '23514'");
    expect(preservation).toContain("security definer");
    expect(preservation).toContain("set search_path = ''");
    expect(MIGRATION).toContain(
      "create trigger trg_listings_claim_media_ownership",
    );
  });

  it("keeps both private trigger functions outside every callable API role", () => {
    for (const functionName of [
      "private.preserve_listing_media_truth()",
      "private.enforce_listing_media_ownership()",
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke execute on function ${functionName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          )}\\s+from public, anon, authenticated, service_role`,
          "i",
        ),
      );
    }
  });

  it("ships a rollback-only connected proof for every bypass and claim path", () => {
    for (const proof of [
      "owned cover/gallery insert succeeds",
      "cross-host cover is rejected",
      "cross-host gallery is rejected",
      "foreign-origin media is rejected",
      "missing storage object is rejected",
      "wrong bucket is rejected",
      "dot path traversal is rejected",
      "encoded path traversal is rejected",
      "empty path segment is rejected",
      "backslash path is rejected",
      "ordinary legacy unowned media blocks unrelated edit",
      "ordinary media repair permits the following unrelated edit",
      "converted full-form byte-identical source media survives",
      "converted source cover replacement is rejected",
      "converted source gallery replacement is rejected",
      "claim conversion snapshots source cover/gallery",
      "claim revocation restores byte-identical source cover/gallery",
      "legacy converted revocation clears unsnapshotted media",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
    expect(CONNECTED_ASSERTION).toMatch(/^\s*begin;/m);
    expect(CONNECTED_ASSERTION).toMatch(/^\s*rollback;/m);
    expect(ASSERTION_DRIVER).toContain(
      'join(here, "sql", "assert_listing_media_ownership.sql")',
    );
  });

  it("reserves and production-gates the exact migration contract", () => {
    const allocations = JSON.parse(MIGRATION_ALLOCATIONS) as {
      allocations: Record<string, { slug: string; status: string }>;
    };
    expect(allocations.allocations["092"]).toMatchObject({
      slug: "listing_media_ownership",
      status: "reserved",
    });

    for (const field of [
      "migration_092_applied",
      "listing_media_ownership_contract_safe",
    ]) {
      expect(PRODUCTION_ASSERTION).toContain(`as ${field}`);
      expect(DB_MIGRATE_WORKFLOW).toContain(`.[0].${field} == true`);
    }
    expect(PRODUCTION_ASSERTION).toContain(
      "trg_listings_claim_media_ownership",
    );
    expect(PRODUCTION_ASSERTION).toContain("trg_listings_media_ownership");
    expect(DB_MIGRATE_WORKFLOW).toContain("migrations 077/091/092");
  });
});
