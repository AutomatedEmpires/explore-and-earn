/**
 * The additional-listing add-on must bill the host's EXISTING Stripe customer.
 *
 * The defect this pins: createAdditionalListingCheckoutSession passed neither
 * `customer` nor `customer_email` and never called ensureCustomerMetadata, so
 * Stripe minted a brand-new Customer for every add-on purchase — one carrying no
 * clerkUserId metadata. createBillingPortalSession resolves its customer BY that
 * metadata, so "Manage billing" opened the host's PLAN customer, which does not
 * contain the add-on subscription. The host was billed monthly, forever, with no
 * self-serve way to stop, while the settings page told them "To cancel an add-on,
 * use Manage billing".
 *
 * The plan checkout already had the right shape. The assertion that matters is
 * that both products land on ONE customer id, so the portal shows both.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const checkoutCreate = vi.hoisted(() => vi.fn());
const portalCreate = vi.hoisted(() => vi.fn());
const customersSearch = vi.hoisted(() => vi.fn());
const customersList = vi.hoisted(() => vi.fn());
const customersRetrieve = vi.hoisted(() => vi.fn());
const customersUpdate = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({ from: () => ({}) }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  creditListingSlotPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  upsertHostSubscription: vi.fn(),
}));

vi.mock("stripe", () => {
  class FakeStripe {
    static errors = { StripeError: class extends Error {} };
    checkout = { sessions: { create: checkoutCreate } };
    customers = {
      retrieve: customersRetrieve,
      search: customersSearch,
      list: customersList,
      update: customersUpdate,
    };
    subscriptions = { list: vi.fn(), cancel: vi.fn() };
    billingPortal = { sessions: { create: portalCreate } };
    refunds = { create: vi.fn() };
    webhooks = { constructEvent: vi.fn() };
  }
  return { default: FakeStripe };
});

const { createAdditionalListingCheckoutSession, createBillingPortalSession } =
  await import("../../services/stripe");

/** The host's one real Stripe customer, found by clerkUserId metadata. */
const HOST_CUSTOMER = {
  id: "cus_host_1",
  deleted: false,
  metadata: { clerkUserId: "user_host" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  delete process.env.STRIPE_PRICE_ADDITIONAL_LISTING_STARTER;
  customersSearch.mockResolvedValue({ data: [HOST_CUSTOMER] });
  customersList.mockResolvedValue({ data: [] });
  customersRetrieve.mockResolvedValue(HOST_CUSTOMER);
  checkoutCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.test/s" });
  portalCreate.mockResolvedValue({ id: "bps_1", url: "https://portal.test/p" });
});

async function buyOneSlot() {
  return createAdditionalListingCheckoutSession({
    clerkUserId: "user_host",
    hostProfileId: "host-1",
    hostSubscriptionTier: "starter",
    quantity: 1,
    customerEmail: "host@test.example",
  });
}

describe("createAdditionalListingCheckoutSession", () => {
  it("attaches the host's existing Stripe customer to the session", async () => {
    await buyOneSlot();

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.customer).toBe("cus_host_1");
  });

  /**
   * With `customer` set, `customer_email` must be absent — Stripe rejects a
   * session that carries both, and sending the email alone is what created the
   * orphan in the first place.
   */
  it("does not also send an email that would mint a second customer", async () => {
    await buyOneSlot();

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.customer_email).toBeUndefined();
  });

  it("opens the billing portal on the SAME customer the add-on is billed to", async () => {
    await buyOneSlot();
    const checkoutParams = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;

    await createBillingPortalSession({
      clerkUserId: "user_host",
      customerEmail: "host@test.example",
      returnUrl: "https://app.test/host/billing",
    });
    const portalParams = portalCreate.mock.calls[0][0] as Record<string, unknown>;

    // The whole point: one customer, so "Manage billing" can cancel the add-on.
    expect(portalParams.customer).toBe(checkoutParams.customer);
  });

  /**
   * The portal finds its customer by clerkUserId metadata, so the add-on
   * checkout must make sure that metadata is on the customer it just used.
   */
  it("stamps clerkUserId onto the customer the portal will look for", async () => {
    customersRetrieve.mockResolvedValue({
      id: "cus_host_1",
      deleted: false,
      metadata: {},
    });

    await buyOneSlot();

    expect(customersUpdate).toHaveBeenCalledWith(
      "cus_host_1",
      expect.objectContaining({
        metadata: expect.objectContaining({ clerkUserId: "user_host" }),
      }),
    );
  });

  /**
   * No customer on record yet: Stripe must be given the email so it creates ONE
   * customer the metadata search will find next time — not a fresh orphan on
   * every purchase.
   */
  it("falls back to customer_email when no customer exists yet", async () => {
    customersSearch.mockResolvedValue({ data: [] });
    customersList.mockResolvedValue({ data: [] });

    await buyOneSlot();

    const params = checkoutCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.customer).toBeUndefined();
    expect(params.customer_email).toBe("host@test.example");
  });

  it("still carries the add-on metadata on both the session and the subscription", async () => {
    await buyOneSlot();

    const params = checkoutCreate.mock.calls[0][0] as {
      metadata: Record<string, string>;
      subscription_data: { metadata: Record<string, string> };
    };
    expect(params.metadata.clerkUserId).toBe("user_host");
    expect(params.subscription_data.metadata).toEqual(params.metadata);
  });
});
