"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

import { SEEKER_DEMO_ROUTE_MAP } from "../../demoRoutes";
import { SeekerShell } from "../../../seeker/SeekerShell";
import { seekerDemoNotifications, seekerDemoPerson } from "./model";
import {
  DemoSeekerSessionProvider,
  profileReadiness,
  useDemoSeekerSession,
} from "./DemoSeekerSession";
import styles from "./SeekerDemo.module.css";

function DemoShellContent({ children }: { readonly children: ReactNode }) {
  const { persistenceAvailable, profile, readNotificationIds, reset, unreadMessageCount } = useDemoSeekerSession();
  const [resetNotice, setResetNotice] = useState("");
  const unread = seekerDemoNotifications.filter(
    (notification) => !notification.read && !readNotificationIds.includes(notification.id),
  ).length;

  function resetWalkthrough() {
    reset();
    setResetNotice("Walkthrough choices reset to the starting sample account.");
    // A full replacement makes reset deterministic from deep dynamic routes and
    // guarantees every route-local control remounts from the cleared session.
    window.location.replace("/for-seekers/demo");
  }

  return (
    <div className="seeker-os">
      <SeekerShell
        seekerName={seekerDemoPerson.name}
        profileScore={profileReadiness(profile)}
        unreadMessages={unreadMessageCount}
        unreadNotifications={unread}
        routeMap={SEEKER_DEMO_ROUTE_MAP}
        demoMode
      >
        <div className={styles.demoBanner} role="note" aria-label="Sample seeker account notice">
          <div className={styles.demoBannerText}>
            <strong>Sample account</strong>
            <span>
              {persistenceAvailable
                ? "Choices stay in this browser tab. Nothing is sent, booked, or applied for outside the demo."
                : "Browser storage is unavailable, so choices last until refresh. Nothing leaves the demo."}
            </span>
          </div>
          <div className={styles.demoBannerActions}>
            <button type="button" className={styles.bannerButton} onClick={resetWalkthrough}>
              Reset
            </button>
            <Link className={styles.bannerLink} href="/for-seekers">
              Exit
            </Link>
          </div>
          <span className={styles.srOnly} aria-live="polite">{resetNotice}</span>
        </div>
        {children}
      </SeekerShell>
    </div>
  );
}

export function DemoSeekerShell({ children }: { readonly children: ReactNode }) {
  return (
    <DemoSeekerSessionProvider>
      <DemoShellContent>{children}</DemoShellContent>
    </DemoSeekerSessionProvider>
  );
}
