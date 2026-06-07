"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Icon } from "@explore-and-earn/ui";

import { saveOnboardingStep } from "../../../actions/seekerOnboarding";
import styles from "../onboarding.module.css";

export default function OnboardingDonePage() {
  const router = useRouter();
  const started = useRef(false);
  const [saving, setSaving] = useState(true);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    let cancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;

    saveOnboardingStep({ complete: true })
      .catch(() => undefined)
      .finally(() => {
        if (cancelled) {
          return;
        }
        setSaving(false);
        redirectTimer = setTimeout(() => router.push("/swipe"), 1500);
      });

    return () => {
      cancelled = true;
      if (redirectTimer) {
        clearTimeout(redirectTimer);
      }
    };
  }, [router]);

  return (
    <div className={styles.shell}>
      <div className={styles.doneCard}>
        <span className={styles.doneIcon} aria-hidden>
          <Icon name="status.match" size={40} aria-hidden />
        </span>
        <h1 className={styles.heading}>You&apos;re all set!</h1>
        <p className={styles.sub}>
          Your profile is ready. Taking you to start swiping…
        </p>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => router.push("/swipe")}
          disabled={saving}
        >
          {saving ? "Finishing…" : "Start swiping"}
        </button>
      </div>
    </div>
  );
}
