"use client";

import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { HOST_FUNNEL_EVENTS, captureEvent } from "../../lib/analytics";
import { TourLauncher } from "./ProductTour";
import { useDemoSession } from "./DemoSession";
import { DEMO_SEEKER_VIEW_HREF } from "./enterpriseDemo";
import styles from "./demoChrome.module.css";

/**
 * The demo workspace toolbar: tour, seeker preview, and reset.
 *
 * RESET IS ALWAYS PRESENT, not only after something has been moved. A visitor
 * who has been clicking around needs to know the state they are looking at can
 * be put back before they start clicking, otherwise the safe move is not to
 * touch anything — which defeats an interactive demo. The button reports how
 * many candidates have been moved so the offer is concrete.
 */
export function DemoToolbar() {
  const session = useDemoSession();

  return (
    <div className={styles.toolbar}>
      <TourLauncher />

      <Link
        className={styles.seekerLink}
        href={DEMO_SEEKER_VIEW_HREF}
        onClick={() =>
          captureEvent(HOST_FUNNEL_EVENTS.demoViewAsSeeker, { from: "toolbar" })
        }
      >
        <Icon name="nav.seek" size={16} aria-hidden />
        View this experience as a seeker
      </Link>

      <span className={styles.toolbarSpacer} />

      <p className={styles.toolbarNote}>
        {session.movedCount > 0
          ? `${session.movedCount} ${session.movedCount === 1 ? "candidate" : "candidates"} moved in this tab only.`
          : "Anything you change here stays in this tab and is never saved."}
      </p>

      <button
        type="button"
        className={styles.resetButton}
        onClick={session.reset}
        disabled={session.movedCount === 0}
      >
        <Icon name="action.back" size={16} aria-hidden />
        Reset demo
      </button>
    </div>
  );
}
