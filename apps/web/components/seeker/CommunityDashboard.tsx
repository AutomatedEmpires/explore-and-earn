"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CommunityTab = "feed" | "photos" | "announcements";
import { Icon, AppIllustration, type IllustrationKey } from "@explore-and-earn/ui";
import type { OpportunityCategory, ReactionKey } from "@explore-and-earn/contracts";
import type {
  CommunityPhoto,
  HostAnnouncement as ContractAnnouncement,
  ReactionCounts,
} from "@explore-and-earn/contracts";
import { PostEngagement } from "../community/PostEngagement";

import type { DiscoveryListing } from "../discovery";
import { CATEGORY_LABEL } from "../discovery";
import type { FeaturedEmployer } from "../public/FeaturedEmployersRail";
import type { SeekerStatusSummary } from "./models";
import { HostAnnouncementComposer } from "../host/HostAnnouncementComposer";
import {
  deleteCommunityPhotoAction,
  reportCommunityPhotoAction,
  uploadCommunityPhotoAction,
} from "../../app/actions/community";
import { getEditorialPosts, type EditorialPost } from "../../lib/editorial";
import { byMonetization, STRONG_MATCH_THRESHOLD } from "../../lib/ranking";
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
  readonly dbId?: string;
  readonly userReactions?: readonly ReactionKey[];
  readonly commentCount?: number;
  readonly isOwner: boolean;
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
  readonly dbId?: string;
  readonly userReactions?: readonly ReactionKey[];
  readonly commentCount?: number;
  readonly isPurchased?: boolean;
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

type EditorialCard = {
  readonly kind: "editorial";
  readonly id: string;
  readonly post: EditorialPost;
};

type FeedItem =
  | SeekerPost
  | HostAnnouncement
  | BoostedListing
  | FeaturedEmployerCard
  | EditorialCard;

type FeedSlotType = "seeker" | "announcement" | "listing" | "employer" | "editorial";

interface CommunityDashboardProps {
  readonly tab: "feed" | "photos" | "announcements";
  readonly status: SeekerStatusSummary;
  readonly listings: readonly DiscoveryListing[];
  readonly featuredEmployers?: readonly FeaturedEmployer[];
  // Real DB data — when provided, merged into the feed and tabs
  readonly serverPhotos?: readonly CommunityPhoto[];
  readonly serverAnnouncements?: readonly ContractAnnouncement[];
  // Seeker profile gate
  readonly completionScore?: number;
  // Host context (for announcement composer)
  readonly isHost?: boolean;
  readonly hostTier?: string;
  readonly hostUsedThisMonth?: number;
  readonly hostDraftAnnouncementId?: string | null;
  readonly currentSeekerProfileId?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────


const POPULAR_TAGS = [
  "CabinLife", "TrailLife", "SunriseShift",
  "Adventure", "NowHiring", "Community",
] as const;

const CATEGORY_ABBR: Record<OpportunityCategory, string> = {
  farm:     "FARM",
  maritime: "SEA",
  remote:   "REMOTE",
  seasonal: "SEASONAL",
  mix:      "MIX",
};

/** Preferred cadence — a communal rhythm, never a spammy dump. The ranker honours
 *  this order where supply exists, and the "no more than 2 of one type in a row"
 *  rule below guarantees variety regardless of what's actually available. Photos
 *  (seeker) lead so the wall reads as the seekers' community first. */
const FEED_TYPE_RHYTHM: readonly FeedSlotType[] = [
  "seeker",
  "seeker",
  "announcement",
  "listing",
  "seeker",
  "editorial",
  "seeker",
  "employer",
  "seeker",
  "announcement",
];

/** Feed regulation (founder direction 2026-07-13): the community wall must never
 *  feel oversaturated. Over every rolling window of FEED_WINDOW posts the three
 *  high-volume / promotional streams are capped — at most 6 photos, 2 job-share
 *  listings, and 2 host announcements per 10 posts. Employer + editorial cards
 *  are scarce by supply (≤2 each) and act as organic filler between them. The cap
 *  only shapes ORDER; a fallback still emits any remaining content so nothing real
 *  is ever dropped. Promoted listing slots are pre-ranked by monetization
 *  (byMonetization) upstream in buildListingFeedCards. */
const FEED_WINDOW = 10;
const WINDOW_CAP: Partial<Record<FeedSlotType, number>> = {
  seeker: 6,
  listing: 2,
  announcement: 2,
};

// ─── Tab navigation ───────────────────────────────────────────────────────────

// Order is founder-locked: Photos | Feed | Announcements (L→R). COMMUNITY_TABS
// (render order) and TAB_ORDER (arrow-key index math) must stay in lockstep.
const COMMUNITY_TABS = [
  { id: "photos" as const, label: "Photos", icon: "nav.photos" as const },
  { id: "feed" as const, label: "Feed", icon: "nav.feed" as const },
  { id: "announcements" as const, label: "Announcements", icon: "nav.announcements" as const },
] as const;

const TAB_ORDER: readonly CommunityTab[] = ["photos", "feed", "announcements"];

/**
 * True ARIA tablist: role=tablist/tab with roving tabindex, arrow-key + Home/End
 * navigation, and aria-selected. Switching is client-side (activeTab state) and
 * mirrored into the URL via ?tab= so a panel is shareable. The underlying routes
 * still exist for direct/SSR entry — they hydrate the matching tab.
 */
function CommunityTabNav({
  activeTab,
  onSelect,
}: {
  readonly activeTab: CommunityTab;
  readonly onSelect: (tab: CommunityTab) => void;
}) {
  const tabRefs = useRef<Record<CommunityTab, HTMLButtonElement | null>>({
    feed: null,
    photos: null,
    announcements: null,
  });

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      nextIndex = (index + 1) % TAB_ORDER.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      nextIndex = (index - 1 + TAB_ORDER.length) % TAB_ORDER.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = TAB_ORDER.length - 1;
    }
    if (nextIndex === null) return;
    e.preventDefault();
    const nextTab = TAB_ORDER[nextIndex]!;
    onSelect(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div className={styles.tabNav} role="tablist" aria-label="Community sections">
      {COMMUNITY_TABS.map((t, index) => {
        const selected = activeTab === t.id;
        return (
          <button
            key={t.id}
            ref={el => { tabRefs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`community-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`community-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={`${styles.tabLink}${selected ? ` ${styles.tabLinkActive}` : ""}`}
            onClick={() => onSelect(t.id)}
            onKeyDown={e => handleKeyDown(e, index)}
          >
            <Icon name={t.icon} size={16} aria-hidden />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Toast hook ───────────────────────────────────────────────────────────────

type ToastItem = { readonly id: string; readonly message: string };

function useToasts() {
  const [toasts, setToasts] = useState<readonly ToastItem[]>([]);

  const add = useCallback((message: string) => {
    const id = performance.now().toString(36) + Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message }]);
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3200);
    return () => window.clearTimeout(timer);
  }, []);

  return { toasts, add };
}


// ─── Discovery → feed adapters (real data only) ───────────────────────────────

function benefitLabel(provision: string, summary?: string): string {
  if (summary) return summary;
  if (provision === "provided") return "Provided";
  if (provision === "stipend") return "Stipend";
  return "Own arrange.";
}

/**
 * Promoted job-share cards for the feed. Only "pay more / fit more" listings earn
 * a promotional slot: boosted, or a strong match (≥90%). Within that eligible set
 * they are ordered by the shared monetization ranker (Boosted > Enterprise >
 * Matched≥90 …), with match score breaking ties. This never HIDES a listing from
 * the rest of the app — it only decides which few surface on the communal wall.
 */
function buildListingFeedCards(listings: readonly DiscoveryListing[]): BoostedListing[] {
  return [...listings]
    .filter(l =>
      l.conditionalBadges?.includes("boosted") ||
      (l.matchScore !== undefined && l.matchScore >= STRONG_MATCH_THRESHOLD),
    )
    // Match score first, then a STABLE monetization sort so equal-rank items keep
    // their match order (Array.prototype.sort is stable in modern engines).
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .sort(byMonetization<DiscoveryListing>(l => ({
      boosted: l.conditionalBadges?.includes("boosted"),
      hostTier: l.host?.tier,
      matchScore: l.matchScore,
    })))
    .slice(0, 4)
    .map((l): BoostedListing => ({
      kind: "listing",
      id: `listing-card-${l.id}`,
      listing: l,
      matchScore: l.matchScore,
      isBoosted: Boolean(l.conditionalBadges?.includes("boosted")),
    }));
}

function buildEmployerFeedCards(featuredEmployers: readonly FeaturedEmployer[]): FeaturedEmployerCard[] {
  return featuredEmployers.slice(0, 2).map(
    (emp, i): FeaturedEmployerCard => ({
      kind: "employer",
      id: `employer-card-${emp.hostId ?? String(i)}`,
      employer: emp,
    }),
  );
}

/** E&E "field guide" editorial posts, surfaced into the communal feed. Capped so
 *  the guide complements the feed without ever dominating it (static source). */
function buildEditorialFeedCards(): EditorialCard[] {
  return getEditorialPosts().slice(0, 2).map((post): EditorialCard => ({
    kind: "editorial",
    id: `editorial-${post.slug}`,
    post,
  }));
}

/**
 * Ranked, communal interleaver. Inputs are REAL content buckets (seeker photos,
 * host announcements, promoted listings, featured employers, field guides). It
 * favours the preferred rhythm + recency, but enforces two anti-saturation
 * invariants:
 *   1. never more than two of the same content type in a row, and
 *   2. a per-window density cap (WINDOW_CAP over FEED_WINDOW posts): at most 6
 *      photos, 2 listing-shares, and 2 announcements per 10 posts, so the wall
 *      can't be flooded by any one stream.
 * Buckets are consumed front-to-back (callers pre-sort seeker/announcement
 * buckets newest-first; listings arrive monetization-ranked), so priority is
 * preserved within a type while variety is preserved across types. A final
 * fallback still emits any remaining content so nothing real is ever dropped —
 * the caps only shape ordering, never inclusion.
 */
function rankCommunityFeed(buckets: Record<FeedSlotType, FeedItem[]>): FeedItem[] {
  const queues: Record<FeedSlotType, FeedItem[]> = {
    seeker: [...buckets.seeker],
    announcement: [...buckets.announcement],
    listing: [...buckets.listing],
    employer: [...buckets.employer],
    editorial: [...buckets.editorial],
  };

  const result: FeedItem[] = [];
  const remaining = () =>
    queues.seeker.length + queues.announcement.length +
    queues.listing.length + queues.employer.length + queues.editorial.length;

  const runOf = (type: FeedSlotType): number => {
    let run = 0;
    for (let i = result.length - 1; i >= 0; i--) {
      if (result[i]!.kind === type) run++;
      else break;
    }
    return run;
  };

  // How many of `type` sit inside the CURRENT window of FEED_WINDOW posts. The
  // window advances every FEED_WINDOW emitted items, so caps read as "per 10".
  const windowCount = (type: FeedSlotType): number => {
    const start = result.length - (result.length % FEED_WINDOW);
    let n = 0;
    for (let i = start; i < result.length; i++) {
      if (result[i]!.kind === type) n++;
    }
    return n;
  };
  const withinWindowCap = (type: FeedSlotType): boolean => {
    const cap = WINDOW_CAP[type];
    return cap === undefined || windowCount(type) < cap;
  };

  // Try the preferred rhythm first; on each step pick the best eligible type.
  let rhythmIdx = 0;
  while (remaining() > 0) {
    const preferred = FEED_TYPE_RHYTHM[rhythmIdx % FEED_TYPE_RHYTHM.length]!;
    rhythmIdx++;

    // Eligible = has supply, wouldn't create a 3-in-a-row, AND is within its
    // per-window density cap.
    const order: FeedSlotType[] = [
      preferred,
      "seeker", "announcement", "listing", "employer", "editorial",
    ];
    let chosen: FeedSlotType | null = null;
    for (const type of order) {
      if (queues[type].length === 0) continue;
      if (runOf(type) >= 2) continue;
      if (!withinWindowCap(type)) continue;
      chosen = type;
      break;
    }
    // Fallback: nothing satisfies the cap/anti-spam rules (e.g. only capped
    // content is left in this window) — relax the window cap but keep the run
    // rule where possible, then take whatever remains, so nothing real is dropped.
    if (!chosen) {
      chosen =
        order.find(t => queues[t].length > 0 && runOf(t) < 2) ??
        (["seeker", "announcement", "listing", "employer", "editorial"] as FeedSlotType[])
          .find(t => queues[t].length > 0) ?? null;
    }
    if (!chosen) break;
    result.push(queues[chosen].shift()!);
  }

  return result;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function reactionCountsToArray(counts?: ReactionCounts): readonly [number, number, number, number, number] {
  if (!counts) return [0, 0, 0, 0, 0];
  return [counts.smile, counts.heart, counts.hundred, counts.clap, counts.sparkle];
}

function photosToSeekerPosts(
  photos: readonly CommunityPhoto[],
  currentSeekerProfileId: string | null,
): SeekerPost[] {
  return photos.map((p): SeekerPost => ({
    kind: "seeker",
    id: `photo-${p.id}`,
    authorName: p.authorName,
    timestamp: formatRelativeTime(p.createdAt),
    caption: p.caption ?? "",
    tags: p.locationTag ? [p.locationTag] : [],
    coverUrl: p.storageUrl,
    reactions: reactionCountsToArray(p.reactionCounts),
    dbId: p.id,
    userReactions: p.reactionCounts?.userReactions,
    commentCount: p.commentCount,
    isOwner: Boolean(currentSeekerProfileId && p.seekerProfileId === currentSeekerProfileId),
  }));
}

function announcementsToFeedItems(anns: readonly ContractAnnouncement[]): HostAnnouncement[] {
  return anns.map((a): HostAnnouncement => ({
    kind: "announcement",
    id: `real-ann-${a.id}`,
    hostName: a.hostName,
    timestamp: formatRelativeTime(a.createdAt),
    text: a.title ? `${a.title} — ${a.body}` : a.body,
    coverUrls: [],
    reactions: reactionCountsToArray(a.reactionCounts),
    hostId: a.hostProfileId,
    dbId: a.id,
    userReactions: a.reactionCounts?.userReactions,
    commentCount: a.commentCount,
    isPurchased: a.isPurchased,
  }));
}

// ─── Photo upload form ────────────────────────────────────────────────────────

function PhotoUploadForm({
  completionScore,
  onSuccess,
  onToast,
}: {
  readonly completionScore: number;
  readonly onSuccess: (photoId: string) => void;
  readonly onToast: (msg: string) => void;
}) {
  const [caption, setCaption]       = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [fileError, setFileError]   = useState<string | null>(null);
  const [consent, setConsent]       = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  if (completionScore < 80) {
    return (
      <div className={styles.photoGate}>
        <Icon name="trust.verified_host" size={20} aria-hidden />
        <div className={styles.photoGateText}>
          <p className={styles.photoGateHeading}>Complete your profile to post photos</p>
          <p className={styles.photoGateSub}>
            You need 80% profile completion to post (currently {completionScore}%).
            Add your bio and experience to unlock.
          </p>
          <div
            className={styles.photoGateTrack}
            role="progressbar"
            aria-valuenow={completionScore}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Profile ${completionScore}% complete`}
          >
            <div className={styles.photoGateFill} style={{ width: `${completionScore}%` }} />
          </div>
          <Link href="/profile/edit" className={styles.photoGateCta}>
            Complete profile <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFileError(null);
    const fd = new FormData(e.currentTarget);
    const file = fileRef.current?.files?.[0];
    if (!file) { setFileError("Please select a photo."); return; }
    if (file.size > 10 * 1024 * 1024) { setFileError("Photo must be under 10 MB."); return; }
    startTransition(async () => {
      const result = await uploadCommunityPhotoAction(fd);
      if (result.ok) {
        onSuccess(result.photoId);
        onToast("Photo posted!");
        setCaption("");
        setLocationTag("");
        setConsent(false);
        if (fileRef.current) fileRef.current.value = "";
      } else if (result.reason === "incomplete_profile") {
        onToast(`Profile at ${result.score ?? completionScore}% — need 80% to post.`);
      } else if (result.reason === "consent_required") {
        onToast("Confirm the community photo consent before posting.");
      } else {
        onToast("Upload failed — please try again.");
      }
    });
  }

  return (
    <form className={styles.photoUploadForm} onSubmit={handleSubmit}>
      <div className={styles.photoComposerHead}>
        <span className={styles.photoComposerIcon} aria-hidden>
          <Icon name="nav.photos" size={20} aria-hidden />
        </span>
        <div className={styles.photoComposerHeadText}>
          <p className={styles.photoComposerTitle}>Share a moment</p>
          <p className={styles.photoComposerSub}>Trails, sunrise shifts, the crew — add it to the community wall.</p>
        </div>
      </div>
      <label className={styles.photoFileField}>
        <span className={styles.photoFileLabel}>
          <Icon name="nav.photos" size={20} aria-hidden />
          Choose a photo
        </span>
        <input
          ref={fileRef}
          name="photo"
          type="file"
          accept="image/jpeg,image/webp,image/png"
          className={styles.photoFileInput}
          disabled={isPending}
          required
        />
      </label>
      <label className={styles.photoField}>
        <span className={styles.photoFieldLabel}>Caption <span>(max 280 chars)</span></span>
        <textarea
          name="caption"
          className={styles.photoCaption}
          value={caption}
          onChange={e => setCaption(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="What's the story behind this shot?"
          disabled={isPending}
        />
        <span className={styles.photoCharCount}>{caption.length}/280</span>
      </label>
      <label className={styles.photoField}>
        <span className={styles.photoFieldLabel}>Location <span>(optional)</span></span>
        <input
          name="location_tag"
          className={styles.photoLocationInput}
          value={locationTag}
          onChange={e => setLocationTag(e.target.value)}
          maxLength={100}
          placeholder="Tillamook, OR"
          disabled={isPending}
        />
      </label>
      <label className={styles.photoConsent}>
        <input
          name="privacy_consent"
          type="checkbox"
          value="accepted"
          checked={consent}
          onChange={event => setConsent(event.target.checked)}
          disabled={isPending}
          required
        />
        <span>
          I chose to post this publicly, have permission from anyone shown, and understand I can
          delete it or report a concern. Location and camera metadata will be removed before upload.
        </span>
      </label>
      {fileError && <p className={styles.photoError}>{fileError}</p>}
      <button className={styles.photoSubmitBtn} type="submit" disabled={isPending || !consent}>
        {isPending ? "Posting…" : "Post Photo"}
      </button>
    </form>
  );
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

// ─── Toast stack ─────────────────────────────────────────────────────────────

function ToastStack({ toasts }: { readonly toasts: readonly ToastItem[] }) {
  if (!toasts.length) return null;
  return (
    <div className={styles.toastStack} role="status" aria-live="polite" aria-atomic="false">
      {toasts.map(t => (
        <div key={t.id} className={styles.toast}>{t.message}</div>
      ))}
    </div>
  );
}


// ─── Hashtag chips ────────────────────────────────────────────────────────────

function HashtagChips({ tags }: { readonly tags: readonly string[] }) {
  if (!tags.length) return null;
  return (
    <div className={styles.hashRow}>
      {tags.map(tag => (
        <Link key={tag} href={`/seek?q=${encodeURIComponent(tag)}`} className={styles.hashChip}>
          <span className={styles.hashSign} aria-hidden>#</span>
          {tag}
        </Link>
      ))}
    </div>
  );
}

// ─── Post more-options menu ───────────────────────────────────────────────────

interface PostMenuProps {
  readonly postId: string;
  readonly photoId?: string;
  readonly canDelete?: boolean;
  readonly onClose: () => void;
  readonly onHide: () => void;
  readonly onToast: (msg: string) => void;
}

function PostMenu({
  postId,
  photoId,
  canDelete = false,
  onClose,
  onHide,
  onToast,
}: PostMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [reported, setReported] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  // Auto-close after reporting
  useEffect(() => {
    if (!reported) return;
    const timer = window.setTimeout(onClose, 1800);
    return () => window.clearTimeout(timer);
  }, [reported, onClose]);

  function handleCopy() {
    const url = `${window.location.href.split("#")[0]}#${postId}`;
    navigator.clipboard.writeText(url).then(
      () => onToast("Link copied to clipboard"),
      () => onToast("Couldn't copy link — try manually"),
    );
    onClose();
  }

  function handleReport() {
    if (!photoId) return;
    startTransition(async () => {
      const result = await reportCommunityPhotoAction(photoId);
      if (result.ok) {
        setReported(true);
        onToast("Thanks for reporting — we'll review this post");
      } else {
        onToast("We couldn't submit that report. Please try again.");
      }
    });
  }

  function handleDelete() {
    if (!photoId || !window.confirm("Delete this photo from the community?")) return;
    startTransition(async () => {
      const result = await deleteCommunityPhotoAction(photoId);
      if (result.ok) {
        onHide();
        onToast("Photo deleted from the community");
        onClose();
      } else {
        onToast("We couldn't delete that photo. Please try again.");
      }
    });
  }

  function handleHide() {
    onHide();
    onToast("Post hidden from your feed");
    onClose();
  }

  return (
    <div ref={menuRef} className={styles.postMenu} role="menu" aria-label="Post options">
      {reported ? (
        <div className={styles.postMenuConfirm}>
          <span className={styles.postMenuConfirmIcon} aria-hidden>
            <Icon name="system.success" size={16} aria-hidden />
          </span>
          Thanks — we'll review this soon
        </div>
      ) : (
        <>
          <button type="button" className={styles.postMenuItem} role="menuitem" onClick={handleReport} disabled={isPending || !photoId}>
            Report post
          </button>
          {canDelete ? (
            <button type="button" className={styles.postMenuItem} role="menuitem" onClick={handleDelete} disabled={isPending}>
              Delete my photo
            </button>
          ) : null}
          <button type="button" className={styles.postMenuItem} role="menuitem" onClick={handleHide}>
            Hide from feed
          </button>
          <button type="button" className={styles.postMenuItem} role="menuitem" onClick={handleCopy}>
            Copy link
          </button>
        </>
      )}
    </div>
  );
}

// ─── Photo caption (clamp ~80 chars, single line, "read more") ────────────────

/** Photo captions stay glanceable: clamped to ~80 chars on one row, with an
 *  inline "read more" toggle when the full caption runs longer. */
const CAPTION_CLAMP = 80;
/** Photo posts carry at most this many tag chips. */
const MAX_PHOTO_TAGS = 3;

function PhotoCaption({ text }: { readonly text: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;
  const needsClamp = text.length > CAPTION_CLAMP;
  if (!needsClamp) {
    return <p className={styles.cardCaption}>{text}</p>;
  }
  return (
    <p className={styles.cardCaption}>
      {expanded ? text : `${text.slice(0, CAPTION_CLAMP).trimEnd()}… `}
      <button
        type="button"
        className={styles.captionMore}
        aria-expanded={expanded}
        onClick={() => setExpanded(prev => !prev)}
      >
        {expanded ? "Show less" : "read more"}
      </button>
    </p>
  );
}

// ─── Announcement text (host-authored, with interactive links) ────────────────

/** Splits an announcement body on http(s) URLs and renders each as a real link.
 *  Announcements are host-authored only, so this is safe host-supplied content. */
function AnnouncementText({ text }: { readonly text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <p className={styles.announcementText}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={`${part}-${i}`}
            href={part}
            className={styles.announcementLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            {part}
          </a>
        ) : (
          <span key={`t-${i}`}>{part}</span>
        ),
      )}
    </p>
  );
}

// ─── Seeker post card ─────────────────────────────────────────────────────────

interface SeekerCardProps {
  readonly post: SeekerPost;
  readonly onHide: () => void;
  readonly onToast: (msg: string) => void;
}

function SeekerCard({ post, onHide, onToast }: SeekerCardProps) {
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
          {menuOpen ? (
            <PostMenu
              postId={post.id}
              photoId={post.dbId}
              canDelete={post.isOwner}
              onClose={() => setMenuOpen(false)}
              onHide={onHide}
              onToast={onToast}
            />
          ) : null}
        </div>
      </div>
      <PhotoCaption text={post.caption} />
      <HashtagChips tags={post.tags.slice(0, MAX_PHOTO_TAGS)} />
      {post.coverUrl ? (
        <div className={styles.cardImageWrap}>
          <div className={styles.cardImageMat}>
            <img className={styles.cardImage} src={post.coverUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" />
          </div>
        </div>
      ) : null}
      <PostEngagement
        postId={post.id}
        dbId={post.dbId}
        targetType="photo"
        initialReactions={post.reactions}
        initialUserReactions={post.userReactions}
        commentCount={post.commentCount}
      />
    </article>
  );
}

// ─── Host announcement card ───────────────────────────────────────────────────

function AnnouncementCard({ post }: { readonly post: HostAnnouncement }) {
  const hostHref = post.hostId ? `/host/${post.hostId}` : "/community";
  return (
    <article className={`${styles.announcementCard}${post.isPurchased ? ` ${styles.announcementCardPromoted}` : ""}`}>
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
            {post.isPurchased ? (
              <span className={styles.promotedBadge}>
                <Icon name="status.featured" size={16} aria-hidden />
                Promoted
              </span>
            ) : null}
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
        <AnnouncementText text={post.text} />
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
      <PostEngagement
        postId={post.id}
        dbId={post.dbId}
        targetType="announcement"
        initialReactions={post.reactions}
        initialUserReactions={post.userReactions}
        commentCount={post.commentCount}
      />
    </article>
  );
}

// ─── Seekers-read announcements intro (non-host) ──────────────────────────────

function SeekerAnnouncementsIntro() {
  return (
    <div className={styles.annIntro}>
      <span className={styles.annIntroIcon} aria-hidden>
        <Icon name="nav.announcements" size={24} aria-hidden />
      </span>
      <div className={styles.annIntroText}>
        <p className={styles.annIntroTitle}>Announcements from verified hosts</p>
        <p className={styles.annIntroSub}>
          Seasonal openings, housing updates, and hiring calls — posted by hosts, read free by every
          seeker. Built by seekers, for seekers.
        </p>
      </div>
    </div>
  );
}

// ─── Hosts on the Photos surface (read-only) ──────────────────────────────────

/** Photos are a seekers-only space. Hosts can browse the wall but never get the
 *  upload affordance here — their broadcast channel is Announcements. This is a
 *  presentation gate; the real upload authorization lives in the server action. */
function HostPhotosNotice() {
  return (
    <div className={styles.annIntro}>
      <span className={styles.annIntroIcon} aria-hidden>
        <Icon name="nav.photos" size={24} aria-hidden />
      </span>
      <div className={styles.annIntroText}>
        <p className={styles.annIntroTitle}>The photo wall is a seekers-only space</p>
        <p className={styles.annIntroSub}>
          Seekers share moments from the field here. As a host, you can browse every photo —
          to reach the community, post an update from the Announcements tab.
        </p>
      </div>
    </div>
  );
}

// ─── Listing feed card ────────────────────────────────────────────────────────

function BenefitPill({ icon, label }: { readonly icon: string; readonly label: string }) {
  return (
    <span className={styles.benefitPill}>
      <Icon name={icon as Parameters<typeof Icon>[0]["name"]} size={16} aria-hidden />
      {label}
    </span>
  );
}

function ListingFeedCard({ item }: { readonly item: BoostedListing }) {
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

// ─── Featured employer feed card ──────────────────────────────────────────────

function EmployerBadgeMini({ name, category }: { readonly name: string; readonly category: OpportunityCategory }) {
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

function EmployerFeedCard({ item }: { readonly item: FeaturedEmployerCard }) {
  const { employer } = item;
  const href = employer.hostId ? `/host/${employer.hostId}` : "/community";
  return (
    <article className={styles.employerFeedCard}>
      <div className={styles.employerEyebrow}>
        <Icon name="trust.featured_employer" size={16} aria-hidden />
        <span>Featured employer</span>
        <span className={styles.employerStar} aria-hidden>
          <Icon name="status.featured" size={16} aria-hidden />
        </span>
      </div>
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

// ─── Editorial / field-guide feed card ────────────────────────────────────────

/** E&E field-guide post in the feed. Reuses the `.blog*` card family (text-only
 *  layout — editorial posts carry no cover image) and links to the /blog route. */
function EditorialFeedCard({ item }: { readonly item: EditorialCard }) {
  const { post } = item;
  const formatted = new Date(post.publishedAt).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  return (
    <article className={styles.blogCard}>
      <div className={styles.blogLayoutFull}>
        <div className={styles.blogText}>
          <div className={styles.blogMeta}>
            <span className={styles.blogBrand} aria-hidden>
              <Icon name="nav.feed" size={16} aria-hidden />
            </span>
            <span className={styles.blogBadge}>{post.kind}</span>
            <span className={styles.blogTreeRule} aria-hidden>
              {formatted} · {post.readMinutes} min read
            </span>
          </div>
          <h3 className={styles.blogTitle}>{post.title}</h3>
          <p className={styles.blogExcerpt}>{post.excerpt}</p>
          <Link href={`/blog/${post.slug}`} className={styles.readMoreBtn}>
            Read the guide
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

// ─── Feed end marker ──────────────────────────────────────────────────────────

function FeedEndMarker() {
  return (
    <div className={styles.feedEnd} aria-label="End of feed">
      <div className={styles.feedEndRule} aria-hidden>
        <span className={styles.feedEndIcon}>
          <Icon name="category.seasonal" size={20} aria-hidden />
        </span>
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

// ─── Community empty state ─────────────────────────────────────────────────────

function CommunityEmptyState({
  icon,
  illustration,
  heading,
  sub,
  ctaLabel,
  ctaHref,
}: {
  readonly icon: Parameters<typeof Icon>[0]["name"];
  readonly illustration?: IllustrationKey;
  readonly heading: string;
  readonly sub: string;
  readonly ctaLabel?: string;
  readonly ctaHref?: string;
}) {
  return (
    <div className={styles.emptyState}>
      {illustration ? (
        <AppIllustration name={illustration} size="lg" aria-hidden />
      ) : (
        <span className={styles.emptyStateIcon} aria-hidden>
          <Icon name={icon} size={24} aria-hidden />
        </span>
      )}
      <p className={styles.emptyStateHeading}>{heading}</p>
      <p className={styles.emptyStateSub}>{sub}</p>
      {ctaLabel && ctaHref ? (
        <Link href={ctaHref} className={styles.emptyStateCta}>
          {ctaLabel}
          <Icon name="action.forward" size={16} aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

// ─── Share composer CTA ───────────────────────────────────────────────────────

function ShareComposer({ seekerInitial }: { readonly seekerInitial: string }) {
  return (
    <div className={styles.composerCta}>
      <div className={styles.composerCtaAvatar} aria-hidden>{seekerInitial}</div>
      <div className={styles.composerCtaBody}>
        <p className={styles.composerCtaPrompt}>Share your adventure with the community</p>
        <p className={styles.composerCtaSub}>Photos, sunrise shifts, trail moments — all welcome.</p>
      </div>
      <Link href="/community/photos" className={styles.composerCtaBtn} aria-label="Add a photo">
        <Icon name="nav.photos" size={16} aria-hidden />
        Add photo
      </Link>
    </div>
  );
}

// ─── Photo lightbox ───────────────────────────────────────────────────────────

function PhotoLightbox({ url, caption, onClose }: { readonly url: string; readonly caption: string; readonly onClose: () => void }) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className={styles.lightbox}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
    >
      <button
        type="button"
        className={styles.lightboxClose}
        aria-label="Close photo"
        onClick={onClose}
      >
        <Icon name="action.more" size={16} aria-hidden />
      </button>
      <figure className={styles.lightboxFigure} onClick={e => e.stopPropagation()}>
        <img className={styles.lightboxImg} src={url} alt={caption} />
        {caption ? <figcaption className={styles.lightboxCaption}>{caption}</figcaption> : null}
      </figure>
    </div>
  );
}

// ─── Photo masonry grid ───────────────────────────────────────────────────────

function PhotoMasonryGrid({ photos }: { readonly photos: SeekerPost[] }) {
  const [lightboxPost, setLightboxPost] = useState<SeekerPost | null>(null);

  if (!photos.length) {
    return (
      <CommunityEmptyState
        icon="nav.photos"
        illustration="empty.photos"
        heading="No photos yet"
        sub="Be the first to share a moment from the field — sunrise shifts, trail views, and life on the road all belong here."
        ctaLabel="Share a photo"
        ctaHref="/community/photos"
      />
    );
  }

  return (
    <>
      <div className={styles.photoMasonry} aria-label="Community photos">
        {photos.map((post, i) => (
          <button
            key={post.id}
            type="button"
            className={styles.polaroidCard}
            style={{ "--polaroid-index": String(i) } as React.CSSProperties}
            onClick={() => setLightboxPost(post)}
            aria-label={`View photo by ${post.authorName}: ${post.caption}`}
          >
            <div className={styles.polaroidFrame}>
              <img
                className={styles.polaroidImg}
                src={post.coverUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className={styles.polaroidMeta}>
              <span className={styles.polaroidAuthor}>{post.authorName}</span>
              <span className={styles.polaroidTime}>{post.timestamp}</span>
            </div>
            <p className={styles.polaroidCaption}>{post.caption.split(".")[0]}.</p>
          </button>
        ))}
      </div>
      {lightboxPost?.coverUrl ? (
        <PhotoLightbox
          url={lightboxPost.coverUrl}
          caption={lightboxPost.caption}
          onClose={() => setLightboxPost(null)}
        />
      ) : null}
    </>
  );
}

// ─── Sidebar components ───────────────────────────────────────────────────────

function PopularTagsWidget() {
  return (
    <section className={styles.widget}>
      <h3 className={styles.widgetTitle}>
        <Icon name="trust.featured_employer" size={16} aria-hidden />
        Popular tags
      </h3>
      <div className={styles.widgetTagGrid}>
        {POPULAR_TAGS.map(tag => (
          <Link key={tag} href={`/seek?q=${encodeURIComponent(tag)}`} className={styles.widgetTag}>#{tag}</Link>
        ))}
      </div>
      <span className={styles.widgetFooter}>Explore more in Photos &rarr;</span>
    </section>
  );
}

function UpcomingListingsWidget({ listings }: { readonly listings: readonly DiscoveryListing[] }) {
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

export function CommunityDashboard({
  tab,
  status,
  listings,
  featuredEmployers = [],
  serverPhotos,
  serverAnnouncements,
  completionScore = 0,
  isHost = false,
  hostTier = "none",
  hostUsedThisMonth = 0,
  hostDraftAnnouncementId = null,
  currentSeekerProfileId = null,
}: CommunityDashboardProps) {
  const { toasts, add: addToast } = useToasts();
  const router = useRouter();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());

  // Hydrate hidden posts from localStorage after mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ee_hidden_posts");
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setHiddenIds(new Set(parsed as string[]));
      }
    } catch { /* storage unavailable */ }
  }, []);

  function hidePost(id: string) {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("ee_hidden_posts", JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

  // Client-controlled active tab (seeds from the route's `tab` prop, mirrors ?tab=).
  const [activeTab, setActiveTab] = useState<CommunityTab>(tab);

  useEffect(() => { setActiveTab(tab); }, [tab]);

  // Honour a shared ?tab= on first paint and keep state in sync with back/forward.
  useEffect(() => {
    function syncFromUrl() {
      const param = new URLSearchParams(window.location.search).get("tab");
      if (param === "feed" || param === "photos" || param === "announcements") {
        setActiveTab(param);
      }
    }
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const selectTab = useCallback((next: CommunityTab) => {
    setActiveTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      // Shallow URL update so the panel is shareable without a server round-trip.
      window.history.replaceState(window.history.state, "", url.toString());
    } catch { /* URL unavailable (non-browser) */ }
  }, []);

  // ─── Real content only — no fabricated authors, captions, or counts ───────────
  const realSeekerPosts = serverPhotos?.length
    ? photosToSeekerPosts(serverPhotos, currentSeekerProfileId)
    : [];
  const realAnnouncementItems = serverAnnouncements?.length
    ? announcementsToFeedItems(serverAnnouncements)
    : [];
  const listingCards = buildListingFeedCards(listings);
  const employerCards = buildEmployerFeedCards(featuredEmployers);
  const editorialCards = buildEditorialFeedCards();

  // Ranked communal feed: real photos + announcements + boosted listings +
  // featured employers + E&E field-guide posts, interleaved with the
  // no-more-than-two-in-a-row rule.
  const feedItems: FeedItem[] = rankCommunityFeed({
    seeker: realSeekerPosts,
    announcement: realAnnouncementItems,
    listing: listingCards,
    employer: employerCards,
    editorial: editorialCards,
  });

  const photoItems: SeekerPost[] = realSeekerPosts;
  const announcementItems: HostAnnouncement[] = realAnnouncementItems;

  const visibleFeed = feedItems.filter(item => !hiddenIds.has(item.id));
  const visibleAnnouncements = announcementItems.filter(item => !hiddenIds.has(item.id));

  const seekerInitial = status.seekerName.charAt(0).toUpperCase() || "S";

  function panelProps(id: CommunityTab) {
    return {
      role: "tabpanel" as const,
      id: `community-panel-${id}`,
      "aria-labelledby": `community-tab-${id}`,
      hidden: activeTab !== id,
    };
  }

  return (
    <div className={styles.dashboard}>
      {/* Immersive, Facebook-style landing: no explanatory hero or welcome banner
          — the tab bar IS the header and you drop straight into the feed. */}
      <CommunityTabNav activeTab={activeTab} onSelect={selectTab} />

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {/* ─── Feed panel ─── */}
          <div {...panelProps("feed")} className={styles.tabPanel}>
            {activeTab === "feed" ? (
              <>
                {/* Photo-sharing is seekers-only, so the "share a photo" composer
                    CTA is hidden from hosts (their channel is Announcements). */}
                {!isHost ? <ShareComposer seekerInitial={seekerInitial} /> : null}
                {visibleFeed.length === 0 ? (
                  <CommunityEmptyState
                    icon="nav.feed"
                    illustration="empty.community"
                    heading="Built by seekers, for seekers"
                    sub="As seekers post photos and hosts share announcements, your communal feed fills up right here. Seekers are free forever — start by sharing a moment."
                    ctaLabel="Share a photo"
                    ctaHref="/community?tab=photos"
                  />
                ) : (
                  <>
                    {visibleFeed.map((item, index) => (
                      <div
                        key={item.id}
                        className={styles.feedItem}
                        style={{ "--card-delay": `${index * 55}ms` } as React.CSSProperties}
                      >
                        {item.kind === "seeker" ? (
                          <SeekerCard
                            post={item}
                            onHide={() => hidePost(item.id)}
                            onToast={addToast}
                          />
                        ) : item.kind === "announcement" ? (
                          <AnnouncementCard post={item} />
                        ) : item.kind === "listing" ? (
                          <ListingFeedCard item={item} />
                        ) : item.kind === "employer" ? (
                          <EmployerFeedCard item={item} />
                        ) : item.kind === "editorial" ? (
                          <EditorialFeedCard item={item} />
                        ) : null}
                      </div>
                    ))}
                    <FeedEndMarker />
                  </>
                )}
              </>
            ) : null}
          </div>

          {/* ─── Photos panel ─── */}
          <div {...panelProps("photos")} className={styles.tabPanel}>
            {activeTab === "photos" ? (
              <>
                {/* GATE: photos are seekers-only. Hosts get a read-only notice
                    (never the uploader); the uploader's own completion gate and
                    the server action guard the seeker path. */}
                {isHost ? (
                  <HostPhotosNotice />
                ) : (
                  <PhotoUploadForm
                    completionScore={completionScore}
                    onSuccess={() => { router.refresh(); }}
                    onToast={addToast}
                  />
                )}
                <PhotoMasonryGrid photos={photoItems} />
              </>
            ) : null}
          </div>

          {/* ─── Announcements panel ─── */}
          <div {...panelProps("announcements")} className={styles.tabPanel}>
            {activeTab === "announcements" ? (
              <>
                {/* GATE: posting is host-only (hosts + admin/E&E). Seekers can read
                    every announcement but never see a compose affordance — they get
                    the read-only intro. The composer + server action enforce the
                    real authorization; this only decides which affordance shows. */}
                {isHost ? (
                  <HostAnnouncementComposer
                    subscriptionTier={hostTier}
                    usedThisMonth={hostUsedThisMonth}
                    draftAnnouncementId={hostDraftAnnouncementId}
                  />
                ) : (
                  <SeekerAnnouncementsIntro />
                )}
                {visibleAnnouncements.length === 0 ? (
                  <CommunityEmptyState
                    icon="nav.announcements"
                    illustration="empty.announcements"
                    heading="No announcements yet"
                    sub={isHost
                      ? "Your published announcements will appear here. Share a seasonal opening, housing update, or event using the composer above."
                      : "Verified hosts share seasonal openings, housing updates, and hiring news here. Check back soon."}
                    ctaLabel={isHost ? undefined : "Explore listings"}
                    ctaHref={isHost ? undefined : "/seek"}
                  />
                ) : (
                  visibleAnnouncements.map((item, index) => (
                    <div
                      key={item.id}
                      className={styles.feedItem}
                      style={{ "--card-delay": `${index * 55}ms` } as React.CSSProperties}
                    >
                      <AnnouncementCard post={item} />
                    </div>
                  ))
                )}
              </>
            ) : null}
          </div>
        </div>

        <aside className={styles.aside}>
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

      <ToastStack toasts={toasts} />
    </div>
  );
}
