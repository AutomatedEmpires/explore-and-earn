/**
 * Adversarial tests for the employer claim-to-verify server actions.
 *
 * What these pin:
 *  - AUTH LAW: userId always comes from auth().userId — never from any
 *    client-supplied field — and every action short-circuits to an
 *    unauthenticated/forbidden error BEFORE touching the db layer.
 *  - INPUT SANITIZATION: authority evidence and confirmed-fields validators
 *    reject malformed input (bad email, out-of-range lengths, wrong types)
 *    WITHOUT ever reaching the db layer, and the sanitized (trimmed) values
 *    — not the raw input — are what get passed down.
 *  - COMPETING CLAIMS / ADMIN GATE: db-layer errors (claim_already_active)
 *    surface unchanged, and the admin-only review action is denied for
 *    non-admins before the atomic transition function is ever called.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const isCurrentUserAdminMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

const dbMocks = vi.hoisted(() => ({
  adminClaimContext: vi.fn(),
  beginClaimConfirmation: vi.fn(),
  confirmAndConvertClaim: vi.fn(),
  getClaimableListing: vi.fn(),
  getClaimsAwaitingReview: vi.fn(),
  getMyListingClaims: vi.fn(),
  initiateListingClaim: vi.fn(),
  recordEvent: vi.fn(),
  transitionListingClaim: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/admin", () => ({ isCurrentUserAdmin: isCurrentUserAdminMock }));
vi.mock("../../lib/rateLimit", () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));

import {
  confirmClaimListingAction,
  getMyClaimsAction,
  initiateClaimAction,
  reviewClaimAction,
  revokeClaimAction,
} from "../../app/actions/listingClaims";

const VALID_EVIDENCE = {
  workEmail: "valid@example.com",
  roleTitle: "Manager",
  statement: "This is a legitimate statement of authority over ten chars.",
};

function authAs(userId: string | null, token: string | null = "session-token") {
  authMock.mockResolvedValueOnce({
    userId,
    getToken: vi.fn().mockResolvedValue(token),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user_default",
    getToken: vi.fn().mockResolvedValue("tok-default"),
  });
  checkRateLimitMock.mockReturnValue({ allowed: true });
  isCurrentUserAdminMock.mockResolvedValue(false);
});

describe("initiateClaimAction — unauthenticated", () => {
  it("returns unauthenticated and never touches the db layer", async () => {
    authAs(null);
    const result = await initiateClaimAction("listing-1", VALID_EVIDENCE);
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(dbMocks.initiateListingClaim).not.toHaveBeenCalled();
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
  });
});

describe("initiateClaimAction — invalid authority evidence", () => {
  it.each([
    [
      "bad email",
      { ...VALID_EVIDENCE, workEmail: "not-an-email" },
    ],
    [
      "empty roleTitle",
      { ...VALID_EVIDENCE, roleTitle: "" },
    ],
    [
      "statement shorter than 10 chars",
      { ...VALID_EVIDENCE, statement: "short" },
    ],
    [
      "statement longer than 2000 chars",
      { ...VALID_EVIDENCE, statement: "a".repeat(2001) },
    ],
  ])("%s → invalid_authority_evidence, db never called", async (_label, authority) => {
    authAs("user_A");
    const result = await initiateClaimAction("listing-1", authority);
    expect(result).toEqual({ ok: false, error: "invalid_authority_evidence" });
    expect(dbMocks.initiateListingClaim).not.toHaveBeenCalled();
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
  });
});

describe("initiateClaimAction — happy path", () => {
  it("passes sanitized evidence + auth()-derived userId (never a client id) and records the event", async () => {
    authAs("user_auth_123");
    dbMocks.initiateListingClaim.mockResolvedValueOnce({ ok: true, claimId: "c1" });

    const rawEvidence = {
      workEmail: "  test@example.com  ",
      roleTitle: "  Manager  ",
      statement: `  ${"x".repeat(20)}  `,
    };

    const result = await initiateClaimAction("listing-42", rawEvidence);

    expect(result).toEqual({ ok: true, claimId: "c1" });
    // sanitized (trimmed) evidence + the auth()-derived id, in that order —
    // never anything read off the raw client input.
    expect(dbMocks.initiateListingClaim).toHaveBeenCalledWith("user_auth_123", "listing-42", {
      workEmail: "test@example.com",
      roleTitle: "Manager",
      statement: "x".repeat(20),
    });
    expect(dbMocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "listing_claim_initiated",
        actorScope: "host",
        subjectType: "listing_claim",
        subjectId: "c1",
        listingId: "listing-42",
      }),
    );
  });
});

describe("initiateClaimAction — competing claim guard", () => {
  it("surfaces claim_already_active from the db layer unchanged, no event recorded", async () => {
    authAs("user_auth_123");
    dbMocks.initiateListingClaim.mockResolvedValueOnce({
      ok: false,
      error: "claim_already_active",
    });

    const result = await initiateClaimAction("listing-42", VALID_EVIDENCE);

    expect(result).toEqual({ ok: false, error: "claim_already_active" });
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
  });
});

describe("confirmClaimListingAction — invalid confirmed fields", () => {
  it.each([
    ["negative compensationMinCents", { compensationMinCents: -100 }],
    ["non-integer cents", { compensationMinCents: 18.5 }],
    ["title over 200 chars", { title: "a".repeat(201) }],
    ["housingIncluded as a string", { housingIncluded: "yes" }],
  ])("%s → invalid_confirmed_fields, conversion never called", async (_label, fields) => {
    authAs("user_A");
    const result = await confirmClaimListingAction("claim-1", "host-1", fields as never);
    expect(result).toEqual({ ok: false, error: "invalid_confirmed_fields" });
    expect(dbMocks.confirmAndConvertClaim).not.toHaveBeenCalled();
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("confirmClaimListingAction — happy path", () => {
  it("calls confirmAndConvertClaim with auth()-derived userId + sanitized fields, records event, revalidates", async () => {
    authAs("user_auth_456");
    dbMocks.confirmAndConvertClaim.mockResolvedValueOnce({ ok: true, listingId: "listing-99" });

    const rawFields = {
      title: "  Sunny Farm Stay  ",
      compensationMinCents: 500,
      housingIncluded: true,
    };

    const result = await confirmClaimListingAction("claim-2", "host-2", rawFields as never);

    expect(result).toEqual({ ok: true, listingId: "listing-99" });
    expect(dbMocks.confirmAndConvertClaim).toHaveBeenCalledWith("user_auth_456", "claim-2", "host-2", {
      title: "Sunny Farm Stay",
      compensationMinCents: 500,
      housingIncluded: true,
    });
    expect(dbMocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "listing_claim_converted",
        actorScope: "host",
        subjectType: "listing_claim",
        subjectId: "claim-2",
        listingId: "listing-99",
        hostProfileId: "host-2",
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/listing/listing-99");
    expect(revalidatePathMock).toHaveBeenCalledWith("/host/listings");
  });
});

describe("reviewClaimAction — admin gate", () => {
  it("denies a non-admin with forbidden and never calls transitionListingClaim", async () => {
    authAs("user_not_admin");
    isCurrentUserAdminMock.mockResolvedValueOnce(false);

    const result = await reviewClaimAction("claim-3", "approved");

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(dbMocks.transitionListingClaim).not.toHaveBeenCalled();
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
  });

  it("calls transitionListingClaim(claimId, decision, adminUserId, notes) for an admin", async () => {
    authAs("user_admin_1");
    isCurrentUserAdminMock.mockResolvedValueOnce(true);
    dbMocks.transitionListingClaim.mockResolvedValueOnce({ ok: true });
    dbMocks.adminClaimContext.mockResolvedValueOnce({
      claimantClerkUserId: "user_claimant",
      listingId: "listing-77",
      hostProfileId: null,
      status: "rejected",
    });

    const result = await reviewClaimAction("claim-4", "rejected", "not a legitimate employer");

    expect(result).toEqual({ ok: true });
    expect(dbMocks.transitionListingClaim).toHaveBeenCalledWith(
      "claim-4",
      "rejected",
      "user_admin_1",
      "not a legitimate employer",
    );
    // Event is anchored to the claimed LISTING (taxonomy/rollup context) but
    // never carries the claimant's clerk id (events privacy law).
    expect(dbMocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "listing_claim_rejected",
        actorScope: "admin",
        subjectType: "listing_claim",
        subjectId: "claim-4",
        listingId: "listing-77",
      }),
    );
    expect(JSON.stringify(dbMocks.recordEvent.mock.calls[0][0])).not.toContain("user_claimant");
  });

  it("still records the decision event when the claim context read fails", async () => {
    authAs("user_admin_1");
    isCurrentUserAdminMock.mockResolvedValueOnce(true);
    dbMocks.transitionListingClaim.mockResolvedValueOnce({ ok: true });
    dbMocks.adminClaimContext.mockRejectedValueOnce(new Error("boom"));

    const result = await reviewClaimAction("claim-5", "approved");

    expect(result).toEqual({ ok: true });
    expect(dbMocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "listing_claim_approved",
        subjectId: "claim-5",
      }),
    );
  });
});

describe("revokeClaimAction — admin gate + transition", () => {
  it("denies a non-admin with forbidden and never calls transitionListingClaim", async () => {
    authAs("user_not_admin");
    isCurrentUserAdminMock.mockResolvedValueOnce(false);

    const result = await revokeClaimAction("claim-6");

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(dbMocks.transitionListingClaim).not.toHaveBeenCalled();
  });

  it("runs the converted→revoked transition for an admin (SQL restores the snapshot)", async () => {
    authAs("user_admin_1");
    isCurrentUserAdminMock.mockResolvedValueOnce(true);
    dbMocks.transitionListingClaim.mockResolvedValueOnce({ ok: true });
    dbMocks.adminClaimContext.mockResolvedValueOnce({
      claimantClerkUserId: "user_claimant",
      listingId: "listing-88",
      hostProfileId: "host-9",
      status: "revoked",
    });

    const result = await revokeClaimAction("claim-6", "fraudulent conversion");

    expect(result).toEqual({ ok: true });
    expect(dbMocks.transitionListingClaim).toHaveBeenCalledWith(
      "claim-6",
      "revoked",
      "user_admin_1",
      "fraudulent conversion",
    );
    // No listing_claim_revoked event type is seeded — nothing is recorded
    // rather than a mislabeled event.
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/listing/listing-88");
  });

  it("surfaces an illegal-transition error from the SQL wrapper unchanged", async () => {
    authAs("user_admin_1");
    isCurrentUserAdminMock.mockResolvedValueOnce(true);
    dbMocks.transitionListingClaim.mockResolvedValueOnce({
      ok: false,
      error: "illegal_transition",
    });

    const result = await revokeClaimAction("claim-7");

    expect(result).toEqual({ ok: false, error: "illegal_transition" });
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe("getMyClaimsAction — unauthenticated", () => {
  it("returns [] without calling the db layer", async () => {
    authAs(null);
    const result = await getMyClaimsAction();
    expect(result).toEqual([]);
    expect(dbMocks.getMyListingClaims).not.toHaveBeenCalled();
  });
});
