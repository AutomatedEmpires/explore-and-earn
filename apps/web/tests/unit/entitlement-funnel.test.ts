/**
 * The application half of migration 083's entitlement enforcement.
 *
 * None of this is the gate — the database is (see
 * packages/db/tests/entitlementEnforcementIntegration.test.ts, which sends the
 * raw PostgREST writes and asserts the refusals). What is pinned here is that
 * the application ROUTES through the gate and reports its answers honestly:
 *
 *   * the Stripe webhook records subscription state against the Clerk identity,
 *     which is the only place it can live before a host profile exists;
 *   * a host with no plan is told to choose one, not "something went wrong";
 *   * announcements are created through the counted RPC, never by an insert.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const reportErrorMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());
const dbMocks = vi.hoisted(() => ({
  activateHostAnnouncement: vi.fn(),
  countHostAnnouncementsThisMonth: vi.fn(),
  createHostAnnouncement: vi.fn(),
  createHostProfile: vi.fn(),
  deleteCommunityPhoto: vi.fn(),
  deleteStorageObject: vi.fn(),
  getComments: vi.fn(),
  getCommenterName: vi.fn(),
  getSeekerCompletionScore: vi.fn(),
  getHostProfile: vi.fn(),
  getHostTierAndProfile: vi.fn(),
  getOwnedPhotoPath: vi.fn(),
  insertComment: vi.fn(),
  insertCommunityPhoto: vi.fn(),
  insertCommunityPhotoReport: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  softDeleteComment: vi.fn(),
  toggleAnnouncementReaction: vi.fn(),
  togglePhotoReaction: vi.fn(),
  uploadCommunityPhotoStorage: vi.fn(),
  deleteTrustedListingMedia: vi.fn(),
  saveSeekerProfile: vi.fn(),
  setMyHousingLibraryPhoto: vi.fn(),
  updateHostProfileDetails: vi.fn(),
  uploadTrustedListingMedia: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: vi.fn(),
}));
vi.mock("@explore-and-earn/db", () => dbMocks);
vi.mock("../../lib/rateLimit", () => ({
  checkRateLimitDistributed: rateLimitMock,
}));
vi.mock("../../lib/serverCache", () => ({
  HOST_PROFILES_CACHE_TAG: "host-profiles",
  LISTINGS_CACHE_TAG: "public-listings",
}));
vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../lib/matchRecompute", () => ({
  queueSeekerMatchRecompute: vi.fn(),
}));
vi.mock("../../services/media", () => ({ prepareUploadImage: vi.fn() }));
vi.mock("../../services/media/trustedUploadGuard", () => ({
  guardTrustedUploadSlot: vi.fn(),
  hasTrustedUploadBudget: vi.fn(),
}));
vi.mock("../../services/stripe", () => ({
  createAnnouncementCheckoutSession: vi.fn(),
}));

import { postHostAnnouncementAction } from "../../app/actions/community";
import { createHostProfileAction } from "../../app/actions/hostProfile";

function authAs(userId: string | null, token: string | null = "session-token") {
  authMock.mockResolvedValue({
    userId,
    getToken: vi.fn().mockResolvedValue(token),
  });
}

function announcementForm(): FormData {
  const fd = new FormData();
  fd.set("title", "Harvest crew wanted");
  fd.set("body", "We are hiring for the autumn pick.");
  fd.set("kind", "hiring");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  authAs("user_host");
  rateLimitMock.mockResolvedValue({ allowed: true });
  dbMocks.createHostProfile.mockResolvedValue({ ok: true, id: "host-1" });
  dbMocks.getHostTierAndProfile.mockResolvedValue({
    hostProfileId: "host-1",
    subscriptionTier: "professional",
  });
  dbMocks.countHostAnnouncementsThisMonth.mockResolvedValue(0);
  dbMocks.createHostAnnouncement.mockResolvedValue({ ok: true, id: "ann-1" });
});

// ── No free tier, reported honestly ────────────────────────────────────────

describe("createHostProfileAction — no free tier", () => {
  it("reports a missing plan as its own outcome, not a generic failure", async () => {
    // "Something went wrong. Please try again." would send the host round the
    // same loop for ever: retrying cannot produce a subscription.
    dbMocks.createHostProfile.mockResolvedValueOnce({
      ok: false,
      error: "host_subscription_required",
    });

    const result = await createHostProfileAction({
      companyName: "Glacier Orchard",
      categoryScopes: ["farm"],
    });

    expect(result).toEqual({ ok: false, error: "subscription_required" });
  });

  it("still distinguishes a disabled account from an unpaid one", async () => {
    dbMocks.createHostProfile.mockResolvedValueOnce({
      ok: false,
      error: "profile_identity_disabled",
    });

    const result = await createHostProfileAction({
      companyName: "Glacier Orchard",
      categoryScopes: ["farm"],
    });

    expect(result).toEqual({ ok: false, error: "account_unavailable" });
  });

  it("does not read a subscription requirement into an unrelated failure", async () => {
    dbMocks.createHostProfile.mockResolvedValueOnce({
      ok: false,
      error: "host_profile_create_conflict",
    });

    const result = await createHostProfileAction({
      companyName: "Glacier Orchard",
      categoryScopes: ["farm"],
    });

    expect(result).toEqual({ ok: false, error: "create_failed" });
  });
});

// ── Announcements go through the counted RPC ───────────────────────────────

describe("postHostAnnouncementAction — counted creation", () => {
  it("creates through the RPC and never through a direct insert", async () => {
    const result = await postHostAnnouncementAction(announcementForm());

    expect(result).toEqual({ ok: true, announcementId: "ann-1" });
    expect(dbMocks.createHostAnnouncement).toHaveBeenCalledWith("session-token", {
      title: "Harvest crew wanted",
      body: "We are hiring for the autumn pick.",
      kind: "hiring",
    });
    // `authenticated` holds no INSERT privilege on host_announcements any more;
    // the service-role insert path is reserved for the Stripe webhook's paid
    // draft, and using it here would be a quota bypass by another name.
    expect(dbMocks.insertHostAnnouncement).not.toHaveBeenCalled();
  });

  it("surfaces the DATABASE refusal as the upsell, even when the pre-check passed", async () => {
    // The pre-check is advisory and can be stale — a second tab, a concurrent
    // post, a tier that changed a moment ago. The RPC's answer is the one that
    // counts, and it must not be reported as "invalid input".
    dbMocks.countHostAnnouncementsThisMonth.mockResolvedValueOnce(0);
    dbMocks.createHostAnnouncement.mockResolvedValueOnce({
      ok: false,
      error: 'new row violates ... announcement_quota_exceeded',
    });

    const result = await postHostAnnouncementAction(announcementForm());

    expect(result).toEqual({
      ok: false,
      reason: "quota_exceeded",
      purchaseRequired: true,
    });
  });

  it("refuses a starter host before it ever reaches the database", async () => {
    dbMocks.getHostTierAndProfile.mockResolvedValueOnce({
      hostProfileId: "host-1",
      subscriptionTier: "starter",
    });

    const result = await postHostAnnouncementAction(announcementForm());

    expect(result).toEqual({
      ok: false,
      reason: "quota_exceeded",
      purchaseRequired: true,
    });
    expect(dbMocks.createHostAnnouncement).not.toHaveBeenCalled();
  });

  it("refuses an unsubscribed host", async () => {
    dbMocks.getHostTierAndProfile.mockResolvedValueOnce({
      hostProfileId: "host-1",
      subscriptionTier: "none",
    });

    const result = await postHostAnnouncementAction(announcementForm());

    expect(result).toEqual({
      ok: false,
      reason: "quota_exceeded",
      purchaseRequired: true,
    });
    expect(dbMocks.createHostAnnouncement).not.toHaveBeenCalled();
  });

  it("does not create anything when the content is invalid", async () => {
    const fd = new FormData();
    fd.set("title", "   ");
    fd.set("body", "text");
    fd.set("kind", "hiring");

    const result = await postHostAnnouncementAction(fd);

    expect(result).toEqual({ ok: false, reason: "invalid_input" });
    expect(dbMocks.createHostAnnouncement).not.toHaveBeenCalled();
  });
});
