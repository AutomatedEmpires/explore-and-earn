import "server-only"

import type { NotificationIntent } from "@explore-and-earn/contracts"
import {
	cancelDigestMemberships,
	claimDigestDelivery,
	collapseDeliveriesInto,
	getDeliveryByDedupKey,
	getEnginePrefsMap,
	getExpiringLiveListings,
	getExpiringOfferedApplications,
	getQueuedDigestMemberships,
	getResumeCompletionByProfileId,
	getResumeNudgeCandidates,
	adminHostClerkId,
	adminListingContext,
	adminSeekerClerkId,
	insertDeliveries,
	isEmailSuppressed,
	markDigestMembershipsSent,
	settleDelivery,
	type QueuedDigestMembership,
} from "@explore-and-earn/db"

import { absoluteUrl, sendEmail } from "../../lib/email"
import { escapeHtml, renderEmailLayout } from "../../lib/emails/layout"
import { getClerkContact } from "../../lib/clerkUser"
import { reportError } from "../../lib/sentry"
import { enqueueScheduleDerived } from "./dispatcher"
import { resolveEngineStage, stageGateForSend } from "./stage"
import { resolvePrefs } from "./prefs"
import { localizedPath, renderMessage } from "./render"
import type { PreIntent } from "./taxonomy"
import { createUnsubscribeToken } from "./unsubscribe"
import { buildListUnsubscribeHeaders } from "./unsubscribeHeaders"

/**
 * Digest windows + schedule-derived reminders. Runs from the digests cron
 * (hourly): each recipient's digest goes out in THEIR morning (08:00 local,
 * IANA-timezone-aware; missing timezone → UTC), weekly digests on their
 * Monday morning. Idempotent per (recipient, cadence, window) via the digest
 * delivery's dedup key — reruns and crash-recovery never double-send.
 */

const DIGEST_SEND_HOUR = 8
const DIGEST_MAX_ITEMS = 10
/** Résumé nudges repeat at most once per this many days. */
const RESUME_NUDGE_COOLDOWN_DAYS = 14

interface LocalNow {
	readonly ymd: string
	/** 1 = Monday … 7 = Sunday (ISO). */
	readonly isoDow: number
	readonly hour: number
}

/** Wall-clock now in an IANA zone; invalid/missing zones resolve as UTC. */
export function localNow(timezone: string | null, nowMs: number): LocalNow {
	let zone = "UTC"
	if (timezone) {
		try {
			new Intl.DateTimeFormat("en-US", { timeZone: timezone })
			zone = timezone
		} catch {
			zone = "UTC"
		}
	}
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: zone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
		weekday: "short",
	}).formatToParts(new Date(nowMs))
	const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
	const dowMap: Record<string, number> = {
		Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
	}
	return {
		ymd: `${get("year")}-${get("month")}-${get("day")}`,
		isoDow: dowMap[get("weekday")] ?? 1,
		hour: Number(get("hour")) || 0,
	}
}

/**
 * The recipient-local window key when a digest is currently due, else null.
 * Daily: from 08:00 local, keyed by local date. Weekly: Mondays from 08:00
 * local, keyed by that Monday's date.
 */
export function dueWindowKey(
	cadence: "daily" | "weekly",
	timezone: string | null,
	nowMs: number,
): string | null {
	const local = localNow(timezone, nowMs)
	if (local.hour < DIGEST_SEND_HOUR) return null
	if (cadence === "weekly" && local.isoDow !== 1) return null
	return local.ymd
}

interface DigestItem {
	readonly membershipId: string
	readonly deliveryId: string | null
	readonly intent: NotificationIntent | null
}

async function sendDigestForRecipient(args: {
	readonly recipientClerkUserId: string
	readonly cadence: "daily" | "weekly"
	readonly windowKey: string
	readonly locale: string
	readonly items: readonly DigestItem[]
	readonly nowMs: number
}): Promise<"sent" | "skipped" | "failed"> {
	const { recipientClerkUserId, cadence, windowKey, locale, items, nowMs } = args
	const dedupKey = `digest␟${recipientClerkUserId}␟${cadence}␟${windowKey}␟email`

	// Idempotent window claim: create (or find) THE digest delivery row.
	await insertDeliveries([
		{
			eventId: null,
			recipientClerkUserId,
			channel: "email",
			category: "matches", // ledger bucket; digest spans categories
			notificationType: "digest",
			variant: cadence,
			dedupKey,
			intent: {
				sourceEventId: "",
				sourceOccurredAt: new Date(nowMs).toISOString(),
				recipientClerkUserId,
				category: "matches",
				type: "new_strong_match", // placeholder shape; digest renders itself
				variant: cadence,
				locale,
				destinationPath: "/notifications",
				titleKey: `Notifications.digest.subject.${cadence}`,
				bodyKey: `Notifications.digest.subject.${cadence}`,
				values: { count: items.length },
				urgent: false,
			},
			cadence: "immediate",
			// Held: the digest run itself sends; phase 2 never claims it.
			status: "deferred",
			nextAttemptAt: "9999-01-01T00:00:00.000Z",
		},
	])
	const digestRow = await getDeliveryByDedupKey(dedupKey)
	if (!digestRow) return "failed"
	if (
		digestRow.status === "delivered" ||
		digestRow.status === "suppressed" ||
		digestRow.status === "cancelled"
	) {
		// Another run already handled this window; release any stragglers.
		await markDigestMembershipsSent(items.map((i) => i.membershipId), digestRow.id)
		return "skipped"
	}

	// ATOMIC window claim: exactly one concurrent digest run may proceed past
	// this point (overlapping hourly runs / manual re-triggers otherwise both
	// see the held row and double-send). Crashed runs are reclaimable after
	// the lease expires.
	const claimed = await claimDigestDelivery(digestRow.id)
	if (!claimed) return "skipped"

	const contact = await getClerkContact(recipientClerkUserId)
	if (!contact.email) return "failed" // retried next run; memberships stay queued
	if (await isEmailSuppressed(contact.email)) {
		await settleDelivery({
			id: digestRow.id,
			status: "suppressed",
			suppressionReason: "email_suppressed",
		})
		await markDigestMembershipsSent(items.map((i) => i.membershipId), digestRow.id)
		return "skipped"
	}

	const rendered = await Promise.all(
		items.slice(0, DIGEST_MAX_ITEMS).map(async (item) => {
			if (!item.intent) return null
			const title = await renderMessage(
				locale,
				item.intent.titleKey,
				item.intent.values ?? {},
			)
			const href = absoluteUrl(localizedPath(locale, item.intent.destinationPath))
			return { title, href }
		}),
	)
	const lines = rendered.filter(
		(r): r is { title: string; href: string } => r !== null,
	)
	if (lines.length === 0) {
		// Nothing renderable — close the window without an empty email.
		await settleDelivery({
			id: digestRow.id,
			status: "cancelled",
			suppressionReason: "no renderable digest items",
		})
		await markDigestMembershipsSent(items.map((i) => i.membershipId), digestRow.id)
		return "skipped"
	}

	const remaining = items.length - lines.length
	const [subject, heading, moreLabel, ctaLabel, footerNote, unsubscribeLabel] =
		await Promise.all([
			renderMessage(locale, `Notifications.digest.subject.${cadence}`, { count: items.length }),
			renderMessage(locale, `Notifications.digest.heading.${cadence}`, { count: items.length }),
			renderMessage(locale, "Notifications.digest.more", { count: remaining }),
			renderMessage(locale, "Notifications.digest.cta", {}),
			renderMessage(locale, "Notifications.email.footerNote", {}),
			renderMessage(locale, "Notifications.email.unsubscribe", {}),
		])

	const token = createUnsubscribeToken({ clerkUserId: recipientClerkUserId, scope: "all", nowMs })
	const unsubscribeUrl = token
		? absoluteUrl(`/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`)
		: null
	const unsubscribeHeaders = buildListUnsubscribeHeaders(unsubscribeUrl)

	const listHtml = `<ul style="margin:0;padding-left:20px;">${lines
		.map(
			(l) =>
				`<li style="margin:0 0 8px;"><a href="${escapeHtml(l.href)}" style="color:inherit;">${escapeHtml(l.title)}</a></li>`,
		)
		.join("")}</ul>${remaining > 0 ? `<p style="margin:12px 0 0;">${escapeHtml(moreLabel)}</p>` : ""}`

	const footerHtml = unsubscribeUrl
		? `${escapeHtml(footerNote)} <a href="${escapeHtml(unsubscribeUrl)}" style="color:inherit;">${escapeHtml(unsubscribeLabel)}</a>`
		: escapeHtml(footerNote)

	const result = await sendEmail({
		to: contact.email,
		subject,
		html: renderEmailLayout({
			heading,
			bodyHtml: listHtml,
			ctaLabel,
			ctaUrl: absoluteUrl(localizedPath(locale, "/notifications")),
			footerHtml,
			lang: locale,
		}),
		text: `${heading}\n\n${lines.map((l) => `- ${l.title}: ${l.href}`).join("\n")}${
			remaining > 0 ? `\n${moreLabel}` : ""
		}${unsubscribeUrl ? `\n\n${unsubscribeLabel}: ${unsubscribeUrl}` : ""}`,
		template: `engine:digest:${cadence}`,
		idempotencyKey: dedupKey,
		...(unsubscribeHeaders ? { headers: unsubscribeHeaders } : {}),
	})

	if (!result.ok) return "failed" // memberships stay queued; retried next run

	await settleDelivery({
		id: digestRow.id,
		status: "delivered",
		deliveredAt: new Date(nowMs).toISOString(),
		providerMessageId: result.providerMessageId,
	})
	await markDigestMembershipsSent(items.map((i) => i.membershipId), digestRow.id)
	await collapseDeliveriesInto(
		items.map((i) => i.deliveryId).filter((id): id is string => Boolean(id)),
		digestRow.id,
	)
	return "sent"
}

export interface DigestRunStats {
	readonly recipientsDue: number
	readonly digestsSent: number
	readonly digestsSkipped: number
	readonly digestsFailed: number
}

/** Send all due digests for one cadence. */
export async function runDigests(
	cadence: "daily" | "weekly",
	nowMs: number,
): Promise<DigestRunStats> {
	// Stage gate: digests EMAIL, so below internal_preview nothing runs — and
	// crucially the queued memberships are left untouched (windows are only
	// consumed for recipients the stage allows), so raising the stage later
	// resumes digests without losing anything.
	const stage = resolveEngineStage()
	if (stage === "disabled" || stage === "ledger_only" || stage === "dry_run") {
		return { recipientsDue: 0, digestsSent: 0, digestsSkipped: 0, digestsFailed: 0 }
	}
	const memberships = await getQueuedDigestMemberships(cadence)
	const byRecipient = new Map<string, QueuedDigestMembership[]>()
	for (const m of memberships) {
		const list = byRecipient.get(m.recipient_clerk_user_id) ?? []
		list.push(m)
		byRecipient.set(m.recipient_clerk_user_id, list)
	}
	const stats = { recipientsDue: 0, digestsSent: 0, digestsSkipped: 0, digestsFailed: 0 }
	if (byRecipient.size === 0) return stats

	const prefsMap = await getEnginePrefsMap([...byRecipient.keys()])
	for (const [recipient, allRows] of byRecipient) {
		// Per-recipient stage gate (internal_preview/limited): gated recipients
		// are skipped entirely — memberships stay queued, windows unconsumed.
		if (!stageGateForSend(stage, recipient).send) continue
		const prefsRow = prefsMap.get(recipient) ?? null
		const windowKey = dueWindowKey(cadence, prefsRow?.timezone ?? null, nowMs)
		if (!windowKey) continue
		stats.recipientsDue += 1

		// CONSENT RE-CHECK at send time: memberships can queue for days —
		// categories (or email entirely) the user has since turned off are
		// cancelled here, never sent. resolvePrefs on the CURRENT row.
		const currentPrefs = resolvePrefs(prefsRow)
		const withdrawn: string[] = []
		const rows: QueuedDigestMembership[] = []
		for (const row of allRows) {
			const category = row.category as keyof typeof currentPrefs.categories
			const categoryPrefs = currentPrefs.categories[category]
			const consented =
				currentPrefs.emailEnabled && categoryPrefs !== undefined && categoryPrefs.email !== "off"
			if (consented) rows.push(row)
			else withdrawn.push(row.id)
		}
		if (withdrawn.length > 0) {
			await cancelDigestMemberships(withdrawn).catch((err) =>
				reportError(err, { action: "notifications.runDigests.cancelWithdrawn" }),
			)
		}
		if (rows.length === 0) continue

		try {
			const outcome = await sendDigestForRecipient({
				recipientClerkUserId: recipient,
				cadence,
				windowKey,
				locale: prefsRow?.locale ?? "en",
				items: rows.map((r): DigestItem => {
					const intent = r.delivery?.intent
					return {
						membershipId: r.id,
						deliveryId: r.delivery_id,
						intent:
							intent && typeof intent === "object" && "titleKey" in intent
								? (intent as NotificationIntent)
								: null,
					}
				}),
				nowMs,
			})
			if (outcome === "sent") stats.digestsSent += 1
			else if (outcome === "skipped") stats.digestsSkipped += 1
			else stats.digestsFailed += 1
		} catch (err) {
			stats.digestsFailed += 1
			reportError(err, { action: "notifications.runDigests" })
		}
	}
	return stats
}

/* ------------------------------------------- schedule-derived reminders */

function reminderKeys(type: string): { titleKey: string; bodyKey: string } {
	return {
		titleKey: `Notifications.types.${type}.title`,
		bodyKey: `Notifications.types.${type}.body`,
	}
}

export interface ReminderStats {
	readonly offerReminders: number
	readonly listingReminders: number
	readonly resumeNudges: number
}

/**
 * Enqueue reminders derived from REAL current state — each re-checked again
 * at send time (recheck.ts) and idempotent per entity/window.
 */
export async function enqueueScheduledReminders(nowMs: number): Promise<ReminderStats> {
	const stats = { offerReminders: 0, listingReminders: 0, resumeNudges: 0 }
	// Stage gate: 'disabled' derives nothing (no table access). Other stages
	// enqueue so the ledger shows what WOULD remind; the delivery gate rules.
	if (resolveEngineStage() === "disabled") return stats
	const nowIso = new Date(nowMs).toISOString()

	// Offers (applications at status='offered') expiring within 48h — urgent.
	const offers = await getExpiringOfferedApplications(48)
	const offerItems: Array<{ intent: PreIntent; dedupBase: string }> = []
	for (const offer of offers) {
		const [seekerClerk, listing] = await Promise.all([
			adminSeekerClerkId(offer.seeker_profile_id),
			adminListingContext(offer.listing_id),
		])
		if (!seekerClerk) continue
		offerItems.push({
			dedupBase: `offer_expiring␟${offer.id}`,
			intent: {
				sourceEventId: "",
				sourceOccurredAt: nowIso,
				recipientClerkUserId: seekerClerk,
				category: "offers_invites",
				type: "offer_expiring",
				variant: "default",
				destinationPath: "/offered",
				...reminderKeys("offer_expiring"),
				values: {
					listingTitle: listing?.title ?? "",
					// ceil: "within N hours" must never OVERSTATE remaining time —
					// an offer 5 minutes from expiry says "within 1 hour", never
					// "about 1 hour" of imagined slack.
					hoursLeft: Math.max(1, Math.ceil((Date.parse(offer.expires_at) - nowMs) / 3_600_000)),
				},
				entity: { type: "application", id: offer.id },
				expiresAt: offer.expires_at,
				urgent: true,
			},
		})
	}
	stats.offerReminders = await enqueueScheduleDerived(offerItems)

	// Live listings expiring within 7 days → their host.
	const listings = await getExpiringLiveListings(7)
	const listingItems: Array<{ intent: PreIntent; dedupBase: string }> = []
	for (const listing of listings) {
		const hostClerk = await adminHostClerkId(listing.host_profile_id)
		if (!hostClerk) continue
		listingItems.push({
			// Keyed by expiry date: extending the listing starts a fresh cycle.
			dedupBase: `listing_expiring␟${listing.id}␟${listing.expires_at.slice(0, 10)}`,
			intent: {
				sourceEventId: "",
				sourceOccurredAt: nowIso,
				recipientClerkUserId: hostClerk,
				category: "listing_lifecycle",
				type: "listing_expiring",
				variant: "default",
				destinationPath: `/host/listings/${listing.id}`,
				...reminderKeys("listing_expiring"),
				values: {
					listingTitle: listing.title,
					daysLeft: Math.max(1, Math.ceil((Date.parse(listing.expires_at) - nowMs) / 86_400_000)),
				},
				entity: { type: "listing", id: listing.id },
				expiresAt: listing.expires_at,
				urgent: false,
			},
		})
	}
	stats.listingReminders = await enqueueScheduleDerived(listingItems)

	// Résumé nudges: genuinely incomplete only, 14-day cooldown via the
	// period-keyed dedup, opt-out via the account_progress category prefs.
	const period = Math.floor(nowMs / 86_400_000 / RESUME_NUDGE_COOLDOWN_DAYS)
	const candidates = await getResumeNudgeCandidates()
	const nudgeItems: Array<{ intent: PreIntent; dedupBase: string }> = []
	for (const candidate of candidates) {
		const status = await getResumeCompletionByProfileId(candidate.seekerProfileId)
		if (!status || status.complete) continue
		nudgeItems.push({
			dedupBase: `resume_nudge␟${candidate.clerkUserId}␟${period}`,
			intent: {
				sourceEventId: "",
				sourceOccurredAt: nowIso,
				recipientClerkUserId: candidate.clerkUserId,
				category: "account_progress",
				type: "resume_nudge",
				variant: "default",
				destinationPath: "/resume",
				...reminderKeys("resume_nudge"),
				values: { completion: status.completion },
				entity: { type: "seeker_profile", id: candidate.seekerProfileId },
				urgent: false,
			},
		})
	}
	stats.resumeNudges = await enqueueScheduleDerived(nudgeItems)

	return stats
}
