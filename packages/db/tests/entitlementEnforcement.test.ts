/**
 * Migration 083 — entitlement enforcement.
 *
 * Two kinds of assertion live here, and neither replaces the other:
 *
 *  1. The arithmetic in packages/db/src/lib/entitlements.ts, which decides what
 *     the application TELLS a host.
 *  2. A drift guard between that arithmetic and the SQL that actually REFUSES.
 *     083 encodes the allowances a second time, in plpgsql, because the trigger
 *     cannot import from contracts. Two copies of a number is exactly how a
 *     product ends up selling one allowance and enforcing another (ADR-039), so
 *     the SQL is parsed out of the migration file and compared here.
 *
 * The refusal itself is proved against a real database in
 * entitlementEnforcementIntegration.test.ts.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_FREE_DURATION_DAYS,
  ANNOUNCEMENT_MONTHLY_QUOTA,
  PLAN_ENTITLEMENTS,
} from "@explore-and-earn/contracts";

import {
  countsTowardListingAllowance,
  hasListingCapacity,
  isPaidPlanTier,
  LISTING_ALLOWANCE_COUNTED_STATUSES,
  parseListingAllowanceState,
  planAnnouncementQuota,
  planListingAllowance,
  totalListingAllowance,
} from "../src/lib/entitlements.js";

const MIGRATION = readFileSync(
  new URL(
    "../../../supabase/migrations/083_entitlement_enforcement.sql",
    import.meta.url,
  ),
  "utf8",
);

/** Executable SQL only — the header explains the OLD behaviour at length. */
const EXECUTABLE = MIGRATION.split("\n")
  .map((line) => line.replace(/--.*$/, ""))
  .join(" ")
  .toLowerCase()
  .replace(/\s+/g, " ");

/**
 * The body of one SQL function, bounded by its own dollar quotes.
 *
 * Slicing a fixed number of characters instead would run past the terminator
 * into the NEXT function — which is not hypothetical: it made this file's first
 * draft read the announcement quotas as the listing allowances and still pass
 * three of its five drift assertions.
 */
function sqlFunctionBody(schema: string, functionName: string): string {
  const start = EXECUTABLE.indexOf(`function ${schema}.${functionName}`);
  expect(start, `${schema}.${functionName} must exist in migration 083`).toBeGreaterThan(-1);
  const bodyStart = EXECUTABLE.indexOf("as $$", start);
  const bodyEnd = EXECUTABLE.indexOf("$$", bodyStart + "as $$".length);
  expect(bodyStart, `${functionName} must have a dollar-quoted body`).toBeGreaterThan(-1);
  expect(bodyEnd).toBeGreaterThan(bodyStart);
  return EXECUTABLE.slice(bodyStart, bodyEnd);
}

/** Pull `when 'tier' then N` pairs out of a named SQL function body. */
function sqlCaseMap(functionName: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const match of sqlFunctionBody("private", functionName).matchAll(
    /when '([a-z_]+)'\s+then\s+(\d+)/g,
  )) {
    map[match[1]] = Number(match[2]);
  }
  return map;
}

// ── The arithmetic the application shows ───────────────────────────────────

describe("plan listing allowance", () => {
  it("is zero for an unsubscribed host — there is no free tier", () => {
    expect(planListingAllowance("none")).toBe(0);
    expect(planListingAllowance(null)).toBe(0);
    expect(planListingAllowance(undefined)).toBe(0);
    expect(planListingAllowance("nonsense")).toBe(0);
  });

  it.each(["starter", "professional", "enterprise"] as const)(
    "matches PLAN_ENTITLEMENTS for %s",
    (tier) => {
      expect(planListingAllowance(tier)).toBe(PLAN_ENTITLEMENTS[tier].listings);
    },
  );

  it("adds a purchased extra-listing allowance", () => {
    expect(totalListingAllowance("starter", 3)).toBe(
      PLAN_ENTITLEMENTS.starter.listings + 3,
    );
  });

  it("never lets a bad purchased value shrink or inflate the plan allowance", () => {
    expect(totalListingAllowance("starter", -5)).toBe(PLAN_ENTITLEMENTS.starter.listings);
    expect(totalListingAllowance("starter", Number.NaN)).toBe(
      PLAN_ENTITLEMENTS.starter.listings,
    );
    expect(totalListingAllowance("starter", 2.9)).toBe(
      PLAN_ENTITLEMENTS.starter.listings + 2,
    );
  });

  it("gives an unsubscribed host nothing even when extras were purchased", () => {
    // A purchased extra is an addition to a plan, not a plan of its own.
    expect(totalListingAllowance("none", 4)).toBe(4);
    expect(planListingAllowance("none")).toBe(0);
  });
});

describe("counted statuses", () => {
  it("counts under_review, so queueing cannot beat the allowance", () => {
    expect(countsTowardListingAllowance("under_review")).toBe(true);
    expect(LISTING_ALLOWANCE_COUNTED_STATUSES).toContain("under_review");
  });

  it("counts live and paused", () => {
    expect(countsTowardListingAllowance("live")).toBe(true);
    expect(countsTowardListingAllowance("paused")).toBe(true);
  });

  it("leaves drafts, closed and archived uncounted", () => {
    expect(countsTowardListingAllowance("draft")).toBe(false);
    expect(countsTowardListingAllowance("closed")).toBe(false);
    expect(countsTowardListingAllowance("archived")).toBe(false);
  });
});

describe("capacity", () => {
  it("refuses at exactly the allowance, not one past it", () => {
    expect(hasListingCapacity(0, 1)).toBe(true);
    expect(hasListingCapacity(1, 1)).toBe(false);
    expect(hasListingCapacity(2, 1)).toBe(false);
  });

  it("refuses everything at a zero allowance", () => {
    expect(hasListingCapacity(0, 0)).toBe(false);
  });
});

describe("paid tiers", () => {
  it.each(["starter", "professional", "enterprise"] as const)("%s is paid", (tier) => {
    expect(isPaidPlanTier(tier)).toBe(true);
  });

  it.each(["none", "", null, undefined, "Starter"])(
    "%s is not a paid tier",
    (value) => {
      expect(isPaidPlanTier(value as string)).toBe(false);
    },
  );
});

describe("allowance state parsing", () => {
  it("reads a well-formed RPC payload", () => {
    expect(parseListingAllowanceState({ tier: "professional", allowance: 5, used: 2 }))
      .toEqual({ tier: "professional", allowance: 5, used: 2 });
  });

  it("degrades an unreadable payload to the value that REFUSES", () => {
    // An allowance we cannot read must never be mistaken for spare capacity.
    const parsed = parseListingAllowanceState({ tier: "wat", allowance: "5", used: null });
    expect(parsed.tier).toBe("none");
    expect(parsed.allowance).toBe(0);
    expect(hasListingCapacity(parsed.used, parsed.allowance)).toBe(false);
  });

  it("degrades null and undefined the same way", () => {
    for (const value of [null, undefined, 42, "nope"]) {
      const parsed = parseListingAllowanceState(value);
      expect(hasListingCapacity(parsed.used, parsed.allowance)).toBe(false);
    }
  });
});

describe("announcement quota", () => {
  it("is zero for none and starter", () => {
    expect(planAnnouncementQuota("none")).toBe(0);
    expect(planAnnouncementQuota("starter")).toBe(0);
    expect(planAnnouncementQuota(null)).toBe(0);
  });

  it.each(["professional", "enterprise"] as const)("matches contracts for %s", (tier) => {
    expect(planAnnouncementQuota(tier)).toBe(ANNOUNCEMENT_MONTHLY_QUOTA[tier]);
  });
});

// ── The drift guard between contracts and the SQL that refuses ─────────────

describe("migration 083 encodes the SAME allowances as contracts", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "private.plan_listing_allowance agrees for %s",
    (tier) => {
      expect(sqlCaseMap("plan_listing_allowance")[tier]).toBe(
        PLAN_ENTITLEMENTS[tier].listings,
      );
    },
  );

  it("private.plan_listing_allowance gives an unlisted tier zero", () => {
    expect(sqlCaseMap("plan_listing_allowance").none).toBeUndefined();
    expect(sqlFunctionBody("private", "plan_listing_allowance")).toContain("else 0 end");
  });

  it.each(["professional", "enterprise"] as const)(
    "private.plan_announcement_quota agrees for %s",
    (tier) => {
      expect(sqlCaseMap("plan_announcement_quota")[tier]).toBe(
        ANNOUNCEMENT_MONTHLY_QUOTA[tier],
      );
    },
  );

  it("private.plan_announcement_quota gives starter and none zero", () => {
    const map = sqlCaseMap("plan_announcement_quota");
    expect(map.starter).toBeUndefined();
    expect(map.none).toBeUndefined();
    expect(sqlFunctionBody("private", "plan_announcement_quota")).toContain("else 0 end");
  });

  it("the included announcement run length matches ANNOUNCEMENT_FREE_DURATION_DAYS", () => {
    expect(sqlFunctionBody("private", "plan_announcement_duration_days").trim()).toBe(
      `as $$ select ${ANNOUNCEMENT_FREE_DURATION_DAYS}`,
    );
  });
});

// ── The shape of the enforcement itself ────────────────────────────────────

describe("migration 083 shape", () => {
  it("keys subscription state by Clerk id, not by host profile", () => {
    expect(EXECUTABLE).toContain(
      "create table if not exists public.host_subscriptions",
    );
    expect(EXECUTABLE).toContain("clerk_user_id text primary key");
  });

  it("takes the TABLE grants away before granting a column list", () => {
    // A column-level revoke is a silent no-op while a table grant survives.
    const revoke = EXECUTABLE.indexOf(
      "revoke all on table public.host_subscriptions from anon, authenticated",
    );
    const grant = EXECUTABLE.indexOf(
      "grant select (clerk_user_id, tier, billing_status, current_period_end) on public.host_subscriptions to authenticated",
    );
    expect(revoke).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(revoke);
  });

  it("gives a host no way to write their own subscription row", () => {
    expect(EXECUTABLE).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*public\.host_subscriptions[^;]*authenticated/,
    );
    expect(EXECUTABLE).not.toMatch(
      /create policy host_subscriptions_[a-z_]+ on public\.host_subscriptions for (insert|update|delete)/,
    );
  });

  it("gates host profile creation on a paid tier", () => {
    expect(EXECUTABLE).toContain("create or replace function public.create_my_host_profile");
    expect(EXECUTABLE).toContain("message = 'host_subscription_required'");
    expect(EXECUTABLE).toContain(
      "v_tier <> all(array['starter', 'professional', 'enterprise']::text[])",
    );
  });

  it("keeps profile creation reachable for an already-created host whose plan lapsed", () => {
    // The gate has to sit AFTER the "you already have a profile" early return:
    // this RPC is how the application resolves a host's own id.
    const earlyReturn = EXECUTABLE.indexOf("message = 'profile_identity_disabled'");
    const gate = EXECUTABLE.indexOf("message = 'host_subscription_required'");
    expect(earlyReturn).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(earlyReturn);
  });

  it("closes the direct announcement write surface entirely", () => {
    expect(EXECUTABLE).toContain(
      "revoke insert, update, delete on table public.host_announcements from anon, authenticated",
    );
    expect(EXECUTABLE).toContain(
      "drop policy if exists host_announcements_owner_insert on public.host_announcements",
    );
    expect(EXECUTABLE).toContain(
      "drop policy if exists host_announcements_owner_update on public.host_announcements",
    );
    expect(EXECUTABLE).not.toMatch(
      /create policy host_announcements_owner_(insert|update)/,
    );
  });

  it("counts announcements under an advisory lock, like 062", () => {
    expect(EXECUTABLE).toContain(
      "create or replace function public.create_my_host_announcement",
    );
    expect(EXECUTABLE).toMatch(
      /create or replace function public\.create_my_host_announcement[\s\S]*?pg_advisory_xact_lock\(\s*hashtextextended\('host_announcement_quota:'/,
    );
    expect(EXECUTABLE).toContain("message = 'announcement_quota_exceeded'");
  });

  it("counts only PLAN-INCLUDED announcements against the included quota", () => {
    expect(EXECUTABLE).toContain("a.stripe_payment_intent_id is null");
    expect(EXECUTABLE).toContain("a.stripe_checkout_session_id is null");
  });

  it("enforces the listing allowance from a trigger, over three statuses", () => {
    expect(EXECUTABLE).toContain(
      "create or replace function private.enforce_listing_allowance()",
    );
    expect(EXECUTABLE).toContain(
      "create trigger trg_listings_plan_allowance before insert or update on public.listings",
    );
    expect(EXECUTABLE).toContain("l.status in ('live', 'paused', 'under_review')");
    expect(EXECUTABLE).toContain("message = 'listing_allowance_exceeded'");
  });

  it("serializes the listing allowance check per host", () => {
    expect(EXECUTABLE).toMatch(
      /pg_advisory_xact_lock\(\s*hashtextextended\('listing_allowance:'/,
    );
  });

  it("does not gate service-role moderation or sourced inventory", () => {
    expect(EXECUTABLE).toContain("if not v_is_authenticated_request then return new; end if;");
    expect(EXECUTABLE).toContain("if new.provenance = 'sourced' then return new; end if;");
  });

  it("does not refuse a move between two already-counted statuses", () => {
    expect(EXECUTABLE).toContain(
      "old.status = any(array['live', 'paused', 'under_review']::text[]) then return new",
    );
  });

  it("pins search_path on every function it defines", () => {
    const definitions = EXECUTABLE.match(
      /create or replace function (public|private)\.[a-z_]+\(/g,
    );
    expect(definitions?.length ?? 0).toBeGreaterThanOrEqual(9);
    const searchPaths = EXECUTABLE.match(/set search_path = ''/g);
    expect(searchPaths?.length ?? 0).toBeGreaterThanOrEqual(definitions?.length ?? 0);
  });

  it("never grants a new RPC to anon or public", () => {
    for (const match of EXECUTABLE.matchAll(
      /grant execute on function public\.[a-z_]+\([^)]*\) to ([^;]*);/g,
    )) {
      expect(match[1]).not.toMatch(/\banon\b/);
      expect(match[1]).not.toMatch(/\bpublic\b/);
    }
  });

  it("rebuilds idempotently from 001", () => {
    expect(EXECUTABLE).toContain("create table if not exists");
    expect(EXECUTABLE).toContain("drop trigger if exists trg_listings_plan_allowance");
    expect(EXECUTABLE).toContain("on conflict (clerk_user_id) do nothing");
    expect(EXECUTABLE).toContain("begin;");
    expect(EXECUTABLE.trimEnd().endsWith("commit;")).toBe(true);
  });
});
