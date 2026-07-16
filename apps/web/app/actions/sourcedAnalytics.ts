"use server"

import { recordEvent } from "@explore-and-earn/db"

import { isUuid } from "../../lib/ids"
import { checkRateLimit } from "../../lib/rateLimit"

/**
 * Sourced-inventory product analytics — outbound source clicks.
 *
 * Best-effort and privacy-safe: records ONLY the listing id + event; no user
 * identity, no free text, no PII. Rate-limited per listing so the endpoint
 * can't flood the events log. recordEvent never throws.
 */
export async function recordSourceClickAction(listingId: string): Promise<void> {
	if (!isUuid(listingId)) return
	const { allowed } = checkRateLimit(`source-click:${listingId}`, 240, 60 * 1000)
	if (!allowed) return
	await recordEvent({
		eventType: "sourced_listing_source_clicked",
		subjectType: "listing",
		subjectId: listingId,
		listingId,
		sourceSurface: "listing_detail",
	})
}
