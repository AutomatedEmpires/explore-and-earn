/**
 * Stripe webhook handler.
 *
 * Production webhook URL pattern:
 *   https://<production-domain>/api/webhooks/stripe
 *
 * Setup: register this endpoint in the Stripe Dashboard or via the Stripe CLI,
 * and set STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET in Vercel's Production
 * environment.
 *
 * This route currently verifies signatures and fails closed for actionable
 * billing events until the billing mirror and entitlement handlers are
 * implemented.
 */
import { NextResponse } from "next/server";

import {
	getStripeWebhookDisposition,
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
		const disposition = getStripeWebhookDisposition(event);

		if (disposition.actionable) {
			console.error(disposition.message, {
				eventId: event.id,
				eventType: event.type,
			});

			return NextResponse.json(
				{
					error: disposition.message,
					eventId: event.id,
					eventType: event.type,
				},
				{ status: 503 },
			);
		}

		console.info(disposition.message, {
			eventId: event.id,
			eventType: event.type,
		});

		return NextResponse.json(
			{
				received: true,
				eventId: event.id,
				eventType: event.type,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("Stripe webhook verification failed", error);

		return NextResponse.json(
			{ error: "Invalid Stripe webhook signature." },
			{ status: 400 },
		);
	}
}