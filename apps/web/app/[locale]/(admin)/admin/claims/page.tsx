import type { Metadata } from "next";
import {
  getClaimsAwaitingReview,
  getRecentlyDecidedClaims,
  type ListingClaimReviewRow,
} from "@explore-and-earn/db";

import {
  ClaimsReviewQueue,
  type ClaimReviewRowView,
} from "../../../../../components/admin";
import { isDevBenchEnabled } from "../../../../../lib/devBench";
import { readDevRole } from "../../../../../lib/devBench/server";
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Claims" };
export const dynamic = "force-dynamic";

const DEV_PENDING_CLAIMS: ReadonlyArray<ClaimReviewRowView> = [
  {
    id: "dev-claim-north-cascades-pending",
    listingId: "dev-listing-north-cascades-stewardship",
    listingTitle:
      "North Cascades Wilderness Stewardship and Guest Services Seasonal Team",
    status: "requires_review",
    workEmail:
      "claims-review-operations@north-cascades-wilderness-stewardship.example",
    roleTitle: "Seasonal operations director",
    statement:
      "I lead seasonal hiring and can verify the source details before this listing becomes host-managed.",
    reviewNotes: null,
    createdAt: "2026-07-28T16:00:00.000Z",
    decidedAt: null,
  },
];

const DEV_DECIDED_CLAIMS: ReadonlyArray<ClaimReviewRowView> = [
  {
    id: "dev-claim-north-cascades-converted",
    listingId: "dev-listing-north-cascades-field-operations",
    listingTitle: "North Cascades Field Operations Lodge",
    status: "converted",
    workEmail:
      "converted-claims-review@north-cascades-wilderness-stewardship.example",
    roleTitle: "Host operations manager",
    statement: "I own this host profile and confirmed every listing detail.",
    reviewNotes: "Authority confirmed through the host onboarding review.",
    createdAt: "2026-07-08T16:00:00.000Z",
    decidedAt: "2026-07-10T18:30:00.000Z",
  },
];

/**
 * Defensively pick the human-review fields out of the authority_evidence
 * jsonb. Values were validated at claim initiation, but the column is still
 * untyped storage — never trust its shape at render time.
 */
function evidenceField(evidence: unknown, key: string): string | null {
  if (!evidence || typeof evidence !== "object") return null;
  const value = (evidence as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** db row → client view. Raw Clerk ids are dropped here, never serialized. */
function toView(row: ListingClaimReviewRow): ClaimReviewRowView {
  return {
    id: row.id,
    listingId: row.listingId,
    listingTitle: row.listingTitle,
    status: row.status,
    workEmail: evidenceField(row.authorityEvidence, "workEmail"),
    roleTitle: evidenceField(row.authorityEvidence, "roleTitle"),
    statement: evidenceField(row.authorityEvidence, "statement"),
    reviewNotes: row.reviewNotes,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

export default async function AdminClaimsPage() {
  const isDevReview =
    isDevBenchEnabled() && (await readDevRole()) === "admin";

  let pending: ReadonlyArray<ClaimReviewRowView>;
  let decided: ReadonlyArray<ClaimReviewRowView>;

  if (isDevReview) {
    pending = DEV_PENDING_CLAIMS;
    decided = DEV_DECIDED_CLAIMS;
  } else {
    // Service-role reads happen in the db layer (server component only — the
    // key and raw claim rows are never serialized to the client).
    const [pendingRows, decidedRows] = await Promise.all([
      getClaimsAwaitingReview(),
      getRecentlyDecidedClaims(20),
    ]);
    pending = pendingRows.map(toView);
    decided = decidedRows.map(toView);
  }

  const stats = {
    pending: pending.length,
    converted: decided.filter((c) => c.status === "converted").length,
    rejected: decided.filter((c) => c.status === "rejected" || c.status === "revoked").length,
  };

  return (
    <section className={styles.page}>
      <header className={styles.heading}>
        <h1 className={styles.title}>Listing claims</h1>
        <p className={styles.subtitle}>
          Review host claims on sourced listings. Approving invites the
          claimant to confirm every detail under their own host profile;
          rejecting leaves the listing untouched. Nothing changes on a listing
          from this queue alone.
        </p>
      </header>
      <ClaimsReviewQueue pending={pending} decided={decided} stats={stats} />
    </section>
  );
}
