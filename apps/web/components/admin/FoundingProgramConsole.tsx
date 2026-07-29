"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveFoundingProgramAction } from "../../app/actions/foundingProgram";
import type { FoundingProgramRow } from "../founding/program";
import { ConfirmAction } from "./ConfirmAction";
import styles from "./FoundingProgramConsole.module.css";

/**
 * The founder's switch for the early-host programme.
 *
 * WHAT IS EDITABLE HERE IS THE WHOLE OF WHAT IS EDITABLE ANYWHERE: how many
 * places, until when, and whether the offer is live. The claimed count is shown
 * and is not a field — it is maintained one increment at a time by the paid
 * claim path, and a console that could type it would be a console that could
 * publish scarcity nobody paid for.
 *
 * The four statuses are not decoration:
 *   draft  — configured but invisible. The public page renders one qualitative
 *            sentence and no figure at all. This is where a capacity and a date
 *            get reviewed before anyone sees them.
 *   open   — live. Real counts, a real deadline, and checkout may charge the
 *            early-host rate.
 *   full   — set automatically by the last claim; can also be set by hand.
 *   ended  — closed by decision rather than by date.
 */

/**
 * The console edits the same row the public surfaces read, so it takes the same
 * shape — capacity, claimed, deadline, status — from the config module rather
 * than restating it. A second declaration is how the two drift.
 */
export interface FoundingProgramConsoleProps extends FoundingProgramRow {
  /** True when the six early-host Stripe prices are provisioned. */
  readonly checkoutReady: boolean;
}

const STATUSES = ["draft", "open", "full", "ended"] as const;

/** ISO instant -> the value a datetime-local input wants (local wall clock). */
function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

const ERROR_TEXT: Record<string, string> = {
  forbidden: "You don't have permission to configure this programme.",
  invalid_capacity: "Capacity must be a whole number of places, zero or more.",
  invalid_status: "That status isn't one of the four.",
  invalid_deadline: "That closing date could not be read.",
  open_requires_capacity_and_deadline:
    "Opening the programme needs both a capacity above zero and a closing date — without them the claim path refuses every seat and nothing would actually be live.",
  save_failed: "The change could not be saved. Try again.",
};

export function FoundingProgramConsole({
  capacity,
  claimed,
  enrollmentDeadline,
  status,
  checkoutReady,
}: FoundingProgramConsoleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [capacityValue, setCapacityValue] = useState(String(capacity));
  const [deadlineValue, setDeadlineValue] = useState(
    toLocalInputValue(enrollmentDeadline),
  );
  // Held as a plain string: the select's value is whatever the DOM gives back,
  // and the action validates it against the four statuses server-side. Narrowing
  // here would only move a cast, not add a check.
  const [statusValue, setStatusValue] = useState<string>(status);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveFoundingProgramAction({
        capacity: Number.parseInt(capacityValue, 10),
        enrollmentDeadline: deadlineValue
          ? new Date(deadlineValue).toISOString()
          : null,
        status: statusValue,
      }).catch(() => ({ ok: false as const, error: "failed" }));

      if (result.ok) {
        setMessage("Saved. The public pages now read these figures.");
        router.refresh();
        return;
      }
      setError(
        ERROR_TEXT[result.error ?? "failed"] ??
          "Something went wrong. Nothing was changed.",
      );
    });
  }

  return (
    <div className={styles.wrap}>
      {!checkoutReady ? (
        <p role="status" className={styles.notice}>
          The six early-host Stripe prices are not provisioned on this
          environment, so checkout will refuse the discounted rate even while the
          programme is open. Set the STRIPE_PRICE_FOUNDING_* variables before
          opening it.
        </p>
      ) : null}

      <dl className={styles.evidence}>
        <div>
          <dt>Places claimed</dt>
          <dd>
            {claimed} of {capacity}
          </dd>
        </div>
        <div>
          <dt>Current status</dt>
          <dd>{status}</dd>
        </div>
      </dl>
      <p className={styles.evidenceNote}>
        The claimed count is not editable. It moves one place at a time, on the
        paid grant path, and it is the evidence behind every figure the public
        page shows.
      </p>

      <div className={styles.fields}>
        <label className={styles.field}>
          <span className={styles.label}>Places</span>
          <input
            className={styles.input}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={capacityValue}
            onChange={(event) => setCapacityValue(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Enrolment closes</span>
          <input
            className={styles.input}
            type="datetime-local"
            value={deadlineValue}
            onChange={(event) => setDeadlineValue(event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            className={styles.input}
            value={statusValue}
            onChange={(event) => setStatusValue(event.target.value)}
          >
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Saving here is not "saving a form" — it is publishing scarcity. The
          same click sets what the public page claims about remaining places and
          what checkout charges the next host, so it gets the second step. */}
      <div className={styles.actions}>
        <ConfirmAction
          label="Save programme"
          question="Publish these programme settings? Capacity and status drive the public scarcity messaging and what a host is charged at checkout."
          confirmLabel="Confirm and publish"
          busyLabel="Saving…"
          subject="early-host programme settings"
          tone="danger"
          triggerVariant="primary"
          busy={isPending}
          onConfirm={save}
        />
      </div>

      {message ? (
        <p role="status" className={styles.success}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
