/**
 * A CLAIMED SEAT MUST IMPLY A CAPABILITY.
 *
 * The defect this pins is the one that put team seats back on the price list:
 * TEAM_SEATS_BY_TIER went 0 -> 1 for Enterprise, the homepage grew a "1 team
 * seat alongside the owner" bullet, the settings page grew a card, and the
 * Stripe product description sold it — while accepting an invitation granted
 * nothing at all. No policy on listings, applications, conversations, messages
 * or any analytics source references team_memberships;
 * public.current_host_profile_ids() resolves host identity from
 * host_profiles.clerk_user_id alone; nothing reads role_preset or
 * custom_permissions. A colleague who accepted saw exactly what a stranger sees,
 * and /host bounced them to onboarding because they hold no host_profiles row.
 *
 * Invite / accept / revoke plumbing is NOT a capability. The capability is the
 * access, and access in this product is spelled in RLS. So this test reads the
 * migrations — the only authority on what a team member can reach — and refuses
 * any non-zero seat count until at least one of them admits a team membership to
 * something that is not the team_memberships table itself.
 *
 * It is deliberately cheap to satisfy honestly and impossible to satisfy by
 * editing a number.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { TEAM_SEATS_BY_TIER } from "@explore-and-earn/contracts";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../supabase/migrations/", import.meta.url),
);

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

/** SQL with `-- line comments` stripped: a comment that mentions the table is
 * prose, not a grant, and several of them do. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/**
 * Statements that give a team member access to something.
 *
 * Two shapes count, because those are the two the repository actually uses:
 *
 *   1. `create policy … on <table>` for a table OTHER than team_memberships
 *      whose body mentions team_memberships.
 *   2. a SECURITY DEFINER function whose body reads team_memberships — the
 *      house pattern (013 / 081) for exactly this, because a cross-table
 *      sub-select written inline in a policy is permission-checked against the
 *      invoking role and would 42501.
 *
 * Policies on team_memberships itself are excluded: letting an owner list their
 * team, or a member read their own row, is bookkeeping about the invitation, not
 * access to the host's data.
 */
export function teamAccessGrants(sql: string): string[] {
  const statements = stripComments(sql)
    .split(";")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter((s) => s.length > 0);

  return statements.filter((statement) => {
    const lower = statement.toLowerCase();
    if (!lower.includes("team_memberships")) return false;

    if (lower.startsWith("create policy")) {
      const target = /\bon\s+(?:public\.)?([a-z_][a-z0-9_]*)/.exec(lower)?.[1];
      return target !== undefined && target !== "team_memberships";
    }

    if (/^create (or replace )?function/.test(lower)) {
      return lower.includes("security definer");
    }

    return false;
  });
}

describe("team seats may not be sold without a capability", () => {
  const grants = teamAccessGrants(allMigrationSql());

  it.each(Object.entries(TEAM_SEATS_BY_TIER))(
    "%s claims a seat only if a migration admits a team member to something",
    (tier, seats) => {
      if (seats <= 0) return;
      expect(
        grants,
        `TEAM_SEATS_BY_TIER.${tier} sells ${seats} seat(s), but no migration ` +
          `admits a team_memberships row to any table other than ` +
          `team_memberships itself. Accepting an invitation would grant nothing. ` +
          `Build the access half (a policy, or a SECURITY DEFINER helper the ` +
          `policies use) before raising this number.`,
      ).not.toEqual([]);
    },
  );

  it("records the state this rule was written for: no access half exists yet", () => {
    // Not a redundant restatement of the rule above — this is the fact that
    // makes every seat count zero. If it ever fails, the access half has landed
    // and the seat counts become a founder question rather than a lie.
    expect(grants).toEqual([]);
  });

  // ── Negative control ──────────────────────────────────────────────────────
  // The rule above is only worth anything if the detector can actually see a
  // grant. An always-empty detector would let any number through.

  it("negative control: the detector SEES a policy that admits a team member", () => {
    const fixture = `
      create policy listings_team_member on public.listings
        for select to authenticated
        using (host_profile_id in (select host_profile_id from public.team_memberships
                                    where status = 'active'));
    `;
    expect(teamAccessGrants(fixture)).toHaveLength(1);
  });

  it("negative control: the detector SEES a SECURITY DEFINER helper", () => {
    const fixture = `
      create or replace function public.current_team_host_profile_ids()
      returns setof uuid language sql stable security definer set search_path = ''
      as $$ select host_profile_id from public.team_memberships where status = 'active' $$;
    `;
    expect(teamAccessGrants(fixture)).toHaveLength(1);
  });

  it("negative control: bookkeeping on team_memberships itself is NOT a capability", () => {
    const fixture = `
      create policy team_memberships_all_host on public.team_memberships
        for all to authenticated
        using (host_profile_id in (select public.current_host_profile_ids()));
    `;
    expect(teamAccessGrants(fixture)).toEqual([]);
  });

  it("negative control: a comment mentioning the table is not a grant", () => {
    const fixture = `
      -- create policy listings_team_member on public.listings using (team_memberships)
      create policy listings_own on public.listings for select to authenticated using (true);
    `;
    expect(teamAccessGrants(fixture)).toEqual([]);
  });
});
