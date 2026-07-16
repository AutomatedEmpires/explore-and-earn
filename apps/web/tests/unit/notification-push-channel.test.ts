/**
 * Adversarial tests for the web-push delivery channel.
 *
 * What these pin:
 *  - VAPID GATE: without both VAPID keys configured, sendPush never touches
 *    the db layer or the provider — terminal, non-retryable, silent.
 *  - PAYLOAD PRIVACY: the wire payload carries ONLY rendered title/body/path/
 *    tag — never subscription keys (p256dh/auth) or the endpoint URL.
 *  - FAILURE CLASSIFICATION: 410 revokes the dead subscription and never
 *    retries; 429 backs off and retries without revoking.
 *  - PARTIAL SUCCESS: one live subscription succeeding is enough to report
 *    ok:true even if a sibling subscription failed.
 *  - OPEN-REDIRECT GUARD: an unsafe destinationPath collapses to "/" in the
 *    payload, same as every other channel.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"

import type { NotificationIntent } from "@explore-and-earn/contracts"

vi.mock("server-only", () => ({}))

const webpushMocks = vi.hoisted(() => ({
	setVapidDetails: vi.fn(),
	sendNotification: vi.fn(),
}))
vi.mock("web-push", () => ({ default: webpushMocks }))

const dbMocks = vi.hoisted(() => ({
	getActivePushSubscriptions: vi.fn(),
	recordPushOutcome: vi.fn(),
	revokePushSubscription: vi.fn(),
}))
vi.mock("@explore-and-earn/db", () => dbMocks)

import { _resetVapidForTests, sendPush } from "../../services/notifications/channels/push"

const ENV_KEYS = [
	"VAPID_PUBLIC_KEY",
	"VAPID_PRIVATE_KEY",
	"VAPID_SUBJECT",
	"NEXT_PUBLIC_VAPID_PUBLIC_KEY",
] as const

let savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

beforeEach(() => {
	_resetVapidForTests()
	vi.clearAllMocks()
	savedEnv = {}
	for (const key of ENV_KEYS) {
		savedEnv[key] = process.env[key]
		delete process.env[key]
	}
	// Realistic async db-layer defaults: sendPush fire-and-forgets these with
	// `.catch(...)`, so an unmocked (undefined-returning) vi.fn() would blow
	// up with "Cannot read properties of undefined (reading 'catch')".
	dbMocks.recordPushOutcome.mockResolvedValue(undefined)
	dbMocks.revokePushSubscription.mockResolvedValue(undefined)
})

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) delete process.env[key]
		else process.env[key] = savedEnv[key]
	}
})

function setVapidEnv(): void {
	process.env.VAPID_PUBLIC_KEY = "test-public-key"
	process.env.VAPID_PRIVATE_KEY = "test-private-key"
}

function baseIntent(overrides: Partial<NotificationIntent> = {}): NotificationIntent {
	return {
		sourceEventId: "e1",
		sourceOccurredAt: new Date(0).toISOString(),
		recipientClerkUserId: "user_1",
		category: "messages",
		type: "message_received",
		variant: "default",
		locale: "en",
		destinationPath: "/messages/c1",
		titleKey: "Notifications.types.message_received.title",
		bodyKey: "Notifications.types.message_received.body",
		values: { listingTitle: "" },
		collapseKey: "conversation:c1",
		urgent: false,
		...overrides,
	} as NotificationIntent
}

function makeSubscription(overrides: Partial<Record<string, string>> = {}) {
	return {
		id: "sub-1",
		clerk_user_id: "user_1",
		endpoint: "https://push.example.com/subscription/abc123secret",
		p256dh: "p256dh-key-value-should-never-leak",
		auth: "auth-secret-value-should-never-leak",
		...overrides,
	}
}

describe("sendPush — VAPID configuration gate", () => {
	it("returns a terminal, non-retryable failure and never touches the db or provider when VAPID keys are absent", async () => {
		const result = await sendPush(baseIntent())
		expect(result).toMatchObject({ ok: false, retryable: false, failureClass: "terminal" })
		expect(webpushMocks.sendNotification).not.toHaveBeenCalled()
		expect(dbMocks.getActivePushSubscriptions).not.toHaveBeenCalled()
	})
})

describe("sendPush — no active subscriptions", () => {
	it("returns invalid_recipient, non-retryable when the recipient has zero active subscriptions", async () => {
		setVapidEnv()
		dbMocks.getActivePushSubscriptions.mockResolvedValue([])

		const result = await sendPush(baseIntent())

		expect(result.ok).toBe(false)
		expect(result.failureClass).toBe("invalid_recipient")
		expect(result.retryable).toBe(false)
	})
})

describe("sendPush — successful delivery", () => {
	it("sends a minimal payload (title/body/path/tag only) and records success", async () => {
		setVapidEnv()
		const sub = makeSubscription()
		dbMocks.getActivePushSubscriptions.mockResolvedValue([sub])
		webpushMocks.sendNotification.mockResolvedValue(undefined)

		const result = await sendPush(baseIntent())

		expect(result).toEqual({ ok: true })
		expect(webpushMocks.sendNotification).toHaveBeenCalledTimes(1)

		const payloadArg = webpushMocks.sendNotification.mock.calls[0][1] as string
		const parsed = JSON.parse(payloadArg) as Record<string, unknown>
		expect(Object.keys(parsed).sort()).toEqual(["body", "path", "tag", "title"])
		expect(parsed.path).toBe("/messages/c1")
		expect(parsed.tag).toBe("conversation:c1")

		expect(payloadArg).not.toContain("p256dh")
		expect(payloadArg).not.toContain("auth")
		expect(payloadArg).not.toContain(sub.endpoint)

		expect(dbMocks.recordPushOutcome).toHaveBeenCalledWith(sub.id, true)
	})
})

describe("sendPush — 410 gone subscription", () => {
	it("revokes the subscription, does not retry, and never logs the endpoint", async () => {
		setVapidEnv()
		const sub = makeSubscription()
		dbMocks.getActivePushSubscriptions.mockResolvedValue([sub])
		webpushMocks.sendNotification.mockRejectedValue({ statusCode: 410 })

		const result = await sendPush(baseIntent())

		expect(dbMocks.revokePushSubscription).toHaveBeenCalledWith(sub.id)
		expect(result.ok).toBe(false)
		expect(result.failureClass).toBe("invalid_recipient")
		expect(result.retryable).toBe(false)
		expect(result.detail).not.toContain(sub.endpoint)
	})
})

describe("sendPush — 429 rate limited", () => {
	it("is retryable, records the failed outcome, and does not revoke the subscription", async () => {
		setVapidEnv()
		const sub = makeSubscription()
		dbMocks.getActivePushSubscriptions.mockResolvedValue([sub])
		webpushMocks.sendNotification.mockRejectedValue({ statusCode: 429 })

		const result = await sendPush(baseIntent())

		expect(result.retryable).toBe(true)
		expect(result.failureClass).toBe("rate_limited")
		expect(dbMocks.recordPushOutcome).toHaveBeenCalledWith(sub.id, false)
		expect(dbMocks.revokePushSubscription).not.toHaveBeenCalled()
	})
})

describe("sendPush — partial success across multiple subscriptions", () => {
	it("reports ok:true when at least one of several subscriptions succeeds, and still revokes the dead one", async () => {
		setVapidEnv()
		const deadSub = makeSubscription({ id: "sub-dead", endpoint: "https://push.example.com/dead" })
		const liveSub = makeSubscription({ id: "sub-live", endpoint: "https://push.example.com/live" })
		dbMocks.getActivePushSubscriptions.mockResolvedValue([deadSub, liveSub])
		webpushMocks.sendNotification
			.mockRejectedValueOnce({ statusCode: 410 })
			.mockResolvedValueOnce(undefined)

		const result = await sendPush(baseIntent())

		expect(result.ok).toBe(true)
		expect(dbMocks.revokePushSubscription).toHaveBeenCalledTimes(1)
		expect(dbMocks.revokePushSubscription).toHaveBeenCalledWith(deadSub.id)
	})
})

describe("sendPush — destination path safety", () => {
	it("collapses an unsafe (external) destinationPath to '/' in the payload", async () => {
		setVapidEnv()
		const sub = makeSubscription()
		dbMocks.getActivePushSubscriptions.mockResolvedValue([sub])
		webpushMocks.sendNotification.mockResolvedValue(undefined)

		await sendPush(baseIntent({ destinationPath: "https://evil.com" }))

		const payloadArg = webpushMocks.sendNotification.mock.calls[0][1] as string
		const parsed = JSON.parse(payloadArg) as Record<string, unknown>
		expect(parsed.path).toBe("/")
	})
})
