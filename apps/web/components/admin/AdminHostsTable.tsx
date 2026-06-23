"use client";

import { useMemo, useState, useTransition } from "react";
import { Button, Icon, MetricCard, MetricGrid, VerifiedHostBadge } from "@explore-and-earn/ui";

import { unverifyHostAction, verifyHostAction } from "../../app/actions/admin";
import styles from "./AdminHostsTable.module.css";

export interface AdminHostRowView {
  readonly id: string;
  readonly companyName: string;
  readonly clerkUserId: string;
  readonly attestationStatus: string;
  readonly listingCount: number;
}

/** A host counts as verified once attestation is attested/verified. */
function isVerified(status: string): boolean {
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
 * Honest trust gradient from REAL fields only — verification status + listing
 * footprint. No fabricated score: we tone the card and label the host by the
 * two facts the query actually exposes.
 *  - trusted   → attestation verified (highest trust)
 *  - active    → not yet verified but carrying live listings (real footprint,
 *                review-worthy)
 *  - newcomer  → not yet verified and no listings (fresh, lowest signal)
 */
type TrustTier = "trusted" | "active" | "newcomer";

function trustTier(host: AdminHostRowView): TrustTier {
  if (isVerified(host.attestationStatus)) {
    return "trusted";
  }
  return host.listingCount > 0 ? "active" : "newcomer";
}

type SegmentKey = "all" | "verified" | "awaiting";

export function AdminHostsTable({
  hosts,
}: {
  readonly hosts: ReadonlyArray<AdminHostRowView>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [segment, setSegment] = useState<SegmentKey>("all");

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
      }
    });
  }

  const total = hosts.length;
  const verifiedCount = useMemo(
    () => hosts.filter((host) => isVerified(host.attestationStatus)).length,
    [hosts],
  );
  const pendingCount = total - verifiedCount;

  const segments: ReadonlyArray<{
    readonly key: SegmentKey;
    readonly label: string;
    readonly count: number;
  }> = [
    { key: "all", label: "All", count: total },
    { key: "verified", label: "Verified", count: verifiedCount },
    { key: "awaiting", label: "Awaiting", count: pendingCount },
  ];

  const visibleHosts = useMemo(() => {
    if (segment === "verified") {
      return hosts.filter((host) => isVerified(host.attestationStatus));
    }
    if (segment === "awaiting") {
      return hosts.filter((host) => !isVerified(host.attestationStatus));
    }
    return hosts;
  }, [hosts, segment]);

  return (
    <div className={styles.wrap}>
      <MetricGrid className={styles.metrics}>
        <MetricCard
          label="Verified hosts"
          value={verifiedCount}
          trend={total > 0 ? `${Math.round((verifiedCount / total) * 100)}%` : "—"}
          trendTone="up"
        />
        <MetricCard
          label="Awaiting review"
          value={pendingCount}
          trend={pendingCount > 0 ? "Verify" : "Clear"}
          trendTone={pendingCount > 0 ? "down" : "up"}
        />
        <MetricCard
          label="Total hosts"
          value={total}
          trend="Inventory"
          trendTone="neutral"
        />
      </MetricGrid>

      {total > 0 ? (
        <div
          className={styles.toolbar}
          role="group"
          aria-label="Filter hosts by verification status"
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

      {total === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>No host profiles yet</h3>
          <p className={styles.emptySub}>
            When hosts create profiles they will land here for verification and
            trust review.
          </p>
        </div>
      ) : visibleHosts.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}>
            <Icon aria-hidden name="system.success" size={24} />
          </span>
          <h3 className={styles.emptyTitle}>
            {segment === "verified" ? "No verified hosts yet" : "Nothing awaiting review"}
          </h3>
          <p className={styles.emptySub}>
            {segment === "verified"
              ? "Verify a host below and they will appear in this segment."
              : "Every host has been reviewed — the verification queue is clear."}
          </p>
        </div>
      ) : (
        <div className={styles.grid} role="list">
          {visibleHosts.map((host) => {
            const busy = isPending && pendingId === host.id;
            const verified = isVerified(host.attestationStatus);
            const tier = trustTier(host);
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
                  {verified ? (
                    <VerifiedHostBadge />
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
                  <Button
                    variant="primary"
                    icon="trust.verified_host"
                    disabled={busy || verified}
                    aria-label={`Verify ${company}`}
                    onClick={() =>
                      runAction(host.id, () => verifyHostAction(host.id))
                    }
                  >
                    Verify
                  </Button>
                  <Button
                    variant="ghost"
                    icon="action.close"
                    disabled={busy || !verified}
                    aria-label={`Remove verification from ${company}`}
                    onClick={() =>
                      runAction(host.id, () => unverifyHostAction(host.id))
                    }
                  >
                    Unverify
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
