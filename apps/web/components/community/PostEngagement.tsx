"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import {
  REACTION_KEYS,
  REACTION_EMOJIS,
  type CommunityComment,
  type ReactionCounts,
  type ReactionKey,
} from "@explore-and-earn/contracts";

import {
  addCommentAction,
  getCommentsAction,
  removeCommentAction,
  toggleReactionAction,
} from "../../app/actions/community";
import styles from "./PostEngagement.module.css";

// ─── Defined reactions ─────────────────────────────────────────────────────────

/** Human names for the five community reactions (glyphs come from the contract's
 *  REACTION_EMOJIS). A tasteful, defined set so every reaction reads clearly. */
const REACTION_LABELS: Record<ReactionKey, string> = {
  smile:   "Like",
  heart:   "Love",
  sparkle: "Inspiring",
  clap:    "Congrats",
  hundred: "Been there",
};

// ─── Time formatter ────────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

// ─── Local reactions hook (localStorage + optional DB sync) ──────────────────

function usePostReactions(
  postId: string,
  dbId: string | undefined,
  targetType: "photo" | "announcement" | undefined,
  initial: readonly [number, number, number, number, number],
  initialUserReactions: readonly ReactionKey[],
) {
  // DB-derived aggregate counts (base that updates after any user interaction)
  const [baseCounts, setBaseCounts] = useState<ReactionCounts>({
    smile:   initial[0],
    heart:   initial[1],
    hundred: initial[2],
    clap:    initial[3],
    sparkle: initial[4],
    userReactions: initialUserReactions,
  });

  // User's active reactions for THIS device (localStorage-backed)
  const [active, setActive] = useState<ReadonlySet<ReactionKey>>(new Set(initialUserReactions));

  // Hydrate from localStorage on mount (override DB user reactions with local state)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ee_rx_${postId}`);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setActive(new Set(parsed as ReactionKey[]));
        }
      }
    } catch { /* storage unavailable */ }
  }, [postId]);

  function toggle(key: ReactionKey) {
    const wasActive = active.has(key);

    // Optimistic local update
    setActive(prev => {
      const next = new Set(prev);
      if (wasActive) next.delete(key); else next.add(key);
      try {
        localStorage.setItem(`ee_rx_${postId}`, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });

    setBaseCounts(prev => ({
      ...prev,
      [key]: Math.max(0, (prev[key] as number) + (wasActive ? -1 : 1)),
    }));

    // Fire DB sync in background when this is a real post
    if (dbId && targetType) {
      toggleReactionAction(targetType, dbId, key).catch(() => {
        // Rollback optimistic update on failure
        setActive(prev => {
          const next = new Set(prev);
          if (wasActive) next.add(key); else next.delete(key);
          try {
            localStorage.setItem(`ee_rx_${postId}`, JSON.stringify([...next]));
          } catch { /* ignore */ }
          return next;
        });
        setBaseCounts(prev => ({
          ...prev,
          [key]: Math.max(0, (prev[key] as number) + (wasActive ? 1 : -1)),
        }));
      });
    }
  }

  // Displayed counts: baseCounts (from DB) adjusted for in-session toggles
  const displayCounts: Record<ReactionKey, number> = {} as Record<ReactionKey, number>;
  for (const key of REACTION_KEYS) {
    displayCounts[key] = baseCounts[key] as number;
  }

  return { active, toggle, displayCounts };
}

// ─── Comment section ───────────────────────────────────────────────────────────

function CommentItem({
  comment,
  onRemove,
  currentClerkUserId,
}: {
  readonly comment: CommunityComment;
  readonly onRemove: (id: string) => void;
  readonly currentClerkUserId: string | undefined;
}) {
  const isOwn = comment.clerkUserId === currentClerkUserId;
  const [removing, setRemoving] = useState(false);

  function handleRemove() {
    setRemoving(true);
    removeCommentAction(comment.id).then(result => {
      if (result.ok) onRemove(comment.id);
      else setRemoving(false);
    });
  }

  return (
    <div className={`${styles.comment}${removing ? ` ${styles.commentRemoving}` : ""}`}>
      <div className={styles.commentAvatar} aria-hidden>
        {comment.authorName.charAt(0).toUpperCase()}
      </div>
      <div className={styles.commentBody}>
        <div className={styles.commentMeta}>
          <span className={styles.commentAuthor}>{comment.authorName}</span>
          <span className={styles.commentTime}>{relTime(comment.createdAt)}</span>
          {isOwn ? (
            <button
              type="button"
              className={styles.commentDelete}
              aria-label="Delete comment"
              onClick={handleRemove}
              disabled={removing}
            >
              ×
            </button>
          ) : null}
        </div>
        <p className={styles.commentText}>{comment.body}</p>
      </div>
    </div>
  );
}

function CommentThread({
  targetType,
  targetId,
  currentClerkUserId,
}: {
  readonly targetType: "photo" | "announcement";
  readonly targetId: string;
  readonly currentClerkUserId: string | undefined;
}) {
  const [comments, setComments]   = useState<CommunityComment[]>([]);
  const [loaded, setLoaded]       = useState(false);
  const [newBody, setNewBody]     = useState("");
  const [error, setError]         = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getCommentsAction(targetType, targetId).then(result => {
      if (result.ok) setComments(result.comments);
      setLoaded(true);
    });
  }, [targetType, targetId]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("targetType", targetType);
    fd.set("targetId",   targetId);
    fd.set("body",       newBody.trim());
    startTransition(async () => {
      const result = await addCommentAction(fd);
      if (result.ok) {
        setComments(prev => [...prev, result.comment]);
        setNewBody("");
        inputRef.current?.focus();
      } else {
        setError("Couldn't post comment — please try again.");
      }
    });
  }

  function handleRemove(id: string) {
    setComments(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div className={styles.commentThread}>
      {!loaded ? (
        <div className={styles.commentLoading}>Loading…</div>
      ) : comments.length === 0 ? (
        <p className={styles.commentEmpty}>No comments yet — be the first.</p>
      ) : (
        <div className={styles.commentList}>
          {comments.map(c => (
            <CommentItem
              key={c.id}
              comment={c}
              onRemove={handleRemove}
              currentClerkUserId={currentClerkUserId}
            />
          ))}
        </div>
      )}
      {currentClerkUserId ? (
        <form className={styles.commentForm} onSubmit={handleSubmit}>
          <textarea
            ref={inputRef}
            className={styles.commentInput}
            value={newBody}
            onChange={e => setNewBody(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Add a comment…"
            disabled={isPending}
            required
          />
          <div className={styles.commentFormFooter}>
            <span className={styles.commentCharCount}>{newBody.length}/500</span>
            <button
              type="submit"
              className={styles.commentSubmit}
              disabled={isPending || !newBody.trim()}
            >
              {isPending ? "Posting…" : "Post"}
            </button>
          </div>
          {error ? <p className={styles.commentError}>{error}</p> : null}
        </form>
      ) : (
        <p className={styles.commentSignIn}>Sign in to leave a comment.</p>
      )}
    </div>
  );
}

// ─── PostEngagement ────────────────────────────────────────────────────────────

export interface PostEngagementProps {
  readonly postId:              string;
  readonly dbId?:               string;
  readonly targetType?:         "photo" | "announcement";
  readonly initialReactions:    readonly [number, number, number, number, number];
  readonly initialUserReactions?: readonly ReactionKey[];
  readonly commentCount?:       number;
}

export function PostEngagement({
  postId,
  dbId,
  targetType,
  initialReactions,
  initialUserReactions = [],
  commentCount,
}: PostEngagementProps) {
  const { user } = useUser();
  const clerkUserId = user?.id;
  const [commentsOpen, setCommentsOpen] = useState(false);

  const { active, toggle, displayCounts } = usePostReactions(
    postId,
    dbId,
    targetType,
    initialReactions,
    initialUserReactions,
  );

  const totalComments = commentCount ?? 0;

  return (
    <div className={styles.engagement}>
      {/* Reaction bar */}
      <div className={styles.reactionBar} role="group" aria-label="Post reactions">
        {REACTION_KEYS.map(key => {
          const isActive = active.has(key);
          const count    = displayCounts[key];
          const label    = REACTION_LABELS[key];
          return (
            <button
              key={key}
              type="button"
              className={`${styles.reaction}${isActive ? ` ${styles.reactionActive}` : ""}`}
              aria-label={`${label}${isActive ? " — you reacted" : ""}`}
              aria-pressed={isActive}
              title={label}
              onClick={() => toggle(key)}
            >
              <span className={styles.reactionEmoji} aria-hidden>{REACTION_EMOJIS[key]}</span>
              <span className={styles.reactionLabel}>{label}</span>
              <span className={styles.reactionCount}>{count}</span>
            </button>
          );
        })}

        {/* Comments toggle — only shown for real DB posts */}
        {dbId && targetType ? (
          <button
            type="button"
            className={`${styles.commentsBtn}${commentsOpen ? ` ${styles.commentsBtnOpen}` : ""}`}
            aria-expanded={commentsOpen}
            aria-label={`${commentsOpen ? "Hide" : "Show"} comments`}
            onClick={() => setCommentsOpen(prev => !prev)}
          >
            <span className={styles.commentsBtnIcon} aria-hidden>💬</span>
            <span className={styles.commentsBtnLabel}>
              {totalComments > 0 ? totalComments : "Comment"}
            </span>
          </button>
        ) : null}
      </div>

      {/* Comment thread (lazy) */}
      {commentsOpen && dbId && targetType ? (
        <CommentThread
          targetType={targetType}
          targetId={dbId}
          currentClerkUserId={clerkUserId}
        />
      ) : null}
    </div>
  );
}
