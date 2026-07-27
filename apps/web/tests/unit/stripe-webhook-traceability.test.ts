/**
 * A failing Stripe webhook has to reach Sentry, with the event id.
 *
 * The claim this pins is a comment in services/stripe/index.ts. When
 * syncHostSubscriptionTier finds no host_profiles row for a paying customer it
 * throws, and it deliberately keeps the Clerk id OUT of the message because
 * "this string reaches logs and Sentry, and the event id there is enough to
 * trace the host".
 *
 * Neither half of that was true. The webhook route catches every non-signature
 * error, `console.error`s it and answers 500 — so the error never escapes the
 * handler and Next.js's `onRequestError` instrumentation never sees it, and
 * nothing carried the Stripe event id anyway. The one error that means a host
 * was CHARGED AND GRANTED NOTHING was therefore untraceable by construction: an
 * identifier-free message with no identifier attached to it.
 *
 * Two assertions, because half a fix restores the defect: the failure is
 * reported, and the report carries the event id that makes the deliberately
 * anonymous message traceable.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const reportErrorMock = vi.hoisted(() => vi.fn());
const stripeMocks = vi.hoisted(() => ({
  handleStripeWebhookEvent: vi.fn(),
  hasStripeServerConfig: vi.fn(() => true),
  verifyStripeWebhookEvent: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({ reportError: reportErrorMock }));
vi.mock("../../services/stripe", () => stripeMocks);

const { STRIPE_WEBHOOK_ROUTE } = await import("../../lib/routePaths");
const { POST } = await import(
  "../../app/api/webhooks/stripe/route"
);

const EVENT_ID = "evt_1PxyzTRACE";

function webhookRequest(): Request {
  return new Request("https://example.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "t=1,v1=deadbeef" },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  stripeMocks.hasStripeServerConfig.mockReturnValue(true);
  stripeMocks.verifyStripeWebhookEvent.mockReturnValue({
    id: EVENT_ID,
    type: "checkout.session.completed",
  });
});

describe("stripe webhook failure reporting", () => {
  it("reports a sync failure to Sentry, tagged with the Stripe event id", async () => {
    stripeMocks.handleStripeWebhookEvent.mockRejectedValue(
      new Error(
        "Failed to sync host subscription tier: no host_profiles row matched the granted Clerk user.",
      ),
    );

    const response = await POST(webhookRequest());

    expect(response.status).toBe(500);
    expect(reportErrorMock).toHaveBeenCalledTimes(1);

    const [error, context] = reportErrorMock.mock.calls[0];
    expect((error as Error).message).toMatch(/no host_profiles row matched/);
    // The whole point: the message names nobody, so the tag must name the
    // delivery.
    expect(context).toMatchObject({
      eventId: EVENT_ID,
      route: STRIPE_WEBHOOK_ROUTE,
    });
  });

  /**
   * A caught error is silent by construction. If this ever passes with zero
   * reports the "reaches logs and Sentry" comment is a lie again.
   */
  it("does not rely on the error escaping the handler", async () => {
    stripeMocks.handleStripeWebhookEvent.mockRejectedValue(new Error("boom"));

    await expect(POST(webhookRequest())).resolves.toBeDefined();
    expect(reportErrorMock).toHaveBeenCalled();
  });

  /**
   * Negative control. An unverifiable payload is an unauthenticated caller;
   * paging on those would let anyone fill the alert queue for free.
   */
  it("does not report a bad signature", async () => {
    stripeMocks.verifyStripeWebhookEvent.mockImplementation(() => {
      throw new Error("No signatures found matching the expected signature.");
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(400);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });

  it("reports nothing when the webhook succeeds", async () => {
    stripeMocks.handleStripeWebhookEvent.mockResolvedValue({
      action: "granted",
      clerkUserId: "user_1",
      tier: "pro",
    });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(reportErrorMock).not.toHaveBeenCalled();
  });
});
