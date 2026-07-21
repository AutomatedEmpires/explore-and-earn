/**
 * Unit tests for the claim-to-verify data layer
 * (packages/db/src/queries/listingClaims.ts) + the contracts state machine.
 *
 * The SQL functions (064) own atomicity/self-approval/row-locking; these tests
 * pin the TypeScript layer's preconditions and the legal-transition table:
 *  - only live SOURCED listings are claimable;
 *  - competing claims surface as a typed 'claim_already_active';
 *  - confirmation requires being the claimant, an approved claim, and an
 *    owned host profile — all server-resolved;
 *  - transitions outside LISTING_CLAIM_TRANSITIONS are illegal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── adminClient mock: programmable table handlers + rpc ─────────────────────
type TableHandler = {
  maybeSingleResult?: { data: unknown; error: unknown };
  insertResult?: { data: unknown; error: unknown };
  updateResult?: { error: unknown };
};
const tables = new Map<string, TableHandler>();
const rpcMock = vi.fn();

function chain(table: string) {
  const handler = tables.get(table) ?? {};
  const self: Record<string, unknown> = {};
  const passthrough = () => self;
  for (const method of ["select", "eq", "in", "order", "limit", "or", "not", "lt", "gte"]) {
    self[method] = vi.fn(passthrough);
  }
  self.maybeSingle = vi.fn(async () => handler.maybeSingleResult ?? { data: null, error: null });
  self.single = vi.fn(async () => handler.insertResult ?? { data: null, error: null });
  self.insert = vi.fn(() => self);
  self.update = vi.fn(() => ({
    ...self,
    eq: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(async () => handler.updateResult ?? { error: null }),
      })),
    })),
  }));
  return self;
}

vi.mock("../src/adminClient", () => ({
  adminClient: () => ({
    from: (table: string) => chain(table),
    rpc: (...args: unknown[]) => rpcMock(...args),
  }),
}));
vi.mock("../src/client", () => ({
  authedClient: () => ({ from: (table: string) => chain(table) }),
}));

import {
  adminClaimContext,
  beginClaimConfirmation,
  confirmAndConvertClaim,
  getClaimConfirmationFields,
  initiateListingClaim,
  transitionListingClaim,
} from "../src/queries/listingClaims";
import {
  ACTIVE_CLAIM_STATUSES,
  LISTING_CLAIM_STATUS,
  LISTING_CLAIM_TRANSITIONS,
  canTransitionClaim,
} from "@explore-and-earn/contracts";

const EVIDENCE = {
  workEmail: "ops@sunriseorchards.com",
  roleTitle: "Operations Manager",
  statement: "I manage seasonal hiring for Sunrise Orchards.",
};

beforeEach(() => {
  tables.clear();
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
});

/* ------------------------------------------------------- state machine law */

describe("LISTING_CLAIM_TRANSITIONS — the legal-transition table", () => {
  it("rejected and revoked are terminal", () => {
    expect(LISTING_CLAIM_TRANSITIONS.rejected).toEqual([]);
    expect(LISTING_CLAIM_TRANSITIONS.revoked).toEqual([]);
  });

  it("conversion is reachable ONLY from confirming", () => {
    for (const from of LISTING_CLAIM_STATUS) {
      const canConvert = canTransitionClaim(from, "converted");
      expect(canConvert).toBe(from === "confirming");
    }
  });

  it("approval is never reachable directly from initiated (review comes first)", () => {
    expect(canTransitionClaim("initiated", "approved")).toBe(false);
    expect(canTransitionClaim("requires_review", "approved")).toBe(true);
  });

  it("every ACTIVE status is genuinely pre-terminal", () => {
    for (const status of ACTIVE_CLAIM_STATUSES) {
      expect(LISTING_CLAIM_TRANSITIONS[status].length).toBeGreaterThan(0);
    }
  });

  it("unknown transitions are illegal by default", () => {
    expect(canTransitionClaim("converted", "confirming")).toBe(false);
    expect(canTransitionClaim("approved", "converted")).toBe(false);
  });
});

/* ----------------------------------------------------------- initiate claim */

describe("initiateListingClaim — listing preconditions", () => {
  it("refuses a verified listing (nothing to claim)", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: { id: "l1", provenance: "verified", status: "live", claim_summary: "not_applicable" },
        error: null,
      },
    });
    const result = await initiateListingClaim("user_A", "l1", EVIDENCE);
    expect(result).toEqual({ ok: false, error: "listing_not_sourced" });
  });

  it("refuses a non-live sourced listing", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: { id: "l1", provenance: "sourced", status: "closed", claim_summary: "unclaimed" },
        error: null,
      },
    });
    const result = await initiateListingClaim("user_A", "l1", EVIDENCE);
    expect(result).toEqual({ ok: false, error: "listing_not_live" });
  });

  it("refuses an already-converted listing", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: { id: "l1", provenance: "sourced", status: "live", claim_summary: "converted" },
        error: null,
      },
    });
    const result = await initiateListingClaim("user_A", "l1", EVIDENCE);
    expect(result).toEqual({ ok: false, error: "already_converted" });
  });

  it("maps the unique-violation from the one-active-claim index to claim_already_active", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: { id: "l1", provenance: "sourced", status: "live", claim_summary: "unclaimed" },
        error: null,
      },
    });
    tables.set("listing_claims", {
      insertResult: { data: null, error: { code: "23505", message: "duplicate" } },
    });
    const result = await initiateListingClaim("user_B", "l1", EVIDENCE);
    expect(result).toEqual({ ok: false, error: "claim_already_active" });
  });

  it("happy path inserts the claim then routes it into review via the SQL machine", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: { id: "l1", provenance: "sourced", status: "live", claim_summary: "unclaimed" },
        error: null,
      },
    });
    tables.set("listing_claims", {
      insertResult: { data: { id: "c1" }, error: null },
    });
    const result = await initiateListingClaim("user_A", "l1", EVIDENCE);
    expect(result).toEqual({ ok: true, claimId: "c1" });
    expect(rpcMock).toHaveBeenCalledWith("transition_listing_claim", {
      p_claim_id: "c1",
      p_to_status: "requires_review",
      p_actor_user_id: "user_A",
      p_review_notes: null,
    });
  });
});

/* ------------------------------------------------------------- confirmation */

describe("beginClaimConfirmation — claimant + approval + host ownership", () => {
  it("refuses a non-claimant (cross-tenant guard)", async () => {
    tables.set("listing_claims", {
      maybeSingleResult: {
        data: { id: "c1", status: "approved", claimant_clerk_user_id: "user_OTHER" },
        error: null,
      },
    });
    const result = await beginClaimConfirmation("user_A", "c1");
    expect(result).toEqual({ ok: false, error: "not_claimant" });
  });

  it("refuses when the claim is not approved yet", async () => {
    tables.set("listing_claims", {
      maybeSingleResult: {
        data: { id: "c1", status: "requires_review", claimant_clerk_user_id: "user_A" },
        error: null,
      },
    });
    const result = await beginClaimConfirmation("user_A", "c1");
    expect(result).toEqual({ ok: false, error: "claim_not_approved" });
  });

  it("requires the claimant's OWN host profile (server-resolved)", async () => {
    tables.set("listing_claims", {
      maybeSingleResult: {
        data: { id: "c1", status: "approved", claimant_clerk_user_id: "user_A" },
        error: null,
      },
    });
    tables.set("host_profiles", { maybeSingleResult: { data: null, error: null } });
    const result = await beginClaimConfirmation("user_A", "c1");
    expect(result).toEqual({ ok: false, error: "host_profile_required" });
  });
});

/* --------------------------------------------------------------- rpc shims */

describe("SQL-function wrappers surface typed refusals", () => {
  it("transitionListingClaim maps a machine refusal", async () => {
    rpcMock.mockResolvedValue({
      data: { ok: false, error: "invalid_transition", from: "rejected", to: "approved" },
      error: null,
    });
    const result = await transitionListingClaim("c1", "approved", "admin_1");
    expect(result).toEqual({ ok: false, error: "invalid_transition" });
  });

  it("confirmAndConvertClaim passes the whitelisted payload and maps success", async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, listing_id: "l1" }, error: null });
    const result = await confirmAndConvertClaim("user_A", "c1", "h1", {
      housingIncluded: true,
      compensationMinCents: 180000,
    });
    expect(result).toEqual({ ok: true, listingId: "l1" });
    expect(rpcMock).toHaveBeenCalledWith("convert_claimed_listing", {
      p_claim_id: "c1",
      p_actor_user_id: "user_A",
      p_host_profile_id: "h1",
      p_confirmed: { housingIncluded: true, compensationMinCents: 180000 },
    });
  });

  it("confirmAndConvertClaim surfaces the not-claimant refusal from SQL", async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, error: "not_claimant" }, error: null });
    const result = await confirmAndConvertClaim("user_EVIL", "c1", "h1", {});
    expect(result).toEqual({ ok: false, error: "not_claimant" });
  });
});

/* ------------------------------------------------------------ context reads */

describe("adminClaimContext — server-side claim context", () => {
  it("maps the claim row (claimant clerk id stays server-side by contract)", async () => {
    tables.set("listing_claims", {
      maybeSingleResult: {
        data: {
          claimant_clerk_user_id: "user_A",
          listing_id: "l1",
          host_profile_id: "h1",
          status: "approved",
        },
        error: null,
      },
    });
    const ctx = await adminClaimContext("c1");
    expect(ctx).toEqual({
      claimantClerkUserId: "user_A",
      listingId: "l1",
      hostProfileId: "h1",
      status: "approved",
    });
  });

  it("returns null for an unknown claim (caller drops, never guesses)", async () => {
    tables.set("listing_claims", { maybeSingleResult: { data: null, error: null } });
    expect(await adminClaimContext("c-unknown")).toBeNull();
  });
});

describe("getClaimConfirmationFields — the field-review read", () => {
  it("maps every confirmable field and carries triad evidence for honest rendering", async () => {
    tables.set("listings", {
      maybeSingleResult: {
        data: {
          title: "Salmon Season Deckhand",
          category: "maritime",
          description: "Work the nets.",
          location_display: "Kodiak, AK",
          housing_included: false,
          housing_description: null,
          meals_included: true,
          meals_description: "Three meals aboard",
          compensation_min_cents: 180000,
          compensation_max_cents: null,
          compensation_unit: "month",
          compensation_summary: "$1,800/mo",
          begins_at: "2026-08-01T00:00:00.000Z",
          ends_at: null,
          housing_evidence: "not_stated",
          meals_evidence: "stated",
          pay_evidence: "stated",
        },
        error: null,
      },
    });
    const fields = await getClaimConfirmationFields("l1");
    expect(fields).toEqual({
      title: "Salmon Season Deckhand",
      category: "maritime",
      description: "Work the nets.",
      locationDisplay: "Kodiak, AK",
      housingIncluded: false,
      housingDescription: null,
      mealsIncluded: true,
      mealsDescription: "Three meals aboard",
      compensationMinCents: 180000,
      compensationMaxCents: null,
      compensationUnit: "month",
      compensationSummary: "$1,800/mo",
      beginsAt: "2026-08-01T00:00:00.000Z",
      endsAt: null,
      housingEvidence: "not_stated",
      mealsEvidence: "stated",
      payEvidence: "stated",
    });
  });

  it("returns null for an unknown listing", async () => {
    tables.set("listings", { maybeSingleResult: { data: null, error: null } });
    expect(await getClaimConfirmationFields("l-unknown")).toBeNull();
  });
});
