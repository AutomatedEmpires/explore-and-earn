import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import Image from "next/image";
import Link from "next/link";

import {
  getListingDetailPublic,
  getHostProfile,
  hasApplied,
  hasSaved,
} from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";
import { CategoryBadge } from "../../../components/listing/CategoryBadge";
import { HostSummaryBlock } from "../../../components/listing/HostSummaryBlock";
import { VerifiedHostBadge } from "@explore-and-earn/ui";
import { ApplyButton } from "./ApplyButton";
import { generateJobPostingJsonLd } from "../../../lib/seo";

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
  const ogImage = listing.coverPhotoUrl ?? `${baseUrl}/og-default.png`;

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

  const authResult = await auth();
  const userId = authResult.userId;

  // Determine viewer role and ownership
  let viewerRole: "guest" | "seeker" | "owner" = "guest";
  let isOwner = false;

  if (userId) {
    const { getToken } = await auth();
    const token = await getToken({ template: "supabase" });
    if (token) {
      const hostProfile = await getHostProfile(token, userId);
      isOwner = hostProfile?.id === listing.hostProfileId;
      viewerRole = isOwner ? "owner" : "seeker";
    }
  }

  // Visibility rule: non-live listings are only shown to the owning host
  if (listing.status !== "live" && !isOwner) notFound();

  // Fetch seeker-specific state (applied/saved) when authed
  let alreadyApplied = false;
  let alreadySaved = false;
  let onboardingComplete = false;

  if (userId && viewerRole === "seeker") {
    const { getToken } = await auth();
    const token = await getToken({ template: "supabase" });
    if (token) {
      [alreadyApplied, alreadySaved] = await Promise.all([
        hasApplied(token, userId, listing.id),
        hasSaved(token, userId, listing.id),
      ]);
      // Onboarding status: assume complete if they have a seeker profile (hasApplied/hasSaved returned non-error)
      onboardingComplete = true;
    }
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

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML= __html: jsonLd 
      />
      <main
        style=
          backgroundColor: "var(--color-paper)",
          minHeight: "100vh",
          paddingBottom: "80px",
        
      >
        {/* Cover photo */}
        {listing.coverPhotoUrl && (
          <div
            style=
              position: "relative",
              width: "100%",
              aspectRatio: "4 / 3",
              backgroundColor: "var(--color-surface)",
            
          >
            <Image
              src={listing.coverPhotoUrl}
              alt={listing.title}
              fill
              style= objectFit: "cover" 
              priority
            />
          </div>
        )}

        {/* Content */}
        <div
          style=
            maxWidth: "42rem",
            margin: "0 auto",
            padding: "var(--space-gutter)",
          
        >
          {/* Category badge */}
          <div style= marginBottom: "var(--space-12)" >
            <CategoryBadge category={listing.category} />
          </div>

          {/* Title */}
          <h1
            style=
              fontFamily: "var(--font-display)",
              fontSize: "var(--type-page-size)",
              lineHeight: "var(--type-page-lh)",
              color: "var(--text-primary)",
              margin: 0,
              marginBottom: "var(--space-12)",
            
          >
            {listing.title}
          </h1>

          {/* Location */}
          {listing.locationDisplay && (
            <div
              style=
                display: "flex",
                alignItems: "center",
                gap: "var(--space-4)",
                color: "var(--text-secondary)",
                fontSize: "var(--type-body-size)",
                marginBottom: "var(--space-16)",
              
            >
              <Icon name="nav.map" size={16} aria-hidden />
              <span>{listing.locationDisplay}</span>
            </div>
          )}

          {/* Host summary */}
          {listing.host && (
            <div
              style=
                display: "flex",
                alignItems: "center",
                gap: "var(--space-12)",
                marginBottom: "var(--space-16)",
              
            >
              {listing.host.photoUrl && (
                <div
                  style=
                    position: "relative",
                    width: "48px",
                    height: "48px",
                    borderRadius: "var(--radius-image)",
                    border: "2px solid var(--border-ink)",
                    backgroundColor: "var(--color-surface)",
                    overflow: "hidden",
                  
                >
                  <Image
                    src={listing.host.photoUrl}
                    alt={listing.host.companyName}
                    fill
                    style= objectFit: "cover" 
                  />
                </div>
              )}
              <div style= flex: 1 >
                <div
                  style=
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-8)",
                    marginBottom: "var(--space-4)",
                  
                >
                  <Link
                    href={`/host/${listing.host.id}`}
                    style=
                      fontFamily: "var(--font-ui)",
                      fontSize: "var(--type-body-size)",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--text-primary)",
                      textDecoration: "none",
                    
                  >
                    {listing.host.companyName}
                  </Link>
                  {listing.host.attestationStatus === "attested" && (
                    <VerifiedHostBadge />
                  )}
                </div>
                <div
                  style=
                    fontSize: "var(--type-meta-size)",
                    color: "var(--text-secondary)",
                  
                >
                  {dateLabel}
                </div>
              </div>
            </div>
          )}

          {/* Benefit triad */}
          <div
            style=
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "var(--space-12)",
              marginBottom: "var(--space-section)",
            
          >
            {/* Housing */}
            <div
              style=
                padding: "var(--space-16)",
                borderRadius: "var(--radius-card)",
                backgroundColor: "var(--benefit-housing-bg)",
                border: "1px solid var(--benefit-housing-fg)",
              
            >
              <div
                style=
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-8)",
                
              >
                <Icon name="benefit.housing" size={16} aria-hidden />
                <span
                  style=
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--type-label-size)",
                    fontWeight: "var(--font-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--type-label-tracking)",
                    color: "var(--benefit-housing-fg)",
                  
                >
                  Housing
                </span>
              </div>
              <div
                style=
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-meta-size)",
                  color: "var(--benefit-housing-fg)",
                
              >
                {housingLabel}
              </div>
            </div>

            {/* Meals */}
            <div
              style=
                padding: "var(--space-16)",
                borderRadius: "var(--radius-card)",
                backgroundColor: "var(--benefit-meals-bg)",
                border: "1px solid var(--benefit-meals-fg)",
              
            >
              <div
                style=
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-8)",
                
              >
                <Icon name="benefit.meals" size={16} aria-hidden />
                <span
                  style=
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--type-label-size)",
                    fontWeight: "var(--font-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--type-label-tracking)",
                    color: "var(--benefit-meals-fg)",
                  
                >
                  Meals
                </span>
              </div>
              <div
                style=
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-meta-size)",
                  color: "var(--benefit-meals-fg)",
                
              >
                {mealsLabel}
              </div>
            </div>

            {/* Pay */}
            <div
              style=
                padding: "var(--space-16)",
                borderRadius: "var(--radius-card)",
                backgroundColor: "var(--benefit-pay-bg)",
                border: "1px solid var(--benefit-pay-fg)",
              
            >
              <div
                style=
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-4)",
                  marginBottom: "var(--space-8)",
                
              >
                <Icon name="benefit.pay" size={16} aria-hidden />
                <span
                  style=
                    fontFamily: "var(--font-ui)",
                    fontSize: "var(--type-label-size)",
                    fontWeight: "var(--font-weight-semibold)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--type-label-tracking)",
                    color: "var(--benefit-pay-fg)",
                  
                >
                  Pay
                </span>
              </div>
              <div
                style=
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-meta-size)",
                  color: "var(--benefit-pay-fg)",
                
              >
                {paySummary}
              </div>
            </div>
          </div>

          {/* Description */}
          {listing.description && (
            <section style= marginBottom: "var(--space-section)" >
              <h2
                style=
                  fontFamily: "var(--font-display)",
                  fontSize: "var(--type-section-size)",
                  lineHeight: "var(--type-section-lh)",
                  color: "var(--text-primary)",
                  marginBottom: "var(--space-12)",
                
              >
                About this opportunity
              </h2>
              <div
                style=
                  fontFamily: "var(--font-ui)",
                  fontSize: "var(--type-body-size)",
                  lineHeight: "var(--type-body-lh)",
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                
              >
                {listing.description.split("\n\n").map((para, idx) => (
                  <p key={idx} style= marginBottom: "var(--space-12)" >
                    {para}
                  </p>
                ))}
              </div>
            </section>
          )}

          {/* Host summary block */}
          {listing.host && (
            <div style= marginBottom: "var(--space-section)" >
              <HostSummaryBlock
                host={{
                  id: listing.host.id,
                  name: listing.host.companyName,
                  verified:
                    listing.host.attestationStatus === "attested",
                  tagline: listing.host.about ?? undefined,
                  avatar: listing.host.photoUrl
                    ? {
                        masterPath: listing.host.photoUrl,
                        width: 120,
                        height: 120,
                      }
                    : undefined,
                }}
              />
            </div>
          )}
        </div>

        {/* Sticky action bar */}
        <div
          style=
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: "var(--color-surface-raised)",
            borderTop: "1px solid var(--border-soft)",
            padding: "var(--space-16)",
            display: "flex",
            justifyContent: "center",
          
        >
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
