"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, DiscoveryCard } from "@explore-and-earn/ui";
import type { DiscoveryCardData } from "@explore-and-earn/ui";

import {
  approveListingAction,
  holdListingAction,
  rejectListingAction,
} from "../../app/actions/admin";
import { ConfirmAction } from "./ConfirmAction";
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
        actions={
          isAwaitingReview ? (
            /* The card's built-in Approve/Hold/Reject strip fires each handler
               on a single click, and those buttons live in packages/ui where
               the admin confirmation control cannot reach them. `actions` is
               the card's own escape hatch for exactly this, so the three verbs
               are rendered here instead and Hold and Reject carry a confirm
               step. It replaces the strip wholesale — which is why Approve is
               rebuilt below rather than left to onApprove. */
            <>
              {/* Approve stays one click: the throughput verb, and the
                  reversible one — Hold and Reject can still pull the listing
                  back afterwards. */}
              <Button
                variant="primary"
                disabled={isPending}
                onClick={() => handleApprove(data.id)}
              >
                Approve
              </Button>
              <ConfirmAction
                label="Hold"
                confirmLabel="Confirm hold"
                question="Hold this listing? It leaves the seeker feed immediately and goes back to the host as a draft for them to fix and republish. Nothing notifies them that it moved."
                subject={data.title}
                triggerVariant="secondary"
                busy={isPending}
                onConfirm={() => handleHold(data.id)}
              />
              <ConfirmAction
                label="Reject"
                confirmLabel="Confirm rejection"
                question="Reject this listing? It closes and leaves the marketplace immediately. No reason is recorded anywhere and the host is not notified."
                subject={data.title}
                busy={isPending}
                onConfirm={() => handleReject(data.id)}
              />
            </>
          ) : undefined
        }
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
