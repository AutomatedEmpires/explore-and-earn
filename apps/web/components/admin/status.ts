import type { BadgeProps } from "@explore-and-earn/ui";

/** The Badge variant union, without the optional `undefined`. */
type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/**
 * Title-case a snake_case status token for display, e.g. "under_review" ->
 * "Under Review". Empty/whitespace becomes an em dash.
 */
export function humanizeToken(value: string): string {
  if (!value || !value.trim()) {
    return "\u2014";
  }
  return value
    .split("_")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

/** Map a listing status to a Badge variant. */
export function listingStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "live":
      return "verified";
    case "under_review":
      return "featured";
    case "paused":
      return "seasonal";
    default:
      return "neutral";
  }
}

/** Map a host attestation status to a Badge variant. */
export function attestationVariant(status: string): BadgeVariant {
  return status === "verified" || status === "attested"
    ? "verified"
    : "neutral";
}

/** Format an ISO timestamp for an admin table cell, or an em dash if absent. */
export function formatAdminDate(iso: string | null): string {
  if (!iso) {
    return "\u2014";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "\u2014";
  }
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
