import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getSeekerProfileResult } from "@explore-and-earn/db";

import { SeekerOnboardingProvider } from "../../../components/onboarding/SeekerOnboardingProvider";
import {
  seekerProfileToOnboardingDraft,
  type SeekerOnboardingDraft,
} from "../../../components/onboarding/seekerOnboardingModel";
import { isDevBenchEnabled } from "../../../lib/devBench";
import { readDevRole } from "../../../lib/devBench/server";
import { getSupabaseToken } from "../../../lib/serverCache";
import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Set up your free Explore & Earn seeker profile to browse, save, and apply to seasonal, remote, farm, maritime, and adventure opportunities.",
  robots: { index: false },
};

function ProfileLoadError() {
  return (
    <main className={styles.loadError} role="alert">
      <h1 className={styles.loadErrorTitle}>We couldn’t load your profile</h1>
      <p className={styles.loadErrorBody}>
        Nothing has been changed. Check your connection and try again before
        continuing onboarding.
      </p>
      <a className={styles.retryLink} href="">
        Try again
      </a>
    </main>
  );
}

/**
 * Seeker onboarding scope layout.
 *
 * This route group sits OUTSIDE (seeker) on purpose, so the founder-locked
 * seeker header + bottom nav (wired in (seeker)/layout.tsx) never render during
 * onboarding — mirroring how (host-onboard) hides the host shell. It only
 * provides a minimal full-height paper canvas for the mobile-first wizard.
 *
 * Auth is enforced here because /onboarding/* is in the middleware public
 * matcher (required to break the (seeker) layout's redirect loop). Unauthenticated
 * users are redirected to /sign-in before any onboarding page renders.
 */
/**
 * DYNAMIC BY DECLARATION, not by accident. auth() below already forces it, but
 * the wizard's steps now read the return path with useSearchParams() (D18), and
 * a page that Next decides to prerender statically fails the build for exactly
 * that call unless it is wrapped in a Suspense boundary. Stating the segment's
 * rendering mode is cheaper and clearer than a boundary per step whose only job
 * is to satisfy a prerender that must never happen on an auth-gated wizard.
 */
export const dynamic = "force-dynamic";

const DEV_BENCH_DRAFT: SeekerOnboardingDraft = {
  displayName: "River Torres",
  bio: "Seasonal cook and trail guide looking for a hands-on summer role.",
  relativeLocation: "Bend, Oregon",
  seekingTimeline: "1_month",
  remotePreference: "any",
  housingPref: "preferred",
  mealsPref: "flexible",
  categories: ["farm", "seasonal", "remote"],
  desiredRoles: ["Guest services", "Ranch hand"],
  generalSkills: ["Cooking", "Trail maintenance"],
};

function OnboardingFrame({
  initialDraft,
  children,
}: {
  readonly initialDraft: SeekerOnboardingDraft;
  readonly children: ReactNode;
}) {
  return (
    <SeekerOnboardingProvider initialDraft={initialDraft}>
      <div className={styles.page}>{children}</div>
    </SeekerOnboardingProvider>
  );
}

export default async function SeekerOnboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Local review only. The explicit NODE_ENV + opt-in gate in
  // isDevBenchEnabled() is false in preview/production, and the role cookie
  // keeps this fixture out of real local sessions.
  if (isDevBenchEnabled() && (await readDevRole()) === "seeker") {
    return (
      <OnboardingFrame initialDraft={DEV_BENCH_DRAFT}>
        {children}
      </OnboardingFrame>
    );
  }

  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?role=seeker&redirect_url=${encodeURIComponent("/onboarding")}`,
    );
  }

  try {
    const token = await getSupabaseToken();
    if (!token) return <ProfileLoadError />;

    const result = await getSeekerProfileResult(token, userId);
    if (!result.ok) return <ProfileLoadError />;

    const initialDraft = seekerProfileToOnboardingDraft(result.profile);

    return <OnboardingFrame initialDraft={initialDraft}>{children}</OnboardingFrame>;
  } catch {
    return <ProfileLoadError />;
  }
}
