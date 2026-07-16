"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";
import type { ListingClaimStatus } from "@explore-and-earn/contracts";

import { initiateClaimAction } from "../../app/actions/listingClaims";
import styles from "./ClaimListingForm.module.css";

interface ExistingClaim {
  readonly status: ListingClaimStatus;
}

/**
 * The employer claim form for a sourced listing. Collects authority evidence
 * (work email, role, statement) and initiates the claim, which enters founder
 * review. All authorization is server-side; this only gathers the evidence a
 * human reviewer needs. If the caller already has a claim, its status is shown
 * instead of a second form (the server also blocks duplicate active claims).
 */
export function ClaimListingForm({
  listingId,
  listingTitle,
  sourceName,
  employerName,
  existingClaim,
}: {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sourceName: string | null;
  readonly employerName: string | null;
  readonly existingClaim: ExistingClaim | null;
}) {
  const router = useRouter();
  const [workEmail, setWorkEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const activeClaim =
    existingClaim &&
    existingClaim.status !== "rejected" &&
    existingClaim.status !== "revoked";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await initiateClaimAction(listingId, {
      workEmail: workEmail.trim(),
      roleTitle: roleTitle.trim(),
      statement: statement.trim(),
    }).catch(() => ({ ok: false, error: "network" }));
    setSubmitting(false);
    if (result.ok) {
      setSubmitted(true);
    } else {
      setError(errorCopy(result.error));
    }
  }

  if (submitted || activeClaim) {
    return (
      <div className={styles.card}>
        <div className={styles.doneIcon}>
          <Icon name="system.success" size={28} aria-hidden />
        </div>
        <h1 className={styles.title}>Claim submitted for review</h1>
        <p className={styles.lead}>
          Thanks — we&apos;ve received your claim for <strong>{listingTitle}</strong>.
          Our team reviews claims to confirm you can represent this employer.
          You&apos;ll hear from us before anything on the listing changes.
        </p>
        <p className={styles.note}>
          Nothing about this listing changes until you review and confirm every
          detail yourself after approval.
        </p>
        <Button variant="secondary" onClick={() => router.push(`/listing/${listingId}`)}>
          Back to the listing
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Claim this opportunity</h1>
      <p className={styles.lead}>
        <strong>{listingTitle}</strong> was sourced from{" "}
        {sourceName ? <span>{sourceName}</span> : "a public posting"}
        {employerName ? ` (${employerName})` : ""}. If you represent this
        employer, claim it to confirm the details and publish it as your own
        verified listing.
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Work email at this employer</span>
          <input
            className={styles.input}
            type="email"
            required
            value={workEmail}
            onChange={(e) => setWorkEmail(e.target.value)}
            placeholder="you@employer.com"
            autoComplete="email"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Your role</span>
          <input
            className={styles.input}
            type="text"
            required
            maxLength={120}
            value={roleTitle}
            onChange={(e) => setRoleTitle(e.target.value)}
            placeholder="e.g. Operations Manager"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>
            How are you authorized to represent this employer?
          </span>
          <textarea
            className={styles.textarea}
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Tell us your connection to this employer and role in hiring."
          />
        </label>

        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="system.warning" size={16} aria-hidden />
            {error}
          </p>
        ) : null}

        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit claim for review"}
        </Button>
        <p className={styles.disclaimer}>
          Submitting a claim doesn&apos;t change the listing. After our team
          confirms your authority, you&apos;ll review and confirm every detail
          before it becomes a verified Explore &amp; Earn listing.
        </p>
      </form>
    </div>
  );
}

function errorCopy(code: string | undefined): string {
  switch (code) {
    case "claim_already_active":
      return "There's already an active claim on this listing.";
    case "listing_not_sourced":
    case "already_converted":
      return "This listing has already been claimed or confirmed.";
    case "listing_not_live":
      return "This listing is no longer available to claim.";
    case "invalid_authority_evidence":
      return "Please provide a valid work email, your role, and a short statement (10+ characters).";
    case "rate_limit_exceeded":
      return "You've submitted several claims recently — please try again later.";
    case "unauthenticated":
      return "Please sign in to claim this listing.";
    default:
      return "Something went wrong submitting your claim. Please try again.";
  }
}
