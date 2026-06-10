"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, type IconKey } from "@explore-and-earn/ui";
import type { ListingStatus } from "@explore-and-earn/contracts";

import {
  duplicateListingAction,
  updateListingStatusAction,
} from "../../app/actions/listings";
import styles from "./ListingStatusControls.module.css";

type StatusBadgeVariant = "neutral" | "info" | "success" | "seasonal";
type HostManageableListingStatus = Parameters<typeof updateListingStatusAction>[1];

const STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  live: "Live",
  paused: "Paused",
  closed: "Closed",
  archived: "Archived",
};

// Registry-valid Icon keys only — there is intentionally no `status.live` key.
const STATUS_ICON: Record<ListingStatus, IconKey> = {
  draft: "system.info",
  under_review: "status.partially_filled",
  live: "status.open",
  paused: "system.warning",
  closed: "system.success",
  archived: "system.lock",
};

const STATUS_VARIANT: Record<ListingStatus, StatusBadgeVariant> = {
  draft: "neutral",
  under_review: "info",
  live: "success",
  paused: "seasonal",
  closed: "neutral",
  archived: "neutral",
};

// Mirrors the authoritative server gate in @explore-and-earn/db
// (canTransitionListing). Buttons render only for these target states.
const NEXT_STATES: Record<ListingStatus, readonly HostManageableListingStatus[]> = {
  draft: [],
  under_review: [],
  live: ["paused", "archived"],
  paused: ["live", "archived"],
  closed: [],
  archived: [],
};

// Label shown on the button that transitions TO the given status.
const TRANSITION_LABEL: Record<ListingStatus, string> = {
  draft: "Move back to draft",
  under_review: "Submit for review",
  live: "Resume",
  paused: "Pause",
  closed: "Close",
  archived: "Archive",
};

export interface ListingStatusControlsProps {
  readonly listingId: string;
  readonly currentStatus: ListingStatus;
}

export function ListingStatusControls({
  listingId,
  currentStatus,
}: ListingStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nextStates = NEXT_STATES[currentStatus] ?? [];

  function changeStatus(target: HostManageableListingStatus) {
    setError(null);
    startTransition(async () => {
      const result = await updateListingStatusAction(listingId, target);
      if (!result.ok) {
        setError(
          result.error === "invalid_transition"
            ? "That status change isn't allowed."
            : (result.error ?? "Could not update the listing status."),
        );
        return;
      }
      router.refresh();
    });
  }

  function duplicate() {
    setError(null);
    startTransition(async () => {
      const result = await duplicateListingAction(listingId);
      if (!result.ok) {
        setError(result.error ?? "Could not duplicate the listing.");
        return;
      }
      if (result.newListingId) {
        router.push(`/host/listings/${result.newListingId}/edit`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className={styles.controls}>
      <div className={styles.statusRow}>
        <Badge
          label={STATUS_LABEL[currentStatus]}
          icon={STATUS_ICON[currentStatus]}
          variant={STATUS_VARIANT[currentStatus]}
        />
      </div>
      <div className={styles.actions}>
        {nextStates.map((target) => (
          <Button
            key={target}
            type="button"
            variant={target === "archived" ? "secondary" : "primary"}
            disabled={isPending}
            onClick={() => changeStatus(target)}
          >
            {TRANSITION_LABEL[target]}
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={duplicate}
        >
          Duplicate
        </Button>
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
