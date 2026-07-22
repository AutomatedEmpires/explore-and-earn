"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DiscoveryCard } from "@explore-and-earn/ui";
import type { DiscoveryCardData } from "@explore-and-earn/ui";

import {
  approveListingAction,
  holdListingAction,
  rejectListingAction,
} from "../../app/actions/admin";
import styles from "./AdminListingCard.module.css";

export interface AdminListingCardProps {
  readonly data: DiscoveryCardData;
  readonly listingStatus: string;
}

function statusToCardState(
  status: string,
): "reported" | "draft" | "paused" | "expired" | "matched" {
  switch (status) {
    case "under_review":
      return "reported";
    case "draft":
      return "draft";
    case "paused":
      return "paused";
    case "closed":
    case "archived":
      return "expired";
    default:
      return "matched";
  }
}

export function AdminListingCard({
  data,
  listingStatus,
}: AdminListingCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  function handleApprove(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await approveListingAction(id);
      setMessage(
        result.ok
          ? { ok: true, text: "Listing approved and set to live." }
          : { ok: false, text: result.error ?? "Could not approve listing." },
      );
      if (result.ok) router.refresh();
    });
  }

  function handleReject(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await rejectListingAction(id);
      setMessage(
        result.ok
          ? { ok: true, text: "Listing rejected and closed." }
          : { ok: false, text: result.error ?? "Could not reject listing." },
      );
      if (result.ok) router.refresh();
    });
  }

  function handleHold(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await holdListingAction(id);
      setMessage(
        result.ok
          ? { ok: true, text: "Listing returned to the host for updates." }
          : { ok: false, text: result.error ?? "Could not hold listing." },
      );
      if (result.ok) router.refresh();
    });
  }

  const isAwaitingReview = listingStatus === "under_review";

  return (
    <div className={styles.wrap}>
      <DiscoveryCard
        data={data}
        surface="admin_review"
        cardState={statusToCardState(listingStatus)}
        onApprove={isAwaitingReview ? handleApprove : undefined}
        onHold={isAwaitingReview ? handleHold : undefined}
        onReject={isAwaitingReview ? handleReject : undefined}
        adminActionsDisabled={isPending}
      />
      {isPending ? (
        <p className={styles.pending} role="status" aria-live="polite">
          Working…
        </p>
      ) : null}
      {message && !isPending ? (
        <p
          className={message.ok ? styles.success : styles.error}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
