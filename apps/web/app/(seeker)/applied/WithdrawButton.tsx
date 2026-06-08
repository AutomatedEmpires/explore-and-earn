"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { withdrawApplicationAction } from "../../actions/applications";
import styles from "./WithdrawButton.module.css";

export interface WithdrawButtonProps {
  readonly applicationId: string;
}

/**
 * Withdraw control for an `applied` application card. Optimistically swaps to a
 * "Withdrawing…" note on success, then refreshes the server component so the
 * row moves from Active to Closed.
 */
export function WithdrawButton({ applicationId }: WithdrawButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return <span className={styles.note}>Withdrawing…</span>;
  }

  return (
    <span className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await withdrawApplicationAction(applicationId);
            if (result.ok) {
              setDone(true);
              router.refresh();
            } else {
              setError("Couldn't withdraw. Please try again.");
            }
          })
        }
      >
        {pending ? "Withdrawing…" : "Withdraw"}
      </button>
      {error ? (
        <span className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
