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
	type HostProfileDetailsInput,
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

/**
 * The storage object path behind a logo URL the caller genuinely owns.
 *
 * Same shape as ownedHousingLibraryObjectPath and same reason: a delete is only
 * ever issued for a path that provably sits under this host's own prefix and
 * carries a filename we would have written. Anything else returns null and is
 * left alone — an unrecognised URL means "not ours to remove", never "remove it
 * anyway".
 */
function ownedLogoObjectPath(
	url: string | null | undefined,
	hostProfileId: string,
): string | null {
	if (!url || !isAllowedStorageUrl(url)) return null
	try {
		const marker = "/storage/v1/object/public/listing-media/"
		const encodedPath = new URL(url).pathname.split(marker)[1]
		if (!encodedPath) return null
		const path = decodeURIComponent(encodedPath)
		const prefix = `${hostProfileId}/library/logo/`
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
 *
 * NO PLAN IS REQUIRED TO REACH THIS. Migration 086 (commercial redesign D6)
 * removed the paid-tier refusal from create_my_host_profile, so a signed-in
 * prospect gets a workspace at tier 'none'. The paid line did not disappear — it
 * moved to PUBLICATION, where private.enforce_listing_allowance still refuses
 * every entry into live / paused / under_review for a host whose plan allowance
 * is zero.
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
		// COMMERCIAL REDESIGN D6: there is no longer a 'subscription_required'
		// outcome here, because migration 086 removed the refusal that produced it.
		// A signed-in prospect creates their workspace at tier 'none' and meets the
		// paid line later, at PUBLICATION, where the allowance trigger enforces it.
		//
		// The mapping is deleted rather than left as an unreachable branch. A dead
		// arm reads as a live guarantee to the next person, and this one would have
		// sent a host who hit an unrelated failure to a checkout page they do not
		// need. If 086 were ever reverted the raw db message would surface as
		// 'create_failed' — honest, if unhelpful — and the db tests that pin
		// creation-allowed-unpaid would fail first.
		const reason = result.error ?? ""
		return {
			ok: false,
			error: reason.includes("profile_identity_disabled")
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
 * Copy only columns covered by the authenticated host-profile UPDATE grant.
 * Server-action payloads remain untrusted at runtime, so an old or forged
 * client cannot smuggle `narrative` (or an internal profile field) into the
 * database patch through object spread.
 */
function writableHostProfileDetails(
	fields: UpdateHostProfileInput,
): HostProfileDetailsInput {
	const writable: HostProfileDetailsInput = {}
	if (fields.companyName !== undefined) writable.companyName = fields.companyName
	if (fields.hostName !== undefined) writable.hostName = fields.hostName
	if (fields.tagline !== undefined) writable.tagline = fields.tagline
	if (fields.about !== undefined) writable.about = fields.about
	if (fields.primaryLocationName !== undefined) {
		writable.primaryLocationName = fields.primaryLocationName
	}
	if (fields.websiteUrl !== undefined) writable.websiteUrl = fields.websiteUrl
	if (fields.photoUrl !== undefined) writable.photoUrl = fields.photoUrl
	if (fields.socialLinks !== undefined) writable.socialLinks = fields.socialLinks
	if (fields.housingOfferedGenerally !== undefined) {
		writable.housingOfferedGenerally = fields.housingOfferedGenerally
	}
	if (fields.mealsOfferedGenerally !== undefined) {
		writable.mealsOfferedGenerally = fields.mealsOfferedGenerally
	}
	if (fields.categoryScopes !== undefined) {
		writable.categoryScopes = fields.categoryScopes
	}
	return writable
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
		...writableHostProfileDetails(fields),
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

/**
 * Normalize an untrusted logo image on the server, store it on the trusted
 * path, and bind it to the caller's own host profile before returning.
 *
 * WHY THIS EXISTS (redesign V2-E). The logo affordance the product already
 * shipped — HostCoverLogoPicker — says so in its own header: "no cover/logo
 * persistence backend is wired here, so an upload sets a local preview URL
 * rather than posting to a server". A host uploaded their logo, saw it appear,
 * navigated away, and it was gone. Onboarding cannot ask for a logo through a
 * control like that; a step whose only effect is a preview is the exact defect
 * this program exists to remove.
 *
 * photo_url is the column the product already treats as the host's mark: the
 * public profile hero renders it as the avatar, and migration 054 re-granted
 * UPDATE on it after revoking the blanket table grant. So the logo lands there
 * rather than in host_profiles.logo_asset_id, which exists in the schema and is
 * referenced by no TypeScript anywhere — writing to a column nothing reads would
 * be the same disappearance with a longer path.
 *
 * Every guard is the one uploadHousingLibraryPhotoAction already uses: a
 * per-user upload budget, a per-prefix slot guard that sweeps expired orphans,
 * server-side normalization to WebP through prepareUploadImage, and a bind that
 * happens immediately so navigating away cannot strand the object. The displaced
 * logo is deleted after the bind succeeds, never before.
 */
export async function uploadHostLogoAction(
	formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }
		if (!(await hasTrustedUploadBudget(userId))) {
			return { ok: false, error: "rate_limit_exceeded" }
		}

		const profile = await getHostProfile(token, userId)
		// The logo binds to a ROW, so there has to be one. Onboarding creates the
		// profile on the identity step for exactly this reason.
		if (!profile) return { ok: false, error: "profile_required" }

		const prefix = `${profile.id}/library/logo`
		const referencedPaths = new Set<string>()
		const currentPath = ownedLogoObjectPath(profile.photoUrl, profile.id)
		if (currentPath) referencedPaths.add(currentPath)
		try {
			const slotGuard = await guardTrustedUploadSlot({ prefix, referencedPaths })
			if (!slotGuard.ok) return slotGuard
		} catch (error) {
			reportError(error, { action: "guardHostLogoUpload", userId })
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

		const result = await updateHostProfileDetails(token, userId, {
			photoUrl: uploadedUrl,
		})
		if (!result.ok) {
			// The bind failed, so the object is unreferenced. Remove it rather than
			// leaving a paid-for byte nothing points at.
			await deleteTrustedListingMedia(path).catch(() => undefined)
			return { ok: false, error: result.error ?? "update_failed" }
		}

		if (currentPath && currentPath !== path) {
			try {
				await deleteTrustedListingMedia(currentPath)
			} catch (error) {
				reportError(error, { action: "cleanupReplacedHostLogo", userId })
			}
		}

		revalidatePath("/host/profile")
		revalidatePath("/host/profile/edit")
		revalidateTag(HOST_PROFILES_CACHE_TAG)
		return { ok: true, url: uploadedUrl }
	} catch (error) {
		reportError(error, {
			action: "uploadHostLogoAction",
			userId: await currentUserId(),
		})
		return { ok: false, error: "upload_failed" }
	}
}

/**
 * Normalize and store a COVER photograph, and hand back its URL for the caller
 * to bind to a listing.
 *
 * WHY THIS RETURNS RATHER THAN BINDS, and why a "profile cover" is a listing
 * field. host_profiles has a cover_asset_id column that no TypeScript in this
 * repository reads or writes. What the public employer page actually renders as
 * its cover band is the cover photo of the host's first listing — see the
 * /host/[id] page, which resolves it that way. So there is exactly one cover
 * per employer and it lives on a role.
 *
 * Onboarding therefore collects the cover on the role step and submits it as
 * that listing's coverPhotoUrl, where createListingAction re-validates it
 * against our own storage origin before it is written. Binding it to a profile
 * column here would put the image somewhere nothing renders it from.
 *
 * THE UNBOUND WINDOW IS BOUNDED. Between this returning and the listing being
 * written the object is referenced by nothing, which is the same shape the
 * benefit-photo upload has. guardTrustedUploadSlot sweeps unreferenced versioned
 * uploads past their TTL on the next upload to this prefix, so an abandoned
 * onboarding cannot accumulate objects.
 */
export async function uploadHostCoverAction(
	formData: FormData,
): Promise<{ ok: boolean; url?: string; error?: string }> {
	try {
		const { userId, getToken } = await auth()
		if (!userId) return { ok: false, error: "unauthenticated" }
		const token = await getToken()
		if (!token) return { ok: false, error: "unauthenticated" }
		if (!(await hasTrustedUploadBudget(userId))) {
			return { ok: false, error: "rate_limit_exceeded" }
		}

		// The storage path's first segment is the caller's OWN host profile id,
		// which is what the listing-media RLS insert policy authorizes against.
		const profile = await getHostProfile(token, userId)
		if (!profile) return { ok: false, error: "profile_required" }

		const prefix = `${profile.id}/library/cover`
		try {
			const slotGuard = await guardTrustedUploadSlot({
				prefix,
				referencedPaths: new Set<string>(),
			})
			if (!slotGuard.ok) return slotGuard
		} catch (error) {
			reportError(error, { action: "guardHostCoverUpload", userId })
			return { ok: false, error: "upload_temporarily_unavailable" }
		}

		const file = formData.get("file")
		const prepared = await prepareUploadImage(file instanceof File ? file : null)
		if (!prepared.ok) return prepared

		const path = `${prefix}/${randomUUID()}.webp`
		try {
			const uploadedUrl = await uploadTrustedListingMedia({
				path,
				bytes: prepared.image.bytes,
				contentType: prepared.image.contentType,
			})
			return { ok: true, url: uploadedUrl }
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error.message : "upload_failed",
			}
		}
	} catch (error) {
		reportError(error, {
			action: "uploadHostCoverAction",
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
