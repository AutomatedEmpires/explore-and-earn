"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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
  const { persistenceAvailable, profile, readNotificationIds, reset } = useDemoSeekerSession();
  const [resetNotice, setResetNotice] = useState("");
  const router = useRouter();
  const unread = seekerDemoNotifications.filter(
    (notification) => !notification.read && !readNotificationIds.includes(notification.id),
  ).length;

  function resetWalkthrough() {
    reset();
    setResetNotice("Walkthrough choices reset to the starting sample account.");
    router.replace("/for-seekers/demo");
  }

  return (
    <div className="seeker-os">
      <SeekerShell
        seekerName={seekerDemoPerson.name}
        profileScore={profileReadiness(profile)}
        unread={unread}
        routeMap={SEEKER_DEMO_ROUTE_MAP}
        demoMode
      >
        <div className={styles.demoBanner} role="note" aria-label="Sample seeker account notice">
          <div className={styles.demoBannerText}>
            <strong>Interactive sample account</strong>
            <span>
              {persistenceAvailable
                ? "Choices stay in this browser tab. Nothing is sent, booked, or applied for outside the demo."
                : "Browser storage is unavailable, so choices last until refresh. Nothing leaves the demo."}
            </span>
          </div>
          <div className={styles.demoBannerActions}>
            <button type="button" className={styles.bannerButton} onClick={resetWalkthrough}>
              Reset demo
            </button>
            <Link className={styles.bannerLink} href="/for-seekers">
              Exit walkthrough
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
