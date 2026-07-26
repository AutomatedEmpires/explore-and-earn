import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import {
  computeSeekerListingFitTrace,
  getSeekerListingMatch,
  getSeekerResumeStatus,
  hasApplied,
  hasSaved,
  recordEvent,
  seekerHasMatchInputs,
} from "@explore-and-earn/db";
import { resolveListingFit } from "../../../../lib/listingFit";
import {
  benefitStateLabel,
  hasCategoryDepth,
  hasLogistics,
  matchBandFor,
  matchBandLabel,
  NOT_STATED_LABEL,
} from "@explore-and-earn/contracts";
import {
  cachedHostProfile,
  cachedSeekerProfile,
  getListingDetailPublicCached,
  getSupabaseToken,
} from "../../../../lib/serverCache";
import { Icon } from "@explore-and-earn/ui";
import { HostSummaryBlock } from "../../../../components/listing/HostSummaryBlock";
import { SourcedNotice } from "../../../../components/listing/SourcedNotice";
import { TrueValue } from "../../../../components/listing/TrueValue";
import { ListingHero } from "../../../../components/listing/ListingHero";
import { ListingGallery } from "../../../../components/listing/ListingGallery";
import { ListingGlance, type GlanceItem } from "../../../../components/listing/ListingGlance";
import { FitReasons, type FitReasonsPrompt } from "../../../../components/listing/FitReasons";
import { DealUpfront } from "../../../../components/listing/DealUpfront";
import { DetailList } from "../../../../components/listing/DetailList";
import { ProseSection } from "../../../../components/listing/ProseSection";
import { WeatherWidget } from "../../../../components/listing/WeatherWidget";
import { ConnectivityFacts } from "../../../../components/listing/ConnectivityFacts";
import { MaritimeFacts } from "../../../../components/listing/MaritimeFacts";
import { LocationContext } from "../../../../components/listing/LocationContext";
import { TeamGrid } from "../../../../components/listing/TeamGrid";
import { WhyWorkForUs } from "../../../../components/listing/WhyWorkForUs";
import { ApplyButton } from "./ApplyButton";
import { generateJobPostingJsonLd, generateBreadcrumbJsonLd } from "../../../../lib/seo";
import { fetchWeather } from "../../../../lib/weather";
import { formatMoney } from "../../../../lib/format";
import {
  formatListingWindow,
  listingDurationMonths,
} from "../../../../lib/listingWindow";
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
  // The fallback description is a PUBLIC claim — it ships to search engines and
  // social cards. It previously read the raw housingIncluded/mealsIncluded
  // booleans and announced "Housing not included" for a listing whose source
  // never stated it, while the visible triad on the same page correctly said
  // "Not stated". Route it through the shared contract so the OG description
  // and the page can never disagree.
  const evidence = listing.provenanceInfo?.benefitEvidence;
  const description = listing.description
    ? listing.description.slice(0, 155)
    : `${listing.title} opportunity at ${listing.host?.companyName ?? "a host organization"}. Housing ${benefitStateLabel(listing.housingIncluded, evidence?.housing, { lowercase: true })}, meals ${benefitStateLabel(listing.mealsIncluded, evidence?.meals, { lowercase: true })}.`;

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
  // The gate already knows WHICH sections are outstanding; it used to be
  // discarded, so every blocked seeker got the same generic sentence naming a
  // field list that did not match the real requirements.
  let resumeMissing: readonly string[] = [];
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
    resumeMissing = resumeStatus.missing;
  }

  // Seeker-facing ADR-040 fit signal: computed on the fly with the same engine
  // the assistant uses. Shown only to seekers who have enough profile signal for
  // an honest band; otherwise a gentle prompt to complete their profile.
  // The TRACE, not the bare score: it tags every sentinel-derived signal with
  // polarity "missing", which is the only thing that stops an uncomputed
  // component being rendered as a confident reason.
  //
  // nowMs is passed explicitly. computeMatch defaults it to 0 (the epoch), so
  // omitting it meant listingEnded was never true and the ended-listing penalty
  // could not fire on this page at all.
  // The fit shown here is the STORED engine result — the same match_scores row
  // the discovery pill reads — never a local recompute. See lib/listingFit.ts:
  // the inline recompute ran on 7 of 20 seeker fields and 12 of 20 listing
  // fields against the service's 18 and 17, and because the card's pill
  // threshold (75) is exactly the "Strong match" floor, a pairing straddling it
  // made the card and this page contradict each other on the same claim.
  //
  // The local trace is still built, but ONLY for its qualitative per-axis
  // signals. resolveListingFit discards its blockers: the smaller input set
  // reports "no certification required" for a listing that requires one,
  // because the detail listing mapper never carries requiredCertifications.
  const localFitTrace =
    viewerRole === "seeker" && seekerProfile && seekerHasMatchInputs(seekerProfile)
      ? computeSeekerListingFitTrace(seekerProfile, listing, Date.now())
      : null;
  const storedMatch =
    userId && token && viewerRole === "seeker" && seekerProfile && !isFixtureListing
      ? await getSeekerListingMatch(token, userId, listing.id)
      : null;
  const fitResolution = resolveListingFit(storedMatch, localFitTrace);
  const fitTrace = fitResolution.kind === "scored" ? fitResolution.trace : null;
  const fit = fitTrace;
  const seekerNeedsProfileForFit =
    viewerRole === "seeker" && (!seekerProfile || !seekerHasMatchInputs(seekerProfile));
  // A seeker who HAS given us enough signal but has no stored row yet is not
  // "a bad match" — they are not scored yet, and the card shows them no pill
  // either. Saying nothing is the only answer that agrees with the card.
  const fitPending =
    viewerRole === "seeker" &&
    !seekerNeedsProfileForFit &&
    fitResolution.kind === "not_scored";

  // Location-aware 10-day outlook — fetched in the RSC only when the listing
  // carries real coordinates. fetchWeather never throws (null on any failure),
  // and the widget renders an honest shell for a null outlook.
  const hasCoords = listing.latitude != null && listing.longitude != null;
  // hasLogistics() is the gate, not a truthiness check: a connectivity object
  // carrying only a reportedAt date states nothing, and a section that renders
  // for it would be an empty claim. Binding the value here rather than
  // asserting it at the call site keeps that gate honest if hasLogistics ever
  // widens — the section stops rendering, instead of rendering undefined.
  const connectivity = hasLogistics(listing.logistics)
    ? listing.logistics.connectivity
    : undefined;
  // Same gate-and-bind for category depth (069). Deliberately keyed on the
  // FACTS existing rather than on listing.category: a host who stated the
  // vessel and later re-laned the listing still stated those facts, and hiding
  // them would discard a real answer. (The host form keeps them editable for
  // the same reason — nothing becomes stranded.)
  const maritime = hasCategoryDepth(listing.categoryDepth)
    ? listing.categoryDepth.maritime
    : undefined;
  const weather = hasCoords
    ? await fetchWeather(listing.latitude as number, listing.longitude as number)
    : null;

  // Benefit / pay summaries
  const paySummary =
    listing.compensationSummary ??
    (listing.compensationMinCents != null
      ? `${formatMoney(listing.compensationMinCents, { currency: listing.compensationCurrency })}${listing.compensationUnit && listing.compensationUnit !== "other" ? `/${listing.compensationUnit}` : ""}`
      : "See listing");

  const dateLabel = formatListingWindow(listing);

  // At-a-glance facts — each cell added ONLY when its underlying field is real.
  const glanceItems: GlanceItem[] = [];
  if (listing.locationDisplay) {
    glanceItems.push({ icon: "nav.map", label: "Location", value: listing.locationDisplay });
  }
  // The glance grid is a facts table, so an unstated window reads "Not stated"
  // here — the same word the Housing/Meals/Pay triad already uses for silence.
  glanceItems.push({
    icon: "status.begins",
    label: "When",
    value: listing.timelineSummary ?? dateLabel ?? NOT_STATED_LABEL,
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
  // The band word, not "82 / 100". The score itself is now the stored one, so
  // it no longer disagrees with the card — but the card already prints the
  // number, and repeating it here would just be the same claim twice. The
  // section below shows what it was based on.
  if (fit && !fit.excluded) {
    glanceItems.push({
      icon: "status.match",
      label: "Your fit",
      value: matchBandLabel(matchBandFor(fit.score)),
    });
  }

  // "Why you're a good fit" prompt for viewers who can't get an honest score.
  let fitPrompt: FitReasonsPrompt | null = null;
  if (!fit) {
    if (seekerNeedsProfileForFit) {
      fitPrompt = {
        text: "Finish your profile to see how well this opportunity fits you.",
        href: "/onboarding",
      };
    } else if (fitPending) {
      // Deliberately claims nothing about the pairing. Scoring runs off the
      // request path (on profile save, on apply, on publish), so "not yet"
      // is the truth here — and it matches the card, which shows no pill.
      fitPrompt = {
        text: "We're still working out how this one fits you — check back shortly.",
        href: null,
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

  // A sourced listing is unconfirmed inventory: it must NOT emit a JobPosting
  // (that structured type asserts a real hiring org + confirmed facts we don't
  // have) and its host block is structurally absent from the data anyway.
  const isSourced = listing.provenanceInfo?.provenance === "sourced";
  const jsonLd = isSourced ? null : generateJobPostingJsonLd(listing, listing.host, baseUrl);

  // Sourced-inventory analytics — a real (non-fixture) sourced listing view.
  // Best-effort (recordEvent never throws) and privacy-safe (id only, no user).
  if (isSourced && !isFixtureListing) {
    await recordEvent({
      eventType: "sourced_listing_viewed",
      actorScope: viewerRole === "seeker" ? "seeker" : "platform",
      subjectType: "listing",
      subjectId: listing.id,
      listingId: listing.id,
      sourceSurface: "listing_detail",
    });
  }
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
          {/* Sourced disclosure — first, before any listing content. Renders
              only for sourced listings; verified listings are unaffected. */}
          <SourcedNotice listingId={listing.id} provenance={listing.provenanceInfo} />

          {/* 3. At a glance */}
          <ListingGlance items={glanceItems} />

          {/* 4. How this lines up for you */}
          <FitReasons trace={fitTrace} prompt={fitPrompt} listingId={listing.id} />

          {/* 5. The deal, upfront (+ TrueValue) */}
          <DealUpfront
            housingIncluded={listing.housingIncluded}
            mealsIncluded={listing.mealsIncluded}
            housingDescription={listing.housingDescription ?? null}
            mealsDescription={listing.mealsDescription ?? null}
            paySummary={paySummary}
            category={listing.category}
            housingPhotos={isSourced ? undefined : listing.housingPhotos}
            evidence={listing.provenanceInfo?.benefitEvidence}
          >
            {/* TrueValue's "what you'll save" math only makes sense for
                confirmed/stated benefits — omit it for sourced listings so we
                never compute savings off unstated data. */}
            {!isSourced && (
            <TrueValue
              housingIncluded={listing.housingIncluded}
              mealsIncluded={listing.mealsIncluded}
              paySummary={paySummary}
              durationMonths={listingDurationMonths(listing)}
            />
            )}
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

          {/* 10b. Getting online — rendered ONLY when the host actually stated
              something, so a seeker never reads a wall of "Not stated" cells.
              Sits beside Weather/Location as part of "what is this place
              really like", not as a benefit (the triad stays three keys). */}
          {connectivity ? <ConnectivityFacts connectivity={connectivity} /> : null}

          {/* 10c. The vessel — category depth (069). Sits beside 10b as part of
              "what is this place really like", NOT near the triad: these are
              facts about the workplace, not a fourth thing the host is
              offering, and the triad is three keys by product law. */}
          {maritime ? <MaritimeFacts maritime={maritime} /> : null}

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
              resumeMissing={resumeMissing}
              isSourced={isSourced}
              sourceUrl={listing.provenanceInfo?.source?.sourceUrl ?? null}
            />
          </div>
        </div>
      </div>
    </>
  );
}
