/**
 * A zero-row host_profiles UPDATE means two different things, and the webhook
 * must tell them apart by asking whether a profile EXISTS — not by asking which
 * way the entitlement is moving.
 *
 * THE ORIGINAL DEFECT. syncHostSubscriptionTier ran an UPDATE filtered by
 * clerk_user_id and checked only `error`. Supabase answers a zero-row UPDATE
 * with { data: [], error: null }, so a host whose profile existed but whose read
 * copy silently stayed stale was charged, granted nothing, and the webhook still
 * returned 200. The `.select("id")` and the raise fixed that.
 *
 * THE DEFECT THE FIX THEN CAUSED. Migration 083 gates create_my_host_profile on
 * a paid tier, so the funnel is sign up -> pay -> create profile and a
 * host_profiles row is IMPOSSIBLE at payment time. Every new paying customer
 * therefore took the raise: HTTP 500 on the first webhook of every subscription
 * and a Sentry page with it. Sustained 5xx is the documented way Stripe disables
 * an endpoint, which would then have broken every grant AND every revocation.
 *
 * WHAT IS PINNED HERE. host_subscriptions is the authority, it is written first,
 * and create_my_host_profile seeds and re-seeds the denormalized copy from it —
 * so "no profile yet" loses nothing and must resolve, while "a profile exists
 * and the write still changed nothing" is a real fault and must still throw.
 * The database half of that promise is proved against a real database in
 * tools/db-assert/sql/assert_listing_allowance_enforcement.sql, section 6.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("server-only", () => ({}));

interface RecordedCall {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
}

const calls: RecordedCall[] = [];
const upsertHostSubscriptionMock = vi.hoisted(() => vi.fn());

/** What the host_profiles UPDATE ... RETURNING id reports back. */
let updateResult: { data: unknown; error: unknown } = {
  data: [{ id: "host-1" }],
  error: null,
};
/** What the follow-up "is there a profile at all?" read reports back. */
let probeResult: { data: unknown; error: unknown } = { data: [], error: null };

function makeBuilder(table: string): Record<string, unknown> {
  const builder: Record<string, unknown> = {};
  // The probe chain (.select().eq().limit()) is the default; calling .update()
  // switches the chain's answer to the UPDATE's. Nothing else distinguishes
  // them, which is the point: both run against the same table and predicate.
  let settle = () => Promise.resolve(probeResult);

  for (const method of ["update", "eq", "select", "limit"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args });
      if (method === "update") settle = () => Promise.resolve(updateResult);
      return builder;
    };
  }
  builder.maybeSingle = () => settle();
  builder.single = () => settle();
  builder.then = (onFulfilled: unknown, onRejected: unknown) =>
    settle().then(onFulfilled as never, onRejected as never);
  return builder;
}

vi.mock("@explore-and-earn/db", () => ({
  adminClient: () => ({ from: (table: string) => makeBuilder(table) }),
  activateBoostCampaignFromCheckout: vi.fn(),
  insertHostAnnouncement: vi.fn(),
  recordInvitePackPurchase: vi.fn(),
  revokeListingSlotPurchase: vi.fn(),
  // The Clerk-keyed authority (083) is written first and throws on its own
  // failure; a spy here isolates these cases to the denormalized copy while
  // still letting the entitlement-was-recorded assertion be made.
  upsertHostSubscription: upsertHostSubscriptionMock,
  // The lapse sweep. Every case here is a plan GRANT, where it is a no-op by
  // construction — a host inside their allowance has no excess to close.
  closeHostListingsOverAllowance: vi.fn(async () => 0),
  getHostSubscriptionByClerkUserId: vi.fn(async () => null),
}));

const { handleStripeWebhookEvent } = await import("../../services/stripe");

/** A paid subscription checkout carrying a valid tier and clerk id. */
function paidSubscriptionCheckout(): Stripe.Event {
  return {
    id: "evt_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_1",
        mode: "subscription",
        payment_status: "paid",
        customer: null,
        client_reference_id: null,
        metadata: { clerkUserId: "user_paid", subscriptionTier: "starter" },
      },
    },
  } as unknown as Stripe.Event;
}

beforeEach(() => {
  calls.length = 0;
  upsertHostSubscriptionMock.mockReset();
  updateResult = { data: [{ id: "host-1" }], error: null };
  probeResult = { data: [], error: null };
});

describe("host tier sync after a real payment", () => {
  it("asks the database which rows it changed", async () => {
    await handleStripeWebhookEvent(paidSubscriptionCheckout());

    expect(calls).toContainEqual({
      table: "host_profiles",
      method: "update",
      args: [{ subscription_tier: "starter" }],
    });
    // Without a select the zero-row case is indistinguishable from success.
    expect(calls.some((c) => c.table === "host_profiles" && c.method === "select")).toBe(
      true,
    );
  });

  it("grants the tier when a host profile matched", async () => {
    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).resolves.toEqual(
      expect.objectContaining({ action: "synced_checkout_session", tier: "starter" }),
    );
  });

  /**
   * THE NEW CUSTOMER. No host_profiles row exists yet and none can: 083 refuses
   * to create one without a paid tier. Nothing is lost — the entitlement is in
   * host_subscriptions and create_my_host_profile reads it — so this must be a
   * 2xx, not the 500 that used to fire for every first-time payer.
   */
  it("RESOLVES a grant that matched zero rows because there is no profile yet", async () => {
    updateResult = { data: [], error: null };
    probeResult = { data: [], error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).resolves.toEqual(
      expect.objectContaining({ action: "synced_checkout_session", tier: "starter" }),
    );

    // …and the entitlement was still recorded, in the place that can hold it.
    expect(upsertHostSubscriptionMock).toHaveBeenCalledWith(
      expect.objectContaining({ clerkUserId: "user_paid", tier: "starter" }),
    );
  });

  it("RESOLVES when the driver returns no rows at all and no profile exists", async () => {
    updateResult = { data: null, error: null };
    probeResult = { data: null, error: null };

    await expect(
      handleStripeWebhookEvent(paidSubscriptionCheckout()),
    ).resolves.toEqual(expect.objectContaining({ action: "synced_checkout_session" }));
  });

  /**
   * The refusal that survives: a profile IS there and the write still changed
   * nothing, so the copy every listing, search and badge query joins is stale
   * and no later step repairs it. Fail loudly and let Stripe redeliver.
   */
  it("THROWS when a host profile exists but the update changed nothing", async () => {
    updateResult = { data: [], error: null };
    probeResult = { data: [{ id: "host-1" }], error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /a host_profiles row exists but the tier update changed nothing/i,
    );
  });

  it("asks the same question the UPDATE asked, so 'no profile' cannot be an artefact of a different filter", async () => {
    updateResult = { data: [], error: null };
    probeResult = { data: [], error: null };

    await handleStripeWebhookEvent(paidSubscriptionCheckout());

    const eqCalls = calls.filter(
      (c) => c.table === "host_profiles" && c.method === "eq",
    );
    // Two chains ran — the UPDATE and the read-back — and both filtered on the
    // Clerk id and nothing else.
    expect(eqCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of eqCalls) {
      expect(call.args).toEqual(["clerk_user_id", "user_paid"]);
    }
  });

  it("does not leak the paying Clerk user id into the thrown message", async () => {
    updateResult = { data: [], error: null };
    probeResult = { data: [{ id: "host-1" }], error: null };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("user_paid"),
      }) as Error,
    );
  });

  it("still surfaces a real database error", async () => {
    updateResult = { data: null, error: { message: "permission denied" } };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /permission denied/i,
    );
  });

  /**
   * A read that FAULTS is not evidence that the profile is absent. Flattening it
   * into "no profile" would turn a transient database error into a permanently
   * stale entitlement that nothing ever retries.
   */
  it("THROWS when the profile read-back itself fails", async () => {
    updateResult = { data: [], error: null };
    probeResult = { data: null, error: { message: "connection reset" } };

    await expect(handleStripeWebhookEvent(paidSubscriptionCheckout())).rejects.toThrow(
      /could not be read back: connection reset/i,
    );
  });
});
