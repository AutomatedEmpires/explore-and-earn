"use client";

import { useState, useTransition } from "react";
import { Button } from "@explore-and-earn/ui";

import { updateApplicationStatusAction } from "../../../../actions/applicationStatus";
import styles from "./StatusActions.module.css";

interface StatusButton {
  readonly label: string;
  readonly status: string;
  readonly variant: "primary" | "secondary" | "ghost";
}

const STATUS_BUTTONS: readonly StatusButton[] = [
  { label: "Mark Reviewing", status: "reviewing", variant: "secondary" },
  { label: "Save Applicant", status: "saved_by_host", variant: "secondary" },
  { label: "Make Offer", status: "offered", variant: "primary" },
  { label: "Pass", status: "not_selected", variant: "ghost" },
];

interface StatusActionsProps {
  readonly applicationId: string;
}

export function StatusActions({ applicationId }: StatusActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    readonly ok: boolean;
    readonly text: string;
  } | null>(null);

  function handleClick(status: string) {
    setMessage(null);
    setPendingStatus(status);
    startTransition(async () => {
      const result = await updateApplicationStatusAction(applicationId, status);
      setPendingStatus(null);
      setMessage(
        result.ok
          ? { ok: true, text: "Status updated." }
          : { ok: false, text: result.error ?? "Could not update status." },
      );
    });
  }

  return (
    <section className={styles.actions} aria-label="Update application status">
      <div className={styles.buttons}>
        {STATUS_BUTTONS.map((button) => (
          <Button
            key={button.status}
            variant={button.variant}
            type="button"
            onClick={() => handleClick(button.status)}
            disabled={isPending}
          >
            {isPending && pendingStatus === button.status
              ? "Working..."
              : button.label}
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
