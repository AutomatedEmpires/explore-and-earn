import Image from "next/image";

import styles from "./ListingGallery.module.css";

export interface ListingGalleryProps {
  readonly title: string;
  readonly photoUrls: readonly string[];
}

/**
 * Horizontally scrollable photo strip beneath the hero — "see more of where
 * you'd be". Renders nothing when there are no gallery photos, so the page never
 * shows an empty rail.
 */
export function ListingGallery({ title, photoUrls }: ListingGalleryProps) {
  if (photoUrls.length === 0) return null;

  return (
    // tabIndex=0 because this is a horizontal scroll container whose children
    // are all non-focusable images: without it a keyboard or switch user can
    // never scroll it and only ever sees the photos that happen to fit.
    <div
      className={styles.gallery}
      role="group"
      aria-label={`More photos of ${title}`}
      tabIndex={0}
    >
      {photoUrls.map((url, idx) => (
        <div key={`${idx}-${url}`} className={styles.thumb}>
          <Image
            src={url}
            alt={`${title} photo ${idx + 1}`}
            fill
            className={styles.image}
            sizes="(max-width: 640px) 45vw, 220px"
          />
        </div>
      ))}
    </div>
  );
}
