import type { Metadata } from "next";
import type { ReactNode } from "react";

import {
  DemoBanner,
  DemoSessionProvider,
  DemoToolbar,
  DemoWorkspaceNav,
  ProductTourProvider,
} from "../../../../components/demo";
import styles from "../../../../components/demo/demoChrome.module.css";

export const metadata: Metadata = {
  title: "Demo workspace — the Enterprise host experience",
  description:
    "Walk the whole host workspace with sample data before you build anything: the employer profile, seven roles, ninety-six applications, outreach, messages, announcements, analytics, and the seeker's view of it all.",
  alternates: { canonical: "/for-hosts/demo" },
  // Sample data is not inventory. Keeping the demo out of the index stops a
  // fixture listing competing with real roles in search results.
  robots: { index: false, follow: true },
};

/**
 * The demo workspace shell (spec D8, expanded by V2 D20).
 *
 * PUBLIC and signed-out reachable by design — the founder's model is "build,
 * preview, understand, and desire the product before billing", and a demo you
 * have to sign up for cannot do that job.
 *
 * FOUR THINGS LIVE HERE RATHER THAN ON EACH PAGE, all for the same reason: a
 * new demo surface should inherit them instead of having to remember them.
 *
 *   · The disclosure banner, so the label is present by construction.
 *   · The session provider, so a stage moved on one surface is a stage moved
 *     on every surface — and so "Reset demo" has one thing to reset.
 *   · The tour provider, so the anchored walk can cross routes without losing
 *     its place.
 *   · The toolbar, so the tour, the seeker preview and the reset are reachable
 *     from anywhere in the workspace.
 */
export default function DemoWorkspaceLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <DemoSessionProvider>
      <ProductTourProvider>
        <div className={styles.workspace}>
          <DemoBanner />
          <DemoWorkspaceNav />
          <DemoToolbar />
          {children}
        </div>
      </ProductTourProvider>
    </DemoSessionProvider>
  );
}
