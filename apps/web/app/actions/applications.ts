"use server"

import { auth } from "@clerk/nextjs/server"
import {
	applyToListing,
	getSeekerApplicationIds,
	recordEvent,
	withdrawApplication,
	type ApplyResult,
} from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { computeAndStoreMatchForApplication } from "../../services/matching"
import { triggerDispatch } from "../../services/notifications/dispatcher"

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
		// Persist the domain event FIRST (append-only events log) — the
		// notification engine derives the host's in-app/email/push notification
		// from this real event with the host's preferences, quiet hours, and
		// unsubscribe honored (replaces the previous inline one-off email).
		await recordEvent({
			eventType: "application_submitted",
			actorScope: "seeker",
			subjectType: "application",
			subjectId: result.applicationId,
			listingId,
			seekerProfileId: result.seekerProfileId,
			sourceSurface: "apply_action",
			...(result.reactivated ? { properties: { reactivated: true } } : {}),
		})
		after(triggerDispatch)

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
		// Real withdrawal event → host notification via the engine (previously
		// hosts were never notified of withdrawals at all).
		await recordEvent({
			eventType: "application_withdrawn",
			actorScope: "seeker",
			subjectType: "application",
			subjectId: applicationId,
			sourceSurface: "withdraw_action",
		})
		after(triggerDispatch)
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
