"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../discovery";
import { toDiscoveryCardData } from "../discovery/listing";
import { FeaturedEmployersRail, type FeaturedEmployer } from "../public/FeaturedEmployersRail";
import {
  HOME_CATEGORIES,
  HOME_PLANS,
  HOME_HERO,
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
  eyebrow,
  title,
  sub,
  seeAllHref,
  seeAllLabel,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  seeAllHref?: string;
  seeAllLabel?: string;
}) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionHeadText}>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.sectionTitle}>{title}</h2>
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

const TRIAD_BADGES: ReadonlyArray<{ key: string; label: string; icon: IconKey }> = [
  { key: "housing", label: "Housing", icon: "benefit.housing" },
  { key: "meals", label: "Meals", icon: "benefit.meals" },
  { key: "pay", label: "Pay", icon: "benefit.pay" },
  { key: "season", label: "Season", icon: "status.seasonal" },
  { key: "remote", label: "Remote", icon: "category.remote" },
  { key: "verified", label: "Verified Host", icon: "trust.verified_host" },
];

// ─── Hero ──────────────────────────────────────────────────────────────────

function HomeHero({
  heroImage,
  heroCategory,
  peek,
}: {
  heroImage?: string;
  heroCategory: OpportunityCategory;
  peek?: DiscoveryListing;
}) {
  const router = useRouter();
  const [role, setRole] = useState("");
  const [loc, setLoc] = useState("");
  const [category, setCategory] = useState("");

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
            Built for seekers, by seekers
          </p>
          <h1 id="home-hero-title" className={styles.heroTitle}>
            Find seasonal work with housing, meals, pay &amp; a place — upfront.
          </h1>
          <p className={styles.heroSub}>
            Free forever for seekers. Hosts pay for visibility — you never pay to find work.
          </p>

          <form className={styles.searchBar} onSubmit={onSearch} role="search" aria-label="Search opportunities">
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>Role</span>
              <input
                className={styles.searchInput}
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Deckhand, harvest, lodge…"
              />
            </label>
            <span className={styles.searchDivider} aria-hidden="true" />
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>Where</span>
              <input
                className={styles.searchInput}
                type="text"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                placeholder="Alaska, Colorado, remote…"
              />
            </label>
            <span className={styles.searchDivider} aria-hidden="true" />
            <label className={styles.searchField}>
              <span className={styles.searchLabel}>Category</span>
              <select
                className={styles.searchSelect}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                aria-label="Category"
              >
                <option value="">All work</option>
                <option value="farm">Farm &amp; ranch</option>
                <option value="maritime">Maritime</option>
                <option value="remote">Remote</option>
                <option value="seasonal">Seasonal</option>
              </select>
            </label>
            <button className={styles.searchSubmit} type="submit">
              <Icon name="action.search" size={20} aria-hidden />
              <span>Explore jobs</span>
            </button>
          </form>

          <ul className={styles.trustBadges} aria-label="What every listing shows upfront">
            {TRIAD_BADGES.map((b) => (
              <li key={b.key} className={styles.trustBadge}>
                <Icon name={b.icon} size={16} aria-hidden />
                {b.label}
              </li>
            ))}
          </ul>

          <div className={styles.heroCtas}>
            <Link className={styles.heroPrimary} href="/seek">
              Explore jobs
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
            <Link className={styles.heroSecondary} href="/for-hosts">
              Post a job
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
          Dispatches
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
  const shown = listings.slice(0, 6);

  return (
    <section className={styles.section} aria-labelledby="featured-jobs-title">
      <SectionHead
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
          <p className={styles.emptySub}>Founding hosts are onboarding now. Be first in line when roles open.</p>
          <Link className={styles.heroPrimary} href="/seek">
            Explore the marketplace
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      ) : (
        <div className={styles.jobsGrid}>
          {shown.map((listing) => (
            <DiscoveryCard
              key={listing.id}
              data={toDiscoveryCardData(listing)}
              surface="discovery_feed"
              onOpen={(id) => router.push(`/listing/${id}`)}
              onApply={(id) => router.push(`/listing/${id}`)}
              onHostClick={() => router.push("/seek")}
              onLocationClick={(id) => router.push(`/map?focus=${id}`)}
              onHousingClick={(id) => router.push(`/listing/${id}`)}
              onMealsClick={(id) => router.push(`/listing/${id}`)}
              onPayClick={(id) => router.push(`/listing/${id}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Browse by category ────────────────────────────────────────────────────

function CategoryGrid() {
  return (
    <section className={styles.section} aria-labelledby="categories-title">
      <SectionHead
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
        eyebrow="Destinations"
        title="Where will you go next?"
        sub="Discover where to work next — before you commit."
        seeAllHref="/map"
        seeAllLabel="Open the map"
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

// ─── Map discovery ─────────────────────────────────────────────────────────

function MapDiscovery({ listings }: { listings: readonly DiscoveryListing[] }) {
  const pins = listings.filter((l) => l.coordinates).slice(0, 5);

  return (
    <section className={styles.section} aria-labelledby="surfaces-title">
      <SectionHead
        eyebrow="Discover your way"
        title="See the season on a map"
        sub="Location is a feeling, not a filter — browse clustered jobs by state or region."
        seeAllHref="/map"
        seeAllLabel="Open the map"
      />
      <div className={`${styles.surfaceCard} ${styles.mapFeature}`}>
        <div className={styles.mapCanvas} aria-hidden="true">
          <span className={styles.mapLand} />
          <span className={styles.mapLand2} />
          <span className={styles.mapGrid} />
          {(pins.length > 0 ? pins : listings.slice(0, 5)).map((l, i) => (
            <span
              key={l.id}
              className={`${styles.mapPin} ${styles[`pin_${l.category}`]}`}
              style={{ "--pin-x": `${[18, 38, 55, 72, 84][i] ?? 50}%`, "--pin-y": `${[42, 26, 58, 34, 66][i] ?? 50}%` } as CSSProperties}
            >
              <Icon name="nav.map" size={16} aria-hidden />
            </span>
          ))}
          <span className={styles.mapCluster} style={{ "--pin-x": "62%", "--pin-y": "44%" } as CSSProperties}>12</span>
          <span className={styles.mapClusterSm} style={{ "--pin-x": "27%", "--pin-y": "72%" } as CSSProperties}>5</span>
        </div>
        <div className={styles.surfaceBody}>
          <p className={styles.surfaceKicker}><Icon name="nav.map" size={16} aria-hidden />Map discovery</p>
          <h3 className={styles.surfaceTitle}>Open the job map</h3>
          <p className={styles.surfaceText}>Clustered jobs, housing &amp; pay on every pin. Browse by state or region.</p>
          <Link className={styles.surfaceCta} href="/map">
            Open the job map
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Product previews (seeker dashboard + community) ───────────────────────

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

function ProductPreviews() {
  return (
    <section className={styles.section} aria-labelledby="previews-title">
      <SectionHead
        eyebrow="Free forever for seekers"
        title="Everything you get, at no cost"
        sub="The job board tells you what's open. The community tells you what it's actually like."
      />
      <div className={styles.previewGrid}>
        {/* Seeker dashboard preview */}
        <div className={styles.previewCard}>
          <div className={styles.previewHead}>
            <p className={styles.surfaceKicker}><Icon name="nav.dashboard" size={16} aria-hidden />Seeker dashboard</p>
            <span className={styles.freeTag}>Free forever</span>
          </div>
          <ul className={styles.previewList} role="list">
            {SEEKER_MODULES.map((m) => (
              <li key={m.label} className={styles.previewRow}>
                <span className={styles.previewIcon}><Icon name={m.icon} size={20} aria-hidden /></span>
                <span className={styles.previewRowText}>
                  <strong>{m.label}</strong>
                  <small>{m.value}</small>
                </span>
              </li>
            ))}
          </ul>
          <Link className={styles.previewCta} href="/seek">
            See your dashboard
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>

        {/* Community preview */}
        <div className={styles.previewCard}>
          <div className={styles.previewHead}>
            <p className={styles.surfaceKicker}><Icon name="nav.feed" size={16} aria-hidden />Community</p>
            <span className={styles.communityTag}>Seeker-to-seeker</span>
          </div>
          <ul className={styles.previewList} role="list">
            {COMMUNITY_TOPICS.map((t) => (
              <li key={t.label} className={styles.previewRow}>
                <span className={styles.previewIcon}><Icon name={t.icon} size={20} aria-hidden /></span>
                <span className={styles.previewRowText}>
                  <strong>{t.label}</strong>
                </span>
              </li>
            ))}
          </ul>
          <Link className={styles.previewCta} href="/community">
            Join the community
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Host pitch (tiers + monetization) ─────────────────────────────────────

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
        <h2 className={styles.hostTitle}>Hire seasonal workers where they actually search.</h2>
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
        <p className={styles.finalEyebrow}>Explore by job, map, category, destination, or community intel</p>
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
  // The hero photo is a fixed scenic "working landscape" (not a data cover) so
  // first impression always sells the place; the floating peek is a real listing.
  const heroListing = listings.find((l) => l.conditionalBadges?.includes("boosted")) ?? listings[0];

  return (
    <div className={styles.home}>
      <HomeHero heroImage={HOME_HERO.imageUrl} heroCategory={HOME_HERO.category} peek={heroListing} />
      <AnnouncementRail items={announcements} />

      {/* Server-rendered: an empty employer set is real emptiness, not loading —
          skip the rail rather than show skeletons that never resolve. */}
      {employers.length > 0 ? <FeaturedEmployersRail employers={employers} /> : null}
      <FeaturedJobs listings={listings} />
      <CategoryGrid />
      <DestinationGrid destinations={destinations} />
      <MapDiscovery listings={listings} />
      <ProductPreviews />
      <HostPitch />
      <FinalCta />
    </div>
  );
}
