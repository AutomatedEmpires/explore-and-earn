"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";

import { createInviteAction } from "../../app/actions/invites";
import { CATEGORY_ICON, CATEGORY_LABEL } from "../discovery";
import { BuyMoreInvitesPopup } from "./BuyMoreInvitesPopup";
import { SourcedSeekerCard, type SourcedSeekerVM } from "./SourcedSeekerCard";
import styles from "./MatchedSeekerSourcing.module.css";

/** Host subscription tiers (mirrors the server union; no server import needed). */
type Tier = "none" | "starter" | "professional" | "enterprise";

/** Serializable mirror of the server InviteEntitlementSummary. */
export interface InviteEntitlementVM {
  readonly tier: Tier;
  readonly monthlyAllowance: number;
  readonly monthlyUsed: number;
  readonly monthlyRemaining: number;
  readonly purchasedBalance: number;
  readonly totalRemaining: number;
  readonly periodKey: string;
  readonly ledgerAvailable: boolean;
}

export interface SourcingBucketVM {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly category: string;
  readonly locationDisplay: string | null;
  readonly seekers: readonly SourcedSeekerVM[];
}

export interface MatchedSeekerSourcingProps {
  readonly buckets: readonly SourcingBucketVM[];
  readonly entitlement: InviteEntitlementVM | null;
}

const TIER_LABEL: Record<Tier, string> = {
  none: "No plan",
  starter: "Starter",
  professional: "Professional",
  enterprise: "Enterprise",
};

function isCategoryKey(value: string): value is keyof typeof CATEGORY_LABEL {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABEL, value);
}

/**
 * Host "Matched seekers" sourcing surface: per-listing buckets of the ranked,
 * discovery-safe seeker projection with their REAL ADR-040 match scores, plus
 * the metered "Invite to apply" action.
 *
 * VALUE IS NEVER HIDDEN, THE ACTION IS GATED: when the host is out of invite
 * credits (metered ledger, totalRemaining ≤ 0) the buckets and scores still
 * render in full — only the send is blocked, swapped for an upsell that opens
 * the buy-more packs. The SERVER is the source of truth (createInviteAction
 * enforces the entitlement atomically); the remaining count and blocked state
 * here are presentation, reconciled from the server after every send.
 */
export function MatchedSeekerSourcing({ buckets, entitlement }: MatchedSeekerSourcingProps) {
  const router = useRouter();
  const metered = entitlement?.ledgerAvailable === true;

  const [remaining, setRemaining] = useState<number>(entitlement?.totalRemaining ?? 0);
  const [invited, setInvited] = useState<ReadonlySet<string>>(() => new Set());
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [buyOpen, setBuyOpen] = useState(false);

  // Re-sync the authoritative remaining count whenever the server refreshes the
  // entitlement (after revalidatePath). Keeps optimistic math from drifting.
  useEffect(() => {
    setRemaining(entitlement?.totalRemaining ?? 0);
  }, [entitlement?.totalRemaining, entitlement?.periodKey]);

  const blocked = metered && remaining <= 0;

  const handleInvite = useCallback(
    (bucketId: string, seeker: SourcedSeekerVM) => {
      const key = `${bucketId}:${seeker.seekerProfileId}`;
      if (invited.has(key) || seeker.alreadyInvited || sendingKey) return;
      // Gate (never hide): out of credits → send the host to the upsell.
      if (blocked) {
        setBuyOpen(true);
        return;
      }
      setSendingKey(key);
      setErrorByKey((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      void createInviteAction(seeker.seekerProfileId, bucketId).then((result) => {
        if (result.ok) {
          setInvited((prev) => new Set(prev).add(key));
          if (metered) setRemaining((r) => Math.max(0, r - 1));
          // Reconcile the "Sent invites" list + entitlement from the server.
          router.refresh();
        } else if (result.error === "already_invited") {
          setInvited((prev) => new Set(prev).add(key));
        } else if (result.error === "invite_credits_required") {
          setRemaining(0);
          setBuyOpen(true);
        } else {
          setErrorByKey((prev) => ({
            ...prev,
            [key]:
              result.error === "rate_limit_exceeded"
                ? "You've hit the hourly invite limit. Try again shortly."
                : "Couldn't send the invite. Please try again.",
          }));
        }
        setSendingKey(null);
      });
    },
    [blocked, invited, metered, router, sendingKey],
  );

  const totalSeekers = buckets.reduce((sum, b) => sum + b.seekers.length, 0);

  return (
    <section className={styles.wrap}>
      {/* --- Quota meter + buy-more ------------------------------------------ */}
      {entitlement ? (
        <div className={styles.quota} data-blocked={blocked ? "true" : undefined}>
          {metered ? (
            <>
              <div className={styles.quotaMain}>
                <div className={styles.quotaHeadline}>
                  <span className={styles.quotaNum}>{remaining}</span>
                  <span className={styles.quotaUnit}>invites left</span>
                </div>
                <p className={styles.quotaBreak}>
                  {TIER_LABEL[entitlement.tier]} · {entitlement.monthlyRemaining}/
                  {entitlement.monthlyAllowance} monthly
                  {entitlement.purchasedBalance > 0
                    ? ` · +${entitlement.purchasedBalance} purchased`
                    : ""}
                </p>
                <div
                  className={styles.meter}
                  role="meter"
                  aria-valuenow={entitlement.monthlyUsed}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(entitlement.monthlyAllowance, 1)}
                  aria-label="Monthly invites used"
                >
                  <span
                    className={styles.meterFill}
                    style={{
                      width: `${
                        entitlement.monthlyAllowance > 0
                          ? Math.min(
                              100,
                              (entitlement.monthlyUsed / entitlement.monthlyAllowance) * 100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <Button variant="secondary" icon="status.boosted" onClick={() => setBuyOpen(true)}>
                Buy more
              </Button>
            </>
          ) : (
            <p className={styles.quotaUnmetered}>
              <Icon name="system.info" size={16} aria-hidden />
              Invite metering activates soon — your matched-seeker buckets and scores are live
              now.
            </p>
          )}
        </div>
      ) : null}

      {blocked ? (
        <div className={styles.blocked} role="status">
          <Icon name="system.lock" size={18} aria-hidden />
          <div className={styles.blockedText}>
            <strong>You&apos;re out of invite credits this month.</strong>
            <span>
              Every matched seeker and score below stays visible — top up to send invites, or wait
              for next month&apos;s allowance.
            </span>
          </div>
          <Button variant="primary" icon="status.boosted" onClick={() => setBuyOpen(true)}>
            Buy more
          </Button>
        </div>
      ) : null}

      {/* --- Per-listing buckets -------------------------------------------- */}
      {totalSeekers === 0 ? (
        <div className={styles.empty}>
          <Icon name="status.match" size={24} aria-hidden />
          <p>
            No matched seekers to source yet. As seekers complete profiles that fit your published
            listings, your ranked buckets appear here with their match scores.
          </p>
        </div>
      ) : (
        <div className={styles.buckets}>
          {buckets.map((bucket) => {
            if (bucket.seekers.length === 0) return null;
            const cat = isCategoryKey(bucket.category) ? bucket.category : null;
            return (
              <div key={bucket.listingId} className={styles.bucket}>
                <div className={styles.bucketHead}>
                  <div className={styles.bucketTitles}>
                    <h3 className={styles.bucketTitle}>
                      {cat ? <Icon name={CATEGORY_ICON[cat]} size={18} aria-hidden /> : null}
                      {bucket.listingTitle}
                    </h3>
                    <p className={styles.bucketSub}>
                      {bucket.seekers.length} matched
                      {bucket.locationDisplay ? ` · ${bucket.locationDisplay}` : ""}
                    </p>
                  </div>
                </div>
                <div className={styles.grid}>
                  {bucket.seekers.map((seeker) => {
                    const key = `${bucket.listingId}:${seeker.seekerProfileId}`;
                    const isInvited = invited.has(key) || seeker.alreadyInvited;
                    const isSending = sendingKey === key;
                    const error = errorByKey[key];
                    return (
                      <SourcedSeekerCard
                        key={seeker.seekerProfileId}
                        seeker={seeker}
                        action={
                          <div className={styles.action}>
                            {isInvited ? (
                              <span className={styles.invited}>
                                <Icon name="system.success" size={16} aria-hidden />
                                Invited
                              </span>
                            ) : blocked ? (
                              <Button
                                variant="secondary"
                                icon="system.lock"
                                onClick={() => setBuyOpen(true)}
                              >
                                Unlock invite
                              </Button>
                            ) : (
                              <Button
                                variant="primary"
                                icon="action.forward"
                                onClick={() => handleInvite(bucket.listingId, seeker)}
                                disabled={isSending}
                              >
                                {isSending ? "Inviting…" : "Invite to apply"}
                              </Button>
                            )}
                            {error ? (
                              <span className={styles.error} role="alert">
                                {error}
                              </span>
                            ) : null}
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BuyMoreInvitesPopup isOpen={buyOpen} onClose={() => setBuyOpen(false)} />
    </section>
  );
}
