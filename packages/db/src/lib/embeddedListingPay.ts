import {
  projectListingPay,
  type ListingPayProjection,
} from "@explore-and-earn/contracts";

/**
 * Extracts the canonical pay projection from an embedded Supabase listing row.
 * Query adapters use this instead of rebuilding display claims independently.
 */
export function projectEmbeddedListingPay(
  row: Record<string, unknown>,
): ListingPayProjection {
  return projectListingPay({
    summary:
      typeof row.compensation_summary === "string"
        ? row.compensation_summary
        : null,
    minCents:
      typeof row.compensation_min_cents === "number"
        ? row.compensation_min_cents
        : null,
    maxCents:
      typeof row.compensation_max_cents === "number"
        ? row.compensation_max_cents
        : null,
    unit:
      typeof row.compensation_unit === "string"
        ? row.compensation_unit
        : null,
    currency:
      typeof row.compensation_currency === "string"
        ? row.compensation_currency
        : "USD",
  });
}
