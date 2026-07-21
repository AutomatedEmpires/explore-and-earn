"use server"

import { randomUUID } from "node:crypto"
import { auth } from "@clerk/nextjs/server"
import {
	createHostProfile,
	deleteTrustedListingMedia,
	getHostProfile,
	setMyHousingLibraryPhoto,
	updateHostProfileDetails,
	uploadTrustedListingMedia,
	type SocialLinks,
} from "@explore-and-earn/db"
import {
	HOUSING_PHOTO_ROLES,
	MARKETPLACE_LANES,
	sanitizeHostBenefitLibrary,
	type HostBenefitLibrary,
	type HousingPhotoRole,
	type MarketplaceLane,
} from "@explore-and-earn/contracts"
import { revalidatePath, revalidateTag } from "next/cache"

import {
	HOST_PROFILES_CACHE_TAG,
	LISTINGS_CACHE_TAG,
} from "../../lib/serverCache"
import { reportError } from "../../lib/sentry"
import { isAllowedStorageUrl } from "../../lib/storageUrl"
import { prepareUploadImage } from "../../services/media"
import {
	guardTrustedUploadSlot,
	hasTrustedUploadBudget,
} from "../../services/media/trustedUploadGuard"

/** Best-effort current Clerk user id for error attribution (catch paths only). */
async function currentUserId(): Promise<string | undefined> {
	try {
		return (await auth()).userId ?? undefined
	} catch {
		return undefined
	}
}

function isOwnedHousingLibrary(
	library: HostBenefitLibrary,
	hostProfileId: string,
): boolean {
	const photos = library.housing?.photos ?? {};
	for (const role of HOUSING_PHOTO_ROLES) {
		const url = photos[role];
		if (!url) continue;
		if (!isAllowedStorageUrl(url)) return false;
		try {
			const marker = "/storage/v1/object/public/listing-media/";
			const path = new URL(url).pathname.split(marker)[1];
			if (!path?.startsWith(`${hostProfileId}/library/housing/${role}/`)) {
				return false;
			}
		} catch {
			return false;
		}
	}
	return true;
}

function ownedHousingLibraryObjectPath(
	url: string | undefined,
	hostProfileId: string,
	role: HousingPhotoRole,
): string | null {
	if (!url || !isAllowedStorageUrl(url)) return null
	try {
		const marker = "/storage/v1/object/public/listing-media/"
		const encodedPath = new URL(url).pathname.split(marker)[1]
		if (!encodedPath) return null
		const path = decodeURIComponent(encodedPath)
		const prefix = `${hostProfileId}/library/housing/${role}/`
		const filename = path.slice(prefix.length)
		if (!path.startsWith(prefix) || !/^[A-Za-z0-9._-]+$/.test(filename)) {
			return null
		}
		return path
	} catch {
		return null
	}
}

async function cleanupReplacedHousingPhotos(
	previous: HostBenefitLibrary,
	next: HostBenefitLibrary,
	hostProfileId: string,
	userId: string,
): Promise<void> {
	for (const role of HOUSING_PHOTO_ROLES) {
		const previousUrl = previous.housing?.photos?.[role]
		if (!previousUrl || previousUrl === next.housing?.photos?.[role]) continue
		const path = ownedHousingLibraryObjectPath(previousUrl, hostProfileId, role)
		if (!path) continue
		try {
			await deleteTrustedListingMedia(path)
		} catch (error) {
			reportError(error, {
				action: `cleanupReplacedHousingPhoto:${role}`,
				userId,
			})
		}
	}
}

/**
 * Server action: create a host profile for the authenticated user.
 *
 * Auth is enforced here (Clerk) before any DB work; the Supabase-compatible JWT
 * is minted via Clerk's native Supabase integration and handed to migration
 * 073's narrow RPC. The RPC derives identity from the JWT; the client cannot
 * choose a Clerk id, trust state, subscription tier, or lifecycle field.
 */
export interface CreateHostProfileActionInput {
	readonly companyName: string
	readonly categoryScopes: readonly MarketplaceLane[]
	readonly primaryLocationName?: string | null
}

const HOST_COMPANY_NAME_MAX = 160
const HOST_LOCATION_NAME_MAX = 200

async function createHostProfileActionImpl(
	input: CreateHostProfileActionInput,
): Promise<{ ok: boolean; error?: string }> {
	const companyName =
		typeof input?.companyName === "string" ? input.companyName.trim() : ""
	if (!companyName) {
		return { ok: false, error: "name_required" }
	}
	if (companyName.length > HOST_COMPANY_NAME_MAX) {
		return { ok: false, error: "name_too_long" }
	}

	const allowedCategories = new Set<string>(MARKETPLACE_LANES)
	const categoryScopes = Array.from(
		new Set(
			(Array.isArray(input?.categoryScopes) ? input.categoryScopes : []).filter(
				(value): value is MarketplaceLane =>
					typeof value === "string" && allowedCategories.has(value),
			),
		),
	)
	if (categoryScopes.length === 0) {
		return { ok: false, error: "lanes_required" }
	}

	const primaryLocationName =
		typeof input?.primaryLocationName === "string"
			? input.primaryLocationName.trim() || null
			: null
	if (
		primaryLocationName !== null &&
		primaryLocationName.length > HOST_LOCATION_NAME_MAX
	) {
		return { ok: false, error: "location_too_long" }
	}

	const { userId, getToken } = await auth()
	if (!userId) {
		return { ok: false, error: "unauthenticated" }
	}

	const token = await getToken()
	if (!token) {
		return { ok: false, error: "unauthenticated" }
	}

	const result = await createHostProfile(token, {
		companyName,
		categoryScopes,
		primaryLocationName,
	})
	if (!result.ok) {
		return {
			ok: false,
			error: result.error?.includes("profile_identity_disabled")
				? "account_unavailable"
				: "create_failed",
		}
	}

	revalidatePath("/host")
	return { ok: true }
}

export async function createHostProfileAction(
	input: CreateHostProfileActionInput,
): Promise<{ ok: boolean; error?: string }> {
	try {
		return await createHostProfileActionImpl(input)
	} catch (error) {
		reportError(error, {
			action: "createHostProfileAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "create_failed" }
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
	categoryScopes?: MarketplaceLane[]
	benefitLibrary?: HostBenefitLibrary
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

	let cleanBenefitLibrary: HostBenefitLibrary | undefined;
	let previousBenefitLibrary: HostBenefitLibrary | undefined;
	let hostProfileId: string | undefined;
	if (fields.benefitLibrary !== undefined) {
		const profile = await getHostProfile(token, userId);
		if (!profile) return { ok: false, error: "update_failed" };
		if (!profile.benefitLibraryAvailable) {
			return { ok: false, error: "housing_library_unavailable" };
		}
		hostProfileId = profile.id;
		previousBenefitLibrary = profile.benefitLibrary;
		cleanBenefitLibrary = sanitizeHostBenefitLibrary(fields.benefitLibrary);
		if (!isOwnedHousingLibrary(cleanBenefitLibrary, profile.id)) {
			return { ok: false, error: "invalid_housing_photo" };
		}
	}

	const result = await updateHostProfileDetails(token, userId, {
		...fields,
		...(cleanBenefitLibrary !== undefined
			? { benefitLibrary: cleanBenefitLibrary }
			: {}),
	})
	if (!result.ok) {
		return {
			ok: false,
			error: result.error?.includes("housing_photo_roles_in_use")
				? "housing_photo_in_use"
				: result.error ?? "update_failed",
		}
	}

	revalidatePath("/host/profile")
	revalidatePath("/host/profile/edit")
	// Bust the cached public host profile (/host/[id]) so edits show immediately.
	revalidateTag(HOST_PROFILES_CACHE_TAG)
	// Housing defaults feed every public listing detail that inherits them.
	revalidateTag(LISTINGS_CACHE_TAG)
	if (cleanBenefitLibrary && previousBenefitLibrary && hostProfileId) {
		await cleanupReplacedHousingPhotos(
			previousBenefitLibrary,
			cleanBenefitLibrary,
			hostProfileId,
			userId,
		)
	}
	return { ok: true }
}

/**
 * Normalize an untrusted Housing upload on the server, store it on the trusted
 * path, and bind it to the caller's reusable library before returning. Binding
 * immediately means Cancel/navigation cannot leave an orphaned evidence file.
 */
export async function uploadHousingLibraryPhotoAction(
	role: string,
	formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
	try {
		if (!(HOUSING_PHOTO_ROLES as readonly string[]).includes(role)) {
			return { ok: false, error: "invalid_housing_photo_role" }
		}
		const housingRole = role as HousingPhotoRole
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }
		if (!(await hasTrustedUploadBudget(userId))) {
			return { ok: false, error: "rate_limit_exceeded" }
		}

		const profile = await getHostProfile(token, userId)
		if (!profile) return { ok: false, error: "update_failed" }
		if (!profile.benefitLibraryAvailable) {
			return { ok: false, error: "housing_library_unavailable" }
		}

		const prefix = `${profile.id}/library/housing/${housingRole}`
		const referencedPaths = new Set<string>()
		const referencedPath = ownedHousingLibraryObjectPath(
			profile.benefitLibrary.housing?.photos?.[housingRole],
			profile.id,
			housingRole,
		)
		if (referencedPath) referencedPaths.add(referencedPath)
		try {
			const slotGuard = await guardTrustedUploadSlot({
				prefix,
				referencedPaths,
			})
			if (!slotGuard.ok) return slotGuard
		} catch (error) {
			reportError(error, {
				action: `guardHousingLibraryUpload:${housingRole}`,
				userId,
			})
			return { ok: false, error: "upload_temporarily_unavailable" }
		}

		const file = formData.get("file")
		const prepared = await prepareUploadImage(file instanceof File ? file : null)
		if (!prepared.ok) return prepared

		const path = `${prefix}/${randomUUID()}.webp`
		let uploadedUrl: string
		try {
			uploadedUrl = await uploadTrustedListingMedia({
				path,
				bytes: prepared.image.bytes,
				contentType: prepared.image.contentType,
			})
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : "upload_failed",
			}
		}

		const nextLibrary = sanitizeHostBenefitLibrary({
			...profile.benefitLibrary,
			housing: {
				...profile.benefitLibrary.housing,
				photos: {
					...profile.benefitLibrary.housing?.photos,
					[housingRole]: uploadedUrl,
				},
			},
		})
		const result = await setMyHousingLibraryPhoto(token, housingRole, uploadedUrl)
		if (!result.ok) {
			await deleteTrustedListingMedia(path).catch(() => undefined)
			return { ok: false, error: result.error ?? "update_failed" }
		}

		const committedLibrary = result.benefitLibrary ?? nextLibrary
		const displacedLibrary = result.previousUrl
			? sanitizeHostBenefitLibrary({
					housing: { photos: { [housingRole]: result.previousUrl } },
				})
			: {}
		await cleanupReplacedHousingPhotos(
			displacedLibrary,
			committedLibrary,
			profile.id,
			userId,
		)
		revalidatePath("/host/profile")
		revalidatePath("/host/profile/edit")
		revalidateTag(HOST_PROFILES_CACHE_TAG)
		revalidateTag(LISTINGS_CACHE_TAG)
		return { ok: true, url: uploadedUrl }
	} catch (error) {
		reportError(error, {
			action: "uploadHousingLibraryPhotoAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "upload_failed" }
	}
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
