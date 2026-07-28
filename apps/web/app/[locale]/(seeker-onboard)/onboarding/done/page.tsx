import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import styles from "../onboarding.module.css";

/**
 * Onboarding completion page.
 *
 * onboarding_complete is set server-side by the skills step's saveOnboardingStep
 * call (with complete: true) before the router navigates here — both the
 * "Continue" and "Skip" paths on that step call it, so reaching this page
 * always implies the flag is set. Not set in a useEffect. This page is a
 * static confirmation screen; the seeker navigates to /swipe via the link
 * below.
 */
export default function OnboardingDonePage() {
  return (
    <div className={styles.shell}>
      <div className={styles.doneCard}>
        <span className={styles.doneIcon} aria-hidden>
          <Icon name="status.match" size={24} aria-hidden />
        </span>
        <h1 className={styles.heading}>You&apos;re all set!</h1>
        <p className={styles.sub}>
          Your profile is ready. Start swiping to find your next adventure.
        </p>
        <Link href="/swipe" className={styles.primaryButton}>
          Start swiping
        </Link>
      </div>
    </div>
  );
}
