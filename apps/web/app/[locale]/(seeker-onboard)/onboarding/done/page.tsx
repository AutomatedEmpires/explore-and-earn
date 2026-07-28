import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";

import { safeInternalRedirect } from "../../../../../lib/authRedirect";
import { isCommunityPath } from "../../../../../lib/communityRoutes";
import styles from "../onboarding.module.css";

/**
 * Onboarding completion page.
 *
 * onboarding_complete is set server-side by the skills step's saveOnboardingStep
 * call (with complete: true) before the router navigates here — both the
 * "Continue" and "Skip" paths on that step call it, so reaching this page
 * always implies the flag is set. Not set in a useEffect.
 *
 * RETURN PATH (D18). A seeker who reached Community without a profile is sent
 * through this wizard, and the point of the detour is that they end up where
 * they were going. The path rides the URL through every step (see
 * ../returnTo.ts) and is REVALIDATED here — a query parameter is editable
 * between any two steps, so the last screen must not trust what the first one
 * was handed. With no safe return path this is the unchanged "start swiping"
 * screen.
 */
interface Props {
  searchParams: Promise<{ returnTo?: string }>;
}

export default async function OnboardingDonePage({ searchParams }: Props) {
  const returnTo = safeInternalRedirect((await searchParams).returnTo);
  const backToCommunity =
    returnTo !== undefined && isCommunityPath(returnTo.split("?")[0] ?? "");

  return (
    <div className={styles.shell}>
      <div className={styles.doneCard}>
        <span className={styles.doneIcon} aria-hidden>
          <Icon name="status.match" size={24} aria-hidden />
        </span>
        <h1 className={styles.heading}>You&apos;re all set!</h1>
        <p className={styles.sub}>
          {backToCommunity
            ? "Your seeker profile is ready — Community is open to you now."
            : "Your profile is ready. Start swiping to find your next adventure."}
        </p>
        <Link href={returnTo ?? "/swipe"} className={styles.primaryButton}>
          {backToCommunity ? "Open Community" : returnTo ? "Continue" : "Start swiping"}
        </Link>
      </div>
    </div>
  );
}
