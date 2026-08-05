import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function executableSql(path: URL): string {
  return readFileSync(path, "utf8")
    .replace(/--.*$/gm, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function authenticatedUpdateColumns(sql: string): Set<string> {
  const columns = new Set<string>();
  for (const match of sql.matchAll(
    /grant\s+update\s*\(([^)]+)\)\s+on\s+public\.seeker_profiles\s+to\s+authenticated\s*;/g,
  )) {
    for (const column of (match[1] ?? "").split(",")) {
      const normalized = column.trim();
      if (normalized) columns.add(normalized);
    }
  }
  return columns;
}

const privacy = executableSql(
  new URL("../../../supabase/migrations/061_seeker_profiles_column_privacy.sql", import.meta.url),
);
const remotePreference = executableSql(
  new URL("../../../supabase/migrations/089_seeker_remote_preference_grant.sql", import.meta.url),
);
const combined = `${privacy} ${remotePreference}`;

describe("seeker profile update grants", () => {
  it("grants every onboarding writer column while preserving the narrow allow-list", () => {
    const granted = authenticatedUpdateColumns(combined);

    for (const column of [
      "display_name",
      "short_bio",
      "open_to_statement",
      "relative_location",
      "seeking_timeline",
      "remote_preference",
      "housing_preference",
      "meals_preference",
      "pay_expectation_min_cents",
      "pay_expectation_max_cents",
      "pay_expectation_unit",
      "pay_flexible",
      "desired_categories",
      "desired_roles",
      "general_skill_tags",
      "onboarding_complete",
    ]) {
      expect(granted, `${column} must remain seeker-writable`).toContain(column);
    }

    for (const serverOwned of [
      "completion_score",
      "visibility_status",
      "match_confidence_score",
      "clerk_user_id",
      "deleted_at",
    ]) {
      expect(granted, `${serverOwned} must remain server-owned`).not.toContain(
        serverOwned,
      );
    }
  });

  it("adds only the missing authenticated column and never reopens table-wide update", () => {
    expect(remotePreference).toContain(
      "grant update (remote_preference) on public.seeker_profiles to authenticated;",
    );
    expect(remotePreference).not.toContain(
      "grant update on public.seeker_profiles",
    );
    expect(remotePreference).not.toContain("to anon");
  });
});
