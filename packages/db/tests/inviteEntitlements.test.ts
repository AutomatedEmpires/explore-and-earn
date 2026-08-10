/**
 * Unit tests for invite entitlement math
 * (packages/db/src/queries/inviteEntitlements.ts — pure pieces).
 *
 * The ledger summary is the server-side truth behind invite gating: monthly
 * allowance from the host's REAL tier, restores handing credits back, and
 * purchased packs extending the month. Concurrency/idempotency live in SQL
 * (migration 061: advisory lock + partial unique indexes); these tests pin the
 * balance math those guarantees feed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock server-only so the import doesn't crash in the test environment ───
vi.mock("server-only", () => ({}));

const ioMocks = vi.hoisted(() => ({
  adminClient: vi.fn(),
  authedClient: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("../src/adminClient", () => ({
  adminClient: ioMocks.adminClient,
}));
vi.mock("../src/client", () => ({
  authedClient: ioMocks.authedClient,
}));

import {
  createInviteWithEntitlement,
  getInviteEntitlement,
  invitePeriodKey,
  summarizeInviteLedger,
  type CreateInviteWithEntitlementError,
  type InviteLedgerRow,
} from "../src/queries/inviteEntitlements";
import { MONTHLY_INVITE_QUOTA, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

const JULY = Date.parse("2026-07-14T12:00:00Z");
const PERIOD = "2026-07";
const HOST_ID = "10000000-0000-0000-0000-000000000001";
const LISTING_ID = "20000000-0000-0000-0000-000000000002";
const SEEKER_ID = "30000000-0000-0000-0000-000000000003";
const INVITE_ID = "40000000-0000-0000-0000-000000000004";

function queryChain(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (value: typeof result) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  ioMocks.adminClient.mockReturnValue({ rpc: ioMocks.rpc });
});

const consume = (source: "monthly" | "purchased", periodKey = PERIOD): InviteLedgerRow => ({
  kind: "consume",
  source,
  credits: 1,
  periodKey,
});
const restore = (source: "monthly" | "purchased", periodKey = PERIOD): InviteLedgerRow => ({
  kind: "restore",
  source,
  credits: 1,
  periodKey,
});
const purchase = (credits: number): InviteLedgerRow => ({
  kind: "purchase",
  source: "purchased",
  credits,
  periodKey: null,
});

describe("invitePeriodKey", () => {
  it("buckets by UTC month with zero padding", () => {
    expect(invitePeriodKey(JULY)).toBe("2026-07");
    expect(invitePeriodKey(Date.parse("2026-01-01T00:00:00Z"))).toBe("2026-01");
    expect(invitePeriodKey(Date.parse("2026-12-31T23:59:59Z"))).toBe("2026-12");
  });

  it("uses UTC, not local time, at month boundaries", () => {
    // 2026-08-01T00:00:00Z minus 1ms is still July in UTC.
    expect(invitePeriodKey(Date.parse("2026-08-01T00:00:00Z") - 1)).toBe("2026-07");
    expect(invitePeriodKey(Date.parse("2026-08-01T00:00:00Z"))).toBe("2026-08");
  });
});

describe("summarizeInviteLedger — monthly allowance", () => {
  it("fresh month: full allowance, tier-correct", () => {
    const summary = summarizeInviteLedger([], "professional", PERIOD);
    expect(summary.monthlyAllowance).toBe(10);
    expect(summary.monthlyUsed).toBe(0);
    expect(summary.monthlyRemaining).toBe(10);
    expect(summary.totalRemaining).toBe(10);
  });

  it("counts only the current period (monthly reset is structural)", () => {
    const rows = [
      consume("monthly", "2026-06"),
      consume("monthly", "2026-06"),
      consume("monthly", PERIOD),
    ];
    const summary = summarizeInviteLedger(rows, "starter", PERIOD);
    expect(summary.monthlyUsed).toBe(1);
    expect(summary.monthlyRemaining).toBe(MONTHLY_INVITE_QUOTA.starter - 1);
  });

  it("restores hand the month's slot back", () => {
    const rows = [consume("monthly"), consume("monthly"), restore("monthly")];
    const summary = summarizeInviteLedger(rows, "starter", PERIOD);
    expect(summary.monthlyUsed).toBe(1);
  });

  it("exhausted monthly allowance with no packs → zero remaining", () => {
    const rows = [consume("monthly"), consume("monthly"), consume("monthly")];
    const summary = summarizeInviteLedger(rows, "starter", PERIOD);
    expect(summary.monthlyRemaining).toBe(0);
    expect(summary.totalRemaining).toBe(0);
  });

  it("unsubscribed hosts ('none') get zero included invites", () => {
    const summary = summarizeInviteLedger([], "none", PERIOD);
    expect(summary.monthlyAllowance).toBe(0);
    expect(summary.totalRemaining).toBe(0);
  });
});

describe("summarizeInviteLedger — purchased packs", () => {
  it("purchases extend beyond the monthly allowance", () => {
    const rows = [purchase(5), consume("monthly"), consume("purchased")];
    const summary = summarizeInviteLedger(rows, "starter", PERIOD);
    expect(summary.purchasedBalance).toBe(4);
    expect(summary.totalRemaining).toBe(MONTHLY_INVITE_QUOTA.starter - 1 + 4);
  });

  it("purchased balance survives month boundaries (no monthly reset)", () => {
    const rows = [purchase(10), consume("purchased", "2026-06")];
    const summary = summarizeInviteLedger(rows, "none", PERIOD);
    expect(summary.purchasedBalance).toBe(9);
    expect(summary.totalRemaining).toBe(9);
  });

  it("purchased restores return credits to the purchased bucket", () => {
    const rows = [purchase(5), consume("purchased"), restore("purchased")];
    const summary = summarizeInviteLedger(rows, "none", PERIOD);
    expect(summary.purchasedBalance).toBe(5);
  });

  it("balances clamp at zero — a corrupt ledger can never go negative", () => {
    const rows = [consume("purchased"), consume("purchased")];
    const summary = summarizeInviteLedger(rows, "none", PERIOD);
    expect(summary.purchasedBalance).toBe(0);
    expect(summary.totalRemaining).toBe(0);
  });

  it("ignores non-positive credit rows instead of guessing", () => {
    const rows: InviteLedgerRow[] = [
      { kind: "purchase", source: "purchased", credits: 0, periodKey: null },
      { kind: "purchase", source: "purchased", credits: -5, periodKey: null },
    ];
    const summary = summarizeInviteLedger(rows, "none", PERIOD);
    expect(summary.purchasedBalance).toBe(0);
  });
});

describe("invite quota consistency (ADR-039 pattern, founder charter 2026-07-14)", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "quota gate and pricing entitlements agree for %s",
    (tier) => {
      expect(MONTHLY_INVITE_QUOTA[tier]).toBe(
        PLAN_ENTITLEMENTS[tier].includedInviteCredits,
      );
    },
  );

  it("founder-directed monthly allowances: starter 3 / professional 10 / enterprise 20", () => {
    expect(MONTHLY_INVITE_QUOTA).toEqual({
      none: 0,
      starter: 3,
      professional: 10,
      enterprise: 20,
    });
  });
});

describe("getInviteEntitlement — authoritative tier read", () => {
  it("uses migration 083 subscription authority rather than the profile cache", async () => {
    const host = queryChain({ data: { id: HOST_ID }, error: null });
    const ledger = queryChain({ data: [], error: null });
    const from = vi.fn((table: string) =>
      table === "host_profiles" ? host : ledger,
    );
    ioMocks.authedClient.mockReturnValue({ from });
    ioMocks.rpc.mockResolvedValueOnce({ data: "professional", error: null });

    const result = await getInviteEntitlement("token", "user_host", JULY);

    expect(result).toMatchObject({
      tier: "professional",
      monthlyAllowance: MONTHLY_INVITE_QUOTA.professional,
      monthlyRemaining: MONTHLY_INVITE_QUOTA.professional,
    });
    expect(ioMocks.rpc).toHaveBeenCalledWith(
      "host_subscription_tier_for_clerk_user",
      { p_clerk_user_id: "user_host" },
    );
  });

  it("fails loudly instead of presenting a cached allowance when authority is unavailable", async () => {
    const host = queryChain({ data: { id: HOST_ID }, error: null });
    ioMocks.authedClient.mockReturnValue({ from: vi.fn(() => host) });
    ioMocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "private provider detail" },
    });

    await expect(
      getInviteEntitlement("token", "user_host", JULY),
    ).rejects.toThrow("subscription authority unavailable");
  });
});

describe("createInviteWithEntitlement — fail-closed authority", () => {
  const params = {
    hostProfileId: HOST_ID,
    seekerProfileId: SEEKER_ID,
    listingId: LISTING_ID,
    message: "Come lead harvest.",
  } as const;

  it("returns a strictly decoded authoritative success", async () => {
    ioMocks.rpc.mockResolvedValue({
      data: {
        ok: true,
        invite_id: INVITE_ID,
        source: "monthly",
      },
      error: null,
    });

    await expect(
      createInviteWithEntitlement("token", params),
    ).resolves.toEqual({
      ok: true,
      inviteId: INVITE_ID,
      source: "monthly",
    });
    expect(ioMocks.rpc).toHaveBeenCalledWith("create_host_source_invite_with_credit", {
      p_host_profile_id: HOST_ID,
      p_seeker_profile_id: SEEKER_ID,
      p_listing_id: LISTING_ID,
      p_message: "Come lead harvest.",
    });
    expect(ioMocks.authedClient).not.toHaveBeenCalled();
  });

  it.each([
    "invalid_request",
    "host_not_eligible",
    "listing_not_actionable",
    "seeker_not_sourceable",
    "already_applied",
    "already_invited",
    "invite_credits_required",
  ] satisfies readonly CreateInviteWithEntitlementError[])(
    "preserves the reviewed RPC domain error %s",
    async (error) => {
      ioMocks.rpc.mockResolvedValue({ data: { ok: false, error }, error: null });

      await expect(
        createInviteWithEntitlement("token", params),
      ).resolves.toEqual({ ok: false, error });
      expect(ioMocks.authedClient).not.toHaveBeenCalled();
    },
  );

  it.each(["PGRST202", "42883"])(
    "maps missing authority code %s to invite_authority_unavailable without a legacy write",
    async (code) => {
      ioMocks.rpc.mockResolvedValue({
        data: null,
        error: { code, message: "function missing" },
      });

      await expect(
        createInviteWithEntitlement("token", params),
      ).resolves.toEqual({ ok: false, error: "invite_authority_unavailable" });
      expect(ioMocks.authedClient).not.toHaveBeenCalled();
    },
  );

  it("maps unknown transport errors without leaking the raw database message", async () => {
    ioMocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "private database detail" },
    });

    await expect(
      createInviteWithEntitlement("token", params),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
  });

  it.each([
    null,
    [],
    { ok: false, error: "private database detail" },
    { ok: true, invite_id: "not-a-uuid", source: "monthly" },
    { ok: true, invite_id: INVITE_ID, source: "invented" },
  ])("fails closed on malformed or unknown RPC payload %#", async (data) => {
    ioMocks.rpc.mockResolvedValue({ data, error: null });

    await expect(
      createInviteWithEntitlement("token", params),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
    expect(ioMocks.authedClient).not.toHaveBeenCalled();
  });

  it("maps thrown service-client failures to temporarily_unavailable", async () => {
    ioMocks.adminClient.mockImplementation(() => {
      throw new Error("secret environment detail");
    });

    await expect(
      createInviteWithEntitlement("token", params),
    ).resolves.toEqual({ ok: false, error: "temporarily_unavailable" });
  });
});
