"use client";

import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useTransition } from "react";

import { BADGE_META, type SeekerBadge } from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import { ReadinessSlider } from "./ReadinessSlider";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./ProfileHub.module.css";

/** Tone → tile accent class. Named distinctly from the callout tones so the
    CSS-module class scope never bleeds the callout fill onto a bucket tile. */
const BUCKET_TONE_CLASS: Record<"primary" | "soon", string> = {
  primary: styles.bucketPrimary,
  soon: styles.bucketSoon,
};

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

/**
 * A single navigable BUCKET tile. The landing is a glanceable index of these —
 * summary + entry point only; the detail lives on the sub-route it links to
 * (separation of surfaces). `meta` is a live count/percent shown as a chip;
 * `tone` promotes a time-sensitive bucket (offers) without a loud full fill.
 */
interface Bucket {
  readonly href: string;
  readonly label: string;
  readonly summary: string;
  readonly icon: IconKey;
  readonly meta?: string;
  readonly tone?: "primary" | "soon";
}

/** The one next-best-action surfaced above the buckets. Always resolves to one. */
interface NextAction {
  readonly tone: "primary" | "soon" | "calm";
  readonly eyebrow: string;
  readonly title: string;
  readonly sub: string;
  readonly cta: string;
  readonly icon: IconKey;
  readonly href: string;
  readonly progress?: number;
}

function resolveNextAction(status: SeekerStatusSummary, resumeReady: boolean): NextAction {
  if (status.offersCount > 0) {
    return {
      tone: "primary",
      eyebrow: "Offer waiting",
      title: status.offersCount === 1 ? "You have an offer" : `You have ${status.offersCount} offers`,
      sub: "Review and respond before they expire.",
      cta: "Review",
      icon: "status.match",
      href: "/offered",
    };
  }
  if (!resumeReady) {
    return {
      tone: "soon",
      eyebrow: "Almost there",
      title: "Finish your resume",
      sub: `${status.resumeCompletion}% — reach ${RESUME_APPLY_THRESHOLD}% to unlock applications.`,
      cta: "Continue",
      icon: "profile.resume",
      href: "/resume",
      progress: status.resumeCompletion,
    };
  }
  return {
    tone: "calm",
    eyebrow: "You're set",
    title: "You're ready to apply",
    sub: "Keep exploring opportunities matched to you.",
    cta: "Explore",
    icon: "nav.seek",
    href: "/seek",
  };
}

/**
 * Build the bucket index from real seeker data. Counts render only when > 0 so
 * empty states stay honest (the summary line carries the empty message instead
 * of a sad "0" chip). Every href resolves to an existing seeker route.
 */
function buildBuckets(status: SeekerStatusSummary, resumeReady: boolean, matchedCount: number): readonly Bucket[] {
  const buckets: Bucket[] = [
    {
      href: "/resume",
      label: "Resume & readiness",
      summary: resumeReady ? "Ready to apply" : "Finish it to unlock applying",
      icon: "profile.resume",
      meta: `${status.resumeCompletion}%`,
      tone: resumeReady ? undefined : "soon",
    },
    {
      href: "/applied",
      label: "Applications",
      summary: status.appliedCount > 0 ? "Track where you stand" : "You haven't applied yet",
      icon: "status.applied",
      meta: status.appliedCount > 0 ? String(status.appliedCount) : undefined,
    },
    {
      href: "/offered",
      label: "Offers",
      summary: status.offersCount > 0 ? "Respond before they expire" : "No offers yet",
      icon: "status.offered",
      meta: status.offersCount > 0 ? String(status.offersCount) : undefined,
      tone: status.offersCount > 0 ? "primary" : undefined,
    },
    {
      href: "/saved",
      label: "Saved",
      summary: status.savedCount > 0 ? "Opportunities you bookmarked" : "Nothing saved yet",
      icon: "nav.saved",
      meta: status.savedCount > 0 ? String(status.savedCount) : undefined,
    },
  ];

  if (matchedCount > 0) {
    buckets.push({
      href: "/seek",
      label: "Matched for you",
      summary: "Roles picked to fit your profile",
      icon: "status.match",
      meta: String(matchedCount),
    });
  }

  buckets.push(
    {
      href: "/journey",
      label: "Journey",
      summary: status.acceptedUpcoming
        ? `Upcoming: ${status.acceptedUpcoming}`
        : "Travel plans & your timeline",
      icon: "mappin.cluster",
    },
    {
      href: "/community",
      label: "Community",
      summary: "Photos, feed & announcements",
      icon: "nav.feed",
    },
    {
      href: "/settings",
      label: "Settings",
      summary: "Account, notifications & privacy",
      icon: "nav.settings",
    },
  );

  return buckets;
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
  const isPhoto = Boolean(heroCoverUrl && (heroCoverUrl.startsWith("http") || heroCoverUrl.startsWith("/")));
  const heroBg = isPhoto
    ? undefined
    : (CATEGORY_GRADIENTS[preferredCategories[0] ?? ""] ?? DEFAULT_GRADIENT);

  const nextAction = resolveNextAction(status, resumeReady);
  const buckets = buildBuckets(status, resumeReady, matchedListings.length);

  function handleReadinessChange(value: string) {
    if (!seekerProfileId) return;
    startTransition(async () => {
      setOptimisticTimeline(value);
      await saveReadinessAction(value);
    });
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

      {/* ── Availability / readiness ── */}
      <div className={styles.readinessWrap}>
        <ReadinessSlider value={optimisticTimeline} onChange={handleReadinessChange} saving={isPending} />
      </div>

      {/* ── One next-best-action — the module's dominant element ── */}
      <Link href={nextAction.href} className={`${styles.callout} ${styles[nextAction.tone]}`}>
        <span className={styles.calloutIcon} aria-hidden="true">
          <Icon name={nextAction.icon} size={24} />
        </span>
        <div className={styles.calloutText}>
          <span className={styles.calloutEyebrow}>{nextAction.eyebrow}</span>
          <span className={styles.calloutTitle}>{nextAction.title}</span>
          <span className={styles.calloutSub}>{nextAction.sub}</span>
          {nextAction.progress != null && (
            <div className={styles.progressTrack} aria-hidden="true">
              <div className={styles.progressFill} style={{ width: `${nextAction.progress}%` }} />
            </div>
          )}
        </div>
        <span className={styles.calloutCta}>
          <span className={styles.calloutCtaLabel}>{nextAction.cta}</span>
          <Icon name="action.forward" size={20} aria-hidden />
        </span>
      </Link>

      {/* ── Buckets — the decluttered index: summaries + entry points only ── */}
      <nav className={styles.buckets} aria-label="Profile sections">
        <h2 className={styles.bucketsTitle}>Your space</h2>
        <ul className={styles.bucketGrid}>
          {buckets.map((bucket) => (
            <li key={bucket.href}>
              <Link
                href={bucket.href}
                className={`${styles.bucket} ${bucket.tone ? BUCKET_TONE_CLASS[bucket.tone] : ""}`}
              >
                <span className={styles.bucketIcon} aria-hidden="true">
                  <Icon name={bucket.icon} size={22} />
                </span>
                <span className={styles.bucketText}>
                  <span className={styles.bucketLabel}>{bucket.label}</span>
                  <span className={styles.bucketSummary}>{bucket.summary}</span>
                </span>
                {bucket.meta && (
                  <span
                    className={bucket.tone === "primary" ? styles.bucketMetaEmphasis : styles.bucketMeta}
                  >
                    {bucket.meta}
                  </span>
                )}
                <span className={styles.bucketChevron} aria-hidden="true">
                  <Icon name="action.forward" size={16} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ── Badges — a compact medallion strip, only when earned ── */}
      {badges.length > 0 && (
        <section className={styles.badges} aria-label="Badges">
          <h2 className={styles.bucketsTitle}>Badges</h2>
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
    </div>
  );
}
