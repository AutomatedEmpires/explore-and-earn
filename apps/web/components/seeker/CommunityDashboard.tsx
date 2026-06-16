"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { uploadCommunityPhotoAction } from "../../app/actions/community";
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
}

// ─── Constants ────────────────────────────────────────────────────────────────


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

const CATEGORY_ABBR: Record<OpportunityCategory, string> = {
  farm:     "FARM",
  maritime: "SEA",
  remote:   "REMOTE",
  seasonal: "SEASONAL",
  mix:      "MIX",
};

const FEED_SLOT_TEMPLATE: readonly FeedSlotType[] = [
  "seeker",
  "seeker",
  "blog",
  "seeker",
  "announcement",
  "seeker",
  "seeker",
  "listing",
  "seeker",
  "announcement",
  "seeker",
  "employer",
];

// ─── Tab navigation ───────────────────────────────────────────────────────────

const COMMUNITY_TABS = [
  { id: "feed" as const, label: "Feed", href: "/community", icon: "nav.feed" as const },
  { id: "photos" as const, label: "Photos", href: "/community/photos", icon: "nav.photos" as const },
  { id: "announcements" as const, label: "Announcements", href: "/community/announcements", icon: "nav.announcements" as const },
] as const;

function CommunityTabNav({ tab }: { readonly tab: "feed" | "photos" | "announcements" }) {
  return (
    <nav className={styles.tabNav} aria-label="Community sections">
      {COMMUNITY_TABS.map(t => (
        <Link
          key={t.id}
          href={t.href}
          className={`${styles.tabLink}${tab === t.id ? ` ${styles.tabLinkActive}` : ""}`}
          aria-current={tab === t.id ? "page" : undefined}
        >
          <Icon name={t.icon} size={16} aria-hidden />
          {t.label}
        </Link>
      ))}
    </nav>
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


// ─── Fixture generation ───────────────────────────────────────────────────────

const CATEGORY_CAPTIONS: Record<OpportunityCategory, string> = {
  farm: "Harvest season hits different when you're out here at golden hour. Grateful for these views and the people I work alongside. 🌾✨😊",
  maritime: "Nothing beats the quiet before the morning catch. Clear skies, open water, and a crew that has your back. ⚓️🌅",
  remote: "Signal is weak. Views are incredible. Work is meaningful. This is remote life done right. 💻🏔️✨",
  seasonal: "First week in and already feels like home. These moments are exactly why we explore. 🏕️❤️✨",
  mix: "Every opportunity is a new adventure. Grateful for the journey and everyone I've met along the way. 🗺️✨",
};

function hostAnnouncementText(listing: DiscoveryListing): string {
  const includedBenefits: string[] = [];
  if (listing.benefits.housing.provision === "provided") includedBenefits.push("housing included");
  if (listing.benefits.meals.provision === "provided") includedBenefits.push("meals included");
  const benefitsClause = includedBenefits.length
    ? ` ${includedBenefits.join(" + ")} —`
    : "";
  return `We're opening positions at ${listing.location} for this season.${benefitsClause} Come join our team and explore! 🌲✨😊`;
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

  const employerBucket: FeaturedEmployerCard[] = featuredEmployers.slice(0, 2).map(
    (emp, i): FeaturedEmployerCard => ({
      kind: "employer",
      id: `employer-card-${emp.hostId ?? String(i)}`,
      employer: emp,
    }),
  );

  const blogBucket: BlogPost[] = [{
    ...BLOG_POST_BASE,
    coverUrl: sortedListings.find(l => l.coverImageUrl)?.coverImageUrl,
  }];

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

function photosToSeekerPosts(photos: readonly CommunityPhoto[]): SeekerPost[] {
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
        if (fileRef.current) fileRef.current.value = "";
      } else if (result.reason === "incomplete_profile") {
        onToast(`Profile at ${result.score ?? completionScore}% — need 80% to post.`);
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
      {fileError && <p className={styles.photoError}>{fileError}</p>}
      <button className={styles.photoSubmitBtn} type="submit" disabled={isPending}>
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
  readonly onClose: () => void;
  readonly onHide: () => void;
  readonly onToast: (msg: string) => void;
}

function PostMenu({ postId, onClose, onHide, onToast }: PostMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [reported, setReported] = useState(false);

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
    setReported(true);
    onToast("Thanks for reporting — we'll review this post");
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
          <span className={styles.postMenuConfirmIcon} aria-hidden>✓</span>
          Thanks — we'll review this soon
        </div>
      ) : (
        <>
          <button type="button" className={styles.postMenuItem} role="menuitem" onClick={handleReport}>
            Report post
          </button>
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
              onClose={() => setMenuOpen(false)}
              onHide={onHide}
              onToast={onToast}
            />
          ) : null}
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

// ─── Blog post card ───────────────────────────────────────────────────────────

function BlogCard({ post }: { readonly post: BlogPost }) {
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
          <Link className={styles.readMoreBtn} href="/help">
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
      <PostEngagement postId={post.id} initialReactions={post.reactions} />
    </article>
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
        <span className={styles.employerStar} aria-hidden>✦</span>
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

// ─── Feed end marker ──────────────────────────────────────────────────────────

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

const SECTION_META: Record<"feed" | "photos" | "announcements", { eyebrow: string; blurb: string; icon: "nav.feed" | "nav.photos" | "nav.announcements" }> = {
  feed: {
    eyebrow: "Community Feed",
    blurb: "Stories, photos, and announcements from seekers and hosts out on the trail.",
    icon: "nav.feed",
  },
  photos: {
    eyebrow: "Community Photos",
    blurb: "Real moments from farms, boats, lodges, and the open road — shared by the crew.",
    icon: "nav.photos",
  },
  announcements: {
    eyebrow: "Announcements",
    blurb: "Seasonal openings and hiring news from verified Explore & Earn hosts.",
    icon: "nav.announcements",
  },
};

function WelcomeBar({ status, tab }: { readonly status: SeekerStatusSummary; readonly tab: "feed" | "photos" | "announcements" }) {
  const level = Math.max(1, Math.ceil(status.resumeCompletion / 20));
  const xp = status.resumeCompletion * 10;
  const xpMax = 1000;
  const fillPct = status.resumeCompletion;
  const section = SECTION_META[tab];
  return (
    <div className={styles.welcomeBar}>
      <div className={styles.mastheadTop}>
        <span className={styles.mastheadEyebrow}>
          <Icon name={section.icon} size={16} aria-hidden />
          Explore &amp; Earn Community
        </span>
        <h1 className={styles.mastheadTitle}>{section.eyebrow}</h1>
        <p className={styles.mastheadBlurb}>{section.blurb}</p>
      </div>
      <div className={styles.welcomeBarInner}>
        <div className={styles.welcomeAvatar} aria-hidden>
          {status.seekerName.charAt(0).toUpperCase() || "S"}
        </div>
        <div className={styles.welcomeTextGroup}>
          <p className={styles.welcomeGreeting}>
            Welcome back, <strong>{status.seekerName || "adventurer"}</strong>
          </p>
          <p className={styles.welcomeTagline}>Explorer · Level {level}</p>
        </div>
        <div className={styles.xpGroup}>
          <div className={styles.xpLevelBadge} aria-hidden>
            <span className={styles.xpLevelNum}>{level}</span>
            <span className={styles.xpLevelWord}>LVL</span>
          </div>
          <div className={styles.xpDetails}>
            <div
              className={styles.xpTrack}
              role="progressbar"
              aria-valuenow={xp}
              aria-valuemax={xpMax}
              aria-label={`${xp} of ${xpMax} XP`}
            >
              <div className={styles.xpFill} style={{ width: `${fillPct}%` }} />
            </div>
            <span className={styles.xpCount}>{xp.toLocaleString()} / {xpMax.toLocaleString()} XP</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MobileProfileStrip({ status, listings }: {
  readonly status: SeekerStatusSummary;
  readonly listings: readonly DiscoveryListing[];
}) {
  const level = Math.max(1, Math.ceil(status.resumeCompletion / 20));
  return (
    <div className={styles.mobileStrip}>
      <div className={styles.mobileStripProfile}>
        <div className={styles.mobileStripAvatar} aria-hidden>
          {status.seekerName.charAt(0).toUpperCase() || "S"}
        </div>
        <div className={styles.mobileStripMeta}>
          <span className={styles.mobileStripName}>{status.seekerName || "Adventurer"}</span>
          <span className={styles.mobileStripLevel}>Level {level} Explorer</span>
        </div>
        <Link href="/profile" className={styles.mobileStripEdit}>
          Edit profile
        </Link>
      </div>
      {listings.length > 0 ? (
        <div className={styles.mobileStripListings}>
          {listings.slice(0, 3).map(l => (
            <Link key={l.id} href={`/listing/${l.id}`} className={styles.mobileStripListing}>
              <span className={styles.mobileStripListingTitle}>{l.host.name}</span>
              <span className={styles.mobileStripListingLoc}>
                <Icon name="mappin.location" size={16} aria-hidden />
                {l.location.split(",")[0]}
              </span>
            </Link>
          ))}
        </div>
      ) : null}
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

  // Merge real DB data into feed: real items override fixture items of the same type
  const hasRealPhotos = Boolean(serverPhotos?.length);
  const hasRealAnnouncements = Boolean(serverAnnouncements?.length);

  const realSeekerPosts = hasRealPhotos ? photosToSeekerPosts(serverPhotos!) : [];
  const realAnnouncementItems = hasRealAnnouncements ? announcementsToFeedItems(serverAnnouncements!) : [];

  const fixtureFeed = buildStrategicFeedItems(listings, featuredEmployers);

  // For the feed tab: inject real items at the front of their respective slots, rest is fixtures
  const feedItems: FeedItem[] = (() => {
    if (!hasRealPhotos && !hasRealAnnouncements) return fixtureFeed;
    const realSeeker = [...realSeekerPosts];
    const realAnn    = [...realAnnouncementItems];
    return fixtureFeed.map(item => {
      if (item.kind === "seeker" && realSeeker.length > 0) return realSeeker.shift()!;
      if (item.kind === "announcement" && realAnn.length > 0) return realAnn.shift()!;
      return item;
    }).concat(realSeeker, realAnn);
  })();

  const photoItems: SeekerPost[] = hasRealPhotos
    ? realSeekerPosts
    : fixtureFeed.filter((item): item is SeekerPost => item.kind === "seeker" && Boolean(item.coverUrl));

  const announcementItems: HostAnnouncement[] = hasRealAnnouncements
    ? realAnnouncementItems
    : fixtureFeed.filter((item): item is HostAnnouncement => item.kind === "announcement");

  const mainItems: FeedItem[] = (
    tab === "photos" ? photoItems :
    tab === "announcements" ? announcementItems :
    feedItems
  ).filter(item => !hiddenIds.has(item.id));

  const seekerInitial = status.seekerName.charAt(0).toUpperCase() || "S";

  return (
    <div className={styles.dashboard}>
      <WelcomeBar status={status} tab={tab} />
      <CommunityTabNav tab={tab} />
      <MobileProfileStrip status={status} listings={listings} />

      <div className={styles.layout}>
        <div className={styles.mainCol}>
          {tab === "feed" ? (
            <ShareComposer seekerInitial={seekerInitial} />
          ) : null}

          {tab === "photos" ? (
            <>
              <PhotoUploadForm
                completionScore={completionScore}
                onSuccess={() => { router.refresh(); }}
                onToast={addToast}
              />
              <PhotoMasonryGrid photos={photoItems} />
            </>
          ) : tab === "announcements" && isHost ? (
            <>
              <HostAnnouncementComposer
                subscriptionTier={hostTier}
                usedThisMonth={hostUsedThisMonth}
                draftAnnouncementId={hostDraftAnnouncementId}
              />
              {mainItems.length === 0 ? (
                <CommunityEmptyState
                  icon="nav.announcements"
                  illustration="empty.announcements"
                  heading="No announcements yet"
                  sub="Your published announcements will appear here. Share a seasonal opening, housing update, or event using the composer above."
                />
              ) : (
                <>
                  {mainItems.map((item, index) => (
                    <div
                      key={item.id}
                      className={styles.feedItem}
                      style={{ "--card-delay": `${index * 55}ms` } as React.CSSProperties}
                    >
                      {item.kind === "announcement" ? (
                        <AnnouncementCard post={item} />
                      ) : null}
                    </div>
                  ))}
                </>
              )}
            </>
          ) : mainItems.length === 0 ? (
            tab === "announcements" ? (
              <CommunityEmptyState
                icon="nav.announcements"
                illustration="empty.announcements"
                heading="No announcements yet"
                sub="Verified hosts share seasonal openings, housing updates, and hiring news here. Check back soon."
                ctaLabel="Explore listings"
                ctaHref="/seek"
              />
            ) : (
              <CommunityEmptyState
                icon="nav.feed"
                illustration="empty.community"
                heading="Your feed is just getting started"
                sub="As seekers and hosts post photos and announcements, they'll show up right here."
                ctaLabel="Share a photo"
                ctaHref="/community/photos"
              />
            )
          ) : (
            <>
              {mainItems.map((item, index) => (
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
                  ) : item.kind === "blog" ? (
                    <BlogCard post={item} />
                  ) : item.kind === "listing" ? (
                    <ListingFeedCard item={item} />
                  ) : item.kind === "employer" ? (
                    <EmployerFeedCard item={item} />
                  ) : null}
                </div>
              ))}
              {tab === "feed" ? <FeedEndMarker /> : null}
            </>
          )}
        </div>

        <aside className={styles.aside}>
          <section className={`${styles.widget} ${styles.welcomeWidgetSection}`}>
            <div className={styles.welcomeWidget}>
              <div className={styles.welcomeWidgetAvatar} aria-hidden>
                {seekerInitial}
              </div>
              <div>
                <p className={styles.welcomeWidgetName}>Welcome back, {status.seekerName || "adventurer"}!</p>
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

      <ToastStack toasts={toasts} />
    </div>
  );
}
