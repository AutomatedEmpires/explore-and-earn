"use client";

import { useEffect, useState } from "react";

import { Icon } from "@explore-and-earn/ui";

import { FunnelLink } from "../analytics/FunnelEvents";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics/events";
import styles from "./HostActivationBanner.module.css";

/**
 * The prospect host's activation banner (commercial redesign D6 / D7).
 *
 * Migration 086 lets a signed-in account create a host workspace with no plan.
 * That host can build, preview and draft; what they cannot do is publish. This
 * is the one place the product says so before they hit it.
 *
 * THE TONE IS THE REQUIREMENT, not a nicety. The founder's conversion principle
 * is that the host builds, previews, understands and DESIRES the product before
 * billing becomes the gate. A banner that nags defeats the thing it is there to
 * serve, so:
 *
 *   * it states what is true and what is next, and asks for nothing else;
 *   * it is DISMISSIBLE — a host who has read it can put it away;
 *   * dismissal is per SESSION, not permanent. It returns on the next visit,
 *     because a workspace that can never publish and never says so again is a
 *     dead end dressed up as a product. sessionStorage is what makes "dismissed"
 *     mean "not right now" rather than "never";
 *   * it is NOT a modal, NOT a popup, and does NOT trap focus. It sits in the
 *     shell above the content and the host may ignore it indefinitely.
 *
 * A LAPSED host never sees this. They have a subscription in trouble, not an
 * absent one, and /host/billing already speaks to them — see hostAccountState.
 */

const DISMISS_KEY = "ee.host.activation-banner.dismissed.v1";

export interface HostActivationBannerProps {
  /**
   * Rendered only for `prospect`. Passed rather than derived so the state is
   * decided once, on the server, from the subscription authority.
   */
  readonly accountState: string | null | undefined;
  /**
   * Element id for the anchored coachmark (D19).
   *
   * On the BANNER, not on a wrapper in the shell. This component returns null
   * for every state but `prospect` — and for a prospect who dismissed it — so a
   * wrapper carrying the id would leave a zero-height element for the coachmark
   * to find and point at. An id that only exists when the thing exists is the
   * only version that cannot mislead.
   */
  readonly id?: string;
}

export function HostActivationBanner({ accountState, id }: HostActivationBannerProps) {
  // Starts hidden and is revealed by the effect below. Rendering it during SSR
  // and removing it on hydration would flash the banner at a host who dismissed
  // it a minute ago, which is exactly the nagging this is meant to avoid.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (accountState !== "prospect") return;
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      // Private mode or storage disabled. Showing the banner is the honest
      // default — the host still cannot publish.
    }
    setVisible(true);
  }, [accountState]);

  function dismiss() {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // The dismissal still applies for this render.
    }
    setVisible(false);
  }

  if (accountState !== "prospect" || !visible) return null;

  return (
    <aside className={styles.banner} aria-label="Plan activation" id={id}>
      <span className={styles.icon} aria-hidden>
        <Icon name="system.info" size={20} />
      </span>
      <p className={styles.copy}>
        Your workspace is ready. Activate a plan when you want to publish and
        begin recruiting.
      </p>
      <FunnelLink
        event={HOST_FUNNEL_EVENTS.activationBannerClicked}
        href="/host/plans"
        className={styles.cta}
      >
        See plans
      </FunnelLink>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismiss}
        aria-label="Dismiss until next visit"
      >
        <Icon name="action.close" size={16} aria-hidden />
      </button>
    </aside>
  );
}
