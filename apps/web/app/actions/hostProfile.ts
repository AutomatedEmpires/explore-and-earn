"use server"

import { auth } from "@clerk/nextjs/server"
import { createHostProfile, updateHostProfileDetails, type SocialLinks } from "@explore-and-earn/db"
import { revalidatePath, revalidateTag } from "next/cache"

import { HOST_PROFILES_CACHE_TAG } from "../../lib/serverCache"
import { reportError } from "../../lib/sentry"

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

function isAllowedStorageUrl(url: string | undefined | null): boolean {
	if (!url) return true;
	try {
		const { protocol, hostname, pathname } = new URL(url);
		return (
			protocol === "https:" &&
			hostname.endsWith(".supabase.co") &&
			pathname.startsWith("/storage/v1/object/")
		);
	} catch {
		return false;
	}
}

/**
 * Server action: create a host profile for the authenticated user.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase-compatible JWT
 * is minted via Clerk's native Supabase integration and handed to the db layer,
 * along with the verified `userId` used as the app-level ownership scope.
 */
async function createHostProfileActionImpl(
	companyName: string,
): Promise<{ ok: boolean; error?: string }> {
	const trimmed = companyName.trim()
	if (!trimmed) {
		return { ok: false, error: "name_required" }
	}

	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await createHostProfile(token, userId, trimmed)
	if (!result.ok) {
		return { ok: false, error: "create_failed" }
	}

	revalidatePath("/host")
	return { ok: true }
}

export async function createHostProfileAction(
	companyName: string,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await createHostProfileActionImpl(companyName)
	} catch (error) {
		reportError(error, {
			action: "createHostProfileAction",
			userId: await currentUserId(),
		})
		throw error
	}
}

/** Editable host profile fields submitted from the host profile edit form. */
export interface UpdateHostProfileInput {
	companyName?: string
	hostName?: string | null
	tagline?: string | null
	about?: string | null
	primaryLocationName?: string | null
	websiteUrl?: string | null
	photoUrl?: string | null
	socialLinks?: SocialLinks
	housingOfferedGenerally?: boolean
	mealsOfferedGenerally?: boolean
	categoryScopes?: string[]
}

/**
 * Server action: update the authenticated host's profile details.
 *
 * Writes company_name, about, primary_location_name, website_url, and photo_url
 * to the caller's own `host_profiles` row (scoped by the verified `auth().userId`
 * in the db layer). Follows the same auth pattern as the other server actions:
 * `auth()` -> `getToken()` -> db call -> revalidate.
 */
async function updateHostProfileActionImpl(
	fields: UpdateHostProfileInput,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	if (!isAllowedStorageUrl(fields.photoUrl)) {
		return { ok: false, error: "invalid_photo_url" }
	}

	const result = await updateHostProfileDetails(token, userId, fields)
	if (!result.ok) {
		return { ok: false, error: result.error ?? "update_failed" }
	}

	revalidatePath("/host/profile")
	revalidatePath("/host/profile/edit")
	// Bust the cached public host profile (/host/[id]) so edits show immediately.
	revalidateTag(HOST_PROFILES_CACHE_TAG)
	return { ok: true }
}

export async function updateHostProfileAction(
	fields: UpdateHostProfileInput,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await updateHostProfileActionImpl(fields)
	} catch (error) {
		reportError(error, {
			action: "updateHostProfileAction",
			userId: await currentUserId(),
		})
		throw error
	}
}
