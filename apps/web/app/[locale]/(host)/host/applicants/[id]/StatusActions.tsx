"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  APPLICATION_TRANSITIONS,
  canTransition,
  type ApplicationStatus,
} from "@explore-and-earn/contracts";
import { Button } from "@explore-and-earn/ui";

import { updateApplicationStatusAction } from "../../../../../actions/applicationStatus";
import styles from "./StatusActions.module.css";

type HostSettable =
  | "reviewing"
  | "saved_by_host"
  | "offered"
  | "not_selected"
  | "accepted"
  | "active"
  | "completed";

interface StatusButton {
  readonly label: string;
  readonly status: HostSettable;
  readonly variant: "primary" | "secondary" | "ghost";
}

const STATUS_BUTTONS: readonly StatusButton[] = [
  { label: "Mark Reviewing", status: "reviewing", variant: "secondary" },
  { label: "Save Applicant", status: "saved_by_host", variant: "secondary" },
  { label: "Make Offer", status: "offered", variant: "primary" },
  { label: "Accept", status: "accepted", variant: "primary" },
  { label: "Pass", status: "not_selected", variant: "ghost" },
  // The engagement itself. Without these two an application stopped at
  // 'accepted' forever, and since a seeker may only review an 'active' or
  // 'completed' engagement, no review could ever be written. The buttons are
  // filtered by canTransition below, so each appears only where it is legal.
  { label: "They've started", status: "active", variant: "primary" },
  { label: "Engagement finished", status: "completed", variant: "primary" },
];

/** Friendly copy for known action error codes (unknown codes pass through). */
const ERROR_TEXT: Record<string, string> = {
  invalid_transition: "This application moved on — refresh to see its current state.",
  conflict: "This application changed while you were acting. Refresh and try again.",
  listing_full: "This listing has no remaining spots — free one up before accepting.",
  forbidden: "You don't have permission to update this application.",
  not_found: "This application is no longer available.",
};

interface StatusActionsProps {
  readonly applicationId: string;
  /** RAW applications.status — button legality is derived from this. */
  readonly status: string;
}

export function StatusActions({ applicationId, status }: StatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<HostSettable | null>(null);
  const [inFlight, setInFlight] = useState(false);
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  // A successful action refreshes the route; when the fresh status prop lands,
  // re-enable the (newly legal) buttons. Until then everything stays disabled
  // so a rapid second press can never race a stale status.
  useEffect(() => {
    setInFlight(false);
    setPendingStatus(null);
  }, [status]);

  // Only edges that are legal from the CURRENT status render —
  // APPLICATION_TRANSITIONS is the single truth. Terminal/engagement states
  // render nothing rather than four buttons that all bounce.
  const buttons = STATUS_BUTTONS.filter((button) =>
    canTransition(
      APPLICATION_TRANSITIONS,
      status as ApplicationStatus,
      button.status as ApplicationStatus,
    ),
  );
  if (buttons.length === 0) return null;

  function handleClick(target: HostSettable) {
    setMessage(null);
    setPendingStatus(target);
    setInFlight(true);
    startTransition(async () => {
      try {
        const result = await updateApplicationStatusAction(applicationId, target);
        if (result.ok) {
          setMessage({ ok: true, text: "Status updated." });
          router.refresh();
          return; // inFlight clears when the fresh status prop arrives
        }
        setInFlight(false);
        setPendingStatus(null);
        setMessage({
          ok: false,
          text:
            (result.error ? ERROR_TEXT[result.error] : undefined) ??
            result.error ??
            "Could not update status.",
        });
      } catch {
        // The action rethrows after Sentry reporting — never strand the UI.
        setInFlight(false);
        setPendingStatus(null);
        setMessage({ ok: false, text: "Could not update status. Try again." });
      }
    });
  }

  const busy = isPending || inFlight;

  return (
    <section className={styles.actions} aria-label="Update application status">
      <div className={styles.buttons}>
        {buttons.map((button) => (
          <Button
            key={button.status}
            variant={button.variant}
            type="button"
            onClick={() => handleClick(button.status)}
            disabled={busy}
          >
            {busy && pendingStatus === button.status ? "Working..." : button.label}
          </Button>
        ))}
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
    </section>
  );
}
