"use client";

import { useState, useTransition } from "react";
import { Button } from "@explore-and-earn/ui";
import type { InviteResponse } from "@explore-and-earn/db/client";

import { respondToInviteAction } from "../../app/actions/invites";
import { CardStatus } from "./CardStatus";
import styles from "./InviteActions.module.css";

/** Friendly copy for the typed errors returned by respondToInvite. */
const ERROR_TEXT: Record<string, string> = {
  unauthenticated: "Sign in to respond to invites.",
  profile_not_found: "Finish setting up your seeker profile first.",
  not_found: "This invite is no longer available.",
  already_responded: "You've already responded to this invite.",
};

/** Invite statuses that are still actionable (seeker has not yet responded). */
const PENDING_STATUSES = new Set(["created", "delivered", "viewed"]);

/** Days remaining before the expiry timestamp (null when no expiry set). */
function daysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export interface InviteActionsProps {
  readonly inviteId: string;
  /**
   * Current lifecycle status of the invite row. Passed from the server
   * component so the client can render the appropriate UI without an
   * extra round-trip. Defaults to "created" (fully actionable).
   */
  readonly initialStatus?: string;
  /** ISO timestamp from invites.expires_at — null when not yet set. */
  readonly expiresAt?: string | null;
}

/**
 * Accept / Decline controls for a single invite card.
 *
 * Renders action buttons when the invite is still pending (created / delivered
 * / viewed). For invites the seeker already responded to, or that have expired,
 * renders a read-only CardStatus pill instead so the lifecycle guard is
 * reflected in the UI without requiring another DB round-trip.
 */
export function InviteActions({
  inviteId,
  initialStatus = "created",
  expiresAt = null,
}: InviteActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<InviteResponse | null>(null);
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  // Once the seeker responds optimistically (message.ok), treat as resolved.
  const resolved = message?.ok === true;

  // Non-pending statuses: show a read-only status pill instead of action buttons.
  if (!PENDING_STATUSES.has(initialStatus) || resolved) {
    const label =
      resolved && pending === "accepted"
        ? "Applied"
        : resolved && pending === "declined"
          ? "Declined"
          : initialStatus === "applied"
            ? "Applied"
            : initialStatus === "ignored"
              ? "Declined"
              : initialStatus === "expired"
                ? "Expired"
                : initialStatus === "withdrawn"
                  ? "Withdrawn"
                  : "Responded";
    return (
      <div className={styles.actions}>
        <CardStatus label={label} />
      </div>
    );
  }

  const days = daysUntilExpiry(expiresAt);
  // Expiry window for invites is 14 days; warn when ≤ 2 days remain.
  const expiryWarning =
    days !== null && days <= 2
      ? days <= 0
        ? "Expires today"
        : days === 1
          ? "Expires tomorrow"
          : `Expires in ${days} days`
      : null;

  function handleRespond(response: InviteResponse) {
    setMessage(null);
    setPending(response);
    startTransition(async () => {
      const result = await respondToInviteAction(inviteId, response);
      setPending(null);
      setMessage(
        result.ok
          ? {
              ok: true,
              text:
                response === "accepted"
                  ? "Invite accepted."
                  : "Invite declined.",
            }
          : {
              ok: false,
              text:
                (result.error ? ERROR_TEXT[result.error] : undefined) ??
                "Could not update this invite.",
            },
      );
    });
  }

  return (
    <div className={styles.actions}>
      <div className={styles.buttons}>
        <Button
          variant="primary"
          type="button"
          onClick={() => handleRespond("accepted")}
          disabled={isPending}
        >
          {isPending && pending === "accepted" ? "Working..." : "Accept"}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={() => handleRespond("declined")}
          disabled={isPending}
        >
          {isPending && pending === "declined" ? "Working..." : "Decline"}
        </Button>
      </div>
      {expiryWarning ? (
        <p className={styles.expiry} aria-live="polite">
          {expiryWarning}
        </p>
      ) : null}
      {message ? (
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
