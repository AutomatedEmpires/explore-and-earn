export type SeekerDemoStatusTone = "neutral" | "positive" | "attention";

export interface SeekerDemoStatusPresentation {
  readonly label: string;
  readonly tone: SeekerDemoStatusTone;
}

export const SEEKER_DEMO_ROOT = "/for-seekers/demo";

export function profileEditHrefForApplication(listingId: string): string {
  return `${SEEKER_DEMO_ROOT}/profile/edit?apply=${encodeURIComponent(listingId)}`;
}

export function applicationHrefForListing(listingId: string): string {
  return `${SEEKER_DEMO_ROOT}/listing/${encodeURIComponent(listingId)}/apply`;
}

export function applicationStatus(status: string): SeekerDemoStatusPresentation {
  const normalized = status.trim().toLowerCase();

  switch (normalized) {
    case "applied":
      return { label: "Applied", tone: "attention" };
    case "submitted":
      return { label: "Submitted", tone: "attention" };
    case "reviewing":
      return { label: "Reviewing", tone: "attention" };
    case "saved_by_host":
      return { label: "Saved by host", tone: "attention" };
    case "interview":
      return { label: "Interview scheduled", tone: "attention" };
    case "offered":
      return { label: "Offer received", tone: "positive" };
    case "accepted":
      return { label: "Accepted", tone: "positive" };
    case "active":
      return { label: "Season active", tone: "positive" };
    case "completed":
      return { label: "Season completed", tone: "positive" };
    case "not_selected":
    case "rejected":
      return { label: "Not selected", tone: "neutral" };
    case "withdrawn":
      return { label: "Withdrawn", tone: "neutral" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    default:
      return {
        label: normalized
          ? normalized.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase())
          : "Status unavailable",
        tone: "neutral",
      };
  }
}
