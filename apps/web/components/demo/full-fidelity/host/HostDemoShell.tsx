"use client";

import type { ReactNode } from "react";

import { HostShell } from "../../../host/HostShell";
import { HOST_DEMO_ROUTE_MAP } from "../../demoRoutes";
import { hostDemoHost } from "./adapter";
import { HostDemoResetBoundary, useHostDemoSession } from "./HostDemoSession";
import { HostDemoDisclosure } from "./HostDemoViews";

/** Reactive shell bridge: navigation badges follow session read state. */
export function HostDemoShell({ children }: { readonly children: ReactNode }) {
  const { unreadMessageCount, unreadNotificationCount } = useHostDemoSession();

  return (
    <HostShell
      companyName={hostDemoHost.name}
      unreadMessages={unreadMessageCount}
      unreadNotifications={unreadNotificationCount}
      routeMap={HOST_DEMO_ROUTE_MAP}
      demoMode
    >
      <HostDemoDisclosure />
      <HostDemoResetBoundary>{children}</HostDemoResetBoundary>
    </HostShell>
  );
}
