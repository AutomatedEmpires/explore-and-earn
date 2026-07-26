import type { ListingStatus } from "@explore-and-earn/contracts";

/**
 * The host listing status controls, as DATA.
 *
 * Lives in a plain .ts module (not beside the component) for one reason: this
 * app sets `jsx: "preserve"`, so vitest cannot transform a .tsx and none of
 * this would be testable there. The component below it renders these entries
 * and owns nothing about which transitions exist.
 *
 * This mirrors the authoritative server gate — canTransitionListing in
 * @explore-and-earn/db, itself backed by migration 082's trigger. It exists to
 * decide which buttons to draw, never to authorize anything.
 */

/**
 * The statuses a host may ask the server to move a listing TO. `closed` is
 * absent because no host action produces it — only an operator rejection or the
 * sourced sweeps write it. Must stay assignable to updateListingStatusAction's
 * parameter; the component's call site is what proves it at compile time.
 */
export type HostManageableListingStatus = Exclude<ListingStatus, "closed">;

export interface HostListingTransition {
  readonly target: HostManageableListingStatus;
  readonly label: string;
  readonly variant: "primary" | "secondary";
}

/**
 * Status labels for the host's own management view.
 *
 * `under_review` reads "Ready to publish" here, not "Under review": since the
 * founder's 2026-07-26 decision there is no admin approval between it and
 * `live`, and a badge promising a review nobody performs is exactly the kind of
 * copy this codebase treats as a defect. The state still exists — it is the
 * completed-but-not-yet-public step, and the one an operator can still hold or
 * reject from — so it keeps its column name and its admin-facing label.
 */
export const HOST_STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  under_review: "Ready to publish",
  live: "Live",
  paused: "Paused",
  closed: "Closed",
  archived: "Archived",
};

/**
 * What each state actually means for the host, in their own terms. Every
 * sentence has to survive the question "is that true?" — so `closed` does not
 * promise a reopen that migration 082 refuses for sourced listings, and
 * `archived` does not imply a way back that the transition graph does not have.
 */
export const HOST_STATUS_HINT: Record<ListingStatus, string> = {
  draft: "Only you can see this. Mark it ready once Housing, Meals and Pay are answered.",
  under_review:
    "Complete and not yet public. Publishing puts it in front of seekers straight away.",
  live: "Visible to seekers now.",
  paused: "Hidden from seekers. Resuming makes it visible again.",
  closed: "Closed by Explore & Earn. Reopen it as a draft to make changes and publish again.",
  archived: "Archived for good. Duplicate it to start a new listing from this one.",
};

const TRANSITIONS: Record<ListingStatus, readonly HostListingTransition[]> = {
  draft: [{ target: "under_review", label: "Mark ready to publish", variant: "primary" }],
  // Publishing is a host action (founder, 2026-07-26). There is no approval
  // step; what stands between here and seekers is the benefit triad, and a
  // listing cannot have reached this state without answering it.
  under_review: [
    { target: "live", label: "Publish now", variant: "primary" },
    { target: "draft", label: "Back to draft", variant: "secondary" },
  ],
  live: [
    { target: "paused", label: "Pause", variant: "secondary" },
    { target: "archived", label: "Archive", variant: "secondary" },
  ],
  paused: [
    { target: "live", label: "Resume", variant: "primary" },
    { target: "archived", label: "Archive", variant: "secondary" },
  ],
  closed: [{ target: "draft", label: "Reopen as draft", variant: "primary" }],
  archived: [],
};

/**
 * The transitions to offer for a listing in `status`.
 *
 * `provenance` is not decoration. For a SOURCED listing, `closed` records that
 * the origin withdrew the posting — the freshness sweep and snapshot
 * reconciliation both write it — and migration 082 refuses to reopen it. Drawing
 * a "Reopen as draft" button there would offer an action the database will
 * reject, so it is withheld.
 */
export function hostListingTransitions(
  status: ListingStatus,
  provenance?: string | null,
): readonly HostListingTransition[] {
  if (status === "closed" && provenance === "sourced") return [];
  return TRANSITIONS[status] ?? [];
}
