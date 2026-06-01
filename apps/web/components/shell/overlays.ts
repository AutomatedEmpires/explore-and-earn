// Typed overlay registry.
// Source of truth: docs/ux/modal-sheet-system.md (Notion: Popup Architecture & Modal Families, Canonical Page Registry).
// SCOPE: keys + types + static descriptors only. No open/close state, no rendering, no permission enforcement, no analytics emission.
// The ModalHost overlay router (components/shell/ModalHost.tsx) will consume this registry later.

export type OverlayFormFactor =
  | "modal"
  | "sheet"
  | "drawer"
  | "popover"
  | "fullscreen";

/** Behavior families from canon (Popup Architecture & Modal Families). */
export type OverlayFamily =
  | "profile"
  | "media"
  | "detail"
  | "workflow"
  | "navigation";

export type OverlayKey =
  // profile
  | "seekerProfile"
  | "hostProfile"
  | "platformProfile"
  | "adminProfile"
  // media
  | "coverPhotoBucket"
  | "iconPhotoBucket"
  | "hostPhotoCarousel"
  | "housingMedia"
  | "mealsMedia"
  // detail
  | "listingDetail"
  | "discoveryCardDetail"
  | "seekerResume"
  | "quickPeek"
  | "matchScoreExplanation"
  // workflow
  | "reportPipeline"
  | "scheduling"
  | "messaging"
  | "getMoreListings"
  | "getMoreAnnouncements"
  | "upgradeProfessional"
  | "upgradeEnterprise"
  | "boostListing"
  // navigation / utility
  | "hostMore"
  | "notificationCenter";

export type OverlayDescriptor = {
  family: OverlayFamily;
  /** Responsive form-factor. Mobile is the design target. */
  mobile: OverlayFormFactor;
  desktop: OverlayFormFactor;
  /** If content outgrows the overlay it may escalate to this full route (pattern string). */
  escalatesTo?: string;
  /** Requires a permission/tier check before opening. CHECK ONLY — no billing/entitlement logic lives here. */
  gated?: boolean;
};

export const overlayRegistry: Record<OverlayKey, OverlayDescriptor> = {
  // profile (F1)
  seekerProfile: { family: "profile", mobile: "sheet", desktop: "modal" },
  hostProfile: { family: "profile", mobile: "sheet", desktop: "modal" },
  platformProfile: { family: "profile", mobile: "sheet", desktop: "modal" },
  adminProfile: { family: "profile", mobile: "sheet", desktop: "modal" },
  // media (F2) — source order: listing override -> host profile bucket
  coverPhotoBucket: { family: "media", mobile: "sheet", desktop: "modal" },
  iconPhotoBucket: { family: "media", mobile: "sheet", desktop: "modal" },
  hostPhotoCarousel: { family: "media", mobile: "fullscreen", desktop: "fullscreen" },
  housingMedia: { family: "media", mobile: "fullscreen", desktop: "modal" },
  mealsMedia: { family: "media", mobile: "fullscreen", desktop: "modal" },
  // detail (F3)
  listingDetail: { family: "detail", mobile: "sheet", desktop: "modal", escalatesTo: "/opportunities/[slug]" },
  discoveryCardDetail: { family: "detail", mobile: "sheet", desktop: "modal" },
  seekerResume: { family: "detail", mobile: "fullscreen", desktop: "modal" },
  quickPeek: { family: "detail", mobile: "sheet", desktop: "popover" },
  matchScoreExplanation: { family: "detail", mobile: "sheet", desktop: "popover" },
  // workflow (F4)
  reportPipeline: { family: "workflow", mobile: "sheet", desktop: "modal" },
  scheduling: { family: "workflow", mobile: "sheet", desktop: "drawer" },
  messaging: { family: "workflow", mobile: "fullscreen", desktop: "drawer" },
  getMoreListings: { family: "workflow", mobile: "sheet", desktop: "modal" },
  getMoreAnnouncements: { family: "workflow", mobile: "sheet", desktop: "modal" },
  upgradeProfessional: { family: "workflow", mobile: "sheet", desktop: "modal", gated: true },
  upgradeEnterprise: { family: "workflow", mobile: "sheet", desktop: "modal", gated: true },
  boostListing: { family: "workflow", mobile: "sheet", desktop: "modal", gated: true },
  // navigation / utility (F5)
  hostMore: { family: "navigation", mobile: "sheet", desktop: "popover" },
  notificationCenter: { family: "navigation", mobile: "sheet", desktop: "drawer" },
};
