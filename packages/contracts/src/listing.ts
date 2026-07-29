/**
 * Canonical Listing contract — single source of truth for the OpportunityListing type.
 *
 * Source of truth (Notion): Exact Data Dictionary, Discovery Card V1, #58 Contracts V1.
 * FOUNDER-AUTHORIZED change (issues #58 / #47): this is the persisted object model
 * that both the DB row mapper (ListingRow -> rowToDiscoveryFields in @explore-and-earn/db)
 * and the UI view-model (DiscoveryListing in apps/web) derive from.
 *
 * SCOPE: types/contracts ONLY — no DB schema changes, no migrations, no runtime
 * behaviour beyond the mapping. The single `listings` table covers all five
 * lanes (farm · maritime · remote · seasonal · mix); no per-category splits.
 *
 * Housing / Meals / Pay remain first-class fields (product law §1). The
 * conditional-badge set is the narrowed set from PR #190 — "featured" is absent.
 */

import type { BenefitTriad } from "./benefits";
import type { DiscoveryCardConditionalBadge } from "./card";
import type { OpportunityCategory } from "./categories";
import type { CompensationUnit, ListingStatus } from "./enums";
import type { MatchReason } from "./match";
import type { ImageSelection } from "./media";
import type { ListingProvenanceInfo } from "./provenance";

/** Host summary embedded in an OpportunityListing. */
export interface ListingHost {
  readonly id?: string;
  readonly name: string;
  /**
   * Whether the host is on an active paid subscription (any tier) — see
   * hasVerifiedHostSubscription() in ./card. Automatic, never self-declared
   * or admin-toggled. Rendered via the VerifiedHostBadge primitive.
   */
  readonly verified: boolean;
  /** Short employer tagline for the featured-employer rail (1–2 punchy sentences). */
  readonly tagline?: string;
  /**
   * `host_profiles.photo_url` — the employer's own mark, rendered as the card's
   * logo chip. Absent for sourced inventory by construction: an unconfirmed
   * posting has no host profile, so putting a logo on it would dress a scraped
   * listing as a claimed one.
   */
  readonly logoUrl?: string;
  /**
   * Host subscription tier — powers monetization ranking ("pay more, show more":
   * Enterprise > Professional > Starter, below Boosted and strong Match). Derived
   * from the host's active subscription; never self-declared. Omitted/"none" for
   * free or unknown hosts (ranks last, never hidden). See apps/web/lib/ranking.ts.
   */
  readonly tier?: "enterprise" | "professional" | "starter" | "none";
}

/**
 * Geocoded marker position for the /map surface. Optional: listings without
 * coordinates are omitted from the map (e.g. "Remote · Worldwide").
 */
export interface ListingCoordinates {
  readonly lat: number;
  readonly lon: number;
}

/** Pay range metadata surfaced in the pay pop-up / Meter primitive. */
export interface ListingPayInsight {
  /** Neutral 0–100 value for the Meter primitive. Never colored good/bad. */
  readonly meterValue?: number;
  /** Human-readable pay note (e.g. "+ tips"). */
  readonly note?: string;
  readonly minCents?: number;
  readonly maxCents?: number;
  readonly unit?: CompensationUnit | null;
  readonly currency?: string;
}

/**
 * Canonical opportunity listing — the single type that both the DB row mapper
 * and the UI view-model derive from.
 *
 * One type covers all five lanes (farm · maritime · remote · seasonal · mix).
 * Do NOT split into per-category types.
 */
export interface OpportunityListing {
  readonly id: string;
  /** Display title; rendered in the display font. */
  readonly title: string;
  /** One of the five canonical lanes (farm | maritime | remote | seasonal | mix). */
  readonly category: OpportunityCategory;
  readonly location: string;
  /** Human-readable opportunity window, e.g. "Aug–Oct 2026". */
  readonly opportunityWindow: string;
  readonly begins?: string;
  readonly ends?: string;
  readonly status: ListingStatus;
  readonly host: ListingHost;
  /** The always-visible Housing / Meals / Pay triad (product law §1). */
  readonly benefits: BenefitTriad;
  /** Resolved cover image. Absent → category illustration fallback. */
  readonly cover?: ImageSelection;
  /**
   * Uploaded cover photo public URL (Supabase Storage). When present, the card
   * renders this as the hero image; absent → category illustration fallback.
   */
  readonly coverImageUrl?: string;
  /**
   * Conditional badges shown in addition to the always-on category chip.
   * "featured" is not in this set (removed in PR #190).
   */
  readonly conditionalBadges?: readonly DiscoveryCardConditionalBadge[];
  /**
   * Neutral relevance value 0–100, shown via the Meter primitive on matched
   * surfaces only. Never colored good/bad.
   */
  readonly matchScore?: number;
  /** Whether to surface the founding-program countdown. */
  readonly founding?: boolean;
  /** Pay range + meter content for the pay pop-up. */
  readonly payInsight?: ListingPayInsight;
  /** Whether the host offers visa/work-permit support. */
  readonly visaSupport?: boolean;
  readonly coordinates?: ListingCoordinates;
  /**
   * Provenance block (contracts/provenance.ts). OPTIONAL + additive: absent
   * means a legacy verified listing (all pre-provenance behavior unchanged).
   * When `provenance === 'sourced'` the listing is real-but-unconfirmed
   * inventory: surfaces MUST render the sourced disclosure + source
   * attribution, must NOT render a host profile / reviews / verified badge,
   * and must render `not_stated` benefits as missing information — never as
   * "not provided".
   */
  readonly provenanceInfo?: ListingProvenanceInfo;

  // ── V2-G card fields ──────────────────────────────────────────────────────
  //
  // EVERY field below maps to a REAL stored column. Nothing here is inferred,
  // averaged, or filled in from a sibling listing: an absent field means the
  // host never stated it, and the card is required to say so rather than guess.
  // The card's "what's missing" line is built from exactly these absences.

  /**
   * `listings.expires_at` (034/067) — when this listing stops being live.
   *
   * This is a LISTING expiry, not an application deadline: the product stores
   * no `application_deadline` column, so surfaces must phrase it as "listing
   * closes", never as "apply by". Presenting an expiry as a deadline would
   * invent a commitment the host never made.
   */
  readonly expiresAt?: string;
  /** `listings.experience_level_required` (051). Freeform host text. */
  readonly experienceLevel?: string;
  /**
   * `listings.physical_demand` (051) — 0 (light) … 3 (very demanding).
   * Absent means unstated; never defaulted to 0.
   */
  readonly physicalDemand?: number;
  /** `listings.perks` (060) — listing-level perks, plain strings. */
  readonly perks?: readonly string[];
  /** `listings.required_certifications` (051). */
  readonly requiredCertifications?: readonly string[];
  /**
   * Render-time match reasons, derived from the stored `match_scores.components`
   * by {@link topMatchReasons}. G34 law: reason TEXT is never persisted, so this
   * is computed per render from numbers the engine wrote. Absent when the
   * pairing has no stored components (i.e. "not scored yet", never "no fit").
   */
  readonly matchReasons?: readonly MatchReason[];
  /**
   * `match_scores.confidence` (052) — the ADR-040 data-quality axis, distinct
   * from the score. Drives the card's reduced-confidence treatment.
   */
  readonly matchConfidence?: number;
}
