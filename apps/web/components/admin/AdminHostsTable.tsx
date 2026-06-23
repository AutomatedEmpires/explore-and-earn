"use client";

import { useState, useTransition } from "react";
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

export function AdminHostsTable({
  hosts,
}: {
  readonly hosts: ReadonlyArray<AdminHostRowView>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
  const verifiedCount = hosts.filter((host) => isVerified(host.attestationStatus)).length;
  const pendingCount = total - verifiedCount;

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

      {error ? (
        <p className={styles.error} role="alert">
          <Icon aria-hidden name="system.error" size={16} className={styles.errorIcon} />
          {error}
        </p>
      ) : null}

      {hosts.length === 0 ? (
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
      ) : (
        <div className={styles.grid} role="list">
          {hosts.map((host) => {
            const busy = isPending && pendingId === host.id;
            const verified = isVerified(host.attestationStatus);
            const company = host.companyName || "Unnamed host";
            const listingLabel =
              host.listingCount === 1 ? "1 listing" : `${host.listingCount} listings`;
            return (
              <article className={styles.card} key={host.id} role="listitem">
                <div className={styles.identity}>
                  <span
                    className={`${styles.avatar} ${verified ? "" : styles.avatarPending}`}
                    aria-hidden="true"
                  >
                    {monogram(host.companyName)}
                  </span>
                  <div className={styles.identityText}>
                    <span className={styles.name}>{company}</span>
                    <span className={styles.meta}>{listingLabel}</span>
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
                  <span className={styles.tag}>
                    <Icon
                      aria-hidden
                      name="nav.feed"
                      size={16}
                      className={styles.tagIcon}
                    />
                    {listingLabel}
                  </span>
                  <span className={styles.tag} title={host.clerkUserId || undefined}>
                    <Icon
                      aria-hidden
                      name="nav.profile"
                      size={16}
                      className={styles.tagIcon}
                    />
                    <span className={styles.tagMono}>
                      {host.clerkUserId || "No Clerk ID"}
                    </span>
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
