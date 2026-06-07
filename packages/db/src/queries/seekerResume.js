import { authedClient } from "../client";
import { getHostApplications } from "./applications";
/**
 * Seeker resume data access (read + bio write).
 *
 * SCHEMA RECONCILIATION (verified against supabase/migrations/003_profiles.sql,
 * 004_seeker_resume.sql and 009_clerk_user_sync_schema.sql):
 *   - `seeker_profiles` exposes `short_bio` (there is NO `bio` column) and has
 *     NO `headline`, `display_name` or `skills` columns. Migration 009 only
 *     added `clerk_user_id`. Per the build brief's missing-column fallback we
 *     map bio -> short_bio, derive resume "skills" from per-experience
 *     skill_tags, and treat display_name as not-yet-available (see
 *     getSeekerDisplayName) until a column lands.
 *   - `seeker_resume_experiences` / `seeker_resume_educations` match the brief
 *     and both carry a `sort_order` column used for stable ordering.
 *
 * SECURITY: these tables predate generated types (types.gen.ts is a
 * placeholder), so we cast the authed client to an untyped SupabaseClient and
 * scope every query in application code. Seeker-owned reads resolve the
 * `seeker_profile_id` from the caller-supplied, already-verified `clerkUserId`;
 * host-facing reads (by seeker_profile_id) are gated by an ownership guard that
 * confirms the seeker actually applied to one of the host's listings. We never
 * decode the JWT.
 */
/** Untyped Supabase handle for tables not yet in types.gen.ts. */
function untypedClient(clerkToken) {
    return authedClient(clerkToken);
}
async function loadResumeRows(db, seekerProfileId) {
    const [experienceResult, educationResult] = await Promise.all([
        db
            .from("seeker_resume_experiences")
            .select("id, company_name, role_title, start_date, end_date, is_current, summary, category_tags, skill_tags")
            .eq("seeker_profile_id", seekerProfileId)
            .order("sort_order", { ascending: true }),
        db
            .from("seeker_resume_educations")
            .select("id, institution, program_or_degree, start_date, end_date")
            .eq("seeker_profile_id", seekerProfileId)
            .order("sort_order", { ascending: true }),
    ]);
    if (experienceResult.error)
        throw new Error(`loadResumeRows experiences: ${experienceResult.error.message}`);
    if (educationResult.error)
        throw new Error(`loadResumeRows educations: ${educationResult.error.message}`);
    const experienceRows = (experienceResult.data ?? []);
    const educationRows = (educationResult.data ?? []);
    const experiences = experienceRows.map((row) => ({
        id: String(row.id),
        companyName: row.company_name ?? null,
        roleTitle: row.role_title ?? null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
        isCurrent: Boolean(row.is_current),
        summary: row.summary ?? null,
        categoryTags: (row.category_tags ?? []).slice(),
        skillTags: (row.skill_tags ?? []).slice(),
    }));
    const educations = educationRows.map((row) => ({
        id: String(row.id),
        institution: row.institution ?? null,
        programOrDegree: row.program_or_degree ?? null,
        startDate: row.start_date ?? null,
        endDate: row.end_date ?? null,
    }));
    return { experiences, educations };
}
export async function getSeekerResume(clerkToken, clerkUserId) {
    const db = untypedClient(clerkToken);
    const { data: profileData, error: profileError } = await db
        .from("seeker_profiles")
        .select("id, short_bio")
        .eq("clerk_user_id", clerkUserId)
        .maybeSingle();
    if (profileError)
        throw new Error(`getSeekerResume profile: ${profileError.message}`);
    if (!profileData)
        return { profile: null, experiences: [], educations: [] };
    const profileRow = profileData;
    const { experiences, educations } = await loadResumeRows(db, profileRow.id);
    return {
        profile: { seekerProfileId: profileRow.id, bio: profileRow.short_bio ?? null, headline: null },
        experiences,
        educations,
    };
}
/**
 * Host-side ownership guard: true only when the seeker applied to at least one
 * listing owned by this host. `hostClerkUserId` MUST come from auth().userId.
 */
async function hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId) {
    const applications = await getHostApplications(clerkToken, hostClerkUserId);
    return applications.some((a) => a.seekerProfileId === seekerProfileId);
}
export async function getSeekerResumeByProfileId(clerkToken, hostClerkUserId, seekerProfileId) {
    const allowed = await hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId);
    if (!allowed)
        return null;
    const db = untypedClient(clerkToken);
    const { data: profileData, error: profileError } = await db
        .from("seeker_profiles")
        .select("id, short_bio")
        .eq("id", seekerProfileId)
        .maybeSingle();
    if (profileError)
        throw new Error(`getSeekerResumeByProfileId profile: ${profileError.message}`);
    if (!profileData)
        return null;
    const profileRow = profileData;
    const { experiences, educations } = await loadResumeRows(db, profileRow.id);
    return {
        profile: { seekerProfileId: profileRow.id, bio: profileRow.short_bio ?? null, headline: null },
        experiences,
        educations,
    };
}
export async function getSeekerDisplayName(clerkToken, hostClerkUserId, seekerProfileId) {
    const allowed = await hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId);
    if (!allowed)
        return null;
    const db = untypedClient(clerkToken);
    try {
        const { data, error } = await db
            .from("seeker_profiles")
            .select("display_name")
            .eq("id", seekerProfileId)
            .maybeSingle();
        if (error || !data)
            return null;
        const value = data.display_name;
        return typeof value === "string" && value.trim().length > 0 ? value : null;
    }
    catch {
        return null;
    }
}
export async function updateSeekerProfileBio(clerkToken, clerkUserId, fields) {
    const db = untypedClient(clerkToken);
    const updates = {};
    if (fields.bio !== undefined)
        updates.short_bio = fields.bio;
    if (Object.keys(updates).length === 0)
        return { ok: true };
    const { data, error } = await db
        .from("seeker_profiles")
        .update(updates)
        .eq("clerk_user_id", clerkUserId)
        .select("id");
    if (error)
        return { ok: false, error: error.message };
    if (!data || data.length === 0)
        return { ok: false, error: "seeker profile not found" };
    return { ok: true };
}
/**
 * Fetch a seeker's profile for a host viewer. Gated by hostCanViewSeeker
 * (seeker must have applied to one of the host's listings). Reads
 * visibility_status defensively, falling back without the column if PostgREST
 * errors. Returns null when the host is not allowed or the profile is missing.
 *
 * `hostClerkUserId` MUST come from auth().userId.
 */
export async function getSeekerProfileForHost(clerkToken, hostClerkUserId, seekerProfileId) {
    const allowed = await hostCanViewSeeker(clerkToken, hostClerkUserId, seekerProfileId);
    if (!allowed)
        return null;
    const db = untypedClient(clerkToken);
    const baseColumns = "id, display_name, short_bio, location_pref, housing_preference, desired_categories, desired_roles, onboarding_complete";
    let row = null;
    let visibilityStatus = null;
    // Attempt read with visibility_status; fall back if the column is absent.
    const withVis = await db
        .from("seeker_profiles")
        .select(`${baseColumns}, visibility_status`)
        .eq("id", seekerProfileId)
        .maybeSingle();
    if (!withVis.error && withVis.data) {
        row = withVis.data;
        visibilityStatus =
            typeof row.visibility_status === "string" ? row.visibility_status : null;
    }
    else {
        const base = await db
            .from("seeker_profiles")
            .select(baseColumns)
            .eq("id", seekerProfileId)
            .maybeSingle();
        if (base.error || !base.data)
            return null;
        row = base.data;
    }
    if (!row)
        return null;
    return {
        seekerProfileId: String(row.id),
        displayName: typeof row.display_name === "string" ? row.display_name : null,
        shortBio: typeof row.short_bio === "string" ? row.short_bio : null,
        locationPref: typeof row.location_pref === "string" ? row.location_pref : null,
        housingPreference: typeof row.housing_preference === "string"
            ? row.housing_preference
            : null,
        desiredCategories: (row.desired_categories ?? []).slice(),
        desiredRoles: (row.desired_roles ?? []).slice(),
        onboardingComplete: Boolean(row.onboarding_complete),
        visibilityStatus,
    };
}
