import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Set up your free Explore & Earn seeker profile to browse, save, and apply to seasonal, remote, farm, maritime, and adventure opportunities.",
  robots: { index: false },
};

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

export default async function SeekerOnboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect(
      `/sign-in?role=seeker&redirect_url=${encodeURIComponent("/onboarding")}`,
    );
  }
  return <div className={styles.page}>{children}</div>;
}
