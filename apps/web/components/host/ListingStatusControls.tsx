"use client";

import Link from "next/link";
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
  transitionRequiresActivePlan,
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
  /**
   * The host's billing state, from hostAccountState() in @explore-and-earn/db.
   *
   * COURTESY ONLY. When it is 'prospect' the publish actions explain the plan
   * requirement instead of firing an action the database will refuse. It does
   * NOT authorize anything: updateListingStatusAction runs the same server path
   * regardless, and private.enforce_listing_allowance (083) refuses a prospect's
   * publication whether this prop is present, absent or wrong. A host calling
   * the action directly meets exactly the same refusal.
   *
   * Undefined means "not resolved" and gates nothing — a missing explanation is
   * recoverable (the host meets the database's own message); a wrongly withheld
   * publish button on a paying host is not.
   */
  readonly accountState?: string | null;
}

export function ListingStatusControls({
  listingId,
  currentStatus,
  provenance,
  accountState,
}: ListingStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [planNoticeFor, setPlanNoticeFor] = useState<string | null>(null);

  const transitions = hostListingTransitions(currentStatus, provenance);
  const isProspect = accountState === "prospect";

  function changeStatus(target: HostManageableListingStatus) {
    setError(null);
    setPlanNoticeFor(null);
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

  /**
   * A prospect asked for something the allowance trigger will refuse.
   *
   * Explaining it here is a COURTESY, not a gate — see the accountState prop.
   * The alternative is what shipped before this: the host clicks Publish, the
   * database raises listing_allowance_exceeded, and the raw message is rendered
   * verbatim into the page. That is technically honest and practically useless;
   * it names a constraint rather than a next step, and it does not say the one
   * thing the host most needs to hear, which is that their work is safe.
   */
  function explainPlanRequirement(target: HostManageableListingStatus) {
    setError(null);
    setPlanNoticeFor(target);
  }

  function duplicate() {
    setError(null);
    setPlanNoticeFor(null);
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
        {transitions.map((transition) => {
          // The button is NOT disabled for a prospect. A disabled control says
          // "this is broken" and leaves nowhere to go; a live one that explains
          // itself says "this costs a plan, and here is the plan".
          const gated =
            isProspect &&
            transitionRequiresActivePlan(currentStatus, transition.target);
          return (
            <Button
              key={transition.target}
              type="button"
              variant={transition.variant}
              disabled={isPending}
              onClick={() =>
                gated
                  ? explainPlanRequirement(transition.target)
                  : changeStatus(transition.target)
              }
            >
              {transition.label}
            </Button>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={duplicate}
        >
          Duplicate
        </Button>
      </div>
      {planNoticeFor ? (
        <p className={styles.planNotice} role="status">
          Publishing requires an active plan — your draft is saved.{" "}
          <Link className={styles.planLink} href="/host/plans">
            See plans
          </Link>
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
