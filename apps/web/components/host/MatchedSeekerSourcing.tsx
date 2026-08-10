"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Icon } from "@explore-and-earn/ui";

import { createInviteAction } from "../../app/actions/invites";
import { captureFunnelEvent } from "../../lib/analytics/capture";
import { HOST_WORKSPACE_EVENTS } from "../../lib/analytics/events";
import {
  inviteErrorMessage,
  OUTREACH_PREVIEW_STATUS,
} from "../../lib/hostOutreach";
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

interface SourcingBucketBase {
  readonly listingId: string;
  readonly listingTitle: string;
  readonly category: string;
  readonly locationDisplay: string | null;
}

export type SourcingBucketVM = SourcingBucketBase &
  (
    | { readonly state: "ready"; readonly seekers: readonly SourcedSeekerVM[] }
    | { readonly state: "unavailable" }
  );

export interface OutreachMatchesPreviewVM {
  readonly notice: string;
}

export interface MatchedSeekerSourcingProps {
  readonly buckets: readonly SourcingBucketVM[];
  readonly entitlement: InviteEntitlementVM | null;
  readonly preview?: OutreachMatchesPreviewVM;
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

/** Ranked, discovery-safe seeker cards with truthful per-listing load states. */
export function MatchedSeekerSourcing({
  buckets,
  entitlement,
  preview,
}: MatchedSeekerSourcingProps) {
  const router = useRouter();
  const metered = entitlement?.ledgerAvailable === true;
  const [remaining, setRemaining] = useState<number>(
    entitlement?.totalRemaining ?? 0,
  );
  const [invited, setInvited] = useState<ReadonlySet<string>>(() => new Set());
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [statusByKey, setStatusByKey] = useState<Record<string, string>>({});
  const [buyOpen, setBuyOpen] = useState(false);
  const sendInFlight = useRef(false);

  useEffect(() => {
    setRemaining(entitlement?.totalRemaining ?? 0);
  }, [entitlement?.totalRemaining, entitlement?.periodKey]);

  const blocked = !preview && metered && remaining <= 0;
  const hasMonthlyAllowance = (entitlement?.monthlyAllowance ?? 0) > 0;

  const handleInvite = useCallback(
    async (bucketId: string, seeker: SourcedSeekerVM) => {
      const key = `${bucketId}:${seeker.seekerProfileId}`;
      if (
        invited.has(key) ||
        seeker.alreadyInvited ||
        sendInFlight.current
      ) {
        return;
      }
      if (blocked) {
        setBuyOpen(true);
        return;
      }

      sendInFlight.current = true;
      setSendingKey(key);
      setErrorByKey((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setStatusByKey((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });

      try {
        if (preview) {
          setInvited((previous) => new Set(previous).add(key));
          setStatusByKey((previous) => ({
            ...previous,
            [key]: OUTREACH_PREVIEW_STATUS,
          }));
          return;
        }

        const result = await createInviteAction(seeker.seekerProfileId, bucketId);
        if (result.ok) {
          captureFunnelEvent(HOST_WORKSPACE_EVENTS.inviteSent, {
            band: seeker.band,
            metered,
            surface: "matched_seekers",
          });
          setInvited((previous) => new Set(previous).add(key));
          if (metered) setRemaining((value) => Math.max(0, value - 1));
          router.refresh();
          return;
        }
        if (result.error === "already_invited") {
          setInvited((previous) => new Set(previous).add(key));
          return;
        }
        if (result.error === "invite_credits_required") {
          setRemaining(0);
          setBuyOpen(true);
          router.refresh();
          return;
        }
        setErrorByKey((previous) => ({
          ...previous,
          [key]: inviteErrorMessage(result.error),
        }));
      } catch {
        setErrorByKey((previous) => ({
          ...previous,
          [key]: inviteErrorMessage("temporarily_unavailable"),
        }));
      } finally {
        setSendingKey(null);
        sendInFlight.current = false;
      }
    },
    [blocked, invited, metered, preview, router],
  );

  return (
    <section
      className={styles.wrap}
      aria-labelledby="host-outreach-matches-heading"
    >
      {preview ? (
        <p className={styles.previewNotice} role="note">
          <Icon name="system.info" size={16} aria-hidden />
          {preview.notice}
        </p>
      ) : null}

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
                  aria-valuemax={Math.max(
                    entitlement.monthlyAllowance,
                    entitlement.monthlyUsed,
                    1,
                  )}
                  aria-label={`${entitlement.monthlyUsed} monthly invites used against the current allowance of ${entitlement.monthlyAllowance}`}
                >
                  <span
                    className={styles.meterFill}
                    style={{
                      width: `${
                        entitlement.monthlyAllowance > 0
                          ? Math.min(
                              100,
                              (entitlement.monthlyUsed /
                                entitlement.monthlyAllowance) *
                                100,
                            )
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              {!preview ? (
                <Button
                  variant="secondary"
                  icon="status.boosted"
                  onClick={() => setBuyOpen(true)}
                >
                  Buy more
                </Button>
              ) : null}
            </>
          ) : (
            <p className={styles.quotaUnmetered}>
              <Icon name="system.info" size={16} aria-hidden />
              Invite metering is unavailable. Matched seekers and scores remain
              visible, but the server still decides whether an invite can send.
            </p>
          )}
        </div>
      ) : null}

      {blocked ? (
        <div className={styles.blocked} role="status">
          <Icon name="system.lock" size={18} aria-hidden />
          <div className={styles.blockedText}>
            <strong>
              {hasMonthlyAllowance
                ? "You've used all available invite credits."
                : "This account has no invite credits."}
            </strong>
            <span>
              {hasMonthlyAllowance
                ? "Every matched seeker and score below stays visible. Check Buy more for pack availability, or wait for your next included monthly allowance."
                : "Every matched seeker and score below stays visible. Check Buy more for pack availability, or choose a plan with a monthly allowance."}
            </span>
          </div>
          <Button
            variant="primary"
            icon="status.boosted"
            onClick={() => setBuyOpen(true)}
          >
            Buy more
          </Button>
        </div>
      ) : null}

      {buckets.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="status.match" size={24} aria-hidden />
          <p>
            No current listings are ready for matched-seeker sourcing. Publish
            and verify a listing with a future closing date to start.
          </p>
        </div>
      ) : (
        <div className={styles.buckets}>
          {buckets.map((bucket) => {
            const category = isCategoryKey(bucket.category)
              ? bucket.category
              : null;
            return (
              <div key={bucket.listingId} className={styles.bucket}>
                <div className={styles.bucketHead}>
                  <div className={styles.bucketTitles}>
                    <h3 className={styles.bucketTitle}>
                      {category ? (
                        <Icon
                          name={CATEGORY_ICON[category]}
                          size={18}
                          aria-hidden
                        />
                      ) : null}
                      {bucket.listingTitle}
                    </h3>
                    <p className={styles.bucketSub}>
                      {bucket.state === "ready"
                        ? `${bucket.seekers.length} shown`
                        : "Match data unavailable"}
                      {bucket.locationDisplay
                        ? ` · ${bucket.locationDisplay}`
                        : ""}
                    </p>
                  </div>
                </div>

                {bucket.state === "unavailable" ? (
                  <div className={styles.loadError} role="alert">
                    <strong>
                      Matched seekers are temporarily unavailable for this
                      listing.
                    </strong>
                    <span>
                      Refresh the page to try again. Your other outreach data is
                      unchanged.
                    </span>
                  </div>
                ) : bucket.seekers.length === 0 ? (
                  <div className={styles.bucketEmpty} role="status">
                    <strong>No sourceable matches for this listing yet.</strong>
                    <span>
                      New matches will appear after eligible seekers complete
                      visible profiles.
                    </span>
                  </div>
                ) : (
                  <div className={styles.grid}>
                    {bucket.seekers.map((seeker) => {
                      const key = `${bucket.listingId}:${seeker.seekerProfileId}`;
                      const isInvited = invited.has(key) || seeker.alreadyInvited;
                      const isSending = sendingKey === key;
                      const isAnySending = sendingKey !== null;
                      const error = errorByKey[key];
                      const status = statusByKey[key];
                      return (
                        <SourcedSeekerCard
                          key={seeker.seekerProfileId}
                          seeker={seeker}
                          action={
                            <div className={styles.action}>
                              {isInvited ? (
                                <Button
                                  variant="secondary"
                                  icon="system.success"
                                  disabled
                                >
                                  {status ? "Previewed" : "Already invited"}
                                </Button>
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
                                  disabled={isAnySending}
                                >
                                  {isSending
                                    ? "Inviting…"
                                    : preview
                                      ? "Preview invite"
                                      : "Invite to apply"}
                                </Button>
                              )}
                              {error ? (
                                <span className={styles.error} role="alert">
                                  {error}
                                </span>
                              ) : null}
                              {status ? (
                                <span className={styles.previewStatus} role="status">
                                  {status}
                                </span>
                              ) : null}
                            </div>
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!preview ? (
        <BuyMoreInvitesPopup isOpen={buyOpen} onClose={() => setBuyOpen(false)} />
      ) : null}
    </section>
  );
}
