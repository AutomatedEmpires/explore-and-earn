"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { hasVerifiedHostSubscription } from "@explore-and-earn/contracts";
import { Badge, Button, Icon, MetricCard, MetricGrid, VerifiedHostBadge } from "@explore-and-earn/ui";

import { clearHostFlagAction, unverifyHostAction, verifyHostAction } from "../../app/actions/admin";
import { matchesAdminQuery } from "./adminSearch";
import { ConfirmAction } from "./ConfirmAction";
import styles from "./AdminHostsTable.module.css";

export interface AdminHostRowView {
  readonly id: string;
  readonly companyName: string;
  readonly clerkUserId: string;
  /** Internal moderator trust flag — independent of the paid-subscription Verified Host badge. */
  readonly attestationStatus: string;
  readonly subscriptionTier: string | null;
  /** Set automatically after >3 non-dismissed spam reports in a rolling 30 days. */
  readonly flaggedForReview: boolean;
  readonly flaggedReason: string | null;
  readonly listingCount: number;
}

/** A host counts as trust-attested once a moderator has manually reviewed and flagged them. */
function isTrustAttested(status: string): boolean {
  return status === "attested" || status === "verified";
}

/** Two-letter monogram from the company name (or a fallback glyph). */
function monogram(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) {
    return "—";
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Derive a stable, human reference from a Clerk user id WITHOUT ever rendering
 * the raw id. We surface only the last 4 alphanumerics as `#XXXX` so a moderator
 * can correlate a host across tools; the full id stays the React key + server
 * action argument, never visible text. Mirrors the applications-queue pattern.
 */
function hostRef(clerkId: string): string {
  const tail = clerkId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase();
  return tail ? `#${tail}` : "—";
}

/**
 * Honest trust gradient from REAL fields only — moderator trust-attestation +
 * listing footprint. No fabricated score: we tone the card and label the host
 * by the two facts the query actually exposes.
 *  - trusted   → trust-attested by a moderator (highest trust)
 *  - active    → not yet attested but carrying live listings (real footprint,
 *                review-worthy)
 *  - newcomer  → not yet attested and no listings (fresh, lowest signal)
 */
type TrustTier = "trusted" | "active" | "newcomer";

function trustTier(host: AdminHostRowView): TrustTier {
  if (isTrustAttested(host.attestationStatus)) {
    return "trusted";
  }
  return host.listingCount > 0 ? "active" : "newcomer";
}

/**
 * Honest risk signal from REAL fields only. The only risk the host query
 * exposes is "unvetted host with public footprint": a host with no moderator
 * trust attestation that already carries listings is publishing to the
 * marketplace without trust review — that is the single, real, review-worthy
 * flag. A new host with no listings is low-signal, not risky; a trust-attested
 * host is cleared.
 */
type RiskLevel = "flagged" | "watch" | "clear";

interface HostRisk {
  readonly level: RiskLevel;
  readonly label: string;
  /** Higher sorts first in the "needs attention" priority order. */
  readonly weight: number;
}

function hostRisk(host: AdminHostRowView): HostRisk {
  if (isTrustAttested(host.attestationStatus)) {
    return { level: "clear", label: "Trust cleared", weight: 0 };
  }
  if (host.listingCount >= 3) {
    return {
      level: "flagged",
      label: "Unreviewed · live footprint",
      weight: 30 + host.listingCount,
    };
  }
  if (host.listingCount > 0) {
    return {
      level: "flagged",
      label: "Unreviewed · publishing",
      weight: 20 + host.listingCount,
    };
  }
  return { level: "watch", label: "New · unvetted", weight: 5 };
}

/** Search only the human-readable values already rendered on the host card. */
function hostSearchValues(host: AdminHostRowView): ReadonlyArray<string | number> {
  const attested = isTrustAttested(host.attestationStatus);
  const subscriptionVerified = hasVerifiedHostSubscription(host.subscriptionTier);
  const risk = hostRisk(host);
  const listingLabel =
    host.listingCount === 1 ? "1 listing" : `${host.listingCount} listings`;
  const footprintLabel =
    host.listingCount >= 3
      ? "Established"
      : host.listingCount > 0
        ? "Active"
        : "New host";

  return [
    host.companyName || "Unnamed host",
    `Host ${hostRef(host.clerkUserId)}`,
    listingLabel,
    footprintLabel,
    attested ? "Trust attested" : "Awaiting review",
    subscriptionVerified ? "Verified Host" : "",
    risk.level === "flagged" ? risk.label : "",
    host.flaggedForReview ? "Spam reports · flagged" : "",
  ];
}

type SegmentKey = "all" | "flagged" | "attested" | "awaiting";

export function AdminHostsTable({
  hosts,
  initialQuery,
}: {
  readonly hosts: ReadonlyArray<AdminHostRowView>;
  readonly initialQuery: string;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentKey>("all");
  const hasQuery = initialQuery.trim().length > 0;

  function runAction(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await action();
      setPendingId(null);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        // Repaint so the card flips to its new verification state at once.
        router.refresh();
      }
    });
  }

  const total = hosts.length;
  const attestedCount = useMemo(
    () => hosts.filter((host) => isTrustAttested(host.attestationStatus)).length,
    [hosts],
  );
  const subscriptionVerifiedCount = useMemo(
    () => hosts.filter((host) => hasVerifiedHostSubscription(host.subscriptionTier)).length,
    [hosts],
  );
  const pendingCount = total - attestedCount;
  const flaggedCount = useMemo(
    () => hosts.filter((host) => hostRisk(host).level === "flagged").length,
    [hosts],
  );

  const segments: ReadonlyArray<{
    readonly key: SegmentKey;
    readonly label: string;
    readonly count: number;
  }> = [
    { key: "all", label: "All", count: total },
    { key: "flagged", label: "Flagged", count: flaggedCount },
    { key: "attested", label: "Trust attested", count: attestedCount },
    { key: "awaiting", label: "Awaiting", count: pendingCount },
  ];

  const visibleHosts = useMemo(() => {
    let rows: ReadonlyArray<AdminHostRowView>;
    if (segment === "flagged") {
      rows = hosts.filter((host) => hostRisk(host).level === "flagged");
    } else if (segment === "attested") {
      rows = hosts.filter((host) => isTrustAttested(host.attestationStatus));
    } else if (segment === "awaiting") {
      rows = hosts.filter((host) => !isTrustAttested(host.attestationStatus));
    } else {
      rows = hosts;
    }
    if (hasQuery) {
      rows = rows.filter((host) =>
        matchesAdminQuery(initialQuery, hostSearchValues(host)),
      );
    }
    // Priority sort: highest-risk (unvetted + publishing) first, so the moderator
    // sees what needs attention now without hunting. Stable for equal weights.
    return [...rows].sort((a, b) => hostRisk(b).weight - hostRisk(a).weight);
  }, [hasQuery, hosts, initialQuery, segment]);

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Verified Host badge"
          value={subscriptionVerifiedCount}
          trend={total > 0 ? `${Math.round((subscriptionVerifiedCount / total) * 100)}%` : "—"}
          trendTone="up"
        />
        <MetricCard
          label="Flagged for review"
          value={flaggedCount}
          trend={flaggedCount > 0 ? "Unvetted live" : "None"}
          trendTone={flaggedCount > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Trust attested"
          value={attestedCount}
          trend={pendingCount > 0 ? `${pendingCount} awaiting` : "Clear"}
          trendTone={pendingCount > 0 ? "down" : "up"}
        />
      </MetricGrid>

      {total > 0 ? (
        <div
          className={styles.toolbar}
          role="group"
          aria-label="Filter hosts by trust-review status"
        >
          <span className={styles.toolbarIcon} aria-hidden="true">
            <Icon name="action.filter" size={16} />
          </span>
          <div className={styles.segments}>
            {segments.map((seg) => (
              <button
                key={seg.key}
                type="button"
                className={`${styles.segment} ${segment === seg.key ? styles.segmentActive : ""}`.trim()}
                aria-pressed={segment === seg.key}
                onClick={() => setSegment(seg.key)}
              >
                <span className={styles.segmentLabel}>{seg.label}</span>
                <span className={styles.segmentCount}>{seg.count}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={styles.error} role="alert">
          <Icon aria-hidden name="system.error" size={16} className={styles.errorIcon} />
          {error}
        </p>
      ) : null}

      {total === 0 && !hasQuery ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>No host profiles yet</h3>
          <p className={styles.emptySub}>
            When hosts create profiles they will land here for trust review. The
            Verified Host badge itself is automatic once a host subscribes — it
            is not set here.
          </p>
        </div>
      ) : visibleHosts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon
              aria-hidden
              name={hasQuery ? "action.search" : "system.success"}
              size={24}
            />
          </span>
          <h3 className={styles.emptyTitle}>
            {hasQuery
              ? "No hosts on this page match this search"
              : segment === "flagged"
              ? "No hosts flagged for review"
              : segment === "attested"
                ? "No trust-attested hosts yet"
                : "Nothing awaiting review"}
          </h3>
          <p className={styles.emptySub}>
            {hasQuery
              ? "Try a different host name, safe reference, trust state, or listing count."
              : segment === "flagged"
              ? "No unreviewed host is publishing listings — every public host is trust-cleared."
              : segment === "attested"
                ? "Attest a host below and they will appear in this segment."
                : "Every host has been reviewed — the trust-review queue is clear."}
          </p>
          {hasQuery || segment !== "all" ? (
            <Button
              variant="secondary"
              icon="action.close"
              onClick={() => {
                setSegment("all");
                if (hasQuery) router.push("/hosts");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <p className={styles.resultLine} role="status" aria-live="polite">
            {hasQuery || segment !== "all" ? (
              <>
                <strong>{visibleHosts.length}</strong> of {total} hosts on this
                page
              </>
            ) : (
              <>
                <strong>{total}</strong> hosts on this page
              </>
            )}
          </p>
          <div className={styles.grid} role="list">
            {visibleHosts.map((host) => {
            const busy = isPending && pendingId === host.id;
            const attested = isTrustAttested(host.attestationStatus);
            const subscriptionVerified = hasVerifiedHostSubscription(host.subscriptionTier);
            const tier = trustTier(host);
            const risk = hostRisk(host);
            const company = host.companyName || "Unnamed host";
            const ref = hostRef(host.clerkUserId);
            const listingLabel =
              host.listingCount === 1 ? "1 listing" : `${host.listingCount} listings`;
            const footprintLabel =
              host.listingCount >= 3
                ? "Established"
                : host.listingCount > 0
                  ? "Active"
                  : "New host";
            return (
              <article
                className={`${styles.card} ${styles[`tier_${tier}`]}`}
                key={host.id}
                role="listitem"
                data-risk={risk.level}
              >
                <span className={styles.tierEdge} aria-hidden="true" />

                <div className={styles.identity}>
                  <span
                    className={`${styles.avatar} ${styles[`avatar_${tier}`]}`}
                    aria-hidden="true"
                  >
                    {monogram(host.companyName)}
                  </span>
                  <div className={styles.identityText}>
                    <span className={styles.name}>{company}</span>
                    <span className={styles.meta}>
                      Host {ref}
                      <span className={styles.metaDot} aria-hidden="true" />
                      {listingLabel}
                    </span>
                  </div>
                </div>

                <div className={styles.verifyLine}>
                  {subscriptionVerified ? <VerifiedHostBadge /> : null}
                  {attested ? (
                    <Badge label="Trust attested" icon="trust.verified_host" variant="success" />
                  ) : (
                    <span className={styles.pending}>
                      <Icon
                        aria-hidden
                        name="system.warning"
                        size={16}
                        className={styles.pendingIcon}
                      />
                      Awaiting review
                    </span>
                  )}
                  {risk.level === "flagged" ? (
                    <span className={styles.riskFlag}>
                      <Icon
                        aria-hidden
                        name="action.report"
                        size={16}
                        className={styles.riskFlagIcon}
                      />
                      {risk.label}
                    </span>
                  ) : null}
                  {host.flaggedForReview ? (
                    <span className={styles.riskFlag}>
                      <Icon
                        aria-hidden
                        name="system.warning"
                        size={16}
                        className={styles.riskFlagIcon}
                      />
                      Spam reports · flagged
                    </span>
                  ) : null}
                </div>

                <div className={styles.tags}>
                  <span className={`${styles.tag} ${styles[`tag_${tier}`] ?? ""}`.trim()}>
                    <Icon
                      aria-hidden
                      name="analytics.meter"
                      size={16}
                      className={styles.tagIcon}
                    />
                    {footprintLabel}
                  </span>
                  <span className={styles.tag}>
                    <Icon
                      aria-hidden
                      name="nav.feed"
                      size={16}
                      className={styles.tagIcon}
                    />
                    {listingLabel}
                  </span>
                </div>

                <div className={styles.actions}>
                  {/* Attest stays one click. It is the grant, not the taking
                      away, and Un-attest sits right beside it to undo — the
                      half worth a second look is the one that removes trust,
                      not the one that extends it. */}
                  <Button
                    variant="primary"
                    icon="trust.verified_host"
                    disabled={busy || attested}
                    aria-label={`Mark ${company} as trust attested`}
                    onClick={() =>
                      runAction(host.id, () => verifyHostAction(host.id))
                    }
                  >
                    Attest
                  </Button>
                  <ConfirmAction
                    label="Un-attest"
                    confirmLabel="Confirm un-attest"
                    question="Remove this host's trust attestation? They return to the unreviewed queue, but their listings stay public — this clears the moderator sign-off only, not the paid Verified Host badge."
                    subject={company}
                    icon="action.close"
                    disabled={!attested}
                    busy={busy}
                    onConfirm={() =>
                      runAction(host.id, () => unverifyHostAction(host.id))
                    }
                  />
                  {host.flaggedForReview ? (
                    <ConfirmAction
                      label="Clear flag"
                      confirmLabel="Confirm clear flag"
                      question="Clear this spam-report flag? The reason it was raised is erased with it, and this screen never showed you what that reason was."
                      subject={company}
                      icon="action.close"
                      busy={busy}
                      onConfirm={() =>
                        runAction(host.id, () => clearHostFlagAction(host.id))
                      }
                    />
                  ) : null}
                </div>
              </article>
            );
            })}
          </div>
        </>
      )}
    </div>
  );
}
