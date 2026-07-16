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
import styles from "../../shared.module.css";

export const metadata: Metadata = { title: "Claims" };
export const dynamic = "force-dynamic";

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
  // Service-role reads happen in the db layer (server component only — the
  // key and raw claim rows are never serialized to the client).
  const [pending, decided] = await Promise.all([
    getClaimsAwaitingReview(),
    getRecentlyDecidedClaims(20),
  ]);

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
          Review employer claims on sourced listings. Approving invites the
          claimant to confirm every detail under their own host profile;
          rejecting leaves the listing untouched. Nothing changes on a listing
          from this queue alone.
        </p>
      </header>
      <ClaimsReviewQueue pending={pending.map(toView)} decided={decided.map(toView)} stats={stats} />
    </section>
  );
}
