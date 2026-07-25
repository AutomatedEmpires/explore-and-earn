"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Icon } from "@explore-and-earn/ui";

import {
  resolveDeletionRequestAction,
  type DeletionResolution,
} from "../../app/actions/accountDeletionAdmin";
import { formatAdminDate } from "./status";
import styles from "./DeletionQueue.module.css";

export interface DeletionRequestView {
  readonly id: string;
  readonly clerkUserId: string;
  readonly subjectScope: "host" | "seeker";
  readonly displayLabel: string | null;
  readonly requestedAt: string;
  readonly status: string;
  readonly requesterNote: string | null;
}

/** Whole days a request has been waiting — the number the deadline runs on. */
function daysWaiting(requestedAt: string): number {
  const then = new Date(requestedAt).getTime();
  if (!Number.isFinite(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * The erasure queue.
 *
 * Age is rendered as text, not just as a colour: "waiting 34 days" is the fact
 * an operator needs, and colour alone may not be perceived. The 30-day marker
 * is the common statutory response window (GDPR Art. 12(3)); it is a prompt to
 * act, not a claim that anything automatic happens at that point.
 */
export function DeletionQueue({
  requests,
}: {
  readonly requests: readonly DeletionRequestView[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(id: string, status: DeletionResolution) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const result = await resolveDeletionRequestAction(id, status).catch(() => ({
        ok: false as const,
        error: "failed",
      }));
      setBusyId(null);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(
        result.error === "forbidden"
          ? "You don't have permission to resolve deletion requests."
          : "Could not record that decision. Try again.",
      );
    });
  }

  if (requests.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon name="system.success" size={24} aria-hidden />
        <p>No open deletion requests.</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      <ul className={styles.list}>
        {requests.map((r) => {
          const age = daysWaiting(r.requestedAt);
          const overdue = age >= 30;
          return (
            <li key={r.id} className={styles.row} data-tone={overdue ? "hot" : undefined}>
              <div className={styles.main}>
                <div className={styles.head}>
                  <span className={styles.label}>
                    {r.displayLabel ?? r.clerkUserId}
                  </span>
                  <Badge
                    label={r.subjectScope}
                    variant={r.subjectScope === "host" ? "info" : "neutral"}
                  />
                  {r.status === "in_progress" ? (
                    <Badge label="In progress" variant="featured" />
                  ) : null}
                </div>
                <p className={styles.meta}>
                  Requested {formatAdminDate(r.requestedAt)} ·{" "}
                  <strong>waiting {age} day{age === 1 ? "" : "s"}</strong>
                  {overdue ? " · past the usual 30-day response window" : ""}
                </p>
                {r.requesterNote ? (
                  <p className={styles.note}>“{r.requesterNote}”</p>
                ) : null}
              </div>

              <div className={styles.actions}>
                {r.status !== "in_progress" ? (
                  <Button
                    variant="secondary"
                    onClick={() => act(r.id, "in_progress")}
                    disabled={isPending && busyId === r.id}
                  >
                    Start
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={() => act(r.id, "completed")}
                  disabled={isPending && busyId === r.id}
                >
                  {isPending && busyId === r.id ? "Working…" : "Mark done"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => act(r.id, "rejected")}
                  disabled={isPending && busyId === r.id}
                >
                  Reject
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
