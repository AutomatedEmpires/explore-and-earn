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
/**
 * Whole months the engagement actually runs, or null when the host didn't state
 * both ends.
 *
 * TrueValue needs this because it used to annualise: keptMonthly * 12, rendered
 * as "roughly $X over a year". On a marketplace built for SEASONAL work that
 * overstates the benefit badly — a Jun–Sep orchard role is four months, so the
 * figure was ~3x the truth. A saving the seeker will never realise is a
 * fabricated metric, so when the duration is unknown we say nothing rather than
 * assume a year.
 */
export function listingDurationMonths(listing: ListingWindowInput): number | null {
  if (!listing.beginsAt || !listing.endsAt) return null;
  const begins = new Date(listing.beginsAt).getTime();
  const ends = new Date(listing.endsAt).getTime();
  if (!Number.isFinite(begins) || !Number.isFinite(ends) || ends <= begins) {
    return null;
  }
  const months = Math.round((ends - begins) / (30.44 * 24 * 60 * 60 * 1000));
  return months >= 1 ? months : 1;
}

export function formatListingWindow(listing: ListingWindowInput): string | null {
  if (listing.beginsAt && listing.endsAt) {
    return `${formatMonthYear(listing.beginsAt)} – ${formatMonthYear(listing.endsAt)}`;
  }
  if (listing.beginsAt) return `Starting ${formatMonthYear(listing.beginsAt)}`;
  if (listing.endsAt) return `Until ${formatMonthYear(listing.endsAt)}`;
  return null;
}
