"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import type { HostInvite } from "@explore-and-earn/db/client";

import { formatDate } from "../../../../../lib/format";
import {
  SeekerSearchDrawer,
  type OutreachSearchPreviewVM,
} from "../../../../../components/host/SeekerSearchDrawer";
import { withdrawInviteAction } from "../../../../actions/invites";
import styles from "./InvitesList.module.css";

/** Invite statuses a host can still retract. */
const WITHDRAWABLE_STATUSES = new Set(["created", "delivered", "viewed"]);

/** Terminal-negative statuses — the invite went cold or was retracted. */
const COLD_STATUSES = new Set(["ignored", "expired", "withdrawn"]);

export interface InvitesListProps {
  readonly invites: readonly HostInvite[];
  readonly listings: readonly InviteListingVM[];
  /** Includes draft/paused/expired inventory omitted from the invite selector. */
  readonly hasAnyListings: boolean;
  readonly preview?: OutreachSearchPreviewVM;
}

export interface InviteListingVM {
  readonly id: string;
  readonly title: string;
}

/**
 * The three honest delivery stages backed by durable facts. There is no live
 * writer for `viewed_at`, so this surface does not fabricate an opened stage.
 */
const PIP_STAGES = [
  { key: "created", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "applied", label: "Applied" },
] as const;

/** How far along the delivery progression a status sits (-1 if not on it). */
function stageIndex(status: string): number {
  if (status === "viewed") return 1;
  return PIP_STAGES.findIndex((s) => s.key === status);
}

/** Human-readable label for any invite status (incl. cold/terminal ones). */
const STATUS_LABEL: Record<string, string> = {
  created: "Sent",
  delivered: "Delivered",
  viewed: "Viewed",
  applied: "Applied",
  ignored: "Declined",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

function inviteDateDisplay(value: string): { short: string; full: string } {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return { short: "Date unavailable", full: "Date unavailable" };
  }
  return {
    short: formatDate(value, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
    full: formatDate(value, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    }),
  };
}

/** Up to two initials from a display name — never a raw id. */
function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Host invites list with an inline drawer for sending new invites.
 * Listing selection allows the host to pick which listing to invite for.
 */
export function InvitesList({
  invites,
  listings,
  hasAnyListings,
  preview,
}: InvitesListProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(
    listings[0]?.id ?? "",
  );
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [withdrawStatus, setWithdrawStatus] = useState<string | null>(null);
  const withdrawStatusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (withdrawStatus) withdrawStatusRef.current?.focus();
  }, [withdrawStatus]);

  // A Server Component refresh can remove an expired or paused listing while
  // preserving this client instance. Fall back synchronously so the controlled
  // select and opener never point at a listing that no longer exists.
  const selectedListing =
    listings.find((listing) => listing.id === selectedListingId) ?? listings[0];

  async function handleWithdraw(inviteId: string) {
    if (preview || withdrawingId) return;
    setWithdrawError(null);
    setWithdrawStatus(null);
    setWithdrawingId(inviteId);
    try {
      const result = await withdrawInviteAction(inviteId);
      if (!result.ok) {
		setWithdrawError(
			result.error === "invite_delivery_in_progress"
				? "This invite is being delivered now. Try again after delivery finishes."
				: result.error === "invite_authority_rollout_draining"
					? "Invite withdrawals are briefly unavailable while delivery authority finishes updating. Try again in a few minutes."
				: "Could not withdraw the invite. Please try again.",
		);
      } else if (result.creditRestored) {
		setWithdrawStatus("Invite withdrawn. Its original invite-credit charge was reversed.");
      } else if (result.disposition === "already_withdrawn") {
        setWithdrawStatus("This invite was already withdrawn.");
      } else {
        setWithdrawStatus("Invite withdrawn.");
      }
      // On success, revalidatePath('/host/outreach') refreshes this list's props.
    } catch {
      setWithdrawError("Could not withdraw the invite. Please try again.");
    } finally {
      setWithdrawingId(null);
    }
  }

  return (
    <>
      {preview ? (
        <p className={styles.previewNotice} role="note">
          <Icon name="system.info" size={16} aria-hidden />
          {preview.notice}
        </p>
      ) : null}
      <div className={styles.toolbar}>
        {listings.length > 0 ? (
          <>
            <label className={styles.listingLabel} htmlFor="invite-listing-select">
              Invite for
            </label>
            <div className={styles.selectWrap}>
              <select
                id="invite-listing-select"
                className={styles.listingSelect}
                value={selectedListing?.id ?? ""}
                onChange={(e) => setSelectedListingId(e.target.value)}
              >
                {listings.map((listing) => (
                  <option key={listing.id} value={listing.id}>
                    {listing.title}
                  </option>
                ))}
              </select>
              <Icon
                name="action.sort"
                size={16}
                aria-hidden
                className={styles.selectChevron}
              />
            </div>
            <Button
              variant="primary"
              icon="action.forward"
              onClick={() => setDrawerOpen(true)}
              disabled={!selectedListing}
            >
              Invite a seeker
            </Button>
          </>
        ) : (
          <p className={styles.noListings}>
            <Icon name="system.info" size={16} aria-hidden />
            {hasAnyListings
              ? "No current listings are ready for new invites. Review your listings to publish, verify, or extend one."
              : "Create a listing first to start sending invites."}
          </p>
        )}
      </div>

      {invites.length === 0 ? (
        <div className={styles.empty}>
          <Icon name="action.forward" size={24} aria-hidden />
          <p>No invites sent yet. Find seekers and invite them to apply.</p>
        </div>
      ) : (
        <ol className={styles.list}>
          {invites.map((invite) => {
            const name = invite.seekerDisplayName ?? "Anonymous seeker";
            const displayedDate = inviteDateDisplay(invite.createdAt);
            const current = stageIndex(invite.status);
            const isCold = COLD_STATUSES.has(invite.status);
            const canWithdraw =
              !preview && WITHDRAWABLE_STATUSES.has(invite.status);
            const withdrawing = withdrawingId === invite.id;
            return (
              <li
                key={invite.id}
                className={styles.item}
                data-cold={isCold ? "" : undefined}
              >
                <div className={styles.itemMain}>
                  <span className={styles.avatar} aria-hidden>
                    {initialsOf(invite.seekerDisplayName)}
                  </span>
                  <div className={styles.itemBody}>
                    <div className={styles.itemHead}>
                      <span className={styles.seekerName}>{name}</span>
                      <time
                        className={styles.date}
                        dateTime={invite.createdAt}
                        title={displayedDate.full}
                      >
                        {displayedDate.short}
                      </time>
                    </div>
                    <span className={styles.listingName}>
                      {invite.listingTitle}
                    </span>

                    {isCold ? (
                      <p className={styles.coldStatus}>
                        <Icon name="status.withdrawn" size={16} aria-hidden />
                        {STATUS_LABEL[invite.status] ?? invite.status}
                      </p>
                    ) : (
                      <ol
                        className={styles.pips}
                        aria-label={`Delivery status: ${
                          STATUS_LABEL[invite.status] ?? invite.status
                        }`}
                      >
                        {PIP_STAGES.map((stage, i) => {
                          const state =
                            i < current
                              ? "done"
                              : i === current
                                ? "current"
                                : "todo";
                          return (
                            <li
                              key={stage.key}
                              className={styles.pip}
                              data-state={state}
                            >
                              <span className={styles.pipDot} aria-hidden />
                              <span className={styles.pipLabel}>
                                {stage.label}
                              </span>
                            </li>
                          );
                        })}
                      </ol>
                    )}

                    {invite.message ? (
                      <p className={styles.message}>{invite.message}</p>
                    ) : null}
                  </div>
                </div>

                {canWithdraw ? (
                  <div className={styles.itemActions}>
                    <Button
                      variant="secondary"
                      onClick={() => void handleWithdraw(invite.id)}
                      disabled={withdrawingId !== null}
                    >
                      {withdrawing ? "Withdrawing…" : "Withdraw"}
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {withdrawError ? (
        <p className={styles.withdrawError} role="alert">
          {withdrawError}
        </p>
      ) : null}

      {withdrawStatus ? (
        <p
          ref={withdrawStatusRef}
          className={styles.withdrawStatus}
          role="status"
          tabIndex={-1}
        >
          {withdrawStatus}
        </p>
      ) : null}

      {selectedListing ? (
        <SeekerSearchDrawer
          key={selectedListing.id}
          listingId={selectedListing.id}
          listingTitle={selectedListing.title}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          preview={preview}
        />
      ) : null}
    </>
  );
}
