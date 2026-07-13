"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useOptimistic, useTransition } from "react";

import { BADGE_META, type SeekerBadge } from "@explore-and-earn/contracts";
import { DiscoveryCard, Icon, type IconKey } from "@explore-and-earn/ui";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import type { DiscoveryListing } from "../discovery";
import { toDiscoveryCardData } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import { byMonetization } from "../../lib/ranking";
import { ReadinessSlider } from "./ReadinessSlider";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./ProfileHub.module.css";

// Category atmospheres are tokenized in styles/tokens.css (shared with SeekerHero).
/* Photo-less hero fallback: the SCENIC cover treatment (hero scrim over a
   landscape gradient) — the same language as the host hero and the sidebar
   identity card, never the retired dark category atmospheres. */
const CATEGORY_GRADIENTS: Record<string, string> = {
  maritime: "var(--gradient-hero-scrim), var(--gradient-cover-coastal)",
  farm:     "var(--gradient-hero-scrim), var(--gradient-cover-wilderness)",
  remote:   "var(--gradient-hero-scrim), var(--gradient-cover-mountain)",
  seasonal: "var(--gradient-hero-scrim), var(--gradient-cover-adventure)",
  mix:      "var(--gradient-hero-scrim), var(--gradient-cover-sunset)",
};
const DEFAULT_GRADIENT =
  "var(--gradient-hero-scrim), var(--gradient-cover-adventure)";

const CATEGORY_LABELS: Record<string, string> = {
  maritime: "Maritime",
  farm:     "Farm",
  remote:   "Remote",
  seasonal: "Seasonal",
  mix:      "Mix",
};

function formatBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isBoosted(listing: DiscoveryListing): boolean {
  return (listing.conditionalBadges ?? []).includes("boosted");
}

/**
 * Monetization ordering for the job rails — the single "pay more, show more"
 * comparator (Boosted > Enterprise > Matched≥90 > Professional > Starter).
 * Host tier isn't carried on the embedded listing host, so it degrades
 * gracefully to the boosted + match signals we do have; it only ORDERS and
 * never hides. Stable, so equal-rank items keep their upstream match order.
 */
const rankByMonetization = byMonetization<DiscoveryListing>((listing) => ({
  boosted: isBoosted(listing),
  matchScore: listing.matchScore,
}));

/** A tucked secondary destination — summary index only, detail on the route. */
interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: IconKey;
  readonly meta?: string;
}

/** The rest of the seeker's space, tucked behind a compact index (not inline). */
function buildTuckedNav(status: SeekerStatusSummary): readonly NavItem[] {
  return [
    {
      href: "/saved",
      label: "Saved",
      icon: "nav.saved",
      meta: status.savedCount > 0 ? String(status.savedCount) : undefined,
    },
    {
      href: "/applied",
      label: "Applications",
      icon: "status.applied",
      meta: status.appliedCount > 0 ? String(status.appliedCount) : undefined,
    },
    {
      href: "/invites",
      label: "Invites",
      icon: "status.match",
      meta: status.invitesCount > 0 ? String(status.invitesCount) : undefined,
    },
    {
      href: "/messages",
      label: "Messages",
      icon: "nav.messages",
      meta: status.unreadNotifications > 0 ? String(status.unreadNotifications) : undefined,
    },
    { href: "/journey", label: "Journey", icon: "mappin.cluster" },
    { href: "/community", label: "Community", icon: "nav.feed" },
    { href: "/settings", label: "Settings", icon: "nav.settings" },
  ];
}

export interface ProfileHubProps {
  readonly status: SeekerStatusSummary;
  readonly badges?: readonly SeekerBadge[];
  readonly profilePhotoUrl?: string | null;
  readonly heroCoverUrl?: string | null;
  readonly seekingTimeline?: string | null;
  readonly preferredCategories?: readonly string[];
  readonly bio?: string | null;
  readonly seekerProfileId?: string | null;
  readonly matchedListings?: readonly DiscoveryListing[];
  /**
   * Kept on the composition contract for page.tsx, but the featured-employer
   * rail no longer lives on the decluttered profile landing (it belongs to the
   * discovery/home surfaces). Not rendered here.
   */
  readonly featuredEmployers?: readonly FeaturedEmployer[];
}

export function ProfileHub({
  status,
  badges = [],
  profilePhotoUrl,
  heroCoverUrl,
  seekingTimeline,
  preferredCategories = [],
  bio,
  seekerProfileId,
  matchedListings = [],
}: ProfileHubProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimisticTimeline, setOptimisticTimeline] = useOptimistic(seekingTimeline ?? null);

  const initials =
    status.seekerName
      .trim()
      .split(" ")
      .map((n) => n[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "SE";

  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const resumePct = Math.min(100, Math.max(0, status.resumeCompletion));
  const isPhoto = Boolean(heroCoverUrl && (heroCoverUrl.startsWith("http") || heroCoverUrl.startsWith("/")));
  const heroBg = isPhoto
    ? undefined
    : (CATEGORY_GRADIENTS[preferredCategories[0] ?? ""] ?? DEFAULT_GRADIENT);

  // Two job rails from the seeker's live matched inventory, each ordered by
  // monetization. Boosted opportunities get their OWN rail, so the matched rail
  // excludes them (no card appears twice on the landing).
  const boostedListings = useMemo(
    () => matchedListings.filter(isBoosted).slice().sort(rankByMonetization).slice(0, 8),
    [matchedListings],
  );
  const matchedRail = useMemo(
    () => matchedListings.filter((l) => !isBoosted(l)).slice().sort(rankByMonetization).slice(0, 8),
    [matchedListings],
  );

  const navItems = buildTuckedNav(status);
  const hasOffers = status.offersCount > 0;

  function handleReadinessChange(value: string) {
    if (!seekerProfileId) return;
    startTransition(async () => {
      setOptimisticTimeline(value);
      await saveReadinessAction(value);
    });
  }

  function openListing(id: string) {
    router.push(`/listing/${id}`);
  }

  return (
    <div className={styles.page}>
      {/* ── Full-bleed cover ── */}
      <section
        className={styles.hero}
        style={heroBg ? { background: heroBg } : undefined}
        aria-label="Profile cover"
      >
        {isPhoto && heroCoverUrl && (
          <Image src={heroCoverUrl} alt="" fill sizes="100vw" className={styles.heroBg} priority />
        )}
        <div className={styles.heroOverlay} aria-hidden="true" />

        <div className={styles.topBar}>
          <Link href="/profile/edit" className={styles.editBtn} aria-label="Edit profile and cover">
            <Icon name="action.edit" size={16} aria-hidden />
            <span>Edit</span>
          </Link>
        </div>
      </section>

      {/* ── Identity: avatar straddles the hero/content boundary ── */}
      <div className={styles.identityBar}>
        <div className={styles.avatarWrap} aria-hidden="true">
          {profilePhotoUrl ? (
            <Image src={profilePhotoUrl} alt="" width={88} height={88} className={styles.avatarImg} />
          ) : (
            <div className={styles.avatarInitials}>{initials}</div>
          )}
        </div>

        <div className={styles.identityContent}>
          <div className={styles.nameRow}>
            <h1 className={styles.seekerName}>{status.seekerName}</h1>
            <span className={styles.seekerBadge}>
              <span className={styles.seekerDot} aria-hidden="true" />
              Seeker
            </span>
          </div>

          {preferredCategories.length > 0 && (
            <div className={styles.catPills}>
              {preferredCategories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className={`${styles.catPill} ${styles[`cat_${cat}` as keyof typeof styles] ?? ""}`}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          )}

          {bio ? (
            <p className={styles.bio}>{bio}</p>
          ) : (
            <Link href="/profile/edit" className={styles.bioAdd}>
              + Add a bio
            </Link>
          )}
        </div>
      </div>

      {/* ── Badges — a compact medallion strip in the identity block, only when earned ── */}
      {badges.length > 0 && (
        <section className={styles.badges} aria-label="Badges">
          <ul className={styles.badgeStrip}>
            {badges.map((b) => {
              const meta = BADGE_META[b.badgeKey];
              return (
                <li key={b.id} className={styles.badgeChip}>
                  <span className={styles.badgeChipIcon} aria-hidden="true">
                    <Icon name={meta.icon as IconKey} size={18} />
                  </span>
                  <span className={styles.badgeChipName}>{meta.label}</span>
                  <time className={styles.badgeChipDate} dateTime={b.awardedAt}>
                    {formatBadgeDate(b.awardedAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Availability / readiness timeline ── */}
      <div className={styles.readinessWrap}>
        <ReadinessSlider value={optimisticTimeline} onChange={handleReadinessChange} saving={isPending} />
      </div>

      {/* ── Résumé — the heart of the application, always upfront ── */}
      <Link
        href="/resume"
        className={`${styles.resumeCard} ${resumeReady ? styles.resumeReady : styles.resumeUnfinished}`}
      >
        <span className={styles.resumeIcon} aria-hidden="true">
          <Icon name="profile.resume" size={24} />
        </span>
        <div className={styles.resumeText}>
          <span className={styles.resumeEyebrow}>Résumé</span>
          <span className={styles.resumeTitle}>
            {resumeReady ? "Ready to apply" : "Finish your résumé"}
          </span>
          <span className={styles.resumeSub}>
            {resumeReady
              ? "Your résumé is the heart of every application — keep it sharp."
              : `${resumePct}% complete — reach ${RESUME_APPLY_THRESHOLD}% to unlock applying.`}
          </span>
          <div className={styles.resumeMeter} aria-hidden="true">
            <div className={styles.resumeMeterFill} style={{ width: `${resumePct}%` }} />
          </div>
        </div>
        <span className={styles.resumeCta}>
          <span>{resumeReady ? "View résumé" : "Finish résumé"}</span>
          <Icon name="action.forward" size={18} aria-hidden />
        </span>
      </Link>

      {/* ── Offers — critical, prominent, only when the seeker has one ── */}
      {hasOffers && (
        <Link href="/offered" className={styles.offersCallout}>
          <span className={styles.offersIcon} aria-hidden="true">
            <Icon name="status.offered" size={24} />
          </span>
          <div className={styles.offersText}>
            <span className={styles.offersEyebrow}>Offer waiting</span>
            <span className={styles.offersTitle}>
              {status.offersCount === 1 ? "You have an offer" : `You have ${status.offersCount} offers`}
            </span>
            <span className={styles.offersSub}>Review and respond before they expire.</span>
          </div>
          <span className={styles.offersCta}>
            <span>Review</span>
            <Icon name="action.forward" size={18} aria-hidden />
          </span>
        </Link>
      )}

      {/* ── Matched jobs (not yet applied) — a compact rail of DiscoveryCards ── */}
      <section className={styles.railSection} aria-label="Matched for you">
        <div className={styles.railHead}>
          <h2 className={styles.railTitle}>
            <Icon name="status.match" size={18} aria-hidden />
            Matched for you
          </h2>
          {matchedRail.length > 0 && (
            <Link href="/seek" className={styles.railSeeAll}>
              See all
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          )}
        </div>

        {matchedRail.length > 0 ? (
          <ul className={styles.rail}>
            {matchedRail.map((listing) => (
              <li key={listing.id} className={styles.railItem}>
                <DiscoveryCard
                  data={toDiscoveryCardData(listing)}
                  surface="matched"
                  onOpen={openListing}
                  onHostClick={openListing}
                  onLocationClick={openListing}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.railEmpty}>
            <p className={styles.railEmptyBody}>
              {resumeReady
                ? "No matches right now — keep exploring opportunities."
                : "Complete your résumé to unlock roles matched to you."}
            </p>
            <Link href={resumeReady ? "/seek" : "/resume"} className={styles.railEmptyLink}>
              {resumeReady ? "Explore roles" : "Finish résumé"}
              <Icon name="action.forward" size={16} aria-hidden />
            </Link>
          </div>
        )}
      </section>

      {/* ── Boosted opportunities — a bonus rail, only when present ── */}
      {boostedListings.length > 0 && (
        <section className={styles.railSection} aria-label="Boosted opportunities">
          <div className={styles.railHead}>
            <h2 className={styles.railTitle}>
              <Icon name="status.boosted" size={18} aria-hidden />
              Boosted opportunities
            </h2>
          </div>
          <ul className={styles.rail}>
            {boostedListings.map((listing) => (
              <li key={listing.id} className={styles.railItem}>
                <DiscoveryCard
                  data={toDiscoveryCardData(listing)}
                  surface="matched"
                  onOpen={openListing}
                  onHostClick={openListing}
                  onLocationClick={openListing}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── The rest of your space — tucked behind a compact index ── */}
      <nav className={styles.tuckedNav} aria-label="More of your space">
        <h2 className={styles.tuckedTitle}>Your space</h2>
        <ul className={styles.tuckedGrid}>
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className={styles.tuckedTile}>
                <span className={styles.tuckedIcon} aria-hidden="true">
                  <Icon name={item.icon} size={20} />
                </span>
                <span className={styles.tuckedLabel}>{item.label}</span>
                {item.meta && <span className={styles.tuckedMeta}>{item.meta}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
