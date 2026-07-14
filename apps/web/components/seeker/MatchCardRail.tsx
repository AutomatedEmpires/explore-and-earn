"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

import { Icon } from "@explore-and-earn/ui";
import {
  ListingCard,
  ListingCardProvider,
  type DiscoveryListing,
} from "../discovery";
import styles from "./MatchCardRail.module.css";

export interface MatchCardRailProps {
  readonly listings: readonly DiscoveryListing[];
  readonly title?: string;
}

/**
 * MatchCardRail — a horizontally scrolling rail of matched / boosted
 * opportunities. The rail is only the shell (heading, "See all", snap-scroll
 * track, honest empty state); every card is now the SINGLE canonical
 * DiscoveryCard rendered through the shared <ListingCard> wrapper, so each card
 * gets the Housing/Meals/Pay triad, the Quick Peek / Host / Benefit / Pay /
 * Report popups, the numeric match % pill (stored score ≥ threshold), and the
 * boosted marker — all for free, from ONE shared popup host per rail.
 *
 * The bespoke MatchCard / ScoreBand / "why this matched" reason chips were
 * removed: relevance is now shown by the card itself (match pill on the
 * "matched" surface), never a parallel card implementation.
 */

function EmptyState() {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>No matches yet</p>
      <p className={styles.emptyBody}>
        Complete your resume to unlock personalized matches.
      </p>
      <Link href="/resume" className={styles.emptyLink}>
        Build resume
      </Link>
    </div>
  );
}

export function MatchCardRail({ listings, title = "Matched for You" }: MatchCardRailProps) {
  return (
    <section className={styles.section} aria-label={title}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {listings.length > 0 && (
          <Link href="/seek" className={styles.seeAll}>
            See all
            <Icon name="action.forward" size={16} />
          </Link>
        )}
      </div>

      {listings.length === 0 ? (
        <EmptyState />
      ) : (
        // ONE shared popup host for the whole rail (Quick Peek / Host / Benefit /
        // Pay / Report), exactly like the discovery feed — never one host per card.
        <ListingCardProvider listings={listings}>
          <div className={styles.rail} role="list">
            {listings.map((listing, index) => (
              <div
                key={listing.id}
                role="listitem"
                className={styles.railItem}
                // Constrain each canonical card to a rail-cell width so the next
                // card always peeks (signalling the rail scrolls); the card fills
                // this up to its own 360px cap.
                style={{ "--i": index, width: "min(84vw, 300px)" } as CSSProperties}
              >
                <ListingCard
                  listing={listing}
                  surface="matched"
                  cardState="matched"
                  imageLoading={index < 2 ? "eager" : "lazy"}
                  // Rail cards are scannable + tap-to-popup; the seeker decision
                  // bar (Skip/Apply/Save) belongs on the full browse surfaces, so
                  // suppress the CTA slot here (empty fragment = no CTA).
                  actions={<></>}
                />
              </div>
            ))}
          </div>
        </ListingCardProvider>
      )}
    </section>
  );
}
