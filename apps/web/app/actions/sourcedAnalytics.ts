"use server"

import { headers } from "next/headers"

import { recordEvent } from "@explore-and-earn/db"

import { isUuid } from "../../lib/ids"
import { checkRateLimitDistributed } from "../../lib/rateLimit"

/**
 * Sourced-inventory product analytics — outbound source clicks.
 *
 * Best-effort and privacy-safe: records ONLY the listing id + event; no user
 * identity, no free text, no PII. This is the one UNAUTHENTICATED mutating
 * action, so it is double-limited (review 2026-07-22): per caller IP (so one
 * client can't flood the events log or drain a listing's shared budget) AND
 * per listing (the original aggregate cap). The IP key prefers the
 * platform-set x-real-ip — same trust model as lib/publicApi.ts clientIp().
 * The IP is used only as a rate-limit bucket key; it is never recorded.
 * recordEvent never throws.
 */
export async function recordSourceClickAction(listingId: string): Promise<void> {
	if (!isUuid(listingId)) return
	const requestHeaders = await headers()
	const ip =
		requestHeaders.get("x-real-ip")?.trim() ||
		requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		"unknown"
	const perIp = await checkRateLimitDistributed(`source-click-ip:${ip}`, 30, 60 * 1000)
	if (!perIp.allowed) return
	const { allowed } = await checkRateLimitDistributed(`source-click:${listingId}`, 240, 60 * 1000)
	if (!allowed) return
	await recordEvent({
		eventType: "sourced_listing_source_clicked",
		subjectType: "listing",
		subjectId: listingId,
		listingId,
		sourceSurface: "listing_detail",
	})
}
