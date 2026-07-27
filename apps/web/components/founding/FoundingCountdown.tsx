"use client";

import { useEffect, useState } from "react";

import type { FoundingDeadline } from "./program";
import styles from "./founding.module.css";

/**
 * A countdown to a deadline the SERVER supplied.
 *
 * WHAT THIS COMPONENT IS NOT ALLOWED TO BE. The commonest form of this widget
 * starts a timer from the visitor's clock — "offer ends in 47:59:12" — and
 * resets on every reload. That is a fabricated deadline, it is obvious to anyone
 * who looks twice, and it is exactly the dishonesty the commercial redesign
 * exists to remove. So: no localStorage, no sessionStorage, no seeded duration,
 * and no default. The only input is an absolute instant chosen by the founder
 * and stored in the database (migration 087), and this component does one thing
 * with it — subtract.
 *
 * It renders NOTHING until it has mounted, and nothing once the instant has
 * passed. The first is because the server and the browser cannot agree on "now",
 * so rendering a remaining time during SSR would hydrate to a different string
 * every time; the second is because a countdown showing zero is a claim the
 * offer is still open. The parent already renders the deadline DATE as static
 * server-rendered text, so a visitor with JavaScript disabled still learns when
 * enrolment closes — this is decoration on top of a fact, never the fact itself.
 */
/**
 * The prop shape is the config module's, not this component's: there is exactly
 * one legal input and it is an absolute instant the server supplied.
 */
export type FoundingCountdownProps = FoundingDeadline;

interface Remaining {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

function remainingUntil(deadlineMs: number, nowMs: number): Remaining | null {
  const ms = deadlineMs - nowMs;
  if (!Number.isFinite(ms) || ms <= 0) return null;

  const totalMinutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  };
}

export function FoundingCountdown({ deadlineIso }: FoundingCountdownProps) {
  const deadlineMs = new Date(deadlineIso).getTime();
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    if (!Number.isFinite(deadlineMs)) return;

    const tick = () => setRemaining(remainingUntil(deadlineMs, Date.now()));
    tick();
    // A minute is the smallest unit shown, so a minute is how often it needs to
    // move. A per-second timer on a marketing page is a battery cost with no
    // information in it.
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, [deadlineMs]);

  if (!remaining) return null;

  return (
    <p className={styles.countdown}>
      <span className={styles.countdownUnit}>
        <strong>{remaining.days}</strong> {remaining.days === 1 ? "day" : "days"}
      </span>
      <span className={styles.countdownUnit}>
        <strong>{remaining.hours}</strong>{" "}
        {remaining.hours === 1 ? "hour" : "hours"}
      </span>
      <span className={styles.countdownUnit}>
        <strong>{remaining.minutes}</strong>{" "}
        {remaining.minutes === 1 ? "minute" : "minutes"}
      </span>
      <span className={styles.countdownNote}>until enrolment closes</span>
    </p>
  );
}
