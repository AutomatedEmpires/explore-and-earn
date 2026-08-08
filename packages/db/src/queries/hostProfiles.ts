import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  MARKETPLACE_LANES,
  hasVerifiedHostSubscription,
  sanitizeHostBenefitLibrary,
  type HostBenefitLibrary,
  type HousingPhotoRole,
  type MarketplaceLane,
} from "@explore-and-earn/contracts";
import { anonClient, authedClient } from "../client";

/**
 * Host-profile data access for the host onboarding / management experience.
 *
 * SECURITY: migration 013 enables owner-scoped RLS using the Clerk `sub` in the
 * Supabase JWT. Reads and updates also retain explicit clerk_user_id filters as
 * defense in depth. Creation is narrower still: migration 073 exposes a single
 * JWT-derived RPC so callers can never choose identity/trust/lifecycle fields.
 */

/** Untyped Supabase handle (see TYPES note above). */
function untypedClient(clerkToken: string): SupabaseClient {
  return authedClient(clerkToken) as unknown as SupabaseClient;
}

export interface SocialLinks {
  instagram?: string | null;
  twitter?: string | null;
}

/** A host-authored answer shown on the public employer profile. */
export interface HostProfileFaq {
  question: string;
  answer: string;
}

/** Editable showcase content stored in host_profiles.narrative (migration 059). */
export interface HostProfileNarrative {
  whyWorkForUs?: string;
  team?: HostTeamMember[];
  activities?: string[];
  perks?: string[];
  culture?: string[];
  managementApproach?: string;
  typicalDay?: string;
  workEnvironment?: string;
  seasonRhythm?: string[];
  training?: string[];
  transportation?: string[];
  remoteness?: string;
  nearbyServices?: string[];
  housingDescription?: string;
  mealsDescription?: string;
  faqs?: HostProfileFaq[];
}

function toNarrativeText(value: unknown, maxLength = 3000): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function toNarrativeStringList(
  value: unknown,
  maxItems = 24,
  maxLength = 160,
): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .slice(0, maxItems)
    .map((entry) => entry.slice(0, maxLength));
}

function toNarrativeTeam(value: unknown): HostTeamMember[] {
  if (!Array.isArray(value)) return [];
  const members: HostTeamMember[] = [];
  for (const entry of value.slice(0, 12)) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim().slice(0, 120) : "";
    const role = typeof rec.role === "string" ? rec.role.trim().slice(0, 120) : "";
    if (name === "" && role === "") continue;
    const photoUrl =
      typeof rec.photoUrl === "string" && rec.photoUrl.trim() !== ""
        ? rec.photoUrl.trim().slice(0, 2000)
        : undefined;
    members.push(photoUrl ? { name, role, photoUrl } : { name, role });
  }
  return members;
}

function toNarrativeFaqs(value: unknown): HostProfileFaq[] {
  if (!Array.isArray(value)) return [];
  const faqs: HostProfileFaq[] = [];
  for (const entry of value.slice(0, 12)) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const question = toNarrativeText(rec.question, 240);
    const answer = toNarrativeText(rec.answer, 1600);
    if (question === "" || answer === "") continue;
    faqs.push({ question, answer });
  }
  return faqs;
}

/**
 * Normalizes the public showcase block for both reads and owner writes. Empty
 * values are omitted so public sections truthfully self-hide.
 */
export function sanitizeHostProfileNarrative(raw: unknown): HostProfileNarrative {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const why = toNarrativeText(obj.whyWorkForUs);
  const team = toNarrativeTeam(obj.team);
  const activities = toNarrativeStringList(obj.activities);
  const perks = toNarrativeStringList(obj.perks);
  const culture = toNarrativeStringList(obj.culture, 16, 200);
  const managementApproach = toNarrativeText(obj.managementApproach);
  const typicalDay = toNarrativeText(obj.typicalDay);
  const workEnvironment = toNarrativeText(obj.workEnvironment);
  const seasonRhythm = toNarrativeStringList(obj.seasonRhythm, 16, 240);
  const training = toNarrativeStringList(obj.training, 16, 240);
  const transportation = toNarrativeStringList(obj.transportation, 16, 240);
  const remoteness = toNarrativeText(obj.remoteness, 2000);
  const nearbyServices = toNarrativeStringList(obj.nearbyServices, 24, 160);
  const housingDescription = toNarrativeText(obj.housingDescription, 2000);
  const mealsDescription = toNarrativeText(obj.mealsDescription, 2000);
  const faqs = toNarrativeFaqs(obj.faqs);
  const narrative: HostProfileNarrative = {};
  if (why !== "") narrative.whyWorkForUs = why;
  if (team.length > 0) narrative.team = team;
  if (activities.length > 0) narrative.activities = activities;
  if (perks.length > 0) narrative.perks = perks;
  if (culture.length > 0) narrative.culture = culture;
  if (managementApproach !== "") narrative.managementApproach = managementApproach;
  if (typicalDay !== "") narrative.typicalDay = typicalDay;
  if (workEnvironment !== "") narrative.workEnvironment = workEnvironment;
  if (seasonRhythm.length > 0) narrative.seasonRhythm = seasonRhythm;
  if (training.length > 0) narrative.training = training;
  if (transportation.length > 0) narrative.transportation = transportation;
  if (remoteness !== "") narrative.remoteness = remoteness;
  if (nearbyServices.length > 0) narrative.nearbyServices = nearbyServices;
  if (housingDescription !== "") narrative.housingDescription = housingDescription;
  if (mealsDescription !== "") narrative.mealsDescription = mealsDescription;
  if (faqs.length > 0) narrative.faqs = faqs;
  return narrative;
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
  /** Concrete marketplace lanes this host operates in (`mix` is derived). */
  categoryScopes?: MarketplaceLane[];
  /** Reusable host-level Housing evidence (migration 072). */
  benefitLibrary?: HostBenefitLibrary;
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
  /** False while migration 072 has not reached the connected database. */
  benefitLibraryAvailable: boolean;
  benefitLibrary: HostBenefitLibrary;
  narrative: HostProfileNarrative;
}

const HOST_PROFILE_SELECT =
  "id,company_name,host_name,tagline,about,primary_location_name,photo_url," +
  "website_url,social_links,category_scopes,housing_offered_generally," +
  "meals_offered_generally,subscription_tier,narrative";

function isMissingBenefitLibraryRpc(error: { code?: string; message?: string }): boolean {
  const message = error.message?.toLowerCase() ?? "";
  const namesExpectedRpc = message.includes("get_my_host_benefit_library");
  return (
    error.code === "PGRST202" ||
    (namesExpectedRpc &&
      (error.code === "42883" ||
        message.includes("could not find the function") ||
        message.includes("does not exist")))
  );
}

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
    benefitLibraryAvailable: row.benefit_library_available === true,
    benefitLibrary: sanitizeHostBenefitLibrary(row.benefit_library),
    narrative: sanitizeHostProfileNarrative(row.narrative),
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
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`getHostProfile: ${error.message}`);
  if (!data) return null;
  let benefitLibrary: unknown = {};
  let benefitLibraryAvailable = false;
  if (typeof db.rpc === "function") {
    const { data: library, error: libraryError } = await db.rpc(
      "get_my_host_benefit_library",
    );
    if (libraryError && !isMissingBenefitLibraryRpc(libraryError)) {
      throw new Error(`getHostProfile: ${libraryError.message}`);
    }
    if (!libraryError) {
      benefitLibrary = library;
      benefitLibraryAvailable = true;
    }
  }
  return rowToHostProfile({
    ...(data as unknown as Record<string, unknown>),
    benefit_library: benefitLibrary,
    benefit_library_available: benefitLibraryAvailable,
  });
}

/**
 * Resolve whether the authenticated Clerk user owns an active host profile.
 *
 * The authenticated client keeps RLS in force while the explicit owner and
 * lifecycle filters provide defense in depth. Only the row id is selected: a
 * navigation-role check must not load or expose profile content.
 */
export async function hasHostProfile(
  clerkToken: string,
  clerkUserId: string,
): Promise<boolean> {
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db
      .from("host_profiles")
      .select("id")
      .eq("clerk_user_id", clerkUserId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error("lookup_failed");
    return data !== null;
  } catch {
    const error = new Error("Host profile lookup failed.");
    error.name = "HostProfileLookupError";
    throw error;
  }
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
    const allowed = MARKETPLACE_LANES as readonly string[];
    patch.category_scopes = Array.from(
      new Set(fields.categoryScopes.filter((c) => allowed.includes(c))),
    );
  }
  if (fields.benefitLibrary !== undefined) {
    patch.benefit_library = sanitizeHostBenefitLibrary(fields.benefitLibrary);
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

/**
 * Atomically replace one reusable Housing role for the current host. Migration
 * 072 locks the profile row, preserves every other role, and returns the exact
 * displaced URL so trusted Storage cleanup cannot race another tab.
 */
export async function setMyHousingLibraryPhoto(
  clerkToken: string,
  role: HousingPhotoRole,
  url: string,
): Promise<{
  ok: boolean;
  error?: string;
  hostProfileId?: string;
  previousUrl?: string;
  benefitLibrary?: HostBenefitLibrary;
}> {
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db.rpc("set_my_housing_library_photo", {
      p_role: role,
      p_url: url,
    });
    if (error) return { ok: false, error: error.message };
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row !== "object") {
      return { ok: false, error: "update_failed" };
    }
    const result = row as Record<string, unknown>;
    return {
      ok: true,
      hostProfileId:
        typeof result.host_profile_id === "string" ? result.host_profile_id : undefined,
      previousUrl:
        typeof result.previous_url === "string" ? result.previous_url : undefined,
      benefitLibrary: sanitizeHostBenefitLibrary(result.benefit_library),
    };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "update_failed",
    };
  }
}

export interface CreateHostProfileInput {
  readonly companyName: string;
  readonly categoryScopes: readonly MarketplaceLane[];
  readonly primaryLocationName: string | null;
}

export async function createHostProfile(
  clerkToken: string,
  input: CreateHostProfileInput,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  try {
    const db = untypedClient(clerkToken);
    const { data, error } = await db.rpc("create_my_host_profile", {
      p_company_name: input.companyName,
      p_category_scopes: [...input.categoryScopes],
      p_primary_location_name: input.primaryLocationName,
    });
    if (error) return { ok: false, error: error.message };
    if (typeof data !== "string" || data.length === 0) {
      return { ok: false, error: "host_profile_create_failed" };
    }
    return { ok: true, id: data };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "host_profile_create_failed",
    };
  }
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
export interface PublicHostProfile extends HostProfileNarrative {
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
  /* Showcase narrative is inherited from HostProfileNarrative. Every field is
     optional so legacy rows and incomplete profiles render without placeholders. */
}

const PUBLIC_PROFILE_SELECT =
  "id,company_name,host_name,tagline,about,primary_location_name,photo_url," +
  "website_url,social_links,category_scopes,housing_offered_generally," +
  "meals_offered_generally,subscription_tier,created_at,narrative";

/**
 * DEV-ONLY narrative so the /host/[id] showcase renders its Team / Activities /
 * Perks / Why-work sections on a local database whose host rows predate
 * migration 059 (or simply have not filled the block yet). Gated by NODE_ENV so
 * it can NEVER reach production — real prod narrative comes only from the DB.
 * Team members carry no photoUrl on purpose (framed placeholder avatars) so the
 * fixture needs no remote-image host allow-listing.
 */
const DEV_NARRATIVE_FIXTURE: Required<
  Pick<HostProfileNarrative, "whyWorkForUs" | "team" | "activities" | "perks">
> = {
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
function applyDevNarrativeFallback(
  narrative: HostProfileNarrative,
): HostProfileNarrative {
  return {
    ...narrative,
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
  const parsedNarrative = sanitizeHostProfileNarrative(row.narrative);
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
  /** Listing-scoped coordinates, used for public weather without exposing a host address. */
  latitude: number | null;
  longitude: number | null;
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
        "latitude, longitude, meals_included, compensation_summary, compensation_min_cents, " +
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
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
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
