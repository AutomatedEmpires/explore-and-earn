import { Icon, type IconKey } from "@explore-and-earn/ui";

import { ListingSection } from "./ListingSection";
import styles from "./DetailList.module.css";

export interface DetailListProps {
  readonly title: string;
  /** Heading glyph. */
  readonly icon: IconKey;
  /** Glyph rendered as each item's bullet marker. */
  readonly markerIcon: IconKey;
  readonly headingId: string;
  readonly items: readonly string[];
  readonly subtitle?: string;
  /**
   * Layout for the items: "list" (single column, checklist-style) or "chips"
   * (wrapping pills) — used for perks / activities that read better as tags.
   */
  readonly variant?: "list" | "chips";
}

/**
 * A titled list section shared by the immersive detail page's enumerated blocks
 * — "What you'll do" (responsibilities), "What we're looking for" (requirements),
 * "Perks & benefits" (perks), and "Life here" (activities). Renders nothing when
 * `items` is empty, so the caller can hand it a possibly-absent field directly.
 */
export function DetailList({
  title,
  icon,
  markerIcon,
  headingId,
  items,
  subtitle,
  variant = "list",
}: DetailListProps) {
  if (items.length === 0) return null;

  return (
    <ListingSection title={title} icon={icon} subtitle={subtitle} headingId={headingId}>
      <ul className={variant === "chips" ? styles.chips : styles.list}>
        {items.map((item, idx) => (
          <li key={`${idx}-${item}`} className={variant === "chips" ? styles.chip : styles.item}>
            <Icon name={markerIcon} size={variant === "chips" ? 14 : 18} aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </ListingSection>
  );
}
