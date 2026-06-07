import type { Metadata } from "next";
import type { ReactNode } from "react";

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
 */
export default function SeekerOnboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <div className={styles.page}>{children}</div>;
}
