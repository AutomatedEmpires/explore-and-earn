import { NextResponse } from "next/server";

import { STRIPE_WEBHOOK_ROUTE } from "../../../../lib/routePaths";
import { reportError } from "../../../../lib/sentry";
import {
  handleStripeWebhookEvent,
  hasStripeServerConfig,
  verifyStripeWebhookEvent,
} from "../../../../services/stripe";

export const runtime = "nodejs";

/**
 * Stripe webhook receiver.
 *
 * A sync failure here is the one webhook outcome that costs money silently: a
 * paying host can be charged and granted nothing. syncHostSubscriptionTier
 * deliberately keeps the Clerk id OUT of its thrown message because the message
 * reaches logs and Sentry — but a caught error reaches NEITHER on its own.
 * Next.js's `onRequestError` instrumentation only sees errors that escape the
 * handler, and this handler catches everything to answer Stripe with a status
 * code. So the catch reports explicitly, tagged with the Stripe event id, which
 * is what makes that identifier-free message traceable back to the delivery (and
 * from there, in the Stripe dashboard, to the customer).
 */
export async function POST(request: Request) {
  if (!hasStripeServerConfig()) {
    return NextResponse.json(
      { error: "Missing Stripe server configuration." },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing Stripe signature header." },
      { status: 400 },
    );
  }

  const payload = await request.text();

  // Declared outside the try so the catch can still tag the report with the
  // delivery it failed on; a verification failure legitimately leaves it null.
  let eventId: string | undefined;
  let eventType: string | undefined;

  try {
    const event = verifyStripeWebhookEvent(payload, signature);
    eventId = event.id;
    eventType = event.type;
    const result = await handleStripeWebhookEvent(event);

    console.info("Stripe webhook processed", {
      action: result.action,
      clerkUserId: result.clerkUserId,
      eventId: event.id,
      eventType: event.type,
      tier: result.tier,
    });

    return NextResponse.json(
      {
        received: true,
        action: result.action,
        eventId: event.id,
        eventType: event.type,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("signature")) {
      // Not reported: an unverifiable payload is an unauthenticated caller, and
      // paging on those would be a free way for anyone to fill the alert queue.
      console.error("Stripe webhook verification failed", error);

      return NextResponse.json(
        { error: "Invalid Stripe webhook signature." },
        { status: 400 },
      );
    }

    console.error("Stripe webhook sync failed", error);
    reportError(error, {
      route: STRIPE_WEBHOOK_ROUTE,
      action: eventType ? `stripe-webhook:${eventType}` : "stripe-webhook",
      eventId,
    });

    return NextResponse.json(
      { error: "Stripe webhook sync failed." },
      { status: 500 },
    );
  }
}