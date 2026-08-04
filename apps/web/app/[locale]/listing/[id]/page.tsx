import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

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
  payStateLabel,
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
import {
  ListingSectionNav,
  type ListingSectionLink,
} from "../../../../components/listing/ListingSectionNav";
import { FitReasons, type FitReasonsPrompt } from "../../../../components/listing/FitReasons";
import { DealUpfront } from "../../../../components/listing/DealUpfront";
import { DetailList } from "../../../../components/listing/DetailList";
import { ProseSection } from "../../../../components/listing/ProseSection";
import { ListingWeatherSection } from "../../../../components/listing/ListingWeatherSection";
import { WeatherWidgetLoading } from "../../../../components/listing/WeatherWidget";
import { ConnectivityFacts } from "../../../../components/listing/ConnectivityFacts";
import { MaritimeFacts } from "../../../../components/listing/MaritimeFacts";
import { LocationContext } from "../../../../components/listing/LocationContext";
import { TeamGrid } from "../../../../components/listing/TeamGrid";
import { WhyWorkForUs } from "../../../../components/listing/WhyWorkForUs";
import { ApplyButton } from "./ApplyButton";
import { generateJobPostingJsonLd, generateBreadcrumbJsonLd } from "../../../../lib/seo";
import { formatCompensation } from "../../../../lib/format";
import { composeListingLede } from "../../../../components/listing/listingLede";
import {
  formatListingWindow,
  listingDurationMonths,
} from "../../../../lib/listingWindow";
import { isUuid } from "../../../../lib/ids";
import { optionalAuth } from "../../../../lib/optionalAuth";
import { signInHref } from "../../../../lib/authRedirect";
import { hasListingApplyIntent } from "../../../../lib/listingApplyIntent";
import { getFixtureListingDetail } from "../../../../components/discovery/fixtureDetail";
import { isKnownDevDiscoveryFixtureId } from "../../../../components/discovery/fixtureIds";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://exploreandearn.com";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ apply?: string | string[] }>;
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
    // RETURN not-found metadata rather than throwing here. A notFound() from
    // generateMetadata renders the ROOT not-found boundary (the site-wide
    // face), not this route's listing-true not-found.tsx — the page body's
    // own notFound() below is what reaches the route-local boundary. The
    // response status is 200 either way (the loading boundary has already
    // flushed by resolution time — measured, not assumed), so the crawl
    // protection is the explicit noindex here plus the one Next stamps on
    // not-found renders.
    return {
      title: "Page not found",
      robots: { index: false, follow: false },
    };
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

export default async function ListingDetailPage({ params, searchParams }: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const listing = await resolveListingDetail(id);

  if (!listing) notFound();

  // Fixture-backed listings (dev/preview only) have non-UUID ids that must
  // never reach the uuid-typed seeker-state queries below.
  const isFixtureListing = isKnownDevDiscoveryFixtureId(listing.id);
  const isSourced = listing.provenanceInfo?.provenance === "sourced";
  const isDemoFixture = isFixtureListing && !isSourced;
  const autoApply = hasListingApplyIntent(query.apply);

  const { userId } = await optionalAuth();
  if (autoApply && !userId && !isSourced && !isDemoFixture) {
    redirect(signInHref("seeker", `/listing/${listing.id}?apply=1`));
  }
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

  // Visibility guard, defense-in-depth. In practice the read above uses the
  // ANON client and RLS (listings_select_public) only exposes status='live'
  // rows — so a non-live listing is null for EVERYONE, owner included, and
  // 404s before reaching this line. Owner preview of drafts is served by the
  // host dashboard (/host/listings), not this public route. The guard stays so
  // a future read-path change (e.g. fetching with the viewer's token) cannot
  // silently expose drafts to non-owners.
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

  // Location-aware weather is isolated behind a Suspense server boundary below,
  // so Open-Meteo can never hold the listing shell. Blank display names do not
  // create an empty location section; coordinates remain sufficient on their own.
  const coordinates =
    listing.latitude != null && listing.longitude != null
      ? { latitude: listing.latitude, longitude: listing.longitude }
      : null;
  const hasCoords = coordinates !== null;
  const hasLocation = Boolean(listing.locationDisplay?.trim()) || hasCoords;
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
  // Pay renders through the founder pay-display contract — never an inline
  // derivation. The old inline roll here ignored compensationMaxCents (a
  // ceiling-only listing printed "See listing", an invention the contract
  // names), printed a bare floor as if exact, and suffixed "/stipend". The
  // contract's exchangeAware suffix + "From " prefix + NOT_STATED_LABEL
  // fallback make this the same string every other pay surface shows.
  const paySummary = formatCompensation({
    summary: listing.compensationSummary,
    minCents: listing.compensationMinCents,
    maxCents: listing.compensationMaxCents,
    unit: listing.compensationUnit,
    currency: listing.compensationCurrency,
  });

  const dateLabel = formatListingWindow(listing);

  // Rail + triad state labels — one source (benefitStateLabel) for the words,
  // and the same comparison drives the muted "absence" styling, so copy and
  // treatment can never disagree.
  const evidence = listing.provenanceInfo?.benefitEvidence;
  const railHousingLabel = benefitStateLabel(listing.housingIncluded, evidence?.housing);
  const railMealsLabel = benefitStateLabel(listing.mealsIncluded, evidence?.meals);
  const railPayLabel = payStateLabel(paySummary, evidence?.pay);
  const railSeasonValue = listing.timelineSummary ?? dateLabel ?? NOT_STATED_LABEL;

  // The hero's written lede — composed from the same real state the page
  // renders (clause-per-fact; no date → no date text). See listingLede.ts.
  const heroLede = composeListingLede({
    categoryLabel: CATEGORY_LABEL[listing.category] ?? listing.category,
    hostName: listing.host?.companyName ?? null,
    locationDisplay: listing.locationDisplay,
    dateLabel: listing.timelineSummary ?? dateLabel,
  });

  // At-a-glance facts — each cell added ONLY when its underlying field is real.
  const glanceItems: GlanceItem[] = [];
  if (listing.locationDisplay) {
    glanceItems.push({ icon: "nav.map", label: "Location", value: listing.locationDisplay });
  }
  // The glance grid is a facts table, so an unstated window reads "Not stated"
  // here — the same word the Housing/Meals/Pay triad already uses for silence,
  // muted so absence never wears the styling of a fact.
  glanceItems.push({
    icon: "status.begins",
    label: "When",
    value: railSeasonValue,
    muted: railSeasonValue === NOT_STATED_LABEL,
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

  // The detail can be long, but its navigation must never point at an omitted
  // section. Resolve each conceptual destination to the first real heading in
  // that group, then build the compact mobile-first anchor list in page order.
  const hasDescription = Boolean(listing.description?.trim());
  const positionTarget: ListingSectionLink["href"] | null = hasDescription
    ? "#listing-about"
    : (listing.responsibilities?.length ?? 0) > 0
      ? "#listing-responsibilities"
      : (listing.requirements?.length ?? 0) > 0
        ? "#listing-requirements"
        : allPerks.length > 0
          ? "#listing-perks"
          : null;
  const contextLink: ListingSectionLink | null = hasLocation
    ? { href: "#listing-location", label: "Location" }
    : (listing.activities?.length ?? 0) > 0
      ? { href: "#listing-life", label: "Life here" }
      : connectivity
        ? { href: "#listing-connectivity", label: "Getting online" }
        : maritime
          ? { href: "#listing-maritime", label: "Vessel" }
          : null;
  const hasCompanyNarrative = Boolean(listing.whyWorkForUs?.trim());
  const hasTeam = (listing.team?.length ?? 0) > 0;
  const companyTarget: ListingSectionLink["href"] | null = hasCompanyNarrative
    ? "#listing-company"
    : hasTeam
      ? "#listing-team"
      : null;
  const sectionLinks: ListingSectionLink[] = [
    { href: "#listing-deal", label: "The deal" },
  ];
  if (listing.host) sectionLinks.push({ href: "#listing-host", label: "Host" });
  if (positionTarget) sectionLinks.push({ href: positionTarget, label: "Position" });
  if (contextLink) sectionLinks.push(contextLink);
  if (hasCoords) sectionLinks.push({ href: "#listing-weather", label: "Weather" });
  if (companyTarget) {
    sectionLinks.push({ href: companyTarget, label: "Company & team" });
  }

  // A sourced listing is unconfirmed inventory: it must NOT emit a JobPosting
  // (that structured type asserts a real hiring org + confirmed facts we don't
  // have) and its host block is structurally absent from the data anyway.
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
          lede={heroLede}
        />
        <ListingGallery title={listing.title} photoUrls={listing.galleryPhotoUrls} />

        <div className={styles.layout}>
        <div className={styles.content}>
          {/* Sourced disclosure — first, before any listing content. Renders
              only for sourced listings; verified listings are unaffected. */}
          <SourcedNotice listingId={listing.id} provenance={listing.provenanceInfo} />

          {/* 3. At a glance */}
          <ListingGlance items={glanceItems} />

          <ListingSectionNav links={sectionLinks} />

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

          {/* 6. Host — a clear route to the full public profile. */}
          {listing.host && (
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
          )}

          {/* 7. About the position */}
          {hasDescription ? (
            <ProseSection
              title="About the position"
              icon="system.info"
              headingId="listing-about"
              text={listing.description ?? ""}
            />
          ) : null}

          {/* 8. What you'll do */}
          <DetailList
            title="What you'll do"
            icon="profile.experience"
            markerIcon="system.success"
            headingId="listing-responsibilities"
            items={listing.responsibilities ?? []}
          />

          {/* 9. What we're looking for */}
          <DetailList
            title="What we're looking for"
            icon="profile.skills"
            markerIcon="action.forward"
            headingId="listing-requirements"
            items={listing.requirements ?? []}
          />

          {/* 10. Perks & benefits */}
          <DetailList
            title="Perks & benefits"
            icon="reaction.clap"
            markerIcon="system.success"
            headingId="listing-perks"
            variant="chips"
            items={allPerks}
          />

          {/* 11. About the location — place names remain useful even when the
              host has not supplied exact coordinates. */}
          {hasLocation ? (
            <LocationContext
              locationDisplay={listing.locationDisplay}
              latitude={listing.latitude}
              longitude={listing.longitude}
              category={listing.category}
            />
          ) : null}

          {/* 12. Location-aware weather — Open-Meteo requests ten days and the
              widget reports only the days the upstream actually returned. */}
          {coordinates ? (
            <Suspense
              fallback={<WeatherWidgetLoading locationLabel={listing.locationDisplay} />}
            >
              <ListingWeatherSection
                latitude={coordinates.latitude}
                longitude={coordinates.longitude}
                locationLabel={listing.locationDisplay}
              />
            </Suspense>
          ) : null}

          {/* 13. Life here */}
          <DetailList
            title="Life here"
            icon="reaction.hundred"
            markerIcon="nav.map"
            headingId="listing-life"
            subtitle="The place, off the clock."
            variant="chips"
            items={listing.activities ?? []}
          />

          {/* 14. Getting online — rendered ONLY when the host actually stated
              something, so a seeker never reads a wall of "Not stated" cells.
              Sits beside Weather/Location as part of "what is this place
              really like", not as a benefit (the triad stays three keys). */}
          {connectivity ? <ConnectivityFacts connectivity={connectivity} /> : null}

          {/* 15. The vessel — category depth (069). Sits beside connectivity as part of
              "what is this place really like", NOT near the triad: these are
              facts about the workplace, not a fourth thing the host is
              offering, and the triad is three keys by product law. */}
          {maritime ? <MaritimeFacts maritime={maritime} /> : null}

          {/* 16. About the company */}
          <WhyWorkForUs text={listing.whyWorkForUs ?? null} />

          {/* 17. Team */}
          <TeamGrid members={listing.team ?? []} />
        </div>

        {/* 16. The rail: a compact deal restatement (desktop only) + the
            actions — fixed bottom bar on mobile, sticky beside the content at
            >=1024px (page.module.css owns both postures; one ApplyButton). */}
        <aside className={styles.rail} aria-label="The deal and your next step">
          <div className={styles.railDeal}>
            <dl className={styles.railDealList}>
              <div className={styles.railDealRow}>
                <dt className={styles.railDealLabel}>Pay</dt>
                <dd
                  className={styles.railDealValue}
                  data-state={railPayLabel === NOT_STATED_LABEL ? "not_stated" : undefined}
                >
                  {railPayLabel}
                </dd>
              </div>
              <div className={styles.railDealRow}>
                <dt className={styles.railDealLabel}>Season</dt>
                <dd
                  className={styles.railDealValue}
                  data-state={railSeasonValue === NOT_STATED_LABEL ? "not_stated" : undefined}
                >
                  {railSeasonValue}
                </dd>
              </div>
              <div className={styles.railDealRow}>
                <dt className={styles.railDealLabel}>Housing</dt>
                <dd
                  className={styles.railDealValue}
                  data-state={railHousingLabel === NOT_STATED_LABEL ? "not_stated" : undefined}
                >
                  {railHousingLabel}
                </dd>
              </div>
              <div className={styles.railDealRow}>
                <dt className={styles.railDealLabel}>Meals</dt>
                <dd
                  className={styles.railDealValue}
                  data-state={railMealsLabel === NOT_STATED_LABEL ? "not_stated" : undefined}
                >
                  {railMealsLabel}
                </dd>
              </div>
            </dl>
          </div>
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
                autoApply={autoApply}
                isDemoFixture={isDemoFixture}
                resumeMissing={resumeMissing}
                isSourced={isSourced}
                sourceUrl={listing.provenanceInfo?.source?.sourceUrl ?? null}
              />
            </div>
          </div>
        </aside>
        </div>
      </div>
    </>
  );
}
