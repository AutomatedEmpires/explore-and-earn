"use client";

import { useState, useTransition } from "react";
import { Button, Icon } from "@explore-and-earn/ui";
import type { HostInvite } from "@explore-and-earn/db/client";
import type { ListingRow } from "@explore-and-earn/db/client";

import { SeekerSearchDrawer } from "../../../../../components/host/SeekerSearchDrawer";
import { withdrawInviteAction } from "../../../../actions/invites";
import styles from "./InvitesList.module.css";

/** Invite statuses a host can still retract. */
const WITHDRAWABLE_STATUSES = new Set(["created", "delivered", "viewed"]);

/** Terminal-negative statuses — the invite went cold or was retracted. */
const COLD_STATUSES = new Set(["ignored", "expired", "withdrawn"]);

export interface InvitesListProps {
  readonly invites: readonly HostInvite[];
  readonly listings: readonly ListingRow[];
}

/**
 * The four honest delivery stages an invite moves through, in order. Each maps
 * 1:1 to a real `status` value the query layer exposes — no fabricated steps.
 */
const PIP_STAGES = [
  { key: "created", label: "Sent" },
  { key: "delivered", label: "Delivered" },
  { key: "viewed", label: "Viewed" },
  { key: "applied", label: "Applied" },
] as const;

/** How far along the delivery progression a status sits (-1 if not on it). */
function stageIndex(status: string): number {
  return PIP_STAGES.findIndex((s) => s.key === status);
}

/** Human-readable label for any invite status (incl. cold/terminal ones). */
const STATUS_LABEL: Record<string, string> = {
  created: "Sent",
  delivered: "Delivered",
  viewed: "Viewed",
  applied: "Applied",
  ignored: "Ignored",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

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
export function InvitesList({ invites, listings }: InvitesListProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(
    listings[0]?.id ?? "",
  );
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const selectedListing = listings.find((l) => l.id === selectedListingId);

  function handleWithdraw(inviteId: string) {
    setWithdrawError(null);
    setWithdrawingId(inviteId);
    startTransition(async () => {
      const result = await withdrawInviteAction(inviteId);
      setWithdrawingId(null);
      if (!result.ok) {
        setWithdrawError(result.error ?? "Could not withdraw the invite.");
      }
      // On success, revalidatePath('/host/outreach') refreshes this list's props.
    });
  }

  return (
    <>
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
                value={selectedListingId}
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
              disabled={!selectedListingId}
            >
              Invite a seeker
            </Button>
          </>
        ) : (
          <p className={styles.noListings}>
            <Icon name="system.info" size={16} aria-hidden />
            Create a listing first to start sending invites.
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
            const current = stageIndex(invite.status);
            const isCold = COLD_STATUSES.has(invite.status);
            const canWithdraw = WITHDRAWABLE_STATUSES.has(invite.status);
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
                        title={new Date(invite.createdAt).toLocaleString()}
                      >
                        {new Date(invite.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
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
                      onClick={() => handleWithdraw(invite.id)}
                      disabled={withdrawing}
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

      {selectedListing ? (
        <SeekerSearchDrawer
          listingId={selectedListingId}
          listingTitle={selectedListing.title}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      ) : null}
    </>
  );
}
