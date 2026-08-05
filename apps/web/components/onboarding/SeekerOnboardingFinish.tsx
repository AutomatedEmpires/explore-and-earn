"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { finishSeekerOnboarding } from "../../app/actions/seekerOnboarding";
import styles from "../../app/[locale]/(seeker-onboard)/onboarding/onboarding.module.css";

interface SeekerOnboardingFinishProps {
  readonly readyToApply: boolean | null;
  readonly destination: string;
  readonly resumeHref: string;
  readonly destinationLabel: string;
}

export function SeekerOnboardingFinish({
  readyToApply,
  destination,
  resumeHref,
  destinationLabel,
}: SeekerOnboardingFinishProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingDestination, setPendingDestination] = useState<string | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  function finish(nextPath: string) {
    setPendingDestination(nextPath);
    startTransition(async () => {
      setError(null);
      try {
        const result = await finishSeekerOnboarding();
        if (!result.ok) {
          setError("We couldn’t finish onboarding. Please try again.");
          setPendingDestination(null);
          return;
        }
        router.push(nextPath);
      } catch {
        setError("We couldn’t finish onboarding. Please try again.");
        setPendingDestination(null);
      }
    });
  }

  const resumeLabel = readyToApply === null ? "Open résumé" : "Finish résumé now";

  return (
    <div className={styles.finishActions}>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {readyToApply === true ? (
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => finish(destination)}
          disabled={pending}
        >
          {pending && pendingDestination === destination
            ? "Finishing…"
            : destinationLabel}
        </button>
      ) : (
        <>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => finish(resumeHref)}
            disabled={pending}
          >
            {pending && pendingDestination === resumeHref
              ? "Finishing…"
              : resumeLabel}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => finish(destination)}
            disabled={pending}
          >
            {pending && pendingDestination === destination
              ? "Finishing…"
              : "Explore first"}
          </button>
        </>
      )}
    </div>
  );
}
