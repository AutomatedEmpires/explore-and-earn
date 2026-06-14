# Community Phase 3 — Real Engagement
**Date:** 2026-06-12  
**Status:** Approved for implementation

## 1. Problem & Goals

Community Phase 2 shipped real photos and announcements with static `[0,0,0,0,0]` reaction counts. Phase 3 makes engagement real:

1. **DB-backed reactions** — each authenticated user can toggle any of 5 emoji reactions on photos and announcements; counts are real across all users
2. **Comment threads** — flat comment threads on photos and announcements; lazy-loaded inline per post; all authenticated users can read and comment

## 2. Database Schema — Migration 032

### `community_photo_reactions`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | default gen_random_uuid() |
| `photo_id` | uuid FK → community_photos.id | ON DELETE CASCADE |
| `clerk_user_id` | text | RLS owner |
| `reaction` | text CHECK | 'smile'\|'heart'\|'hundred'\|'clap'\|'sparkle' |
| `created_at` | timestamptz | |
| UNIQUE | (photo_id, clerk_user_id, reaction) | one per user per emoji |

### `community_announcement_reactions`
Same as above with `announcement_id` FK → `host_announcements.id`.

### `community_comments`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `target_type` | text CHECK | 'photo'\|'announcement' |
| `target_id` | uuid | polymorphic; no DB FK |
| `clerk_user_id` | text | RLS owner |
| `author_name` | text | denormalized at insert time |
| `body` | text CHECK | max 500 chars |
| `status` | text CHECK | 'active'\|'removed' |
| `created_at` | timestamptz | |

RLS: authenticated read of `status='active'`; owner insert; owner update (soft-delete).

## 3. Contracts

```ts
export type ReactionKey = 'smile' | 'heart' | 'hundred' | 'clap' | 'sparkle';
export const REACTION_KEYS: readonly ReactionKey[] = ['smile','heart','hundred','clap','sparkle'];
export const REACTION_EMOJIS: Record<ReactionKey, string> = { smile:'😄', heart:'❤️', hundred:'💯', clap:'🙌', sparkle:'✨' };
export interface ReactionCounts {
  readonly smile: number; readonly heart: number; readonly hundred: number;
  readonly clap: number;  readonly sparkle: number;
  readonly userReactions: readonly ReactionKey[];
}
export interface CommunityComment {
  readonly id: string; readonly targetType: 'photo' | 'announcement';
  readonly targetId: string; readonly clerkUserId: string;
  readonly authorName: string; readonly body: string; readonly createdAt: string;
}
// CommunityPhoto and HostAnnouncement gain optional reactionCounts + commentCount
```

## 4. DB Queries (new)

| Function | Purpose |
|---|---|
| `togglePhotoReaction(clerkUserId, photoId, reaction)` | Insert or delete reaction; returns `{ added }` |
| `toggleAnnouncementReaction(clerkUserId, announcementId, reaction)` | Same for announcements |
| `getPhotoReactionsBatch(photoIds, currentClerkUserId?)` | `Map<id, ReactionCounts>` using adminClient |
| `getAnnouncementReactionsBatch(annIds, currentClerkUserId?)` | Same |
| `getComments(token, targetType, targetId)` | Returns `CommunityComment[]` |
| `insertComment(clerkUserId, authorName, targetType, targetId, body)` | adminClient insert |
| `softDeleteComment(commentId, clerkUserId)` | adminClient soft-delete with ownership check |
| `getCommenterName(token, clerkUserId)` | Resolves display_name from seeker_profiles, fallback to host company_name |

## 5. Server Actions (new)

| Action | Returns |
|---|---|
| `toggleReactionAction(targetType, targetId, reaction)` | `{ ok, added?, reason? }` |
| `getCommentsAction(targetType, targetId)` | `CommunityComment[]` |
| `addCommentAction(fd)` | `{ ok, comment?, reason? }` |
| `removeCommentAction(commentId)` | `{ ok, reason? }` |

## 6. PostEngagement Component

`apps/web/components/community/PostEngagement.tsx` (client component).

Props:
```ts
interface PostEngagementProps {
  postId: string;             // for localStorage key (fixture fallback)
  dbId?: string;              // real photo/announcement DB id
  targetType?: 'photo' | 'announcement';
  initialReactions: readonly [number, number, number, number, number]; // aggregate counts
  initialUserReactions?: readonly ReactionKey[];  // user's already-set reactions
  commentCount?: number;
}
```

Behavior:
- **Reactions**: optimistic toggle. localStorage tracks user state. If `dbId`, fires `toggleReactionAction` in background.
- **Comments**: click "💬 Comments (n)" to expand inline section; lazy-loads via `getCommentsAction`. `useUser()` from Clerk to show delete button on own comments.

## 7. CommunityDashboard changes

- `SeekerPost` type: add `dbId?: string` (the community_photos.id)
- `HostAnnouncement` type: add `dbId?: string` (the host_announcements.id), `reactionCounts?: ReactionCounts`, `commentCount?: number`
- `photosToSeekerPosts`: set `dbId = p.id`, pass reaction counts and comment count through
- `announcementsToFeedItems`: same
- Replace `<ReactionBar>` with `<PostEngagement>` on all post card types

## 8. Page enrichment

`page.tsx` files do a 2-phase fetch:
1. Phase 1: photos, announcements, host context (parallel)
2. Phase 2: `getPhotoReactionsBatch` + `getAnnouncementReactionsBatch` (parallel, keyed to phase 1 IDs)

Enriched `CommunityPhoto[]` and `HostAnnouncement[]` passed as `serverPhotos`/`serverAnnouncements`.

## 9. Self-review findings (all resolved)

- ✅ `community_photo_reactions` unique on (photo_id, clerk_user_id, reaction) — allows multiple emoji types per user but not duplicates
- ✅ Toggle: try INSERT, catch `23505`, then DELETE
- ✅ Comments polymorphic — no DB FK (checked in server action)
- ✅ Comments have `status='active'` filter on all reads
- ✅ `author_name` denormalized — fast reads, acceptable for phase 3
- ✅ PostEngagement lazy-loads comments — no N+1 in feed
- ✅ `getPhotoReactionsBatch` uses adminClient (bypasses RLS for aggregation)
- ✅ Page enrichment is 2-phase (cannot batch reaction IDs until phase 1 completes)
