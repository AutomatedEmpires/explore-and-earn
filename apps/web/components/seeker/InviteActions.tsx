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
}

/**
 * Accept / Decline controls for a single invite card. Mirrors the host-side
 * StatusActions pattern (useTransition + an aria-live status line) and composes
 * only the shared @explore-and-earn/ui Button primitive.
 */
export function InviteActions({ inviteId }: InviteActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pending, setPending] = useState<InviteResponse | null>(null);
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

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
