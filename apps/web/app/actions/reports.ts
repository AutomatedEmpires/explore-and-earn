"use server";

import { auth } from "@clerk/nextjs/server"
import { insertReport, type ReportReason } from "@explore-and-earn/db"

import { checkRateLimit } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

export interface SubmitReportResult {
	readonly ok: boolean
	readonly error?: string
}

async function submitReportActionImpl(
	listingId: string,
	reason: string,
	detail?: string,
): Promise<SubmitReportResult> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	// 5 reports per user per hour — abuse defence.
	const { allowed } = checkRateLimit(`report:${userId}`, 5, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	if (!listingId) {
		return { ok: false, error: "Missing listing ID." }
	}

	const token = await getToken({ template: "supabase" })
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await insertReport(token, {
		reporterId: userId,
		listingId,
		reason: reason as ReportReason,
		detail,
	})

	if (!result.ok) {
		return { ok: false, error: result.error }
	}

	return { ok: true }
}

/**
 * Server action: submit a listing report from the authenticated seeker.
 *
 * `listingId` is the ID of the listing being reported.
 * `reason`    must be one of the locked ReportReason values.
 * `detail`    is an optional free-text elaboration (may be undefined).
 *
 * userId always comes from auth().userId — never from the client.
 */
export async function submitReportAction(
	listingId: string,
	reason: string,
	detail?: string,
): Promise<SubmitReportResult> {
	try {
		return await submitReportActionImpl(listingId, reason, detail)
	} catch (error) {
		reportError(error, {
			action: "submitReportAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "An unexpected error occurred. Please try again." }
	}
}
