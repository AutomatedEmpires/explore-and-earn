"use client";

import { useState, useTransition } from "react";
import { Button } from "@explore-and-earn/ui";
import type { InviteResponse } from "@explore-and-earn/db/client";

import { respondToInviteAction } from "../../app/actions/invites";
import styles from "./InviteActions.module.css";

/** Friendly copy for the typed errors returned by respondToInvite. */
const ERROR_TEXT: Record<string, string> = {
  unauthenticated: "Sign in to respond to invites.",
  profile_not_found: "Finish setting up your seeker profile first.",
  not_found: "This invite is no longer available.",
  already_responded: "You've already responded to this invite.",
};

export interface InviteActionsProps {
  readonly inviteId: string;
  /** ISO 8601 timestamp from `invites.expires_at`; null when not yet set. */
  readonly expiresAt?: string | null;
}

/** Warn when fewer than this many milliseconds remain on the expiry window. */
const EXPIRY_WARNING_THRESHOLD_MS = 48 * 60 * 60 * 1000;

/** Returns true if the supplied ISO timestamp is in the past. */
function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt) < new Date();
}

/** Returns true if the invite expires within the next 48 hours. */
function isExpiringSoon(expiresAt: string): boolean {
  const now = Date.now();
  const ms = new Date(expiresAt).getTime() - now;
  return ms > 0 && ms < EXPIRY_WARNING_THRESHOLD_MS;
}

/**
 * Accept / Decline controls for a single invite card. Mirrors the host-side
 * StatusActions pattern (useTransition + an aria-live status line) and composes
 * only the shared @explore-and-earn/ui Button primitive.
 *
 * When `expiresAt` is provided and the invite is already past its expiry the
 * action buttons are replaced with a plain status message so the seeker is
 * never left clicking a button that will always fail.
 */
export function InviteActions({ inviteId, expiresAt }: InviteActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<InviteResponse | null>(null);
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  const expired = expiresAt ? isExpired(expiresAt) : false;
  const expiringSoon = !expired && expiresAt ? isExpiringSoon(expiresAt) : false;

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

  if (expired) {
    return (
      <div className={styles.actions}>
        <p className={styles.error} role="status">
          This invite has expired.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      {expiringSoon && expiresAt ? (
        <p className={styles.expiry} role="note">
          Expires{" "}
          {new Date(expiresAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
          .
        </p>
      ) : null}
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
