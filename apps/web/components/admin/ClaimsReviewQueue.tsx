"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Badge,
  type BadgeProps,
  Button,
  Icon,
  MetricCard,
  MetricGrid,
} from "@explore-and-earn/ui";

import { reviewClaimAction, revokeClaimAction } from "../../app/actions/listingClaims";
import { formatAdminDate, humanizeToken } from "./status";
import styles from "./ClaimsReviewQueue.module.css";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

/**
 * One claim row, shaped server-side from getClaimsAwaitingReview /
 * getRecentlyDecidedClaims (real columns only). Raw Clerk ids are NEVER passed
 * in — the claimant is identified by their asserted authority evidence (work
 * email + role), which is exactly what the human reviewer must judge.
 */
export interface ClaimReviewRowView {
  readonly id: string;
  readonly listingId: string;
  readonly listingTitle: string;
  readonly status: string;
  readonly workEmail: string | null;
  readonly roleTitle: string | null;
  readonly statement: string | null;
  readonly reviewNotes: string | null;
  readonly createdAt: string;
  readonly decidedAt: string | null;
}

/** Queue stat counts, derived server-side. */
export interface ClaimStatsView {
  readonly pending: number;
  readonly converted: number;
  readonly rejected: number;
}

/** Map a claim status to a Badge variant. */
function statusVariant(status: string): BadgeVariant {
  switch (status) {
    case "approved":
    case "confirming":
      return "featured";
    case "converted":
      return "verified";
    case "rejected":
    case "revoked":
      return "neutral";
    default:
      return "info"; // requires_review / verification_pending — awaiting a decision
  }
}

/** A short, human "age" string from an ISO timestamp (queue triage signal). */
function claimAge(iso: string): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

type ConfirmTarget =
  | { readonly kind: "approve"; readonly id: string }
  | { readonly kind: "revoke"; readonly id: string }
  | null;

/**
 * Admin Claims Review — the decision surface that closes the claim-to-verify
 * loop, inside the admin dark-glass OS.
 *
 * Each pending card is one employer claim on a SOURCED listing: the listing
 * title, the claimant's asserted authority (work email, role, statement), and
 * approve/reject with an optional note. Approving lets the claimant confirm
 * every field before anything changes; rejecting closes the claim and the
 * listing stays as-is. The decided rail shows the recent audit trail; a
 * CONVERTED claim exposes Revoke (two-step confirm), which restores the exact
 * pre-conversion sourced snapshot server-side.
 */
export function ClaimsReviewQueue({
  pending,
  decided,
  stats,
}: {
  readonly pending: ReadonlyArray<ClaimReviewRowView>;
  readonly decided: ReadonlyArray<ClaimReviewRowView>;
  readonly stats: ClaimStatsView;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function noteFor(id: string): string | undefined {
    const note = (notes[id] ?? "").trim();
    return note.length > 0 ? note : undefined;
  }

  function runDecision(claimId: string, decision: "approved" | "rejected") {
    setError(null);
    setPendingId(claimId);
    setConfirm(null);
    startTransition(async () => {
      const result = await reviewClaimAction(claimId, decision, noteFor(claimId));
      setPendingId(null);
      if (!result.ok) {
        setError(
          result.error === "forbidden"
            ? "You are not authorized to review claims."
            : result.error ?? "Something went wrong.",
        );
      } else {
        router.refresh();
      }
    });
  }

  function runRevoke(claimId: string) {
    setError(null);
    setPendingId(claimId);
    setConfirm(null);
    startTransition(async () => {
      const result = await revokeClaimAction(claimId, noteFor(claimId));
      setPendingId(null);
      if (!result.ok) {
        setError(
          result.error === "forbidden"
            ? "You are not authorized to revoke claims."
            : result.error ?? "Something went wrong.",
        );
      } else {
        router.refresh();
      }
    });
  }

  const decidedVisible = useMemo(() => decided.slice(0, 20), [decided]);

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Awaiting review"
          value={stats.pending}
          trend={stats.pending > 0 ? "Needs a decision" : "Clear"}
          trendTone={stats.pending > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Converted"
          value={stats.converted}
          trend="Sourced → verified"
          trendTone="up"
        />
        <MetricCard
          label="Rejected"
          value={stats.rejected}
          trend="No listing change"
          trendTone="neutral"
        />
      </MetricGrid>

      {error ? (
        <p className={styles.error} role="alert">
          <Icon aria-hidden name="system.error" size={16} className={styles.errorIcon} />
          {error}
        </p>
      ) : null}

      {pending.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>No claims awaiting review</h3>
          <p className={styles.emptySub}>
            When an employer claims a sourced listing, it lands here. Approving
            lets them review and confirm every detail themselves — nothing on a
            listing changes from this queue alone.
          </p>
        </div>
      ) : (
        <div className={styles.grid} role="list">
          {pending.map((claim) => {
            const busy = isPending && pendingId === claim.id;
            const confirming = confirm?.kind === "approve" && confirm.id === claim.id;
            return (
              <article key={claim.id} role="listitem" className={styles.card}>
                <span className={styles.edge} aria-hidden="true" />

                <div className={styles.cardHead}>
                  <Link className={styles.listingLink} href={`/listing/${claim.listingId}`}>
                    {claim.listingTitle || "Untitled listing"}
                  </Link>
                  <Badge
                    label={humanizeToken(claim.status)}
                    variant={statusVariant(claim.status)}
                    icon="status.open"
                  />
                </div>

                <dl className={styles.identity}>
                  <div className={styles.identityRow}>
                    <dt className={styles.identityLabel}>Work email</dt>
                    <dd className={styles.identityValue}>
                      {claim.workEmail ?? "Not provided"}
                    </dd>
                  </div>
                  <div className={styles.identityRow}>
                    <dt className={styles.identityLabel}>Role</dt>
                    <dd className={styles.identityValue}>
                      {claim.roleTitle ?? "Not provided"}
                    </dd>
                  </div>
                </dl>

                {claim.statement ? (
                  <p className={styles.statement}>“{claim.statement}”</p>
                ) : (
                  <p className={styles.statementEmpty}>No authority statement provided.</p>
                )}

                <div className={styles.cardFootMeta}>
                  <span className={styles.age}>
                    <Icon name="status.begins" size={16} aria-hidden />
                    <span>{claimAge(claim.createdAt)}</span>
                    <span className={styles.date}>{formatAdminDate(claim.createdAt)}</span>
                  </span>
                </div>

                <label className={styles.noteField}>
                  <span className={styles.noteLabel}>Review note (optional)</span>
                  <textarea
                    className={styles.noteInput}
                    rows={2}
                    maxLength={2000}
                    value={notes[claim.id] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [claim.id]: e.target.value }))
                    }
                    placeholder="Why this decision — the claimant sees this on rejection."
                  />
                </label>

                {confirming ? (
                  <div className={styles.confirm} role="group" aria-label="Confirm approval">
                    <p className={styles.confirmText}>
                      Approve this claim? The claimant will be invited to review
                      and confirm every listing detail under their host profile.
                    </p>
                    <div className={styles.actions}>
                      <Button
                        variant="ghost"
                        icon="action.close"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        icon="status.accepted"
                        disabled={busy}
                        aria-label={`Confirm approval of the claim on ${claim.listingTitle}`}
                        onClick={() => runDecision(claim.id, "approved")}
                      >
                        {busy ? "Approving…" : "Confirm approval"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      icon="status.declined"
                      disabled={busy}
                      aria-label={`Reject the claim on ${claim.listingTitle}`}
                      onClick={() => runDecision(claim.id, "rejected")}
                    >
                      {busy ? "Working…" : "Reject"}
                    </Button>
                    <Button
                      variant="primary"
                      icon="status.accepted"
                      disabled={busy}
                      aria-label={`Approve the claim on ${claim.listingTitle}`}
                      onClick={() => {
                        setError(null);
                        setConfirm({ kind: "approve", id: claim.id });
                      }}
                    >
                      Approve claim
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <section className={styles.decided} aria-label="Recently decided claims">
        <h2 className={styles.decidedTitle}>Recently decided</h2>
        {decidedVisible.length === 0 ? (
          <p className={styles.decidedEmpty}>No decided claims yet.</p>
        ) : (
          <ul className={styles.decidedList}>
            {decidedVisible.map((claim) => {
              const busy = isPending && pendingId === claim.id;
              const revoking = confirm?.kind === "revoke" && confirm.id === claim.id;
              return (
                <li key={claim.id} className={styles.decidedRow}>
                  <div className={styles.decidedMain}>
                    <Badge
                      label={humanizeToken(claim.status)}
                      variant={statusVariant(claim.status)}
                    />
                    <Link
                      className={styles.decidedListing}
                      href={`/listing/${claim.listingId}`}
                    >
                      {claim.listingTitle || "Untitled listing"}
                    </Link>
                    <span className={styles.decidedMeta}>
                      {claim.workEmail ?? "No work email"}
                      <span className={styles.metaDot} aria-hidden="true" />
                      {formatAdminDate(claim.decidedAt ?? claim.createdAt)}
                    </span>
                  </div>
                  {claim.reviewNotes ? (
                    <p className={styles.decidedNote}>{claim.reviewNotes}</p>
                  ) : null}
                  {claim.status === "converted" ? (
                    revoking ? (
                      <div className={styles.confirm} role="group" aria-label="Confirm revocation">
                        <p className={styles.confirmText}>
                          Revoke this conversion? The listing reverts to its exact
                          pre-conversion sourced state and detaches from the host.
                        </p>
                        <div className={styles.actions}>
                          <Button
                            variant="ghost"
                            icon="action.close"
                            disabled={busy}
                            onClick={() => setConfirm(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="primary"
                            icon="system.warning"
                            disabled={busy}
                            aria-label={`Confirm revoking the converted claim on ${claim.listingTitle}`}
                            onClick={() => runRevoke(claim.id)}
                          >
                            {busy ? "Revoking…" : "Confirm revoke"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.decidedActions}>
                        <Button
                          variant="ghost"
                          icon="action.delete"
                          disabled={busy}
                          aria-label={`Revoke the converted claim on ${claim.listingTitle}`}
                          onClick={() => {
                            setError(null);
                            setConfirm({ kind: "revoke", id: claim.id });
                          }}
                        >
                          Revoke conversion
                        </Button>
                      </div>
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
