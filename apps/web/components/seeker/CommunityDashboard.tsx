"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";
import type { OpportunityCategory } from "@explore-and-earn/contracts";

import type { DiscoveryListing } from "../discovery";
import { CATEGORY_LABEL } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import type { SeekerStatusSummary } from "./models";
import styles from "./CommunityDashboard.module.css";

// ─── Feed item types ──────────────────────────────────────────────────────────

type SeekerPost = {
  readonly kind: "seeker";
  readonly id: string;
  readonly authorName: string;
  readonly timestamp: string;
  readonly caption: string;
  readonly tags: readonly string[];
  readonly coverUrl?: string;
  readonly reactions: readonly [number, number, number, number, number];
};

type HostAnnouncement = {
  readonly kind: "announcement";
  readonly id: string;
  readonly hostName: string;
  readonly timestamp: string;
  readonly text: string;
  readonly coverUrls: readonly string[];
  readonly reactions: readonly [number, number, number, number, number];
  readonly hostId?: string;
};

type BlogPost = {
  readonly kind: "blog";
  readonly id: string;
  readonly timestamp: string;
  readonly title: string;
  readonly excerpt: string;
  readonly coverUrl?: string;
  readonly reactions: readonly [number, number, number, number, number];
};

type BoostedListing = {
  readonly kind: "listing";
  readonly id: string;
  readonly listing: DiscoveryListing;
  readonly matchScore?: number;
  readonly isBoosted: boolean;
};

type FeaturedEmployerCard = {
  readonly kind: "employer";
  readonly id: string;
  readonly employer: FeaturedEmployer;
};

type FeedItem = SeekerPost | HostAnnouncement | BlogPost | BoostedListing | FeaturedEmployerCard;

type FeedSlotType = "seeker" | "blog" | "announcement" | "listing" | "employer";

interface CommunityDashboardProps {
  readonly tab: "feed" | "photos" | "announcements";
  readonly status: SeekerStatusSummary;
  readonly listings: readonly DiscoveryListing[];
  readonly featuredEmployers?: readonly FeaturedEmployer[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REACTIONS = ["😄", "❤️", "💯", "🙌", "✨"] as const;

const SEEKER_NAMES = ["Maya R.", "Ethan W.", "Jessica L.", "Sam K.", "Alex M."] as const;

const POPULAR_TAGS = [
  "CabinLife", "TrailLife", "SunriseShift",
  "Adventure", "NowHiring", "Community",
] as const;

const BLOG_POST_BASE = {
  kind: "blog" as const,
  id: "blog-travel-tips",
  timestamp: "1d ago",
  title: "7 Travel Tips for a Smoother Seasonal Work Adventure",
  excerpt: "Seasonal work takes you to incredible places — and with the right prep, it can be one of the most rewarding experiences of your life. Here are 7 tips to help you travel smarter.",
  reactions: [89, 67, 54, 41, 38] as [number, number, number, number, number],
};

// Employer badge abbreviations — mirrors FeaturedEmployersRail, not exported from there
const CATEGORY_ABBR: Record<OpportunityCategory, string> = {
  farm:     "FARM",
  maritime: "SEA",
  remote:   "REMOTE",
  seasonal: "SEASONAL",
  mix:      "MIX",
};

// ─── Strategic feed slot template ─────────────────────────────────────────────
//
// Design rules:
//   - First 2 slots always organic seeker posts (hook before monetization)
//   - Monetized slots (listing, employer) never adjacent
//   - Seeker posts must buffer every monetized slot
//   - Photos dominate: 7/12 slots (~58%)
//   - Listing: 1 slot, Employer: 1 slot, Blog: 1 slot, Announcements: 2 slots
//   - If a bucket is exhausted, falls back to seeker posts
//
const FEED_SLOT_TEMPLATE: readonly FeedSlotType[] = [
  "seeker",        // 0 — hook with organic content
  "seeker",        // 1 — photo dominant
  "blog",          // 2 — E&E platform content
  "seeker",        // 3
  "announcement",  // 4 — first semi-social break
  "seeker",        // 5 — buffer
  "seeker",        // 6 — photo dominant
  "listing",       // 7 — highest-match or boosted listing
  "seeker",        // 8 — buffer after monetized
  "announcement",  // 9 — second round
  "seeker",        // 10
  "employer",      // 11 — featured employer closes the visible feed
];

// ─── Fixture generation ───────────────────────────────────────────────────────

const CATEGORY_CAPTIONS: Record<OpportunityCategory, string> = {
  farm: "Harvest season hits different when you're out here at golden hour. Grateful for these views and the people I work alongside. 🌾✨😊",
  maritime: "Nothing beats the quiet before the morning catch. Clear skies, open water, and a crew that has your back. ⚓️🌅",
  remote: "Signal is weak. Views are incredible. Work is meaningful. This is remote life done right. 💻🏔️✨",
  seasonal: "First week in and already feels like home. These moments are exactly why we explore. 🏕️❤️✨",
  mix: "Every opportunity is a new adventure. Grateful for the journey and everyone I've met along the way. 🗺️✨",
};

function hostAnnouncementText(listing: DiscoveryListing): string {
  const perks: string[] = [];
  if (listing.benefits.housing.provision === "provided") perks.push("housing included");
  if (listing.benefits.meals.provision === "provided") perks.push("meals included");
  const perkClause = perks.length ? ` ${perks.join(" + ")} —` : "";
  return `We're opening positions at ${listing.location} for this season.${perkClause} Come join our team and explore! 🌲✨😊`;
}

function buildTags(listing: DiscoveryListing): readonly string[] {
  const tags: string[] = [CATEGORY_LABEL[listing.category]];
  if (listing.benefits.housing.provision === "provided") tags.push("HousingIncluded");
  const loc = listing.location.split(",")[0]?.trim().replace(/\s+/g, "");
  if (loc) tags.push(loc);
  return tags.slice(0, 3);
}

function benefitLabel(provision: string, summary?: string): string {
  if (summary) return summary;
  if (provision === "provided") return "Provided";
  if (provision === "stipend") return "Stipend";
  return "Own arrange.";
}

// ─── Strategic feed builder ───────────────────────────────────────────────────

function buildStrategicFeedItems(
  listings: readonly DiscoveryListing[],
  featuredEmployers: readonly FeaturedEmployer[],
): FeedItem[] {
  // ── Seeker posts: photo-first ordering ──
  const sortedListings = [...listings].sort(
    (a, b) => (b.coverImageUrl ? 1 : 0) - (a.coverImageUrl ? 1 : 0),
  );
  const seekerBucket: SeekerPost[] = sortedListings.map((listing, i): SeekerPost => ({
    kind: "seeker",
    id: `post-${listing.id}`,
    authorName: SEEKER_NAMES[i % SEEKER_NAMES.length] ?? "Maya R.",
    timestamp: `${i * 2 + 2}h ago`,
    caption: CATEGORY_CAPTIONS[listing.category],
    tags: buildTags(listing),
    coverUrl: listing.coverImageUrl,
    reactions: [Math.max(50, 156 - i * 3), Math.max(40, 123 - i * 2), Math.max(35, 101 - i), 82, 71],
  }));

  // ── Host announcements: one per host (first listing per host) ──
  const seenHosts = new Set<string>();
  const announcementBucket: HostAnnouncement[] = [];
  listings.forEach((listing, i) => {
    if (seenHosts.has(listing.host.name)) return;
    seenHosts.add(listing.host.name);
    announcementBucket.push({
      kind: "announcement",
      id: `ann-${listing.host.name.replace(/\s+/g, "-").toLowerCase()}`,
      hostName: listing.host.name,
      timestamp: i === 0 ? "3h ago" : `${Math.max(1, i - 1)}d ago`,
      text: hostAnnouncementText(listing),
      coverUrls: [listing.coverImageUrl].filter((u): u is string => Boolean(u)),
      reactions: [Math.max(40, 128 - i * 4), Math.max(30, 96 - i * 3), Math.max(25, 84 - i * 2), 64, 52],
      hostId: listing.host.id,
    });
  });

  // ── Match-ranked listing cards: boosted || matchScore ≥ 60, best-first ──
  const listingBucket: BoostedListing[] = [...listings]
    .filter(l =>
      l.conditionalBadges?.includes("boosted") ||
      (l.matchScore !== undefined && l.matchScore >= 60),
    )
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, 2)
    .map((l): BoostedListing => ({
      kind: "listing",
      id: `listing-card-${l.id}`,
      listing: l,
      matchScore: l.matchScore,
      isBoosted: Boolean(l.conditionalBadges?.includes("boosted")),
    }));

  // ── Featured employer cards ──
  const employerBucket: FeaturedEmployerCard[] = featuredEmployers.slice(0, 2).map(
    (emp, i): FeaturedEmployerCard => ({
      kind: "employer",
      id: `employer-card-${emp.hostId ?? String(i)}`,
      employer: emp,
    }),
  );

  // ── Blog ──
  const blogBucket: BlogPost[] = [{
    ...BLOG_POST_BASE,
    coverUrl: sortedListings.find(l => l.coverImageUrl)?.coverImageUrl,
  }];

  // ── Slot-template fill ──
  const buckets: Record<FeedSlotType, FeedItem[]> = {
    seeker: seekerBucket,
    blog: blogBucket,
    announcement: announcementBucket,
    listing: listingBucket,
    employer: employerBucket,
  };

  const result: FeedItem[] = [];
  for (const slot of FEED_SLOT_TEMPLATE) {
    const bucket = buckets[slot];
    if (bucket.length > 0) {
      result.push(bucket.shift()!);
    } else if (buckets.seeker.length > 0) {
      result.push(buckets.seeker.shift()!);
    }
  }

  return result;
}

function parseDate(str?: string): { mon: string; day: string } | null {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d.getTime())) return null;
  return {
    mon: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReactionBar({ reactions }: { reactions: readonly [number, number, number, number, number] }) {
  const [active, setActive] = useState<ReadonlySet<number>>(new Set());

  function toggle(i: number) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  }

  return (
    <div className={styles.reactionBar} role="group" aria-label="Post reactions">
      {REACTIONS.map((emoji, i) => {
        const isActive = active.has(i);
        const count = (reactions[i] ?? 0) + (isActive ? 1 : 0);
        return (
          <button
            key={emoji}
            type="button"
            className={`${styles.reaction}${isActive ? ` ${styles.reactionActive}` : ""}`}
            aria-label={`React with ${emoji}${isActive ? " — you reacted" : ""}`}
            aria-pressed={isActive}
            onClick={() => toggle(i)}
          >
            <span className={styles.reactionEmoji} aria-hidden>{emoji}</span>
            <span className={styles.reactionCount}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function HashtagChips({ tags }: { tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <div className={styles.hashRow}>
      {tags.map(tag => (
        <span key={tag} className={styles.hashChip}>
          <span className={styles.hashSign} aria-hidden>#</span>
          {tag}
        </span>
      ))}
    </div>
  );
}

function PostMenu({ onClose }: { onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  return (
    <div ref={menuRef} className={styles.postMenu} role="menu" aria-label="Post options">
      <button
        type="button"
        className={styles.postMenuItem}
        role="menuitem"
        onClick={onClose}
      >
        Report post
      </button>
      <button
        type="button"
        className={styles.postMenuItem}
        role="menuitem"
        onClick={onClose}
      >
        Hide from feed
      </button>
      <button
        type="button"
        className={styles.postMenuItem}
        role="menuitem"
        onClick={onClose}
      >
        Copy link
      </button>
    </div>
  );
}

function SeekerCard({ post }: { post: SeekerPost }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className={styles.seekerCard}>
      <div className={styles.cardHeader}>
        <div className={styles.avatar} aria-hidden>{post.authorName.charAt(0)}</div>
        <div className={styles.cardMeta}>
          <div className={styles.cardNameRow}>
            <span className={styles.cardAuthor}>{post.authorName}</span>
            <span className={styles.seekerBadge}>
              <Icon name="category.seasonal" size={16} aria-hidden />
              Seeker
            </span>
          </div>
          <span className={styles.cardTime}>{post.timestamp}</span>
        </div>
        <div className={styles.postMenuWrap}>
          <button
            className={styles.moreBtn}
            type="button"
            aria-label="More options"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={() => setMenuOpen(prev => !prev)}
          >
            <Icon name="action.more" size={16} aria-hidden />
          </button>
          {menuOpen ? <PostMenu onClose={() => setMenuOpen(false)} /> : null}
        </div>
      </div>
      <p className={styles.cardCaption}>{post.caption}</p>
      <HashtagChips tags={post.tags} />
      {post.coverUrl ? (
        <div className={styles.cardImageWrap}>
          <div className={styles.cardImageMat}>
            <img className={styles.cardImage} src={post.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </div>
        </div>
      ) : null}
      <ReactionBar reactions={post.reactions} />
    </article>
  );
}

function AnnouncementCard({ post }: { post: HostAnnouncement }) {
  const hostHref = post.hostId ? `/host/${post.hostId}` : "/community";
  return (
    <article className={styles.announcementCard}>
      <div className={styles.tapeLeft} aria-hidden />
      <div className={styles.tapeRight} aria-hidden />
      <div className={styles.pushPin} aria-hidden />
      <div className={styles.cardHeader}>
        <div className={`${styles.avatar} ${styles.avatarHost}`} aria-hidden>{post.hostName.charAt(0)}</div>
        <div className={styles.cardMeta}>
          <div className={styles.cardNameRow}>
            <span className={styles.cardAuthor}>{post.hostName}</span>
            <span className={styles.hostBadge}>
              <Icon name="trust.verified_host" size={16} aria-hidden />
              Host
            </span>
          </div>
          <span className={styles.cardTime}>{post.timestamp}</span>
        </div>
        <Link className={styles.viewHostBtn} href={hostHref}>
          View host profile
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>
      <div className={styles.announcementBody}>
        <span className={styles.megaphone} aria-hidden>
          <Icon name="nav.announcements" size={20} aria-hidden />
        </span>
        <p className={styles.announcementText}>{post.text}</p>
      </div>
      {post.coverUrls.length > 0 ? (
        <div className={styles.photoGrid}>
          {post.coverUrls.map((url, i) => (
            <div key={`${url}-${i}`} className={styles.photoGridItem}>
              <img src={url} alt="" aria-hidden loading="lazy" decoding="async" />
            </div>
          ))}
        </div>
      ) : null}
      <ReactionBar reactions={post.reactions} />
    </article>
  );
}

function BlogCard({ post }: { post: BlogPost }) {
  return (
    <article className={styles.blogCard}>
      <div className={post.coverUrl ? styles.blogLayout : styles.blogLayoutFull}>
        <div className={styles.blogText}>
          <div className={styles.blogMeta}>
            <span className={styles.blogBrand} aria-hidden>
              <Icon name="nav.feed" size={16} aria-hidden />
            </span>
            <span className={styles.blogBadge}>Blog</span>
            <span className={styles.cardTime}>{post.timestamp}</span>
          </div>
          <h3 className={styles.blogTitle}>{post.title}</h3>
          <div className={styles.blogTreeRule} aria-hidden>&#x25C4;&#x2022;&#x2022;&#x2022;&#x25BA;</div>
          <p className={styles.blogExcerpt}>{post.excerpt}</p>
          <Link className={styles.readMoreBtn} href="/blog">
            Read more
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
        {post.coverUrl ? (
          <div className={styles.blogImageWrap}>
            <div className={styles.blogImageMat}>
              <img className={styles.blogImage} src={post.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            </div>
          </div>
        ) : null}
      </div>
      <ReactionBar reactions={post.reactions} />
    </article>
  );
}

// ─── ListingFeedCard ──────────────────────────────────────────────────────────

function BenefitPill({ icon, label }: { icon: string; label: string }) {
  return (
    <span className={styles.benefitPill}>
      <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={16} aria-hidden />
      {label}
    </span>
  );
}

function ListingFeedCard({ item }: { item: BoostedListing }) {
  const { listing, matchScore, isBoosted } = item;
  const matchPct = matchScore ?? 0;
  return (
    <article className={styles.listingFeedCard}>
      <div className={styles.listingEyebrow}>
        <Icon name={isBoosted ? "status.boosted" : "status.featured"} size={16} aria-hidden />
        <span>{isBoosted ? "Boosted listing" : "Featured listing"}</span>
      </div>
      {listing.coverImageUrl ? (
        <div className={styles.listingImageWrap}>
          <div className={styles.cardImageMat}>
            <img
              className={styles.cardImage}
              src={listing.coverImageUrl}
              alt=""
              aria-hidden="true"
              loading="lazy"
              decoding="async"
            />
          </div>
        </div>
      ) : null}
      <div className={styles.listingBody}>
        <div className={styles.listingNameRow}>
          <span className={styles.listingHostName}>{listing.host.name}</span>
          {listing.host.verified ? (
            <span className={styles.listingVerified} aria-label="Verified host">
              <Icon name="trust.verified_host" size={16} aria-hidden />
            </span>
          ) : null}
        </div>
        <p className={styles.listingTitle}>{listing.title}</p>
        <div className={styles.listingMeta}>
          <Icon name="mappin.location" size={16} aria-hidden />
          <span>{listing.location}</span>
          <span className={styles.listingDot} aria-hidden>·</span>
          <span>{CATEGORY_LABEL[listing.category]}</span>
        </div>
        <div className={styles.benefitRow}>
          <BenefitPill
            icon="benefit.housing"
            label={benefitLabel(listing.benefits.housing.provision, listing.benefits.housing.summary)}
          />
          <BenefitPill
            icon="benefit.meals"
            label={benefitLabel(listing.benefits.meals.provision, listing.benefits.meals.summary)}
          />
          <BenefitPill
            icon="benefit.pay"
            label={benefitLabel(listing.benefits.pay.provision, listing.benefits.pay.summary)}
          />
        </div>
        <div className={styles.listingFooter}>
          {matchScore !== undefined ? (
            <div className={styles.matchGroup}>
              <span className={styles.matchLabel}>Match</span>
              <div
                className={styles.matchTrack}
                role="progressbar"
                aria-valuenow={matchPct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${matchPct}% match`}
              >
                <div className={styles.matchFill} style={{ width: `${matchPct}%` }} />
              </div>
              <span className={styles.matchPct}>{matchPct}%</span>
            </div>
          ) : null}
          <Link href={`/listing/${listing.id}`} className={styles.listingCta}>
            Open listing
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── EmployerFeedCard ─────────────────────────────────────────────────────────

function EmployerBadgeMini({ name, category }: { name: string; category: OpportunityCategory }) {
  const words = name.trim().split(/\s+/);
  const initials = words.slice(0, 3).map(w => w[0] ?? "").join("").toUpperCase();
  return (
    <div className={`${styles.employerBadge} ${styles[`employerBadge_${category}`]}`} aria-hidden>
      <span className={styles.employerBadgeMark}>{initials}</span>
      <span className={styles.employerBadgeRule} />
      <span className={styles.employerBadgeLabel}>{CATEGORY_ABBR[category]}</span>
    </div>
  );
}

function EmployerFeedCard({ item }: { item: FeaturedEmployerCard }) {
  const { employer } = item;
  const href = employer.hostId ? `/host/${employer.hostId}` : "/community";
  return (
    <article className={styles.employerFeedCard}>
      <div className={styles.employerEyebrow}>
        <Icon name="trust.featured_employer" size={16} aria-hidden />
        <span>Featured employer</span>
        <span className={styles.employerStar} aria-hidden>✦</span>
      </div>
      {/* Photo section — badge straddles the seam */}
      <div className={styles.employerImageSection}>
        <div className={styles.employerImageWrap}>
          <div className={styles.cardImageMat}>
            {employer.coverImageUrl ? (
              <img
                className={styles.cardImage}
                src={employer.coverImageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
        </div>
        <EmployerBadgeMini name={employer.hostName} category={employer.category} />
      </div>
      {/* Body — padding-top clears the protruding badge */}
      <div className={styles.employerBody}>
        <div className={styles.employerNameRow}>
          <span className={styles.employerName}>{employer.hostName}</span>
          {employer.verified ? (
            <span className={styles.listingVerified} aria-label="Verified">
              <Icon name="trust.verified_host" size={16} aria-hidden />
            </span>
          ) : null}
        </div>
        <div className={styles.employerMeta}>
          <Icon name="mappin.location" size={16} aria-hidden />
          <span>{employer.location}</span>
          <span className={styles.listingDot} aria-hidden>·</span>
          <span className={styles.employerListingCount}>
            {employer.listingCount} {employer.listingCount === 1 ? "listing" : "listings"}
          </span>
        </div>
        {employer.tagline ? (
          <p className={styles.employerTagline}>{employer.tagline}</p>
        ) : null}
        <Link href={href} className={styles.employerCta}>
          View employer profile
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function FeedEndMarker() {
  return (
    <div className={styles.feedEnd} aria-label="End of feed">
      <div className={styles.feedEndRule} aria-hidden>
        <span className={styles.feedEndIcon}>🌲</span>
      </div>
      <h3 className={styles.feedEndHeading}>You&rsquo;re all caught up</h3>
      <p className={styles.feedEndSub}>
        You&rsquo;ve seen everything in your community feed. Ready to explore new opportunities?
      </p>
      <Link href="/seek" className={styles.feedEndCta}>
        Explore listings
        <Icon name="action.forward" size={16} aria-hidden />
      </Link>
    </div>
  );
}

// ─── Sidebar components ───────────────────────────────────────────────────────

function WelcomeBar({ status }: { status: SeekerStatusSummary }) {
  const level = Math.max(1, Math.ceil(status.resumeCompletion / 20));
  const xp = status.resumeCompletion * 10;  // 0–1000 range matching xpMax
  const xpMax = 1000;
  const fillPct = status.resumeCompletion;  // resumeCompletion IS the 0–100 percentage
  return (
    <div className={styles.welcomeBar}>
      <span className={styles.welcomeTree} aria-hidden>🌲</span>
      <div className={styles.welcomeTextGroup}>
        Welcome back, <strong>{status.seekerName}</strong>! 👋
      </div>
      <div className={styles.xpGroup}>
        <span className={styles.xpLabel}>Explorer Level {level}</span>
        <div
          className={styles.xpTrack}
          role="progressbar"
          aria-valuenow={xp}
          aria-valuemax={xpMax}
          aria-label="XP progress"
        >
          <div className={styles.xpFill} style={{ width: `${fillPct}%` }} />
        </div>
        <span className={styles.xpCount}>{xp.toLocaleString()} / {xpMax.toLocaleString()} XP</span>
      </div>
    </div>
  );
}

function PopularTagsWidget() {
  return (
    <section className={styles.widget}>
      <h3 className={styles.widgetTitle}>
        <Icon name="trust.featured_employer" size={16} aria-hidden />
        Popular tags
      </h3>
      <div className={styles.widgetTagGrid}>
        {POPULAR_TAGS.map(tag => (
          <button key={tag} type="button" className={styles.widgetTag}>#{tag}</button>
        ))}
      </div>
      <span className={styles.widgetFooter}>Explore more in Photos &rarr;</span>
    </section>
  );
}

function UpcomingListingsWidget({ listings }: { listings: readonly DiscoveryListing[] }) {
  const upcoming = listings.slice(0, 3);
  if (!upcoming.length) return null;
  return (
    <section className={styles.widget}>
      <h3 className={styles.widgetTitle}>Upcoming listings</h3>
      <ul className={styles.widgetList}>
        {upcoming.map(listing => {
          const date = parseDate(listing.begins);
          return (
            <li key={listing.id}>
              <Link href={`/listing/${listing.id}`} className={styles.widgetListItem}>
                <div className={styles.widgetListText}>
                  <span className={styles.widgetListHost}>
                    {listing.host.name}
                    <span className={styles.hostBadgeInline}>Host</span>
                  </span>
                  <span className={styles.widgetListTitle}>{listing.title}</span>
                  <span className={styles.widgetListLoc}>
                    <Icon name="mappin.location" size={16} aria-hidden />
                    {listing.location}
                  </span>
                </div>
                {date ? (
                  <div className={styles.widgetDate} aria-label={`${date.mon} ${date.day}`}>
                    <span className={styles.widgetDateMon}>{date.mon}</span>
                    <span className={styles.widgetDateDay}>{date.day}</span>
                  </div>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link href="/seek" className={styles.widgetFooter}>View all listings &rarr;</Link>
    </section>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CommunityDashboard({ tab, status, listings, featuredEmployers = [] }: CommunityDashboardProps) {
  const feedItems = buildStrategicFeedItems(listings, featuredEmployers);

  const photoItems = feedItems.filter(
    (item): item is SeekerPost => item.kind === "seeker" && Boolean(item.coverUrl),
  );
  const announcementItems = feedItems.filter(
    (item): item is HostAnnouncement => item.kind === "announcement",
  );

  const mainItems: FeedItem[] =
    tab === "photos" ? photoItems :
    tab === "announcements" ? announcementItems :
    feedItems;

  return (
    <div className={styles.dashboard}>
      <WelcomeBar status={status} />

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {mainItems.length === 0 ? (
            <div className={styles.emptyState}>
              {tab === "photos" ? (
                <p>No photos yet — community members share moments from the field, sunrise shifts, and life on the trail here.</p>
              ) : tab === "announcements" ? (
                <p>No announcements yet — hosts share seasonal openings, housing updates, and hiring news here.</p>
              ) : (
                <p>No content yet — check back soon as your community grows.</p>
              )}
            </div>
          ) : (
            <>
              {mainItems.map(item => {
                if (item.kind === "seeker") return <SeekerCard key={item.id} post={item} />;
                if (item.kind === "announcement") return <AnnouncementCard key={item.id} post={item} />;
                if (item.kind === "blog") return <BlogCard key={item.id} post={item} />;
                if (item.kind === "listing") return <ListingFeedCard key={item.id} item={item} />;
                if (item.kind === "employer") return <EmployerFeedCard key={item.id} item={item} />;
                return null;
              })}
              {tab === "feed" ? <FeedEndMarker /> : null}
            </>
          )}
        </div>

        <aside className={styles.aside}>
          <section className={styles.widget}>
            <div className={styles.welcomeWidget}>
              <div className={styles.welcomeWidgetAvatar} aria-hidden>
                {status.seekerName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className={styles.welcomeWidgetName}>Welcome back, {status.seekerName}!</p>
                <p className={styles.welcomeWidgetSub}>Keep exploring, connecting, and earning together.</p>
              </div>
            </div>
            <div className={styles.widgetMeter}>
              <div className={styles.widgetMeterRow}>
                <span className={styles.widgetMeterIcon} aria-hidden>🌱</span>
                <span className={styles.widgetMeterLabel}>
                  Level {Math.max(1, Math.ceil(status.resumeCompletion / 20))} Explorer
                </span>
              </div>
              <div
                className={styles.xpTrack}
                role="progressbar"
                aria-valuenow={status.resumeCompletion * 10}
                aria-valuemax={1000}
                aria-valuemin={0}
                aria-label="XP progress"
              >
                <div
                  className={styles.xpFill}
                  style={{ width: `${status.resumeCompletion}%` }}
                />
              </div>
              <span className={styles.widgetMeterSub}>
                {(status.resumeCompletion * 10).toLocaleString()} / 1,000 XP
              </span>
            </div>
          </section>

          <PopularTagsWidget />
          <UpcomingListingsWidget listings={listings} />

          <section className={styles.widget}>
            <h3 className={styles.widgetTitle}>
              <Icon name="action.message" size={16} aria-hidden />
              Need help or have questions?
            </h3>
            <p className={styles.widgetText}>
              Visit our help center for guides, FAQs, and support.
            </p>
            <Link href="/help" className={styles.widgetCta}>
              Go to help center
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
