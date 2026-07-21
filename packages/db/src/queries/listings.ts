import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BenefitEvidenceStatus,
  BenefitProvision,
  CompensationUnit,
  DiscoveryCardConditionalBadge,
  EffectiveHousingPhoto,
  ListingCategoryDepth,
  ListingClaimSummary,
  ListingLogistics,
  ListingProvenanceInfo,
  ListingStatus,
  OpportunityCategory,
  OpportunityListing,
} from "@explore-and-earn/contracts";
import {
  HOST_CHOICE_EVIDENCE,
  MARKETPLACE_CATEGORIES,
  formatCompensation,
  hostBenefitDecision,
  formatOpportunityWindow,
  hasVerifiedHostSubscription,
  sanitizeCategoryDepth,
  sanitizeLogistics,
} from "@explore-and-earn/contracts";
import { adminClient } from "../adminClient";
import { anonClient, authedClient } from "../client";
import { getPublicHousingPhotos } from "./benefitDetails";
import { getActiveBoostedListingIds, getSeekerApplicationIds } from "./idReaders";
import { getPassedListingIds } from "./passedListings";

export interface ListingRow {
  id: string;
  host_profile_id: string | null;
  title: string;
  category: OpportunityCategory;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
  housing_description: string | null;
  meals_description: string | null;
  visa_support: boolean;
  compensation_summary: string | null;
  compensation_min_cents: number | null;
  compensation_max_cents: number | null;
  compensation_unit: string | null;
  compensation_currency: string;
  timeline_summary: string | null;
  begins_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  cover_photo_url: string | null;
  gallery_photo_urls: string[] | null;
  host_profiles: {
    company_name: string;
    subscription_tier: string | null;
  } | null;
  /* ── Provenance (migration 064) ──
     'verified' = host-authored/claimed; 'sourced' = real attributable public
     posting, NOT employer-confirmed. Evidence columns carry the epistemic
     status per triad benefit ('not_stated' means the boolean value columns are
     MEANINGLESS for that benefit — render/rank as missing, never as "no"). */
  provenance: "verified" | "sourced";
  source_name: string | null;
  source_url: string | null;
  source_external_id: string | null;
  source_employer_name: string | null;
  source_published_at: string | null;
  source_last_seen_at: string | null;
  source_status: string;
  claim_summary: string;
  housing_evidence: BenefitEvidenceStatus;
  meals_evidence: BenefitEvidenceStatus;
  pay_evidence: BenefitEvidenceStatus;
  /**
   * Host-stated relocation logistics (068), sanitized. Carried on the HOST row
   * so the edit form can hydrate it — an un-hydrated field re-saves empty and
   * wipes the host's own answers (the trap this file's edit page already
   * documents for housing/meals/gallery).
   */
  logistics: ListingLogistics;
  /**
   * Host-stated category-scoped depth (069), sanitized. Carried on the HOST row
   * for the same hydration reason as logistics — and note it is carried
   * REGARDLESS of the listing's current category, so a host who re-lanes a
   * listing can still see and clear facts they stated earlier rather than
   * leaving them stranded and uneditable.
   */
  category_depth: ListingCategoryDepth;
}

type RawListingRow = {
  id: string;
  host_profile_id: string | null;
  title: string;
  category: string;
  description: string | null;
  location_display: string | null;
  latitude: number | null;
  longitude: number | null;
  status: string;
  housing_included: boolean;
  meals_included: boolean;
  housing_description: string | null;
  meals_description: string | null;
  visa_support: boolean;
  compensation_summary: string | null;
  compensation_min_cents: number | null;
  compensation_max_cents: number | null;
  compensation_unit: string | null;
  compensation_currency: string;
  timeline_summary: string | null;
  begins_at: string | null;
  ends_at: string | null;
  published_at: string | null;
  cover_photo_url: string | null;
  gallery_photo_urls: string[] | null;
  host_profiles: { company_name: string; subscription_tier: string | null } | null;
  provenance: string;
  source_name: string | null;
  source_url: string | null;
  source_external_id: string | null;
  source_employer_name: string | null;
  source_published_at: string | null;
  source_last_seen_at: string | null;
  source_status: string;
  claim_summary: string;
  housing_evidence: string;
  meals_evidence: string;
  pay_evidence: string;
  logistics: unknown;
  category_depth: unknown;
};

// Display strings (opportunity window + compensation summary) are formatted via
// the shared, locale-ready chokepoint in @explore-and-earn/contracts \u2014 the DB
// layer no longer builds currency/date strings inline (no locale or currency
// literals here). These thin adapters feed raw row columns to the formatters.
function buildOpportunityWindow(
  row: Pick<ListingRow, "begins_at" | "ends_at" | "timeline_summary">,
): string {
  return formatOpportunityWindow({
    timelineSummary: row.timeline_summary,
    begins: row.begins_at,
    ends: row.ends_at,
  });
}

function buildCompensationSummary(
  row: Pick<
    ListingRow,
    | "compensation_summary"
    | "compensation_min_cents"
    | "compensation_max_cents"
    | "compensation_unit"
    | "compensation_currency"
  >,
): string {
  return formatCompensation({
    summary: row.compensation_summary,
    minCents: row.compensation_min_cents,
    maxCents: row.compensation_max_cents,
    unit: row.compensation_unit,
    currency: row.compensation_currency,
  });
}

/**
 * Coerce a stored evidence string, falling back to the WEAKEST claim.
 *
 * The fallback used to be "confirmed" — so an unrecognised or NULL value became
 * the strongest possible assertion (an authenticated employer confirmed this).
 * A value we cannot vouch for must degrade to "nobody stated it", never to
 * "someone confirmed it": the whole point of the evidence model is that silence
 * is visible. This mirrors listingClaims.ts, which already coerces to
 * not_stated, and the sanitize-on-read rule the jsonb contracts follow.
 */
const asEvidence = (value: string | null | undefined): BenefitEvidenceStatus =>
  value === "stated" || value === "confirmed" ? value : "not_stated";

function toListingRow(raw: RawListingRow): ListingRow {
  return {
    ...raw,
    category: raw.category as OpportunityCategory,
    provenance: raw.provenance === "sourced" ? "sourced" : "verified",
    housing_evidence: asEvidence(raw.housing_evidence),
    meals_evidence: asEvidence(raw.meals_evidence),
    pay_evidence: asEvidence(raw.pay_evidence),
    // Sanitized on read: the jsonb is the one place a shape the contract never
    // allowed could have been written, and an unvouchable value must read as
    // "Not stated" rather than as something the host said.
    logistics: sanitizeLogistics(raw.logistics),
    category_depth: sanitizeCategoryDepth(raw.category_depth),
  };
}

/**
 * Build the contract provenance block for a row. Returns undefined for
 * verified-NATIVE rows (legacy behavior, zero new payload) and a full block —
 * attribution, claim summary, per-benefit evidence — for sourced rows and for
 * converted rows (which stay 'verified' but preserve their source lineage).
 */
export function rowProvenanceInfo(
  row: Pick<
    ListingRow,
    | "provenance"
    | "source_name"
    | "source_url"
    | "source_external_id"
    | "source_employer_name"
    | "source_published_at"
    | "source_last_seen_at"
    | "claim_summary"
    | "housing_evidence"
    | "meals_evidence"
    | "pay_evidence"
  >,
): ListingProvenanceInfo | undefined {
  const converted = row.provenance === "verified" && row.claim_summary === "converted";
  // A host-authored listing carries no SOURCING story, but it does carry
  // evidence — and returning undefined here is why that evidence never reached
  // the screen. Every `evidence?.housing === "not_stated"` guard in
  // DealUpfront / DiscoveryCard / QuickPeekDrawer was dead code for host rows,
  // so the triad silently fell through to `included ? "Included" : "Not
  // included"` no matter what the column said. Writing honest evidence without
  // fixing this would change the database and change nothing a seeker sees.
  //
  // The sourcing fields stay absent for host rows (there is no source to
  // disclose); only the evidence is carried.
  if (row.provenance !== "sourced" && !converted) {
    return {
      provenance: "verified",
      claimStatus: "not_applicable",
      benefitEvidence: {
        housing: asEvidence(row.housing_evidence),
        meals: asEvidence(row.meals_evidence),
        pay: asEvidence(row.pay_evidence),
      },
    };
  }

  const claimStatus: ListingClaimSummary =
    row.claim_summary === "claim_pending" || row.claim_summary === "converted"
      ? row.claim_summary
      : row.provenance === "sourced"
        ? "unclaimed"
        : "not_applicable";

  return {
    provenance: row.provenance,
    // Attribution only travels on SOURCED (unconfirmed) listings; a converted
    // listing keeps its lineage in the DB but presents as its host's own.
    ...(row.provenance === "sourced" && row.source_name
      ? {
          source: {
            sourceName: row.source_name,
            sourceUrl: row.source_url,
            sourcePostingId: row.source_external_id,
            publishedAt: row.source_published_at,
            retrievedAt: row.source_last_seen_at,
            employerName: row.source_employer_name,
          },
        }
      : {}),
    claimStatus,
    // ALWAYS the real columns: verified-native rows are 'confirmed' by
    // migration default, sourced rows carry stated/not_stated, and a converted
    // row keeps 'not_stated' for any benefit the employer never explicitly
    // addressed — the constant would fabricate a confirmation there.
    benefitEvidence: {
      housing: row.housing_evidence,
      meals: row.meals_evidence,
      pay: row.pay_evidence,
    },
  };
}

/**
 * The stored match score a listing must reach before its numeric % is shown on
 * a card (founder decision, MATCH SCORE). Below this the card shows no match
 * pill. Read-only: scores are never recomputed here, only the stored value is
 * gated. Mirror of MEANINGFUL_MATCH_SCORE_THRESHOLD in apps/web/lib/ranking.ts
 * (packages can't share a runtime const without a common non-server dep).
 */
export const MEANINGFUL_MATCH_SCORE_THRESHOLD = 75;

/**
 * Per-render enrichment for {@link rowToDiscoveryFields}. Every field is
 * optional and self-omitting — the shared mapper is used by anon, host, and
 * seeker surfaces, and only the seeker surfaces resolve these sets. Resolve them
 * ONCE per request (see {@link resolveSeekerDiscoveryScope} /
 * {@link getActiveBoostedListingIds}) and thread the same object to every row.
 */
export interface DiscoveryEnrichment {
  /** Listing ids with an active boost campaign — stamped as the "boosted" badge. */
  readonly boostedListingIds?: ReadonlySet<string>;
  /**
   * Listing ids the seeker previously skipped (listing_passes). Off the swipe
   * deck these stay VISIBLE but are flagged (previouslySkipped) + demoted in
   * rank (see rankForSeeker); the swipe deck excludes them entirely.
   */
  readonly previouslySkippedIds?: ReadonlySet<string>;
  /**
   * Stored ADR-040 match scores by listing id (read-only cache). A score is
   * surfaced as `matchScore` only when it clears
   * {@link MEANINGFUL_MATCH_SCORE_THRESHOLD}; lower/absent scores show no pill.
   */
  readonly matchScores?: ReadonlyMap<string, number>;
}

/**
 * The shared discovery view-model — {@link OpportunityListing} plus the
 * per-seeker `previouslySkipped` flag stamped by {@link rowToDiscoveryFields}.
 * Assignable anywhere an OpportunityListing is expected (the extra field is
 * optional); the web `DiscoveryListing` alias re-exposes it to surfaces.
 */
export interface DiscoveryFields extends OpportunityListing {
  /**
   * Seeker previously skipped this listing (demote-but-visible surfaces). The
   * card renders a subtle "Previously skipped" photo marker; ranking demotes it.
   */
  readonly previouslySkipped?: boolean;
}

/** Maps a ListingRow to the DiscoveryListing view-model fields. */
export function rowToDiscoveryFields(
  row: ListingRow,
  enrich?: DiscoveryEnrichment,
): DiscoveryFields {
  const isSourced = row.provenance === "sourced";
  // A sourced listing has NO host: the "host" slot carries the employer name
  // AS STATED BY THE SOURCE (falling back to the source's own name), display-
  // only — never verified, never linked to a host profile, never tiered.
  const hostName = isSourced
    ? row.source_employer_name ?? row.source_name ?? "Employer not stated"
    : row.host_profiles?.company_name ?? "Unknown Host";
  const verified =
    !isSourced && hasVerifiedHostSubscription(row.host_profiles?.subscription_tier);

  const housingProvision: BenefitProvision = row.housing_included ? "provided" : "not_provided";
  const mealsProvision: BenefitProvision = row.meals_included ? "provided" : "not_provided";

  // Boosted marker travels on EVERY card, not just the homepage (founder
  // decision). Stamped from the shared active-boost set when provided.
  const conditionalBadges: readonly DiscoveryCardConditionalBadge[] | undefined =
    enrich?.boostedListingIds?.has(row.id) ? (["boosted"] as const) : undefined;

  // Read-only stored match score, gated to the meaningful threshold. Never
  // recomputed here — a listing with no stored score simply shows none.
  const storedScore = enrich?.matchScores?.get(row.id);
  const matchScore =
    typeof storedScore === "number" && storedScore >= MEANINGFUL_MATCH_SCORE_THRESHOLD
      ? storedScore
      : undefined;

  const previouslySkipped = enrich?.previouslySkippedIds?.has(row.id) ? true : undefined;

  return {
    id: row.id,
    title: row.title,
    category: row.category,
    location: row.location_display ?? "Location not specified",
    opportunityWindow: buildOpportunityWindow(row),
    begins: row.begins_at ?? undefined,
    ends: row.ends_at ?? undefined,
    status: row.status as ListingStatus,
    conditionalBadges,
    matchScore,
    previouslySkipped,
    host: {
      // Sourced listings expose NO host id — there is no host profile to
      // open, review, or navigate to (structural, not cosmetic).
      id: isSourced ? undefined : row.host_profile_id ?? undefined,
      name: hostName,
      verified,
      // Monetization ranking ("pay more, show more"): expose the host's real
      // active subscription tier so Enterprise > Professional > Starter is
      // honored. Never fabricated — anything other than a known paid tier
      // (incl. null/free/unknown) maps to "none" (ranks last, never hidden).
      // Sourced inventory is always "none": unconfirmed listings never carry
      // monetization rank.
      tier:
        !isSourced &&
        (row.host_profiles?.subscription_tier === "starter" ||
          row.host_profiles?.subscription_tier === "professional" ||
          row.host_profiles?.subscription_tier === "enterprise")
          ? row.host_profiles!.subscription_tier as "starter" | "professional" | "enterprise"
          : "none",
    },
    provenanceInfo: rowProvenanceInfo(row),
    benefits: {
      housing: {
        provision: housingProvision,
        summary: row.housing_description ?? undefined,
      },
      meals: {
        provision: mealsProvision,
        summary: row.meals_description ?? undefined,
      },
      pay: {
        provision: "provided" as BenefitProvision,
        summary: buildCompensationSummary(row),
      },
    },
    payInsight:
      row.compensation_min_cents != null || row.compensation_max_cents != null
        ? {
            minCents: row.compensation_min_cents ?? undefined,
            maxCents: row.compensation_max_cents ?? undefined,
            unit: (row.compensation_unit as CompensationUnit | null) ?? null,
            currency: row.compensation_currency,
          }
        : undefined,
    visaSupport: row.visa_support,
    coverImageUrl: row.cover_photo_url ?? undefined,
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lon: row.longitude }
        : undefined,
  };
}

/**
 * The per-seeker discovery scope, resolved ONCE and threaded through the shared
 * filter + mapper + ranking on a seeker surface:
 *   - `appliedIds`  — non-withdrawn applications; HARD-hidden everywhere (never
 *     reshow an applied listing as applyable).
 *   - `skippedIds`  — listing_passes; excluded from the swipe deck, elsewhere
 *     demoted + flagged (previouslySkipped).
 *   - `boostedIds`  — active boost campaigns; stamped as the boosted badge.
 *
 * Every read is best-effort/independent (Promise.allSettled) so one failing
 * axis (e.g. pre-057 passes, pre-029 boosts) degrades that axis to empty rather
 * than breaking the whole surface. `clerkUserId` MUST come from auth().userId.
 */
export interface SeekerDiscoveryScope {
  readonly appliedIds: Set<string>;
  readonly skippedIds: Set<string>;
  readonly boostedIds: Set<string>;
}

export async function resolveSeekerDiscoveryScope(
  clerkToken: string,
  clerkUserId: string,
): Promise<SeekerDiscoveryScope> {
  const [applied, skipped, boosted] = await Promise.allSettled([
    getSeekerApplicationIds(clerkToken, clerkUserId),
    getPassedListingIds(clerkToken, clerkUserId),
    getActiveBoostedListingIds(clerkToken),
  ]);
  return {
    appliedIds: new Set(applied.status === "fulfilled" ? applied.value : []),
    skippedIds: new Set(skipped.status === "fulfilled" ? skipped.value : []),
    boostedIds:
      boosted.status === "fulfilled" ? boosted.value : new Set<string>(),
  };
}

/**
 * Build a {@link DiscoveryEnrichment} from a resolved {@link SeekerDiscoveryScope}
 * (+ optional stored match scores). The one place surfaces turn the scope into
 * the object threaded to {@link rowToDiscoveryFields} for every row.
 */
export function enrichmentFromScope(
  scope: SeekerDiscoveryScope,
  matchScores?: ReadonlyMap<string, number>,
): DiscoveryEnrichment {
  return {
    boostedListingIds: scope.boostedIds,
    previouslySkippedIds: scope.skippedIds,
    matchScores,
  };
}

/** Provenance columns (migration 064) shared by BOTH column constants below. */
const PROVENANCE_COLUMNS =
  "provenance,source_name,source_url,source_external_id,source_employer_name," +
  "source_published_at,source_last_seen_at,source_status,claim_summary," +
  "housing_evidence,meals_evidence,pay_evidence";

const LISTING_COLUMNS =
  "id,host_profile_id,title,category,description,location_display,latitude,longitude,status,housing_included,meals_included,housing_description,meals_description,visa_support,compensation_summary,compensation_min_cents,compensation_max_cents,compensation_unit,compensation_currency,timeline_summary,begins_at,ends_at,published_at,cover_photo_url,gallery_photo_urls,logistics,category_depth," +
  PROVENANCE_COLUMNS +
  ",host_profiles(company_name,subscription_tier)";

/** Max cards returned per swipe-deck page (Task 1/Task 3 batch size). */
export const SWIPE_BATCH_SIZE = 20;

/**
 * Default candidate cap for the public live-listings feed. Discovery scores and
 * re-ranks in Node, then slices to ~20, so pulling the entire `listings` table
 * on every render is pure waste. 200 most-recently-published live listings is a
 * generous candidate pool for scoring at launch scale; callers that genuinely
 * need the full set (e.g. the sitemap) pass an explicit higher cap.
 */
export const PUBLIC_LISTINGS_FEED_CAP = 200;

/** Public live listings \u2014 no auth required. Bounded to `limit` most-recent. */
export async function getPublicListings(
  limit: number = PUBLIC_LISTINGS_FEED_CAP,
): Promise<ListingRow[]> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getPublicListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/** Single live listing by id \u2014 no auth required. */
export async function getPublicListingById(id: string): Promise<ListingRow | null> {
  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("id", id)
    .eq("status", "live")
    .maybeSingle();

  if (error) throw new Error(`getPublicListingById: ${error.message}`);
  return data ? toListingRow(data as unknown as RawListingRow) : null;
}

/**
 * Batch variant of getPublicListingById: fetch many live listings in a single
 * query instead of one round-trip per id (eliminates the N+1 on the
 * saved/applied/messages surfaces). No auth required (public listings).
 */
export async function getPublicListingsByIds(ids: string[]): Promise<ListingRow[]> {
  if (ids.length === 0) return [];

  const { data, error } = await anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .in("id", ids)
    .eq("status", "live");

  if (error) throw new Error(`getPublicListingsByIds: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * NON-live listings the seeker has SAVED — the /saved honesty read.
 *
 * RLS (listings_select_public) hides non-live rows from seekers, so a saved
 * listing that closed/paused/archived silently VANISHES from the saved bucket.
 * This renders an honest muted "no longer available" card instead of nothing.
 *
 * SECURITY: the id set is derived INSIDE this function from the caller's own
 * saved rows (getSavedListingIds under their own token) — the service-role
 * read that follows can only ever surface listings this seeker saved while
 * they were live, no matter how a future call site invokes it. The safe path
 * is the only path; there is no raw-ids variant.
 *
 * Best-effort by design: environments without a service-role key, or any read
 * fault, degrade to [] (the listing stays hidden — the pre-existing behavior).
 */
export async function getNonLiveSavedListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<ListingRow[]> {
  try {
    // Lazy import: savedListings.ts statically imports from THIS module, so a
    // static back-import would create a cycle (the same class idReaders.ts
    // exists to break). Call-time resolution keeps the modules acyclic.
    const { getSavedListingIds } = await import("./savedListings");
    const savedIds = await getSavedListingIds(clerkToken, clerkUserId);
    if (savedIds.length === 0) return [];
    const { data, error } = await (adminClient() as unknown as SupabaseClient)
      .from("listings")
      .select(LISTING_COLUMNS)
      .in("id", savedIds)
      .neq("status", "live");
    if (error) return [];
    return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
  } catch {
    return [];
  }
}

/**
 * Composite swipe cursor: `"<published_at>|<id>"` of the last row on a page.
 *
 * The deck orders (published_at DESC, id DESC), so a published_at-only cursor
 * SKIPS every remaining row that shares the boundary timestamp \u2014 the id half
 * makes the keyset complete. Returns null when the row has no published_at
 * (the deck is exhausted / unpageable past it).
 */
export function encodeSwipeCursor(
  row: Pick<ListingRow, "published_at" | "id">,
): string | null {
  return row.published_at ? `${row.published_at}|${row.id}` : null;
}

/** ISO timestamp shape published_at values take (strict \u2014 gates or() interpolation). */
const SWIPE_CURSOR_TIMESTAMP_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:?\d{2}|Z)?$/;
/** Canonical RFC-4122 UUID shape (mirrors the action-layer sanitizer). */
const SWIPE_CURSOR_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parse a swipe cursor, tolerating BOTH formats in flight:
 *   - composite `"<published_at>|<id>"` (current, complete keyset),
 *   - legacy bare published_at (clients holding a cursor from before the
 *     composite format shipped \u2014 degrades to the old timestamp-only page),
 *   - anything else \u2192 null: the cursor is IGNORED (first page) rather than
 *     handed to PostgREST, where an invalid timestamp fails the whole request.
 *
 * The composite path is taken only when both halves pass their strict shape
 * checks \u2014 they are interpolated into a PostgREST or() group. The legacy path
 * also requires a valid timestamp shape: paging is best-effort, and a
 * malformed/hostile cursor must degrade, never 400.
 */
function parseSwipeCursor(
  cursor: string,
): { publishedAt: string; id: string } | { publishedAt: string; id?: undefined } | null {
  const sep = cursor.indexOf("|");
  if (sep !== -1) {
    const publishedAt = cursor.slice(0, sep);
    const id = cursor.slice(sep + 1);
    if (SWIPE_CURSOR_TIMESTAMP_RE.test(publishedAt) && SWIPE_CURSOR_UUID_RE.test(id)) {
      return { publishedAt, id };
    }
    return null;
  }
  return SWIPE_CURSOR_TIMESTAMP_RE.test(cursor) ? { publishedAt: cursor } : null;
}

/**
 * Swipe-deck batch for the authenticated seeker (/swipe surface).
 *
 * Returns up to SWIPE_BATCH_SIZE live listings, newest-first with a stable
 * (published_at DESC, id DESC) order so cursor pagination below is
 * deterministic. Excludes:
 *   - every id in `excludeIds` (cards already seen this session + the seeker's
 *     saved ids passed by the caller), and
 *   - every listing the seeker has already applied to (resolved server-side via
 *     getSeekerApplicationIds \u2014 never trust a client-supplied applied set).
 *
 * `clerkUserId` MUST come from auth().userId \u2014 never decoded from the token.
 * `cursor` is the {@link encodeSwipeCursor} value of the last row from the
 * previous page: a composite (published_at, id) keyset so rows sharing the
 * boundary timestamp are never skipped. Legacy bare-timestamp cursors from
 * in-flight clients still page (timestamp-only, the old behavior).
 *
 * Best-effort on the applied filter: a seeker with no profile resolves to [] so
 * nothing is excluded on that axis.
 */
export async function getSwipeBatch(
  clerkToken: string,
  clerkUserId: string,
  excludeIds: string[],
  cursor?: string,
): Promise<ListingRow[]> {
  // Server-resolved exclusions: applications AND persisted passes (057) —
  // a passed card never resurfaces in a later session. Best-effort on the
  // pass read so a transient failure degrades to a fuller deck, not a crash.
  const [appliedIds, passedIds] = await Promise.all([
    getSeekerApplicationIds(clerkToken, clerkUserId),
    getPassedListingIds(clerkToken, clerkUserId).catch(() => [] as string[]),
  ]);
  const exclude = Array.from(new Set([...excludeIds, ...appliedIds, ...passedIds]));

  let builder = authedClient(clerkToken)
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live");

  if (cursor) {
    const parsed = parseSwipeCursor(cursor);
    if (parsed?.id) {
      // Complete (published_at, id) keyset: strictly-older timestamps PLUS the
      // rest of the boundary timestamp's rows (id DESC below the cursor id).
      // Both halves are shape-validated above, so the or() string is inert;
      // the timestamp is double-quoted for its `:` / `+` characters.
      builder = builder.or(
        `published_at.lt."${parsed.publishedAt}",` +
          `and(published_at.eq."${parsed.publishedAt}",id.lt.${parsed.id})`,
      );
    } else if (parsed) {
      // Legacy bare-timestamp cursor: the old timestamp-only page.
      builder = builder.lt("published_at", parsed.publishedAt);
    }
    // parsed === null: malformed/hostile cursor — ignored (first page) rather
    // than sent to PostgREST, where an invalid timestamp 400s the request.
  }
  if (exclude.length > 0) {
    // PostgREST not-in group: values are UUIDs (validated at the action layer),
    // so a bare `(id1,id2,...)` list is safe \u2014 no quoting/escaping needed.
    builder = builder.not("id", "in", `(${exclude.join(",")})`);
  }

  const { data, error } = await builder
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SWIPE_BATCH_SIZE);

  if (error) throw new Error(`getSwipeBatch: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * All live listings that carry geocoordinates, newest-first \u2014 backs the seeker
 * /map surface. latitude/longitude are the real columns (the brief's lat/lng);
 * rows missing either are filtered out so every result is mappable.
 *
 * Public data (same trust level as getPublicListings). Pass a Clerk token to go
 * through the authed client, or omit it to use the anon client (the map is a
 * public read).
 */
export async function getLiveListingsWithCoords(
  clerkToken?: string,
  clerkUserId?: string,
): Promise<ListingRow[]> {
  const db = clerkToken ? authedClient(clerkToken) : anonClient();

  // Applied HARD-exclusion (shared filter): when a seeker is signed in, drop the
  // listings they've already applied to (non-withdrawn) so an applied listing is
  // never reshown as applyable — on the map as everywhere. Withdrawn rows are NOT
  // excluded (getSeekerApplicationIds skips them), keeping re-apply possible.
  // Best-effort: a failed lookup degrades to no exclusion, never a broken map.
  let appliedIds: string[] = [];
  if (clerkToken && clerkUserId) {
    appliedIds = await getSeekerApplicationIds(clerkToken, clerkUserId).catch(
      () => [] as string[],
    );
  }

  let builder = db
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (appliedIds.length > 0) {
    builder = builder.not("id", "in", `(${appliedIds.join(",")})`);
  }

  const { data, error } = await builder.order("published_at", {
    ascending: false,
  });

  if (error) throw new Error(`getLiveListingsWithCoords: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/**
 * Filters accepted by {@link searchListings}. Every field is optional; an empty
 * filter object returns the newest live listings (the same set as
 * getPublicListings, capped by `limit`).
 *
 * startDateAfter / startDateBefore filter on the listing `begins_at` column
 * (ISO date or timestamp strings). `offset` opts into range-based pagination;
 * when omitted the query falls back to a simple `.limit(limit)`.
 */
export interface SearchFilters {
  query?: string;
  categories?: string[];
  hasHousing?: boolean;
  hasMeals?: boolean;
  visaSupport?: boolean;
  startRangeMonths?: 1 | 3 | 6;
  payMin?: number;
  payUnit?: CompensationUnit;
  location?: string;
  startDateAfter?: string;
  startDateBefore?: string;
  /**
   * Geographic bounding box (validated upstream via isValidGeoBounds).
   * Restricts results to listings WITH coordinates inside the box — listings
   * without coordinates are excluded by definition of a geographic query.
   * Shared by /map, the public API, and MCP (one geo path, no duplicates).
   */
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  limit?: number;
  offset?: number;
}

const DEFAULT_SEARCH_LIMIT = 48;

function sanitizeSearchTerm(term: string): string {
  return term.slice(0, 200).replace(/[,()*%]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Build the fuzzy free-text search filter as a PostgREST `or()` group.
 *
 * Combines three signals so a query hits the way people actually type:
 *   1. `search_vector` full-text (stemmed title+description, migration 035) —
 *      "farms" finds "farm", handles word order.
 *   2. trigram-indexed `title ILIKE '%term%'` (migration 051) — partial words
 *      and prefixes ("maritim" → "Maritime deckhand") that stemming misses.
 *   3. trigram-indexed `location_display ILIKE '%term%'` — place names, which
 *      the search_vector does not index.
 *
 * `term` MUST already be run through {@link sanitizeSearchTerm} (it strips the
 * PostgREST-reserved `, ( ) * %` so the or() string can't be broken/injected).
 */
export function buildSearchTermFilter(term: string): string {
  const like = `*${term}*`;
  return [
    `search_vector.plfts(english).${term}`,
    `title.ilike.${like}`,
    `location_display.ilike.${like}`,
  ].join(",");
}

/**
 * Signed-in seeker scope for surfaces that need per-seeker filtering. When
 * present, {@link searchListings} HARD-excludes the seeker's applied listings.
 * `clerkUserId` MUST come from auth().userId — never decoded from the token.
 */
export interface SeekerScope {
  readonly clerkToken: string;
  readonly clerkUserId: string;
}

export async function searchListings(
  filters: SearchFilters,
  seeker?: SeekerScope,
): Promise<ListingRow[]> {
  // Applied HARD-exclusion (shared filter): /search had NONE — an already-applied
  // listing kept surfacing as applyable. Resolve the seeker's non-withdrawn
  // applications server-side (never trust a client set) and drop them below.
  // Best-effort so a lookup fault degrades to an unfiltered search, not a crash.
  let appliedIds: string[] = [];
  if (seeker) {
    appliedIds = await getSeekerApplicationIds(
      seeker.clerkToken,
      seeker.clerkUserId,
    ).catch(() => [] as string[]);
  }

  let builder = anonClient()
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("status", "live");

  if (appliedIds.length > 0) {
    builder = builder.not("id", "in", `(${appliedIds.join(",")})`);
  }

  const term = filters.query ? sanitizeSearchTerm(filters.query) : "";
  if (term) {
    // Fuzzy free-text path: full-text (stemmed) OR trigram-indexed partial
    // matches on title + location, so typos/partials and place names also hit.
    // The non-text paths below (category, benefits, pay, date range) still apply
    // for empty/null queries. See buildSearchTermFilter.
    builder = builder.or(buildSearchTermFilter(term));
  }

  const categories = (filters.categories ?? []).filter((category) =>
    (MARKETPLACE_CATEGORIES as readonly string[]).includes(category),
  );
  if (categories.length > 0) {
    builder = builder.in("category", categories);
  }

  if (filters.hasHousing) builder = builder.eq("housing_included", true);
  if (filters.hasMeals) builder = builder.eq("meals_included", true);
  if (filters.visaSupport) builder = builder.eq("visa_support", true);

  if (filters.payMin != null && Number.isFinite(filters.payMin) && filters.payMin > 0) {
    builder = builder.gte("compensation_min_cents", Math.round(filters.payMin * 100));
  }

  if (filters.payUnit === "hour" || filters.payUnit === "day") {
    builder = builder.eq("compensation_unit", filters.payUnit);
  }

  if (filters.startRangeMonths) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + filters.startRangeMonths);
    builder = builder
      .gte("begins_at", now.toISOString())
      .lte("begins_at", cutoff.toISOString());
  }

  const location = filters.location ? sanitizeSearchTerm(filters.location) : "";
  if (location) builder = builder.ilike("location_display", `%${location}%`);

  if (filters.startDateAfter) {
    builder = builder.gte("begins_at", filters.startDateAfter);
  }
  if (filters.startDateBefore) {
    builder = builder.lte("begins_at", filters.startDateBefore);
  }

  if (filters.bounds) {
    const { minLat, maxLat, minLng, maxLng } = filters.bounds;
    builder = builder
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .gte("latitude", minLat)
      .lte("latitude", maxLat)
      .gte("longitude", minLng)
      .lte("longitude", maxLng);
  }

  const limit = filters.limit ?? DEFAULT_SEARCH_LIMIT;
  // id DESC tiebreak: .range() pagination over equal published_at values is
  // otherwise non-deterministic (rows dup/skip across page boundaries on /seek
  // and the public API's offset cursor).
  const ordered = builder
    .order("published_at", { ascending: false })
    .order("id", { ascending: false });
  const hasOffset =
    filters.offset != null && Number.isFinite(filters.offset) && filters.offset >= 0;
  const paginated = hasOffset
    ? ordered.range(filters.offset as number, (filters.offset as number) + limit - 1)
    : ordered.limit(limit);

  const { data, error } = await paginated;

  if (error) throw new Error(`searchListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

/** Match-critical requirement fields promoted by migration 051. */
export interface ListingMatchRequirements {
  requiredSkillTags: string[];
  requiredCertifications: string[];
  experienceLevelRequired: string | null;
}

/**
 * Requirement fields for ONE live listing. Defensive by design: these columns
 * (051) may lack anon column grants in some environments, so any read fault
 * degrades to null — callers treat that as "requirements unknown" (honest
 * missing data), never as "no requirements".
 */
export async function getListingMatchRequirements(
  listingId: string,
): Promise<ListingMatchRequirements | null> {
  try {
    const untyped = anonClient() as unknown as SupabaseClient;
    const { data, error } = await untyped
      .from("listings")
      .select("required_skill_tags, required_certifications, experience_level_required")
      .eq("id", listingId)
      .eq("status", "live")
      .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    const asStrings = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    return {
      requiredSkillTags: asStrings(row.required_skill_tags),
      requiredCertifications: asStrings(row.required_certifications),
      experienceLevelRequired:
        typeof row.experience_level_required === "string"
          ? row.experience_level_required
          : null,
    };
  } catch {
    return null;
  }
}

async function resolveHostProfileId(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("host_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveHostProfileId: ${error.message}`);
  return data ? (data as { id: string }).id : null;
}

export async function getHostListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<ListingRow[]> {
  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return [];

  const { data, error } = await authedClient(clerkToken)
    .from("listings")
    .select(LISTING_COLUMNS)
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getHostListings: ${error.message}`);
  return ((data ?? []) as unknown as RawListingRow[]).map(toListingRow);
}

export interface ListingWriteFields {
  title?: string;
  category?: OpportunityCategory;
  locationName?: string | null;
  housingProvision?: BenefitProvision;
  housingDescription?: string | null;
  mealsProvision?: BenefitProvision;
  mealsDescription?: string | null;
  payMin?: number | null;
  payMax?: number | null;
  payCurrency?: string | null;
  payPeriod?: CompensationUnit | null;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  coverPhotoUrl?: string | null;
  galleryUrls?: string[] | null;
  /**
   * Relocation logistics (068). Whole-object, like galleryUrls: the writer
   * submits every group it knows about and this REPLACES the column, so a
   * group the host cleared is genuinely cleared rather than lingering.
   *
   * undefined = not submitted, leave the column untouched.
   *
   * NOTE for the next group (transport, pets, …): if a group ever gains its
   * own editor that submits in isolation (the way benefit_details does via
   * BenefitTrustModal), this must become a read-merge-write or a jsonb `||`
   * merge — a partial writer would otherwise silently drop its siblings.
   */
  logistics?: ListingLogistics;
  /**
   * Category-scoped depth (069). Whole-object and REPLACES the column, exactly
   * like logistics — and the same warning above applies if it ever gains an
   * isolated editor.
   *
   * This is a SEPARATE column from logistics rather than a key inside it, and
   * that is the point: each group carries its own host-reported date, stamped
   * only when its own facts change. Sharing one object would make an edit to
   * the vessel length look like a change to the connectivity report, and stamp
   * a fresh date claiming the host re-confirmed an internet speed they never
   * touched.
   *
   * undefined = not submitted, leave the column untouched.
   */
  categoryDepth?: ListingCategoryDepth;
}

type ListingColumnPatch = {
  title?: string;
  category?: OpportunityCategory;
  location_display?: string | null;
  description?: string | null;
  begins_at?: string | null;
  ends_at?: string | null;
  compensation_min_cents?: number | null;
  compensation_max_cents?: number | null;
  compensation_currency?: string;
  compensation_unit?: CompensationUnit | null;
  housing_included?: boolean;
  meals_included?: boolean;
  housing_description?: string | null;
  meals_description?: string | null;
  cover_photo_url?: string | null;
  gallery_photo_urls?: string[];
  logistics?: ListingLogistics;
  category_depth?: ListingCategoryDepth;
  // Evidence travels with its value — see benefitDecision. Before 070 no host
  // path wrote these at all, so every host listing silently inherited 064's
  // `default 'confirmed'`.
  housing_evidence?: BenefitEvidenceStatus;
  meals_evidence?: BenefitEvidenceStatus;
  pay_evidence?: BenefitEvidenceStatus;
};

function toCentsOrNull(amount: number | null | undefined): number | null {
  if (amount == null || !Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

/**
 * What the host actually SAID about a benefit — value and evidence together.
 *
 * The description fallback that used to live here ("a non-empty description
 * means it's included") was the bug: the action layer never supplied a
 * provision, so EVERY host save took the fallback, and a blank housing box
 * became `housing_included = false`. Paired with 064's `default 'confirmed'`
 * that shipped listings affirmatively telling seekers "Housing: Not included"
 * — carrying an employer confirmation — for a question the host never
 * answered. A description is prose ABOUT a benefit; it was never a decision,
 * and inferring one from its emptiness is exactly the guess this product
 * forbids.
 *
 * Now nothing is inferred. No provision means the host has not chosen, which
 * is `not_stated`: the column stays false (the value is unknown, and false is
 * the only honest boolean for "no one said yes") and the EVIDENCE carries the
 * truth that nobody spoke. Migration 070 refuses to publish such a row.
 *
 * The rule itself lives in contracts/listingPublication.ts (hostBenefitDecision)
 * so that it is pure and TESTED. It used to be a private helper right here, and
 * that is precisely how its inverse reached production unnoticed — a rule
 * nothing can test is a rule that rots quietly.
 */
const benefitDecision = hostBenefitDecision;

function buildListingColumnPatch(fields: ListingWriteFields): ListingColumnPatch {
  const patch: ListingColumnPatch = {};

  if (fields.title !== undefined) patch.title = fields.title.trim();
  if (fields.category !== undefined) patch.category = fields.category;

  if (fields.locationName !== undefined) {
    const trimmed = fields.locationName?.trim() ?? "";
    patch.location_display = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.summary !== undefined) {
    const trimmed = fields.summary?.trim() ?? "";
    patch.description = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.startDate !== undefined) {
    patch.begins_at = fields.startDate && fields.startDate.length > 0 ? fields.startDate : null;
  }
  if (fields.endDate !== undefined) {
    patch.ends_at = fields.endDate && fields.endDate.length > 0 ? fields.endDate : null;
  }
  if (fields.payMin !== undefined) patch.compensation_min_cents = toCentsOrNull(fields.payMin);
  if (fields.payMax !== undefined) patch.compensation_max_cents = toCentsOrNull(fields.payMax);
  if (fields.payCurrency != null && fields.payCurrency.trim().length > 0) {
    patch.compensation_currency = fields.payCurrency.trim().toUpperCase();
  }
  if (fields.payPeriod != null) patch.compensation_unit = fields.payPeriod;
  if (fields.housingDescription !== undefined) {
    const trimmed = fields.housingDescription?.trim() ?? "";
    patch.housing_description = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.mealsDescription !== undefined) {
    const trimmed = fields.mealsDescription?.trim() ?? "";
    patch.meals_description = trimmed.length > 0 ? trimmed : null;
  }
  // The DECISION is driven by the host's explicit choice and nothing else.
  //
  // Note this deliberately no longer fires when only the DESCRIPTION changed:
  // editing the housing blurb is not answering the housing question, and the
  // old `provision !== undefined || description !== undefined` condition is
  // precisely how a blank box became a confirmed "Not included". Value and
  // evidence move together — writing one without the other is what let the two
  // drift into a lie.
  if (fields.housingProvision !== undefined) {
    const decision = benefitDecision(fields.housingProvision);
    patch.housing_included = decision.included;
    patch.housing_evidence = decision.evidence;
  }
  if (fields.mealsProvision !== undefined) {
    const decision = benefitDecision(fields.mealsProvision);
    patch.meals_included = decision.included;
    patch.meals_evidence = decision.evidence;
  }
  // Pay has no boolean — the figures ARE the value — so its evidence is stamped
  // from whether the host actually gave one.
  //
  // BOTH bounds must be submitted together for this to be sound. The form always
  // sends both, so a submit is a complete replacement of the range; a partial
  // writer that sent only payMin would look like "the range is now just this",
  // and computing evidence from half a range would unset pay on a listing whose
  // other bound is still a real number. Guarded, not assumed.
  if (fields.payMin !== undefined && fields.payMax !== undefined) {
    const stated =
      (typeof patch.compensation_min_cents === "number" && patch.compensation_min_cents > 0) ||
      (typeof patch.compensation_max_cents === "number" && patch.compensation_max_cents > 0);
    patch.pay_evidence = stated ? HOST_CHOICE_EVIDENCE : "not_stated";
  }
  if (fields.coverPhotoUrl !== undefined) {
    const trimmed = fields.coverPhotoUrl?.trim() ?? "";
    patch.cover_photo_url = trimmed.length > 0 ? trimmed : null;
  }
  if (fields.galleryUrls !== undefined) {
    patch.gallery_photo_urls = fields.galleryUrls ?? [];
  }
  if (fields.logistics !== undefined) {
    // Sanitized on the way IN as well as on the way out: this is the host's
    // own claim about a place a seeker may move to, so a value we cannot
    // vouch for must never be persisted as though they stated it. sanitize*
    // drops those keys, and an absent key is "Not stated".
    patch.logistics = sanitizeLogistics(fields.logistics);
  }
  if (fields.categoryDepth !== undefined) {
    // Same rule as logistics: sanitized on the way in, so a value we cannot
    // vouch for is never persisted as though the host stated it.
    patch.category_depth = sanitizeCategoryDepth(fields.categoryDepth);
  }

  return patch;
}

export async function createListing(
  clerkToken: string,
  clerkUserId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; listingId?: string; error?: string }> {
  const title = fields.title?.trim() ?? "";
  if (title.length === 0) return { ok: false, error: "A listing title is required." };
  if (!fields.category) return { ok: false, error: "Choose a valid category for the listing." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) {
    return { ok: false, error: "No host profile found for your account. Create a host profile first." };
  }

  const patch = buildListingColumnPatch(fields);
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .insert({ ...patch, title, host_profile_id: hostProfileId, status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Could not create the listing." };
  }
  return { ok: true, listingId: (data as { id: string }).id };
}

export async function updateListing(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
  fields: ListingWriteFields,
): Promise<{ ok: boolean; error?: string }> {
  if (!listingId) return { ok: false, error: "Missing listing id." };

  const hostProfileId = await resolveHostProfileId(clerkToken, clerkUserId);
  if (!hostProfileId) return { ok: false, error: "No host profile found for your account." };

  const patch = buildListingColumnPatch(fields);
  if (Object.keys(patch).length === 0) return { ok: true };

  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped
    .from("listings")
    .update(patch)
    .eq("id", listingId)
    .eq("host_profile_id", hostProfileId)
    .select("id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Listing not found or you do not have access to it." };
  return { ok: true };
}

/**
 * NOTE: listing status transitions are owned by the canonical
 * `updateListingStatus` in ./listingLifecycle.ts — it validates the transition
 * against LISTING_STATUS_TRANSITIONS and stamps published_at / paused_at /
 * archived_at. The earlier duplicate that lived here (status-only, no
 * validation, no timestamps) was removed; the action layer now calls the
 * canonical fn (re-exported from the package index).
 */

/* ========================================================================== */
/* Wave 10 — public listing detail + per-seeker state queries                 */
/* ========================================================================== */

/**
 * Joined host_profiles fields on a public listing detail. id is needed to
 * link /host/{id} and generate hiringOrganization JSON-LD.
 */
export interface PublicListingDetailHost {
  id: string;
  companyName: string;
  photoUrl: string | null;
  about: string | null;
  primaryLocationName: string | null;
  /** Active-paid-subscription gate — see hasVerifiedHostSubscription(). */
  verified: boolean;
}

/**
 * A single listing for the public detail page, joined to its host_profiles row.
 *
 * Does NOT filter on status — the page layer decides visibility (non-live
 * listings are only shown to the owning host). Uses the anon client.
 */
export interface PublicListingDetail {
  id: string;
  title: string;
  category: OpportunityCategory;
  description: string | null;
  locationDisplay: string | null;
  latitude: number | null;
  longitude: number | null;
  status: ListingStatus;
  housingIncluded: boolean;
  mealsIncluded: boolean;
  compensationSummary: string | null;
  compensationMinCents: number | null;
  compensationMaxCents: number | null;
  compensationUnit: string | null;
  compensationCurrency: string;
  timelineSummary: string | null;
  beginsAt: string | null;
  endsAt: string | null;
  publishedAt: string | null;
  coverPhotoUrl: string | null;
  galleryPhotoUrls: string[];
  hostProfileId: string | null;
  host: PublicListingDetailHost | null;

  /* ── Immersive listing-detail fields (migration 060 + host narrative 059) ──
     Every field below is OPTIONAL and self-omitting: absent/empty data maps to
     undefined (arrays) or null (descriptions) so the immersive page renders the
     corresponding section only when there is honest content to show. */

  /** "What you'll do" — role responsibilities (listings.responsibilities jsonb). */
  responsibilities?: string[];
  /** "What we're looking for" — role requirements (listings.requirements jsonb). */
  requirements?: string[];
  /** "Perks & benefits" at the LISTING level (listings.perks jsonb). */
  perks?: string[];
  /** Free-text housing descriptor (listings.housing_description; migration 040). */
  housingDescription?: string | null;
  /** Free-text meals descriptor (listings.meals_description; migration 040). */
  mealsDescription?: string | null;
  /** Exact housing evidence shown to seekers, with inherited/override source. */
  housingPhotos?: readonly EffectiveHousingPhoto[];

  /* ── Host-narrative-derived (host_profiles.narrative jsonb; migration 059) ── */
  /** "Why work with us" recruiting pitch. */
  whyWorkForUs?: string | null;
  /** "Meet the team" members; photoUrl may be null (framed placeholder). */
  team?: { name: string; role: string; photoUrl?: string | null }[];
  /** "Life here" / off-the-clock activities. */
  activities?: string[];
  /** Host-level perks from the narrative (distinct from listing-level `perks`). */
  hostPerks?: string[];

  /* ── Provenance (migration 064) ──
     Absent for verified-native listings (legacy behavior). Present for
     sourced listings (attribution + per-benefit evidence — the detail page
     MUST render the sourced disclosure, suppress every host block, and show
     'not_stated' benefits as missing information) and for converted listings
     (lineage retained, presents as the host's own). */
  provenanceInfo?: ListingProvenanceInfo;

  /* ── Relocation logistics (listings.logistics jsonb; migration 068) ──
     Only the facts the host actually STATED. A key the host never answered is
     ABSENT, so the page renders "Not stated" — it is never inferred or
     defaulted. Always present as an object ({} when nothing was stated), so
     callers gate on hasLogistics() rather than null-checking. */
  logistics: ListingLogistics;

  /* ── Category depth (listings.category_depth jsonb; migration 069) ──
     The facts that only matter for one lane (maritime: the vessel, and whether
     you sleep on it). Same honesty rule as logistics — absent means the host
     never stated it, never that the answer is no. Always present as an object
     ({} when nothing was stated); gate on hasCategoryDepth().

     Separate from `logistics` on purpose: the two carry independent
     host-reported dates and must never stamp each other's. */
  categoryDepth: ListingCategoryDepth;
}

const LISTING_DETAIL_COLUMNS =
  "id,title,category,description,location_display,latitude,longitude,status," +
  "housing_included,meals_included,housing_description,meals_description," +
  "responsibilities,requirements,perks," +
  "compensation_summary,compensation_min_cents," +
  "compensation_max_cents,compensation_unit,compensation_currency,timeline_summary," +
  "begins_at,ends_at,published_at,cover_photo_url,gallery_photo_urls,host_profile_id," +
  "logistics,category_depth," +
  PROVENANCE_COLUMNS +
  ",host_profiles(id,company_name,photo_url,about,primary_location_name,subscription_tier,narrative)";

function firstEmbed(value: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
}

/**
 * Parse a jsonb/text[] column into a clean, order-preserving list of non-empty
 * strings. Tolerates null/non-array/mixed content (defaults to []). Used for the
 * immersive listing arrays (responsibilities/requirements/perks) and the host
 * narrative activities/perks — never fabricates, only keeps real strings.
 */
function toDetailStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Trim a value to a non-empty string, or null. Keeps free-text descriptors
 * (housing/meals, whyWorkForUs) honest: blank/whitespace/non-string → null.
 */
function toDetailText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Parse host_profiles.narrative team[] (migration 059 shape:
 * { name, role, photoUrl? }) into validated members. Skips entries with neither
 * a name nor a role; normalizes a missing/blank photoUrl to null so the UI can
 * render a framed placeholder. Tolerant of missing/partial jsonb.
 */
function toDetailTeam(
  value: unknown,
): { name: string; role: string; photoUrl?: string | null }[] {
  if (!Array.isArray(value)) return [];
  const members: { name: string; role: string; photoUrl?: string | null }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name.trim() : "";
    const role = typeof rec.role === "string" ? rec.role.trim() : "";
    if (name === "" && role === "") continue;
    members.push({ name, role, photoUrl: toDetailText(rec.photoUrl) });
  }
  return members;
}

/**
 * Fetch a listing for the public detail page. No status filter — the page
 * decides who may view non-live listings. Anon client (no auth required).
 */
export async function getListingDetailPublic(
  listingId: string,
): Promise<PublicListingDetail | null> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select(LISTING_DETAIL_COLUMNS)
    .eq("id", listingId)
    .maybeSingle();

  if (error) throw new Error(`getListingDetailPublic: ${error.message}`);
  if (!data) return null;

  const row = data as unknown as Record<string, unknown>;
  const isSourced = row.provenance === "sourced";
  // STRUCTURAL suppression: a sourced listing exposes NO host object at all —
  // the page cannot render a host block, reviews, or a verified badge for it
  // even by accident, because there is nothing to render from.
  const hostRow = isSourced ? null : firstEmbed(row.host_profiles);

  const host: PublicListingDetailHost | null = hostRow
    ? {
        id: String(hostRow.id ?? row.host_profile_id ?? ""),
        companyName:
          typeof hostRow.company_name === "string" ? hostRow.company_name : "",
        photoUrl:
          typeof hostRow.photo_url === "string" ? hostRow.photo_url : null,
        about: typeof hostRow.about === "string" ? hostRow.about : null,
        primaryLocationName:
          typeof hostRow.primary_location_name === "string"
            ? hostRow.primary_location_name
            : null,
        verified: hasVerifiedHostSubscription(hostRow.subscription_tier),
      }
    : null;

  // Immersive listing arrays/descriptors (migration 060 + 040) — parsed
  // defensively; empty → undefined so each page section self-omits.
  const responsibilities = toDetailStringArray(row.responsibilities);
  const requirements = toDetailStringArray(row.requirements);
  const perks = toDetailStringArray(row.perks);

  // Host showcase narrative (host_profiles.narrative jsonb; migration 059).
  // Tolerates a missing/partial/empty jsonb block.
  const narrative =
    hostRow && hostRow.narrative && typeof hostRow.narrative === "object"
      ? (hostRow.narrative as Record<string, unknown>)
      : {};
  const team = toDetailTeam(narrative.team);
  const activities = toDetailStringArray(narrative.activities);
  const hostPerks = toDetailStringArray(narrative.perks);
  const housingPhotos = await getPublicHousingPhotos(listingId, db);

  return {
    id: String(row.id),
    title: typeof row.title === "string" ? row.title : "",
    category: (typeof row.category === "string"
      ? row.category
      : "mix") as OpportunityCategory,
    description:
      typeof row.description === "string" ? row.description : null,
    locationDisplay:
      typeof row.location_display === "string" ? row.location_display : null,
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    status: (typeof row.status === "string"
      ? row.status
      : "draft") as ListingStatus,
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
    timelineSummary:
      typeof row.timeline_summary === "string" ? row.timeline_summary : null,
    beginsAt: typeof row.begins_at === "string" ? row.begins_at : null,
    endsAt: typeof row.ends_at === "string" ? row.ends_at : null,
    publishedAt:
      typeof row.published_at === "string" ? row.published_at : null,
    coverPhotoUrl:
      typeof row.cover_photo_url === "string" ? row.cover_photo_url : null,
    galleryPhotoUrls: Array.isArray(row.gallery_photo_urls)
      ? (row.gallery_photo_urls as unknown[]).filter(
          (u): u is string => typeof u === "string",
        )
      : [],
    hostProfileId:
      typeof row.host_profile_id === "string" ? row.host_profile_id : null,
    host,
    provenanceInfo: rowProvenanceInfo({
      provenance: isSourced ? "sourced" : "verified",
      source_name: toDetailText(row.source_name),
      source_url: toDetailText(row.source_url),
      source_external_id: toDetailText(row.source_external_id),
      source_employer_name: toDetailText(row.source_employer_name),
      source_published_at:
        typeof row.source_published_at === "string" ? row.source_published_at : null,
      source_last_seen_at:
        typeof row.source_last_seen_at === "string" ? row.source_last_seen_at : null,
      claim_summary: typeof row.claim_summary === "string" ? row.claim_summary : "not_applicable",
      housing_evidence: asEvidence(row.housing_evidence as string | null),
      meals_evidence: asEvidence(row.meals_evidence as string | null),
      pay_evidence: asEvidence(row.pay_evidence as string | null),
    }),

    // Relocation logistics (068). Re-sanitized on READ, not trusted from the
    // jsonb: the column is the only place a hand-written SQL update or an
    // older writer could have left a shape the contract never allowed, and a
    // value we cannot vouch for must degrade to "Not stated" — never render as
    // if the host had stated it.
    logistics: sanitizeLogistics(row.logistics),

    // Category depth (069). Re-sanitized on READ for the same reason.
    categoryDepth: sanitizeCategoryDepth(row.category_depth),

    // Immersive fields — undefined-when-empty so the page omits empty sections.
    responsibilities: responsibilities.length > 0 ? responsibilities : undefined,
    requirements: requirements.length > 0 ? requirements : undefined,
    perks: perks.length > 0 ? perks : undefined,
    housingDescription: toDetailText(row.housing_description),
    mealsDescription: toDetailText(row.meals_description),
    housingPhotos: housingPhotos.length > 0 ? housingPhotos : undefined,
    whyWorkForUs: toDetailText(narrative.whyWorkForUs),
    team: team.length > 0 ? team : undefined,
    activities: activities.length > 0 ? activities : undefined,
    hostPerks: hostPerks.length > 0 ? hostPerks : undefined,
  };
}

/**
 * Resolve seeker_profiles.id for the authed Clerk user.
 * Internal helper shared by hasApplied / hasSaved.
 */
async function resolveSeekerProfileIdForListings(
  clerkToken: string,
  clerkUserId: string,
): Promise<string | null> {
  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`resolveSeekerProfileIdForListings: ${error.message}`);
  return data ? String((data as { id: string }).id) : null;
}

/**
 * Whether the authed seeker has an active (non-withdrawn) application to a
 * listing. Returns false when the seeker has no profile yet.
 * `clerkUserId` must come from auth().userId.
 */
export async function hasApplied(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<boolean> {
  const seekerProfileId = await resolveSeekerProfileIdForListings(
    clerkToken,
    clerkUserId,
  );
  if (!seekerProfileId) return false;

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("applications")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("listing_id", listingId)
    .neq("status", "withdrawn")
    .maybeSingle();
  if (error) throw new Error(`hasApplied: ${error.message}`);
  return Boolean(data);
}

/**
 * Whether the authed seeker has actively saved a listing (status='saved').
 * `clerkUserId` must come from auth().userId.
 */
export async function hasSaved(
  clerkToken: string,
  clerkUserId: string,
  listingId: string,
): Promise<boolean> {
  const seekerProfileId = await resolveSeekerProfileIdForListings(
    clerkToken,
    clerkUserId,
  );
  if (!seekerProfileId) return false;

  const db = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await db
    .from("saved_listings")
    .select("listing_id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("listing_id", listingId)
    .eq("status", "saved")
    .maybeSingle();
  if (error) throw new Error(`hasSaved: ${error.message}`);
  return Boolean(data);
}

/**
 * Distinct host_profile_id values with at least one live listing.
 * Used to populate host-profile entries in the sitemap. Anon client.
 */
export async function getHostIdsWithLiveListings(): Promise<string[]> {
  const db = anonClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .select("host_profile_id")
    .eq("status", "live");
  if (error) throw new Error(`getHostIdsWithLiveListings: ${error.message}`);

  const ids = new Set<string>();
  for (const raw of (data ?? []) as Array<{ host_profile_id: string | null }>) {
    if (raw.host_profile_id) ids.add(raw.host_profile_id);
  }
  return [...ids];
}
