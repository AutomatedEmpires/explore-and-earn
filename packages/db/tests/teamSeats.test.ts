/**
 * Host team seats (founder decision 2026-07-26: "team seats and basic/ full
 * analytics are included per tier. not additional products.").
 *
 * The defects these pin:
 *
 *  1. A seat limit that the CLIENT could choose. inviteTeamMember must resolve
 *     the allowance from the host's stored tier and pass THAT to the SQL
 *     function — the same law invite credits follow (062). A caller-supplied
 *     limit would be a self-service upgrade.
 *  2. A pending invitation that costs nothing. If only 'active' rows counted, a
 *     one-seat host could issue unlimited invitations and hand access to
 *     whoever accepted first.
 *  3. An unreadable tier resolving to an entitlement. Unknown / null / "none"
 *     must be zero seats, never a default.
 *  4. An expired invitation holding its seat forever. lib/teamSeats.ts said
 *     expiry gave a seat back and nothing made that true: the row stays
 *     'invited' until somebody tries to accept it, so the seat was gone, the
 *     invite form was hidden, and the sweep that would have freed it could never
 *     run.
 *
 * WHAT THIS FILE DOES NOT ASSERT: that any tier grants a seat. Every count is
 * zero because accepting an invitation grants no access — see
 * teamSeatCapability.test.ts, which is what stops a number rising without one.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
vi.mock("../src/client", () => ({
  authedClient: () => ({ rpc: mockRpc, from: mockFrom }),
  anonClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));

import { TEAM_SEATS_BY_TIER, PLAN_ENTITLEMENTS } from "@explore-and-earn/contracts";

import {
  INVITABLE_TEAM_ROLES,
  countConsumedSeats,
  isInvitableTeamRole,
  isPlausibleEmail,
  normalizeTeamInviteEmail,
  refuseTeamInvite,
  seatLimitForTier,
  summarizeTeamSeats,
} from "../src/lib/teamSeats.js";
import { inviteTeamMember } from "../src/queries/hostTeam.js";

beforeEach(() => {
  mockRpc.mockReset();
  mockFrom.mockReset();
});

// ── Contract consistency ───────────────────────────────────────────────────

describe("team seat entitlement consistency", () => {
  it.each(["starter", "professional", "enterprise"] as const)(
    "the sold entitlement and the enforced limit agree for %s",
    (tier) => {
      expect(PLAN_ENTITLEMENTS[tier].teamSeats).toBe(TEAM_SEATS_BY_TIER[tier]);
      expect(seatLimitForTier(tier)).toBe(PLAN_ENTITLEMENTS[tier].teamSeats);
    },
  );

  it("gives an unsubscribed host zero seats", () => {
    expect(seatLimitForTier("none")).toBe(0);
  });

  it.each([null, undefined, "", "gold", "ENTERPRISE"])(
    "resolves an unreadable tier (%s) to zero, never to an entitlement",
    (tier) => {
      expect(seatLimitForTier(tier as string | null | undefined)).toBe(0);
    },
  );

  it("every seat count is a non-negative integer", () => {
    for (const [tier, seats] of Object.entries(TEAM_SEATS_BY_TIER)) {
      expect(Number.isInteger(seats), `${tier} must be an integer`).toBe(true);
      expect(seats, `${tier} must be >= 0`).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives an Enterprise host zero seats, because acceptance grants nothing", () => {
    // The count and the capability are one claim. Raising this without landing
    // the access half is the empty promise teamSeatCapability.test.ts refuses.
    expect(seatLimitForTier("enterprise")).toBe(0);
  });

  it("never offers 'owner' as an invitable role — the owner holds no membership row", () => {
    expect(INVITABLE_TEAM_ROLES).not.toContain("owner");
    expect(isInvitableTeamRole("owner")).toBe(false);
  });
});

// ── Seat accounting ────────────────────────────────────────────────────────

describe("seat accounting", () => {
  it("counts a PENDING invitation against the limit", () => {
    expect(countConsumedSeats([{ status: "invited" }])).toBe(1);
  });

  it("counts an active member against the limit", () => {
    expect(countConsumedSeats([{ status: "active" }])).toBe(1);
  });

  it("frees the seat once a member is revoked or the invitation expires", () => {
    expect(
      countConsumedSeats([{ status: "revoked" }, { status: "expired" }]),
    ).toBe(0);
  });

  it("a pending invitation PAST ITS EXPIRY consumes nothing", () => {
    // The defect: the row is still 'invited' — nothing flips it until somebody
    // tries to accept, and nobody can, because it has expired. Counting it held
    // the seat forever and hid the invite form whose sweep would free it.
    const now = new Date("2026-07-26T00:00:00Z");
    expect(
      countConsumedSeats(
        [{ status: "invited", inviteExpiresAt: "2026-07-25T23:59:59Z" }],
        now,
      ),
    ).toBe(0);
  });

  it("a pending invitation still inside its window DOES consume a seat", () => {
    const now = new Date("2026-07-26T00:00:00Z");
    expect(
      countConsumedSeats(
        [{ status: "invited", inviteExpiresAt: "2026-07-27T00:00:00Z" }],
        now,
      ),
    ).toBe(1);
  });

  it.each([undefined, null, "not-a-timestamp"])(
    "treats an unreadable expiry (%s) as still live — never as a free seat",
    (expiry) => {
      expect(
        countConsumedSeats([
          { status: "invited", inviteExpiresAt: expiry as string | null | undefined },
        ]),
      ).toBe(1);
    },
  );

  it("an active member's expiry field is irrelevant", () => {
    const now = new Date("2026-07-26T00:00:00Z");
    expect(
      countConsumedSeats(
        [{ status: "active", inviteExpiresAt: "2020-01-01T00:00:00Z" }],
        now,
      ),
    ).toBe(1);
  });

  it("reports usage against the limit the tier actually grants", () => {
    const usage = summarizeTeamSeats("enterprise", [{ status: "invited" }]);
    expect(usage.limit).toBe(TEAM_SEATS_BY_TIER.enterprise);
    expect(usage.used).toBe(1);
    expect(usage.remaining).toBe(0);
  });

  it("never reports negative remaining seats after a downgrade", () => {
    const usage = summarizeTeamSeats("starter", [
      { status: "active" },
      { status: "active" },
    ]);
    expect(usage.remaining).toBe(0);
  });
});

// ── The refusal ────────────────────────────────────────────────────────────

describe("refuseTeamInvite", () => {
  it("REFUSES a Starter host, whose plan includes no seat", () => {
    expect(
      refuseTeamInvite({
        tier: "starter",
        existing: [],
        role: "viewer",
        email: "colleague@example.com",
      }),
    ).toBe("seat_limit_reached");
  });

  it("REFUSES a Professional host, whose plan includes no seat", () => {
    expect(
      refuseTeamInvite({
        tier: "professional",
        existing: [],
        role: "viewer",
        email: "colleague@example.com",
      }),
    ).toBe("seat_limit_reached");
  });

  it("REFUSES an Enterprise host, because no plan includes a seat today", () => {
    expect(
      refuseTeamInvite({
        tier: "enterprise",
        existing: [],
        role: "viewer",
        email: "colleague@example.com",
      }),
    ).toBe("seat_limit_reached");
  });

  it("REFUSES an attempt to mint a second owner", () => {
    expect(
      refuseTeamInvite({
        tier: "enterprise",
        existing: [],
        role: "owner",
        email: "colleague@example.com",
      }),
    ).toBe("invalid_role");
  });

  it("REFUSES a malformed address", () => {
    expect(
      refuseTeamInvite({
        tier: "enterprise",
        existing: [],
        role: "viewer",
        email: "not-an-email",
      }),
    ).toBe("invalid_email");
  });

  it("permits an invitation exactly when the tier has a seat left", () => {
    // Expressed against a hypothetical limit rather than a tier name: no real
    // tier grants a seat today, and this is the arithmetic that would govern one
    // if it did. summarizeTeamSeats is the same function refuseTeamInvite calls.
    expect(summarizeTeamSeats("enterprise", []).remaining).toBe(
      TEAM_SEATS_BY_TIER.enterprise,
    );
    expect(
      refuseTeamInvite({
        tier: "enterprise",
        existing: [],
        role: "hiring_manager",
        email: "colleague@example.com",
      }),
    ).toBe(TEAM_SEATS_BY_TIER.enterprise > 0 ? null : "seat_limit_reached");
  });

  it("checks the ROLE and the ADDRESS before the seat, so the reason shown is the fixable one", () => {
    expect(
      refuseTeamInvite({
        tier: "starter",
        existing: [],
        role: "owner",
        email: "colleague@example.com",
      }),
    ).toBe("invalid_role");
  });
});

describe("email handling", () => {
  it("normalizes to the form the partial unique index is built on", () => {
    expect(normalizeTeamInviteEmail("  Colleague@Example.COM ")).toBe(
      "colleague@example.com",
    );
  });

  it.each(["", "   ", "nope", "a@b", "a b@example.com", `${"x".repeat(400)}@e.com`])(
    "rejects %s",
    (value) => {
      expect(isPlausibleEmail(value)).toBe(false);
    },
  );
});

// ── The server-side enforcement point ──────────────────────────────────────

describe("inviteTeamMember (server-side enforcement)", () => {
  it("passes the limit resolved from the host's REAL tier — never one supplied by a caller", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, membership_id: "m1", invite_token: "tok", expires_at: "2026-08-09T00:00:00Z" },
      error: null,
    });

    await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "enterprise",
      email: "Colleague@Example.com",
      role: "viewer",
    });

    expect(mockRpc).toHaveBeenCalledWith("invite_host_team_member", {
      p_host_profile_id: "host-1",
      p_email: "colleague@example.com",
      p_role_preset: "viewer",
      p_seat_limit: TEAM_SEATS_BY_TIER.enterprise,
      p_invited_by_user_id: null,
    });
  });

  it("sends a ZERO limit for a Starter host, so the database refuses even if this layer is bypassed", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "seat_limit_reached" },
      error: null,
    });

    const result = await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "starter",
      email: "colleague@example.com",
      role: "viewer",
    });

    expect(mockRpc.mock.calls[0][1].p_seat_limit).toBe(0);
    expect(result).toEqual({ ok: false, error: "seat_limit_reached" });
  });

  it("sends a ZERO limit for an unreadable tier", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "seat_limit_reached" },
      error: null,
    });

    await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "platinum",
      email: "colleague@example.com",
      role: "viewer",
    });

    expect(mockRpc.mock.calls[0][1].p_seat_limit).toBe(0);
  });

  it("surfaces the database's seat refusal instead of returning a token", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "seat_limit_reached" },
      error: null,
    });

    const result = await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "enterprise",
      email: "colleague@example.com",
      role: "viewer",
    });

    expect(result.ok).toBe(false);
    expect(result).not.toHaveProperty("inviteToken");
  });

  it("degrades to 'unavailable' — never a fake success — before migration 085 is applied", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    const result = await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "enterprise",
      email: "colleague@example.com",
      role: "viewer",
    });

    expect(result).toEqual({ ok: false, error: "unavailable" });
  });

  it("refuses to report success when the function returns a token-less ok", async () => {
    mockRpc.mockResolvedValueOnce({ data: { ok: true, membership_id: "m1" }, error: null });

    const result = await inviteTeamMember({
      hostProfileId: "host-1",
      subscriptionTier: "enterprise",
      email: "colleague@example.com",
      role: "viewer",
    });

    expect(result).toEqual({ ok: false, error: "failed" });
  });
});
