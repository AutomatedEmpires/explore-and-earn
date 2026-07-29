"use client";

import { useEffect, useRef, useState } from "react";
import { Button, type IconKey } from "@explore-and-earn/ui";

import styles from "./ConfirmAction.module.css";

/**
 * The admin surface's ONE confirmation control (founder Part VIII: "every
 * destructive action gets an explicit confirmation").
 *
 * Before this, three different mechanisms were in play — a `window.confirm` in
 * ModerationWorkbench, hand-rolled two-step state in RefundQueue and
 * ClaimsReviewQueue, and nothing at all on the other eight surfaces — so
 * whether a moderator got a second chance depended on which queue they happened
 * to be in. Worse, the two hand-rolled ones each guarded only their *positive*
 * verb: approving a refund confirmed, denying it did not; approving a claim
 * confirmed, rejecting it did not. The irreversible half was the unguarded half.
 *
 * WHY INLINE TWO-STEP RATHER THAN window.confirm:
 *   - `window.confirm` cannot say what the consequence is in more than a
 *     sentence of unstyled text, is unstyleable, blocks the main thread, and is
 *     suppressible by the browser after repeated use — a moderator working a
 *     queue can silently lose the guard entirely.
 *   - It is also untestable in jsdom without stubbing a global, which is why
 *     the one existing `window.confirm` had no test.
 *
 * The confirm button takes focus when the step opens, so a keyboard operator
 * lands on the decision rather than having to hunt for it, and Escape backs
 * out. The consequence sentence is the accessible description of that button.
 */
export interface ConfirmActionProps {
  /** Trigger label — the verb, as it reads before any confirmation. */
  readonly label: string;
  /**
   * What happens if they go through with it, in plain language. This is the
   * whole point of the control: "Reject" is a word, "the claimant is told their
   * claim failed and the listing stays sourced" is a consequence.
   */
  readonly question: string;
  /** Confirm-step label. Should restate the verb, never say "OK". */
  readonly confirmLabel: string;
  /** Label while the action is in flight. */
  readonly busyLabel?: string;
  /** What is being acted on — folded into the aria-labels for screen readers. */
  readonly subject: string;
  readonly onConfirm: () => void;
  readonly disabled?: boolean;
  /** True while THIS row's action is in flight. */
  readonly busy?: boolean;
  readonly icon?: IconKey;
  readonly triggerVariant?: "primary" | "secondary" | "ghost";
  /** Marks the row as a warm-red danger register in the admin token scope. */
  readonly tone?: "danger" | "neutral";
}

export function ConfirmAction({
  label,
  question,
  confirmLabel,
  busyLabel = "Working…",
  subject,
  onConfirm,
  disabled = false,
  busy = false,
  icon,
  triggerVariant = "ghost",
  tone = "danger",
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const confirmRef = useRef<HTMLDivElement | null>(null);

  // Move focus onto the confirm button as the step opens. Without this the
  // keyboard operator's focus stays on a trigger that no longer exists, which
  // in practice drops them back to the top of the document.
  useEffect(() => {
    if (!open) return;
    const button = confirmRef.current?.querySelector<HTMLButtonElement>(
      "[data-confirm-primary]",
    );
    button?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button
        variant={triggerVariant}
        icon={icon}
        disabled={disabled || busy}
        data-tone={tone === "danger" ? "deny" : undefined}
        aria-label={`${label}: ${subject}`}
        onClick={() => setOpen(true)}
      >
        {busy ? busyLabel : label}
      </Button>
    );
  }

  return (
    <div
      ref={confirmRef}
      className={styles.confirm}
      data-tone={tone}
      role="group"
      aria-label={`Confirm: ${label} — ${subject}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <p className={styles.question}>{question}</p>
      <div className={styles.buttons}>
        <Button
          variant="ghost"
          icon="action.close"
          disabled={busy}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        {/* `disabled` gates the CONFIRM step too, not just the trigger. Each
            row owns its own open state, so two panels can be open at once: a
            caller that disables every row while one action is in flight (the
            notification queue does exactly this, via `pendingId !== null`) must
            have that respected here, or the operator can open panel B, confirm
            A, and still fire B mid-flight. Same reason the sourcing console's
            "a source and a payload are selected" precondition has to survive
            the panel being open — it can stop being true while it is. */}
        <Button
          variant="primary"
          icon={icon}
          disabled={disabled || busy}
          data-confirm-primary=""
          data-tone={tone === "danger" ? "deny" : undefined}
          aria-label={`${confirmLabel}: ${subject}`}
          onClick={() => {
            setOpen(false);
            onConfirm();
          }}
        >
          {busy ? busyLabel : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
