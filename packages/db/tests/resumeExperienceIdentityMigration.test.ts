import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  new URL(
    "../../../supabase/migrations/093_resume_experience_identity.sql",
    import.meta.url,
  ),
  "utf8",
).toLowerCase();
const CONNECTED_ASSERTION = readFileSync(
  new URL(
    "../../../tools/db-assert/sql/assert_resume_experience_identity.sql",
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

const ECMASCRIPT_TRIM_CODE_POINTS = [
  9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196,
  8197, 8198, 8199, 8200, 8201, 8202, 8232, 8233, 8239, 8287, 12288,
  65279,
] as const;

const TRIM_CHARACTERS_SQL = `concat(${ECMASCRIPT_TRIM_CODE_POINTS.map(
  (codePoint) => `chr(${codePoint})`,
).join(",")})`;

function compact(source: string): string {
  return source.toLowerCase().replace(/[ \t\r\n]/g, "");
}

function constraintProofSource(source: string): string {
  return compact(source).replaceAll("::text", "");
}

function md5(source: string): string {
  return createHash("md5").update(source).digest("hex");
}

function taggedSection(
  source: string,
  declaration: string,
  tag: string,
): string {
  const start = source.indexOf(declaration);
  expect(start).toBeGreaterThan(-1);
  const contentStart = source.indexOf("\n", start) + 1;
  const end = source.indexOf(`\n  $${tag}$;`, contentStart);
  expect(end).toBeGreaterThan(contentStart);
  return source.slice(contentStart, end);
}

function functionDefinition(source: string, functionName: string): string {
  const start = source.indexOf(`create or replace function ${functionName}`);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("$$;", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

function functionSource(source: string, functionName: string): string {
  const definition = functionDefinition(source, functionName);
  const marker = definition.indexOf("as $$");
  expect(marker).toBeGreaterThan(-1);
  const contentStart = definition.indexOf("\n", marker) + 1;
  const end = definition.lastIndexOf("\n$$;");
  expect(end).toBeGreaterThan(contentStart);
  return definition.slice(contentStart, end);
}

function meaningfulField(field: string, trimCharacters: string): string {
  return `nullif(btrim(coalesce(${field},''),${trimCharacters}),'')isnotnull`;
}

describe("migration 093 resume experience identity", () => {
  const identityExpression = taggedSection(
    MIGRATION,
    "v_identity_expression constant text := $expression$",
    "expression",
  );
  const predicateSource = functionSource(
    MIGRATION,
    "private.application_resume_is_complete",
  );
  const predicateDefinition = functionDefinition(
    MIGRATION,
    "private.application_resume_is_complete",
  );
  const compactPredicate = compact(predicateSource);
  const constraintHash = md5(constraintProofSource(identityExpression));
  const functionHash = md5(compact(predicateSource));

  it("uses the exact ECMAScript trim set and role-or-company identity", () => {
    const expectedIdentity = `((${meaningfulField(
      "role_title",
      TRIM_CHARACTERS_SQL,
    )})or(${meaningfulField("company_name", TRIM_CHARACTERS_SQL)}))`;

    expect(compact(identityExpression)).toBe(expectedIdentity);
    expect(MIGRATION).not.toContain("[[:space:]]");
    expect(MIGRATION).not.toMatch(/btrim\([^,\n]+\)/);
    expect(MIGRATION).toContain(
      "add constraint seeker_resume_experiences_identity_chk check (%s) not valid",
    );
    expect(MIGRATION).not.toContain(
      "validate constraint seeker_resume_experiences_identity_chk",
    );
  });

  it("rejects a same-name constraint unless its normalized definition is exact", () => {
    expect(MIGRATION).toContain(
      "create temporary table migration_093_resume_identity_probe",
    );
    expect(MIGRATION).toContain(
      "pg_temp.migration_093_resume_identity_probe",
    );
    expect(MIGRATION.match(/pg_get_expr\(c\.conbin, c\.conrelid, false\)/g)).toHaveLength(
      2,
    );
    expect(MIGRATION).toContain(
      "translate(lower(v_actual_expression), e' \\t\\n\\r', '')",
    );
    expect(MIGRATION).toContain(
      "translate(lower(v_expected_expression), e' \\t\\n\\r', '')",
    );
    expect(MIGRATION).toContain(
      "seeker_resume_experiences_identity_chk has an unexpected definition",
    );
    expect(MIGRATION).toContain(
      "seeker_resume_experiences_identity_chk has an unexpected type or validation state",
    );
  });

  it("uses the same trim contract for every profile and experience predicate", () => {
    expect(compactPredicate.split(compact(TRIM_CHARACTERS_SQL))).toHaveLength(
      2,
    );

    const profilePrefix = [
      "wheresp.id=p_seeker_profile_id",
      "andsp.deleted_atisnull",
      `and${meaningfulField("sp.display_name", "trim_characters.value")}`,
      `and${meaningfulField("sp.relative_location", "trim_characters.value")}`,
      `and${meaningfulField("sp.seeking_timeline", "trim_characters.value")}`,
      "and(",
    ].join("");
    expect(compactPredicate).toContain(profilePrefix);

    const experienceIdentity = [
      meaningfulField("experience.role_title", "trim_characters.value"),
      meaningfulField("experience.company_name", "trim_characters.value"),
    ].join("or");
    expect(compactPredicate.split(experienceIdentity)).toHaveLength(3);
    expect(compactPredicate).toContain(
      `and(${meaningfulField("sp.short_bio", "trim_characters.value")}orexists(`,
    );
    expect(compactPredicate).toContain(
      `and(${experienceIdentity})andcardinality(coalesce(experience.skill_tags,'{}'::text[]))>0`,
    );

    expect(predicateDefinition).toContain("language sql");
    expect(predicateDefinition).toContain("stable");
    expect(predicateDefinition).toContain("security definer");
    expect(predicateDefinition).toContain("set search_path = ''");
  });

  it("pins exact normalized constraint and function definitions in every proof", () => {
    for (const proof of [CONNECTED_ASSERTION, PRODUCTION_ASSERTION]) {
      expect(proof).toContain(constraintHash);
      expect(proof).toContain(functionHash);
    }
    expect(PRODUCTION_ASSERTION).toContain(
      "pg_get_expr(c.conbin, c.conrelid, false)",
    );
    expect(PRODUCTION_ASSERTION).toContain(
      "md5(translate(lower(p.prosrc), e' \\t\\n\\r', ''))",
    );
    expect(MIGRATION).toMatch(
      /revoke execute on function private\.application_resume_is_complete\(uuid\)\s+from public, anon, authenticated, service_role/i,
    );
  });

  it("keeps structural parentheses in the constraint fingerprint", () => {
    const leftGrouped = "not (role_has_text or company_has_text)";
    const rightGrouped = "(not role_has_text) or company_has_text";

    const oldParenthesisErasingProof = (source: string) =>
      compact(source).replace(/[()]/g, "");

    expect(oldParenthesisErasingProof(leftGrouped)).toBe(
      oldParenthesisErasingProof(rightGrouped),
    );
    expect(constraintProofSource(leftGrouped)).not.toBe(
      constraintProofSource(rightGrouped),
    );
    expect(md5(constraintProofSource(leftGrouped))).not.toBe(
      md5(constraintProofSource(rightGrouped)),
    );
    expect(CONNECTED_ASSERTION).toContain("e' \\t\\n\\r'");
    expect(PRODUCTION_ASSERTION).toContain("e' \\t\\n\\r'");
    expect(CONNECTED_ASSERTION).not.toContain("e' \\t\\n\\r()'");
    expect(PRODUCTION_ASSERTION).not.toContain("e' \\t\\n\\r()'");
  });

  it("ships rollback-only direct behavioral proof for whitespace and positive paths", () => {
    for (const proof of [
      "tab and line-terminator profile text does not complete resume",
      "unicode whitespace profile location does not complete resume",
      "unicode whitespace profile bio does not complete resume",
      "authenticated tab and line-terminator experience identity is rejected",
      "authenticated unicode whitespace experience identity is rejected",
      "authenticated role-only experience insert succeeds",
      "authenticated employer-only experience insert succeeds",
      "role-only experience completes resume",
      "employer-only experience completes resume",
    ]) {
      expect(CONNECTED_ASSERTION).toContain(proof);
    }
    expect(CONNECTED_ASSERTION).not.toMatch(
      /(?:drop|add) constraint seeker_resume_experiences_identity_chk/,
    );
    expect(CONNECTED_ASSERTION).toMatch(/^\s*begin;/m);
    expect(CONNECTED_ASSERTION).toMatch(/^\s*rollback;/m);
    expect(ASSERTION_DRIVER).toContain(
      'join(here, "sql", "assert_resume_experience_identity.sql")',
    );
  });

  it("reserves and production-gates the exact migration contract", () => {
    const allocations = JSON.parse(MIGRATION_ALLOCATIONS) as {
      allocations: Record<string, { slug: string; status: string }>;
    };
    expect(allocations.allocations["093"]).toMatchObject({
      slug: "resume_experience_identity",
      status: "reserved",
    });

    for (const field of [
      "migration_093_applied",
      "resume_experience_identity_contract_safe",
    ]) {
      expect(PRODUCTION_ASSERTION).toContain(`as ${field}`);
      expect(DB_MIGRATE_WORKFLOW).toContain(`.[0].${field} == true`);
    }
    expect(DB_MIGRATE_WORKFLOW).toContain("migrations 077/091/092/093");
  });
});
