import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getHostRatingSummary,
  getHostReviews,
  getPublicListingsByHost,
  getReviewableEngagementForHost,
} from "@explore-and-earn/db";
import type {
  HostRatingSummary,
  HostReview,
  PublicHostListing,
  PublicHostProfile,
} from "@explore-and-earn/db";

import { getFixtureHostProfileBundle } from "../../../../components/host/fixtureProfile";
import { LeaveReview } from "../../../../components/host/LeaveReview";
import { PublicHostProfileView } from "../../../../components/host/PublicHostProfileView";
import { generateBreadcrumbJsonLd } from "../../../../lib/seo";
import { isUuid } from "../../../../lib/ids";
import { optionalAuth } from "../../../../lib/optionalAuth";
import { getPublicHostProfileCached } from "../../../../lib/serverCache";

export const dynamic = "force-dynamic";

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
}

interface PublicHostPageData {
  host: PublicHostProfile;
  listings: PublicHostListing[];
  ratingSummary: HostRatingSummary;
  reviews: HostReview[];
  isFixture: boolean;
}

async function resolvePublicHostPageData(id: string): Promise<PublicHostPageData | null> {
  const fixture = getFixtureHostProfileBundle(id);
  if (fixture) return { ...fixture, isFixture: true };
  if (!isUuid(id)) return null;

  const [host, listings, ratingSummary, reviews] = await Promise.all([
    getPublicHostProfileCached(id),
    getPublicListingsByHost(id),
    getHostRatingSummary(id),
    getHostReviews(id),
  ]);
  if (!host) return null;
  return { host, listings, ratingSummary, reviews, isFixture: false };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const fixture = getFixtureHostProfileBundle(id);
  const host = fixture?.host ?? (isUuid(id) ? await getPublicHostProfileCached(id) : null);
  if (!host) notFound();

  const title = host.companyName;
  const description = (host.tagline ?? host.about?.slice(0, 100) ??
    `View open opportunities from ${host.companyName} on Explore & Earn.`).slice(0, 155);
  const canonical = `${baseUrl}/host/${id}`;
  const ogImage = host.photoUrl ?? `${baseUrl}/opengraph-image`;

  return {
    title,
    description,
    ...(fixture
      ? { robots: { index: false, follow: false } }
      : { alternates: { canonical } }),
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

export default async function PublicHostProfilePage({ params }: Props) {
  const { id } = await params;
  const data = await resolvePublicHostPageData(id);
  if (!data) notFound();
  const { host, listings, ratingSummary, reviews, isFixture } = data;

  let reviewable: Awaited<ReturnType<typeof getReviewableEngagementForHost>> = null;
  if (!isFixture) {
    const { userId, getToken } = await optionalAuth();
    if (userId && getToken) {
      const seekerToken = await getToken();
      if (seekerToken) {
        reviewable = await getReviewableEngagementForHost(seekerToken, userId, id);
      }
    }
  }

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
      <PublicHostProfileView
        host={host}
        listings={listings}
        ratingSummary={ratingSummary}
        reviews={reviews}
        reviewSlot={reviewable ? (
          <LeaveReview
            hostName={host.companyName}
            hostProfileId={id}
            applicationId={reviewable.applicationId}
          />
        ) : null}
      />
    </>
  );
}
