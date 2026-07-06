/**
 * Unit tests for activateBoostCampaignFromCheckout — the boost money path's
 * webhook activation. Stripe delivers webhooks at-least-once, so the
 * activation MUST be idempotent on stripe_checkout_session_id (mirrors the
 * announcement activation guarded by announcementIdempotency.test.ts).
 *
 * All Supabase and server-only I/O is mocked so no DB connection is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const mockFrom = vi.fn();
vi.mock("../src/adminClient", () => ({
  adminClient: () => ({ from: mockFrom }),
}));

import { activateBoostCampaignFromCheckout } from "../src/queries/boostPurchase.js";

function makeLookup(result: { data?: unknown; error?: unknown }) {
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = terminal;
  return chain;
}

function makeInsert(result: { data?: unknown; error?: unknown }) {
  const terminal = () => Promise.resolve({ data: null, error: null, ...result });
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn(() => chain);
  chain.select = () => chain;
  chain.single = terminal;
  return chain;
}

const PARAMS = {
  sessionId: "cs_test_123",
  paymentIntentId: "pi_test_456",
  listingId: "listing-1",
  hostProfileId: "host-1",
  durationDays: 7,
  amountCents: 4900,
} as const;

beforeEach(() => {
  mockFrom.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-06T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("activateBoostCampaignFromCheckout", () => {
  it("inserts an active homepage campaign with the exact purchase window", async () => {
    const insert = makeInsert({ data: { id: "boost-1" } });
    mockFrom
      .mockReturnValueOnce(makeLookup({ data: null }))
      .mockReturnValueOnce(insert);

    const result = await activateBoostCampaignFromCheckout(PARAMS);

    expect(result).toEqual({ id: "boost-1", alreadyExisted: false });
    const row = (insert.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row).toMatchObject({
      listing_id: "listing-1",
      host_profile_id: "host-1",
      tier: "starter", // default when the purchaser's tier isn't supplied
      surfaces: ["homepage"],
      status: "active",
      stripe_checkout_session_id: "cs_test_123",
      stripe_payment_intent_id: "pi_test_456",
      purchase_amount_cents: 4900,
      purchase_duration_days: 7,
    });
    expect(row.starts_at).toBe("2026-07-06T12:00:00.000Z");
    expect(row.ends_at).toBe("2026-07-13T12:00:00.000Z"); // exactly +7 days
  });

  it("carries the purchaser's real subscription tier when supplied (fix/boost-purchase-tier)", async () => {
    const insert = makeInsert({ data: { id: "boost-2" } });
    mockFrom
      .mockReturnValueOnce(makeLookup({ data: null }))
      .mockReturnValueOnce(insert);

    await activateBoostCampaignFromCheckout({ ...PARAMS, tier: "enterprise" });

    const row = (insert.insert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.tier).toBe("enterprise");
  });

  it("is idempotent: a webhook retry returns the existing row without inserting", async () => {
    mockFrom.mockReturnValueOnce(makeLookup({ data: { id: "boost-1" } }));

    const result = await activateBoostCampaignFromCheckout(PARAMS);

    expect(result).toEqual({ id: "boost-1", alreadyExisted: true });
    expect(mockFrom).toHaveBeenCalledTimes(1); // lookup only — no insert
  });

  it("throws with context when the idempotency lookup fails", async () => {
    mockFrom.mockReturnValueOnce(makeLookup({ error: { message: "conn reset" } }));

    await expect(activateBoostCampaignFromCheckout(PARAMS)).rejects.toThrow(
      /lookup.*conn reset/,
    );
  });

  it("throws with context when the insert fails", async () => {
    mockFrom
      .mockReturnValueOnce(makeLookup({ data: null }))
      .mockReturnValueOnce(makeInsert({ error: { message: "unique violation" } }));

    await expect(activateBoostCampaignFromCheckout(PARAMS)).rejects.toThrow(
      /insert.*unique violation/,
    );
  });
});
