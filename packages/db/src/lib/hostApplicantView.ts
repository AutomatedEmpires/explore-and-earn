/**
 * The host-facing applicant projection: what a host is entitled to see about a
 * seeker, and how the database's answer is decoded.
 *
 * Pure module — no client, no "server-only" — so the contract below is
 * unit-testable. The reading call sites live in ../queries/seekerResume.ts and
 * ../queries/seekerProfiles.ts and do nothing but call the migration 084 RPCs
 * and hand the rows to the mappers here.
 *
 * WHY THE FIELD LISTS ARE DECLARED HERE
 *
 * The entitled field set is a privacy decision, and it is stated twice: once as
 * the `returns table (...)` of each SECURITY DEFINER function in
 * supabase/migrations/084_host_applicant_read_bridge.sql, and once as the
 * constants below. Two statements of one decision drift silently, so
 * tests/hostApplicantView.test.ts parses the migration and asserts the two agree
 * exactly, in both directions. Widening the RPC without widening these lists
 * fails; widening these lists without the RPC fails.
 *
 * HOST IDENTITY IS NOT AN ARGUMENT ANYWHERE IN THIS PATH
 *
 * None of these shapes, and none of the query functions that produce them,
 * carry a host id. The database derives the caller's host profiles from the
 * Clerk `sub` claim via public.current_host_profile_ids() and filters to
 * seekers who applied to, were invited by, or already converse with that host.
 * A caller who is not a host gets an empty result rather than an error, exactly
 * as a caller asking about a seeker they have no relationship with does.
 */

/** Columns public.get_host_applicant_profile returns. */
export const HOST_APPLICANT_PROFILE_FIELDS = [
  "seeker_profile_id",
  "display_name",
  "short_bio",
  "relative_location",
  "location_pref",
  "seeking_timeline",
  "desired_categories",
  "desired_roles",
  "general_skill_tags",
  "housing_preference",
  "visibility_status",
] as const;

/** Columns public.get_host_applicant_display_names returns. */
export const HOST_APPLICANT_DISPLAY_NAME_FIELDS = [
  "seeker_profile_id",
  "display_name",
] as const;

/** Columns public.get_host_applicant_experiences returns. */
export const HOST_APPLICANT_EXPERIENCE_FIELDS = [
  "id",
  "company_name",
  "role_title",
  "location",
  "start_date",
  "end_date",
  "is_current",
  "summary",
  "category_tags",
  "skill_tags",
] as const;

/** Columns public.get_host_applicant_educations returns. */
export const HOST_APPLICANT_EDUCATION_FIELDS = [
  "id",
  "institution",
  "program_or_degree",
  "location",
  "start_date",
  "end_date",
  "is_current",
  "description",
  "skill_tags",
] as const;

/** Columns public.get_host_applicant_certifications returns. */
export const HOST_APPLICANT_CERTIFICATION_FIELDS = [
  "id",
  "name",
  "issuing_organization",
  "issued_at",
  "expires_at",
  "does_not_expire",
  "description",
  "credential_url",
  "category_tags",
  "skill_tags",
] as const;

/**
 * Seeker columns a host must never receive through this path, each for a stated
 * reason (the reasons are argued in the 084 migration header). The migration
 * test asserts none of these appears in any bridge function's return type, so
 * adding one is a deliberate, reviewed act rather than an autocomplete.
 */
export const HOST_APPLICANT_WITHHELD_FIELDS = [
  // Identity join keys — correlate the person across every other system.
  "clerk_user_id",
  "user_id",
  // Reservation price — undisclosed before an offer.
  "pay_expectation_min_cents",
  "pay_expectation_max_cents",
  "pay_expectation_unit",
  "pay_flexible",
  // Protected-characteristic proxy at screening time.
  "visa_support_needed",
  // Server-authoritative internals, not a quality score for a person.
  "completion_score",
  "match_confidence_score",
  // Notification settings.
  "email_on_invite",
  "email_on_status_change",
  "email_on_message",
  // Soft-delete state: applied as a filter inside the RPC, never returned.
  "deleted_at",
] as const;

export interface HostApplicantProfile {
  readonly seekerProfileId: string;
  readonly displayName: string | null;
  readonly shortBio: string | null;
  /** relative_location — a locality the seeker states in order to apply. */
  readonly relativeLocation: string | null;
  readonly locationPref: string | null;
  readonly seekingTimeline: string | null;
  readonly desiredCategories: readonly string[];
  readonly desiredRoles: readonly string[];
  readonly generalSkills: readonly string[];
  readonly housingPreference: string | null;
  /** 'platform' | 'hidden' | 'restricted' — the seeker's own discovery setting. */
  readonly visibilityStatus: string | null;
}

type Row = Record<string, unknown>;

/**
 * Separate "you are not entitled to this seeker" from "the read broke".
 *
 * This distinction is the whole point of migration 084. The old code path could
 * not make it — a row-filtered PostgREST SELECT returns success with no rows —
 * and so a dead feature looked exactly like an applicant with nothing to show.
 * Reintroducing `if (error) return null` anywhere on this path would rebuild
 * that bug on top of the fix, so the decision lives here, once:
 *
 *   RPC error  -> throw. A fault is loud.
 *   zero rows  -> not entitled, or nothing recorded. Caller decides how to show it.
 */
export function unwrapBridgeRows(
  label: string,
  result: { data: unknown; error: { message?: string } | null } | null | undefined,
): Row[] {
  if (!result) throw new Error(`${label}: no response from the applicant bridge`);
  if (result.error) {
    throw new Error(`${label}: ${result.error.message ?? "applicant bridge call failed"}`);
  }
  return Array.isArray(result.data) ? (result.data as Row[]) : [];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function textArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Blank and whitespace-only names are absent, not a name of spaces. */
export function normalizeDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapHostApplicantProfile(row: Row | null | undefined): HostApplicantProfile | null {
  if (!row || typeof row.seeker_profile_id !== "string") return null;
  return {
    seekerProfileId: row.seeker_profile_id,
    displayName: normalizeDisplayName(row.display_name),
    shortBio: text(row.short_bio),
    relativeLocation: text(row.relative_location),
    locationPref: text(row.location_pref),
    seekingTimeline: text(row.seeking_timeline),
    desiredCategories: textArray(row.desired_categories),
    desiredRoles: textArray(row.desired_roles),
    generalSkills: textArray(row.general_skill_tags),
    housingPreference: text(row.housing_preference),
    visibilityStatus: text(row.visibility_status),
  };
}

/**
 * Decode the batch name lookup. Ids the caller is not entitled to are absent
 * from the response, so they are absent from the map — callers render their own
 * placeholder rather than being handed a fabricated one here.
 */
export function mapHostApplicantDisplayNames(
  rows: readonly Row[] | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows ?? []) {
    if (typeof row.seeker_profile_id !== "string") continue;
    const name = normalizeDisplayName(row.display_name);
    if (name) map.set(row.seeker_profile_id, name);
  }
  return map;
}

export function mapHostApplicantExperiences(rows: readonly Row[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    companyName: text(row.company_name),
    roleTitle: text(row.role_title),
    location: text(row.location),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    isCurrent: Boolean(row.is_current),
    summary: text(row.summary),
    categoryTags: textArray(row.category_tags),
    skillTags: textArray(row.skill_tags),
  }));
}

export function mapHostApplicantEducations(rows: readonly Row[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    institution: text(row.institution),
    programOrDegree: text(row.program_or_degree),
    location: text(row.location),
    startDate: text(row.start_date),
    endDate: text(row.end_date),
    isCurrent: Boolean(row.is_current),
    description: text(row.description),
    skillTags: textArray(row.skill_tags),
  }));
}

export function mapHostApplicantCertifications(rows: readonly Row[] | null | undefined) {
  return (rows ?? []).map((row) => ({
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    issuingOrganization: text(row.issuing_organization),
    issuedAt: text(row.issued_at),
    expiresAt: text(row.expires_at),
    doesNotExpire: Boolean(row.does_not_expire),
    description: text(row.description),
    credentialUrl: text(row.credential_url),
    categoryTags: textArray(row.category_tags),
    skillTags: textArray(row.skill_tags),
  }));
}
