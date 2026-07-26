/**
 * The additional-listing add-on cannot be credited twice for one payment.
 *
 * Stripe delivers webhooks AT LEAST ONCE, and `checkout.session.completed` plus
 * `checkout.session.async_payment_succeeded` deliberately run the same code path
 * (both carry a Checkout.Session and must grant identically). So the credit path
 * is called more than once for a single payment as a matter of course, not as an
 * edge case — and each extra call would otherwise hand out a permanent extra
 * listing slot for free.
 *
 * The guarantee is structural: a unique index on
 * host_listing_slot_purchases.stripe_checkout_session_id, with the insert using
 * `on conflict do nothing` and the allowance increment gated on whether a row
 * was actually inserted (migration 085). These tests pin the TypeScript half —
 * that a repeat call reports alreadyCredited and never claims a fresh credit.
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockRpc = vi.fn();
vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ rpc: mockRpc }),
}));
vi.mock("../src/client", () => ({
  authedClient: () => ({ rpc: mockRpc }),
  anonClient: () => ({ rpc: mockRpc }),
}));

import {
  creditListingSlotPurchase,
  getPurchasedListingSlots,
  revokeListingSlotPurchase,
} from "../src/queries/listingSlotPurchase.js";

const PURCHASE = {
  hostProfileId: "host-1",
  quantity: 2,
  unitAmountCents: 9900,
  tier: "starter",
  stripeCheckoutSessionId: "cs_test_123",
  stripeSubscriptionId: "sub_test_456",
} as const;

beforeEach(() => {
  mockRpc.mockReset();
});

describe("creditListingSlotPurchase", () => {
  it("credits a first delivery", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, already_credited: false },
      error: null,
    });

    const result = await creditListingSlotPurchase(PURCHASE);

    expect(result).toEqual({ ok: true, alreadyCredited: false });
    expect(mockRpc).toHaveBeenCalledWith("credit_listing_slot_purchase", {
      p_host_profile_id: "host-1",
      p_quantity: 2,
      p_unit_amount_cents: 9900,
      p_tier: "starter",
      p_session_id: "cs_test_123",
      p_subscription_id: "sub_test_456",
    });
  });

  it("does NOT credit a second time for the same checkout session", async () => {
    mockRpc
      .mockResolvedValueOnce({ data: { ok: true, already_credited: false }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, already_credited: true }, error: null });

    const first = await creditListingSlotPurchase(PURCHASE);
    const second = await creditListingSlotPurchase(PURCHASE);

    expect(first.alreadyCredited).toBe(false);
    expect(second).toEqual({ ok: true, alreadyCredited: true });
    // Both calls carry the SAME session id — that is what the unique index keys
    // on. If this ever varied per delivery, idempotency would be defeated.
    expect(mockRpc.mock.calls[0][1].p_session_id).toBe(
      mockRpc.mock.calls[1][1].p_session_id,
    );
  });

  it("REFUSES a quantity that is not a positive integer, without touching the database", async () => {
    for (const quantity of [0, -1, 1.5, Number.NaN]) {
      const result = await creditListingSlotPurchase({ ...PURCHASE, quantity });
      expect(result).toEqual({ ok: false, alreadyCredited: false });
    }
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("REFUSES a credit with no session id — there would be nothing to deduplicate on", async () => {
    const result = await creditListingSlotPurchase({
      ...PURCHASE,
      stripeCheckoutSessionId: "",
    });
    expect(result).toEqual({ ok: false, alreadyCredited: false });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("reports NOT-recorded before migration 085 — so the webhook fails and Stripe retries", async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    const result = await creditListingSlotPurchase(PURCHASE);
    expect(result.ok).toBe(false);
  });

  it("reports NOT-recorded when the function returns a non-ok verdict", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: false, error: "invalid_quantity" },
      error: null,
    });
    expect(await creditListingSlotPurchase(PURCHASE)).toEqual({
      ok: false,
      alreadyCredited: false,
    });
  });
});

describe("revokeListingSlotPurchase", () => {
  it("revokes an add-on subscription's allowance once", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, found: true, already_revoked: false },
      error: null,
    });
    expect(await revokeListingSlotPurchase("sub_test_456")).toEqual({
      ok: true,
      found: true,
      alreadyRevoked: false,
    });
  });

  it("is idempotent — a redelivered cancellation decrements nothing", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, found: true, already_revoked: true },
      error: null,
    });
    expect(await revokeListingSlotPurchase("sub_test_456")).toEqual({
      ok: true,
      found: true,
      alreadyRevoked: true,
    });
  });

  it("treats an unrelated subscription as found:false, not as an error", async () => {
    mockRpc.mockResolvedValueOnce({
      data: { ok: true, found: false, already_revoked: false },
      error: null,
    });
    expect(await revokeListingSlotPurchase("sub_plan_999")).toMatchObject({
      ok: true,
      found: false,
    });
  });

  it("REFUSES an empty subscription id without touching the database", async () => {
    expect(await revokeListingSlotPurchase("")).toEqual({
      ok: false,
      found: false,
      alreadyRevoked: false,
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe("getPurchasedListingSlots", () => {
  it("returns the host's own allowance", async () => {
    mockRpc.mockResolvedValueOnce({ data: 3, error: null });
    expect(await getPurchasedListingSlots("token")).toBe(3);
  });

  it.each([
    [{ data: null, error: { code: "PGRST202", message: "missing" } }],
    [{ data: -2, error: null }],
    [{ data: "3", error: null }],
    [{ data: 1.5, error: null }],
  ])("returns 0 rather than a widened cap for %j", async (response) => {
    mockRpc.mockResolvedValueOnce(response);
    expect(await getPurchasedListingSlots("token")).toBe(0);
  });
});
