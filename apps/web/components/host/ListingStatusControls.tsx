"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Badge, Button, type IconKey } from "@explore-and-earn/ui";
import type { ListingStatus } from "@explore-and-earn/contracts";

import {
  duplicateListingAction,
  updateListingStatusAction,
} from "../../app/actions/listings";
import {
  HOST_STATUS_LABEL,
  hostListingTransitions,
  hostStatusHint,
  type HostManageableListingStatus,
} from "./listingStatusTransitions";
import styles from "./ListingStatusControls.module.css";

type StatusBadgeVariant = "neutral" | "info" | "success" | "seasonal";

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

export interface ListingStatusControlsProps {
  readonly listingId: string;
  readonly currentStatus: ListingStatus;
  /**
   * The listing's provenance. Withholds the closed -> draft action on sourced
   * inventory, which migration 082 refuses to reopen — see
   * `hostListingTransitions` — and picks the matching `closed` hint, which for a
   * sourced listing says the ORIGIN withdrew it rather than promising a reopen.
   */
  readonly provenance?: string | null;
}

export function ListingStatusControls({
  listingId,
  currentStatus,
  provenance,
}: ListingStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions = hostListingTransitions(currentStatus, provenance);

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
          label={HOST_STATUS_LABEL[currentStatus]}
          icon={STATUS_ICON[currentStatus]}
          variant={STATUS_VARIANT[currentStatus]}
        />
      </div>
      <p className={styles.hint}>{hostStatusHint(currentStatus, provenance)}</p>
      <div className={styles.actions}>
        {transitions.map((transition) => (
          <Button
            key={transition.target}
            type="button"
            variant={transition.variant}
            disabled={isPending}
            onClick={() => changeStatus(transition.target)}
          >
            {transition.label}
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
