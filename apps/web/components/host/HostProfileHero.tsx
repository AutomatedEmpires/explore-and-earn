import Image from "next/image";
import type { PublicHostProfile } from "@explore-and-earn/db";
import { Icon, VerifiedHostBadge } from "@explore-and-earn/ui";

import { HostCoverLogoPicker } from "./HostCoverLogoPicker";
import styles from "./HostProfileHero.module.css";

export interface HostProfileHeroProps {
  readonly host: PublicHostProfile;
  readonly coverPhotoUrl: string | null;
  readonly listingCount: number;
  /**
   * When true, the owner is viewing their own profile — show the cover/logo
   * photo pickers. Defaults false so the public profile is unaffected.
   */
  readonly editable?: boolean;
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

function companyMonogram(companyName: string): string {
  const words = companyName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const initials = words.slice(0, 3).map((word) => word[0]?.toUpperCase() ?? "").join("");
  return initials || "HOST";
}

export function HostProfileHero({
  host,
  coverPhotoUrl,
  listingCount,
  editable = false,
}: HostProfileHeroProps) {
  const verified = host.verified;
  const hasListings = listingCount > 0;
  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;
  const primaryScope = host.categoryScopes[0] ?? "mix";

  return (
    <header
      className={styles.hero}
      data-has-cover={coverPhotoUrl ? "true" : "false"}
      data-category={primaryScope}
    >
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
          <div className={styles.coverFallback}>
            <span className={styles.fallbackMark}>
              <Icon name={catIcon(primaryScope)} size={24} aria-hidden />
              {CATEGORY_LABEL[primaryScope] ?? "Explore & Earn"} employer profile
            </span>
          </div>
        )}
        <div className={styles.coverScrim} />

        {/* Owner-only cover + logo photo pickers (cover ≠ logo) */}
        {editable ? (
          <HostCoverLogoPicker
            companyName={host.companyName}
            coverUrl={coverPhotoUrl}
            logoUrl={host.photoUrl}
          />
        ) : null}
      </div>

      {/* ── Identity row — overlaps cover ── */}
      <div className={styles.identity}>
        {/* Organization logo or generated monogram fallback. */}
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
              <div
                className={styles.avatarPlaceholder}
                role="img"
                aria-label={`${host.companyName} monogram`}
              >
                {companyMonogram(host.companyName)}
              </div>
            )}
          </div>
        </div>

        {/* Identity body */}
        <div className={styles.identityBody}>
          <p className={styles.eyebrow}>Employer field profile</p>
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{host.companyName}</h1>
            {verified && <VerifiedHostBadge />}
          </div>

          {host.hostName || host.primaryLocationName || hostingSinceYear ? (
            <ul className={styles.identityMeta}>
              {host.hostName ? <li>Led by {host.hostName}</li> : null}
              {host.primaryLocationName ? (
                <li><Icon name="nav.map" size={15} aria-hidden />{host.primaryLocationName}</li>
              ) : null}
              {hostingSinceYear ? <li>Since {hostingSinceYear}</li> : null}
            </ul>
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

        </div>

        {/* CTAs + social */}
        <div className={styles.ctaCol}>
          {hasListings ? (
            <a href="#listings" className={styles.ctaPrimary}>
              See opportunities
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
