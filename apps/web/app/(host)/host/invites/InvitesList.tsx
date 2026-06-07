"use client";

import { useState } from "react";
import { Badge, Button, Icon } from "@explore-and-earn/ui";
import type { HostInvite } from "@explore-and-earn/db/client";
import type { ListingRow } from "@explore-and-earn/db/client";

import { SeekerSearchDrawer } from "../../../../components/host/SeekerSearchDrawer";
import styles from "./InvitesList.module.css";

export interface InvitesListProps {
  readonly invites: readonly HostInvite[];
  readonly listings: readonly ListingRow[];
}

/** Status chip variant per invite status. */
function statusVariant(
  status: string,
): "neutral" | "featured" | "seasonal" | "boosted" | "verified" {
  switch (status) {
    case "applied":
      return "boosted";
    case "ignored":
    case "expired":
    case "withdrawn":
      return "seasonal";
    case "viewed":
    case "delivered":
      return "featured";
    default:
      return "neutral";
  }
}

/** Human-readable label for invite status. */
const STATUS_LABEL: Record<string, string> = {
  created: "Sent",
  delivered: "Delivered",
  viewed: "Viewed",
  applied: "Applied",
  ignored: "Ignored",
  expired: "Expired",
  withdrawn: "Withdrawn",
};

/**
 * Host invites list with an inline drawer for sending new invites.
 * Listing selection allows the host to pick which listing to invite for.
 */
export function InvitesList({ invites, listings }: InvitesListProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState(
    listings[0]?.id ?? "",
  );

  const selectedListing = listings.find((l) => l.id === selectedListingId);

  return (
    <>
      <div className={styles.toolbar}>
        {listings.length > 0 ? (
          <>
            <label className={styles.listingLabel} htmlFor="invite-listing-select">
              Invite for:
            </label>
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
          {invites.map((invite) => (
            <li key={invite.id} className={styles.item}>
              <div className={styles.itemHead}>
                <span className={styles.seekerName}>
                  {invite.seekerDisplayName ?? "Anonymous seeker"}
                </span>
                <Badge
                  label={STATUS_LABEL[invite.status] ?? invite.status}
                  variant={statusVariant(invite.status)}
                />
              </div>
              <span className={styles.listingName}>{invite.listingTitle}</span>
              {invite.message ? (
                <p className={styles.message}>{invite.message}</p>
              ) : null}
              <time
                className={styles.date}
                dateTime={invite.createdAt}
                title={new Date(invite.createdAt).toLocaleString()}
              >
                {new Date(invite.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </time>
            </li>
          ))}
        </ol>
      )}

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
