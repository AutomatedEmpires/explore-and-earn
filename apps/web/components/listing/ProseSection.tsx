import { type IconKey } from "@explore-and-earn/ui";

import { ListingSection } from "./ListingSection";
import styles from "./ProseSection.module.css";

export interface ProseSectionProps {
  readonly title: string;
  readonly icon: IconKey;
  readonly headingId: string;
  /** Free text; blank lines split into paragraphs. */
  readonly text: string;
}

/**
 * A titled prose block for the immersive detail page's narrative sections —
 * "About this position" (listing description) and "Why work with us" (host
 * narrative). Splits on blank lines into paragraphs; renders nothing when the
 * text is empty so callers can pass a possibly-blank field directly.
 */
export function ProseSection({ title, icon, headingId, text }: ProseSectionProps) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter((para) => para.length > 0);

  if (paragraphs.length === 0) return null;

  return (
    <ListingSection title={title} icon={icon} headingId={headingId}>
      <div className={styles.body}>
        {paragraphs.map((para, idx) => (
          <p key={idx}>{para}</p>
        ))}
      </div>
    </ListingSection>
  );
}
