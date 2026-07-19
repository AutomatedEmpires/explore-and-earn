"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconKey } from "@explore-and-earn/ui";

import {
  ListingCard,
  ListingCardProvider,
  type DiscoveryListing,
} from "../discovery";
import { FeaturedEmployersRail, type FeaturedEmployer } from "../public/FeaturedEmployersRail";
import {
  HOME_CATEGORIES,
  HOME_PLANS,
  HOME_HERO_ROTATION,
  formatUsd,
  type HomeAnnouncement,
  type HomeDestination,
  type AnnouncementLabel,
} from "./home-data";
import styles from "./MarketplaceHome.module.css";

interface MarketplaceHomeProps {
  readonly listings: readonly DiscoveryListing[];
  readonly employers: readonly FeaturedEmployer[];
  readonly destinations: readonly HomeDestination[];
  readonly announcements: readonly HomeAnnouncement[];
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

function HomeHero({
  peek,
}: {
  peek?: DiscoveryListing;
}) {
  const router = useRouter();
  const t = useTranslations("Home");
  const tc = useTranslations("Common");
  const [role, setRole] = useState("");
  const [loc, setLoc] = useState("");
  const [category, setCategory] = useState("");

  // Dynamic hero — rotate through the controllable HOME_HERO_ROTATION bucket.
  // Start on index 0 (matches the server render and first client paint), then
  // advance to a rotated pick after mount. Because the pick happens in an effect
  // it never runs during SSR/hydration, so there's no hydration mismatch.
  const [heroIndex, setHeroIndex] = useState(0);
  useEffect(() => {
    if (HOME_HERO_ROTATION.length <= 1) return;
    setHeroIndex(Math.floor(Math.random() * HOME_HERO_ROTATION.length));
  }, []);
  const hero = HOME_HERO_ROTATION[heroIndex] ?? HOME_HERO_ROTATION[0];
  const heroImage = hero.imageUrl;
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
        {heroImage ? (
          <Image
            className={styles.heroImage}
            src={heroImage}
            alt=""
            aria-hidden="true"
            fill
            priority
            sizes="100vw"
          />
        ) : null}
        <div className={styles.heroScrim} aria-hidden="true" />

        <div className={styles.heroInner}>
          <p className={styles.heroEyebrow}>
            <span className={styles.liveDot} aria-hidden="true" />
            {t("eyebrow")}
          </p>
          {/* The anthem — the loudest thing after the photo. */}
          <h1 id="home-hero-title" className={styles.heroAnthem}>
            {t("anthemLine1")}
            <br />
            {t("anthemLine2")}
          </h1>
          <p className={styles.heroPromise}>{t("promise")}</p>
          <p className={styles.heroSub}>{t("sub")}</p>

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

          <div className={styles.heroCtas}>
            <Link className={styles.heroSecondary} href="/for-hosts">
              {tc("postAJob")}
            </Link>
          </div>
        </div>

        {peek ? (
          <Link className={styles.heroPeek} href={`/listing/${peek.id}`} aria-label={`${peek.title} — ${peek.location}`}>
            <span className={styles.heroPeekTop}>
              {peek.conditionalBadges?.includes("boosted") ? (
                <span className={styles.heroPeekBoost}>
                  <Icon name="status.boosted" size={16} aria-hidden />
                  Boosted
                </span>
              ) : peek.matchScore ? (
                <span className={styles.heroPeekMatch}>
                  <Icon name="status.match" size={16} aria-hidden />
                  {peek.matchScore}% fit
                </span>
              ) : null}
              {peek.host.verified ? (
                <span className={styles.heroPeekVerified} aria-label="Verified host">
                  <Icon name="trust.verified_host" size={16} aria-hidden />
                </span>
              ) : null}
            </span>
            <strong className={styles.heroPeekTitle}>{peek.title}</strong>
            <span className={styles.heroPeekMeta}>
              <Icon name="nav.map" size={16} aria-hidden />
              {peek.location}
            </span>
            <span className={styles.heroPeekTriad}>
              <span><Icon name="benefit.housing" size={16} aria-hidden />{peek.benefits.housing.summary ?? "Housing"}</span>
              <span><Icon name="benefit.pay" size={16} aria-hidden />{peek.benefits.pay.summary ?? "Pay"}</span>
            </span>
          </Link>
        ) : null}
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
          <h2 id="triad-title" className={styles.triadTitle}>
            Every listing answers three questions. Always.
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
};

function AnnouncementRail({ items }: { items: readonly HomeAnnouncement[] }) {
  if (items.length === 0) return null;
  return (
    <section className={styles.announceSection} aria-label="Featured host announcements">
      <div className={styles.announceHeadRow}>
        <span className={styles.announceKicker}>
          <Icon name="nav.announcements" size={16} aria-hidden />
          Hiring now
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
  // Six cards on desktop (3-up grid); the module CSS caps mobile at four.
  const shown = listings.slice(0, 6);

  return (
    <section className={styles.section} aria-labelledby="featured-jobs-title">
      <SectionHead
        id="featured-jobs-title"
        eyebrow="Open now"
        title="Featured jobs"
        sub="Housing, meals, and pay on every card — no digging."
        seeAllHref="/seek"
        seeAllLabel="Browse all jobs"
      />
      {shown.length === 0 ? (
        <div className={styles.emptyPanel}>
          <Icon name="status.open" size={24} aria-hidden />
          <p className={styles.emptyTitle}>The first season is being staffed.</p>
          <p className={styles.emptySub}>Hosts are onboarding now. Be first in line when roles open.</p>
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
  const pins = listings.filter((l) => l.coordinates).slice(0, 5);
  const shownPins = pins.length > 0 ? pins : listings.slice(0, 5);

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
              <span className={styles.mapCanvas} aria-hidden="true">
                <span className={styles.mapLand} />
                <span className={styles.mapLand2} />
                <span className={styles.mapGrid} />
                {shownPins.map((l, pi) => (
                  <span
                    key={l.id}
                    className={`${styles.mapPin} ${styles[`pin_${l.category}`]}`}
                    style={{ "--pin-x": `${[18, 38, 55, 72, 84][pi] ?? 50}%`, "--pin-y": `${[42, 26, 58, 34, 66][pi] ?? 50}%` } as CSSProperties}
                  >
                    <Icon name="nav.map" size={16} aria-hidden />
                  </span>
                ))}
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
              <Image
                className={styles.categoryImage}
                src={c.imageUrl}
                alt=""
                aria-hidden="true"
                fill
                sizes="(min-width: 1024px) 24vw, 45vw"
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
            className={`${styles.destinationCard} ${styles[`cover_${d.imageCategory}`]} ${styles.reveal}`}
            href={d.href}
            style={{ "--reveal-index": i % 3 } as CSSProperties}
          >
            <span className={styles.destinationImageWrap}>
              <Image
                className={styles.destinationImage}
                src={d.imageUrl}
                alt=""
                aria-hidden="true"
                fill
                sizes="(min-width: 1024px) 32vw, 90vw"
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

// ─── Free forever for seekers (dashboard + community, one band) ────────────

// Capability statements, not fabricated live numbers (no-mock-data rule).
const SEEKER_MODULES: ReadonlyArray<{ label: string; value: string; icon: IconKey }> = [
  { label: "Saved places", value: "Watch roles across seasons", icon: "nav.saved" },
  { label: "Applications", value: "Track every application, end to end", icon: "status.applied" },
  { label: "Recommended", value: "Matched to your skills & timing", icon: "status.match" },
  { label: "Profile readiness", value: "Tell hosts exactly when you're free", icon: "system.success" },
];

const COMMUNITY_TOPICS: ReadonlyArray<{ label: string; icon: IconKey }> = [
  { label: "Destination discussions", icon: "nav.feed" },
  { label: "Housing & meals intel", icon: "benefit.housing" },
  { label: "Gear & road-trip advice", icon: "benefit.transport" },
  { label: "Host transparency & reviews", icon: "trust.verified_host" },
];

function FreeForeverBand() {
  return (
    <section className={styles.section} aria-labelledby="free-title">
      <SectionHead
        id="free-title"
        eyebrow="Free forever for seekers"
        title="You never pay to find work"
        sub="The job board tells you what's open. The community tells you what it's actually like."
      />
      <div className={styles.freeBand}>
        <div className={styles.freeCol}>
          <p className={styles.surfaceKicker}>
            <Icon name="nav.dashboard" size={16} aria-hidden />
            Seeker dashboard
          </p>
          <ul className={styles.freeList} role="list">
            {SEEKER_MODULES.map((m) => (
              <li key={m.label} className={styles.freeRow}>
                <Icon name={m.icon} size={16} aria-hidden />
                <strong>{m.label}</strong>
                <small>{m.value}</small>
              </li>
            ))}
          </ul>
          <Link className={styles.freeCta} href="/seek">
            Start exploring
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
        <div className={styles.freeCol}>
          <p className={styles.surfaceKicker}>
            <Icon name="nav.feed" size={16} aria-hidden />
            Community
          </p>
          <ul className={styles.freeList} role="list">
            {COMMUNITY_TOPICS.map((t) => (
              <li key={t.label} className={styles.freeRow}>
                <Icon name={t.icon} size={16} aria-hidden />
                <strong>{t.label}</strong>
              </li>
            ))}
          </ul>
          <Link className={styles.freeCta} href="/community">
            Join the community
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Host pitch + tiers ────────────────────────────────────────────────────

const HOST_FEATURES: ReadonlyArray<{ label: string; icon: IconKey }> = [
  { label: "Boosted listings", icon: "status.boosted" },
  { label: "Featured employer placement", icon: "trust.featured_employer" },
  { label: "Homepage announcements", icon: "nav.announcements" },
  { label: "Applicant pipeline", icon: "analytics.funnel" },
  { label: "Analytics", icon: "analytics.trend" },
  { label: "Multi-location hiring", icon: "nav.map" },
];

function HostPitch() {
  return (
    <section id="plans" className={`${styles.section} ${styles.hostSection}`} aria-labelledby="host-title">
      <div className={styles.hostHead}>
        <p className={styles.eyebrow}>For hosts &amp; employers</p>
        <h2 id="host-title" className={styles.hostTitle}>Hire seasonal workers where they actually search.</h2>
        <p className={styles.hostSub}>
          Seekers never pay to find work. You pay for visibility — boosted placement, featured
          spots, and homepage reach in front of people ready to move.
        </p>
      </div>

      <ul className={styles.hostFeatures} aria-label="What hosts get">
        {HOST_FEATURES.map((f) => (
          <li key={f.label} className={styles.hostFeature}>
            <Icon name={f.icon} size={20} aria-hidden />
            {f.label}
          </li>
        ))}
      </ul>

      <div className={styles.planGrid}>
        {HOME_PLANS.map((p) => (
          <div key={p.key} className={`${styles.planCard}${p.featured ? ` ${styles.planFeatured}` : ""}`}>
            {p.featured ? <span className={styles.planRibbon}>Most popular</span> : null}
            <p className={styles.planName}>{p.name}</p>
            <p className={styles.planPrice}>
              <strong>{formatUsd(p.priceMonthlyCents)}</strong>
              <span>/mo</span>
            </p>
            <p className={styles.planBlurb}>{p.blurb}</p>
            <ul className={styles.planFeatures} role="list">
              {p.features.map((f) => (
                <li key={f} className={styles.planFeatureRow}>
                  <Icon name="system.success" size={16} aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <Link className={p.featured ? styles.planCtaPrimary : styles.planCta} href="/for-hosts">
              {p.cta}
            </Link>
          </div>
        ))}
      </div>

      <div className={styles.hostActions}>
        <Link className={styles.heroPrimary} href="/for-hosts">
          Post a job
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
        <Link className={styles.heroSecondary} href="/for-hosts">
          View host plans
        </Link>
      </div>
    </section>
  );
}

// ─── Final CTA ─────────────────────────────────────────────────────────────

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
          <Link className={styles.finalGhost} href="/for-hosts">
            Post a job
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
}: MarketplaceHomeProps) {
  // The hero photo rotates through the controllable HOME_HERO_ROTATION bucket
  // (picked client-side per landing) so first impression always sells the place;
  // the floating peek is a real listing.
  const heroListing = listings.find((l) => l.conditionalBadges?.includes("boosted")) ?? listings[0];

  // Organic-first sequence: promise → inventory → discovery story → browse
  // lanes → paid rails → free-forever → host conversion arc.
  return (
    <div className={styles.home}>
      <HomeHero peek={heroListing} />
      <ThreeQuestions />
      <FeaturedJobs listings={listings} />
      <DiscoverModes listings={listings} />
      <CategoryGrid />
      <DestinationGrid destinations={destinations} />

      {/* Paid rails — announcements + featured employers. Server-rendered: an
          empty employer set is real emptiness, not loading — skip the rail
          rather than show skeletons that never resolve. */}
      <AnnouncementRail items={announcements} />
      {employers.length > 0 ? <FeaturedEmployersRail employers={employers} /> : null}

      <FreeForeverBand />
      <HostPitch />
      <FinalCta />
    </div>
  );
}
