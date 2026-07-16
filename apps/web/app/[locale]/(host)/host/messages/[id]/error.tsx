"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect, useState } from "react";

import { reportError } from "../../../../../../lib/sentry";
import styles from "../../../../status.module.css";

/**
 * Error boundary for the host message thread. Offers a retry and a path back
 * to the host messages list. Reports to Sentry on mount.
 */
export default function HostMessageThreadError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  const [eventId, setEventId] = useState<string | undefined>(undefined);

  useEffect(() => {
    reportError(error, { route: "host-message-thread" });
    setEventId(Sentry.lastEventId());
  }, [error]);

  return (
    <section className={styles.wrap} role="alert">
      <h1 className={styles.heading}>Couldn&apos;t load this conversation</h1>
      <p className={styles.message}>
        Something went wrong loading this message thread. Please try again.
      </p>
      {eventId ? (
        <p className={styles.digest}>Error ID: {eventId}</p>
      ) : null}
      <button type="button" className={styles.action} onClick={() => reset()}>
        Try again
      </button>
      <Link className={styles.action} href="/host/messages">
        All messages
      </Link>
    </section>
  );
}
