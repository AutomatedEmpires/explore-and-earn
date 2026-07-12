"use server"

import { auth } from "@clerk/nextjs/server"
import {
	applyToListing,
	getListingHostContact,
	getSeekerApplicationIds,
	withdrawApplication,
	type ApplyResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { computeAndStoreMatchForApplication } from "../../services/matching"

import { getClerkContact } from "../../lib/clerkUser"
import { absoluteUrl, sendEmail } from "../../lib/email"
import { applicationReceivedEmail } from "../../lib/emails"
import { checkRateLimit } from "../../lib/rateLimit"
import { reportError } from "../../lib/sentry"

async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

async function applyToListingActionImpl(
	listingId: string,
	coverMessage?: string,
): Promise<ApplyResult> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const { allowed } = checkRateLimit(`apply:${userId}`, 5, 60 * 60 * 1000)
	if (!allowed) {
		return { ok: false, error: "rate_limit_exceeded" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await applyToListing(token, userId, listingId, coverMessage)

	if (result.error === "cannot_apply_to_own_listing") {
		return { ok: false, error: "You cannot apply to your own listing." }
	}

	if (result.ok) {
		try {
			const listingContact = await getListingHostContact(token, listingId)
			if (listingContact?.hostClerkUserId) {
				const [hostContact, seekerContact] = await Promise.all([
					getClerkContact(listingContact.hostClerkUserId),
					getClerkContact(userId),
				])
				if (hostContact.email) {
					const seekerName = seekerContact.name ?? "A seeker"
					const listingTitle = listingContact.listingTitle || "your listing"
					await sendEmail({
						to: hostContact.email,
						subject: `${seekerName} applied to ${listingTitle}`,
						html: applicationReceivedEmail({
							seekerName,
							listingTitle,
							reviewUrl: absoluteUrl("/host/applicants"),
						}),
						template: "applicationReceived",
					})
				}
			}
		} catch (error) {
			console.error("[email] application notification failed:", error)
		}

		// Populate the ADR-040 match score for this applicant×listing pair AFTER
		// the response is sent, so the host's applicant ranking has real fit without
		// slowing the apply. Best-effort: a scoring failure never affects the apply.
		after(async () => {
			try {
				await computeAndStoreMatchForApplication(userId, listingId)
			} catch (error) {
				reportError(error, { action: "computeAndStoreMatchForApplication", userId })
			}
		})
	}

	revalidatePath(`/listing/${listingId}`)
	return result
}

export async function applyToListingAction(
	listingId: string,
	coverMessage?: string,
): Promise<ApplyResult> {
	try {
		return await applyToListingActionImpl(listingId, coverMessage)
	} catch (error) {
		reportError(error, {
			action: "applyToListingAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

async function getSeekerApplicationIdsActionImpl(): Promise<string[]> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return []
	}

	const token = await getToken()
	if (!token) {
		return []
	}

	return getSeekerApplicationIds(token, userId)
}

export async function getSeekerApplicationIdsAction(): Promise<string[]> {
	try {
		return await getSeekerApplicationIdsActionImpl()
	} catch (error) {
		reportError(error, {
			action: "getSeekerApplicationIdsAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

async function withdrawApplicationActionImpl(
	applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await withdrawApplication(token, userId, applicationId)
	if (result.ok) {
		revalidatePath("/applied")
	}
	return result
}

export async function withdrawApplicationAction(
	applicationId: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await withdrawApplicationActionImpl(applicationId)
	} catch (error) {
		reportError(error, {
			action: "withdrawApplicationAction",
			userId: await currentUserId(),
		})
		throw error
	}
}
