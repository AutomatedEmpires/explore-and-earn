"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import {
  ListingCard,
  ListingCardProvider,
  type DiscoveryListing,
} from "../discovery";
import { SitePhoto } from "../media/SitePhoto";
import { FeaturedEmployersRail, type FeaturedEmployer } from "../public/FeaturedEmployersRail";
import {
  HOME_CATEGORIES,
  HOME_HERO_ROTATION,
  LANE_PHOTO,
  type HomeAnnouncement,
  type HomeDestination,
  type AnnouncementLabel,
  HOUSE_ANNOUNCEMENT_LABEL,
} from "./home-data";
import styles from "./MarketplaceHome.module.css";

interface MarketplaceHomeProps {
  readonly listings: readonly DiscoveryListing[];
  readonly employers: readonly FeaturedEmployer[];
  readonly destinations: readonly HomeDestination[];
  readonly announcements: readonly HomeAnnouncement[];
  /** Server-picked HOME_HERO_ROTATION index — see HomeHero for why. */
  readonly heroIndex?: number;
}

// ─── Small shared pieces ───────────────────────────────────────────────────

function SectionHead({
  id,
  eyebrow,
  title,
  sub,
  seeAllHref,
  seeAllLabel,
  emphasis,
}: {
  /** Heading id — sections reference it via aria-labelledby. */
  id: string;
  eyebrow: string;
  title: string;
  sub?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
  /** Bumps the title to the display-section scale (a louder section headline). */
  emphasis?: boolean;
}) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionHeadText}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2
          id={id}
          className={`${styles.sectionTitle}${emphasis ? ` ${styles.sectionTitleEmphasis}` : ""}`}
        >
          {title}
        </h2>
        {sub ? <p className={styles.sectionSub}>{sub}</p> : null}
      </div>
      {seeAllHref ? (
        <Link className={styles.seeAll} href={seeAllHref}>
          {seeAllLabel ?? "See all"}
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

// The signature promise — the triad reads instantly, nothing diluting it.
const TRIAD_BADGES: ReadonlyArray<{ key: string; labelKey: "triadHousing" | "triadMeals" | "triadPay"; icon: IconKey }> = [
  { key: "housing", labelKey: "triadHousing", icon: "benefit.housing" },
  { key: "meals", labelKey: "triadMeals", icon: "benefit.meals" },
  { key: "pay", labelKey: "triadPay", icon: "benefit.pay" },
];

// ─── Hero ──────────────────────────────────────────────────────────────────

function HomeHero({ heroIndex = 0 }: { heroIndex?: number }) {
  const router = useRouter();
  const t = useTranslations("Home");
  const tc = useTranslations("Common");
  const [role, setRole] = useState("");
  const [loc, setLoc] = useState("");
  const [category, setCategory] = useState("");

  // Dynamic hero — rotation index is picked SERVER-side per landing and passed
  // down (review 2026-07-22): the band that renders on the server is the one
  // that stays on screen. The previous post-mount random pick swapped the hero
  // after hydration on most visits. Server value rides the RSC payload, so SSR
  // and hydration always agree.
  const hero = HOME_HERO_ROTATION[heroIndex % HOME_HERO_ROTATION.length] ?? HOME_HERO_ROTATION[0];
  const heroCategory = hero.category;

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (role.trim()) params.set("q", role.trim());
    // /seek reads the location filter from `location` (freeform substring match).
    if (loc.trim()) params.set("location", loc.trim());
    if (category) params.set("category", category);
    const qs = params.toString();
    router.push(qs ? `/seek?${qs}` : "/seek");
  };

  return (
    <section className={styles.hero} aria-labelledby="home-hero-title">
      <div className={`${styles.heroFrame} ${styles[`cover_${heroCategory}`]}`}>
        {/* THE PHOTOGRAPH IS THE HERO (V2 §16). It sits behind the scrim as a
            real <Image> with its catalogue dimensions, priority-loaded because
            it is unambiguously the LCP element. The lane cover gradient stays
            on the frame beneath it as the paint-before-decode ground, so the
            band is never a white hole while the photo loads. */}
        <div className={styles.heroMedia}>
          {/* ALT COMES FROM THE CATALOGUE, not alt="". This is a photograph of
              a real place and the page is about places to work in — describing
              the scene is content, not noise. The small lane tiles below stay
              decorative, because there the label beside the image already says
              what it is. */}
          <SitePhoto
            slug={hero.photoSlug}
            size="hero"
            priority
            className={styles.heroPhoto}
            sizes="100vw"
          />
        </div>
        <div className={styles.heroScrim} aria-hidden="true" />

        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>
            <span className={styles.liveDot} aria-hidden="true" />
            {t("eyebrow")}
          </p>
          {/* ONE dominant message. The anthem carried a "promise" line and a
              "sub" line beneath it, which made three competing statements in
              the first screen and left the search field below the fold on a
              phone. The promise is now the single supporting line and the
              free-forever claim moved to the band that explains it. */}
          <h1 id="home-hero-title" className={styles.heroAnthem}>
            {t("anthemLine1")}
            <br />
            {t("anthemLine2")}
          </h1>
          <p className={styles.heroPromise}>{t("promise")}</p>

          <form className={styles.searchBar} onSubmit={onSearch} role="search" aria-label="Search opportunities">
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>{t("searchRoleLabel")}</span>
              <input
                className={styles.searchInput}
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder={t("searchRolePlaceholder")}
              />
            </label>
            <span className={styles.searchDivider} aria-hidden="true" />
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>{t("searchWhereLabel")}</span>
              <input
                className={styles.searchInput}
                type="text"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                placeholder={t("searchWherePlaceholder")}
              />
            </label>
            <span className={styles.searchDivider} aria-hidden="true" />
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>{t("searchCategoryLabel")}</span>
              <select
                className={styles.searchSelect}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label={t("searchCategoryLabel")}
              >
                <option value="">{t("categoryAll")}</option>
                <option value="farm">{t("categoryFarm")}</option>
                <option value="maritime">{t("categoryMaritime")}</option>
                <option value="remote">{t("categoryRemote")}</option>
                <option value="seasonal">{t("categorySeasonal")}</option>
              </select>
            </label>
            <button className={styles.searchSubmit} type="submit">
              <Icon name="action.search" size={20} aria-hidden />
              <span>{tc("exploreJobs")}</span>
            </button>
          </form>

          <ul className={styles.trustBadges} aria-label="What every listing shows upfront">
            {TRIAD_BADGES.map((b) => (
              <li key={b.key} className={styles.trustBadge}>
                <Icon name={b.icon} size={16} aria-hidden />
                {t(b.labelKey)}
              </li>
            ))}
          </ul>

          {/*
            The seeker's zero-input path into inventory (UX review 2026-07-23).
            Before this the hero's ONLY standalone button was "Post a job" — a
            HOST action — so the seeker, who is the primary audience, could not
            reach a single opportunity from the hero without first engaging a
            three-field search form. A first-time visitor does not yet know
            what to type. Browsing must never require input.
          */}
          <div className={styles.heroCtas}>
            <Link className={styles.heroPrimary} href="/jobs">
              Browse all opportunities
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
            <Link className={styles.heroHostLink} href="/for-hosts">
              {tc("postAJob")}
            </Link>
          </div>
        </div>
        {/* The floating "peek" card is GONE. It duplicated the opportunity row
            that now sits directly beneath the fold, competed with the anthem
            for the first look, and — being absolutely positioned over the
            photograph — was the one element that made the hero unreadable at
            tablet widths. Real cards, at full size, one scroll down. */}
      </div>
    </section>
  );
}

// ─── Three questions (the product thesis) ──────────────────────────────────

const THREE_QUESTIONS: ReadonlyArray<{
  key: "housing" | "meals" | "pay";
  label: string;
  question: string;
  line: string;
  icon: IconKey;
}> = [
  {
    key: "housing",
    label: "Housing",
    question: "Where will I sleep?",
    line: "Cabin, bunkhouse, or crew quarters — named on the listing.",
    icon: "benefit.housing",
  },
  {
    key: "meals",
    label: "Meals",
    question: "What will I eat?",
    line: "Provided, stipend, or kitchen access — spelled out.",
    icon: "benefit.meals",
  },
  {
    key: "pay",
    label: "Pay",
    question: "What will I earn?",
    line: "Real numbers, before you apply.",
    icon: "benefit.pay",
  },
];

function ThreeQuestions() {
  return (
    <section className={styles.section} aria-labelledby="triad-title">
      <div className={styles.triadBand}>
        <div className={styles.triadHead}>
          <p className={styles.triadEyebrow}>The deal, upfront</p>
          {/* Was "Every listing answers three questions. Always." — which
              sourced listings falsify. Migration 070's publication gate blocks
              a HOST-posted listing from going live while any of the three is
              unanswered, but its check begins `provenance = 'sourced' or`, and
              ingested rows are inserted live with evidence 'not_stated'. So the
              absolute was true only while there was no sourced inventory.
              The guarantee we can actually keep is the stronger one anyway: we
              never guess on the seeker's behalf. */}
          <h2 id="triad-title" className={styles.triadTitle}>
            Every listing answers three questions — or shows you what wasn&apos;t stated.
          </h2>
        </div>
        <div className={styles.triadGrid}>
          {THREE_QUESTIONS.map((q) => (
            <div key={q.key} className={`${styles.triadCard} ${styles[`triad_${q.key}`]}`}>
              <span className={styles.triadIcon}>
                <Icon name={q.icon} size={24} aria-hidden />
              </span>
              <span className={styles.triadText}>
                <span className={styles.triadLabel}>{q.label}</span>
                <span className={styles.triadQuestion}>{q.question}</span>
                <span className={styles.triadLine}>{q.line}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Rolling announcements ─────────────────────────────────────────────────

const ANNOUNCEMENT_TONE: Record<AnnouncementLabel, string> = {
  "Featured Host": styles.tagFeatured,
  Boosted: styles.tagBoosted,
  Sponsored: styles.tagSponsored,
  Enterprise: styles.tagEnterprise,
  // Computed key, not a repeated literal: keyed off the constant so renaming the
  // house label cannot leave this map silently missing it. Record<> checks the
  // key SET at compile time but would not catch a literal drifting from the
  // source of truth — the lookup would just return undefined and the chip would
  // render with no tone, i.e. visually indistinguishable from a paid one.
  // (Raised by Copilot on PR 277.)
  [HOUSE_ANNOUNCEMENT_LABEL]: styles.tagHouse,
};

function AnnouncementRail({ items }: { items: readonly HomeAnnouncement[] }) {
  if (items.length === 0) return null;

  // "Hiring now" is a claim about the marketplace, not about the rail. When the
  // only card is our own invitation — an empty marketplace — nobody is hiring,
  // so the kicker and the section name must not say otherwise.
  const houseOnly = items.every((a) => a.label === HOUSE_ANNOUNCEMENT_LABEL);

  return (
    <section
      className={styles.announceSection}
      aria-label={houseOnly ? "From Explore & Earn" : "Featured host announcements"}
    >
      <div className={styles.announceHeadRow}>
        <span className={styles.announceKicker}>
          <Icon name="nav.announcements" size={16} aria-hidden />
          {houseOnly ? "From Explore & Earn" : "Hiring now"}
        </span>
      </div>
      <div className={styles.announceScroller}>
        <ul className={styles.announceTrack} role="list">
          {items.map((a) => (
            <li key={a.id} className={styles.announceItem}>
              <Link className={`${styles.announceCard} ${styles[`cat_${a.category}`]}`} href={a.href}>
                <span className={`${styles.announceTag} ${ANNOUNCEMENT_TONE[a.label]}`}>{a.label}</span>
                <span className={styles.announceText}>{a.text}</span>
                <Icon name="action.forward" size={16} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Featured jobs (real DiscoveryCard grid) ───────────────────────────────

function FeaturedJobs({ listings }: { listings: readonly DiscoveryListing[] }) {
  const router = useRouter();
  // THREE cards, not six (V2 §16). Six filled the first scroll with a wall of
  // inventory before the page had explained what makes a listing here
  // different; three is a sample, and "browse all" is one click away.
  const shown = listings.slice(0, 3);

  return (
    <section className={styles.section} aria-labelledby="featured-jobs-title">
      <SectionHead
        id="featured-jobs-title"
        eyebrow="Open now"
        title="Real roles, open right now"
        sub="Housing, meals, and pay on every card — no digging."
        seeAllHref="/seek"
        seeAllLabel="Browse all jobs"
      />
      {shown.length === 0 ? (
        <div className={styles.emptyPanel}>
          <Icon name="status.open" size={24} aria-hidden />
          {/* Was "The first season is being staffed." / "Hosts are onboarding
              now." — both assert activity nothing here can evidence. This block
              renders whenever the list is empty, so on a marketplace with no
              listings and no paying hosts it told every visitor that staffing
              and onboarding were underway. Same defect as the "Featured Host"
              house card; it just lived in the empty state too.
              (No PR numbers here: the G50 ratchet reads a leading-hash number
              as a hex colour and fails the build.) */}
          <p className={styles.emptyTitle}>No roles listed yet.</p>
          <p className={styles.emptySub}>
            We only publish opportunities that answer housing, meals and pay upfront —
            so this stays empty until they do.
          </p>
          <Link className={styles.heroPrimary} href="/seek">
            Explore the marketplace
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      ) : (
        // Mirror /seek (DiscoveryFeed): the triad, host, card body, and report
        // flag open popups in place; only Apply and Location route. The shared
        // host resolves against the FULL prop list (a host popup can point at a
        // sibling outside the six shown), and the Report drawer is now wired
        // too (was missing before this migration).
        <ListingCardProvider
          listings={listings}
          overrides={{ onApply: (id) => router.push(`/listing/${id}`) }}
        >
          <div className={styles.jobsGrid}>
            {shown.map((listing, index) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                surface="discovery_feed"
                imageLoading={index < 2 ? "eager" : "lazy"}
              />
            ))}
          </div>
        </ListingCardProvider>
      )}
    </section>
  );
}

// ─── Discover your way (Seek · Swipe · Map) ────────────────────────────────

const DISCOVER_MODES: ReadonlyArray<{
  key: "seek" | "swipe" | "map";
  name: string;
  promise: string;
  icon: IconKey;
  href: string;
}> = [
  { key: "seek", name: "Seek", promise: "Browse the whole grid — filter by lane, season & pay.", icon: "nav.seek", href: "/seek" },
  { key: "swipe", name: "Swipe", promise: "One opportunity at a time. Save it or let it go.", icon: "nav.swipe", href: "/swipe" },
  { key: "map", name: "Map", promise: "See the season on a map — browse by state or region.", icon: "nav.map", href: "/map" },
];

function DiscoverModes({ listings }: { listings: readonly DiscoveryListing[] }) {
  // Honest map preview (D5, commercial redesign 2026-07-27): real listing
  // rows instead of a decorative fake-map canvas. Prefer listings that carry
  // real coordinates (what /map would actually plot); fall back to the same
  // listings the rest of the homepage already shows so the card never lies
  // by going empty when there's real inventory, just uncoordinated inventory.
  const pinnable = listings.filter((l) => l.coordinates);
  const mapListings = pinnable.length > 0 ? pinnable : listings;
  const shownPins = mapListings.slice(0, 4);
  const totalOnMap = mapListings.length;

  return (
    <section className={styles.section} aria-labelledby="discover-title">
      <SectionHead
        id="discover-title"
        eyebrow="Discover your way"
        title="Three ways in — same honest listings"
        sub="Location is a feeling, not a filter. Pick the lens that fits how you wander."
      />
      <div className={styles.modeGrid}>
        {DISCOVER_MODES.map((m, i) => (
          <Link
            key={m.key}
            className={`${styles.modeCard} ${styles.reveal}`}
            href={m.href}
            style={{ "--reveal-index": i } as CSSProperties}
          >
            {m.key === "map" ? (
              <span className={styles.mapPreview} aria-hidden="true">
                {shownPins.length > 0 ? (
                  <>
                    {shownPins.map((l) => (
                      <span key={l.id} className={styles.mapPreviewRow}>
                        <span className={`${styles.mapPreviewPin} ${styles[`pin_${l.category}`]}`}>
                          <Icon name="nav.map" size={12} aria-hidden />
                        </span>
                        <span className={styles.mapPreviewText}>
                          <span className={styles.mapPreviewLocation}>{l.location}</span>
                          <span className={styles.mapPreviewTitle}>{l.title}</span>
                        </span>
                      </span>
                    ))}
                    <span className={styles.mapPreviewCount}>
                      {totalOnMap} location{totalOnMap === 1 ? "" : "s"} on the map
                    </span>
                  </>
                ) : (
                  <span className={styles.mapPreviewEmpty}>Locations will appear here as hosts publish.</span>
                )}
              </span>
            ) : null}
            <span className={styles.modeBody}>
              <span className={styles.modeIcon}>
                <Icon name={m.icon} size={24} aria-hidden />
              </span>
              <span className={styles.modeText}>
                <span className={styles.modeName}>{m.name}</span>
                <span className={styles.modePromise}>{m.promise}</span>
              </span>
              <span className={styles.modeArrow} aria-hidden="true">
                <Icon name="action.forward" size={16} aria-hidden />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Browse by category ────────────────────────────────────────────────────

function CategoryGrid() {
  return (
    <section className={styles.section} aria-labelledby="categories-title">
      <SectionHead
        id="categories-title"
        eyebrow="Browse"
        title="Browse by category"
        sub="Pick a lane — the work looks like the place."
      />
      <div className={styles.categoryGrid}>
        {HOME_CATEGORIES.map((c, i) => (
          <Link
            key={c.key}
            className={`${styles.categoryCard} ${styles[`cover_${c.imageCategory}`]} ${styles.reveal}`}
            href={c.href}
            style={{ "--reveal-index": i % 4 } as CSSProperties}
          >
            <span className={styles.categoryImageWrap}>
              {/* A real photograph, decorative because the label beside it
                  carries the meaning. This band used to be the lane gradient
                  and nothing else — four coloured slabs where the work should
                  have been. */}
              <SitePhoto
                slug={LANE_PHOTO[c.imageCategory]}
                size="card"
                decorative
                className={styles.categoryPhoto}
                sizes="(min-width: 900px) 18rem, 50vw"
              />
              <span className={styles.categoryScrim} aria-hidden="true" />
            </span>
            <span className={styles.categoryBody}>
              <span className={styles.categoryLabel}>{c.label}</span>
              <span className={styles.categoryBlurb}>{c.blurb}</span>
            </span>
            <span className={styles.categoryArrow} aria-hidden="true">
              <Icon name="action.forward" size={16} aria-hidden />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Where will you go next? (destinations) ────────────────────────────────

function DestinationGrid({ destinations }: { destinations: readonly HomeDestination[] }) {
  // No destination has live inventory → render nothing rather than a wall of
  // cards that all land on empty results (UX review 2026-07-23). buildDestinations
  // already filters to real inventory in production.
  if (destinations.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="destinations-title">
      <SectionHead
        id="destinations-title"
        eyebrow="Destinations"
        title="Where will you go next?"
        sub="Discover where to work next — before you commit."
        seeAllHref="/map"
        seeAllLabel="Open the map"
        emphasis
      />
      <div className={styles.destinationGrid}>
        {destinations.map((d, i) => (
          <Link
            key={d.slug}
            className={`${styles.destinationCard} ${styles.reveal}`}
            href={d.href}
            style={{ "--reveal-index": i % 3 } as CSSProperties}
          >
            <span
              className={`${styles.destinationImageWrap} ${styles[`cover_${d.imageCategory}`]}`}
            >
              <SitePhoto
                slug={LANE_PHOTO[d.imageCategory]}
                size="card"
                decorative
                className={styles.destinationPhoto}
                sizes="(min-width: 900px) 24rem, 100vw"
              />
              <span className={styles.destinationScrim} aria-hidden="true" />
              <span className={styles.destinationSeason}>
                <Icon name="status.seasonal" size={16} aria-hidden />
                {d.season}
              </span>
            </span>
            <span className={styles.destinationBody}>
              <span className={styles.destinationTopRow}>
                <span className={styles.destinationName}>{d.name}</span>
                {d.jobCount !== undefined ? (
                  <span className={styles.destinationCount}>
                    {d.jobCount} jobs{d.hostCount !== undefined ? ` · ${d.hostCount} hosts` : ""}
                  </span>
                ) : (
                  <span className={styles.destinationNew}>New season</span>
                )}
              </span>
              <span className={styles.destinationCats}>{d.categories.join(" · ")}</span>
              <span className={styles.destinationCta}>
                Explore {d.name}
                <Icon name="action.forward" size={16} aria-hidden />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── How it works — seeker ─────────────────────────────────────────────────

const SEEKER_STEPS: ReadonlyArray<{ title: string; body: string; icon: IconKey }> = [
  {
    icon: "nav.seek",
    title: "Browse before you commit to anything",
    body: "Seek, Swipe and Map are open without an account. Every card carries housing, meals and pay whether you are signed in or not.",
  },
  {
    icon: "nav.profile",
    title: "Build a profile when you want to apply",
    body: "Say when you are free, what you can do, and what a season has to provide. Three short steps, every one of them skippable.",
  },
  {
    icon: "status.match",
    title: "See why you matched",
    body: "The score comes from what both sides stated — your dates against theirs, the benefits you need against the ones offered. The reasons are always shown, including the ones that say a field was left blank.",
  },
  {
    icon: "status.applied",
    title: "Track it in one place",
    body: "Saved roles, applications, invitations and messages live in your dashboard. A host messages you inside the application they are messaging you about.",
  },
];

function HowItWorksSeeker() {
  return (
    <section className={styles.section} aria-labelledby="how-seeker-title">
      <SectionHead
        id="how-seeker-title"
        eyebrow="How it works — seekers"
        title="Four steps, and the first one asks nothing of you"
        sub="Free forever. Seekers never pay on Explore & Earn; hosts fund the marketplace."
      />
      <ol className={styles.stepGrid}>
        {SEEKER_STEPS.map((step, index) => (
          <li key={step.title} className={styles.stepCard}>
            <span className={styles.stepNumber} aria-hidden>{index + 1}</span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>
                <Icon name={step.icon} size={18} aria-hidden />
                {step.title}
              </span>
              <span className={styles.stepBody}>{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className={styles.stepActions}>
        <Link className={styles.solidCta} href="/for-seekers">
          What seekers get
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
        <Link className={styles.quietCta} href="/seek">
          Or just start browsing
        </Link>
      </div>
    </section>
  );
}

// ─── Employer profile preview ──────────────────────────────────────────────

/**
 * A SNIPPET, not a copy of the host page's profile card. It shows the SHAPE of
 * an employer profile — the fields every listing inherits — and links to the
 * demo workspace where the real thing is rendered by the real components. No
 * organisation is named here and no figure is quoted, because a homepage
 * illustration is exactly the place a fabricated employer would go unnoticed.
 */
const PROFILE_FIELDS: ReadonlyArray<{ label: string; value: string }> = [
  { label: "Season", value: "Stated by the host" },
  { label: "Crew size", value: "Stated by the host" },
  { label: "Housing", value: "Structured field" },
  { label: "Meals", value: "Structured field" },
];

function EmployerProfilePreview() {
  return (
    <section className={styles.section} aria-labelledby="employer-title">
      <div className={styles.splitBand}>
        <div className={styles.splitCopy}>
          <p className={styles.eyebrow}>Employer profiles</p>
          <h2 id="employer-title" className={styles.splitTitle}>
            You are looking at a place, not just a posting
          </h2>
          <p className={styles.splitSub}>
            Every role hangs off one employer profile carrying the season, the
            crew, the housing and the meals. Open any listing and you can reach
            the organisation behind it — which is how you tell a real operation
            from a job title.
          </p>
          <Link className={styles.quietCta} href="/for-hosts/demo/profile">
            See a profile in the demo workspace
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
        <div className={styles.profileSnippet}>
          <div className={styles.profileSnippetMedia}>
            <SitePhoto
              slug="lodge-03"
              size="card"
              decorative
              className={styles.profileSnippetPhoto}
              sizes="(min-width: 900px) 24rem, 100vw"
            />
          </div>
          <dl className={styles.profileSnippetFacts}>
            {PROFILE_FIELDS.map((field) => (
              <div key={field.label} className={styles.profileSnippetRow}>
                <dt className={styles.profileSnippetLabel}>{field.label}</dt>
                <dd className={styles.profileSnippetValue}>{field.value}</dd>
              </div>
            ))}
          </dl>
          <p className={styles.profileSnippetNote}>
            The shape of an employer profile. Real ones are filled in by the
            host.
          </p>
        </div>
      </div>
    </section>
  );
}

// ─── Community value ───────────────────────────────────────────────────────

const COMMUNITY_TOPICS: ReadonlyArray<{ label: string; icon: IconKey }> = [
  { label: "Photos from the season", icon: "nav.photos" },
  { label: "Housing & meals intel", icon: "benefit.housing" },
  { label: "Gear & road-trip advice", icon: "benefit.transport" },
  { label: "Announcements from hiring hosts", icon: "nav.announcements" },
];

function CommunityValue() {
  return (
    <section className={styles.section} aria-labelledby="community-title">
      {/* Copy first in the DOM so the heading leads the reading order; the
          photograph is raised above it on a phone by .splitMedia's `order`,
          and sits in the band's narrow second column on desktop. */}
      <div className={styles.splitBand}>
        <div className={styles.splitCopy}>
          <p className={styles.eyebrow}>Community</p>
          <h2 id="community-title" className={styles.splitTitle}>
            The listing says what&rsquo;s open. Seekers say what it&rsquo;s like.
          </h2>
          <p className={styles.splitSub}>
            Community is a seeker space, behind a sign-in. The people posting are
            sharing where they live and work for a season, and that is not
            something to publish to the open web.
          </p>
          <ul className={styles.topicList} role="list">
            {COMMUNITY_TOPICS.map((topic) => (
              <li key={topic.label} className={styles.topicRow}>
                <Icon name={topic.icon} size={16} aria-hidden />
                {topic.label}
              </li>
            ))}
          </ul>
          <Link className={styles.quietCta} href="/community">
            Sign in to open Community
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
        <div className={styles.splitMedia}>
          <SitePhoto
            slug="crew-03"
            size="card"
            className={styles.splitPhoto}
            sizes="(min-width: 900px) 28rem, 100vw"
          />
        </div>
      </div>
    </section>
  );
}

// ─── Trust & safety ────────────────────────────────────────────────────────

/**
 * Every line here is a MECHANISM that exists in the product, phrased as what it
 * refuses rather than what it promises. Nothing on this band is a statistic, a
 * testimonial or a badge count — those are the three things a trust section
 * reaches for when it has nothing real to say.
 */
const TRUST_POINTS: ReadonlyArray<{ title: string; body: string; icon: IconKey }> = [
  {
    icon: "system.lock",
    title: "A listing that dodges the question cannot go live",
    body: "Housing, meals and pay are publication requirements for a host-posted role, enforced by the database rather than by a reviewer's patience.",
  },
  {
    icon: "trust.verified_host",
    title: "The verified badge is earned, not declared",
    body: "It tracks an active host subscription. A host cannot switch it on by typing their own company name into a field.",
  },
  {
    icon: "system.info",
    title: "“Not stated” instead of a guess",
    body: "Some listings are sourced from elsewhere and say so. Where a fact is missing, the card says it is missing — we never estimate a wage or invent a housing arrangement on your behalf.",
  },
  {
    icon: "action.report",
    title: "Messaging and reporting stay on the platform",
    body: "Conversations sit beside the application they belong to, and any listing or post can be reported from the surface you found it on.",
  },
];

function TrustSafety() {
  return (
    <section className={styles.section} aria-labelledby="trust-title">
      <SectionHead
        id="trust-title"
        eyebrow="Trust & safety"
        title="What we refuse to do"
        sub="The rules below are enforced in the product, not stated in a policy nobody reads."
      />
      <div className={styles.trustGrid}>
        {TRUST_POINTS.map((point) => (
          <article key={point.title} className={styles.trustCard}>
            <span className={styles.trustIcon} aria-hidden>
              <Icon name={point.icon} size={20} />
            </span>
            <h3 className={styles.trustTitle}>{point.title}</h3>
            <p className={styles.trustBody}>{point.body}</p>
          </article>
        ))}
      </div>
      <Link className={styles.quietCta} href="/sourced-listings">
        How sourced listings are labelled
        <Icon name="action.forward" size={16} aria-hidden />
      </Link>
    </section>
  );
}

// ─── Host CTA band (build-first) ───────────────────────────────────────────

/**
 * BUILD-FIRST COPY (D6/D7). The plan grid that used to live here is gone from
 * the homepage: it made billing the third thing a prospective host saw, which
 * is the funnel the founder rejected, and it was a second pricing surface to
 * keep in step with /for-hosts and /host/plans (D21 wants ONE). What remains
 * says what a host can do before paying anything, and links to the page that
 * shows it.
 */
const HOST_BUILD_STEPS: ReadonlyArray<{ title: string; body: string; icon: IconKey }> = [
  {
    icon: "nav.host",
    title: "Build your profile",
    body: "Create an account and brand your employer profile. No card, no plan.",
  },
  {
    icon: "status.draft",
    title: "Draft your roles",
    body: "Write the listings and preview exactly what a seeker will see, including the triad.",
  },
  {
    icon: "action.view",
    title: "Walk the whole workspace",
    body: "The demo runs the real product on sample data — pipeline, messages, analytics.",
  },
  {
    icon: "system.success",
    title: "Activate when you want to publish",
    body: "A plan is what makes a role publishable and discoverable. Prices are published; annual is ten monthly payments.",
  },
];

function HostCtaBand() {
  return (
    <section
      id="plans"
      className={`${styles.section} ${styles.hostSection}`}
      aria-labelledby="host-title"
    >
      <div className={styles.hostHead}>
        <p className={styles.eyebrow}>For hosts &amp; employers</p>
        <h2 id="host-title" className={styles.hostTitle}>
          Build it first. Pay when you publish.
        </h2>
        <p className={styles.hostSub}>
          Seekers never pay to find work — hosts fund the marketplace. You can
          create your profile, draft every role and tour the whole workspace
          before a plan is involved.
        </p>
      </div>

      <ol className={styles.hostSteps}>
        {HOST_BUILD_STEPS.map((step, index) => (
          <li key={step.title} className={styles.hostStep}>
            <span className={styles.hostStepNumber} aria-hidden>{index + 1}</span>
            <span className={styles.hostStepTitle}>
              <Icon name={step.icon} size={18} aria-hidden />
              {step.title}
            </span>
            <span className={styles.hostStepBody}>{step.body}</span>
          </li>
        ))}
      </ol>

      <div className={styles.hostActions}>
        <Link className={styles.heroPrimary} href="/for-hosts">
          See the host product
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
        <Link className={styles.heroSecondary} href="/for-hosts/demo">
          Explore the live demo
        </Link>
      </div>
    </section>
  );
}

// ─── Final CTA (seeker) ────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className={styles.finalCta} aria-labelledby="final-title">
      <div className={styles.finalInner}>
        <p className={styles.finalEyebrow}>Seek it, swipe it, or find it on the map</p>
        <h2 id="final-title" className={styles.finalTitle}>Discover where to work next.</h2>
        <p className={styles.finalSub}>
          Built for seekers, by seekers. Housing, meals, pay, and location — always upfront.
        </p>
        <div className={styles.finalActions}>
          <Link className={styles.finalPrimary} href="/seek">
            Explore jobs
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
          <Link className={styles.finalGhost} href="/for-seekers">
            What seekers get
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Orchestrator ──────────────────────────────────────────────────────────

export function MarketplaceHome({
  listings,
  employers,
  destinations,
  announcements,
  heroIndex,
}: MarketplaceHomeProps) {
  /*
   * V2 §16 sequence: photograph + one message + search → what makes a listing
   * different → real inventory → how to find it → how it works for a seeker →
   * what an employer profile is → paid rails → community → trust → the host
   * door → the seeker door.
   *
   * The plan grid left this page with HostPitch (see HostCtaBand). The floating
   * hero "peek" left with the hero photograph. Category and destination tiles
   * survive — they are the crawlable route into /jobs/{lane} — but they paint
   * photographs now instead of the lane gradient.
   */
  return (
    <div className={styles.home}>
      <HomeHero heroIndex={heroIndex} />
      <ThreeQuestions />
      <FeaturedJobs listings={listings} />
      <DiscoverModes listings={listings} />
      <HowItWorksSeeker />
      <EmployerProfilePreview />
      <CategoryGrid />
      <DestinationGrid destinations={destinations} />

      {/* Paid rails — announcements + featured employers. Server-rendered: an
          empty employer set is real emptiness, not loading — skip the rail
          rather than show skeletons that never resolve. */}
      <AnnouncementRail items={announcements} />
      {employers.length > 0 ? <FeaturedEmployersRail employers={employers} /> : null}

      <CommunityValue />
      <TrustSafety />
      <HostCtaBand />
      <FinalCta />
    </div>
  );
}
