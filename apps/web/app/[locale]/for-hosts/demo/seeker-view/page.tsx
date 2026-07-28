import {
  DemoSeekerPreview,
  DemoSurfaceHeader,
} from "../../../../../components/demo";
import styles from "../../../../../components/demo/demoChrome.module.css";

/**
 * Demo workspace — "View this experience as a seeker" (spec D20).
 *
 * The same records the host side reads, rendered by the seeker-facing
 * production components: HostProfileHero, PublicListingCard, and the canonical
 * DiscoveryCard. There is no second copy of the profile or the card anywhere in
 * this route — a preview that redraws the product is a promise about it rather
 * than a look at it.
 */
export default function DemoSeekerViewPage() {
  return (
    <div className={styles.surface}>
      <DemoSurfaceHeader
        surfaceId="seeker"
        eyebrow="Seeker preview"
        title="See exactly what a seeker sees"
        lede="Your employer profile and your live roles, rendered by the components a real seeker meets in Seek, Swipe and Map. Nothing is redrawn for this page, so there is no gap between the preview and the thing itself."
      />

      <DemoSeekerPreview id="tour-seeker-preview" />
    </div>
  );
}
