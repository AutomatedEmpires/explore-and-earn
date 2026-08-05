import type { Metadata } from "next";
import type { ReactNode } from "react";

import { HOST_DEMO_ROUTE_MAP } from "../../../../components/demo/demoRoutes";
import {
  hostDemoHost,
  hostDemoNotifications,
  hostDemoThreads,
} from "../../../../components/demo/full-fidelity/host/adapter";
import { HostDemoDisclosure } from "../../../../components/demo/full-fidelity/host/HostDemoViews";
import {
  HostDemoResetBoundary,
  HostDemoSessionProvider,
} from "../../../../components/demo/full-fidelity/host/HostDemoSession";
import { HostShell } from "../../../../components/host/HostShell";
import "../../../../styles/host.css";
import "../../../../styles/host-os.css";

export const metadata: Metadata = {
  title: {
    default: "Host walkthrough · Explore & Earn",
    template: "%s · Host walkthrough · Explore & Earn",
  },
  description:
    "Walk a populated, production-shaped host workspace with fictional sample records and session-local interactions.",
  alternates: { canonical: "/for-hosts/demo" },
  robots: { index: false, follow: true },
};

/**
 * The public walkthrough uses the canonical host shell and information
 * architecture, with every authenticated destination mapped back into the
 * isolated demo namespace. No auth, database, billing, email, or provider code
 * is imported by this route tree.
 */
export default function HostDemoLayout({ children }: { readonly children: ReactNode }) {
  const unreadMessages = hostDemoThreads.filter((thread) => thread.unread).length;
  const unreadNotifications = hostDemoNotifications.filter(
    (notification) => !notification.initiallyRead,
  ).length;
  return (
    <div className="host-os">
      <HostDemoSessionProvider>
        <HostShell
          companyName={hostDemoHost.name}
          unreadMessages={unreadMessages}
          unreadNotifications={unreadNotifications}
          routeMap={HOST_DEMO_ROUTE_MAP}
          demoMode
        >
          <HostDemoDisclosure />
          <HostDemoResetBoundary>{children}</HostDemoResetBoundary>
        </HostShell>
      </HostDemoSessionProvider>
    </div>
  );
}
