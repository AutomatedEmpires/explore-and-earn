import type { SupabaseClient } from "@supabase/supabase-js";

import { anonClient, authedClient } from "../client";

/**
 * Host-profile data access for the host onboarding / management experience.
 *
 * SECURITY: Row Level Security is NOT yet enabled on `host_profiles`, and
 * `authedClient()` talks to PostgREST with the anon key plus the caller's Clerk
 * JWT (the `anon` role, which performs no row-level enforcement). Every query in
 * this module is therefore scoped in application code by the caller-supplied,
 * already-verified `clerkUserId` (from `auth().userId`) \u2014 never decode it from
 * the token. Keep these manual scoping filters even once RLS lands; they are
 * defense in depth.
 */

const PENDING_ATTESTATION = "pending" as const;

/** Postgres unique_violation SQLSTATE (host_profiles.clerk_user_id is UNIQUE). */
const UNIQUE_VIOLATION = "23505";

/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

export interface HostProfileDetailsInput {
  companyName?: string;
  about?: string | null;
  primaryLocationName?: string | null;
  websiteUrl?: string | null;
  photoUrl?: string | null;
}

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function getHostProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<{
  id: string;
  companyName: string;
  about: string | null;
  primaryLocationName: string | null;
  photoUrl: string | null;
} | null> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .select("id, company_name, about, primary_location_name, photo_url")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`getHostProfile: ${error.message}`);
  if (!data) return null;
  const row = data as {
    id: string;
    company_name: string | null;
    about: string | null;
    primary_location_name: string | null;
    photo_url: string | null;
  };
  return {
    id: row.id,
    companyName: row.company_name ?? "",
    about: row.about ?? null,
    primaryLocationName: row.primary_location_name ?? null,
    photoUrl: row.photo_url ?? null,
  };
}

export async function updateHostProfileDetails(
  clerkToken: string,
  clerkUserId: string,
  fields: HostProfileDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, string | null> = {};

  if (fields.companyName !== undefined) {
    const companyName = fields.companyName.trim();
    if (companyName === "") return { ok: false, error: "name_required" };
    patch.company_name = companyName;
  }
  if (fields.about !== undefined) patch.about = normalizeOptional(fields.about) ?? null;
  if (fields.primaryLocationName !== undefined)
    patch.primary_location_name = normalizeOptional(fields.primaryLocationName) ?? null;
  if (fields.websiteUrl !== undefined)
    patch.website_url = normalizeOptional(fields.websiteUrl) ?? null;
  if (fields.photoUrl !== undefined)
    patch.photo_url = normalizeOptional(fields.photoUrl) ?? null;

  if (Object.keys(patch).length === 0) return { ok: true };

  try {
    const db = untypedClient(clerkToken);
    const { error } = await db
      .from("host_profiles")
      .update(patch)
      .eq("clerk_user_id", clerkUserId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "update_failed";
    return { ok: false, error: message };
  }
}

export async function createHostProfile(
  clerkToken: string,
  clerkUserId: string,
  companyName: string,
): Promise<{ ok: boolean; id?: string }> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .insert({
      clerk_user_id: clerkUserId,
      company_name: companyName,
      attestation_status: PENDING_ATTESTATION,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      const existing = await getHostProfile(clerkToken, clerkUserId);
      return existing ? { ok: true, id: existing.id } : { ok: false };
    }
    return { ok: false };
  }

  return { ok: true, id: (data as { id: string }).id };
}

/* ========================================================================== */
/* Wave 10 — public host profile (no auth; anon client)                       */
/* ========================================================================== */

/** Host profile fields needed by the public /host/[id] page. */
export interface PublicHostProfile {
  id: string;
  companyName: string;
  about: string | null;
  primaryLocationName: string | null;
  photoUrl: string | null;
  attestationStatus: string;
  createdAt: string | null;
}

/**
 * Fetch a host's public profile by host_profiles.id. Anon client — no auth
 * required. Returns null when the profile does not exist.
 */
export async function getPublicHostProfile(
  hostProfileId: string,
): Promise<PublicHostProfile | null> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("host_profiles")
    .select(
      "id, company_name, about, primary_location_name, photo_url, attestation_status, created_at",
    )
    .eq("id", hostProfileId)
    .maybeSingle();

  if (error) throw new Error(`getPublicHostProfile: ${error.message}`);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    companyName:
      typeof row.company_name === "string" ? row.company_name : "",
    about: typeof row.about === "string" ? row.about : null,
    primaryLocationName:
      typeof row.primary_location_name === "string"
        ? row.primary_location_name
        : null,
    photoUrl: typeof row.photo_url === "string" ? row.photo_url : null,
    attestationStatus:
      typeof row.attestation_status === "string"
        ? row.attestation_status
        : "not_attested",
    createdAt:
      typeof row.created_at === "string" ? row.created_at : null,
  };
}

/** A live listing as surfaced on the host's public profile page. */
export interface PublicHostListing {
  id: string;
  title: string;
  category: string;
  coverPhotoUrl: string | null;
  locationDisplay: string | null;
  housingIncluded: boolean;
  mealsIncluded: boolean;
  compensationSummary: string | null;
  compensationMinCents: number | null;
  compensationMaxCents: number | null;
  compensationUnit: string | null;
  compensationCurrency: string;
  publishedAt: string | null;
}

/**
 * Fetch all live listings for a host, ordered by published_at DESC.
 * Anon client — no auth required.
 */
export async function getPublicListingsByHost(
  hostProfileId: string,
): Promise<PublicHostListing[]> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select(
      "id, title, category, cover_photo_url, location_display, housing_included, " +
        "meals_included, compensation_summary, compensation_min_cents, " +
        "compensation_max_cents, compensation_unit, compensation_currency, published_at",
    )
    .eq("host_profile_id", hostProfileId)
    .eq("status", "live")
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getPublicListingsByHost: ${error.message}`);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: typeof row.category === "string" ? row.category : "mix",
    coverPhotoUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    locationDisplay:
      typeof row.location_display === "string" ? row.location_display : null,
    housingIncluded: row.housing_included === true,
    mealsIncluded: row.meals_included === true,
    compensationSummary:
      typeof row.compensation_summary === "string"
        ? row.compensation_summary
        : null,
    compensationMinCents:
      typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null,
    compensationMaxCents:
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null,
    compensationUnit:
      typeof row.compensation_unit === "string" ? row.compensation_unit : null,
    compensationCurrency:
      typeof row.compensation_currency === "string"
        ? row.compensation_currency
        : "USD",
    publishedAt:
      typeof row.published_at === "string" ? row.published_at : null,
  }));
}
