import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

import {
  getListingDetailPublic,
  getHostProfile,
  getSeekerProfile,
  hasApplied,
  hasSaved,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";
import { CategoryBadge } from "../../../components/listing/CategoryBadge";
import { HostSummaryBlock } from "../../../components/listing/HostSummaryBlock";
import { VerifiedHostBadge } from "@explore-and-earn/ui";
import { ApplyButton } from "./ApplyButton";
import { generateJobPostingJsonLd, generateBreadcrumbJsonLd } from "../../../lib/seo";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await getListingDetailPublic(id);

  if (!listing) {
    return { title: "Listing not found" };
  }

  const title = `${listing.title} — ${listing.host?.companyName ?? "Explore & Earn"} · Explore & Earn`;
  const description = listing.description
    ? listing.description.slice(0, 155)
    : `${listing.title} opportunity at ${listing.host?.companyName ?? "a host organization"}. Housing ${listing.housingIncluded ? "included" : "not included"}, meals ${listing.mealsIncluded ? "included" : "not included"}.`;

  const canonical = `${baseUrl}/listing/${listing.id}`;
  const ogImage = listing.coverPhotoUrl ?? `${baseUrl}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630, alt: listing.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params;
  const listing = await getListingDetailPublic(id);

  if (!listing) notFound();

  const { userId, getToken } = await auth();
  const token = userId ? await getToken({ template: "supabase" }) : null;

  // Determine viewer role and ownership
  let viewerRole: "guest" | "seeker" | "owner" = "guest";
  let isOwner = false;

  if (userId && token) {
    try {
      const hostProfile = await getHostProfile(token, userId);
      isOwner = hostProfile?.id === listing.hostProfileId;
      viewerRole = isOwner ? "owner" : "seeker";
    } catch {
      // Transient DB failure on host-profile lookup — authenticated user stays
      // as seeker rather than crashing the page. The visibility guard below
      // still protects draft listings since isOwner remains false.
      viewerRole = "seeker";
    }
  }

  // Visibility rule: non-live listings are only shown to the owning host
  if (listing.status !== "live" && !isOwner) notFound();

  // Fetch seeker-specific state (applied/saved/onboarding) when authed
  let alreadyApplied = false;
  let alreadySaved = false;
  let onboardingComplete = false;

  if (userId && token && viewerRole === "seeker") {
    const [applied, saved, seekerProfile] = await Promise.all([
      hasApplied(token, userId, listing.id),
      hasSaved(token, userId, listing.id),
      getSeekerProfile(token, userId),
    ]);
    alreadyApplied = applied;
    alreadySaved = saved;
    onboardingComplete = seekerProfile?.onboardingComplete === true;
  }

  // Build benefit triad data
  const housingLabel = listing.housingIncluded ? "Included" : "Not included";
  const mealsLabel = listing.mealsIncluded ? "Included" : "Not included";
  const paySummary =
    listing.compensationSummary ??
    (listing.compensationMinCents != null
      ? `${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: listing.compensationCurrency,
          maximumFractionDigits: 0,
        }).format(listing.compensationMinCents / 100)}${listing.compensationUnit && listing.compensationUnit !== "other" ? `/${listing.compensationUnit}` : ""}`
      : "See listing");

  const dateLabel =
    listing.beginsAt && listing.endsAt
      ? `${new Date(listing.beginsAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })} – ${new Date(listing.endsAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
      : listing.beginsAt
        ? `Starting ${new Date(listing.beginsAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
        : "Ongoing";

  const jsonLd = generateJobPostingJsonLd(listing, listing.host, baseUrl);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: "Explore & Earn", url: baseUrl },
    ...(listing.host
      ? [{ name: listing.host.companyName, url: `${baseUrl}/host/${listing.host.id}` }]
      : []),
    { name: listing.title, url: `${baseUrl}/listing/${listing.id}` },
  ]);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
      />
      <main className={styles.page}>
        {/* Cover photo */}
        {listing.coverPhotoUrl && (
          <div className={styles.cover}>
            <Image
              src={listing.coverPhotoUrl}
              alt={listing.title}
              fill
              className={styles.fillImg}
              priority
            />
          </div>
        )}

        {/* Gallery photos */}
        {listing.galleryPhotoUrls.length > 0 && (
          <div className={styles.gallery}>
            {listing.galleryPhotoUrls.map((url, idx) => (
              <div key={url} className={styles.galleryThumb}>
                <Image
                  src={url}
                  alt={`${listing.title} photo ${idx + 1}`}
                  fill
                  className={styles.fillImg}
                  sizes="120px"
                />
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className={styles.content}>
          {/* Category badge */}
          <div className={styles.categoryBadge}>
            <CategoryBadge category={listing.category} />
          </div>

          {/* Title */}
          <h1 className={styles.title}>{listing.title}</h1>

          {/* Location */}
          {listing.locationDisplay && (
            <div className={styles.location}>
              <Icon name="nav.map" size={16} aria-hidden />
              <span>{listing.locationDisplay}</span>
            </div>
          )}

          {/* Host bar */}
          {listing.host && (
            <div className={styles.hostBar}>
              {listing.host.photoUrl && (
                <div className={styles.hostAvatar}>
                  <Image
                    src={listing.host.photoUrl}
                    alt={listing.host.companyName}
                    fill
                    className={styles.fillImg}
                    sizes="48px"
                  />
                </div>
              )}
              <div className={styles.hostInfo}>
                <div className={styles.hostNameRow}>
                  <Link
                    href={`/host/${listing.host.id}`}
                    className={styles.hostName}
                  >
                    {listing.host.companyName}
                  </Link>
                  {listing.host.attestationStatus === "attested" && (
                    <VerifiedHostBadge />
                  )}
                </div>
                <div className={styles.hostDate}>{dateLabel}</div>
              </div>
            </div>
          )}

          {/* Benefit triad */}
          <div className={styles.triad}>
            <div className={`${styles.triadCell} ${styles.triadCellHousing}`}>
              <div className={styles.triadHeader}>
                <Icon name="benefit.housing" size={16} aria-hidden />
                <span className={styles.triadLabel}>Housing</span>
              </div>
              <div className={styles.triadValue}>{housingLabel}</div>
            </div>

            <div className={`${styles.triadCell} ${styles.triadCellMeals}`}>
              <div className={styles.triadHeader}>
                <Icon name="benefit.meals" size={16} aria-hidden />
                <span className={styles.triadLabel}>Meals</span>
              </div>
              <div className={styles.triadValue}>{mealsLabel}</div>
            </div>

            <div className={`${styles.triadCell} ${styles.triadCellPay}`}>
              <div className={styles.triadHeader}>
                <Icon name="benefit.pay" size={16} aria-hidden />
                <span className={styles.triadLabel}>Pay</span>
              </div>
              <div className={styles.triadValue}>{paySummary}</div>
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <section className={styles.description} aria-labelledby="listing-description">
              <h2 id="listing-description" className={styles.descriptionHeading}>
                About this opportunity
              </h2>
              <div className={styles.descriptionBody}>
                {listing.description.split("\n\n").map((para, idx) => (
                  <p key={idx}>{para}</p>
                ))}
              </div>
            </section>
          )}

          {/* Host summary block */}
          {listing.host && (
            <div className={styles.hostSummaryWrapper}>
              <HostSummaryBlock
                host={{
                  id: listing.host.id,
                  name: listing.host.companyName,
                  location: listing.host.primaryLocationName ?? undefined,
                  verified:
                    listing.host.attestationStatus === "attested",
                  tagline: listing.host.about ?? undefined,
                  avatar: listing.host.photoUrl
                    ? {
                        masterPath: listing.host.photoUrl,
                        width: 120,
                        height: 120,
                        alt: listing.host.companyName,
                      }
                    : undefined,
                }}
              />
            </div>
          )}
        </div>

        {/* Sticky action bar */}
        <div className={styles.actionBar}>
          <ApplyButton
            listingId={listing.id}
            title={listing.title}
            viewerRole={viewerRole}
            alreadyApplied={alreadyApplied}
            alreadySaved={alreadySaved}
            onboardingComplete={onboardingComplete}
          />
        </div>
      </main>
    </>
  );
}
