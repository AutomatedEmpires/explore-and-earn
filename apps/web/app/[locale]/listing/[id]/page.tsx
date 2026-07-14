import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  computeSeekerListingFit,
  getSeekerResumeStatus,
  hasApplied,
  hasSaved,
  seekerHasMatchInputs,
} from "@explore-and-earn/db";
import {
  cachedHostProfile,
  cachedSeekerProfile,
  getListingDetailPublicCached,
  getSupabaseToken,
} from "../../../../lib/serverCache";
import { Icon } from "@explore-and-earn/ui";
import { HostSummaryBlock } from "../../../../components/listing/HostSummaryBlock";
import { TrueValue } from "../../../../components/listing/TrueValue";
import { ListingHero } from "../../../../components/listing/ListingHero";
import { ListingGallery } from "../../../../components/listing/ListingGallery";
import { ListingGlance, type GlanceItem } from "../../../../components/listing/ListingGlance";
import { FitReasons, type FitReasonsPrompt } from "../../../../components/listing/FitReasons";
import { DealUpfront } from "../../../../components/listing/DealUpfront";
import { DetailList } from "../../../../components/listing/DetailList";
import { ProseSection } from "../../../../components/listing/ProseSection";
import { WeatherWidget } from "../../../../components/listing/WeatherWidget";
import { LocationContext } from "../../../../components/listing/LocationContext";
import { TeamGrid } from "../../../../components/listing/TeamGrid";
import { WhyWorkForUs } from "../../../../components/listing/WhyWorkForUs";
import { ApplyButton } from "./ApplyButton";
import { generateJobPostingJsonLd, generateBreadcrumbJsonLd } from "../../../../lib/seo";
import { fetchWeather } from "../../../../lib/weather";
import { formatMoney, formatMonthYear } from "../../../../lib/format";
import { isUuid } from "../../../../lib/ids";
import { optionalAuth } from "../../../../lib/optionalAuth";
import { getFixtureListingDetail } from "../../../../components/discovery/fixtureDetail";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
}

const CATEGORY_LABEL: Record<string, string> = {
  farm: "Farm",
  maritime: "Maritime",
  remote: "Remote",
  seasonal: "Seasonal",
  mix: "Mix",
};

/**
 * listings.id is a Postgres uuid — a non-UUID param can never exist in the DB
 * and would throw 22P02 into the error boundary (behind HTTP 200). Guarding
 * here turns unknown ids into honest 404s, and lets dev/preview fixture ids
 * (lst_*) resolve so the fixture discover → inspect journey stays connected.
 */
async function resolveListingDetail(id: string) {
  if (isUuid(id)) return getListingDetailPublicCached(id);
  return getFixtureListingDetail(id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const listing = await resolveListingDetail(id);

  if (!listing) {
    // Thrown HERE (pre-stream) so the response carries a real 404 status —
    // the route has a loading.tsx, so by the time the page body calls
    // notFound() the 200 status has already been flushed with the skeleton.
    notFound();
  }

  // The root template appends "| Explore & Earn" — don't bake the brand in twice.
  const title = listing.host?.companyName
    ? `${listing.title} — ${listing.host.companyName}`
    : listing.title;
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
  const listing = await resolveListingDetail(id);

  if (!listing) notFound();

  // Fixture-backed listings (dev/preview only) have non-UUID ids that must
  // never reach the uuid-typed seeker-state queries below.
  const isFixtureListing = !isUuid(listing.id);

  const { userId } = await optionalAuth();
  const token = userId ? await getSupabaseToken() : null;

  // Determine viewer role and ownership
  let viewerRole: "guest" | "seeker" | "owner" = "guest";
  let isOwner = false;

  if (userId && token) {
    try {
      const hostProfile = await cachedHostProfile(token, userId);
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

  // Fetch seeker-specific state (applied/saved/résumé) when authed. The apply
  // gate is authoritative on the server (applyToListing re-checks), but we also
  // compute résumé-completeness here so the button routes an incomplete seeker
  // to the résumé builder instead of opening the confirm dialog.
  let alreadyApplied = false;
  let alreadySaved = false;
  let resumeComplete = false;
  let seekerProfile: Awaited<ReturnType<typeof cachedSeekerProfile>> = null;

  if (userId && token && viewerRole === "seeker" && !isFixtureListing) {
    const [applied, saved, profile, resumeStatus] = await Promise.all([
      hasApplied(token, userId, listing.id),
      hasSaved(token, userId, listing.id),
      cachedSeekerProfile(token, userId),
      getSeekerResumeStatus(token, userId),
    ]);
    alreadyApplied = applied;
    alreadySaved = saved;
    seekerProfile = profile;
    resumeComplete = resumeStatus.complete;
  }

  // Seeker-facing ADR-040 fit signal: computed on the fly with the same engine
  // the assistant uses. Shown only to seekers who have enough profile signal for
  // an honest band; otherwise a gentle prompt to complete their profile.
  const fit =
    viewerRole === "seeker" && seekerProfile && seekerHasMatchInputs(seekerProfile)
      ? computeSeekerListingFit(seekerProfile, listing)
      : null;
  const seekerNeedsProfileForFit =
    viewerRole === "seeker" && (!seekerProfile || !seekerHasMatchInputs(seekerProfile));

  // Location-aware 10-day outlook — fetched in the RSC only when the listing
  // carries real coordinates. fetchWeather never throws (null on any failure),
  // and the widget renders an honest shell for a null outlook.
  const hasCoords = listing.latitude != null && listing.longitude != null;
  const weather = hasCoords
    ? await fetchWeather(listing.latitude as number, listing.longitude as number)
    : null;

  // Benefit / pay summaries
  const paySummary =
    listing.compensationSummary ??
    (listing.compensationMinCents != null
      ? `${formatMoney(listing.compensationMinCents, { currency: listing.compensationCurrency })}${listing.compensationUnit && listing.compensationUnit !== "other" ? `/${listing.compensationUnit}` : ""}`
      : "See listing");

  const dateLabel =
    listing.beginsAt && listing.endsAt
      ? `${formatMonthYear(listing.beginsAt)} – ${formatMonthYear(listing.endsAt)}`
      : listing.beginsAt
        ? `Starting ${formatMonthYear(listing.beginsAt)}`
        : "Ongoing";

  // At-a-glance facts — each cell added ONLY when its underlying field is real.
  const glanceItems: GlanceItem[] = [];
  if (listing.locationDisplay) {
    glanceItems.push({ icon: "nav.map", label: "Location", value: listing.locationDisplay });
  }
  glanceItems.push({
    icon: "status.begins",
    label: "When",
    value: listing.timelineSummary ?? dateLabel,
  });
  glanceItems.push({
    icon: `category.${listing.category}`,
    label: "Category",
    value: CATEGORY_LABEL[listing.category] ?? listing.category,
  });
  if (listing.host) {
    glanceItems.push({
      icon: listing.host.verified ? "trust.verified_host" : "nav.hosts",
      label: "Host",
      value: `${listing.host.companyName}${listing.host.verified ? " · Verified" : ""}`,
    });
  }
  if (fit && !fit.excluded) {
    glanceItems.push({ icon: "status.match", label: "Your fit", value: `${fit.score} / 100` });
  }

  // "Why you're a good fit" prompt for viewers who can't get an honest score.
  let fitPrompt: FitReasonsPrompt | null = null;
  if (!fit) {
    if (seekerNeedsProfileForFit) {
      fitPrompt = {
        text: "Finish your profile to see how well this opportunity fits you.",
        href: "/onboarding",
      };
    } else if (viewerRole === "guest") {
      fitPrompt = {
        text: "Sign in and tell us what you're after to see how well this fits you.",
        href: `/sign-in?redirect_url=/listing/${listing.id}`,
      };
    }
  }

  // Perks & benefits merges the listing-level and host-level perk lists (deduped,
  // order-preserving). Both are self-omitting arrays from the data layer.
  const allPerks = Array.from(
    new Set([...(listing.perks ?? []), ...(listing.hostPerks ?? [])]),
  );

  const jsonLd = generateJobPostingJsonLd(listing, listing.host, baseUrl);
  const breadcrumbJsonLd = generateBreadcrumbJsonLd([
    { name: "Explore & Earn", url: baseUrl },
    ...(listing.host && listing.host.id
      ? [{ name: listing.host.companyName, url: `${baseUrl}/host/${listing.host.id}` }]
      : []),
    { name: listing.title, url: `${baseUrl}/listing/${listing.id}` },
  ]);

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: breadcrumbJsonLd }}
      />
      <div className={styles.page}>
        {/* 1–2. Immersive hero (back button overlaid) + gallery */}
        <ListingHero
          title={listing.title}
          category={listing.category}
          locationDisplay={listing.locationDisplay}
          coverPhotoUrl={listing.coverPhotoUrl}
          host={
            listing.host
              ? {
                  id: listing.host.id,
                  companyName: listing.host.companyName,
                  photoUrl: listing.host.photoUrl,
                  verified: listing.host.verified,
                }
              : null
          }
          dateLabel={dateLabel}
        />
        <ListingGallery title={listing.title} photoUrls={listing.galleryPhotoUrls} />

        <div className={styles.content}>
          {/* 3. At a glance */}
          <ListingGlance items={glanceItems} />

          {/* 4. Why you're a good fit */}
          <FitReasons fit={fit} prompt={fitPrompt} />

          {/* 5. The deal, upfront (+ TrueValue) */}
          <DealUpfront
            housingIncluded={listing.housingIncluded}
            mealsIncluded={listing.mealsIncluded}
            housingDescription={listing.housingDescription ?? null}
            mealsDescription={listing.mealsDescription ?? null}
            paySummary={paySummary}
          >
            <TrueValue
              housingIncluded={listing.housingIncluded}
              mealsIncluded={listing.mealsIncluded}
              paySummary={paySummary}
            />
          </DealUpfront>

          {/* 6. About this position */}
          {listing.description ? (
            <ProseSection
              title="About this position"
              icon="system.info"
              headingId="listing-about"
              text={listing.description}
            />
          ) : null}

          {/* 7. What you'll do */}
          <DetailList
            title="What you'll do"
            icon="profile.experience"
            markerIcon="system.success"
            headingId="listing-responsibilities"
            items={listing.responsibilities ?? []}
          />

          {/* 8. What we're looking for */}
          <DetailList
            title="What we're looking for"
            icon="profile.skills"
            markerIcon="action.forward"
            headingId="listing-requirements"
            items={listing.requirements ?? []}
          />

          {/* 9. Perks & benefits */}
          <DetailList
            title="Perks & benefits"
            icon="reaction.clap"
            markerIcon="system.success"
            headingId="listing-perks"
            variant="chips"
            items={allPerks}
          />

          {/* 10. Life here */}
          <DetailList
            title="Life here"
            icon="reaction.hundred"
            markerIcon="nav.map"
            headingId="listing-life"
            subtitle="The place, off the clock."
            variant="chips"
            items={listing.activities ?? []}
          />

          {/* 11. Weather (honest shell when the fetch fails) */}
          {hasCoords ? (
            <WeatherWidget locationLabel={listing.locationDisplay} outlook={weather} />
          ) : null}

          {/* 12. Where you'll be */}
          {hasCoords ? (
            <LocationContext
              locationDisplay={listing.locationDisplay}
              latitude={listing.latitude as number}
              longitude={listing.longitude as number}
              category={listing.category}
            />
          ) : null}

          {/* 13. Meet the team */}
          <TeamGrid members={listing.team ?? []} />

          {/* 14. Why work with us */}
          <WhyWorkForUs text={listing.whyWorkForUs ?? null} />

          {/* 15. About the host */}
          {listing.host && (
            <div className={styles.hostSummaryWrapper}>
              <HostSummaryBlock
                host={{
                  id: listing.host.id,
                  name: listing.host.companyName,
                  location: listing.host.primaryLocationName ?? undefined,
                  verified: listing.host.verified,
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

        {/* 16. Sticky action bar — ApplyButton + contextual guide link */}
        <div className={styles.actionBar}>
          <div className={styles.actionBarInner}>
            {viewerRole === "seeker" && !isFixtureListing && (
              <Link
                href={`/assistant?listingId=${listing.id}&listingTitle=${encodeURIComponent(listing.title)}`}
                className={styles.guideLink}
              >
                <Icon name="action.message" size={18} aria-hidden />
                <span>Ask your guide about this role</span>
              </Link>
            )}
            <ApplyButton
              listingId={listing.id}
              title={listing.title}
              viewerRole={viewerRole}
              alreadyApplied={alreadyApplied}
              alreadySaved={alreadySaved}
              resumeComplete={resumeComplete}
            />
          </div>
        </div>
      </div>
    </>
  );
}
