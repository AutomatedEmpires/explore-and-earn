import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { suppressEmail } from "@explore-and-earn/db";

import { reportError } from "../../../../lib/sentry";

export const dynamic = "force-dynamic";

/**
 * Resend delivery-events webhook: hard bounces and spam complaints add the
 * address to email_suppressions so the engine never submits to it again.
 *
 * Security: Resend signs webhooks with the Svix scheme. Signature is REQUIRED
 * — without a configured RESEND_WEBHOOK_SECRET the endpoint refuses events
 * (503) rather than trusting unauthenticated input. Verification is
 * constant-time over `${id}.${timestamp}.${body}` with a ±5-minute replay
 * window.
 *
 * FOUNDER CONFIG: create the webhook in the Resend dashboard pointing at
 * /api/webhooks/resend (events: email.bounced, email.complained) and set
 * RESEND_WEBHOOK_SECRET to its signing secret (whsec_…).
 */

const TOLERANCE_SECONDS = 5 * 60;

function verifySvixSignature(args: {
	readonly id: string;
	readonly timestamp: string;
	readonly signatureHeader: string;
	readonly body: string;
	readonly secret: string;
}): boolean {
	const ts = Number(args.timestamp);
	if (!Number.isFinite(ts)) return false;
	if (Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;

	const secretB64 = args.secret.startsWith("whsec_")
		? args.secret.slice("whsec_".length)
		: args.secret;
	let key: Buffer;
	try {
		key = Buffer.from(secretB64, "base64");
	} catch {
		return false;
	}
	if (key.length === 0) return false;

	const expected = createHmac("sha256", key)
		.update(`${args.id}.${args.timestamp}.${args.body}`)
		.digest("base64");
	const expectedBuf = Buffer.from(expected, "utf8");

	// Header format: space-delimited "v1,<base64sig>" entries.
	for (const part of args.signatureHeader.split(" ")) {
		const [version, signature] = part.split(",");
		if (version !== "v1" || !signature) continue;
		const candidate = Buffer.from(signature, "utf8");
		if (candidate.length === expectedBuf.length && timingSafeEqual(candidate, expectedBuf)) {
			return true;
		}
	}
	return false;
}

function recipientsOf(data: unknown): string[] {
	if (typeof data !== "object" || data === null) return [];
	const to = (data as { to?: unknown }).to;
	if (typeof to === "string") return [to];
	if (Array.isArray(to)) return to.filter((v): v is string => typeof v === "string");
	return [];
}

export async function POST(request: Request): Promise<NextResponse> {
	const secret = process.env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		// Refuse silently-unverifiable events; suppression must never be
		// attacker-writable via an unauthenticated endpoint.
		return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
	}

	const body = await request.text();
	const id = request.headers.get("svix-id") ?? "";
	const timestamp = request.headers.get("svix-timestamp") ?? "";
	const signatureHeader = request.headers.get("svix-signature") ?? "";
	if (
		!id ||
		!timestamp ||
		!signatureHeader ||
		!verifySvixSignature({ id, timestamp, signatureHeader, body, secret })
	) {
		return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
	}

	try {
		const event = JSON.parse(body) as { type?: unknown; data?: unknown };
		const type = typeof event.type === "string" ? event.type : "";
		let suppressedCount = 0;

		if (type === "email.bounced" || type === "email.complained") {
			const reason = type === "email.complained" ? "complaint" : "hard_bounce";
			for (const email of recipientsOf(event.data)) {
				await suppressEmail({ email, reason, source: `resend:${type}` });
				suppressedCount += 1;
			}
		}
		// All other event types acknowledged without action.
		return NextResponse.json({ ok: true, suppressed: suppressedCount });
	} catch (error) {
		reportError(error, { action: "webhooks.resend" });
		return NextResponse.json({ ok: false }, { status: 500 });
	}
}
