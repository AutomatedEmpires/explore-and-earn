"use client";

import Image from "next/image";
import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";

import { BADGE_META, type SeekerBadge } from "@explore-and-earn/contracts";
import { Icon, type IconKey } from "@explore-and-earn/ui";
import { saveReadinessAction } from "../../app/actions/seekerProfile";
import type { DiscoveryListing } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import { DashboardNav } from "./DashboardNav";
import { FeaturedEmployerStrip } from "./FeaturedEmployerStrip";
import { MatchCardRail } from "./MatchCardRail";
import { ReadinessSlider } from "./ReadinessSlider";
import { RESUME_APPLY_THRESHOLD, type SeekerStatusSummary } from "./models";
import styles from "./ProfileHub.module.css";

const CATEGORY_GRADIENTS: Record<string, string> = {
  maritime: "linear-gradient(155deg, #072944 0%, #0E4F80 38%, #1874AC 70%, #3A96C6 100%)",
  farm:     "linear-gradient(155deg, #2A1608 0%, #5C3610 35%, #96601C 68%, #CC9440 100%)",
  remote:   "linear-gradient(155deg, #0A1422 0%, #182A40 35%, #2A4668 68%, #4268A0 100%)",
  seasonal: "linear-gradient(155deg, #0C1E08 0%, #204015 35%, #38701E 68%, #76B03A 100%)",
  mix:      "linear-gradient(155deg, #18082A 0%, #341256 38%, #64228C 70%, #A44060 100%)",
};
const DEFAULT_GRADIENT = "linear-gradient(155deg, #1A2030 0%, #2C3E58 38%, #406080 70%, #6090B0 100%)";

const CATEGORY_LABELS: Record<string, string> = {
  maritime: "Maritime",
  farm:     "Farm",
  remote:   "Remote",
  seasonal: "Seasonal",
  mix:      "Mix",
};

const MANAGE_LINKS: ReadonlyArray<{ href: string; icon: string; label: string; detail: string }> = [
  { href: "/profile/edit", icon: "nav.profile",      label: "Edit profile",  detail: "Name, bio, preferences" },
  { href: "/resume",       icon: "nav.profile",      label: "Resume",        detail: "Tag-based profile" },
  { href: "/saved",        icon: "action.save",      label: "Saved",         detail: "Bookmarked roles" },
  { href: "/applied",      icon: "action.apply",     label: "Applications",  detail: "Track status" },
  { href: "/offered",      icon: "status.match",     label: "Offers",        detail: "Review host offers" },
  { href: "/invites",      icon: "action.message",   label: "Invites",       detail: "Host invitations" },
  { href: "/journey",      icon: "analytics.trend",  label: "Journey",       detail: "Adventure timeline" },
  { href: "/messages",     icon: "action.message",   label: "Messages",      detail: "Host conversations" },
  { href: "/travel",       icon: "mappin.cluster",   label: "Travel",        detail: "Plan travel" },
  { href: "/schedule",     icon: "category.seasonal",label: "Schedule",      detail: "Shifts & check-ins" },
  { href: "/settings",     icon: "system.lock",      label: "Settings",      detail: "Account & privacy" },
  { href: "/help",         icon: "system.info",      label: "Help",          detail: "Guides & support" },
];

function formatBadgeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  featuredEmployers = [],
}: ProfileHubProps) {
  const [navOpen, setNavOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [optimisticTimeline, setOptimisticTimeline] = useOptimistic(seekingTimeline ?? null);

  const initials = status.seekerName
    .trim()
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "SE";

  const resumeReady = status.resumeCompletion >= RESUME_APPLY_THRESHOLD;
  const isPhoto = heroCoverUrl && (heroCoverUrl.startsWith("http") || heroCoverUrl.startsWith("/"));
  const heroBg = isPhoto
    ? undefined
    : (CATEGORY_GRADIENTS[preferredCategories[0] ?? ""] ?? DEFAULT_GRADIENT);

  function handleReadinessChange(value: string) {
    if (!seekerProfileId) return;
    startTransition(async () => {
      setOptimisticTimeline(value);
      await saveReadinessAction(value);
    });
  }

  return (
    <>
      <DashboardNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        seekerName={status.seekerName}
        avatarUrl={profilePhotoUrl}
        unreadCount={status.unreadNotifications}
      />

      <div className={styles.page}>

        {/* ── Full-bleed cover photo ── */}
        <section
          className={styles.hero}
          style={heroBg ? { background: heroBg } : undefined}
          aria-label="Profile cover"
        >
          {isPhoto && heroCoverUrl && (
            <Image
              src={heroCoverUrl}
              alt=""
              fill
              sizes="100vw"
              className={styles.heroBg}
              priority
            />
          )}
          <div className={styles.heroOverlay} aria-hidden="true" />

          <div className={styles.topBar}>
            <button
              type="button"
              className={styles.menuBtn}
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
            >
              <Icon name="action.more" size={20} />
            </button>
            <Link href="/seek" className={styles.editBtn} aria-label="Change cover photo on Seek">
              <Icon name="action.more" size={16} />
              <span>Cover</span>
            </Link>
          </div>
        </section>

        {/* ── Avatar + identity: avatar straddles the hero/content boundary ── */}
        <div className={styles.identityBar}>
          {/* Avatar — top half over hero photo, bottom half in content area */}
          <div className={styles.avatarWrap} aria-hidden="true">
            {profilePhotoUrl ? (
              <Image
                src={profilePhotoUrl}
                alt=""
                width={88}
                height={88}
                className={styles.avatarImg}
              />
            ) : (
              <div className={styles.avatarInitials}>{initials}</div>
            )}
          </div>

          {/* Text: pushed into the content area beside the avatar's bottom half */}
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

        {/* ── Seeking / readiness timeline ── */}
        <div className={styles.readinessWrap}>
          <ReadinessSlider
            value={optimisticTimeline}
            onChange={handleReadinessChange}
            saving={isPending}
          />
        </div>

        {/* ── Application status + quick stats ── */}
        <div className={styles.statsRow} role="list" aria-label="Your activity">
          <Link
            href="/resume"
            className={`${styles.statusCell} ${resumeReady ? styles.statusGreen : styles.statusAmber}`}
            role="listitem"
          >
            <span className={styles.statusIcon} aria-hidden="true">
              <Icon name={resumeReady ? "status.match" : "system.warning"} size={20} />
            </span>
            <span className={styles.statusLabel}>
              {resumeReady ? "Can Apply" : "Can't Apply"}
            </span>
            <span className={styles.statusSub}>
              {resumeReady
                ? "Resume ready"
                : `${status.resumeCompletion}% — need ${RESUME_APPLY_THRESHOLD}%`}
            </span>
          </Link>

          <Link href="/resume" className={styles.miniStat} role="listitem">
            <span className={styles.miniVal}>{status.resumeCompletion}%</span>
            <span className={styles.miniLabel}>Resume</span>
          </Link>
          <Link href="/saved" className={styles.miniStat} role="listitem">
            <span className={styles.miniVal}>{status.savedCount}</span>
            <span className={styles.miniLabel}>Saved</span>
          </Link>
          <Link href="/applied" className={styles.miniStat} role="listitem">
            <span className={styles.miniVal}>{status.appliedCount}</span>
            <span className={styles.miniLabel}>Applied</span>
          </Link>
          {status.offersCount > 0 && (
            <Link href="/offered" className={`${styles.miniStat} ${styles.miniStatUrgent}`} role="listitem">
              <span className={styles.miniVal}>{status.offersCount}</span>
              <span className={styles.miniLabel}>Offers</span>
            </Link>
          )}
        </div>

        {/* ── Matched for you ── */}
        {matchedListings.length > 0 && (
          <MatchCardRail listings={matchedListings} title="Matched for You" />
        )}

        {/* ── Featured employers ── */}
        {featuredEmployers.length > 0 && (
          <FeaturedEmployerStrip employers={featuredEmployers} />
        )}

        {/* ── Resume completion callout ── */}
        {!resumeReady && (
          <Link href="/resume" className={styles.resumeCallout} aria-label="Complete your resume">
            <div className={styles.resumeCalloutLeft}>
              <span className={styles.resumeCalloutTitle}>Finish your resume</span>
              <span className={styles.resumeCalloutSub}>
                {status.resumeCompletion}% done — reach {RESUME_APPLY_THRESHOLD}% to unlock applications
              </span>
              <div className={styles.resumeTrack}>
                <div
                  className={styles.resumeFill}
                  style={{ width: `${status.resumeCompletion}%` }}
                />
              </div>
            </div>
            <span className={styles.resumeCalloutArrow} aria-hidden="true">→</span>
          </Link>
        )}

        {/* ── Badges ── */}
        {badges.length > 0 && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Badges</h2>
            <ul className={styles.badgeList}>
              {badges.map((b) => {
                const meta = BADGE_META[b.badgeKey];
                return (
                  <li key={b.id} className={styles.badgeItem}>
                    <span className={styles.badgeIcon} aria-hidden="true">
                      <Icon name={meta.icon as IconKey} size={20} />
                    </span>
                    <div className={styles.badgeInfo}>
                      <span className={styles.badgeName}>{meta.label}</span>
                      <span className={styles.badgeDesc}>{meta.description}</span>
                    </div>
                    <time className={styles.badgeDate} dateTime={b.awardedAt}>
                      {formatBadgeDate(b.awardedAt)}
                    </time>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* ── Manage links ── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Manage</h2>
          <ul className={styles.manageGrid}>
            {MANAGE_LINKS.map((link) => (
              <li key={link.href}>
                <Link className={styles.manageTile} href={link.href}>
                  <span className={styles.tileIcon} aria-hidden="true">
                    <Icon name={link.icon as Parameters<typeof Icon>[0]["name"]} size={20} />
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileLabel}>{link.label}</span>
                    <span className={styles.tileDetail}>{link.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

      </div>
    </>
  );
}
