import Image from "next/image";
import Link from "next/link";

import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import { CategoryBadge } from "./CategoryBadge";
import { ListingBackButton } from "./ListingBackButton";
import styles from "./ListingHero.module.css";

export interface ListingHeroHost {
  readonly id: string;
  readonly companyName: string;
  readonly photoUrl: string | null;
  readonly verified: boolean;
}

export interface ListingHeroProps {
  readonly title: string;
  readonly category: OpportunityCategory;
  readonly locationDisplay: string | null;
  readonly coverPhotoUrl: string | null;
  readonly host: ListingHeroHost | null;
  /** Human date/season line, e.g. "Jun 2026 – Sep 2026". */
  /**
   * The opportunity window, or null when the host stated no dates at all. The
   * hero is a headline, not a facts table: with nothing to say it shows no
   * chip rather than a "Not stated" placeholder (the at-a-glance grid below
   * carries that). Never pass an invented value here.
   */
  readonly dateLabel: string | null;
  /**
   * The written lede (composeListingLede) — a sentence built from the same
   * real state the page renders, so headline and page can never disagree.
   */
  readonly lede: string;
}

/**
 * Immersive photo hero — the emotional "look, I'm headed here" opener. A
 * full-bleed cover photo carries a legibility scrim with the title, category,
 * location, and verified host overlaid; the back control floats top-left.
 * Without a cover photo the hero drops to a COMPACT band on the category
 * atmosphere gradient (data-cover="none") — an absent photo must never cost
 * the reader a viewport of empty gradient.
 */
export function ListingHero({
  title,
  category,
  locationDisplay,
  coverPhotoUrl,
  host,
  dateLabel,
  lede,
}: ListingHeroProps) {
  return (
    <header
      className={styles.hero}
      data-category={category}
      data-cover={coverPhotoUrl ? "photo" : "none"}
    >
      {coverPhotoUrl ? (
        <Image
          src={coverPhotoUrl}
          alt={title}
          fill
          priority
          className={styles.image}
          sizes="100vw"
        />
      ) : null}

      <div className={styles.scrim} aria-hidden />

      <div className={styles.topBar}>
        <ListingBackButton />
      </div>

      <div className={styles.overlay}>
        <div className={styles.badgeRow}>
          <CategoryBadge category={category} />
          {dateLabel ? (
            <span className={styles.dateChip}>
              <Icon name="status.begins" size={16} aria-hidden />
              <span>{dateLabel}</span>
            </span>
          ) : null}
        </div>

        <h1 className={styles.title}>
          {title}
          {/* Decorative gold full-stop (Basecamp idiom) — aria-hidden so the
              accessible name stays the bare title (e2e pins match on it). */}
          <span className={styles.titleMark} aria-hidden>
            .
          </span>
        </h1>

        <p className={styles.lede}>{lede}</p>

        <div className={styles.metaRow}>
          {locationDisplay ? (
            <span className={styles.location}>
              <Icon name="nav.map" size={16} aria-hidden />
              <span>{locationDisplay}</span>
            </span>
          ) : null}

          {host ? (
            <span className={styles.host}>
              {host.photoUrl ? (
                <span className={styles.hostAvatar}>
                  <Image
                    src={host.photoUrl}
                    alt={host.companyName}
                    fill
                    className={styles.hostAvatarImg}
                    sizes="32px"
                  />
                </span>
              ) : null}
              {host.id ? (
                <Link href={`/host/${host.id}`} className={styles.hostName}>
                  {host.companyName}
                </Link>
              ) : (
                <span className={styles.hostName}>{host.companyName}</span>
              )}
              {host.verified ? <VerifiedHostBadge /> : null}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
