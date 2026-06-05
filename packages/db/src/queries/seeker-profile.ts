import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

/**
 * Seeker profile + resume data access (Clerk-authenticated, user-facing).
 *
 * SECURITY — read before editing:
 * - Row Level Security is NOT yet enabled on these tables (see approval-queue
 *   row A-RLS-001 / migration PR #107). `authedClient()` uses the *anon* key
 *   plus a Bearer Clerk JWT, which today resolves to the PostgREST `anon` role
 *   with NO row enforcement. Until RLS lands, the ONLY thing scoping a seeker
 *   to their own row is the explicit `.eq("clerk_user_id", sub)` filter applied
 *   here, where `sub` is read from the (already Clerk-verified) session JWT.
 * - Therefore every read/write in this module MUST filter by the JWT `sub`.
 *   Keep these filters even after RLS is added — defense in depth.
 * - The service-role client is reserved for the Clerk webhook only and must
 *   never be reachable from user-facing code paths.
 *
 * TYPES: packages/db/src/types.gen.ts is still a placeholder
 * (`GeneratedDatabase = Record<string, never>`), so the generic SupabaseClient
 * cannot resolve table row types yet. We therefore (a) use an untyped client
 * handle for `.from(...)` calls and (b) declare the row shapes locally,
 * mirroring supabase/migrations 002_users_profile_shadow.sql, 003_profiles.sql,
 * 004_seeker_resume.sql and 009_clerk_user_sync_schema.sql. Replace these
 * locals with generated types once `types.gen.ts` is real.
 */

export type SeekerAvailabilityStatus =
	| "available_now"
	| "date_range"
	| "flexible"
	| "unavailable";

/** Subset of users_profile_shadow we read (002 + 009). No avatar_url column exists. */
interface UsersProfileShadowRow {
	readonly clerk_user_id: string | null;
	readonly display_name: string | null;
	readonly email: string | null;
}

/** Subset of seeker_profiles we read/write (003 + 009). */
interface SeekerProfileRow {
	readonly id: string;
	readonly clerk_user_id: string | null;
	readonly display_name: string | null;
	readonly short_bio: string | null;
	readonly relative_location: string | null;
	readonly profile_photo_asset_id: string | null;
	readonly availability_status: SeekerAvailabilityStatus | null;
	readonly availability_start: string | null;
	readonly availability_end: string | null;
	readonly desired_roles: string[] | null;
}

/** Flattened view-model returned to the web app. */
export interface SeekerProfile {
	readonly seekerProfileId: string;
	readonly clerkUserId: string;
	readonly displayName: string | null;
	readonly email: string | null;
	readonly shortBio: string | null;
	readonly relativeLocation: string | null;
	readonly hasProfilePhoto: boolean;
	readonly availabilityStatus: SeekerAvailabilityStatus | null;
	readonly availabilityStart: string | null;
	readonly availabilityEnd: string | null;
	/**
	 * Free-text "skills & desired roles" tags. NOTE: seeker_profiles has no
	 * dedicated `skills` column (migration 003); the closest writable,
	 * tag-shaped column is `desired_roles` (text[]). Canonical per-experience
	 * skill tags live on seeker_resume_experiences (004) and are surfaced on the
	 * resume page.
	 */
	readonly skills: string[];
}

/** Editable fields accepted by upsertSeekerProfile. */
export interface SeekerProfileInput {
	readonly displayName?: string | null;
	readonly shortBio?: string | null;
	readonly availabilityStatus?: SeekerAvailabilityStatus | null;
	readonly availabilityStart?: string | null;
	readonly availabilityEnd?: string | null;
	readonly skills?: readonly string[];
}

export interface SeekerExperience {
	readonly id: string;
	readonly companyName: string | null;
	readonly roleTitle: string | null;
	readonly startDate: string | null;
	readonly endDate: string | null;
	readonly isCurrent: boolean;
	readonly summary: string | null;
	readonly skillTags: string[];
}

export interface SeekerCertification {
	readonly id: string;
	readonly name: string;
	readonly issuingOrganization: string | null;
	readonly issuedAt: string | null;
	readonly expiresAt: string | null;
	readonly credentialUrl: string | null;
}

export interface SeekerResume {
	readonly experiences: readonly SeekerExperience[];
	readonly certifications: readonly SeekerCertification[];
}

const SEEKER_PROFILE_COLUMNS =
	"id, clerk_user_id, display_name, short_bio, relative_location, profile_photo_asset_id, availability_status, availability_start, availability_end, desired_roles";

/**
 * Decode the `sub` (Clerk user id) claim from an already-verified session JWT.
 * The token is produced by Clerk (`auth().getToken()`) and verified by Clerk
 * middleware, so we only need to READ — not re-verify — the claim here.
 */
function decodeClerkSub(clerkToken: string): string {
	const parts = clerkToken.split(".");
	if (parts.length < 2 || !parts[1]) {
		throw new Error("Malformed Clerk JWT: cannot read `sub` claim.");
	}
	let payload: { sub?: unknown };
	try {
		payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
	} catch {
		throw new Error("Malformed Clerk JWT payload: not valid JSON.");
	}
	if (typeof payload.sub !== "string" || payload.sub.length === 0) {
		throw new Error("Clerk JWT is missing a `sub` claim.");
	}
	return payload.sub;
}

/**
 * Untyped Supabase handle. See the TYPES note above — needed only because
 * GeneratedDatabase is still a placeholder. Drop the cast once real types land.
 */
function untyped(clerkToken: string): SupabaseClient {
	return authedClient(clerkToken) as unknown as SupabaseClient;
}

function toSkillArray(value: readonly string[] | null | undefined): string[] {
	if (!value) {
		return [];
	}
	return value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/**
 * Read the seeker's own profile: users_profile_shadow + seeker_profiles, both
 * scoped on `clerk_user_id = JWT sub`. Returns null if no seeker_profiles row
 * exists yet (e.g. the Clerk user.created webhook has not run).
 */
export async function getSeekerProfile(
	clerkToken: string,
): Promise<SeekerProfile | null> {
	const sub = decodeClerkSub(clerkToken);
	const db = untyped(clerkToken);

	const { data: seekerData, error: seekerError } = await db
		.from("seeker_profiles")
		.select(SEEKER_PROFILE_COLUMNS)
		.eq("clerk_user_id", sub)
		.maybeSingle();

	if (seekerError) {
		throw seekerError;
	}
	if (!seekerData) {
		return null;
	}
	const seeker = seekerData as SeekerProfileRow;

	const { data: shadowData, error: shadowError } = await db
		.from("users_profile_shadow")
		.select("clerk_user_id, display_name, email")
		.eq("clerk_user_id", sub)
		.maybeSingle();

	if (shadowError) {
		throw shadowError;
	}
	const shadow = (shadowData as UsersProfileShadowRow | null) ?? null;

	return {
		seekerProfileId: seeker.id,
		clerkUserId: sub,
		displayName: seeker.display_name ?? shadow?.display_name ?? null,
		email: shadow?.email ?? null,
		shortBio: seeker.short_bio,
		relativeLocation: seeker.relative_location,
		hasProfilePhoto: Boolean(seeker.profile_photo_asset_id),
		availabilityStatus: seeker.availability_status,
		availabilityStart: seeker.availability_start,
		availabilityEnd: seeker.availability_end,
		skills: toSkillArray(seeker.desired_roles),
	};
}

/**
 * Update the seeker's OWN seeker_profiles row (scoped by JWT sub). Only the
 * provided fields are written. Returns the refreshed SeekerProfile.
 *
 * Named "upsert" per the task brief, but implemented as a scoped UPDATE: the
 * row is created by the Clerk `user.created` webhook, so we must not insert a
 * second shell row. If the row is missing (webhook lag) we surface a clear
 * error rather than silently inserting an unscoped row.
 */
export async function upsertSeekerProfile(
	clerkToken: string,
	input: SeekerProfileInput,
): Promise<SeekerProfile> {
	const sub = decodeClerkSub(clerkToken);
	const db = untyped(clerkToken);

	const patch: Record<string, unknown> = {};
	if (input.displayName !== undefined) {
		patch.display_name = input.displayName;
	}
	if (input.shortBio !== undefined) {
		patch.short_bio = input.shortBio;
	}
	if (input.availabilityStatus !== undefined) {
		patch.availability_status = input.availabilityStatus;
	}
	if (input.availabilityStart !== undefined) {
		patch.availability_start = input.availabilityStart;
	}
	if (input.availabilityEnd !== undefined) {
		patch.availability_end = input.availabilityEnd;
	}
	if (input.skills !== undefined) {
		patch.desired_roles = toSkillArray(input.skills);
	}

	if (Object.keys(patch).length > 0) {
		const { error } = await db
			.from("seeker_profiles")
			.update(patch)
			.eq("clerk_user_id", sub);
		if (error) {
			throw error;
		}
	}

	const refreshed = await getSeekerProfile(clerkToken);
	if (!refreshed) {
		throw new Error(
			"No seeker_profiles row found for the current user. The Clerk user.created webhook may not have run yet.",
		);
	}
	return refreshed;
}

/**
 * Read the seeker's own resume rows (experiences + certifications). We resolve
 * the seeker_profiles.id from the JWT sub first, then filter the child tables
 * by that id. Read-only on this pass.
 */
export async function getSeekerResume(
	clerkToken: string,
): Promise<SeekerResume> {
	const sub = decodeClerkSub(clerkToken);
	const db = untyped(clerkToken);

	const { data: profileData, error: profileError } = await db
		.from("seeker_profiles")
		.select("id, clerk_user_id")
		.eq("clerk_user_id", sub)
		.maybeSingle();

	if (profileError) {
		throw profileError;
	}
	if (!profileData) {
		return { experiences: [], certifications: [] };
	}
	const seekerProfileId = (profileData as { id: string }).id;

	const [experiencesResult, certificationsResult] = await Promise.all([
		db
			.from("seeker_resume_experiences")
			.select(
				"id, company_name, role_title, start_date, end_date, is_current, summary, skill_tags, sort_order",
			)
			.eq("seeker_profile_id", seekerProfileId)
			.order("sort_order", { ascending: true }),
		db
			.from("seeker_certifications")
			.select(
				"id, name, issuing_organization, issued_at, expires_at, credential_url, sort_order",
			)
			.eq("seeker_profile_id", seekerProfileId)
			.order("sort_order", { ascending: true }),
	]);

	if (experiencesResult.error) {
		throw experiencesResult.error;
	}
	if (certificationsResult.error) {
		throw certificationsResult.error;
	}

	const experiences = ((experiencesResult.data ?? []) as Array<
		Record<string, unknown>
	>).map((row) => ({
		id: String(row.id),
		companyName: (row.company_name as string | null) ?? null,
		roleTitle: (row.role_title as string | null) ?? null,
		startDate: (row.start_date as string | null) ?? null,
		endDate: (row.end_date as string | null) ?? null,
		isCurrent: Boolean(row.is_current),
		summary: (row.summary as string | null) ?? null,
		skillTags: Array.isArray(row.skill_tags) ? (row.skill_tags as string[]) : [],
	}));

	const certifications = ((certificationsResult.data ?? []) as Array<
		Record<string, unknown>
	>).map((row) => ({
		id: String(row.id),
		name: String(row.name ?? ""),
		issuingOrganization: (row.issuing_organization as string | null) ?? null,
		issuedAt: (row.issued_at as string | null) ?? null,
		expiresAt: (row.expires_at as string | null) ?? null,
		credentialUrl: (row.credential_url as string | null) ?? null,
	}));

	return { experiences, certifications };
}
