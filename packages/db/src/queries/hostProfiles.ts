import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MARKETPLACE_CATEGORIES, hasVerifiedHostSubscription } from "@explore-and-earn/contracts";
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

export interface SocialLinks {
  instagram?: string | null;
  twitter?: string | null;
}

export interface HostProfileDetailsInput {
  companyName?: string;
  hostName?: string | null;
  tagline?: string | null;
  about?: string | null;
  primaryLocationName?: string | null;
  websiteUrl?: string | null;
  photoUrl?: string | null;
  socialLinks?: SocialLinks;
  /** Host-level "we generally provide housing" positioning (public profile). */
  housingOfferedGenerally?: boolean;
  /** Host-level "we generally provide meals" positioning (public profile). */
  mealsOfferedGenerally?: boolean;
  /** Marketplace categories this host operates in (subset of MARKETPLACE_CATEGORIES). */
  categoryScopes?: string[];
}

function normalizeOptional(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export interface HostProfile {
  id: string;
  companyName: string;
  hostName: string | null;
  tagline: string | null;
  about: string | null;
  primaryLocationName: string | null;
  photoUrl: string | null;
  websiteUrl: string | null;
  socialLinks: SocialLinks;
  categoryScopes: string[];
  housingOfferedGenerally: boolean;
  mealsOfferedGenerally: boolean;
  subscriptionTier: "none" | "starter" | "professional" | "enterprise";
}

const HOST_PROFILE_SELECT =
  "id,company_name,host_name,tagline,about,primary_location_name,photo_url," +
  "website_url,social_links,category_scopes,housing_offered_generally," +
  "meals_offered_generally,subscription_tier";

function rowToHostProfile(row: Record<string, unknown>): HostProfile {
  const raw = row.social_links as Record<string, unknown> | null;
  return {
    id: String(row.id),
    companyName: typeof row.company_name === "string" ? row.company_name : "",
    hostName: typeof row.host_name === "string" ? row.host_name : null,
    tagline: typeof row.tagline === "string" ? row.tagline : null,
    about: typeof row.about === "string" ? row.about : null,
    primaryLocationName:
      typeof row.primary_location_name === "string" ? row.primary_location_name : null,
    photoUrl: typeof row.photo_url === "string" ? row.photo_url : null,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : null,
    socialLinks: {
      instagram: typeof raw?.instagram === "string" ? raw.instagram : null,
      twitter: typeof raw?.twitter === "string" ? raw.twitter : null,
    },
    categoryScopes: Array.isArray(row.category_scopes)
      ? (row.category_scopes as string[])
      : [],
    housingOfferedGenerally: row.housing_offered_generally === true,
    mealsOfferedGenerally: row.meals_offered_generally === true,
    subscriptionTier: (["none", "starter", "professional", "enterprise"].includes(
      String(row.subscription_tier),
    )
      ? row.subscription_tier
      : "none") as HostProfile["subscriptionTier"],
  };
}

export async function getHostProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostProfile | null> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .select(HOST_PROFILE_SELECT)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`getHostProfile: ${error.message}`);
  if (!data) return null;
  return rowToHostProfile(data as unknown as Record<string, unknown>);
}

export type HostSubscriptionTier =
  | "none"
  | "starter"
  | "professional"
  | "enterprise";

export async function getHostSubscriptionTier(
  clerkToken: string,
  clerkUserId: string,
): Promise<HostSubscriptionTier> {
  const db = untypedClient(clerkToken);
  const { data, error } = await db
    .from("host_profiles")
    .select("subscription_tier")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();

  if (error) {
    throw new Error(`getHostSubscriptionTier: ${error.message}`);
  }

  const tier = (data as { subscription_tier?: string } | null)?.subscription_tier;
  if (
    tier === "starter" ||
    tier === "professional" ||
    tier === "enterprise"
  ) {
    return tier;
  }

  return "none";
}

export async function updateHostProfileDetails(
  clerkToken: string,
  clerkUserId: string,
  fields: HostProfileDetailsInput,
): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = {};

  if (fields.companyName !== undefined) {
    const companyName = fields.companyName.trim();
    if (companyName === "") return { ok: false, error: "name_required" };
    patch.company_name = companyName;
  }
  if (fields.hostName !== undefined) patch.host_name = normalizeOptional(fields.hostName) ?? null;
  if (fields.tagline !== undefined) patch.tagline = normalizeOptional(fields.tagline) ?? null;
  if (fields.about !== undefined) patch.about = normalizeOptional(fields.about) ?? null;
  if (fields.primaryLocationName !== undefined)
    patch.primary_location_name = normalizeOptional(fields.primaryLocationName) ?? null;
  if (fields.websiteUrl !== undefined)
    patch.website_url = normalizeOptional(fields.websiteUrl) ?? null;
  if (fields.photoUrl !== undefined)
    patch.photo_url = normalizeOptional(fields.photoUrl) ?? null;
  if (fields.socialLinks !== undefined) {
    patch.social_links = {
      instagram: normalizeOptional(fields.socialLinks.instagram) ?? null,
      twitter: normalizeOptional(fields.socialLinks.twitter) ?? null,
    };
  }
  if (fields.housingOfferedGenerally !== undefined)
    patch.housing_offered_generally = fields.housingOfferedGenerally;
  if (fields.mealsOfferedGenerally !== undefined)
    patch.meals_offered_generally = fields.mealsOfferedGenerally;
  if (fields.categoryScopes !== undefined) {
    const allowed = MARKETPLACE_CATEGORIES as readonly string[];
    patch.category_scopes = Array.from(
      new Set(fields.categoryScopes.filter((c) => allowed.includes(c))),
    );
  }

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

/** A single showcased team member on the public host profile. */
export interface HostTeamMember {
  name: string;
  role: string;
  photoUrl?: string;
}

/** Host profile fields needed by the public /host/[id] page. */
export interface PublicHostProfile {
  id: string;
  companyName: string;
  hostName: string | null;
  tagline: string | null;
  about: string | null;
  primaryLocationName: string | null;
  photoUrl: string | null;
  websiteUrl: string | null;
  socialLinks: SocialLinks;
  categoryScopes: string[];
  housingOfferedGenerally: boolean;
  mealsOfferedGenerally: boolean;
  /** Active-paid-subscription gate — see hasVerifiedHostSubscription(). */
  verified: boolean;
  createdAt: string | null;
  /* ── Showcase narrative (host_profiles.narrative jsonb; migration 059) ──
     All optional: a host that has captured none of these leaves the block
     empty and the public showcase omits the corresponding section. */
  /** "Why work for us" recruiting pitch. Absent when unset. */
  whyWorkForUs?: string;
  /** "Meet the team" members. Absent when none captured. */
  team?: HostTeamMember[];
  /** "Life & activities" highlights. Absent when none captured. */
  activities?: string[];
  /** "Perks & benefits" highlights. Absent when none captured. */
  perks?: string[];
}

const PUBLIC_PROFILE_SELECT =
  "id,company_name,host_name,tagline,about,primary_location_name,photo_url," +
  "website_url,social_links,category_scopes,housing_offered_generally," +
  "meals_offered_generally,subscription_tier,created_at,narrative";

/** Narrative sub-shape parsed out of the host_profiles.narrative jsonb block. */
interface HostNarrative {
  whyWorkForUs?: string;
  team?: HostTeamMember[];
  activities?: string[];
  perks?: string[];
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function toTeam(value: unknown): HostTeamMember[] {
  if (!Array.isArray(value)) return [];
  const members: HostTeamMember[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const role = typeof rec.role === "string" ? rec.role.trim() : "";
    if (name === "" && role === "") continue;
    const photoUrl =
      typeof rec.photoUrl === "string" && rec.photoUrl.trim() !== ""
        ? rec.photoUrl.trim()
        : undefined;
    members.push(photoUrl ? { name, role, photoUrl } : { name, role });
  }
  return members;
}

/**
 * Parse the host_profiles.narrative jsonb into a validated {@link HostNarrative}.
 * Reads what is present; NEVER fabricates. Empty/malformed fields are dropped so
 * absent narrative stays absent (each showcase section then self-omits).
 */
function parseNarrative(raw: unknown): HostNarrative {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const why = typeof obj.whyWorkForUs === "string" ? obj.whyWorkForUs.trim() : "";
  const team = toTeam(obj.team);
  const activities = toStringList(obj.activities);
  const perks = toStringList(obj.perks);
  const narrative: HostNarrative = {};
  if (why !== "") narrative.whyWorkForUs = why;
  if (team.length > 0) narrative.team = team;
  if (activities.length > 0) narrative.activities = activities;
  if (perks.length > 0) narrative.perks = perks;
  return narrative;
}

/**
 * DEV-ONLY narrative so the /host/[id] showcase renders its Team / Activities /
 * Perks / Why-work sections on a local database whose host rows predate
 * migration 059 (or simply have not filled the block yet). Gated by NODE_ENV so
 * it can NEVER reach production — real prod narrative comes only from the DB.
 * Team members carry no photoUrl on purpose (framed placeholder avatars) so the
 * fixture needs no remote-image host allow-listing.
 */
const DEV_NARRATIVE_FIXTURE: Required<HostNarrative> = {
  whyWorkForUs:
    "We're a small, seasonal crew who care about doing good work and looking " +
    "after each other. Expect real responsibility, hands-on mentoring, and your " +
    "evenings free to enjoy where you are.",
  team: [
    { name: "Dana Whitfield", role: "Operations Lead" },
    { name: "Marco Reyes", role: "Field Manager" },
    { name: "Priya Anand", role: "Guest Experience" },
  ],
  activities: [
    "Sunset hikes",
    "Community dinners",
    "Weekend kayaking",
    "Local farmers markets",
  ],
  perks: [
    "Shared staff housing",
    "Daily crew meals",
    "Paid travel stipend",
    "End-of-season bonus",
  ],
};

/** Fill only the narrative fields the DB left empty — dev routes only. */
function applyDevNarrativeFallback(narrative: HostNarrative): HostNarrative {
  return {
    whyWorkForUs: narrative.whyWorkForUs ?? DEV_NARRATIVE_FIXTURE.whyWorkForUs,
    team:
      narrative.team && narrative.team.length > 0
        ? narrative.team
        : DEV_NARRATIVE_FIXTURE.team.map((member) => ({ ...member })),
    activities:
      narrative.activities && narrative.activities.length > 0
        ? narrative.activities
        : [...DEV_NARRATIVE_FIXTURE.activities],
    perks:
      narrative.perks && narrative.perks.length > 0
        ? narrative.perks
        : [...DEV_NARRATIVE_FIXTURE.perks],
  };
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
    .select(PUBLIC_PROFILE_SELECT)
    .eq("id", hostProfileId)
    .maybeSingle();

  if (error) throw new Error(`getPublicHostProfile: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const raw = row.social_links as Record<string, unknown> | null;
  const parsedNarrative = parseNarrative(row.narrative);
  // Dev-only: fill empty narrative so the showcase renders locally. Never prod.
  const narrative =
    process.env.NODE_ENV === "production"
      ? parsedNarrative
      : applyDevNarrativeFallback(parsedNarrative);
  return {
    id: String(row.id),
    companyName: typeof row.company_name === "string" ? row.company_name : "",
    hostName: typeof row.host_name === "string" ? row.host_name : null,
    tagline: typeof row.tagline === "string" ? row.tagline : null,
    about: typeof row.about === "string" ? row.about : null,
    primaryLocationName:
      typeof row.primary_location_name === "string" ? row.primary_location_name : null,
    photoUrl: typeof row.photo_url === "string" ? row.photo_url : null,
    websiteUrl: typeof row.website_url === "string" ? row.website_url : null,
    socialLinks: {
      instagram: typeof raw?.instagram === "string" ? raw.instagram : null,
      twitter: typeof raw?.twitter === "string" ? raw.twitter : null,
    },
    categoryScopes: Array.isArray(row.category_scopes) ? (row.category_scopes as string[]) : [],
    housingOfferedGenerally: row.housing_offered_generally === true,
    mealsOfferedGenerally: row.meals_offered_generally === true,
    verified: hasVerifiedHostSubscription(row.subscription_tier),
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    ...narrative,
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

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
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
