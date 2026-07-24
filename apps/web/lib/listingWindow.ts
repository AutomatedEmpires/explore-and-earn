import { formatMonthYear } from "./format";

export interface ListingWindowInput {
  readonly beginsAt?: string | null;
  readonly endsAt?: string | null;
}

/**
 * The opportunity window for the listing detail page, or null when the host
 * stated no dates at all.
 *
 * Timing is optional: the host form invites hosts to "leave a date open if
 * timing is flexible" and the publication gate only requires the
 * Housing/Meals/Pay triad. So a blank date column must never be rendered as an
 * affirmative claim. The previous inline fallback said "Ongoing" — which
 * asserts the role has no end date, and on a listing stating only an END date
 * contradicted the host outright. It was also the only place in the codebase
 * inventing that word; every other surface routes through
 * formatOpportunityWindow, which says "Open".
 *
 * Returning null rather than a placeholder keeps the decision with the caller:
 * the hero shows no chip, the at-a-glance grid shows "Not stated".
 */
export function formatListingWindow(listing: ListingWindowInput): string | null {
  if (listing.beginsAt && listing.endsAt) {
    return `${formatMonthYear(listing.beginsAt)} – ${formatMonthYear(listing.endsAt)}`;
  }
  if (listing.beginsAt) return `Starting ${formatMonthYear(listing.beginsAt)}`;
  if (listing.endsAt) return `Until ${formatMonthYear(listing.endsAt)}`;
  return null;
}
