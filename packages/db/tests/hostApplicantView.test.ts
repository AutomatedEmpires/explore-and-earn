import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  HOST_APPLICANT_CERTIFICATION_FIELDS,
  HOST_APPLICANT_DISPLAY_NAME_FIELDS,
  HOST_APPLICANT_EDUCATION_FIELDS,
  HOST_APPLICANT_EXPERIENCE_FIELDS,
  HOST_APPLICANT_PROFILE_FIELDS,
  HOST_APPLICANT_WITHHELD_FIELDS,
  mapHostApplicantDisplayNames,
  mapHostApplicantProfile,
  normalizeDisplayName,
  unwrapBridgeRows,
} from "../src/lib/hostApplicantView";

const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/084_host_applicant_read_bridge.sql",
  import.meta.url,
);

const migration = readFileSync(MIGRATION_PATH, "utf8");

/** Migration text with `--` comments stripped, so prose never satisfies a check. */
function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\r\n]*/g, " ");
}

/**
 * Column names in one function's `returns table ( ... )` block. Parsing the real
 * artifact — not a copy of it — is the point: this is what makes the constants
 * in hostApplicantView.ts a contract rather than a second opinion.
 */
function returnedColumns(sql: string, functionName: string): string[] {
  const start = sql.indexOf(`create or replace function public.${functionName}(`);
  if (start < 0) throw new Error(`function ${functionName} not found in migration 084`);

  const returnsAt = sql.indexOf("returns table (", start);
  if (returnsAt < 0) throw new Error(`${functionName} has no returns table block`);

  const open = sql.indexOf("(", returnsAt);
  let depth = 0;
  let close = -1;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close < 0) throw new Error(`${functionName} returns table block is unbalanced`);

  return sql
    .slice(open + 1, close)
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((name) => name.length > 0);
}

const BRIDGE_FUNCTIONS = [
  "get_host_applicant_profile",
  "get_host_applicant_display_names",
  "get_host_applicant_experiences",
  "get_host_applicant_educations",
  "get_host_applicant_certifications",
] as const;

describe("host applicant bridge — the entitled projection", () => {
  const cases: ReadonlyArray<[string, readonly string[]]> = [
    ["get_host_applicant_profile", HOST_APPLICANT_PROFILE_FIELDS],
    ["get_host_applicant_display_names", HOST_APPLICANT_DISPLAY_NAME_FIELDS],
    ["get_host_applicant_experiences", HOST_APPLICANT_EXPERIENCE_FIELDS],
    ["get_host_applicant_educations", HOST_APPLICANT_EDUCATION_FIELDS],
    ["get_host_applicant_certifications", HOST_APPLICANT_CERTIFICATION_FIELDS],
  ];

  for (const [fn, declared] of cases) {
    it(`${fn} returns exactly the reviewed field list`, () => {
      // Exact equality in BOTH directions: widening the SQL without widening the
      // reviewed constant fails here, and so does the reverse.
      expect(returnedColumns(migration, fn)).toEqual([...declared]);
    });
  }

  it("never returns a withheld seeker field", () => {
    const returned = new Set(BRIDGE_FUNCTIONS.flatMap((fn) => returnedColumns(migration, fn)));
    for (const withheld of HOST_APPLICANT_WITHHELD_FIELDS) {
      expect(returned.has(withheld), `${withheld} must not be exposed to a host`).toBe(false);
    }
  });

  it("has a negative control: a withheld field added to the SQL is caught", () => {
    const tampered = migration.replace(
      "  housing_preference text,\n  visibility_status text\n)",
      "  housing_preference text,\n  visibility_status text,\n  clerk_user_id text\n)",
    );
    expect(tampered).not.toEqual(migration);
    const returned = new Set(returnedColumns(tampered, "get_host_applicant_profile"));
    expect(returned.has("clerk_user_id")).toBe(true);
  });
});

describe("host applicant bridge — host identity is never an argument", () => {
  for (const fn of BRIDGE_FUNCTIONS) {
    it(`${fn} takes only the seeker id`, () => {
      const start = migration.indexOf(`create or replace function public.${fn}(`);
      expect(start).toBeGreaterThan(-1);
      const args = migration.slice(
        start + `create or replace function public.${fn}(`.length,
        migration.indexOf(")", start),
      );
      expect(args).toMatch(/^\s*p_seeker_profile_ids?\s+uuid(\[\])?\s*$/);
      expect(args).not.toMatch(/host|clerk|owner|company/i);
    });
  }

  it("derives host identity from the JWT helper, not from a parameter", () => {
    const body = sqlWithoutComments(migration);
    expect(body).toContain("public.current_host_profile_ids()");
    // The predicate must consult the caller's own host profiles in all three arms.
    const arms = body.match(/public\.current_host_profile_ids\(\)/g) ?? [];
    expect(arms.length).toBeGreaterThanOrEqual(3);
  });
});

describe("host applicant bridge — entitlement and grants stay in the migration", () => {
  const body = sqlWithoutComments(migration);

  it("gates every projection on host_can_view_seeker", () => {
    for (const fn of BRIDGE_FUNCTIONS) {
      const start = body.indexOf(`create or replace function public.${fn}(`);
      const end = body.indexOf("revoke execute on function", start);
      expect(body.slice(start, end)).toContain("public.host_can_view_seeker(");
    }
  });

  it("keeps the predicate itself unreachable by any client role", () => {
    expect(body).toContain(
      "revoke execute on function public.host_can_view_seeker(uuid)\n  from public, anon, authenticated;",
    );
    expect(body).not.toMatch(
      /grant execute on function public\.host_can_view_seeker\(uuid\)[^;]*authenticated/,
    );
  });

  it("never grants a bridge function to anon", () => {
    const grants = body.match(/grant execute on function public\.get_host_applicant_[^;]*;/g) ?? [];
    expect(grants.length).toBe(BRIDGE_FUNCTIONS.length);
    for (const grant of grants) {
      expect(grant).not.toMatch(/\banon\b/);
      expect(grant).toMatch(/authenticated/);
    }
  });

  it("adds no policy or table grant on seeker data", () => {
    expect(body).not.toMatch(/create\s+policy/i);
    expect(body).not.toMatch(/grant\s+select[\s\S]{0,80}seeker_profiles/i);
  });

  it("filters soft-deleted seekers rather than returning deleted_at", () => {
    expect(body).toContain("s.deleted_at is null");
    expect(returnedColumns(migration, "get_host_applicant_profile")).not.toContain("deleted_at");
  });

  it("bounds the batch name lookup so it cannot enumerate seekers", () => {
    expect(body).toContain(
      "cardinality(coalesce(p_seeker_profile_ids, '{}'::uuid[])) between 1 and 200",
    );
  });

  it("carries an executable proof that fails the migration on a bad predicate", () => {
    expect(body).toContain("host applicant bridge failed its own proof");
    expect(body).toContain("host read an unrelated seeker");
    expect(body).toContain("another host read the applicant");
    expect(body).toContain("seeker read another seeker through the bridge");
    expect(body).toContain("anon may execute the bridge");
  });
});

describe("host applicant bridge — decoding", () => {
  it("maps a full profile row", () => {
    const profile = mapHostApplicantProfile({
      seeker_profile_id: "s1",
      display_name: "Dana Applicant",
      short_bio: "I pick apples.",
      relative_location: "Pacific Northwest",
      location_pref: "anywhere_us",
      seeking_timeline: "1_month",
      desired_categories: ["farm"],
      desired_roles: ["picker"],
      general_skill_tags: ["harvest"],
      housing_preference: "required",
      visibility_status: "platform",
    });
    expect(profile).not.toBeNull();
    expect(profile?.displayName).toBe("Dana Applicant");
    expect(profile?.relativeLocation).toBe("Pacific Northwest");
    expect(profile?.desiredCategories).toEqual(["farm"]);
  });

  it("treats an empty result as no applicant rather than an empty applicant", () => {
    // The RPC returns zero rows both when the seeker does not exist and when the
    // caller is not entitled. Neither may become a blank-but-present profile.
    expect(mapHostApplicantProfile(undefined)).toBeNull();
    expect(mapHostApplicantProfile({})).toBeNull();
    expect(mapHostApplicantProfile({ display_name: "Leaked" })).toBeNull();
  });

  it("does not invent a display name", () => {
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName(42)).toBeNull();
    expect(normalizeDisplayName("  Dana  ")).toBe("Dana");
  });

  it("omits unentitled ids from the batch map instead of defaulting them", () => {
    const map = mapHostApplicantDisplayNames([
      { seeker_profile_id: "allowed", display_name: "Dana" },
      { seeker_profile_id: "blank", display_name: "   " },
    ]);
    expect(map.get("allowed")).toBe("Dana");
    expect(map.has("blank")).toBe(false);
    expect(map.has("never-returned")).toBe(false);
  });

  it("ignores rows that carry no seeker id", () => {
    expect(mapHostApplicantDisplayNames([{ display_name: "Ghost" }]).size).toBe(0);
    expect(mapHostApplicantDisplayNames(null).size).toBe(0);
  });
});

describe("host applicant bridge — a broken read never looks like an empty one", () => {
  // This is the defect class 084 exists to remove. Swallowing an RPC error and
  // returning "no rows" would rebuild it: the applicant list would quietly go
  // back to rendering every applicant as the "Seeker" placeholder.
  it("raises on an RPC error instead of reporting no applicant", () => {
    expect(() =>
      unwrapBridgeRows("probe", { data: null, error: { message: "permission denied" } }),
    ).toThrow(/probe: permission denied/);
  });

  it("raises even when the failing call also returned rows", () => {
    expect(() =>
      unwrapBridgeRows("probe", { data: [{ seeker_profile_id: "s1" }], error: { message: "boom" } }),
    ).toThrow(/probe: boom/);
  });

  it("raises when the error carries no message rather than degrading silently", () => {
    expect(() => unwrapBridgeRows("probe", { data: null, error: {} })).toThrow(/probe:/);
    expect(() => unwrapBridgeRows("probe", null)).toThrow(/no response/);
  });

  it("reports an entitled-but-empty result as no rows, not as a fault", () => {
    expect(unwrapBridgeRows("probe", { data: [], error: null })).toEqual([]);
    expect(unwrapBridgeRows("probe", { data: null, error: null })).toEqual([]);
    expect(unwrapBridgeRows("probe", { data: [{ seeker_profile_id: "s1" }], error: null })).toEqual([
      { seeker_profile_id: "s1" },
    ]);
  });
});
