import type { ListingStatusCounts } from "@explore-and-earn/db";

export type HostProfileReadinessField =
  | "company"
  | "story"
  | "location"
  | "photo"
  | "categories";

export interface HostProfileReadinessInput {
  readonly companyName?: string | null;
  readonly about?: string | null;
  readonly primaryLocationName?: string | null;
  readonly photoUrl?: string | null;
  readonly categoryScopes?: readonly string[] | null;
}

export interface HostProfileReadiness {
  readonly ready: boolean;
  readonly completed: number;
  readonly total: number;
  readonly missing: readonly HostProfileReadinessField[];
}

export type HostInventoryReadiness =
  | "none"
  | "draft"
  | "under_review"
  | "live"
  | "inactive";

export type HostReadinessStepKind =
  | "complete_profile"
  | "create_listing"
  | "finish_draft"
  | "awaiting_review"
  | "manage_inactive"
  | "ready";

export interface HostReadinessStep {
  readonly kind: HostReadinessStepKind;
  readonly title: string;
  readonly hint: string;
  readonly cta: string;
  readonly href: string;
}

export interface HostReadiness {
  readonly profile: HostProfileReadiness;
  readonly inventory: HostInventoryReadiness;
  readonly inventoryStep: HostReadinessStep;
  readonly nextStep: HostReadinessStep;
}

const PROFILE_FIELDS: ReadonlyArray<{
  readonly key: HostProfileReadinessField;
  readonly isComplete: (profile: HostProfileReadinessInput) => boolean;
}> = [
  {
    key: "company",
    isComplete: (profile) => hasText(profile.companyName),
  },
  {
    key: "story",
    isComplete: (profile) => hasText(profile.about),
  },
  {
    key: "location",
    isComplete: (profile) => hasText(profile.primaryLocationName),
  },
  {
    key: "photo",
    isComplete: (profile) => hasText(profile.photoUrl),
  },
  {
    key: "categories",
    isComplete: (profile) =>
      Boolean(profile.categoryScopes?.some((category) => hasText(category))),
  },
];

function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function deriveHostProfileReadiness(
  profile: HostProfileReadinessInput | null,
): HostProfileReadiness {
  const candidate = profile ?? {};
  const missing = PROFILE_FIELDS.filter(
    (field) => !field.isComplete(candidate),
  ).map((field) => field.key);

  return {
    ready: missing.length === 0,
    completed: PROFILE_FIELDS.length - missing.length,
    total: PROFILE_FIELDS.length,
    missing,
  };
}

export function deriveHostInventoryReadiness(
  listingsByStatus: ListingStatusCounts,
  totalListings: number,
  liveCount: number,
): HostInventoryReadiness {
  if (
    positiveCount(liveCount) > 0 ||
    positiveCount(listingsByStatus.live) > 0
  ) {
    return "live";
  }
  if (positiveCount(listingsByStatus.draft) > 0) {
    return "draft";
  }
  if (positiveCount(listingsByStatus.under_review) > 0) {
    return "under_review";
  }

  const countedListings = Object.values(listingsByStatus).reduce(
    (sum, count) => sum + positiveCount(count),
    0,
  );
  return positiveCount(totalListings) > 0 || countedListings > 0
    ? "inactive"
    : "none";
}

function inventoryStepFor(
  inventory: HostInventoryReadiness,
): HostReadinessStep {
  switch (inventory) {
    case "none":
      return {
        kind: "create_listing",
        title: "Create your first opportunity",
        hint: "Publish a role with Housing, Meals, and Pay up front.",
        cta: "Create listing",
        href: "/host/listings/new",
      };
    case "draft":
      return {
        kind: "finish_draft",
        title: "Finish your draft listing",
        hint: "Complete the opportunity details and submit it for review.",
        cta: "Finish draft",
        href: "/host/listings",
      };
    case "under_review":
      return {
        kind: "awaiting_review",
        title: "Your listing is awaiting review",
        hint: "No action is required right now. Check its status while the marketplace team reviews it.",
        cta: "View status",
        href: "/host/listings",
      };
    case "inactive":
      return {
        kind: "manage_inactive",
        title: "Get an opportunity back in discovery",
        hint: "Your existing listings are not live. Review them or create a new opportunity.",
        cta: "Manage listings",
        href: "/host/listings",
      };
    case "live":
      return {
        kind: "ready",
        title: "Your marketplace setup is ready",
        hint: "Your public profile is complete and at least one opportunity is live.",
        cta: "View listings",
        href: "/host/listings",
      };
  }
}

export function deriveHostReadiness(
  profile: HostProfileReadinessInput | null,
  listingsByStatus: ListingStatusCounts,
  totalListings: number,
  liveCount: number,
): HostReadiness {
  const profileReadiness = deriveHostProfileReadiness(profile);
  const inventory = deriveHostInventoryReadiness(
    listingsByStatus,
    totalListings,
    liveCount,
  );
  const inventoryStep = inventoryStepFor(inventory);
  const nextStep = profileReadiness.ready
    ? inventoryStep
    : {
        kind: "complete_profile" as const,
        title: "Complete your public host profile",
        hint: "Add your story, location, photo, and marketplace categories so seekers know who they are applying to.",
        cta: "Complete profile",
        href: "/host/profile/edit",
      };
  return {
    profile: profileReadiness,
    inventory,
    inventoryStep,
    nextStep,
  };
}

export function canShowHostAllClear(
  readiness: HostReadiness,
  pendingReview: number,
  newApplications: number,
  draftCount: number,
): boolean {
  return (
    readiness.profile.ready &&
    readiness.inventory === "live" &&
    pendingReview === 0 &&
    newApplications === 0 &&
    draftCount === 0
  );
}
