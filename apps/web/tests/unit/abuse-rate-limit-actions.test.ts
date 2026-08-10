/**
 * Adversarial tests for the abuse controls on the previously-unguarded
 * authenticated write actions (saved searches, push subscriptions, host
 * reviews, refund requests, Stripe checkout/portal creation, listing
 * create/duplicate, seeker search, application status) plus the new
 * action-boundary input-length caps.
 *
 * What these pin:
 *  - RATE LIMIT LAW: every guarded action checks checkRateLimit with a
 *    per-user key AFTER auth and BEFORE any db/Stripe work — an over-limit
 *    caller gets the action's existing error shape and the downstream layer is
 *    never touched; a within-limit caller passes through unchanged.
 *  - INPUT CAPS: oversized free-text payloads (saved-search label/filters,
 *    review body, invite message, apply cover message, listing text fields)
 *    are rejected at the action boundary without reaching the db layer.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const afterMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const checkRateLimitMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());

const dbMocks = vi.hoisted(() => ({
  // savedSearch
  createSavedSearch: vi.fn(),
  deleteSavedSearch: vi.fn(),
  // pushSubscriptions
  deletePushSubscription: vi.fn(),
  getEnginePrefs: vi.fn(),
  upsertPushSubscription: vi.fn(),
  // hostReview
  createHostReview: vi.fn(),
  // refunds
  createRefundRequest: vi.fn(),
  getHostProfile: vi.fn(),
  getHostRefundablePurchases: vi.fn(),
  getRefundRequestById: vi.fn(),
  markRefundResolved: vi.fn(),
  // boost
  getHostTierAndProfile: vi.fn(),
  getOwnedListingForBoost: vi.fn(),
  // listings
  createListing: vi.fn(),
  duplicateListing: vi.fn(),
  updateListing: vi.fn(),
  updateListingStatus: vi.fn(),
  // invites
  getSeekerInvites: vi.fn(),
  respondToInvite: vi.fn(),
  createInviteWithEntitlement: vi.fn(),
  getHostListings: vi.fn(),
  getInviteEntitlement: vi.fn(),
  getMatchedSeekersForListing: vi.fn(),
  getHostClerkIdByProfileId: vi.fn(),
  isEmailSuppressed: vi.fn(),
  recordEvent: vi.fn(),
  searchSeekersForInvite: vi.fn(),
  withdrawInvite: vi.fn(),
  // applicationStatus / applications
  updateApplicationStatus: vi.fn(),
  applyToListing: vi.fn(),
  getSeekerApplicationIds: vi.fn(),
  withdrawApplication: vi.fn(),
}));

const stripeMocks = vi.hoisted(() => ({
  createBoostCheckoutSession: vi.fn(),
  hasStripeServerConfig: vi.fn(),
  createBillingPortalSession: vi.fn(),
  createCheckoutSession: vi.fn(),
  isBillingInterval: vi.fn(),
  isHostSubscriptionTier: vi.fn(),
  issueRefund: vi.fn(),
  // A subscription refund request now resolves the real charge in Stripe before
  // it can be filed, so the pass-through case has to have one to find.
  findLatestHostSubscriptionCharge: vi.fn(),
  getRefundableChargeCents: vi.fn(),
  cancelHostSubscription: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimit: checkRateLimitMock,
  // Actions now call the distributed (async) limiter — same mock drives both.
  checkRateLimitDistributed: (...args: unknown[]) =>
    Promise.resolve(checkRateLimitMock(...args)),
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../lib/admin", () => ({ isAdminUserId: vi.fn(() => false) }));
vi.mock("../../lib/clerkUser", () => ({ getClerkContact: vi.fn() }));
vi.mock("../../lib/email", () => ({
  absoluteUrl: vi.fn((path: string) => path),
  sendEmail: vi.fn(),
}));
vi.mock("../../lib/emails", () => ({ inviteAcceptedEmail: vi.fn(() => "") }));
vi.mock("../../lib/serverCache", () => ({ LISTINGS_CACHE_TAG: "listings" }));
vi.mock("../../services/stripe", () => stripeMocks);
vi.mock("../../services/matching", () => ({
  computeAndStoreMatchForApplication: vi.fn(),
}));
vi.mock("../../services/notifications/dispatcher", () => ({ triggerDispatch: vi.fn() }));
vi.mock("../../services/notifications/prefsWrite", () => ({
  upsertEnginePrefsSeeded: vi.fn(),
}));

import { saveSearchAction } from "../../app/actions/savedSearch";
import { savePushSubscriptionAction } from "../../app/actions/pushSubscriptions";
import { submitHostReviewAction } from "../../app/actions/hostReview";
import { requestRefundAction } from "../../app/actions/refunds";
import { createBoostCheckoutAction } from "../../app/actions/boost";
import {
  startHostBillingPortalAction,
  startHostCheckoutAction,
} from "../../app/actions/hostBilling";
import {
  createListingAction,
  duplicateListingAction,
  updateListingAction,
} from "../../app/actions/listings";
import {
  respondToInviteAction,
  searchSeekersAction,
  sendInviteAction,
  withdrawInviteAction,
} from "../../app/actions/invites";
import { getMatchedSeekersAction } from "../../app/actions/hostSourcing";
import { updateApplicationStatusAction } from "../../app/actions/applicationStatus";
import { applyToListingAction } from "../../app/actions/applications";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user_default",
    getToken: vi.fn().mockResolvedValue("tok-default"),
  });
  checkRateLimitMock.mockReturnValue({ allowed: true });
  stripeMocks.findLatestHostSubscriptionCharge.mockResolvedValue({
    ok: true,
    charge: {
      invoiceId: "in_default",
      paymentIntentId: "pi_default",
      amountPaidCents: 19900,
      createdUnix: 900,
    },
  });
  // redirect() throws NEXT_REDIRECT in production — the mock mirrors that so
  // Promise<never> actions terminate at the redirect like the real runtime.
  redirectMock.mockImplementation((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });
});

// ── saveSearchAction ─────────────────────────────────────────────────────────

describe("saveSearchAction", () => {
  const FILTERS = { q: "farm", housing: true };

  it("within limit: keys the bucket per user and passes through to the db layer", async () => {
    dbMocks.createSavedSearch.mockResolvedValueOnce({ ok: true });
    const result = await saveSearchAction(FILTERS, "Farm + housing");
    expect(result).toEqual({ ok: true });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "saved-search:user_default",
      10,
      60 * 60 * 1000,
    );
    expect(dbMocks.createSavedSearch).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      "Farm + housing",
      FILTERS,
    );
  });

  it("over limit: rate_limit_exceeded, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await saveSearchAction(FILTERS, "Farm + housing");
    expect(result).toEqual({ ok: false, error: "rate_limit_exceeded" });
    expect(dbMocks.createSavedSearch).not.toHaveBeenCalled();
  });

  it("label over 200 chars: invalid_input, db never called", async () => {
    const result = await saveSearchAction(FILTERS, "x".repeat(201));
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(dbMocks.createSavedSearch).not.toHaveBeenCalled();
  });

  it("filters serializing over 4 KB: invalid_input, db never called", async () => {
    const bloated = { q: "a".repeat(5000) } as Parameters<typeof saveSearchAction>[0];
    const result = await saveSearchAction(bloated, "label");
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(dbMocks.createSavedSearch).not.toHaveBeenCalled();
  });
});

// ── savePushSubscriptionAction ───────────────────────────────────────────────

describe("savePushSubscriptionAction", () => {
  const INPUT = {
    endpoint: "https://push.example.com/sub/1",
    keys: { p256dh: "p", auth: "a" },
  };

  it("within limit: upserts the subscription for the authed user", async () => {
    const result = await savePushSubscriptionAction(INPUT);
    expect(result).toEqual({ ok: true });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "push-subscription:user_default",
      10,
      60 * 60 * 1000,
    );
    expect(dbMocks.upsertPushSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: "user_default", endpoint: INPUT.endpoint }),
    );
  });

  it("over limit: rate_limit_exceeded, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await savePushSubscriptionAction(INPUT);
    expect(result).toEqual({ ok: false, error: "rate_limit_exceeded" });
    expect(dbMocks.upsertPushSubscription).not.toHaveBeenCalled();
  });
});

// ── submitHostReviewAction ───────────────────────────────────────────────────

describe("submitHostReviewAction", () => {
  const INPUT = {
    rating: 5,
    housingAsDescribed: true,
    mealsAsDescribed: null,
    payOnTime: true,
    body: "Great season.",
  };

  it("within limit: passes through to createHostReview", async () => {
    dbMocks.createHostReview.mockResolvedValueOnce({ ok: true });
    const result = await submitHostReviewAction("host-1", "app-1", INPUT);
    expect(result).toEqual({ ok: true });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "host-review:user_default",
      3,
      24 * 60 * 60 * 1000,
    );
    expect(dbMocks.createHostReview).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      "host-1",
      "app-1",
      INPUT,
    );
  });

  it("over limit: rate_limit_exceeded, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await submitHostReviewAction("host-1", "app-1", INPUT);
    expect(result).toEqual({ ok: false, error: "rate_limit_exceeded" });
    expect(dbMocks.createHostReview).not.toHaveBeenCalled();
  });

  it("body over 1000 chars: invalid_input, db never called", async () => {
    const result = await submitHostReviewAction("host-1", "app-1", {
      ...INPUT,
      body: "x".repeat(1001),
    });
    expect(result).toEqual({ ok: false, error: "invalid_input" });
    expect(dbMocks.createHostReview).not.toHaveBeenCalled();
  });
});

// ── requestRefundAction ──────────────────────────────────────────────────────

describe("requestRefundAction", () => {
  it("over limit: friendly error, host profile never resolved", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await requestRefundAction({ purchaseType: "subscription", amountCents: 900 });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/refund requests/i);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "refund-request:user_default",
      3,
      24 * 60 * 60 * 1000,
    );
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(dbMocks.createRefundRequest).not.toHaveBeenCalled();
  });

  it("within limit: proceeds to the host-profile lookup", async () => {
    dbMocks.getHostProfile.mockResolvedValueOnce({ id: "host-1" });
    dbMocks.createRefundRequest.mockResolvedValueOnce({ ok: true });
    const result = await requestRefundAction({ purchaseType: "subscription", amountCents: 900 });
    expect(result).toEqual({ ok: true });
    expect(dbMocks.createRefundRequest).toHaveBeenCalledWith(
      "tok-default",
      expect.objectContaining({ hostProfileId: "host-1", purchaseType: "subscription" }),
    );
  });
});

// ── createBoostCheckoutAction ────────────────────────────────────────────────

describe("createBoostCheckoutAction", () => {
  it("over limit: reason rate_limited, no db/Stripe work", async () => {
    stripeMocks.hasStripeServerConfig.mockReturnValue(true);
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await createBoostCheckoutAction("listing-1", 7);
    expect(result).toEqual({ ok: false, reason: "rate_limited" });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "boost-checkout:user_default",
      10,
      60 * 60 * 1000,
    );
    expect(dbMocks.getHostTierAndProfile).not.toHaveBeenCalled();
    expect(stripeMocks.createBoostCheckoutSession).not.toHaveBeenCalled();
  });
});

// ── hostBilling checkout + portal ────────────────────────────────────────────

describe("startHostCheckoutAction", () => {
  // /host/plans, not /host/billing: the latter is inside the (host) layout,
  // which bounces a profile-less user to onboarding — so the message never
  // reached the pre-profile payer this action serves.
  it("over limit: redirects to the plans page with error=rate_limited before any Stripe work", async () => {
    stripeMocks.isHostSubscriptionTier.mockReturnValue(true);
    stripeMocks.isBillingInterval.mockReturnValue(true);
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const formData = new FormData();
    formData.set("tier", "professional");
    formData.set("interval", "month");

    await expect(startHostCheckoutAction(formData)).rejects.toThrow("NEXT_REDIRECT");

    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "host-checkout:user_default",
      10,
      60 * 60 * 1000,
    );
    expect(redirectMock).toHaveBeenCalledWith("/host/plans?error=rate_limited");
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(stripeMocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});

describe("startHostBillingPortalAction", () => {
  it("over limit: redirects with error=rate_limited before any Stripe work", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });

    await expect(startHostBillingPortalAction()).rejects.toThrow("NEXT_REDIRECT");

    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "host-billing-portal:user_default",
      10,
      60 * 60 * 1000,
    );
    expect(redirectMock).toHaveBeenCalledWith("/host/billing?error=rate_limited");
    expect(stripeMocks.createBillingPortalSession).not.toHaveBeenCalled();
  });
});

// ── listings create / duplicate ──────────────────────────────────────────────

describe("createListingAction", () => {
  function listingFormData(overrides: Record<string, string> = {}): FormData {
    const formData = new FormData();
    formData.set("title", overrides.title ?? "Orchard Harvest Crew");
    formData.set("category", "farm");
    if (overrides.summary !== undefined) formData.set("summary", overrides.summary);
    return formData;
  }

  it("within limit: creates the listing for the authed host", async () => {
    dbMocks.createListing.mockResolvedValueOnce({ ok: true, listingId: "l-1" });
    const result = await createListingAction(listingFormData());
    expect(result).toEqual({ ok: true, listingId: "l-1" });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "listing-create:user_default",
      10,
      24 * 60 * 60 * 1000,
    );
    expect(dbMocks.createListing).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      expect.objectContaining({ title: "Orchard Harvest Crew", category: "farm" }),
    );
  });

  it("over limit: friendly error, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await createListingAction(listingFormData());
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/several listings today/i);
    expect(dbMocks.createListing).not.toHaveBeenCalled();
  });

  it("title over 200 chars: rejected at the boundary, db never called", async () => {
    const result = await createListingAction(listingFormData({ title: "x".repeat(201) }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/title is too long/i);
    expect(dbMocks.createListing).not.toHaveBeenCalled();
  });

  it("summary over 10000 chars: rejected at the boundary, db never called", async () => {
    const result = await createListingAction(listingFormData({ summary: "x".repeat(10001) }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/summary is too long/i);
    expect(dbMocks.createListing).not.toHaveBeenCalled();
  });
});

describe("updateListingAction pay truth", () => {
  it("passes explicit blank pay bounds through as null so stale pay is cleared", async () => {
    dbMocks.updateListing.mockResolvedValueOnce({ ok: true });
    const formData = new FormData();
    formData.set("payMin", "");
    formData.set("payMax", "   ");

    await expect(updateListingAction("listing-1", formData)).resolves.toEqual({
      ok: true,
    });

    expect(dbMocks.updateListing).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      "listing-1",
      { payMin: null, payMax: null },
    );
  });

  it("preserves a stated lower bound while explicitly clearing the upper bound", async () => {
    dbMocks.updateListing.mockResolvedValueOnce({ ok: true });
    const formData = new FormData();
    formData.set("payMin", "18");
    formData.set("payMax", "");

    await expect(updateListingAction("listing-1", formData)).resolves.toEqual({
      ok: true,
    });

    expect(dbMocks.updateListing).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      "listing-1",
      { payMin: 18, payMax: null },
    );
  });
});

describe("duplicateListingAction", () => {
  it("over limit: friendly error, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await duplicateListingAction("listing-1");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/duplicated several listings/i);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "listing-duplicate:user_default",
      10,
      24 * 60 * 60 * 1000,
    );
    expect(dbMocks.duplicateListing).not.toHaveBeenCalled();
  });
});

// ── searchSeekersAction ──────────────────────────────────────────────────────

describe("searchSeekersAction", () => {
  const LISTING_ID = "11111111-1111-4111-8111-111111111111";

  it("within limit: returns the listing-scoped db results", async () => {
    const rows = [
      {
        seekerProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        displayName: "Anna",
        bio: null,
        alreadyInvited: false,
      },
    ];
    dbMocks.searchSeekersForInvite.mockResolvedValueOnce({ ok: true, seekers: rows });
    const result = await searchSeekersAction(LISTING_ID, "  anna   crew ");
    expect(result).toEqual({ ok: true, seekers: rows });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "seeker-search:user_default",
      30,
      60 * 60 * 1000,
    );
    expect(dbMocks.searchSeekersForInvite).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      LISTING_ID,
      "anna crew",
    );
  });

  it("over limit: is distinct from an empty result and never queries", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await searchSeekersAction(LISTING_ID, "anna");
    expect(result).toEqual({ ok: false, error: "rate_limit_exceeded" });
    expect(dbMocks.searchSeekersForInvite).not.toHaveBeenCalled();
  });

  it.each([
    ["not-a-uuid", "anna"],
    [LISTING_ID, "a"],
    [LISTING_ID, "   "],
    [LISTING_ID, "x".repeat(101)],
  ])("rejects invalid input before auth, rate limiting, or db", async (listingId, query) => {
    const result = await searchSeekersAction(listingId, query);
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(authMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(dbMocks.searchSeekersForInvite).not.toHaveBeenCalled();
  });

  it("preserves a listing-unavailable discovery result", async () => {
    dbMocks.searchSeekersForInvite.mockResolvedValueOnce({
      ok: false,
      error: "listing_unavailable",
    });
    await expect(searchSeekersAction(LISTING_ID, "anna")).resolves.toEqual({
      ok: false,
      error: "listing_unavailable",
    });
  });

  it("maps a thrown dependency fault to a safe temporary error", async () => {
    dbMocks.searchSeekersForInvite.mockRejectedValueOnce(new Error("provider detail"));
    await expect(searchSeekersAction(LISTING_ID, "anna")).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "searchSeekersAction" }),
    );
  });

  it("returns unauthenticated without rate or db work", async () => {
    authMock.mockResolvedValueOnce({ userId: null, getToken: vi.fn() });
    await expect(searchSeekersAction(LISTING_ID, "anna")).resolves.toEqual({
      ok: false,
      error: "unauthenticated",
    });
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(dbMocks.searchSeekersForInvite).not.toHaveBeenCalled();
  });
});

describe("getMatchedSeekersAction", () => {
  const LISTING_ID = "11111111-1111-4111-8111-111111111111";

  it("returns a ready bucket result within the limit", async () => {
    const loaded = { ok: true, listingId: LISTING_ID, seekers: [] };
    dbMocks.getMatchedSeekersForListing.mockResolvedValueOnce(loaded);
    await expect(getMatchedSeekersAction(LISTING_ID, 12)).resolves.toEqual(loaded);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "sourcing:user_default",
      60,
      5 * 60 * 1000,
    );
    expect(dbMocks.getMatchedSeekersForListing).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      LISTING_ID,
      12,
    );
  });

  it("rejects malformed input before auth or dependency work", async () => {
    await expect(getMatchedSeekersAction("foreign", 51)).resolves.toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(dbMocks.getMatchedSeekersForListing).not.toHaveBeenCalled();
  });

  it("returns a stable rate-limit error without loading matches", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    await expect(getMatchedSeekersAction(LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "rate_limit_exceeded",
    });
    expect(dbMocks.getMatchedSeekersForListing).not.toHaveBeenCalled();
  });

  it("maps a thrown match dependency to temporary unavailability", async () => {
    dbMocks.getMatchedSeekersForListing.mockRejectedValueOnce(
      new Error("private provider detail"),
    );
    await expect(getMatchedSeekersAction(LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
  });
});

// ── sendInviteAction message cap ─────────────────────────────────────────────

describe("sendInviteAction — message cap", () => {
  const SEEKER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const LISTING_ID = "11111111-1111-4111-8111-111111111111";

  it("message over 500 chars: message_too_long, no profile/entitlement work", async () => {
    const result = await sendInviteAction(SEEKER_ID, LISTING_ID, "x".repeat(501));
    expect(result).toEqual({ ok: false, error: "message_too_long" });
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(dbMocks.createInviteWithEntitlement).not.toHaveBeenCalled();
  });

  it("accepts exactly 500 Unicode code points like Postgres char_length", async () => {
    dbMocks.getHostProfile.mockResolvedValueOnce({
      id: "host-profile-1",
      subscriptionTier: "professional",
    });
    dbMocks.getHostListings.mockResolvedValueOnce([{ id: LISTING_ID }]);
    dbMocks.createInviteWithEntitlement.mockResolvedValueOnce({
      ok: true,
      inviteId: "invite-1",
    });

    const result = await sendInviteAction(
      SEEKER_ID,
      LISTING_ID,
      "😀".repeat(500),
    );
    expect(result).toEqual({ ok: true });
    expect(dbMocks.createInviteWithEntitlement).toHaveBeenCalledOnce();
  });

  it("rejects 501 Unicode code points before profile or entitlement work", async () => {
    const result = await sendInviteAction(
      SEEKER_ID,
      LISTING_ID,
      "😀".repeat(501),
    );
    expect(result).toEqual({ ok: false, error: "message_too_long" });
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(dbMocks.createInviteWithEntitlement).not.toHaveBeenCalled();
  });

  it("rejects malformed seeker/listing ids before auth, rate limiting, or db", async () => {
    await expect(sendInviteAction("seeker-1", LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "invalid_request",
    });
    expect(authMock).not.toHaveBeenCalled();
    expect(checkRateLimitMock).not.toHaveBeenCalled();
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
  });

  it("keeps a host-profile read failure distinct from a missing profile", async () => {
    dbMocks.getHostProfile.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });
    expect(dbMocks.getHostListings).not.toHaveBeenCalled();

    vi.clearAllMocks();
    authMock.mockResolvedValue({
      userId: "user_default",
      getToken: vi.fn().mockResolvedValue("tok-default"),
    });
    checkRateLimitMock.mockReturnValue({ allowed: true });
    dbMocks.getHostProfile.mockResolvedValueOnce(null);
    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "profile_not_found",
    });
  });

  it("keeps a listings read failure distinct from a foreign listing", async () => {
    const profile = { id: "host-profile-1", subscriptionTier: "professional" };
    dbMocks.getHostProfile.mockResolvedValue(profile);
    dbMocks.getHostListings.mockRejectedValueOnce(new Error("provider unavailable"));
    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "temporarily_unavailable",
    });

    dbMocks.getHostListings.mockResolvedValueOnce([]);
    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("returns durable success when post-commit cache invalidation fails", async () => {
    dbMocks.getHostProfile.mockResolvedValueOnce({
      id: "host-profile-1",
      subscriptionTier: "professional",
    });
    dbMocks.getHostListings.mockResolvedValueOnce([{ id: LISTING_ID }]);
    dbMocks.createInviteWithEntitlement.mockResolvedValueOnce({
      ok: true,
      inviteId: "invite-1",
    });
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: true,
    });
    expect(dbMocks.createInviteWithEntitlement).toHaveBeenCalledOnce();
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        action: "createInviteForCurrentHost.revalidate",
      }),
    );
  });

  it("wakes notification dispatch without a post-commit invite event write", async () => {
    dbMocks.getHostProfile.mockResolvedValueOnce({
      id: "host-profile-1",
      subscriptionTier: "professional",
    });
    dbMocks.getHostListings.mockResolvedValueOnce([{ id: LISTING_ID }]);
    dbMocks.createInviteWithEntitlement.mockResolvedValueOnce({
      ok: true,
      inviteId: "invite-1",
      source: "monthly",
    });
    await expect(sendInviteAction(SEEKER_ID, LISTING_ID)).resolves.toEqual({
      ok: true,
    });
    expect(dbMocks.createInviteWithEntitlement).toHaveBeenCalledOnce();
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
    expect(afterMock).toHaveBeenCalledOnce();
  });
});

describe("invite lifecycle post-commit truth", () => {
  it("keeps a durable acceptance successful when cache invalidation and notification fail", async () => {
    dbMocks.respondToInvite.mockResolvedValueOnce({
      ok: true,
      applicationId: "application-1",
      listingId: "listing-1",
      disposition: "created",
    });
    revalidatePathMock
      .mockImplementationOnce(() => {
        throw new Error("invite cache unavailable");
      })
      .mockImplementationOnce(() => {
        throw new Error("application cache unavailable");
      });
    dbMocks.recordEvent.mockRejectedValueOnce(new Error("event store unavailable"));

    await expect(
      respondToInviteAction("invite-1", "accepted"),
    ).resolves.toEqual({
      ok: true,
      applicationId: "application-1",
      listingId: "listing-1",
      disposition: "created",
    });
    expect(dbMocks.respondToInvite).toHaveBeenCalledOnce();
    expect(dbMocks.recordEvent).toHaveBeenCalledOnce();
    expect(revalidatePathMock).toHaveBeenNthCalledWith(1, "/invites");
    expect(revalidatePathMock).toHaveBeenNthCalledWith(2, "/applied");
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "respondToInviteAction.revalidateInvites" }),
    );
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "respondToInviteAction.notification" }),
    );
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "respondToInviteAction.revalidateApplied" }),
    );
  });

  it("keeps a durable decline successful when its cache refresh fails", async () => {
    dbMocks.respondToInvite.mockResolvedValueOnce({ ok: true });
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(
      respondToInviteAction("invite-1", "declined"),
    ).resolves.toEqual({ ok: true });
    expect(dbMocks.recordEvent).not.toHaveBeenCalled();
  });

  it("keeps an atomic withdrawal successful when its cache refresh fails", async () => {
    dbMocks.withdrawInvite.mockResolvedValueOnce({
      ok: true,
      disposition: "withdrawn",
      creditRestored: true,
    });
    revalidatePathMock.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    await expect(withdrawInviteAction("invite-1")).resolves.toEqual({
      ok: true,
      disposition: "withdrawn",
      creditRestored: true,
    });
    expect(reportErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ action: "withdrawInviteAction.revalidate" }),
    );
  });
});

// ── updateApplicationStatusAction ────────────────────────────────────────────

describe("updateApplicationStatusAction", () => {
  it("within limit: passes through and records the status-change event", async () => {
    dbMocks.updateApplicationStatus.mockResolvedValueOnce({ ok: true });
    const result = await updateApplicationStatusAction("app-1", "reviewing");
    expect(result).toEqual({ ok: true });
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "application-status:user_default",
      60,
      60 * 60 * 1000,
    );
    expect(dbMocks.updateApplicationStatus).toHaveBeenCalledWith(
      "tok-default",
      "user_default",
      "app-1",
      "reviewing",
    );
    expect(dbMocks.recordEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "application_status_changed" }),
    );
  });

  it("over limit: friendly error, db never called", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await updateApplicationStatusAction("app-1", "reviewing");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/updating statuses very quickly/i);
    expect(dbMocks.updateApplicationStatus).not.toHaveBeenCalled();
  });
});

// ── applyToListingAction cover-message cap ───────────────────────────────────

describe("applyToListingAction — cover message cap", () => {
  it("cover message over 2000 chars: cover_message_too_long, db never called", async () => {
    const result = await applyToListingAction("listing-1", "x".repeat(2001));
    expect(result).toEqual({ ok: false, error: "cover_message_too_long" });
    expect(dbMocks.applyToListing).not.toHaveBeenCalled();
  });
});
