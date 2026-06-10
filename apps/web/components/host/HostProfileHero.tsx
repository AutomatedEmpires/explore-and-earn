import Image from "next/image";
import type { PublicHostProfile } from "@explore-and-earn/db";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import styles from "./HostProfileHero.module.css";

export interface HostProfileHeroProps {
  readonly host: PublicHostProfile;
  readonly coverPhotoUrl: string | null;
  readonly listingCount: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Multi-category",
};

type CatIcon =
  | "category.farm"
  | "category.maritime"
  | "category.remote"
  | "category.seasonal"
  | "category.mix";

function catIcon(scope: string): CatIcon {
  const map: Record<string, CatIcon> = {
    farm: "category.farm",
    maritime: "category.maritime",
    remote: "category.remote",
    seasonal: "category.seasonal",
    mix: "category.mix",
  };
  return map[scope] ?? "category.mix";
}

export function HostProfileHero({
  host,
  coverPhotoUrl,
  listingCount,
}: HostProfileHeroProps) {
  const verified = host.attestationStatus === "attested";
  const hasListings = listingCount > 0;
  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;

  return (
    <header className={styles.hero}>
      {/* ── Cover band ── */}
      <div className={styles.cover} role="presentation">
        {coverPhotoUrl ? (
          <Image
            src={coverPhotoUrl}
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.coverImg}
          />
        ) : (
          <div className={styles.coverFallback} />
        )}
        <div className={styles.coverScrim} />
      </div>

      {/* ── Identity row — overlaps cover ── */}
      <div className={styles.identity}>
        {/* Avatar */}
        <div className={styles.avatarCol}>
          <div className={styles.avatarRing}>
            {host.photoUrl ? (
              <div className={styles.avatarFrame}>
                <Image
                  src={host.photoUrl}
                  alt={host.companyName}
                  fill
                  className={styles.avatarImg}
                />
              </div>
            ) : (
              <div className={styles.avatarPlaceholder}>
                <Icon name="nav.profile" size={24} aria-hidden />
              </div>
            )}
          </div>
        </div>

        {/* Identity body */}
        <div className={styles.identityBody}>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{host.companyName}</h1>
            {verified && <VerifiedHostBadge />}
          </div>

          {host.hostName ? (
            <p className={styles.hostedBy}>Hosted by {host.hostName}</p>
          ) : null}

          <div className={styles.statusRow}>
            {hasListings ? (
              <span className={styles.hiringBadge}>
                <Icon name="status.open" size={16} aria-hidden />
                {listingCount === 1 ? "1 opening" : `${listingCount} openings`}
              </span>
            ) : (
              <span className={styles.closedBadge}>
                <Icon name="status.ends" size={16} aria-hidden />
                No openings
              </span>
            )}

            {host.primaryLocationName ? (
              <span className={styles.locationPill}>
                <Icon name="nav.map" size={16} aria-hidden />
                {host.primaryLocationName}
              </span>
            ) : null}

            {hostingSinceYear ? (
              <span className={styles.sincePill}>Since {hostingSinceYear}</span>
            ) : null}
          </div>

          {host.tagline ? (
            <p className={styles.tagline}>{host.tagline}</p>
          ) : null}

          {host.categoryScopes.length > 0 ? (
            <div className={styles.categories}>
              {host.categoryScopes.map((scope) => (
                <span key={scope} className={styles.categoryChip}>
                  <Icon name={catIcon(scope)} size={16} aria-hidden />
                  {CATEGORY_LABEL[scope] ?? scope}
                </span>
              ))}
            </div>
          ) : null}

          {(host.housingOfferedGenerally || host.mealsOfferedGenerally) ? (
            <div className={styles.benefitSignals}>
              {host.housingOfferedGenerally ? (
                <span className={styles.benefitHousing}>
                  <Icon name="category.seasonal" size={16} aria-hidden />
                  Housing offered
                </span>
              ) : null}
              {host.mealsOfferedGenerally ? (
                <span className={styles.benefitMeals}>
                  <Icon name="category.farm" size={16} aria-hidden />
                  Meals provided
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* CTAs + social */}
        <div className={styles.ctaCol}>
          {hasListings ? (
            <a href="#listings" className={styles.ctaPrimary}>
              View listings
              <Icon name="action.forward" size={16} aria-hidden />
            </a>
          ) : null}

          <div className={styles.socialLinks}>
            {host.websiteUrl ? (
              <a
                href={host.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialLink}
                aria-label={`${host.companyName} website`}
              >
                <Icon name="action.forward" size={16} aria-hidden />
                Website
              </a>
            ) : null}
            {host.socialLinks.instagram ? (
              <a
                href={`https://instagram.com/${host.socialLinks.instagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialLink}
                aria-label="Instagram"
              >
                <Icon name="action.share" size={16} aria-hidden />
                Instagram
              </a>
            ) : null}
            {host.socialLinks.twitter ? (
              <a
                href={`https://x.com/${host.socialLinks.twitter.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.socialLink}
                aria-label="X (Twitter)"
              >
                <Icon name="action.share" size={16} aria-hidden />
                X
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
