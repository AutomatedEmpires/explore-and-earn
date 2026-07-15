/**
 * Adversarial tests for the /api/webhooks/resend Svix signature verification
 * and bounce/complaint handling.
 *
 * What these pin:
 *  - FAIL CLOSED: with no RESEND_WEBHOOK_SECRET configured, the endpoint
 *    refuses (503) rather than trusting unauthenticated input — and never
 *    calls into the suppression db layer.
 *  - SIGNATURE REQUIRED: missing/garbage/tampered signatures and stale
 *    timestamps are all rejected with 401, even though the JSON body itself
 *    may be well-formed.
 *  - SUPPRESSION MAPPING: only email.bounced/email.complained suppress, with
 *    the correct reason and source; every other event type is acknowledged
 *    without suppressing anything.
 *
 * Sentry's reportError is intentionally left unmocked: it only fires from the
 * catch-all JSON-parse/db-error path, which none of these cases exercise, and
 * Sentry.captureException is a documented no-op without a configured DSN.
 */
import { createHmac } from "node:crypto"

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

const dbMocks = vi.hoisted(() => ({
	suppressEmail: vi.fn(),
}))
vi.mock("@explore-and-earn/db", () => dbMocks)

import { POST } from "../../app/api/webhooks/resend/route"

const WEBHOOK_URL = "http://localhost/api/webhooks/resend"

// Fixed 32-byte raw signing key, base64-encoded and "whsec_"-prefixed the
// same way Resend/Svix mint a webhook secret.
const RAW_KEY = Buffer.from("a-32-byte-test-signing-key-value")
const SECRET = `whsec_${RAW_KEY.toString("base64")}`

let savedSecret: string | undefined

beforeEach(() => {
	vi.clearAllMocks()
	savedSecret = process.env.RESEND_WEBHOOK_SECRET
	delete process.env.RESEND_WEBHOOK_SECRET
	dbMocks.suppressEmail.mockResolvedValue(undefined)
})

afterEach(() => {
	if (savedSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET
	else process.env.RESEND_WEBHOOK_SECRET = savedSecret
})

function sign(id: string, timestamp: string, body: string, secret: string = SECRET): string {
	const secretB64 = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret
	const key = Buffer.from(secretB64, "base64")
	const digest = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")
	return `v1,${digest}`
}

function nowSeconds(offsetSeconds = 0): string {
	return String(Math.floor(Date.now() / 1000) + offsetSeconds)
}

function makeRequest(args: {
	readonly body: string
	readonly id?: string
	readonly timestamp?: string
	readonly signature?: string | null
}): Request {
	const id = args.id ?? "msg_test_1"
	const timestamp = args.timestamp ?? nowSeconds()
	const headers: Record<string, string> = {
		"content-type": "application/json",
		"svix-id": id,
		"svix-timestamp": timestamp,
	}
	const signature = args.signature === undefined ? sign(id, timestamp, args.body) : args.signature
	if (signature !== null) headers["svix-signature"] = signature
	return new Request(WEBHOOK_URL, { method: "POST", headers, body: args.body })
}

describe("POST /api/webhooks/resend — secret not configured", () => {
	it("returns 503 and never calls suppressEmail", async () => {
		const body = JSON.stringify({ type: "email.bounced", data: { to: ["user@example.com"] } })
		const request = makeRequest({ body })

		const response = await POST(request)

		expect(response.status).toBe(503)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})
})

describe("POST /api/webhooks/resend — signature verification", () => {
	beforeEach(() => {
		process.env.RESEND_WEBHOOK_SECRET = SECRET
	})

	it("returns 401 when the svix-signature header is missing entirely", async () => {
		const body = JSON.stringify({ type: "email.bounced", data: { to: ["user@example.com"] } })
		const request = makeRequest({ body, signature: null })

		const response = await POST(request)

		expect(response.status).toBe(401)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})

	it("returns 401 when the svix-signature header is garbage", async () => {
		const body = JSON.stringify({ type: "email.bounced", data: { to: ["user@example.com"] } })
		const request = makeRequest({ body, signature: "v1,not-a-real-signature" })

		const response = await POST(request)

		expect(response.status).toBe(401)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})

	it("returns 401 when the timestamp is stale (outside the 5-minute tolerance)", async () => {
		const body = JSON.stringify({ type: "email.bounced", data: { to: ["user@example.com"] } })
		const staleTimestamp = nowSeconds(-10 * 60)
		const request = makeRequest({ body, timestamp: staleTimestamp })

		const response = await POST(request)

		expect(response.status).toBe(401)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})

	it("returns 401 when the body is tampered with after signing", async () => {
		const signedBody = JSON.stringify({ type: "email.bounced", data: { to: ["user@example.com"] } })
		const id = "msg_test_1"
		const timestamp = nowSeconds()
		const signature = sign(id, timestamp, signedBody)
		const tamperedBody = JSON.stringify({
			type: "email.bounced",
			data: { to: ["attacker@example.com"] },
		})
		const request = new Request(WEBHOOK_URL, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"svix-id": id,
				"svix-timestamp": timestamp,
				"svix-signature": signature,
			},
			body: tamperedBody,
		})

		const response = await POST(request)

		expect(response.status).toBe(401)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})
})

describe("POST /api/webhooks/resend — suppression mapping", () => {
	beforeEach(() => {
		process.env.RESEND_WEBHOOK_SECRET = SECRET
	})

	it("email.bounced suppresses with reason hard_bounce", async () => {
		const body = JSON.stringify({ type: "email.bounced", data: { to: ["User@Example.com"] } })
		const request = makeRequest({ body })

		const response = await POST(request)

		expect(response.status).toBe(200)
		expect(dbMocks.suppressEmail).toHaveBeenCalledWith({
			email: "User@Example.com",
			reason: "hard_bounce",
			source: "resend:email.bounced",
		})
	})

	it("email.complained suppresses with reason complaint", async () => {
		const body = JSON.stringify({ type: "email.complained", data: { to: ["User@Example.com"] } })
		const request = makeRequest({ body })

		const response = await POST(request)

		expect(response.status).toBe(200)
		expect(dbMocks.suppressEmail).toHaveBeenCalledWith({
			email: "User@Example.com",
			reason: "complaint",
			source: "resend:email.complained",
		})
	})

	it("email.delivered acknowledges without suppressing anything", async () => {
		const body = JSON.stringify({ type: "email.delivered", data: { to: ["User@Example.com"] } })
		const request = makeRequest({ body })

		const response = await POST(request)

		expect(response.status).toBe(200)
		expect(dbMocks.suppressEmail).not.toHaveBeenCalled()
	})
})
