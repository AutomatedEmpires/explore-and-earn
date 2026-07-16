"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";
import type { ListingClaimStatus } from "@explore-and-earn/contracts";

import {
  beginClaimConfirmationAction,
  initiateClaimAction,
} from "../../app/actions/listingClaims";
import {
  ClaimConfirmationForm,
  type ConfirmationPrefill,
} from "./ClaimConfirmationForm";
import styles from "./ClaimListingForm.module.css";

interface ExistingClaim {
  readonly id: string;
  readonly status: ListingClaimStatus;
  readonly hostProfileId: string | null;
  readonly reviewNotes: string | null;
}

/**
 * The employer claim surface for a sourced listing — STATUS-AWARE across the
 * whole claim-to-verify journey:
 *
 *   no claim            → authority-evidence form (work email, role, statement)
 *   in review           → honest "submitted, pending review" card
 *   approved            → explanation + "Begin confirmation" (host-onboarding
 *                         hand-off when the claimant has no host profile yet)
 *   confirming          → field-by-field review of EVERY sourced value
 *                         (ClaimConfirmationForm — accept-as-is is explicit)
 *   converted           → success card linking the host listing manager
 *   rejected / revoked  → honest decision card with the review note, plus the
 *                         option to submit a fresh claim
 *
 * All authorization is server-side; this only gathers evidence and confirmed
 * values. The server also blocks duplicate active claims.
 */
export function ClaimListingForm({
  listingId,
  listingTitle,
  sourceName,
  employerName,
  existingClaim,
  confirmationPrefill,
}: {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly sourceName: string | null;
  readonly employerName: string | null;
  readonly existingClaim: ExistingClaim | null;
  /** Current sourced values, provided by the page ONLY while status === 'confirming'. */
  readonly confirmationPrefill: ConfirmationPrefill | null;
}) {
  const router = useRouter();
  const [workEmail, setWorkEmail] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [statement, setStatement] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [reclaiming, setReclaiming] = useState(false);
  const [beginning, setBeginning] = useState(false);
  const [needsHostProfile, setNeedsHostProfile] = useState(false);

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
      setReclaiming(false);
      router.refresh();
    } else {
      setError(errorCopy(result.error));
    }
  }

  async function handleBeginConfirmation() {
    if (!existingClaim) return;
    setError(null);
    setBeginning(true);
    const result = await beginClaimConfirmationAction(existingClaim.id).catch(() => ({
      ok: false,
      error: "network",
    }));
    setBeginning(false);
    if (result.ok) {
      router.refresh();
    } else if (result.error === "host_profile_required") {
      setNeedsHostProfile(true);
    } else {
      setError(errorCopy(result.error));
    }
  }

  const status = existingClaim?.status ?? null;

  /* ── Converted: the loop is closed ────────────────────────────────────── */
  if (status === "converted") {
    return (
      <div className={styles.card}>
        <div className={styles.doneIcon}>
          <Icon name="system.success" size={28} aria-hidden />
        </div>
        <h1 className={styles.title}>This listing is yours</h1>
        <p className={styles.lead}>
          You confirmed <strong>{listingTitle}</strong> and it&apos;s now published
          as your verified Explore &amp; Earn listing, managed from your host
          dashboard like any listing you created yourself.
        </p>
        <Button variant="primary" onClick={() => router.push("/host/listings")}>
          Manage your listings
        </Button>
        <Button variant="secondary" onClick={() => router.push(`/listing/${listingId}`)}>
          View the listing
        </Button>
      </div>
    );
  }

  /* ── Confirming: field-by-field review ────────────────────────────────── */
  if (status === "confirming" && existingClaim) {
    if (!confirmationPrefill || !existingClaim.hostProfileId) {
      return (
        <div className={styles.card}>
          <h1 className={styles.title}>Confirmation unavailable</h1>
          <p className={styles.lead}>
            We couldn&apos;t load the listing details for confirmation. Please
            refresh the page and try again.
          </p>
          <Button variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
        </div>
      );
    }
    return (
      <ClaimConfirmationForm
        claimId={existingClaim.id}
        hostProfileId={existingClaim.hostProfileId}
        listingId={listingId}
        prefill={confirmationPrefill}
      />
    );
  }

  /* ── Approved: begin confirmation (or host-onboarding hand-off) ───────── */
  if (status === "approved") {
    if (needsHostProfile) {
      return (
        <div className={styles.card}>
          <h1 className={styles.title}>One step first: create your host profile</h1>
          <p className={styles.lead}>
            Your claim for <strong>{listingTitle}</strong> is approved. To take
            over the listing you need a host profile — that&apos;s the verified
            identity the listing will belong to.
          </p>
          <p className={styles.note}>
            Set up your host profile, then come back to this page and press
            &quot;Begin confirmation&quot; again to review every detail.
          </p>
          <Button variant="primary" onClick={() => router.push("/host/onboarding")}>
            Create your host profile
          </Button>
          <Button variant="ghost" onClick={() => setNeedsHostProfile(false)}>
            Back
          </Button>
        </div>
      );
    }
    return (
      <div className={styles.card}>
        <div className={styles.doneIcon}>
          <Icon name="system.success" size={28} aria-hidden />
        </div>
        <h1 className={styles.title}>Your claim was approved</h1>
        <p className={styles.lead}>
          We&apos;ve confirmed you can represent this employer. Next, you review
          every detail of <strong>{listingTitle}</strong> — exactly as it was
          sourced — and correct or confirm each field. Only after your explicit
          confirmation does it become your verified listing.
        </p>
        <p className={styles.note}>
          Nothing on the listing has changed yet, and nothing will until you
          confirm it yourself.
        </p>
        {error ? (
          <p className={styles.error} role="alert">
            <Icon name="system.warning" size={16} aria-hidden />
            {error}
          </p>
        ) : null}
        <Button variant="primary" disabled={beginning} onClick={handleBeginConfirmation}>
          {beginning ? "Starting…" : "Begin confirmation"}
        </Button>
      </div>
    );
  }

  /* ── Rejected / revoked: honest decision card (+ optional re-claim) ────── */
  if ((status === "rejected" || status === "revoked") && !reclaiming && !submitted) {
    const rejected = status === "rejected";
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>
          {rejected ? "Your claim wasn't approved" : "Your claim was revoked"}
        </h1>
        <p className={styles.lead}>
          {rejected ? (
            <>
              We reviewed your claim for <strong>{listingTitle}</strong> and
              couldn&apos;t confirm your authority to represent this employer.
              The listing stays exactly as it was sourced.
            </>
          ) : (
            <>
              Your claim on <strong>{listingTitle}</strong> was revoked and the
              listing was restored to its original sourced state.
            </>
          )}
        </p>
        {existingClaim?.reviewNotes ? (
          <p className={styles.reviewNote}>
            <span className={styles.reviewNoteLabel}>Reviewer&apos;s note</span>
            {existingClaim.reviewNotes}
          </p>
        ) : null}
        <p className={styles.note}>
          If you believe this was a mistake, you can submit a new claim with
          stronger evidence of your authority.
        </p>
        <Button variant="primary" onClick={() => setReclaiming(true)}>
          Submit a new claim
        </Button>
        <Button variant="secondary" onClick={() => router.push(`/listing/${listingId}`)}>
          Back to the listing
        </Button>
      </div>
    );
  }

  /* ── Pending review (or just submitted) ───────────────────────────────── */
  const pendingReview =
    submitted ||
    status === "initiated" ||
    status === "verification_pending" ||
    status === "requires_review";
  if (pendingReview) {
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

  /* ── No claim yet: the authority-evidence form ────────────────────────── */
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
      {reclaiming ? (
        <Link className={styles.backLink} href={`/listing/${listingId}`}>
          Back to the listing
        </Link>
      ) : null}
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
    case "claim_not_approved":
      return "This claim isn't in an approved state — refresh the page for its current status.";
    case "not_claimant":
      return "Only the person who submitted this claim can continue it.";
    default:
      return "Something went wrong. Please try again.";
  }
}
