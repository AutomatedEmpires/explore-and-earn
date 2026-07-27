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
 * sentence has to survive the question "is that true?" — so `archived` does not
 * imply a way back that the transition graph does not have.
 *
 * `closed` is the one status whose meaning depends on the listing: this map
 * carries the VERIFIED-inventory sentence, and a sourced listing gets a
 * different one from {@link hostStatusHint}. Reading this map directly on a
 * sourced closed listing tells the host two false things at once.
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

/**
 * What a SOURCED listing's `closed` actually means.
 *
 * Both clauses of the verified sentence are false here. Explore & Earn did not
 * close it — the freshness sweep and snapshot reconciliation write `closed` when
 * the ORIGIN stops carrying the posting. And it cannot be reopened as a draft:
 * migration 082 refuses closed -> draft for provenance='sourced', which is also
 * why `hostListingTransitions` draws no button.
 */
const SOURCED_CLOSED_HINT =
  "No longer listed at its original source, so it's closed here too. " +
  "It can't be reopened — duplicate it to start your own version.";

/**
 * The hint to show for a listing in `status`.
 *
 * `provenance` is not decoration, for the same reason it is not in
 * {@link hostListingTransitions}: on a SOURCED closed listing the verified
 * sentence says Explore & Earn closed it (the origin did) and offers a reopen
 * that migration 082 refuses. The component reads this rather than indexing
 * {@link HOST_STATUS_HINT} directly.
 */
export function hostStatusHint(
  status: ListingStatus,
  provenance?: string | null,
): string {
  if (status === "closed" && provenance === "sourced") return SOURCED_CLOSED_HINT;
  return HOST_STATUS_HINT[status];
}

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

/**
 * Statuses that occupy a plan listing slot.
 *
 * The same three private.enforce_listing_allowance counts (migration 083), in
 * the same order, for the same reason: the slot is committed the moment a draft
 * enters review, not when it goes public.
 */
const COUNTED_STATUSES: readonly ListingStatus[] = [
  "live",
  "paused",
  "under_review",
];

/**
 * Whether moving from `current` to `target` needs an active plan.
 *
 * MIRRORS THE TRIGGER, and mirrors its exemptions exactly — this is the same
 * relationship {@link hostListingTransitions} has to canTransitionListing. It
 * decides which sentence to draw. It authorizes nothing, and the server action
 * behind the button does not consult it.
 *
 * WHY THIS IS NOT JUST "target === 'live'". The allowance counts under_review
 * too, so a prospect is refused at "Mark ready to publish", one step BEFORE the
 * publish button they were told about. Gating only the publish edge would let a
 * host click into a raw `listing_allowance_exceeded` from the database — which
 * is precisely the leak this exists to close.
 *
 * The two exemptions are the trigger's own, and both matter:
 *   * a move between two already-counted statuses consumes no new slot, so
 *     nothing is gated unless it ENTERS 'live' (the trigger refuses that edge
 *     specifically, so that an over-allowance host cannot pause and resume
 *     forever);
 *   * every route OUT of a counted status is free. A host who cannot publish
 *     must still be able to pause and archive their own work — a refusal must
 *     never trap someone reducing their own footprint.
 */
export function transitionRequiresActivePlan(
  current: ListingStatus,
  target: HostManageableListingStatus,
): boolean {
  if (!COUNTED_STATUSES.includes(target)) return false;
  if (COUNTED_STATUSES.includes(current)) return target === "live";
  return true;
}
