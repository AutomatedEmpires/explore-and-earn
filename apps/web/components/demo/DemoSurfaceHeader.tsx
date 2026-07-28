import { CaptureOnMount } from "../analytics/CaptureOnMount";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics";
import styles from "./demoChrome.module.css";

export interface DemoSurfaceHeaderProps {
  /** A DEMO_SURFACES id — also the analytics property for this surface. */
  readonly surfaceId: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  /** Element id a tour stop may point at. */
  readonly id?: string;
}

/**
 * The head of every demo surface: eyebrow, page title, lede — and the two
 * funnel events for this surface. Keeping the events here means a new demo page
 * cannot forget to report itself.
 *
 * TWO EVENTS, NOT ONE. `host_demo_opened` answers the funnel question ("did the
 * demo get opened"), and `demo_surface_viewed` answers the product question
 * ("which surfaces did they actually walk"). Collapsing them would make the
 * second unanswerable, which is the whole reason the expanded workspace exists.
 *
 * The tour launcher is NOT rendered here any more: D19's tour is one ordered
 * walk across the workspace, launched from the toolbar in the layout, so a
 * per-page launcher would offer ten different entry points into the same route.
 */
export function DemoSurfaceHeader({
  surfaceId,
  eyebrow,
  title,
  lede,
  id,
}: DemoSurfaceHeaderProps) {
  return (
    <header className={styles.surfaceHead} id={id}>
      <CaptureOnMount
        event={HOST_FUNNEL_EVENTS.hostDemoOpened}
        properties={{ surface: surfaceId }}
      />
      <CaptureOnMount
        event={HOST_FUNNEL_EVENTS.demoSurfaceViewed}
        properties={{ surface: surfaceId }}
      />
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.pageTitle}>{title}</h1>
      <p className={styles.lede}>{lede}</p>
    </header>
  );
}
