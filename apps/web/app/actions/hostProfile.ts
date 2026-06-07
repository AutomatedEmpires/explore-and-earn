"use server"

import { auth } from "@clerk/nextjs/server"
import { createHostProfile, updateHostProfileDetails } from "@explore-and-earn/db"
import { revalidatePath } from "next/cache"

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
 * is minted via the "supabase" Clerk JWT template and handed to the db layer,
 * along with the verified `userId` used as the app-level ownership scope.
 */
export async function createHostProfileAction(
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

	const token = await getToken({ template: "supabase" })
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

/** Editable host profile fields submitted from the host profile edit form. */
export interface UpdateHostProfileInput {
	companyName?: string
	about?: string | null
	primaryLocationName?: string | null
	websiteUrl?: string | null
	photoUrl?: string | null
}

/**
 * Server action: update the authenticated host's profile details.
 *
 * Writes company_name, about, primary_location_name, website_url, and photo_url
 * to the caller's own `host_profiles` row (scoped by the verified `auth().userId`
 * in the db layer). Follows the same auth pattern as the other server actions:
 * `auth()` -> `getToken({ template: "supabase" })` -> db call -> revalidate.
 */
export async function updateHostProfileAction(
	fields: UpdateHostProfileInput,
): Promise<{ ok: boolean; error?: string }> {
	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken({ template: "supabase" })
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
	return { ok: true }
}
