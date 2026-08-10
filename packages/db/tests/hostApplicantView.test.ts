import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  HOST_APPLICANT_CERTIFICATION_FIELDS,
  HOST_APPLICANT_DISPLAY_NAME_FIELDS,
  HOST_APPLICANT_EDUCATION_FIELDS,
  HOST_APPLICANT_EXPERIENCE_FIELDS,
  HOST_APPLICANT_NAME_BATCH,
  HOST_APPLICANT_PROFILE_FIELDS,
  HOST_APPLICANT_WITHHELD_FIELDS,
  SEEKER_NAME_UNAVAILABLE,
  emptySeekerNameLookup,
  mapHostApplicantDisplayNames,
  mapHostApplicantProfile,
  mergeSeekerNameLookups,
  normalizeDisplayName,
  readSeekerNameLookup,
  resolveSeekerName,
  singleSeekerName,
  unwrapBridgeRows,
} from "../src/lib/hostApplicantView";

const MIGRATION_PATH = new URL(
  "../../../supabase/migrations/084_host_applicant_read_bridge.sql",
  import.meta.url,
);

const migration = readFileSync(MIGRATION_PATH, "utf8");
const hardeningMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/094_host_seeker_discovery_bridge.sql",
    import.meta.url,
  ),
  "utf8",
);

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

/**
 * The batch ceiling, read out of the migration itself rather than restated.
 * The RPC raises above this number, so the number IS the contract the callers
 * chunk against.
 */
function batchBoundFromMigration(): number {
  const sql = sqlWithoutComments(migration);
  const start = sql.indexOf("create or replace function public.get_host_applicant_display_names(");
  if (start < 0) throw new Error("get_host_applicant_display_names not found in migration 084");
  const body = sql.slice(start, sql.indexOf("revoke execute on function", start));
  const match = body.match(/cardinality\(v_ids\)\s*>\s*(\d+)/);
  if (!match) throw new Error("no cardinality bound found in get_host_applicant_display_names");
  return Number(match[1]);
}

const BRIDGE_FUNCTIONS = [
  "get_host_applicant_profile",
  "get_host_applicant_display_names",
  "get_host_applicant_experiences",
  "get_host_applicant_educations",
  "get_host_applicant_certifications",
] as const;
const DETAIL_BRIDGE_FUNCTIONS = BRIDGE_FUNCTIONS.filter(
  (name) => name !== "get_host_applicant_display_names",
);

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
    const body = sqlWithoutComments(hardeningMigration);
    expect(body).toContain("public.current_host_profile_ids()");
    // Detail has application/conversation arms; narrow names additionally have
    // the invite arm. Every arm derives the requesting host from the JWT.
    const arms = body.match(/public\.current_host_profile_ids\(\)/g) ?? [];
    expect(arms.length).toBeGreaterThanOrEqual(5);
  });
});

describe("host applicant bridge — entitlement and grants stay in the migration", () => {
  const body = sqlWithoutComments(migration);

  it("gates every full-detail projection on host_can_view_seeker", () => {
    for (const fn of DETAIL_BRIDGE_FUNCTIONS) {
      const start = body.indexOf(`create or replace function public.${fn}(`);
      const end = body.indexOf("revoke execute on function", start);
      expect(body.slice(start, end)).toContain("public.host_can_view_seeker(");
    }
  });

  it("keeps invite-only access inside the narrow display-name lookup", () => {
    const hardened = sqlWithoutComments(hardeningMigration);
    const predicateStart = hardened.indexOf(
      "create or replace function public.host_can_view_seeker(",
    );
    const predicate = hardened.slice(
      predicateStart,
      hardened.indexOf("revoke execute on function", predicateStart),
    );
    expect(predicate).toContain("from public.applications a");
    expect(predicate).toContain("from public.conversations c");
    expect(predicate).not.toContain("from public.invites i");

    const namesStart = hardened.indexOf(
      "create or replace function public.get_host_applicant_display_names(",
    );
    const names = hardened.slice(
      namesStart,
      hardened.indexOf("revoke execute on function", namesStart),
    );
    expect(names).toContain("from public.applications a");
    expect(names).toContain("from public.invites i");
    expect(names).toContain("from public.conversations c");
    expect(names).not.toContain("public.host_can_view_seeker(");
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

  // The three resume projections select from seeker_resume_experiences /
  // _educations / seeker_certifications, none of which HAS a deleted_at, so a
  // per-projection filter could never have covered them and did not: a
  // soft-deleted seeker's entire work history stayed readable by every entitled
  // host while the migration header claimed the opposite. The filter belongs to
  // the one predicate all five are gated on.
  it("applies the soft-delete filter in the entitlement predicate, not per projection", () => {
    const start = body.indexOf("create or replace function public.host_can_view_seeker(");
    expect(start).toBeGreaterThan(-1);
    const predicate = body.slice(start, body.indexOf("revoke execute on function", start));
    expect(predicate).toContain("public.seeker_profiles");
    expect(predicate).toContain("deleted_at is null");
  });

  it("bounds the batch name lookup so it cannot enumerate seekers", () => {
    expect(batchBoundFromMigration()).toBe(HOST_APPLICANT_NAME_BATCH);
  });

  // The two halves of one contract: the database's ceiling and the number the
  // callers chunk on. Before this test they were two independent literals.
  it("states the same bound in SQL and in TypeScript", () => {
    expect(HOST_APPLICANT_NAME_BATCH).toBe(200);
    expect(batchBoundFromMigration()).toBe(HOST_APPLICANT_NAME_BATCH);
  });

  it("raises above the bound instead of returning zero rows", () => {
    const start = body.indexOf(
      "create or replace function public.get_host_applicant_display_names(",
    );
    const fn = body.slice(start, body.indexOf("revoke execute on function", start));
    expect(fn).toMatch(/raise exception/);
    expect(fn).toContain("program_limit_exceeded");
    // The bound must NOT also survive as a row filter: a WHERE conjunct would
    // make an over-sized request look like "no seekers you may see", which is
    // the exact ambiguity this migration exists to remove.
    expect(fn).not.toMatch(/where[\s\S]*cardinality/);
  });

  it("carries an executable proof that fails the migration on a bad predicate", () => {
    expect(body).toContain("host applicant bridge failed its own proof");
    expect(body).toContain("host read an unrelated seeker");
    expect(body).toContain("another host read the applicant");
    expect(body).toContain("seeker read another seeker through the bridge");
    expect(body).toContain("anon may execute the bridge");
    expect(body).toContain("soft-deleted seeker resume still readable");
    expect(body).toContain("over-limit batch returned");
  });
});

/**
 * The migration's DO block runs once, when 084 is applied. It cannot see a
 * later migration widening host_can_view_seeker or re-granting a projection to
 * anon, and it is invisible to vitest, which is how a reviewer's mutation of
 * the entitlement predicate passed a green suite. The behavioural assertions
 * therefore also live in a DB-connected suite that runs per PR — and these
 * tests exist so that suite cannot be quietly dropped or unwired.
 */
describe("host applicant bridge — the behavioural proof runs on every PR", () => {
  const suite = readFileSync(
    new URL("../../../tools/db-assert/sql/assert_host_applicant_bridge.sql", import.meta.url),
    "utf8",
  );
  const workflow = readFileSync(
    new URL("../../../.github/workflows/db-security.yml", import.meta.url),
    "utf8",
  );
  const runner = readFileSync(
    new URL("../../../tools/db-assert/assert-applicant-bridge.mjs", import.meta.url),
    "utf8",
  );

  it("is wired into the database security workflow", () => {
    expect(workflow).toContain("tools/db-assert/assert-applicant-bridge.mjs");
    expect(workflow).toContain("pull_request");
    expect(runner).toContain("assert_host_applicant_bridge.sql");
  });

  it("exercises every bridge function against a real database", () => {
    for (const fn of BRIDGE_FUNCTIONS) {
      expect(suite, `${fn} is never called by the connected suite`).toContain(`public.${fn}(`);
    }
  });

  it("covers each entitlement arm and each refusal the migration claims", () => {
    const claims = [
      // the three arms
      "public.applications",
      "public.invites",
      "public.conversations",
      // the refusals
      "host A cannot read an unrelated seeker experiences",
      "host B cannot read host A applicant experiences",
      "a seeker cannot read themselves through the bridge",
      "anon cannot execute get_host_applicant_profile",
      "anon cannot call the entitlement predicate directly",
      "a soft-deleted seeker work history is gone",
      "a 201-id batch raises instead of returning nothing",
    ];
    for (const claim of claims) {
      expect(suite, `the connected suite no longer covers: ${claim}`).toContain(claim);
    }
  });

  it("asserts its own completeness with exact counts, not a floor", () => {
    expect(suite).toContain("pg_temp.assert_suite_complete(");
    expect(suite).toMatch(/checkpoint_section\(/);
    // A lower bound lets a whole section stop running while the totals still
    // clear the floor. That is the defect this replaced.
    expect(suite).not.toMatch(/v_refusal\s*<\s*\d+/);
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

/**
 * The name path degrades; the resume path does not. Both halves are asserted
 * here, because the tempting repair in either direction rebuilds a real defect:
 * throwing on a name lookup takes four host list surfaces down (and made a
 * deploy-order window fatal, since the code ships before the migration is
 * applied), while swallowing the fault into an empty map restores the original
 * bug where an unresolvable name and an unentitled one both render a
 * placeholder.
 */
describe("host applicant bridge — a name lookup degrades without lying", () => {
  it("turns a fault into an unavailable lookup rather than an exception", () => {
    const lookup = readSeekerNameLookup("probe", {
      data: null,
      error: { message: "function public.get_host_applicant_display_names does not exist" },
    });
    expect(lookup.status).toBe("unavailable");
    if (lookup.status === "unavailable") {
      // The reason must survive: it is what the call sites log.
      expect(lookup.reason).toMatch(/does not exist/);
    }
  });

  it("turns a successful read into a resolved lookup", () => {
    const lookup = readSeekerNameLookup("probe", {
      data: [{ seeker_profile_id: "s1", display_name: "Dana" }],
      error: null,
    });
    expect(lookup.status).toBe("resolved");
    expect(singleSeekerName(lookup, "s1")).toBe("Dana");
  });

  it("does not confuse an unavailable lookup with an unentitled seeker", () => {
    const resolved = readSeekerNameLookup("probe", { data: [], error: null });
    const broken = readSeekerNameLookup("probe", { data: null, error: { message: "boom" } });

    // Entitled-but-absent keeps the caller's own placeholder.
    expect(resolveSeekerName(resolved, "s1", "Applicant 1234")).toBe("Applicant 1234");
    // A fault must NOT render as that placeholder — that is the 084 bug.
    expect(resolveSeekerName(broken, "s1", "Applicant 1234")).toBe(SEEKER_NAME_UNAVAILABLE);
    expect(resolveSeekerName(broken, "s1", "Applicant 1234")).not.toBe("Applicant 1234");
    expect(resolveSeekerName(broken, "s1", "Seeker")).not.toBe("Seeker");
  });

  it("reports a single name as absent, never as a fabricated one, when unavailable", () => {
    const broken = readSeekerNameLookup("probe", { data: null, error: { message: "boom" } });
    expect(singleSeekerName(broken, "s1")).toBeNull();
  });

  it("poisons the whole lookup when any chunk fails", () => {
    // A half-resolved map would render some real names and some placeholders,
    // with nothing distinguishing the two. One failed page makes the lookup
    // unavailable, in either order.
    const good = readSeekerNameLookup("probe", {
      data: [{ seeker_profile_id: "s1", display_name: "Dana" }],
      error: null,
    });
    const bad = readSeekerNameLookup("probe", { data: null, error: { message: "boom" } });

    expect(mergeSeekerNameLookups(good, bad).status).toBe("unavailable");
    expect(mergeSeekerNameLookups(bad, good).status).toBe("unavailable");

    const merged = mergeSeekerNameLookups(
      good,
      readSeekerNameLookup("probe", {
        data: [{ seeker_profile_id: "s2", display_name: "Rae" }],
        error: null,
      }),
    );
    expect(merged.status).toBe("resolved");
    expect(singleSeekerName(merged, "s1")).toBe("Dana");
    expect(singleSeekerName(merged, "s2")).toBe("Rae");
  });

  it("treats a lookup that was never asked as resolved and empty", () => {
    const nothing = emptySeekerNameLookup();
    expect(nothing.status).toBe("resolved");
    expect(resolveSeekerName(nothing, "s1", "Applicant 1234")).toBe("Applicant 1234");
  });

  it("chunks below the bound the database enforces", () => {
    expect(HOST_APPLICANT_NAME_BATCH).toBeLessThanOrEqual(batchBoundFromMigration());
  });
});
