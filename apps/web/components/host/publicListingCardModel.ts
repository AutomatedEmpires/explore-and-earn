import type { BenefitProvision } from "@explore-and-earn/contracts";
import { NOT_STATED_LABEL } from "@explore-and-earn/contracts";
import type { PublicHostListing } from "@explore-and-earn/db";

import { formatCompensation } from "../../lib/format";

/**
 * The public host-profile card's derived strings, in a plain .ts module.
 *
 * Lives outside the .tsx because this app sets `jsx: "preserve"` — vitest cannot
 * transform a .tsx, so anything asserted about what the card SAYS has to live
 * here to be testable at all.
 */

/**
 * Pay, as the anonymous /host/[id] surface shows it.
 *
 * This delegates to `formatCompensation` and does nothing of its own. That is
 * the point: the card used to derive pay inline, so the founder's 2026-07-26
 * pay-display decision (a lone floor reads "From $x", a lone ceiling reads
 * "Up to $x", silence reads "Not stated") landed everywhere EXCEPT here — the
 * one pay string an anonymous, crawlable page renders. It read a bare "$1,500"
 * for a floor, ignored `compensationMaxCents` entirely so a ceiling-only listing
 * fell through to a stand-in, and printed "See listing" for silence: an
 * invention, and the same defect the triad's "absence is never a no" rule exists
 * to stop.
 */
export function publicListingPaySummary(listing: PublicHostListing): string {
  return formatCompensation({
    summary: listing.compensationSummary,
    minCents: listing.compensationMinCents,
    maxCents: listing.compensationMaxCents,
    unit: listing.compensationUnit,
    currency: listing.compensationCurrency,
  });
}

/**
 * The pay provision the card is handed.
 *
 * Derived from the same string rather than hardcoded to "provided".
 * `PublicHostListing` carries no pay_evidence column, so the honest signal
 * available here is whether a pay string exists at all — and a sourced listing
 * whose origin never stated pay reaches this surface, so "provided" was not
 * always true. Read off the rendered summary so the two can never disagree.
 */
export function publicListingPayProvision(
  listing: PublicHostListing,
): BenefitProvision {
  return publicListingPaySummary(listing) === NOT_STATED_LABEL
    ? "not_stated"
    : "provided";
}
