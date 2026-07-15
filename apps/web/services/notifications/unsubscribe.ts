import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import {
	ENGAGEMENT_CATEGORIES,
	type EngagementCategory,
} from "@explore-and-earn/contracts"

// Signed, scoped unsubscribe tokens: one-click unsubscribe MUST work without
// login, so the link itself is the credential. Tokens are HMAC-SHA256 signed,
// carry no email address, and are scoped to user + category (or "all") +
// channel so one link can never disable more than it claims to.

const TOKEN_VERSION = "v1"
const DEFAULT_TTL_DAYS = 90

export type UnsubscribeScope = EngagementCategory | "all"

export interface UnsubscribePayload {
	readonly clerkUserId: string
	readonly scope: UnsubscribeScope
	readonly channel: "email"
	/** Epoch seconds. */
	readonly exp: number
}

/**
 * Signing secret resolution, in order: NOTIFICATION_SIGNING_SECRET (the
 * dedicated env — founder config), CRON_SECRET (already provisioned for this
 * app), then a fixed dev-only fallback OUTSIDE production. Returns null when
 * no secret is available in production — callers must omit unsubscribe links
 * rather than emit forgeable ones.
 */
function signingSecret(): string | null {
	const dedicated = process.env.NOTIFICATION_SIGNING_SECRET
	if (dedicated && dedicated.length >= 16) return dedicated
	const cron = process.env.CRON_SECRET
	if (cron && cron.length >= 16) return cron
	if (process.env.NODE_ENV !== "production") return "dev-only-unsubscribe-secret"
	return null
}

function b64url(buf: Buffer): string {
	return buf.toString("base64url")
}

function sign(payloadB64: string, secret: string): string {
	return b64url(createHmac("sha256", secret).update(`${TOKEN_VERSION}.${payloadB64}`).digest())
}

/**
 * Mint a scoped unsubscribe token. Returns null when no signing secret is
 * configured in production (never mint unverifiable tokens).
 */
export function createUnsubscribeToken(args: {
	readonly clerkUserId: string
	readonly scope: UnsubscribeScope
	readonly nowMs: number
	readonly ttlDays?: number
}): string | null {
	const secret = signingSecret()
	if (!secret) return null
	const payload: UnsubscribePayload = {
		clerkUserId: args.clerkUserId,
		scope: args.scope,
		channel: "email",
		exp: Math.floor(args.nowMs / 1000) + (args.ttlDays ?? DEFAULT_TTL_DAYS) * 86_400,
	}
	const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), "utf8"))
	return `${TOKEN_VERSION}.${payloadB64}.${sign(payloadB64, secret)}`
}

/**
 * Verify a token (constant-time MAC comparison) and return its payload, or
 * null for anything malformed, tampered, mis-scoped, or expired.
 */
export function verifyUnsubscribeToken(
	token: string,
	nowMs: number,
): UnsubscribePayload | null {
	const secret = signingSecret()
	if (!secret) return null
	const parts = token.split(".")
	if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return null
	const [, payloadB64, mac] = parts
	let expected: Buffer
	let provided: Buffer
	try {
		expected = Buffer.from(sign(payloadB64, secret), "utf8")
		provided = Buffer.from(mac, "utf8")
	} catch {
		return null
	}
	if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
		return null
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"))
	} catch {
		return null
	}
	if (typeof parsed !== "object" || parsed === null) return null
	const p = parsed as Record<string, unknown>
	if (typeof p.clerkUserId !== "string" || p.clerkUserId.length === 0) return null
	if (p.channel !== "email") return null
	const scope = p.scope
	const validScope =
		scope === "all" ||
		(typeof scope === "string" &&
			(ENGAGEMENT_CATEGORIES as readonly string[]).includes(scope))
	if (!validScope) return null
	if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return null
	if (p.exp * 1000 < nowMs) return null
	return {
		clerkUserId: p.clerkUserId,
		scope: scope as UnsubscribeScope,
		channel: "email",
		exp: p.exp,
	}
}
