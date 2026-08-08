"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicHostListing, PublicHostProfile } from "@explore-and-earn/db";
import { Icon } from "@explore-and-earn/ui";

import { CaptureOnMount } from "../analytics/CaptureOnMount";
import { HOST_FUNNEL_EVENTS } from "../../lib/analytics";
import { getSitePhoto } from "../../lib/sitePhotos";
import { HostProfileHero } from "../host/HostProfileHero";
import { PublicListingCard } from "../host/PublicListingCard";
import { ListingCardGrid } from "../discovery/ListingCard";
import {
  DEMO_DATA_LABEL,
  DEMO_FLAGSHIP_ROLE,
  DEMO_LIVE_ROLES,
  DEMO_ORG,
  demoLiveListings,
  roleToDiscoveryListing,
  type DemoRole,
} from "./enterpriseDemo";
import { DemoLabel } from "./DemoLabel";
import styles from "./demoChrome.module.css";

/**
 * "View this experience as a seeker" (spec D20).
 *
 * THE COMPONENTS ARE THE REAL ONES. HostProfileHero is what renders a paying
 * host's public profile, PublicListingCard is what renders their roles on it,
 * and ListingCardGrid is what Seek, Swipe and Map render. All three take plain
 * typed props and no database handle, so the demo records feed them directly —
 * which is the entire value of this surface. A redrawn "preview" would be a
 * promise about the product rather than a look at it.
 *
 * WHAT IS OVERRIDDEN, AND WHY. Every card handler that would reach a database
 * row, a moderation queue, or a route that does not exist for a fixture is
 * replaced with a route inside this demo. Nothing here can apply, save, report,
 * or open a drawer that reads the listings table for an id that was never
 * written to it.
 *
 * THE AVATAR IS DELIBERATELY ABSENT. `photoUrl: null` makes the hero render its
 * placeholder rather than a photograph of a person standing in for a fictional
 * employer — the same rule that gives applicants initials instead of faces.
 */

function toPublicHostListing(role: DemoRole): PublicHostListing {
  const photo = getSitePhoto(role.photoSlug);
  return {
    id: role.id,
    title: role.title,
    category: role.category,
    // A local catalog rendition, not a remote host.
    coverPhotoUrl: photo.sizes.card.src,
    locationDisplay: DEMO_ORG.location,
    latitude: null,
    longitude: null,
    housingIncluded: role.housing.costCents === 0,
    mealsIncluded: role.meals.costCents === 0,
    compensationSummary: null,
    compensationMinCents: role.payMinCents,
    compensationMaxCents: role.payMaxCents,
    compensationUnit: "hour",
    compensationCurrency: "usd",
    publishedAt: null,
  };
}

export function DemoSeekerPreview({ id }: { readonly id?: string }) {
  const router = useRouter();

  const host: PublicHostProfile = useMemo(
    () => ({
      id: DEMO_ORG.id,
      companyName: DEMO_ORG.name,
      hostName: null,
      tagline: DEMO_ORG.tagline,
      about: DEMO_ORG.about,
      primaryLocationName: DEMO_ORG.location,
      photoUrl: null,
      websiteUrl: null,
      socialLinks: {},
      categoryScopes: [...new Set(DEMO_LIVE_ROLES.map((role) => role.category))],
      housingOfferedGenerally: true,
      mealsOfferedGenerally: true,
      verified: DEMO_ORG.verified,
      createdAt: null,
      whyWorkForUs: DEMO_ORG.about,
      activities: [
        "Crew paddle nights on the lake",
        "Trail runs before the morning block",
        "An end-of-season gathering on the point",
      ],
      perks: [
        "Housing included on every live role",
        "Two crew meals a day, seven days a week",
        "Season-completion bonus",
      ],
    }),
    [],
  );

  const listings = useMemo(() => demoLiveListings(), []);
  const flagship = useMemo(
    () => roleToDiscoveryListing(DEMO_FLAGSHIP_ROLE),
    [],
  );

  const overrides = useMemo(
    () => ({
      onOpen: () => router.push("/for-hosts/demo/job"),
      onHostClick: () => router.push("/for-hosts/demo/seeker-view"),
      onHousingClick: () => router.push("/for-hosts/demo/job"),
      onMealsClick: () => router.push("/for-hosts/demo/job"),
      onPayClick: () => router.push("/for-hosts/demo/job"),
      onLocationClick: () => router.push("/map"),
      // Nothing to report: these listings do not exist outside the fixtures.
      onReport: () => {},
    }),
    [router],
  );

  const coverPhoto = getSitePhoto(DEMO_ORG.coverPhotoSlug);

  return (
    <div id={id}>
      <CaptureOnMount
        event={HOST_FUNNEL_EVENTS.demoViewAsSeeker}
        properties={{ surface: "seeker" }}
      />

      <div className={styles.callout}>
        <p className={styles.calloutTitle}>
          You are looking at the seeker side of this demo workspace
        </p>
        <p className={styles.calloutBody}>
          The profile header, the opportunity cards, and the role tiles below are
          the production components a real seeker meets — fed with the same
          sample records the host side uses. Nothing here can apply, save, or
          report anything.
        </p>
        <Link className={styles.attentionLink} href="/for-hosts/demo">
          <Icon name="action.back" size={14} aria-hidden />
          Back to the host workspace
        </Link>
        <DemoLabel text={DEMO_DATA_LABEL} />
      </div>

      <HostProfileHero
        host={host}
        coverPhotoUrl={coverPhoto.sizes.hero.src}
        listingCount={DEMO_LIVE_ROLES.length}
      />

      <div className={styles.panel} id="listings">
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Opportunities on this profile</h2>
            <p className={styles.panelNote}>
              Rendered by PublicListingCard — the component the real host public
              profile uses, with its crawlable &ldquo;view opportunity&rdquo;
              link intact.
            </p>
          </div>
          <DemoLabel text={DEMO_DATA_LABEL} />
        </div>
        <div className={styles.roleGrid}>
          {DEMO_LIVE_ROLES.map((role, index) => (
            <PublicListingCard
              key={role.id}
              listing={toPublicHostListing(role)}
              hostName={DEMO_ORG.name}
              hostVerified={DEMO_ORG.verified}
              priority={index === 0}
            />
          ))}
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>
              The flagship role, as Seek and Swipe render it
            </h2>
            <p className={styles.panelNote}>
              The same DiscoveryCard, on the matched surface, so the housing,
              meals and pay triad and the match meter appear exactly as a seeker
              sees them.
            </p>
          </div>
          <DemoLabel text={DEMO_DATA_LABEL} />
        </div>
        <ListingCardGrid
          listings={[flagship]}
          surface="matched"
          overrides={overrides}
          className={styles.cardHolder}
          eagerCount={1}
        />
      </div>

      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h2 className={styles.panelTitle}>Every live role in the feed</h2>
            <p className={styles.panelNote}>
              What a seeker filtering on housing and meals would find from this
              employer today.
            </p>
          </div>
          <DemoLabel text={DEMO_DATA_LABEL} />
        </div>
        <ListingCardGrid
          listings={listings}
          surface="discovery_feed"
          overrides={overrides}
          className={styles.cardHolder}
        />
      </div>

      <div className={styles.linkRow}>
        <Link className={styles.primaryCta} href="/sign-up?role=host">
          <Icon name="nav.host" size={18} aria-hidden />
          Build your host profile
        </Link>
        <Link className={styles.ghostCta} href="/for-hosts/demo">
          Back to the host workspace
        </Link>
      </div>
    </div>
  );
}
