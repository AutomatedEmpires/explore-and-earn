import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { optionalAuth } from "../../../lib/optionalAuth";
import {
  getPublicListingsByHost,
  getHostRatingSummary,
  getHostReviews,
  getReviewableEngagementForHost,
} from "@explore-and-earn/db";
import { getPublicHostProfileCached } from "../../../lib/serverCache";
import { Icon } from "@explore-and-earn/ui";
import type { MarketplaceCategory } from "@explore-and-earn/contracts";

import { HostProfileHero } from "../../../components/host/HostProfileHero";
import { HostTrustBand } from "../../../components/host/HostTrustBand";
import { HostReviews } from "../../../components/host/HostReviews";
import { LeaveReview } from "../../../components/host/LeaveReview";
import { CategoryBadge } from "../../../components/listing/CategoryBadge";
import { generateBreadcrumbJsonLd } from "../../../lib/seo";
import { isUuid } from "../../../lib/ids";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  // host_profiles.id is a Postgres uuid — non-UUID params can't exist and
  // would throw 22P02 into the error boundary instead of 404ing.
  const host = isUuid(id) ? await getPublicHostProfileCached(id) : null;
  // notFound() (pre-stream) so dead host URLs carry a real 404 instead of a
  // soft-404 with fallback metadata — mirrors listing/[id].
  if (!host) notFound();

  const tagline = host.tagline ?? host.about?.slice(0, 100);
  const title = host.companyName;
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
    twitter: { card: "summary_large_image", title, description, images: [ogImage] },
  };
}

/* ── Section components (server-only, co-located for this route) ── */

const catIcons: Record<string, "category.farm" | "category.maritime" | "category.remote" | "category.seasonal" | "category.mix"> = {
  farm: "category.farm",
  maritime: "category.maritime",
  remote: "category.remote",
  seasonal: "category.seasonal",
  mix: "category.mix",
};

function QuickFacts({
  listingCount,
  housingOffered,
  mealsOffered,
  categoryScopes,
  hostingSinceYear,
}: {
  listingCount: number;
  housingOffered: boolean;
  mealsOffered: boolean;
  categoryScopes: string[];
  hostingSinceYear: number | null;
}) {
  const CATEGORY_LABEL: Record<string, string> = {
    farm: "Farm",
    maritime: "Maritime",
    remote: "Remote",
    seasonal: "Seasonal",
    mix: "Multi-category",
  };

  return (
    <div className={styles.factsStrip}>
      <div className={styles.facts}>
        {/* Listings count */}
        <div className={`${styles.fact} ${styles.factBlue}`}>
          <Icon name="status.open" size={16} aria-hidden />
          <div className={styles.factBody}>
            <span className={styles.factValue}>{listingCount}</span>
            <span className={styles.factLabel}>
              {listingCount === 1 ? "Listing" : "Listings"}
            </span>
          </div>
        </div>

        {/* Housing */}
        {housingOffered ? (
          <div className={`${styles.fact} ${styles.factGreen}`}>
            <Icon name="category.seasonal" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>Housing</span>
              <span className={styles.factLabel}>Included</span>
            </div>
          </div>
        ) : null}

        {/* Meals */}
        {mealsOffered ? (
          <div className={`${styles.fact} ${styles.factOrange}`}>
            <Icon name="category.farm" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>Meals</span>
              <span className={styles.factLabel}>Provided</span>
            </div>
          </div>
        ) : null}

        {/* Category chips */}
        {categoryScopes.map((scope) => (
          <div key={scope} className={`${styles.fact} ${styles.factCategory}`}>
            <Icon name={catIcons[scope] ?? "category.mix"} size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>{CATEGORY_LABEL[scope] ?? scope}</span>
              <span className={styles.factLabel}>Category</span>
            </div>
          </div>
        ))}

        {/* Hosting since */}
        {hostingSinceYear ? (
          <div className={`${styles.fact} ${styles.factMuted}`}>
            <Icon name="status.begins" size={16} aria-hidden />
            <div className={styles.factBody}>
              <span className={styles.factValue}>{hostingSinceYear}</span>
              <span className={styles.factLabel}>Member since</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AboutSection({ about }: { about: string }) {
  return (
    <section className={styles.section} aria-labelledby="about-heading">
      <h2 id="about-heading" className={styles.sectionHeading}>
        About
      </h2>
      <div className={styles.aboutCard}>
        <p className={styles.aboutText}>{about}</p>
      </div>
    </section>
  );
}

function ListingsSection({
  listings,
}: {
  listings: Array<{
    id: string;
    title: string;
    category: string;
    coverPhotoUrl: string | null;
    locationDisplay: string | null;
    housingIncluded: boolean;
    mealsIncluded: boolean;
    compensationSummary: string | null;
    compensationMinCents: number | null;
    compensationMaxCents: number | null;
    compensationUnit: string | null;
    compensationCurrency: string;
    publishedAt: string | null;
  }>;
}) {
  const hasListings = listings.length > 0;
  return (
    <section id="listings" className={styles.section} aria-labelledby="listings-heading">
      <div className={styles.sectionHead}>
        <h2 id="listings-heading" className={styles.sectionHeading}>
          Open opportunities
        </h2>
        <Link className={styles.browseCta} href="/seek">
          Browse all
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>

      {hasListings ? (
        <div className={styles.listingsGrid}>
          {listings.map((listing) => (
            <article key={listing.id} className={styles.listingArticle}>
              {/* Category band */}
              <Link href={`/listing/${listing.id}`} className={styles.listingLink}>
                {listing.coverPhotoUrl ? (
                  <div className={styles.listingCover}>
                    <Image
                      src={listing.coverPhotoUrl}
                      alt={listing.title}
                      fill
                      sizes="(min-width: 960px) 50vw, (min-width: 480px) 50vw, 100vw"
                      className={styles.listingCoverImg}
                    />
                  </div>
                ) : (
                  <div className={styles.listingCoverEmpty}>
                    <Icon name={catIcons[listing.category] ?? "category.mix"} size={24} aria-hidden />
                  </div>
                )}

                <div className={styles.listingBody}>
                  <div className={styles.listingCategory}>
                    <CategoryBadge category={listing.category as MarketplaceCategory} />
                  </div>
                  <h3 className={styles.listingTitle}>{listing.title}</h3>

                  {listing.locationDisplay ? (
                    <div className={styles.listingLocation}>
                      <Icon name="nav.map" size={16} aria-hidden />
                      <span>{listing.locationDisplay}</span>
                    </div>
                  ) : null}

                  <div className={styles.listingBenefits}>
                    {listing.housingIncluded ? (
                      <span className={styles.listingBenefitHousing}>
                        <Icon name="benefit.housing" size={16} aria-hidden />
                        Housing
                      </span>
                    ) : null}
                    {listing.mealsIncluded ? (
                      <span className={styles.listingBenefitMeals}>
                        <Icon name="benefit.meals" size={16} aria-hidden />
                        Meals
                      </span>
                    ) : null}
                    {listing.compensationSummary ?? (listing.compensationMinCents != null
                      ? (
                        <span className={styles.listingPay}>
                          <Icon name="analytics.meter" size={16} aria-hidden />
                          {new Intl.NumberFormat("en-US", {
                            style: "currency",
                            currency: listing.compensationCurrency,
                            maximumFractionDigits: 0,
                          }).format(listing.compensationMinCents / 100)}
                          {listing.compensationUnit && listing.compensationUnit !== "other"
                            ? `/${listing.compensationUnit}`
                            : ""}
                        </span>
                      )
                      : null)}
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyListings}>
          <div className={styles.emptyIcon}>
            <Icon name="category.mix" size={24} aria-hidden />
          </div>
          <p className={styles.emptyTitle}>No open opportunities right now</p>
          <p className={styles.emptyNote}>Check back soon or explore other hosts.</p>
          <Link className={styles.browseCta} href="/seek">
            Explore all listings
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      )}
    </section>
  );
}

function LocationMapCard({ location }: { location: string }) {
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(location)}`;
  return (
    <div className={styles.mapCard}>
      {/* Topographic map surface — no paid API, clean placeholder */}
      <div className={styles.mapSurface} aria-hidden>
        <div className={styles.mapContours} />
        <div className={styles.mapPin}>
          <Icon name="nav.map" size={20} aria-hidden />
        </div>
      </div>
      <div className={styles.mapBody}>
        <h3 className={styles.mapTitle}>Location</h3>
        <p className={styles.mapLocation}>
          <Icon name="nav.map" size={16} aria-hidden />
          {location}
        </p>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.mapLink}
        >
          Open in Maps
          <Icon name="action.forward" size={16} aria-hidden />
        </a>
      </div>
    </div>
  );
}

function HousingMealsCard({
  housingOffered,
  mealsOffered,
}: {
  housingOffered: boolean;
  mealsOffered: boolean;
}) {
  if (!housingOffered && !mealsOffered) return null;
  return (
    <div className={styles.benefitCard}>
      <h3 className={styles.benefitCardTitle}>What&rsquo;s included</h3>

      {housingOffered ? (
        <div className={styles.benefitRow}>
          <div className={styles.benefitRowIcon} data-kind="housing">
            <Icon name="category.seasonal" size={20} aria-hidden />
          </div>
          <div>
            <p className={styles.benefitRowLabel}>Housing</p>
            <p className={styles.benefitRowNote}>
              This host provides housing for workers. See each listing for details.
            </p>
          </div>
        </div>
      ) : null}

      {mealsOffered ? (
        <div className={styles.benefitRow}>
          <div className={styles.benefitRowIcon} data-kind="meals">
            <Icon name="category.farm" size={20} aria-hidden />
          </div>
          <div>
            <p className={styles.benefitRowLabel}>Meals</p>
            <p className={styles.benefitRowNote}>
              This host provides meals for workers. See each listing for details.
            </p>
          </div>
        </div>
      ) : null}

      <Link className={styles.benefitCardLink} href="#listings">
        View listings for details
        <Icon name="action.forward" size={16} aria-hidden />
      </Link>
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default async function PublicHostProfilePage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [host, listings, ratingSummary, reviews] = await Promise.all([
    getPublicHostProfileCached(id),
    getPublicListingsByHost(id),
    getHostRatingSummary(id),
    getHostReviews(id),
  ]);
  if (!host) notFound();

  // Eligibility for the write flow: a logged-in seeker with a completed/active
  // engagement here who hasn't reviewed yet. Resolved server-side; null for
  // guests, non-seekers, and the ineligible — so the public page stays public.
  const { userId, getToken } = await optionalAuth();
  let reviewable: Awaited<ReturnType<typeof getReviewableEngagementForHost>> = null;
  if (userId && getToken) {
    const seekerToken = await getToken({ template: "supabase" });
    if (seekerToken) {
      reviewable = await getReviewableEngagementForHost(seekerToken, userId, id);
    }
  }

  const coverPhotoUrl =
    listings.find((l) => l.coverPhotoUrl != null)?.coverPhotoUrl ?? null;

  const hostingSinceYear = host.createdAt
    ? new Date(host.createdAt).getFullYear()
    : null;

  const hasSidebar =
    !!host.primaryLocationName ||
    host.housingOfferedGenerally ||
    host.mealsOfferedGenerally;

  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: "Explore & Earn", url: baseUrl },
    { name: host.companyName, url: `${baseUrl}/host/${id}` },
  ]);

  return (
    <>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
    />
    <div className={styles.page}>
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <HostProfileHero
        host={host}
        coverPhotoUrl={coverPhotoUrl}
        listingCount={listings.length}
      />

      {/* ── Quick facts strip ─────────────────────────────────── */}
      <QuickFacts
        listingCount={listings.length}
        housingOffered={host.housingOfferedGenerally}
        mealsOffered={host.mealsOfferedGenerally}
        categoryScopes={host.categoryScopes}
        hostingSinceYear={hostingSinceYear}
      />

      {/* ── Trust band — triad-kept proof (renders only with reviews) ── */}
      <HostTrustBand
        summary={ratingSummary}
        verified={host.verified}
        reviewsHref="#reviews-heading"
      />

      {/* ── Content grid: main col + sidebar ─────────────────── */}
      <div className={hasSidebar ? styles.contentGrid : styles.contentSingle}>
        {/* Main column: about + listings */}
        <div className={styles.mainCol}>
          {host.about ? <AboutSection about={host.about} /> : null}
          {reviewable ? (
            <LeaveReview
              hostName={host.companyName}
              hostProfileId={id}
              applicationId={reviewable.applicationId}
            />
          ) : null}
          <HostReviews
            hostName={host.companyName}
            summary={ratingSummary}
            reviews={reviews}
          />
          <ListingsSection listings={listings} />
        </div>

        {/* Sidebar: location, housing/meals — only renders if data exists */}
        {hasSidebar ? (
          <aside className={styles.sidebar}>
            {host.primaryLocationName ? (
              <LocationMapCard location={host.primaryLocationName} />
            ) : null}
            {(host.housingOfferedGenerally || host.mealsOfferedGenerally) ? (
              <HousingMealsCard
                housingOffered={host.housingOfferedGenerally}
                mealsOffered={host.mealsOfferedGenerally}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
    </>
  );
}
