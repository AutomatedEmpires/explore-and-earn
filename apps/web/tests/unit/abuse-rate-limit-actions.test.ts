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
  getHostClerkIdByProfileId: vi.fn(),
  isEmailSuppressed: vi.fn(),
  recordEvent: vi.fn(),
  restoreInviteCreditForInvite: vi.fn(),
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
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}));
vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({ checkRateLimit: checkRateLimitMock }));
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
import { searchSeekersAction, sendInviteAction } from "../../app/actions/invites";
import { updateApplicationStatusAction } from "../../app/actions/applicationStatus";
import { applyToListingAction } from "../../app/actions/applications";

beforeEach(() => {
  vi.clearAllMocks();
  authMock.mockResolvedValue({
    userId: "user_default",
    getToken: vi.fn().mockResolvedValue("tok-default"),
  });
  checkRateLimitMock.mockReturnValue({ allowed: true });
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
  it("over limit: redirects to the billing page with error=rate_limited before any Stripe work", async () => {
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
    expect(redirectMock).toHaveBeenCalledWith("/host/billing?error=rate_limited");
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
  it("within limit: returns the db-layer results", async () => {
    const rows = [{ seekerProfileId: "s-1", displayName: "Anna", bio: null }];
    dbMocks.searchSeekersForInvite.mockResolvedValueOnce(rows);
    const result = await searchSeekersAction("anna");
    expect(result).toEqual(rows);
    expect(checkRateLimitMock).toHaveBeenCalledWith(
      "seeker-search:user_default",
      30,
      60 * 60 * 1000,
    );
  });

  it("over limit: returns [] and never queries seeker profiles", async () => {
    checkRateLimitMock.mockReturnValueOnce({ allowed: false });
    const result = await searchSeekersAction("anna");
    expect(result).toEqual([]);
    expect(dbMocks.searchSeekersForInvite).not.toHaveBeenCalled();
  });
});

// ── sendInviteAction message cap ─────────────────────────────────────────────

describe("sendInviteAction — message cap", () => {
  it("message over 500 chars: message_too_long, no profile/entitlement work", async () => {
    const result = await sendInviteAction("seeker-1", "listing-1", "x".repeat(501));
    expect(result).toEqual({ ok: false, error: "message_too_long" });
    expect(dbMocks.getHostProfile).not.toHaveBeenCalled();
    expect(dbMocks.createInviteWithEntitlement).not.toHaveBeenCalled();
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
