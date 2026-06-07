import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import styles from "./layout.module.css";

export const metadata: Metadata = {
  title: "Get started",
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
export default async function SeekerOnboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/sign-in");
  }
  return <div className={styles.page}>{children}</div>;
}
