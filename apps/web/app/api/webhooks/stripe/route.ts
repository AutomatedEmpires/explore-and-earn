import { NextResponse } from "next/server";

import {
  handleStripeWebhookEvent,
  hasStripeServerConfig,
  verifyStripeWebhookEvent,
} from "../../../../services/stripe";

export const runtime = "nodejs";

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

  try {
    const event = verifyStripeWebhookEvent(payload, signature);
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
      console.error("Stripe webhook verification failed", error);

      return NextResponse.json(
        { error: "Invalid Stripe webhook signature." },
        { status: 400 },
      );
    }

    console.error("Stripe webhook sync failed", error);

    return NextResponse.json(
      { error: "Stripe webhook sync failed." },
      { status: 500 },
    );
  }
}