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

  /**
   * A fractional figure USED to be truncated (2.9 became +2), which the title of
   * this case already contradicted: rounding a value down still inflates the cap
   * by two slots nobody bought. host_profiles.purchased_listing_slots is an
   * integer column with a non-negative CHECK, so a fraction can only arrive from
   * a corrupted or hand-crafted payload — the one case where the answer must be
   * "nothing", not "nearly all of it".
   */
  it.each([-5, Number.NaN, Number.POSITIVE_INFINITY, 2.9, 0.9])(
    "contributes nothing for a purchased value of %s — no shrinking, no inflating",
    (bad) => {
      expect(totalListingAllowance("starter", bad)).toBe(
        PLAN_ENTITLEMENTS.starter.listings,
      );
    },
  );

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

  /**
   * THE DENORMALIZED COPY HAS TO BE RECONCILED SOMEWHERE, AND HERE IS THE ONLY
   * PLACE IT CAN BE.
   *
   * host_subscriptions is the authority; host_profiles.subscription_tier is the
   * read copy that listing, search and badge queries join. The Stripe webhook
   * writes the authority first and then the copy — but the copy's UPDATE matches
   * zero rows whenever no profile exists, and the gate above makes that the
   * NORMAL order of events (sign up -> pay -> create profile). So the webhook
   * cannot be the thing that keeps the copy in step for a new customer, and the
   * webhook raising there returned 500 for every first-time payer.
   *
   * create_my_host_profile is where it lands instead: it already reads the
   * authority to decide whether creation is allowed, and it is the application's
   * only path onto an existing profile id.
   */
  it("reconciles the denormalized tier copy whenever the profile is resolved", () => {
    const body = sqlFunctionBody("public", "create_my_host_profile");

    const reconcile = body.indexOf(
      "update public.host_profiles set subscription_tier = v_tier " +
        "where id = v_existing_id and subscription_tier is distinct from v_tier;",
    );
    expect(reconcile).toBeGreaterThan(-1);

    // Inside the "you already have a profile" arm: after the disabled check and
    // before the gate, so a LAPSED host is reconciled too rather than refused.
    const disabled = body.indexOf("message = 'profile_identity_disabled'");
    const gate = body.indexOf("message = 'host_subscription_required'");
    expect(reconcile).toBeGreaterThan(disabled);
    expect(gate).toBeGreaterThan(reconcile);

    // Read through the one resolver 083 declares, never recomputed here.
    expect(
      body.split("v_tier := public.host_subscription_tier_for_clerk_user(v_clerk_user_id);")
        .length - 1,
      "the tier must be resolved for the existing-profile arm as well as the insert",
    ).toBeGreaterThanOrEqual(2);

    // The predicate is what makes the no-change case touch no rows, so calling
    // this RPC on every page does not rewrite a column and fire 072's trigger.
    expect(body).toContain("subscription_tier is distinct from v_tier");
  });

  it("still seeds the copy on the INSERT, so it is never born stale", () => {
    const body = sqlFunctionBody("public", "create_my_host_profile");
    const insert = body.indexOf("insert into public.host_profiles");
    expect(insert).toBeGreaterThan(-1);
    expect(body.slice(insert)).toContain("subscription_tier");
    expect(body.slice(insert)).toContain("v_tier");
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

  // ── The paid add-on the allowance has to honour ───────────────────────────
  //
  // An earlier draft DISCOVERED this column from a list of four plausible names
  // and returned 0 when none matched. The name the add-on actually shipped
  // (purchased_listing_slots) was not among them, so a host who bought five
  // extra listings was enforced at one while the application told them six —
  // Stripe and the database disagreeing in the direction that keeps the money.
  // These assertions exist to make that shape unwritable again.

  it("DECLARES the purchased-allowance column, so the read below can name it", () => {
    expect(EXECUTABLE).toContain(
      "add column if not exists purchased_listing_slots integer not null default 0",
    );
    expect(EXECUTABLE).toContain("check (purchased_listing_slots >= 0)");
  });

  it("NAMES host_profiles.purchased_listing_slots rather than guessing at it", () => {
    const body = sqlFunctionBody("private", "host_purchased_listing_allowance");
    expect(body).toContain("h.purchased_listing_slots");
    expect(body).toContain("from public.host_profiles h");
  });

  /**
   * `language sql` is the assertion, not a style note: the body is parsed and the
   * column resolved when the function is CREATED, so a dropped or renamed column
   * fails `supabase db reset` here. A plpgsql body would not be checked until it
   * ran, and the discovery version could not fail at all.
   */
  it("resolves the column at CREATE time, so a missing column fails the reset", () => {
    const definition = EXECUTABLE.slice(
      EXECUTABLE.indexOf("function private.host_purchased_listing_allowance"),
    );
    expect(definition.slice(0, 200)).toContain("language sql");
  });

  it("carries no column-name discovery machinery at all", () => {
    const body = sqlFunctionBody("private", "host_purchased_listing_allowance");
    // A guessed identifier that falls back to 0 sells an entitlement and
    // enforces nothing. There is no acceptable amount of it.
    expect(body).not.toContain("pg_attribute");
    expect(body).not.toContain("execute format");
    expect(body).not.toContain("attname");
    for (const guess of [
      "purchased_listing_allowance",
      "additional_listing_allowance",
      "extra_listing_allowance",
      "purchased_extra_listings",
    ]) {
      expect(body).not.toContain(guess);
    }
  });

  it("adds the purchased term to the plan term rather than replacing it", () => {
    const body = sqlFunctionBody("private", "host_listing_allowance");
    expect(body).toContain("private.plan_listing_allowance(v_tier)");
    expect(body).toContain("private.host_purchased_listing_allowance(p_host_profile_id)");
    expect(body).toMatch(/\+\s*private\.host_purchased_listing_allowance/);
  });

  it("does not gate service-role moderation or sourced inventory", () => {
    expect(EXECUTABLE).toContain("if not v_is_authenticated_request then return new; end if;");
    expect(EXECUTABLE).toContain("if new.provenance = 'sourced' then return new; end if;");
  });

  /**
   * The exemption for a move between two already-counted statuses survives, but
   * it stops short of ENTERING 'live'.
   *
   * The blanket version was the second half of the "downgrade and keep
   * everything live" bypass: a host whose plan lapsed sat over their allowance
   * and could pause and resume the same listing forever, because every one of
   * those moves left the counted set the same size and was exempted before the
   * allowance was ever read. paused -> live and under_review -> live must meet
   * the check; a host INSIDE their allowance still passes it, because the count
   * excludes the row being written.
   */
  it("exempts counted-status moves EXCEPT the ones that enter 'live'", () => {
    expect(EXECUTABLE).toContain(
      "old.status = any(array['live', 'paused', 'under_review']::text[]) " +
        "and (new.status = old.status or new.status <> 'live') then return new",
    );
  });

  /**
   * Taking something DOWN is never refused. An over-allowance host who could not
   * pause, archive or even edit their own live listing would be trapped by the
   * very rule that is supposed to make them act.
   */
  it("keeps an unchanged status and every exit from a counted status exempt", () => {
    // fromIndex on the closing marker: pg_advisory_xact_lock appears earlier in
    // the file (the announcement quota takes one too), and slicing to its FIRST
    // occurrence yields an empty string that satisfies nothing while passing
    // nothing either.
    const guardStart = EXECUTABLE.indexOf("if tg_op = 'update'");
    expect(guardStart).toBeGreaterThan(-1);
    const guard = EXECUTABLE.slice(
      guardStart,
      EXECUTABLE.indexOf("perform pg_advisory_xact_lock", guardStart),
    );
    expect(guard.length).toBeGreaterThan(0);
    expect(guard).toContain("new.status = old.status");
    expect(guard).toContain("new.status <> 'live'");
    // Joined by `or`, not `and`: an edit to a live listing satisfies only the
    // first, and pausing satisfies only the second.
    expect(guard).toMatch(/new\.status = old\.status or new\.status <> 'live'/);
  });

  /**
   * THE HALF A TRIGGER CANNOT DO. The trigger fires on a write to `listings`; a
   * host whose subscription lapses writes nothing, so an unpublish sweep driven
   * by the SUBSCRIPTION is the only thing that can take their listings down.
   */
  describe("close_host_listings_over_allowance — the lapse sweep", () => {
    const body = () => sqlFunctionBody("public", "close_host_listings_over_allowance");

    it("exists and is reachable only by the service role", () => {
      expect(EXECUTABLE).toContain(
        "create or replace function public.close_host_listings_over_allowance",
      );
      expect(EXECUTABLE).toContain(
        "revoke execute on function public.close_host_listings_over_allowance(text) " +
          "from public, anon, authenticated",
      );
      expect(EXECUTABLE).toContain(
        "grant execute on function public.close_host_listings_over_allowance(text) " +
          "to service_role",
      );
    });

    it("reads the allowance through the same helper the trigger enforces", () => {
      expect(body()).toContain("private.host_listing_allowance(v_host.id)");
    });

    /**
     * `offset v_allowance` is the whole sweep: keep exactly the allowance, close
     * what is past it. An unordered or unbounded delete would take down a host's
     * entire inventory on any downgrade.
     */
    it("closes only the EXCESS, ordered so the shopfront outlives the queue", () => {
      const sql = body();
      expect(sql).toContain("offset v_allowance");
      expect(sql).toContain("set status = 'closed'");
      // The order decides what is KEPT, because `offset` skips the first
      // `allowance` rows: live must sort FIRST or a downgrade takes the public
      // listings down and leaves the review queue standing.
      expect(sql).toMatch(/when 'live' then 0/);
      expect(sql).toMatch(/when 'paused' then 1/);
      expect(sql.indexOf("when 'live' then 0")).toBeLessThan(
        sql.indexOf("when 'paused' then 1"),
      );
      // Deterministic within a status band, so the sweep does not depend on the
      // order the planner happens to return rows in.
      expect(sql).toContain("l.created_at");
    });

    it("takes the trigger's own per-host advisory lock", () => {
      expect(body()).toContain("'listing_allowance:' || v_host.id::text");
    });

    /** Sourced inventory has no host paying for a slot (070 decision 4). */
    it("never touches sourced inventory", () => {
      expect(body()).toContain("l.provenance <> 'sourced'");
    });

    /**
     * 'closed' rather than 'paused', and the difference decides whether a host
     * can come back. paused OCCUPIES a slot, so a swept host who re-subscribed
     * to Starter would still be unable to publish anything; closed is outside
     * the counted set, and 082 gives them closed -> draft.
     */
    it("moves the excess OUT of the counted set, not merely out of sight", () => {
      const counted = "'live', 'paused', 'under_review'";
      expect(sqlFunctionBody("private", "host_active_listing_count")).toContain(counted);
      expect(body()).not.toContain("set status = 'paused'");
      expect(body()).not.toContain("set status = 'archived'");
      expect(body()).not.toContain("delete from public.listings");
    });
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
