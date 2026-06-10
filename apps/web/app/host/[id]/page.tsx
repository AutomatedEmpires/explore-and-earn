import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getPublicHostProfile, getPublicListingsByHost } from "@explore-and-earn/db";
import { VerifiedHostBadge, Icon } from "@explore-and-earn/ui";

import { PublicListingCard } from "../../../components/host/PublicListingCard";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

const CATEGORY_LABEL: Record<string, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Multi-category",
};

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const host = await getPublicHostProfile(id);

  if (!host) return { title: "Host not found" };

  const tagline = host.tagline ?? host.about?.slice(0, 100);
  const title = `${host.companyName} · Explore & Earn`;
  const description = tagline
    ? tagline.slice(0, 155)
    : `View open opportunities from ${host.companyName} on Explore & Earn.`;

  const canonical = `${baseUrl}/host/${id}`;
  const ogImage = host.photoUrl ?? `${baseUrl}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
      images: [{ url: ogImage, width: 1200, height: 630, alt: host.companyName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function PublicHostProfilePage({ params }: Props) {
  const { id } = await params;
  const [host, listings] = await Promise.all([
    getPublicHostProfile(id),
    getPublicListingsByHost(id),
  ]);

  if (!host) notFound();

  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;

  const verified = host.attestationStatus === "attested";
  const hasListings = listings.length > 0;

  return (
    <main className={styles.page}>
      {/* ── Hero band ───────────────────────────────────────────── */}
      <section className={styles.hero}>
        {/* Profile photo */}
        <div className={styles.heroAvatar}>
          {host.photoUrl ? (
            <div className={styles.avatarFrame}>
              <Image
                src={host.photoUrl}
                alt={host.companyName}
                fill
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
          ) : (
            <div className={styles.avatarPlaceholder}>
              <Icon name="nav.profile" size={24} aria-hidden />
            </div>
          )}
        </div>

        {/* Identity block */}
        <div className={styles.heroIdentity}>
          <div className={styles.heroNameRow}>
            <h1 className={styles.heroName}>{host.companyName}</h1>
            {verified && <VerifiedHostBadge />}
          </div>

          {host.hostName ? (
            <p className={styles.heroHostName}>Hosted by {host.hostName}</p>
          ) : null}

          {host.tagline ? (
            <p className={styles.heroTagline}>{host.tagline}</p>
          ) : null}

          <div className={styles.heroPills}>
            {host.primaryLocationName ? (
              <span className={styles.heroPill}>
                <Icon name="nav.map" size={16} aria-hidden />
                {host.primaryLocationName}
              </span>
            ) : null}
            {hostingSinceYear ? (
              <span className={styles.heroPill}>
                <Icon name="status.open" size={16} aria-hidden />
                Hosting since {hostingSinceYear}
              </span>
            ) : null}
            {hasListings ? (
              <span className={styles.heroPill}>
                <Icon name="category.mix" size={16} aria-hidden />
                {listings.length} open {listings.length === 1 ? "opportunity" : "opportunities"}
              </span>
            ) : null}
          </div>

          {/* Category scopes */}
          {host.categoryScopes.length > 0 ? (
            <div className={styles.heroCategoryScopes}>
              {host.categoryScopes.map((scope) => (
                <span key={scope} className={styles.categoryChip}>
                  {CATEGORY_LABEL[scope] ?? scope}
                </span>
              ))}
            </div>
          ) : null}

          {/* Benefit signals */}
          {(host.housingOfferedGenerally || host.mealsOfferedGenerally) ? (
            <div className={styles.benefitChips}>
              {host.housingOfferedGenerally ? (
                <span className={styles.benefitChip}>
                  <Icon name="category.seasonal" size={16} aria-hidden />
                  Housing offered
                </span>
              ) : null}
              {host.mealsOfferedGenerally ? (
                <span className={styles.benefitChip}>
                  <Icon name="category.farm" size={16} aria-hidden />
                  Meals offered
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Social links */}
        <div className={styles.heroLinks}>
          {host.websiteUrl ? (
            <a
              className={styles.socialLink}
              href={host.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${host.companyName} website`}
            >
              <Icon name="action.forward" size={16} aria-hidden />
              <span>Website</span>
            </a>
          ) : null}
          {host.socialLinks.instagram ? (
            <a
              className={styles.socialLink}
              href={`https://instagram.com/${host.socialLinks.instagram.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
            >
              <Icon name="action.share" size={16} aria-hidden />
              <span>Instagram</span>
            </a>
          ) : null}
          {host.socialLinks.twitter ? (
            <a
              className={styles.socialLink}
              href={`https://x.com/${host.socialLinks.twitter.replace(/^@/, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
            >
              <Icon name="action.share" size={16} aria-hidden />
              <span>X</span>
            </a>
          ) : null}
        </div>
      </section>

      {/* ── Content grid ────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* About */}
        {host.about ? (
          <section className={styles.aboutSection} aria-labelledby="about-heading">
            <h2 id="about-heading" className={styles.sectionHeading}>
              About
            </h2>
            <div className={styles.aboutCard}>
              <p className={styles.aboutText}>{host.about}</p>
            </div>
          </section>
        ) : null}

        {/* Open opportunities */}
        <section aria-labelledby="listings-heading">
          <div className={styles.listingsHead}>
            <h2 id="listings-heading" className={styles.sectionHeading}>
              Open opportunities
            </h2>
            <Link className={styles.seekLink} href="/seek">
              Browse all
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>

          {hasListings ? (
            <div className={styles.listingsGrid}>
              {listings.map((listing) => (
                <PublicListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          ) : (
            <div className={styles.emptyListings}>
              <span className={styles.emptyIcon}>
                <Icon name="category.mix" size={24} aria-hidden />
              </span>
              <p className={styles.emptyTitle}>No open opportunities right now</p>
              <p className={styles.emptyNote}>Check back soon or browse other hosts.</p>
              <Link className={styles.seekLink} href="/seek">
                Explore all listings
                <Icon name="action.forward" size={16} aria-hidden />
              </Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
