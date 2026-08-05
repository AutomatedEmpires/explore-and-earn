import { auth } from "@clerk/nextjs/server";
import {
  getSeekerResume,
  seekerResumeCompletion,
  type SeekerResumeStatus,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import { SeekerOnboardingFinish } from "../../../../../components/onboarding/SeekerOnboardingFinish";
import { onboardingOutcome } from "../../../../../components/onboarding/seekerOnboardingModel";
import { safeInternalRedirect } from "../../../../../lib/authRedirect";
import { isCommunityPath } from "../../../../../lib/communityRoutes";
import { isDevBenchEnabled } from "../../../../../lib/devBench";
import { readDevRole } from "../../../../../lib/devBench/server";
import { getSupabaseToken } from "../../../../../lib/serverCache";
import styles from "../onboarding.module.css";

interface Props {
  readonly searchParams: Promise<{ returnTo?: string }>;
}

/**
 * The local seeker fixture in the onboarding layout satisfies every real
 * application-readiness requirement. Keep the final step useful during a
 * browser walk without weakening the production database-backed check.
 */
const DEV_BENCH_RESUME_STATUS: SeekerResumeStatus = {
  complete: true,
  completion: 100,
  missing: [],
};

export default async function OnboardingDonePage({ searchParams }: Props) {
  const returnTo = safeInternalRedirect((await searchParams).returnTo);
  const destination = returnTo ?? "/seek";
  const destinationPath = destination.split("?")[0] ?? "";
  const backToCommunity = isCommunityPath(destinationPath);
  const destinationLabel = backToCommunity
    ? "Open Community"
    : returnTo
      ? "Continue"
      : "Explore opportunities";
  const resumeHref = returnTo
    ? `/resume?redirect_url=${encodeURIComponent(returnTo)}`
    : "/resume";

  const isDevSeeker =
    isDevBenchEnabled() && (await readDevRole()) === "seeker";
  const status = isDevSeeker
    ? DEV_BENCH_RESUME_STATUS
    : await auth().then(async ({ userId }) => {
        const token = await getSupabaseToken().catch(() => null);
        return userId && token
          ? getSeekerResume(token, userId)
              .then(seekerResumeCompletion)
              .catch(() => null)
          : null;
      });
  const outcome = status ? onboardingOutcome(status) : null;

  return (
    <div className={styles.shell}>
      <p className={styles.progressLabel}>Step 4 of 4 · Readiness check</p>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Onboarding progress"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={4}
      >
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={styles.progressDotActive}
            aria-hidden="true"
          />
        ))}
      </div>
      <div className={styles.doneCard}>
        <span
          className={outcome?.readyToApply ? styles.doneIcon : styles.reviewIcon}
          aria-hidden
        >
          <Icon
            name={outcome?.readyToApply ? "status.match" : "action.edit"}
            size={24}
            aria-hidden
          />
        </span>
        <div className={styles.doneCopy}>
          <h1 className={styles.heading}>
            {outcome?.readyToApply
              ? "Your profile is ready to apply"
              : outcome
                ? "Your profile is saved"
                : "Your profile is saved — let’s confirm the rest"}
          </h1>
          <p className={styles.sub}>
            {outcome?.readyToApply
              ? "You have every detail required to apply. You can keep polishing your résumé at any time."
              : outcome
                ? "You can explore now, but applying stays locked until the missing résumé details below are complete."
                : "We couldn’t verify application readiness right now. Open your résumé to review it, or explore and return later."}
          </p>
        </div>

        {outcome ? (
          <section className={styles.readinessCard} aria-labelledby="readiness-title">
            <div className={styles.readinessHeader}>
              <h2 id="readiness-title" className={styles.readinessTitle}>
                Application readiness
              </h2>
              <span className={styles.readinessValue}>{outcome.completion}%</span>
            </div>
            <div
              className={styles.readinessTrack}
              role="progressbar"
              aria-label="Application readiness"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={outcome.completion}
            >
              <span
                className={styles.readinessFill}
                style={{ width: `${outcome.completion}%` }}
              />
            </div>
            {outcome.missingLabels.length > 0 ? (
              <div className={styles.missingBlock}>
                <p className={styles.missingTitle}>Still needed to apply</p>
                <ul className={styles.missingList}>
                  {outcome.missingLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className={styles.readyNote}>
                All required application details are present.
              </p>
            )}
          </section>
        ) : null}

        <SeekerOnboardingFinish
          readyToApply={outcome?.readyToApply ?? null}
          destination={destination}
          resumeHref={resumeHref}
          destinationLabel={destinationLabel}
        />
        {!outcome?.readyToApply ? (
          <p className={styles.finishHint}>
            Exploring first will not mark your résumé as application-ready.
          </p>
        ) : null}
      </div>
    </div>
  );
}
