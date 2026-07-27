import { CaptureOnMount } from "../analytics/CaptureOnMount";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics";
import { ProductTour } from "./ProductTour";
import styles from "./demoChrome.module.css";

export interface DemoSurfaceHeaderProps {
  /** A DEMO_SURFACES id — also the DEMO_TOUR key and the analytics property. */
  readonly surfaceId: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lede: string;
  /** Element id the first tour stop points at. */
  readonly id?: string;
}

/**
 * The head of every demo surface: eyebrow, page title, lede, tour launcher —
 * and the one funnel event for this surface. Keeping the event here means a new
 * demo page cannot forget to report itself.
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
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.pageTitle}>{title}</h1>
      <p className={styles.lede}>{lede}</p>
      <ProductTour surfaceId={surfaceId} />
    </header>
  );
}
