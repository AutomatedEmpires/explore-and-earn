import type { Metadata } from "next";
import type { ReactNode } from "react";

import { DemoBanner, DemoWorkspaceNav } from "../../../../components/demo";
import styles from "../../../../components/demo/demoChrome.module.css";

export const metadata: Metadata = {
  title: "Demo workspace — the Enterprise host experience",
  description:
    "Walk the host workspace with sample data before you build anything: the employer profile, the opportunity card seekers see, the applicant pipeline, announcements, and the analytics dashboard.",
  alternates: { canonical: "/for-hosts/demo" },
  // Sample data is not inventory. Keeping the demo out of the index stops a
  // fixture listing competing with real roles in search results.
  robots: { index: false, follow: true },
};

/**
 * The demo workspace shell (spec D8).
 *
 * PUBLIC and signed-out reachable by design — the founder's model is "build,
 * preview, understand, and desire the product before billing", and a demo you
 * have to sign up for cannot do that job.
 *
 * The disclosure banner lives HERE rather than on each page so it is present by
 * construction: a new demo surface inherits the label instead of having to
 * remember it.
 */
export default function DemoWorkspaceLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.workspace}>
      <DemoBanner />
      <DemoWorkspaceNav />
      {children}
    </div>
  );
}
