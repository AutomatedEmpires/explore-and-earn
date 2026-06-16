import { Icon } from "@explore-and-earn/ui";

import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./StatusStrip.module.css";

export interface StatusStripProps {
  readonly status: SeekerStatusSummary;
}

/**
 * Adventure status strip — at-a-glance pipeline counts with hierarchy.
 * Built on the shared `ui-stat` primitive: the one number that matters leads
 * (Offers when you have one to act on; otherwise Resume readiness if it's low).
 */
export function StatusStrip({ status }: StatusStripProps) {
  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const hasOffers = status.offersCount > 0;

  // Resume leads (amber) only when it's the blocker and there's no offer to chase.
  const resumeMod = !resumeReady && !hasOffers ? "ui-stat--soon" : "";
  const offersMod = hasOffers ? "ui-stat--primary" : "";

  return (
    <ul className={styles.strip} aria-label="Adventure status">
      <li className={`ui-stat ${resumeMod}`}>
        <span className="ui-stat__label">
          <Icon name="nav.profile" size={16} aria-hidden /> Resume
        </span>
        <span className="ui-stat__value">{status.resumeCompletion}%</span>
      </li>
      <li className="ui-stat">
        <span className="ui-stat__label">
          <Icon name="nav.saved" size={16} aria-hidden /> Saved
        </span>
        <span className="ui-stat__value">{status.savedCount}</span>
      </li>
      <li className="ui-stat">
        <span className="ui-stat__label">
          <Icon name="action.apply" size={16} aria-hidden /> Applied
        </span>
        <span className="ui-stat__value">{status.appliedCount}</span>
      </li>
      <li className={`ui-stat ${offersMod}`}>
        <span className="ui-stat__label">
          <Icon name="status.match" size={16} aria-hidden /> Offers
        </span>
        <span className="ui-stat__value">{status.offersCount}</span>
      </li>
      <li className="ui-stat">
        <span className="ui-stat__label">
          <Icon name="category.seasonal" size={16} aria-hidden /> Upcoming
        </span>
        <span className="ui-stat__value">{status.acceptedUpcoming ?? "—"}</span>
      </li>
    </ul>
  );
}
