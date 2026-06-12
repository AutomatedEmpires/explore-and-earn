/**
 * Compile-time contract tests for the canonical OpportunityListing type
 * (issues #58 / #47 — FOUNDER-AUTHORIZED Contracts V1).
 *
 * These are TYPE-LEVEL tests validated by `tsc` during `typecheck`. They emit
 * no runtime. This file lives under src/ so it is type-checked, but is NOT
 * re-exported from src/index.ts and never becomes part of the public API.
 */
import type {
  ListingCoordinates,
  ListingHost,
  ListingPayInsight,
  OpportunityListing,
} from "../listing";
import type { BenefitTriad } from "../benefits";
import type { DiscoveryCardConditionalBadge } from "../card";
import type { ListingStatus } from "../enums";
import type { OpportunityCategory } from "../categories";
import { MARKETPLACE_CATEGORIES, LISTING_STATUS } from "../enums";

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

// ---------------------------------------------------------------- ListingHost

// Required fields are name + verified.
const _host: ListingHost = { name: "Farm Co.", verified: true };
export const _hostOk = _host;

// id and tagline are optional.
const _hostFull: ListingHost = {
  id: "uuid-1",
  name: "Farm Co.",
  verified: false,
  tagline: "Work the land.",
};
export const _hostFullOk = _hostFull;

// @ts-expect-error name is required on ListingHost.
const _hostNoName: ListingHost = { verified: true };
export const _hostNoNameRejected = _hostNoName;

// ---------------------------------------------------------------- ListingCoordinates

const _coords: ListingCoordinates = { lat: 51.5, lon: -0.12 };
export const _coordsOk = _coords;

// @ts-expect-error lon is required on ListingCoordinates.
const _coordsNoLon: ListingCoordinates = { lat: 51.5 };
export const _coordsNoLonRejected = _coordsNoLon;

// ---------------------------------------------------------------- ListingPayInsight

// All fields are optional.
const _insight: ListingPayInsight = {};
export const _insightEmpty = _insight;

const _insightFull: ListingPayInsight = {
  meterValue: 72,
  note: "+ tips",
  minCents: 1800_00,
  maxCents: 2200_00,
  unit: "hour",
  currency: "USD",
};
export const _insightFullOk = _insightFull;

// unit accepts null (DB may store null before compensation is structured).
const _insightNullUnit: ListingPayInsight = { unit: null };
export const _insightNullUnitOk = _insightNullUnit;

// ---------------------------------------------------------------- OpportunityListing

// Minimal valid listing (required fields only).
const _minimalListing: OpportunityListing = {
  id: "abc",
  title: "Harvest Helper",
  category: "farm",
  location: "Napa Valley, CA",
  opportunityWindow: "Aug–Oct 2026",
  status: "live",
  host: { name: "Farm Co.", verified: false },
  benefits: {
    housing: { provision: "provided" },
    meals: { provision: "provided" },
    pay: { provision: "provided", summary: "$18/hr" },
  },
};
export const _minimalListingOk = _minimalListing;

// All optional fields can be set.
const _fullListing: OpportunityListing = {
  id: "xyz",
  title: "Deck Hand",
  category: "maritime",
  location: "Pacific Northwest",
  opportunityWindow: "Jun–Sep 2026",
  begins: "2026-06-01",
  ends: "2026-09-30",
  status: "draft",
  host: { id: "h1", name: "SeaCo", verified: true, tagline: "Sail with us." },
  benefits: {
    housing: { provision: "provided", summary: "Shared cabin" },
    meals: { provision: "partial", summary: "Dinner provided" },
    pay: { provision: "provided", summary: "$22/hr" },
  },
  coverImageUrl: "https://example.com/photo.jpg",
  conditionalBadges: ["boosted"],
  matchScore: 85,
  founding: true,
  payInsight: { meterValue: 85, minCents: 2200_00, unit: "hour", currency: "USD" },
  visaSupport: true,
  coordinates: { lat: 47.6, lon: -122.3 },
};
export const _fullListingOk = _fullListing;

// id is required.
// @ts-expect-error id is required on OpportunityListing.
const _listingNoId: OpportunityListing = {
  title: "Farm Hand",
  category: "farm",
  location: "Somewhere",
  opportunityWindow: "Open",
  status: "live",
  host: { name: "Farm Co.", verified: false },
  benefits: {
    housing: { provision: "not_provided" },
    meals: { provision: "not_provided" },
    pay: { provision: "not_provided" },
  },
};
export const _listingNoIdRejected = _listingNoId;

// ---------------------------------------------------------------- Category coverage

// All five canonical lanes are valid OpportunityListing categories.
const _allCategories: OpportunityCategory[] = [...MARKETPLACE_CATEGORIES];
export const _allCategoriesOk = _allCategories;

// A mix listing is valid (single listings table, no per-category split).
const _mixListing: OpportunityListing = {
  ..._minimalListing,
  category: "mix",
};
export const _mixListingOk = _mixListing;

// ---------------------------------------------------------------- Status coverage

// All canonical statuses are valid.
const _allStatuses: ListingStatus[] = [...LISTING_STATUS];
export const _allStatusesOk = _allStatuses;

// ---------------------------------------------------------------- Conditional badges

// The set is the narrowed post-PR-#190 set: seasonal + boosted. No "featured".
export const _badgeSetIsNarrowed: Expect<
  Equal<DiscoveryCardConditionalBadge, "seasonal" | "boosted">
> = true;

// @ts-expect-error "featured" was removed from the conditional badge set (PR #190).
const _featuredBadge: DiscoveryCardConditionalBadge = "featured";
export const _featuredBadgeRejected = _featuredBadge;

// conditionalBadges on OpportunityListing accepts the narrowed set.
const _listingWithBoosted: OpportunityListing = {
  ..._minimalListing,
  conditionalBadges: ["boosted"],
};
export const _listingWithBoostedOk = _listingWithBoosted;

// ---------------------------------------------------------------- Housing / Meals / Pay triad

// The triad keys are fixed — never "Perks."
export const _triadKeys: Expect<
  Equal<keyof BenefitTriad, "housing" | "meals" | "pay">
> = true;

// @ts-expect-error "perks" is not a triad key — relabeling is forbidden (product law §1).
const _perks: keyof BenefitTriad = "perks";
export const _perksRejected = _perks;
