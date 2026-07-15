import "server-only"

import { randomUUID } from "node:crypto"

import {
	evaluateQuietHours,
	notificationDedupKey,
	type NotificationIntent,
} from "@explore-and-earn/contracts"
import {
	adminApplicationContext,
	adminConversationContext,
	adminHostClerkId,
	adminListingContext,
	adminSeekerClerkId,
	claimDeliveries,
	countRecentOutboundDeliveries,
	findOpenCollapsibleDeliveries,
	getDeliveryIdsByDedupKeys,
	getEnginePrefsMap,
	getLegacySeekerEmailBooleans,
	getUnprocessedEvents,
	insertDeliveries,
	insertDigestMemberships,
	markEventProcessed,
	settleDelivery,
	type DeliveryRow,
	type NewDeliveryInput,
	type NewDigestMembership,
} from "@explore-and-earn/db"

import { reportError } from "../../lib/sentry"
import { MAX_DELIVERY_ATTEMPTS, nextAttemptAtMs, type FailureClass } from "./backoff"
import { sendNotificationEmail } from "./channels/email"
import { sendInApp, type ChannelSendResult } from "./channels/inApp"
import { sendPush } from "./channels/push"
import {
	overlayLegacyEmailBooleans,
	planChannels,
	resolvePrefs,
	type EnginePrefsRow,
} from "./prefs"
import { recheckIntent } from "./recheck"
import { expandEvent, type DomainEventRow, type PreIntent, type TaxonomyResolvers } from "./taxonomy"

/**
 * The dispatcher: two idempotent phases over the delivery ledger.
 *
 *   Phase 1 (expansion): unprocessed events → taxonomy → preference-planned
 *   delivery rows (idempotent on dedup_key) + digest memberships + the
 *   processed-events watermark. Re-running any part is a no-op.
 *
 *   Phase 2 (delivery): lease-claim due rows (SKIP LOCKED — concurrency- and
 *   crash-safe), re-check staleness, honor quiet hours + throttle, send via
 *   the channel adapter, settle with bounded-backoff retries and dead-letter.
 *
 * External sends happen OUTSIDE any claim transaction: the lease (not a DB
 * transaction) protects the send window.
 */

const EXPAND_BATCH = 100
const CLAIM_BATCH = 25
/** Per-recipient outbound (email+push) budget per rolling hour. */
const OUTBOUND_HOURLY_CAP = 12
const THROTTLE_DEFER_MS = 15 * 60_000

/** Far-future sentinel for digest-member rows (sent by the digest run, never claimed). */
export const DIGEST_HOLD_ISO = "9999-01-01T00:00:00.000Z"

function makeResolvers(): TaxonomyResolvers {
	// Per-run memoization: one event batch touches the same listings/profiles
	// repeatedly; each id is read at most once per run.
	const memo = new Map<string, Promise<unknown>>()
	const once = <T>(key: string, load: () => Promise<T>): Promise<T> => {
		let hit = memo.get(key)
		if (!hit) {
			hit = load()
			memo.set(key, hit)
		}
		return hit as Promise<T>
	}
	return {
		seekerClerkId: (id) => once(`seeker:${id}`, () => adminSeekerClerkId(id)),
		hostClerkId: (id) => once(`host:${id}`, () => adminHostClerkId(id)),
		listingContext: (id) => once(`listing:${id}`, () => adminListingContext(id)),
		conversationContext: (id) => once(`convo:${id}`, () => adminConversationContext(id)),
		applicationContext: (id) => once(`app:${id}`, () => adminApplicationContext(id)),
	}
}

interface RecipientContext {
	readonly prefs: ReturnType<typeof resolvePrefs>
	readonly locale: string
}

/**
 * Resolve effective prefs + locale for a set of recipients. Users without an
 * engine prefs row inherit defaults RESTRICTED by their legacy 019 email
 * booleans (an old opt-out keeps holding — consent is never re-granted by a
 * migration).
 */
async function resolveRecipients(
	clerkUserIds: readonly string[],
): Promise<Map<string, RecipientContext>> {
	const out = new Map<string, RecipientContext>()
	if (clerkUserIds.length === 0) return out
	const unique = [...new Set(clerkUserIds)]
	const prefsMap = await getEnginePrefsMap(unique)
	const withoutRow = unique.filter((id) => !prefsMap.has(id))
	const legacyMap =
		withoutRow.length > 0
			? await getLegacySeekerEmailBooleans(withoutRow)
			: new Map<string, never>()
	for (const clerkId of unique) {
		const row = prefsMap.get(clerkId) ?? null
		let prefs = resolvePrefs(row as EnginePrefsRow | null)
		if (!row) {
			prefs = overlayLegacyEmailBooleans(prefs, legacyMap.get(clerkId) ?? null)
		}
		out.set(clerkId, { prefs, locale: row?.locale ?? "en" })
	}
	return out
}

export interface ExpansionStats {
	readonly eventsProcessed: number
	readonly deliveriesCreated: number
	readonly digestMembershipsCreated: number
	readonly expansionErrors: number
}

/** Phase 1: expand unprocessed events into delivery rows + digest memberships. */
export async function expandPendingEvents(): Promise<ExpansionStats> {
	const resolvers = makeResolvers()
	const events = (await getUnprocessedEvents(EXPAND_BATCH)) as unknown as DomainEventRow[]
	let deliveriesCreated = 0
	let membershipsCreated = 0
	let eventsProcessed = 0
	let expansionErrors = 0

	for (const event of events) {
		try {
			const preIntents = await expandEvent(event, resolvers)
			let count = 0
			if (preIntents.length > 0) {
				const recipients = await resolveRecipients(
					preIntents.map((i) => i.recipientClerkUserId),
				)
				const deliveries: NewDeliveryInput[] = []
				const digestPlans: Array<Omit<NewDigestMembership, "deliveryId"> & { dedupKey: string }> = []
				for (const pre of preIntents) {
					const ctx = recipients.get(pre.recipientClerkUserId)
					if (!ctx) continue
					const intent: NotificationIntent = { ...pre, locale: ctx.locale }
					for (const plan of planChannels(intent, ctx.prefs)) {
						const dedupKey = notificationDedupKey({
							eventId: event.id,
							recipientClerkUserId: intent.recipientClerkUserId,
							category: intent.category,
							channel: plan.channel,
							variant: intent.variant,
						})
						const digest = plan.cadence !== "immediate"
						deliveries.push({
							eventId: event.id,
							recipientClerkUserId: intent.recipientClerkUserId,
							channel: plan.channel,
							category: intent.category,
							notificationType: intent.type,
							variant: intent.variant,
							dedupKey,
							intent,
							cadence: plan.cadence,
							// Digest members are sent by the digest run, never claimed
							// individually — held with a sentinel next_attempt.
							...(digest ? { status: "deferred" as const, nextAttemptAt: DIGEST_HOLD_ISO } : {}),
						})
						if (digest) {
							digestPlans.push({
								recipientClerkUserId: intent.recipientClerkUserId,
								cadence: plan.cadence as "daily" | "weekly",
								category: intent.category,
								eventId: event.id,
								dedupKey,
							})
						}
					}
				}
				deliveriesCreated += await insertDeliveries(deliveries)
				if (digestPlans.length > 0) {
					// Link each membership to its delivery row (existing or fresh) so
					// the digest run can render from the persisted intent.
					const idByKey = await getDeliveryIdsByDedupKeys(digestPlans.map((p) => p.dedupKey))
					const memberships: NewDigestMembership[] = digestPlans.map((p) => ({
						recipientClerkUserId: p.recipientClerkUserId,
						cadence: p.cadence,
						category: p.category,
						eventId: p.eventId,
						deliveryId: idByKey.get(p.dedupKey) ?? null,
					}))
					membershipsCreated += await insertDigestMemberships(memberships)
				}
				count = deliveries.length
			}
			await markEventProcessed(event.id, count)
			eventsProcessed += 1
		} catch (err) {
			// One poisoned event must not stall the feed forever, but we also
			// never silently skip: leave it unprocessed for the next run and
			// surface the error. (Repeated failures show up in Sentry.)
			expansionErrors += 1
			reportError(err, { action: "notifications.expandPendingEvents" })
		}
	}

	return {
		eventsProcessed,
		deliveriesCreated,
		digestMembershipsCreated: membershipsCreated,
		expansionErrors,
	}
}

/**
 * Enqueue schedule-DERIVED reminder intents (offer/listing expiring, résumé
 * nudge, saved-search results). No events row exists — the dedup key is the
 * caller's stable identity for the reminder window, and every one of these
 * types is re-checked against real state at send time. Digest cadences
 * degrade to immediate here: the generating cron IS the schedule.
 */
export async function enqueueScheduleDerived(
	items: ReadonlyArray<{ readonly intent: PreIntent; readonly dedupBase: string }>,
): Promise<number> {
	if (items.length === 0) return 0
	const recipients = await resolveRecipients(items.map((i) => i.intent.recipientClerkUserId))
	const deliveries: NewDeliveryInput[] = []
	for (const { intent: pre, dedupBase } of items) {
		const ctx = recipients.get(pre.recipientClerkUserId)
		if (!ctx) continue
		const intent: NotificationIntent = { ...pre, locale: ctx.locale }
		for (const plan of planChannels(intent, ctx.prefs)) {
			deliveries.push({
				eventId: null,
				recipientClerkUserId: intent.recipientClerkUserId,
				channel: plan.channel,
				category: intent.category,
				notificationType: intent.type,
				variant: intent.variant,
				dedupKey: `${dedupBase}␟${plan.channel}`,
				intent,
				cadence: "immediate",
			})
		}
	}
	return insertDeliveries(deliveries)
}

/* --------------------------------------------------------------- phase 2 */

function isValidIntent(value: unknown): value is NotificationIntent {
	if (typeof value !== "object" || value === null) return false
	const v = value as Record<string, unknown>
	return (
		typeof v.recipientClerkUserId === "string" &&
		typeof v.type === "string" &&
		typeof v.category === "string" &&
		typeof v.titleKey === "string" &&
		typeof v.bodyKey === "string" &&
		typeof v.destinationPath === "string"
	)
}

async function sendViaChannel(
	delivery: DeliveryRow,
	intent: NotificationIntent,
	nowMs: number,
): Promise<ChannelSendResult & { readonly suppressed?: string }> {
	switch (delivery.channel) {
		case "in_app":
			return sendInApp(intent, delivery.dedup_key)
		case "email":
			return sendNotificationEmail(intent, delivery.dedup_key, nowMs)
		case "push":
			return sendPush(intent)
		default:
			return {
				ok: false,
				retryable: false,
				failureClass: "terminal",
				detail: `unknown channel ${String(delivery.channel)}`,
			}
	}
}

async function settleFailure(
	delivery: DeliveryRow,
	result: { failureClass?: string; detail?: string; retryable?: boolean },
	nowMs: number,
): Promise<void> {
	const failureClass = (result.failureClass ?? "terminal") as FailureClass
	if (result.retryable) {
		const nextAt = nextAttemptAtMs({
			attemptCount: delivery.attempt_count,
			failureClass,
			nowMs,
		})
		if (nextAt !== null) {
			await settleDelivery({
				id: delivery.id,
				status: "failed_retryable",
				failureClass,
				failureDetail: result.detail,
				nextAttemptAt: new Date(nextAt).toISOString(),
			})
			return
		}
		// Attempt budget exhausted → retained for investigation, never retried.
		await settleDelivery({
			id: delivery.id,
			status: "dead_letter",
			failureClass,
			failureDetail: `${result.detail ?? "failed"} (attempts=${delivery.attempt_count}/${MAX_DELIVERY_ATTEMPTS})`,
		})
		return
	}
	await settleDelivery({
		id: delivery.id,
		status: "failed_terminal",
		failureClass,
		failureDetail: result.detail,
	})
}

export interface DeliveryStats {
	readonly claimed: number
	readonly delivered: number
	readonly deferred: number
	readonly cancelled: number
	readonly suppressed: number
	readonly failed: number
}

/** Phase 2: claim due deliveries and push them through their channel. */
export async function processDueDeliveries(nowMs: number): Promise<DeliveryStats> {
	const workerId = `web-${randomUUID()}`
	const claimed = await claimDeliveries({ workerId, limit: CLAIM_BATCH })
	const stats = { claimed: claimed.length, delivered: 0, deferred: 0, cancelled: 0, suppressed: 0, failed: 0 }
	if (claimed.length === 0) return stats

	const recipients = await resolveRecipients(claimed.map((d) => d.recipient_clerk_user_id))

	for (const delivery of claimed) {
		try {
			const intent = delivery.intent
			if (!isValidIntent(intent)) {
				await settleDelivery({
					id: delivery.id,
					status: "dead_letter",
					failureClass: "terminal",
					failureDetail: "invalid persisted intent payload",
				})
				stats.failed += 1
				continue
			}

			// 1. Staleness re-check (offer/listing/résumé reality, intent expiry).
			const recheck = await recheckIntent(intent, nowMs)
			if (!recheck.actionable) {
				await settleDelivery({
					id: delivery.id,
					status: "cancelled",
					suppressionReason: recheck.reason,
				})
				stats.cancelled += 1
				continue
			}

			// 2. Burst collapse: a NEWER open delivery with the same collapse key
			// supersedes this one (latest state wins; the ledger records why).
			if (intent.collapseKey) {
				const open = await findOpenCollapsibleDeliveries({
					recipientClerkUserId: delivery.recipient_clerk_user_id,
					channel: delivery.channel,
					collapseKey: intent.collapseKey,
					excludeDeliveryId: delivery.id,
				})
				const newer = open.find((o) => o.created_at > delivery.created_at)
				if (newer) {
					await settleDelivery({
						id: delivery.id,
						status: "cancelled",
						suppressionReason: "collapsed into newer notification",
						collapsedIntoDeliveryId: newer.id,
					})
					stats.cancelled += 1
					continue
				}
			}

			const outbound = delivery.channel === "email" || delivery.channel === "push"
			if (outbound) {
				const ctx = recipients.get(delivery.recipient_clerk_user_id)

				// 3. Quiet hours (user-local, DST-safe). In-app is exempt: rows
				// simply sit unread. Nothing currently pierces quiet hours.
				if (ctx) {
					const quiet = evaluateQuietHours(ctx.prefs.quietHours, nowMs)
					if (quiet.quiet && quiet.resumeAtMs !== null) {
						await settleDelivery({
							id: delivery.id,
							status: "deferred",
							nextAttemptAt: new Date(quiet.resumeAtMs).toISOString(),
						})
						stats.deferred += 1
						continue
					}
				}

				// 4. Per-recipient outbound throttle (urgent reminders exempt —
				// a real imminent expiry beats the noise budget).
				if (!intent.urgent) {
					const recent = await countRecentOutboundDeliveries(
						delivery.recipient_clerk_user_id,
						new Date(nowMs - 3_600_000).toISOString(),
					)
					if (recent >= OUTBOUND_HOURLY_CAP) {
						await settleDelivery({
							id: delivery.id,
							status: "deferred",
							nextAttemptAt: new Date(nowMs + THROTTLE_DEFER_MS).toISOString(),
						})
						stats.deferred += 1
						continue
					}
				}
			}

			// 5. The actual send — outside any DB transaction; the lease covers us.
			const result = await sendViaChannel(delivery, intent, nowMs)
			if (result.ok) {
				await settleDelivery({
					id: delivery.id,
					status: "delivered",
					deliveredAt: new Date(nowMs).toISOString(),
					providerMessageId: result.providerMessageId,
				})
				stats.delivered += 1
			} else if (result.suppressed) {
				await settleDelivery({
					id: delivery.id,
					status: "suppressed",
					suppressionReason: result.suppressed,
				})
				stats.suppressed += 1
			} else {
				await settleFailure(delivery, result, nowMs)
				stats.failed += 1
			}
		} catch (err) {
			reportError(err, { action: "notifications.processDueDeliveries" })
			try {
				await settleFailure(
					delivery,
					{ failureClass: "transient", retryable: true, detail: "dispatcher exception" },
					nowMs,
				)
			} catch {
				// Lease expiry will return the row to the pool.
			}
			stats.failed += 1
		}
	}
	return stats
}

/** One full dispatcher pass: expansion then delivery. Safe to run concurrently. */
export async function runDispatchOnce(): Promise<{
	expansion: ExpansionStats
	delivery: DeliveryStats
}> {
	const expansion = await expandPendingEvents()
	const delivery = await processDueDeliveries(Date.now())
	return { expansion, delivery }
}

/**
 * Fire-and-forget dispatch trigger for server actions (via next/server
 * `after()`): a freshly recorded event is expanded and delivered within the
 * same request lifecycle instead of waiting for the sweeper cron. Never
 * throws — the cron picks up anything this misses.
 */
export async function triggerDispatch(): Promise<void> {
	try {
		await runDispatchOnce()
	} catch (err) {
		reportError(err, { action: "notifications.triggerDispatch" })
	}
}
