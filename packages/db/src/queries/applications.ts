import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ApplicationStatus,
  BenefitProvision,
  BenefitTriad,
  BenefitEvidenceStatus,
  DiscoveryCardConditionalBadge,
  ListingProvenanceInfo,
  ListingStatus,
  OpportunityCategory,
} from "@explore-and-earn/contracts";
import {
  formatCompensation,
  formatOpportunityWindow,
  hasVerifiedHostSubscription,
} from "@explore-and-earn/contracts";

import { authedClient } from "../client";
import { isSeekerResumeComplete } from "../lib/resumeCompleteness";
import { getActiveBoostedListingIds } from "./idReaders";
import {
  MEANINGFUL_MATCH_SCORE_THRESHOLD,
  rowProvenanceInfo,
} from "./listings";
import { getMatchScoresForSeeker } from "./matchScores";
import { getSeekerResume } from "./seekerResume";

export interface ApplyResult {
  readonly ok: boolean;
  readonly error?: string;
  /**
   * Deployment bridge only: the RPC was genuinely absent and this result came
   * from the pre-091 table-write path. Invite acceptance uses this marker to
   * perform its matching legacy status/linkage writes during that short window.
   */
  readonly legacySubmission?: boolean;
  /**
   * True when the apply REACTIVATED a previously withdrawn application row
   * (migration 063) rather than creating a new one. Lets the action layer show
   * a "re-applied" confirmation; the host separately sees it via `reappliedAt`.
   */
  readonly reactivated?: boolean;
  /** Server-authoritative RPC outcome; existing means no new submission event. */
  readonly disposition?: "created" | "reactivated" | "existing";
  /** The created, reactivated, or adopted application row id (set on ok=true). */
  readonly applicationId?: string;
  /** The applicant's seeker_profiles.id (set on ok=true). */
  readonly seekerProfileId?: string;
}

/**
 * Where an application came from (007: applications.source + origin_invite_id).
 * Omitted → a direct apply from a discovery surface. Supplied by
 * respondToInvite so an invite-originated application is attributable end to
 * end (host pipeline, analytics, and the seeker's own history).
 */
export interface ApplyOrigin {
  readonly source: "invite";
  readonly originInviteId: string;
}

/** Postgres unique_violation SQLSTATE -- surfaced as the already-applied case. */
const UNIQUE_VIOLATION = "23505";
/** Postgres check_violation SQLSTATE -- surfaced as invalid_transition or listing_full. */
const CHECK_VIOLATION = "23514";
const LISTING_NOT_ACCEPTING_APPLICATIONS =
  "listing_not_accepting_applications" as const;
const MAX_COVER_MESSAGE_CODE_POINTS = 2000;
const STABLE_APPLICATION_ERRORS = new Set([
  "unauthenticated",
  "profile_not_found",
  "cover_message_too_long",
  "resume_incomplete",
  LISTING_NOT_ACCEPTING_APPLICATIONS,
  "cannot_apply_to_own_listing",
  "invite_not_actionable",
  "already_applied",
]);

function safeApplicationError(message: unknown): string {
  if (message === "application_conflict") return "conflict";
  return typeof message === "string" && STABLE_APPLICATION_ERRORS.has(message)
    ? message
    : "temporarily_unavailable";
}

/** Match PostgreSQL char_length(): count Unicode code points, not UTF-16 units. */
function coverMessageIsTooLong(coverMessage: string | undefined): boolean {
  if (coverMessage === undefined) return false;

  let codePoints = 0;
  const iterator = coverMessage[Symbol.iterator]();
  while (!iterator.next().done) {
    codePoints += 1;
    if (codePoints > MAX_COVER_MESSAGE_CODE_POINTS) return true;
  }
  return false;
}

/**
 * PostgREST's exact missing-function response during deploy-before-migrate.
 * Code alone is insufficient: never turn an unrelated schema-cache miss into
 * authority to use the compatibility write path.
 */
function isMissingSubmissionRpc(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const row = error as Record<string, unknown>;
  if (row.code !== "PGRST202") return false;
  const signature = [row.message, row.details, row.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return signature.includes("submit_my_application");
}

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 *
 * `clerkUserId` must come from `auth().userId` -- never decode it from the token.
 */
async function resolveSeekerProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`resolveSeekerProfileId: ${error.message}`);
  }
  return data ? (data.id as string) : null;
}

/**
 * Short-lived compatibility path for the deploy-before-091 interval only.
 * Callers must have completed the same fail-closed listing and résumé checks
 * before entering. Once 091 exists, direct grants are revoked and this path is
 * unreachable because PostgREST no longer returns the missing-RPC signature.
 */
async function legacySubmitApplication(
  authed: SupabaseClient,
  seekerProfileId: string,
  listingId: string,
  coverMessage: string | undefined,
  origin: ApplyOrigin | undefined,
): Promise<ApplyResult> {
  const existing = await authed
    .from("applications")
    .select("id, status")
    .eq("listing_id", listingId)
    .eq("seeker_profile_id", seekerProfileId)
    .maybeSingle();

  if (existing.error) {
    return {
      ok: false,
      error: "temporarily_unavailable",
      legacySubmission: true,
    };
  }

  const existingRow = existing.data as { id: string; status: string } | null;
  if (existingRow) {
    if (existingRow.status !== "withdrawn") {
      return {
        ok: false,
        error: "already_applied",
        legacySubmission: true,
        applicationId: existingRow.id,
        seekerProfileId,
      };
    }

    const reactivatePatch: Record<string, unknown> = {
      status: "applied",
      reactivated_at: new Date().toISOString(),
      withdrawn_reason: null,
    };
    if (coverMessage !== undefined) reactivatePatch.cover_message = coverMessage;
    if (origin) {
      reactivatePatch.source = "invite";
      reactivatePatch.origin_invite_id = origin.originInviteId;
    }

    const { data: reactivated, error: reactivateError } = await authed
      .from("applications")
      .update(reactivatePatch)
      .eq("id", existingRow.id)
      .eq("seeker_profile_id", seekerProfileId)
      .select("id")
      .maybeSingle();

    if (reactivateError) {
      return {
        ok: false,
        error:
          reactivateError.code === UNIQUE_VIOLATION
            ? "already_applied"
            : "temporarily_unavailable",
        legacySubmission: true,
      };
    }
    if (!reactivated) {
      return { ok: false, error: "conflict", legacySubmission: true };
    }
    return {
      ok: true,
      reactivated: true,
      legacySubmission: true,
      disposition: "reactivated",
      applicationId: existingRow.id,
      seekerProfileId,
    };
  }

  const { data: inserted, error: insertError } = await authed
    .from("applications")
    .insert({
      listing_id: listingId,
      seeker_profile_id: seekerProfileId,
      cover_message: coverMessage ?? null,
      ...(origin
        ? { source: "invite", origin_invite_id: origin.originInviteId }
        : {}),
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === UNIQUE_VIOLATION) {
      // Fetch the existing application so the invite bridge can link it.
      const { data: dup } = await authed
        .from("applications")
        .select("id")
        .eq("listing_id", listingId)
        .eq("seeker_profile_id", seekerProfileId)
        .maybeSingle();
      const dupId = (dup as { id?: unknown } | null)?.id;
      return {
        ok: false,
        error: "already_applied" as const,
        legacySubmission: true,
        ...(typeof dupId === "string"
          ? { applicationId: dupId, seekerProfileId }
          : {}),
      };
    }
    return {
      ok: false,
      error: "temporarily_unavailable",
      legacySubmission: true,
    };
  }

  const applicationId = (inserted as { id?: unknown } | null)?.id;
  if (typeof applicationId !== "string") {
    return { ok: false, error: "conflict", legacySubmission: true };
  }

  return {
    ok: true,
    legacySubmission: true,
    disposition: "created",
    applicationId,
    seekerProfileId,
  };
}

/**
 * Apply the authed seeker to a listing.
 *
 * The application checks below provide fast, stable product feedback; the
 * submit_my_application RPC repeats the mutable checks and owns the write
 * atomically. Expected business outcomes are returned as a typed result:
 * - `unauthenticated`  — token had no decodable subject
 * - `profile_not_found` — no seeker_profiles row yet (Clerk webhook pending)
 * - `already_applied`   — unique (listing_id, seeker_profile_id) violation
 * - `cannot_apply_to_own_listing` — host cannot apply to their own listing
 * - `listing_not_accepting_applications` — listing is not live, is expired,
 *   sourced/unclaimed, or has no platform host available to receive it
 * - `resume_incomplete` — résumé does not yet satisfy the server-authoritative
 *   completeness gate (see isSeekerResumeComplete); enforced here so a
 *   determined client cannot bypass the UI-side ApplyButton gate. An INVITED
 *   seeker hits this gate too: an invite is a request to apply, never a bypass
 *   of the résumé requirement (founder law — resume-gated apply).
 *
 * `origin` marks an invite-originated application (respondToInvite). Every
 * guard below applies identically — the invite changes attribution, not rules.
 */
export async function applyToListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  coverMessage?: string,
  origin?: ApplyOrigin,
): Promise<ApplyResult> {
  // Enforce the database contract at the exported server boundary before any
  // profile/listing I/O. This also closes the short-lived PGRST202 legacy path
  // to callers that do not enter through the web action's advisory guard.
  if (coverMessageIsTooLong(coverMessage)) {
    return { ok: false, error: "cover_message_too_long" };
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const authed = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data: listingCandidate, error: listingError } = await authed
    .from("listings")
    .select(
      "status, expires_at, provenance, host_profile_id, " +
        "host_profiles!host_profile_id(clerk_user_id)",
    )
    .eq("id", listingId)
    .maybeSingle();

  if (listingError) {
    return { ok: false, error: "temporarily_unavailable" };
  }

  const listingRow = listingCandidate as unknown as {
    status?: string;
    expires_at?: string | null;
    provenance?: string;
    host_profile_id?: string | null;
    host_profiles?: { clerk_user_id?: string };
  } | null;

  const rawHostClerkId = listingRow?.host_profiles?.clerk_user_id;
  const hostClerkId =
    typeof rawHostClerkId === "string" ? rawHostClerkId.trim() : "";
  const expiresAt =
    typeof listingRow?.expires_at === "string"
      ? Date.parse(listingRow.expires_at)
      : null;
  const expiryAcceptsApplications =
    expiresAt !== null && Number.isFinite(expiresAt) && expiresAt > Date.now();

  // Advisory fail-fast before résumé hydration or any application mutation.
  // The database submission guard remains authoritative against TOCTOU races;
  // this check gives stale/scripted clients the stable product error promptly.
  if (
    listingRow?.status !== "live" ||
    listingRow?.provenance !== "verified" ||
    typeof listingRow?.host_profile_id !== "string" ||
    hostClerkId.length === 0 ||
    !expiryAcceptsApplications
  ) {
    return { ok: false, error: LISTING_NOT_ACCEPTING_APPLICATIONS };
  }

  // Prevent self-application: host cannot apply to their own listing.
  if (hostClerkId === clerkUserId) {
    return { ok: false, error: "cannot_apply_to_own_listing" as const };
  }

  // Server-authoritative résumé gate: block the insert BEFORE it happens when
  // the seeker's résumé is not complete enough to apply. This is the real
  // enforcement point — the ApplyButton UI check is advisory only.
  const resume = await getSeekerResume(clerkToken, clerkUserId);
  if (!isSeekerResumeComplete(resume)) {
    return { ok: false, error: "resume_incomplete" };
  }

  // The RPC is the normal authority for create/reactivate/dedup and atomic
  // invite acceptance. Direct table writes are used only by the bounded
  // deploy-before-migrate bridge after an exact missing-RPC response; every
  // other RPC failure remains closed.
  const { data: submission, error: submissionError } = await authed
    .rpc("submit_my_application", {
      p_listing_id: listingId,
      p_cover_message: coverMessage ?? null,
      p_origin_invite_id: origin?.originInviteId ?? null,
    })
    .single();

  if (submissionError) {
    if (isMissingSubmissionRpc(submissionError)) {
      return legacySubmitApplication(
        authed,
        seekerProfileId,
        listingId,
        coverMessage,
        origin,
      );
    }
    return { ok: false, error: safeApplicationError(submissionError.message) };
  }

  const submissionRow = submission as Record<string, unknown> | null;
  const applicationId =
    typeof submissionRow?.application_id === "string"
      ? submissionRow.application_id
      : null;
  const submittedSeekerProfileId =
    typeof submissionRow?.seeker_profile_id === "string"
      ? submissionRow.seeker_profile_id
      : null;
  const submittedListingId =
    typeof submissionRow?.listing_id === "string"
      ? submissionRow.listing_id
      : null;
  const disposition = submissionRow?.disposition;

  if (
    !applicationId ||
    !submittedSeekerProfileId ||
    submittedSeekerProfileId !== seekerProfileId ||
    submittedListingId !== listingId ||
    (disposition !== "created" &&
      disposition !== "reactivated" &&
      disposition !== "existing")
  ) {
    return { ok: false, error: "conflict" };
  }

  // A direct duplicate remains a non-event: the UI refreshes into its existing
  // applied state and the action emits no duplicate application_submitted event.
  // An invite-originated `existing` result is success because the RPC has just
  // atomically linked and closed that invite around the existing application.
  if (disposition === "existing" && !origin) {
    return { ok: false, error: "already_applied" };
  }

  return {
    ok: true,
    applicationId,
    seekerProfileId: submittedSeekerProfileId,
    disposition,
    ...(disposition === "reactivated" ? { reactivated: true } : {}),
  };
}

// getSeekerApplicationIds moved to ./idReaders (breaks the listings.ts <->
// applications.ts import cycle); re-exported from the package barrel via that
// module. Import it from "@explore-and-earn/db" exactly as before.

export interface SeekerApplication {
  readonly id: string;
  readonly listingId: string;
  readonly status: string;
  readonly submittedAt: string;
  readonly expiresAt: string | null;
  /**
   * When the HOST moved this application into review (007's reviewed_at), or
   * null if they have not. The seeker dashboard's "last movement" line reads
   * this — "Host began review · yesterday" is a real timestamp, never an
   * inference. (`viewed_at` does NOT exist on applications — it lives on
   * invites/offers; selecting it here 42501s the whole read.)
   */
  readonly reviewedAt: string | null;
}

export async function getSeekerApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerApplication[]> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select("id, listing_id, status, submitted_at, expires_at, reviewed_at")
    .eq("seeker_profile_id", seekerProfileId)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplications: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    listingId: row.listing_id as string,
    status: row.status as string,
    submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : "",
    expiresAt: typeof row.expires_at === "string" ? row.expires_at : null,
    reviewedAt: typeof row.reviewed_at === "string" ? row.reviewed_at : null,
  }));
}

export interface HostApplication {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly seekerProfileId: string;
  readonly seekerClerkUserId: string;
  readonly status: string;
  readonly coverMessage: string | null;
  readonly submittedAt: string;
  /**
   * ISO timestamp of the latest re-apply reactivation (migration 063), or null
   * for a first-time application. Non-null ⇒ this seeker applied, withdrew, and
   * re-applied — the host's "applied before" / "re-applied" flag.
   */
  readonly reappliedAt: string | null;
  /** Convenience boolean: `reappliedAt != null`. */
  readonly previouslyApplied: boolean;
}

const HOST_APPLICATIONS_SELECT =
  "id,listing_id,seeker_profile_id,status,cover_message,submitted_at,reactivated_at,listings!listing_id!inner(title,host_profile_id,host_profiles!host_profile_id!inner(clerk_user_id)),seeker_profiles!seeker_profile_id(clerk_user_id)";

function firstOf(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

export async function getHostApplications(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  try {
    const { data, error } = await untyped
      .from("applications")
      .select(HOST_APPLICATIONS_SELECT)
      .eq("listings.host_profiles.clerk_user_id", clerkUserId)
      .order("submitted_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return (data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const listing = firstOf(r.listings);
      const seeker = firstOf(r.seeker_profiles);
      return {
        id: String(r.id),
        listingId: String(r.listing_id),
        listingTitle:
          listing && typeof listing.title === "string" ? listing.title : "",
        seekerProfileId: String(r.seeker_profile_id),
        seekerClerkUserId:
          seeker && typeof seeker.clerk_user_id === "string"
            ? seeker.clerk_user_id
            : "",
        status: typeof r.status === "string" ? r.status : "applied",
        coverMessage:
          typeof r.cover_message === "string" ? r.cover_message : null,
        submittedAt: String(r.submitted_at),
        reappliedAt:
          typeof r.reactivated_at === "string" ? r.reactivated_at : null,
        previouslyApplied: typeof r.reactivated_at === "string",
      } satisfies HostApplication;
    });
  } catch {
    return getHostApplicationsFallback(untyped, clerkUserId);
  }
}

async function getHostApplicationsFallback(
  untyped: SupabaseClient,
  clerkUserId: string,
): Promise<HostApplication[]> {
  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    throw new Error(`getHostApplications(host_profiles): ${hostError.message}`);
  }
  const hostProfileIds = (hostRows ?? []).map((r) =>
    String((r as Record<string, unknown>).id),
  );
  if (hostProfileIds.length === 0) {
    return [];
  }

  const { data: listingRows, error: listingError } = await untyped
    .from("listings")
    .select("id,title")
    .in("host_profile_id", hostProfileIds);
  if (listingError) {
    throw new Error(`getHostApplications(listings): ${listingError.message}`);
  }
  const listingTitleById = new Map<string, string>();
  for (const raw of listingRows ?? []) {
    const r = raw as Record<string, unknown>;
    listingTitleById.set(
      String(r.id),
      typeof r.title === "string" ? r.title : "",
    );
  }
  const listingIds = [...listingTitleById.keys()];
  if (listingIds.length === 0) {
    return [];
  }

  const { data: appRows, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id,seeker_profile_id,status,cover_message,submitted_at,reactivated_at")
    .in("listing_id", listingIds)
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (appError) {
    throw new Error(`getHostApplications(applications): ${appError.message}`);
  }
  const apps = (appRows ?? []).map((raw) => raw as Record<string, unknown>);

  const seekerProfileIds = [
    ...new Set(apps.map((r) => String(r.seeker_profile_id))),
  ];
  const seekerClerkById = new Map<string, string>();
  if (seekerProfileIds.length > 0) {
    const { data: seekerRows, error: seekerError } = await untyped
      .from("seeker_profiles")
      .select("id,clerk_user_id")
      .in("id", seekerProfileIds);
    if (seekerError) {
      throw new Error(
        `getHostApplications(seeker_profiles): ${seekerError.message}`,
      );
    }
    for (const raw of seekerRows ?? []) {
      const r = raw as Record<string, unknown>;
      seekerClerkById.set(
        String(r.id),
        typeof r.clerk_user_id === "string" ? r.clerk_user_id : "",
      );
    }
  }

  return apps.map((r) => ({
    id: String(r.id),
    listingId: String(r.listing_id),
    listingTitle: listingTitleById.get(String(r.listing_id)) ?? "",
    seekerProfileId: String(r.seeker_profile_id),
    seekerClerkUserId: seekerClerkById.get(String(r.seeker_profile_id)) ?? "",
    status: typeof r.status === "string" ? r.status : "applied",
    coverMessage: typeof r.cover_message === "string" ? r.cover_message : null,
    submittedAt: String(r.submitted_at),
    reappliedAt: typeof r.reactivated_at === "string" ? r.reactivated_at : null,
    previouslyApplied: typeof r.reactivated_at === "string",
  } satisfies HostApplication));
}

export async function getApplicationCountsByListing(
  clerkToken: string,
  clerkUserId: string,
): Promise<Record<string, number>> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const counts: Record<string, number> = {};
  for (const application of applications) {
    counts[application.listingId] = (counts[application.listingId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Per-listing count of NEW (status='applied') applications — the host hasn't
 * triaged these yet. Backs the "N new" badge on the listings manager, which was
 * previously hardcoded to 0. Same single fetch shape as the total counts above.
 */
export async function getNewApplicationCountsByListing(
  clerkToken: string,
  clerkUserId: string,
): Promise<Record<string, number>> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const counts: Record<string, number> = {};
  for (const application of applications) {
    if (application.status !== "applied") continue;
    counts[application.listingId] = (counts[application.listingId] ?? 0) + 1;
  }
  return counts;
}

export const HOST_SETTABLE_STATUSES = [
  "reviewing",
  "saved_by_host",
  "offered",
  "not_selected",
  // Hosts confirm acceptance of a seeker who is in 'offered' state.
  // The lifecycle guard (trg_applications_lifecycle) enforces that only the
  // offered -> accepted edge is valid; any other path is rejected by Postgres.
  "accepted",
  // The ENGAGEMENT states. These were legal everywhere except here: migration
  // 001 seeds the accepted->active and active->completed edges, contracts
  // mirrors them in APPLICATION_TRANSITIONS, RLS applications_update_host
  // scopes by listing ownership with no status restriction, and 066 grants
  // update(status). Nothing wrote them, so no application ever left 'accepted'
  // — and because hostReviews REVIEWABLE_STATUSES is ['active','completed'],
  // the review gate could never open. The entire two-sided trust layer was
  // unreachable through a five-item allow-list.
  "active",
  "completed",
] as const;

export type HostSettableStatus = (typeof HOST_SETTABLE_STATUSES)[number];

export async function updateApplicationStatus(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(HOST_SETTABLE_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  const { data: hostRows, error: hostError } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId);
  if (hostError) {
    return { ok: false, error: hostError.message };
  }
  const hostProfileIds = new Set(
    (hostRows ?? []).map((r) => String((r as Record<string, unknown>).id)),
  );
  if (hostProfileIds.size === 0) {
    return { ok: false, error: "profile_not_found" };
  }

  const { data: appRow, error: appError } = await untyped
    .from("applications")
    .select("id,listing_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (appError) {
    return { ok: false, error: appError.message };
  }
  if (!appRow) {
    return { ok: false, error: "not_found" };
  }

  const listingId = String((appRow as Record<string, unknown>).listing_id);
  const { data: listingRow, error: listingError } = await untyped
    .from("listings")
    .select("id,host_profile_id,remaining_role_count")
    .eq("id", listingId)
    .maybeSingle();
  if (listingError) {
    return { ok: false, error: listingError.message };
  }
  if (
    !listingRow ||
    !hostProfileIds.has(
      String((listingRow as Record<string, unknown>).host_profile_id),
    )
  ) {
    return { ok: false, error: "forbidden" };
  }

  // Pre-check capacity before attempting to accept so callers receive a clear
  // error instead of a raw Postgres CHECK-violation message. The DB constraint
  // (remaining_role_count >= 0) is the authoritative guard; this check avoids
  // the round-trip when the listing is obviously full, and provides a friendly
  // error code in the (unlikely) race-condition case via the catch below.
  if (newStatus === "accepted") {
    const remaining = Number(
      (listingRow as Record<string, unknown>).remaining_role_count ?? 0,
    );
    if (remaining <= 0) {
      return { ok: false, error: "listing_full" };
    }
  }

  const { data: updated, error: updateError } = await untyped
    .from("applications")
    .update({ status: newStatus })
    .eq("id", applicationId)
    .select("id")
    .maybeSingle();
  if (updateError) {
    // 23514 = check_violation. Two sources are possible:
    //   a) enforce_lifecycle_transition() BEFORE trigger rejected the edge;
    //      its message starts with "Illegal " (see 001_extensions_and_functions.sql).
    //   b) The AFTER trigger's UPDATE of listings violated remaining_role_count >= 0
    //      (race-condition over-accept that slipped past the pre-check above).
    const code = (updateError as { code?: string; message?: string }).code;
    const msg = (updateError as { message?: string }).message ?? "";
    if (code === CHECK_VIOLATION) {
      if (msg.startsWith("Illegal ")) {
        return { ok: false, error: "invalid_transition" };
      }
      return {
        ok: false,
        error: newStatus === "accepted" ? "listing_full" : "invalid_transition",
      };
    }
    return { ok: false, error: msg || updateError.message };
  }
  // Affected-row assertion: the ownership pre-checks above make a zero-row
  // match a race (or an RLS filter) — surface it instead of reporting ok.
  if (!updated) {
    return { ok: false, error: "conflict" };
  }

  return { ok: true };
}

export interface ApplicationListing {
  readonly id: string;
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly location: string;
  readonly opportunityWindow: string;
  readonly status: ListingStatus;
  readonly host: { readonly name: string; readonly verified: boolean };
  readonly benefits: BenefitTriad;
  /** Season start (listings.begins_at), when the host set concrete dates. */
  readonly begins?: string;
  /** Season end (listings.ends_at). Only present alongside a real value. */
  readonly ends?: string;
  /** When the LISTING stops taking applications (listings.expires_at). */
  readonly closesAt?: string;
  /** Listing cover photograph, when the host uploaded one. */
  readonly coverPhotoUrl?: string;
}

export type ApplicationWithListing = SeekerApplication & {
  readonly listing: ApplicationListing | null;
};

// Compensation summary via the shared, locale-ready formatter (default currency
// applied in the formatter) \u2014 no inline currency/date formatting in the DB
// layer. See @explore-and-earn/contracts format.ts.
function embeddedCompensationSummary(row: Record<string, unknown>): string {
  return formatCompensation({
    summary:
      typeof row.compensation_summary === "string"
        ? row.compensation_summary
        : null,
    minCents:
      typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null,
    maxCents:
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null,
    unit:
      typeof row.compensation_unit === "string" ? row.compensation_unit : null,
  });
}

function rowToDiscoveryListing(value: unknown): ApplicationListing | null {
  const row = firstOf(value);
  if (!row) {
    return null;
  }

  const housingProvision: BenefitProvision =
    row.housing_included === true ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision =
    row.meals_included === true ? "provided" : "not_provided";

  const benefits: BenefitTriad = {
    housing: { provision: housingProvision },
    meals: { provision: mealsProvision },
    pay: {
      provision: "provided",
      summary: embeddedCompensationSummary(row),
    },
  };

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: (typeof row.category === "string"
      ? row.category
      : "mix") as OpportunityCategory,
    location:
      typeof row.location_display === "string" &&
      row.location_display.length > 0
        ? row.location_display
        : "Location not specified",
    opportunityWindow: formatOpportunityWindow({
      timelineSummary:
        typeof row.timeline_summary === "string" ? row.timeline_summary : null,
    }),
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: "Unknown Host", verified: false },
    benefits,
    begins: typeof row.begins_at === "string" ? row.begins_at : undefined,
    ends: typeof row.ends_at === "string" ? row.ends_at : undefined,
    closesAt: typeof row.expires_at === "string" ? row.expires_at : undefined,
    coverPhotoUrl:
      typeof row.cover_photo_url === "string" && row.cover_photo_url.length > 0
        ? row.cover_photo_url
        : undefined,
  };
}

export async function getSeekerApplicationsWithListings(
  clerkToken: string,
  clerkUserId: string,
  statuses: string[],
): Promise<ApplicationWithListing[]> {
  if (statuses.length === 0) {
    return [];
  }

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return [];
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("applications")
    .select(
      "id, listing_id, status, submitted_at, expires_at, reviewed_at, listings!listing_id(id, title, category, location_display, housing_included, meals_included, compensation_summary, compensation_min_cents, compensation_max_cents, compensation_unit, timeline_summary, begins_at, ends_at, expires_at, cover_photo_url)",
    )
    .eq("seeker_profile_id", seekerProfileId)
    .in("status", statuses)
    .order("submitted_at", { ascending: false });

  if (error) {
    throw new Error(`getSeekerApplicationsWithListings: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      status: typeof r.status === "string" ? r.status : "applied",
      submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
      listing: rowToDiscoveryListing(r.listings),
    } satisfies ApplicationWithListing;
  });
}

/* -------------------------------------------------------------------------- */
/* Seeker self-service: full application + listing + host (Wave 10 / Agent B). */
/* -------------------------------------------------------------------------- */

/**
 * Statuses the SEEKER may set from their own /applied dashboard.
 * Only accept/decline a live offer. Host-settable statuses live above.
 *
 * Decline maps to 'withdrawn' (offered -> withdrawn IS a seeded lifecycle
 * edge; offered -> not_selected never was — the previous 'not_selected'
 * value here was rejected by trg_applications_lifecycle on every decline).
 * withdrawn_reason='seeker_declined_offer' distinguishes a declined offer
 * from an ordinary withdrawal; not_selected stays host-only vocabulary.
 */
const SEEKER_SETTABLE_STATUSES = ["accepted", "withdrawn"] as const;
export type SeekerSettableStatus = (typeof SEEKER_SETTABLE_STATUSES)[number];

/** Stamped on offered -> withdrawn so a declined offer is distinguishable. */
export const SEEKER_DECLINED_OFFER_REASON = "seeker_declined_offer";

/**
 * Richer listing view-model for /applied + offer detail, including the host
 * identity (company name + subscription-gated verification).
 */
export interface SeekerApplicationListing extends ApplicationListing {
  readonly coverImageUrl: string | null;
  readonly beginsAt: string | null;
  readonly endsAt: string | null;
  readonly provenanceInfo?: ListingProvenanceInfo;
  /**
   * Conditional badges that must travel on the card even off the discovery
   * feed. Applications don't route through rowToDiscoveryFields, so the boosted
   * marker is stamped here (founder decision: a boosted listing ALWAYS shows its
   * boosted marker). Empty/undefined when the listing has no active boost.
   */
  readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
  /**
   * Stored ADR-040 match % for the (seeker, listing) pair, surfaced ONLY when it
   * clears MEANINGFUL_MATCH_SCORE_THRESHOLD (>= 75) — the same gate the discovery
   * card uses (founder decision: match % shows wherever a stored score >= 75). So
   * offered / invited / saved lifecycle cards show the same number the listing
   * detail does. Undefined when there is no stored score or it is below the gate.
   *
   * The final sentence of that claim only became true once the listing-detail
   * page started reading this same stored row (apps/web/lib/listingFit.ts).
   * Before that the page recomputed from a reduced input set and could disagree
   * with every card here. Do not reintroduce a recompute on any surface that
   * renders this number.
   */
  readonly matchScore?: number;
}

export type SeekerApplicationWithListing = SeekerApplication & {
  readonly coverMessage: string | null;
  readonly listing: SeekerApplicationListing | null;
};

const SEEKER_APPLICATION_SELECT =
  "id, listing_id, status, cover_message, submitted_at, expires_at, reviewed_at, " +
  "listings!listing_id(id, title, category, location_display, status, " +
  "provenance, source_name, source_url, source_external_id, source_employer_name, " +
  "source_published_at, source_last_seen_at, claim_summary, housing_evidence, " +
  "meals_evidence, pay_evidence, " +
  "housing_included, housing_description, meals_included, meals_description, " +
  "compensation_summary, " +
  "compensation_min_cents, compensation_max_cents, compensation_unit, " +
  "compensation_currency, timeline_summary, cover_photo_url, begins_at, ends_at, " +
  "host_profiles(company_name, subscription_tier))";

const weakestBenefitEvidence = (value: unknown): BenefitEvidenceStatus =>
  value === "stated" || value === "confirmed" ? value : "not_stated";

const nullableSourceText = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

/** @internal Shared normalization before the canonical provenance mapper. */
export function seekerApplicationListingProvenanceInfo(
  row: Record<string, unknown>,
): ListingProvenanceInfo | undefined {
  return rowProvenanceInfo({
    provenance: row.provenance === "sourced" ? "sourced" : "verified",
    source_name: nullableSourceText(row.source_name),
    source_url: nullableSourceText(row.source_url),
    source_external_id: nullableSourceText(row.source_external_id),
    source_employer_name: nullableSourceText(row.source_employer_name),
    source_published_at: nullableSourceText(row.source_published_at),
    source_last_seen_at: nullableSourceText(row.source_last_seen_at),
    claim_summary:
      typeof row.claim_summary === "string"
        ? row.claim_summary
        : "not_applicable",
    housing_evidence: weakestBenefitEvidence(row.housing_evidence),
    meals_evidence: weakestBenefitEvidence(row.meals_evidence),
    pay_evidence: weakestBenefitEvidence(row.pay_evidence),
  });
}

/** @internal Evidence-authoritative benefit mapping shared by list and detail. */
export function seekerApplicationListingBenefits(
  row: Record<string, unknown>,
  provenanceInfo = seekerApplicationListingProvenanceInfo(row),
): BenefitTriad {
  const evidence = provenanceInfo?.benefitEvidence;
  const housingStated =
    evidence?.housing === "stated" || evidence?.housing === "confirmed";
  const mealsStated =
    evidence?.meals === "stated" || evidence?.meals === "confirmed";
  const payHasEvidence =
    evidence?.pay === "stated" || evidence?.pay === "confirmed";
  const payHasValue =
    (typeof row.compensation_summary === "string" &&
      row.compensation_summary.trim().length > 0) ||
    typeof row.compensation_min_cents === "number" ||
    typeof row.compensation_max_cents === "number";
  const payStated = payHasEvidence && payHasValue;

  const housingProvision: BenefitProvision = housingStated
    ? row.housing_included === true
      ? "provided"
      : "not_provided"
    : "not_stated";
  const mealsProvision: BenefitProvision = mealsStated
    ? row.meals_included === true
      ? "provided"
      : "not_provided"
    : "not_stated";

  return {
    housing: {
      provision: housingProvision,
      ...(housingStated && typeof row.housing_description === "string"
        ? { summary: row.housing_description }
        : {}),
    },
    meals: {
      provision: mealsProvision,
      ...(mealsStated && typeof row.meals_description === "string"
        ? { summary: row.meals_description }
        : {}),
    },
    pay: {
      provision: payStated ? "provided" : "not_stated",
      ...(payStated ? { summary: embeddedCompensationSummary(row) } : {}),
    },
  };
}

function rowToSeekerApplicationListing(
  value: unknown,
  boostedListingIds?: ReadonlySet<string>,
  matchScores?: ReadonlyMap<string, number>,
): SeekerApplicationListing | null {
  const row = firstOf(value);
  if (!row) return null;

  const provenanceInfo = seekerApplicationListingProvenanceInfo(row);
  const sourced = provenanceInfo?.provenance === "sourced";
  const hostRaw = firstOf(row.host_profiles);
  const sourceEmployerName =
    typeof row.source_employer_name === "string" &&
    row.source_employer_name.trim().length > 0
      ? row.source_employer_name.trim()
      : null;
  const sourceName =
    typeof row.source_name === "string" && row.source_name.trim().length > 0
      ? row.source_name.trim()
      : null;
  const hostName = sourced
    ? (sourceEmployerName ?? sourceName ?? "Employer not stated")
    : hostRaw &&
        typeof hostRaw.company_name === "string" &&
        hostRaw.company_name.length > 0
      ? hostRaw.company_name
      : "Unknown Host";
  const verified =
    !sourced && hostRaw
      ? hasVerifiedHostSubscription(hostRaw.subscription_tier)
      : false;

  const benefits = seekerApplicationListingBenefits(row, provenanceInfo);

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: (typeof row.category === "string"
      ? row.category
      : "mix") as OpportunityCategory,
    location:
      typeof row.location_display === "string" &&
      row.location_display.length > 0
        ? row.location_display
        : "Location not specified",
    opportunityWindow: formatOpportunityWindow({
      timelineSummary:
        typeof row.timeline_summary === "string" ? row.timeline_summary : null,
    }),
    status: (typeof row.status === "string"
      ? row.status
      : "live") as ListingStatus,
    host: { name: hostName, verified },
    benefits,
    coverImageUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    beginsAt: typeof row.begins_at === "string" ? row.begins_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    provenanceInfo,
    conditionalBadges:
      boostedListingIds?.has(String(row.id)) ? (["boosted"] as const) : undefined,
    matchScore: (() => {
      const stored = matchScores?.get(String(row.id));
      return typeof stored === "number" && stored >= MEANINGFUL_MATCH_SCORE_THRESHOLD
        ? stored
        : undefined;
    })(),
  };
}

/**
 * All applications for the authed seeker, newest first, joined to listing + host.
 */
export async function getApplicationsForSeekerWithListings(
  clerkToken: string,
  clerkUserId: string,
  statuses?: readonly ApplicationStatus[],
): Promise<SeekerApplicationWithListing[]> {
  if (statuses?.length === 0) return [];

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return [];

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const applicationQuery = untyped
    .from("applications")
    .select(SEEKER_APPLICATION_SELECT)
    .eq("seeker_profile_id", seekerProfileId);
  const filteredApplicationQuery = statuses
    ? applicationQuery.in("status", [...statuses])
    : applicationQuery;
  const [{ data, error }, boostedListingIds, matchScores] = await Promise.all([
    filteredApplicationQuery.order("submitted_at", { ascending: false }),
    getActiveBoostedListingIds(clerkToken),
    getMatchScoresForSeeker(clerkToken, clerkUserId),
  ]);

  if (error) {
    throw new Error(`getApplicationsForSeekerWithListings: ${error.message}`);
  }

  return (data ?? []).map((raw) => {
    const r = raw as unknown as Record<string, unknown>;
    return {
      id: String(r.id),
      listingId: String(r.listing_id),
      status: typeof r.status === "string" ? r.status : "applied",
      submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
      coverMessage:
        typeof r.cover_message === "string" ? r.cover_message : null,
      listing: rowToSeekerApplicationListing(
        r.listings,
        boostedListingIds,
        matchScores,
      ),
    } satisfies SeekerApplicationWithListing;
  });
}

/**
 * Single application by id, scoped to the authed seeker's ownership.
 */
export async function getApplicationById(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<SeekerApplicationWithListing | null> {
  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) return null;

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const [{ data, error }, boostedListingIds, matchScores] = await Promise.all([
    untyped
      .from("applications")
      .select(SEEKER_APPLICATION_SELECT)
      .eq("id", applicationId)
      .eq("seeker_profile_id", seekerProfileId)
      .maybeSingle(),
    getActiveBoostedListingIds(clerkToken),
    getMatchScoresForSeeker(clerkToken, clerkUserId),
  ]);

  if (error) {
    throw new Error(`getApplicationById: ${error.message}`);
  }
  if (!data) return null;

  const r = data as unknown as Record<string, unknown>;
  return {
    id: String(r.id),
    listingId: String(r.listing_id),
    status: typeof r.status === "string" ? r.status : "applied",
    submittedAt: typeof r.submitted_at === "string" ? r.submitted_at : "",
    expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
    reviewedAt: typeof r.reviewed_at === "string" ? r.reviewed_at : null,
    coverMessage:
      typeof r.cover_message === "string" ? r.cover_message : null,
    listing: rowToSeekerApplicationListing(
      r.listings,
      boostedListingIds,
      matchScores,
    ),
  } satisfies SeekerApplicationWithListing;
}

/**
 * Seeker-facing status update: accept or decline a live offer.
 *
 * Validates:
 *  1. newStatus is in SEEKER_SETTABLE_STATUSES
 *  2. Caller owns the application (seeker_profile_id matches)
 *  3. Current application status is 'offered' (can only act on a live offer)
 *  4. When accepting: the listing still has remaining capacity
 */
export async function updateApplicationStatusBySeeker(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
  newStatus: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(SEEKER_SETTABLE_STATUSES as readonly string[]).includes(newStatus)) {
    return { ok: false, error: "invalid_status" };
  }

  // Capture one instant for the advisory pre-check. The authoritative UPDATE
  // evaluates PostgreSQL's `now` at write time so an offer that expires during
  // the intervening profile, read, or capacity calls cannot be accepted.
  const nowIso = new Date().toISOString();

  const seekerProfileId = await resolveSeekerProfileId(clerkToken, clerkUserId);
  if (!seekerProfileId) {
    return { ok: false, error: "profile_not_found" };
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data: appRow, error: appError } = await untyped
    .from("applications")
    .select("id, seeker_profile_id, status, listing_id, expires_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) return { ok: false, error: appError.message };
  if (!appRow) return { ok: false, error: "not_found" };

  const row = appRow as Record<string, unknown>;

  if (String(row.seeker_profile_id) !== seekerProfileId) {
    return { ok: false, error: "forbidden" };
  }
  if (String(row.status) !== "offered") {
    return { ok: false, error: "invalid_transition" };
  }
  const expiresAt =
    typeof row.expires_at === "string" ? row.expires_at : null;
  if (expiresAt !== null && Date.parse(expiresAt) <= Date.parse(nowIso)) {
    return { ok: false, error: "invalid_transition" };
  }

  // Pre-check capacity before accepting so seekers receive a clear error
  // instead of a raw Postgres CHECK-violation. The DB constraint is the
  // authoritative guard; this avoids the round-trip when obviously full.
  if (newStatus === "accepted") {
    const { data: listingRow, error: listingError } = await untyped
      .from("listings")
      .select("remaining_role_count")
      .eq("id", String(row.listing_id))
      .maybeSingle();
    if (listingError) return { ok: false, error: listingError.message };
    const remaining = Number(
      (listingRow as Record<string, unknown> | null)?.remaining_role_count ?? 0,
    );
    if (remaining <= 0) {
      return { ok: false, error: "listing_full" };
    }
  }

  const patch: Record<string, unknown> =
    newStatus === "withdrawn"
      ? { status: newStatus, withdrawn_reason: SEEKER_DECLINED_OFFER_REASON }
      : { status: newStatus };

  const { data: updated, error: updateError } = await untyped
    .from("applications")
    .update(patch)
    .eq("id", applicationId)
    .eq("seeker_profile_id", seekerProfileId)
    .eq("status", "offered")
    .or("expires_at.is.null,expires_at.gt.now")
    .select("id")
    .maybeSingle();

  if (updateError) {
    // 23514 = check_violation. Distinguish lifecycle guard (message starts with
    // "Illegal ") from a capacity violation on the listings CHECK constraint.
    const code = (updateError as { code?: string; message?: string }).code;
    const msg = (updateError as { message?: string }).message ?? "";
    if (code === CHECK_VIOLATION && !msg.startsWith("Illegal ") && newStatus === "accepted") {
      return { ok: false, error: "listing_full" };
    }
    return { ok: false, error: msg || updateError.message };
  }
  // Affected-row assertion: an UPDATE that matched nothing (concurrent status
  // or expiry change, or an RLS policy filtering the row) must surface as an
  // error — never as a silent ok:true that leaves the UI lying about state.
  if (!updated) {
    return { ok: false, error: "conflict" };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Host pipeline: application detail + alias (Wave 10 / Agent C).             */
/* -------------------------------------------------------------------------- */

/**
 * All applications across the authed host's listings, newest first.
 * Delegates to getHostApplications — provided as a named alias so callers
 * explicitly referencing the host-pipeline brief can import by that name.
 */
export async function getAllApplicationsForHost(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostApplication[]> {
  return getHostApplications(clerkToken, clerkUserId);
}

/**
 * A single application enriched with the seeker's display name and bio, for
 * the applicant-detail surface. Ownership is re-checked via getHostApplications
 * (which scopes to the caller's listings) before reading the seeker row.
 *
 * Returns null when the application is not found or the caller does not own the
 * listing the application targets.
 */
export interface ApplicationWithSeekerDetail extends HostApplication {
  readonly seekerDisplayName: string | null;
  readonly seekerBio: string | null;
}

export async function getApplicationWithSeekerDetail(
  clerkToken: string,
  clerkUserId: string,
  applicationId: string,
): Promise<ApplicationWithSeekerDetail | null> {
  const applications = await getHostApplications(clerkToken, clerkUserId);
  const application = applications.find((app) => app.id === applicationId);
  if (!application) {
    return null;
  }

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;

  // Best-effort seeker profile read: display_name may not exist as a column
  // yet (forward-compatible missing-column fallback).
  let seekerDisplayName: string | null = null;
  let seekerBio: string | null = null;

  try {
    const { data, error } = await untyped
      .from("seeker_profiles")
      .select("display_name, short_bio")
      .eq("id", application.seekerProfileId)
      .maybeSingle();
    if (!error && data) {
      const row = data as Record<string, unknown>;
      seekerDisplayName =
        typeof row.display_name === "string" && row.display_name.trim().length > 0
          ? row.display_name.trim()
          : null;
      seekerBio =
        typeof row.short_bio === "string" && row.short_bio.trim().length > 0
          ? row.short_bio.trim()
          : null;
    }
  } catch {
    // Missing-column fallback: any error means no extra data to show.
  }

  return { ...application, seekerDisplayName, seekerBio };
}
