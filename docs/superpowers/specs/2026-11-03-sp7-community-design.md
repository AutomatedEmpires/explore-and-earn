# Sub-project 7: Community technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md), sections 13, 21, 22 and row 7 of section 25. Built on [Foundation](2026-11-03-foundation-design.md).
- **Supersedes:** `docs/v1/12-community-and-campaigns.md` wherever it conflicts (handles, tags, place, feeling, captions, comments, campaign state machines and caps are all gone; see product section 27).
- Values marked **Engineering decision** are choices made where the product spec is silent.

## 1. Goal and done-when

**Goal:** signed-in seekers share moderated photos, react to them, and read announcements, with paid items mixed into the Feed at no more than 1 in 5.

**Done when** (each line is an automated test in `tests/e2e/sp7-exit.spec.ts` or a named unit test, run on `pnpm db:local` with stub providers):

| # | Exit criterion |
|---|---|
| E1 | Seeker A uploads a JPEG at `/community/new`. It passes the Foundation scan, A sees the AI alt text, edits it, and posts. Seeker B sees it in Feed and Photos and its image URL loads for B. |
| E2 | A `__flag__` image becomes `pending_review` and is visible to nobody but A. An operator approves the media item in the `moderation` queue; the post publishes and A gets `community.post_published`. |
| E3 | A `__block__` image is rejected and never appears anywhere. A child-safety stub match leaves the post `rejected`, sends A no notification, and opens a `child_safety` item. |
| E4 | B reacts Fire, switches to Love, then removes it; the totals are 1, 1, 0. A cannot react to A's own post (403). The picker works by keyboard only and axe finds no serious or critical violations. |
| E5 | With 100 published photos and a fake paid source that never runs out, across 5 Feed pages: item 1 is never paid, every window of 5 consecutive items holds at most 1 paid item, no paid key repeats, and every paid item renders its label. |
| E6 | B blocks A: A's posts vanish from B's Feed, Photos and deep links, and B gets 404 on A's post. Three different seekers report a post: it becomes `hidden` and a `reports` item exists. |
| E7 | An operator publishes a platform announcement at `/admin/community/announcements`; it shows in the Announcements tab with the fake paid host announcement, which carries its label. |
| E8 | A guest gets the sign-in explanation (API 401), a host gets 403, every `/community` page sends `noindex`, and `openapi.json` has no path containing `comment`. |

## 2. Scope

**In:** photo posts through Foundation media; AI alt text, editable by the poster; premoderation; reactions; the Feed, Photos and Announcements tabs; platform announcements (operator-written and automated) with a minimal operator editor; the 1-in-5 paid-item mix consuming SP6; Block and Report on every Community surface through SP4 safety; Community restrictions and appeals; the "Your photos" page; exporter and eraser functions for SP8.

**Out:**

| Item | Owner |
|---|---|
| Comments, captions, tags, place, feeling, host photo posts | Never (product section 13) |
| Boost and paid-announcement purchase, placement engine, per-boost frequency caps, labels, impression recording, reporting | SP6 |
| Job card projection, listing detail, Save and Skip, `robots.txt`, season landing pages | SP3 |
| Report and block storage, the blocked-list screen, profile name and avatar, Apply flow | SP4 |
| Host page and announcement pin on it | SP2 (page), SP6 (pin) |
| Full operator console, account-level suspension, privacy request runner, community guidelines page in the help center | SP8 |
| Seeker stories, video, multi-photo posts, follows, author pages | After V1 |
| Reaction notifications, push or email for platform announcements | Not built (Engineering decision: a low-pressure Community) |

## 3. Module and contracts

One module: `src/modules/community` (`index.ts`, `schema.ts`, `posts.ts`, `feed.ts`, `cursor.ts`, `reactions.ts`, `announcements.ts`, `moderation.ts`, `privacy.ts`, `jobs.ts`). It imports other modules only through their `index.ts`.

```ts
// @/modules/community: public API
export type Reaction = 'fire' | 'wow' | 'like' | 'love';           // working set, product section 13
export const REACTIONS: readonly { key: Reaction; emoji: string; label: string }[];
// [{fire,'🔥','Fire'},{wow,'😮','Wow'},{like,'👍','Like'},{love,'❤️','Love'}]
export const DEFAULT_REACTION: Reaction = 'like';                    // a single tap applies it
export type PostStatus = 'draft'|'pending_review'|'published'|'hidden'|'rejected'|'removed'|'deleted';
export type RejectionReason = 'guidelines' | 'too_small' | 'duplicate' | 'scan_failed';
export type Variant = 320 | 640 | 1280;
export type PhotoImage = { src: Record<Variant, string>; width: number; height: number; alt: string };
export type CommunityAuthor = { displayName: string; avatarUrl: string | null };   // profile name; URL from SP4 avatarMediaId (8.1)
export type ReactionSummary = { total: number; top: Reaction[]; mine: Reaction | null };
export type PhotoPostView = { kind: 'photo'; id: string; author: CommunityAuthor; isMine: boolean;
  image: PhotoImage; publishedAt: string; reactions: ReactionSummary };
export type OwnPostView = PhotoPostView & { status: PostStatus; mediaStatus: MediaStatus;
  altTextPending: boolean; rejectionReason: RejectionReason | null; canAppeal: boolean };
export type CommunityPaidItem =                                      // key = SP6 boostId or announcementId
  | { kind: 'boosted_job'; key: string; orgId: string; label: string; listingId: string; card: JobCardData }
  | { kind: 'host_announcement'; key: string; orgId: string; label: string; announcement: AnnouncementCardData };
export type FeedItem = PhotoPostView | CommunityPaidItem;
export type PlatformAnnouncementView = { kind: 'platform'; id: string; title: string; body: string;
  cta: { label: string; path: string } | null; category: Category | null; pinned: boolean; startsAt: string };
export type AnnouncementItem = PlatformAnnouncementView
  | { kind: 'host'; key: string; label: string; announcement: AnnouncementCardData };
export type Page<T> = { items: T[]; nextCursor: string | null };

/** Port for paid items. SP7 W1 implements it as an adapter over SP6's exports in `src/server/paid-item-source.ts`;
 *  `noPaidItems` (returns [] and records nothing) is for tests and local runs without paid data. */
export interface PaidItemSource {
  pickFeedItems(db: DbOrTx, i: { viewerUserId: string; count: number; excludeKeys: string[];
    excludeOrgIds: string[]; now: Date }): Promise<CommunityPaidItem[]>;
  listRunningAnnouncements(db: DbOrTx, i: { viewerUserId: string; excludeOrgIds: string[];
    before: { startsAt: Date; id: string } | null; limit: number; now: Date }): Promise<AnnouncementCardData[]>;
  recordAnnouncementServes(db: DbOrTx, announcementIds: string[]): Promise<void>;   // the host items a tab page shows
}
export const noPaidItems: PaidItemSource;
export type CommunityDeps = { storage: Storage; paid: PaidItemSource };

export function getFeedPage(db: Db, d: CommunityDeps, viewerId: string, cursor: string | null): Promise<Page<FeedItem>>;
export function getPhotosPage(db: Db, d: CommunityDeps, viewerId: string, cursor: string | null): Promise<Page<PhotoPostView>>;
export function getAnnouncementsPage(db: Db, d: CommunityDeps, viewerId: string, cursor: string | null): Promise<Page<AnnouncementItem>>;
export function getPost(db: Db, d: CommunityDeps, viewerId: string, postId: string): Promise<PhotoPostView | OwnPostView>;
export function listOwnPosts(db: Db, d: CommunityDeps, authorId: string, cursor: string | null): Promise<Page<OwnPostView>>;
export function createPost(db: Db, d: CommunityDeps, authorId: string, i: { mime: string; sizeBytes: number }):
  Promise<{ postId: string; mediaId: string; uploadUrl: string; token: string }>;
export function submitPost(db: Db, authorId: string, postId: string, i: { altText?: string }): Promise<{ status: PostStatus }>;
export function updateAltText(db: Db, authorId: string, postId: string, altText: string): Promise<{ altText: string; pending: boolean }>;
export function deletePost(db: Db, d: CommunityDeps, authorId: string, postId: string): Promise<void>;
export function setReaction(db: Db, viewerId: string, postId: string, r: Reaction | null): Promise<ReactionSummary>;
export function reportTarget(db: Db, reporterId: string, i: CommunityReportInput): Promise<void>;
export function blockTarget(db: Db, blockerId: string, i: CommunityBlockInput): Promise<void>;
export function appealRemoval(db: Db, authorId: string, postId: string, reason: string): Promise<{ appealItemId: string }>;
export function getCommunityStatus(db: Db, viewerId: string): Promise<{ unseenAnnouncements: boolean;
  canPost: boolean; restriction: { kind: 'suspended' | 'banned'; endsAt: string | null } | null }>;
export function markAnnouncementsSeen(db: Db, viewerId: string): Promise<void>;
export function savePlatformAnnouncement(db: Db, operatorId: string, i: PlatformAnnouncementInput & { id?: string }): Promise<{ id: string }>;
export function liftRestriction(db: Db, operatorId: string, restrictionId: string, reason: string): Promise<void>;
// For SP8
export function exportUserData(db: DbOrTx, userId: string): Promise<CommunityExport>;
export function eraseUserData(db: Db, d: CommunityDeps, userId: string): Promise<void>;
export function communityStats(db: DbOrTx, since: Date): Promise<{ postsPublished: number; postsRemoved: number;
  reactions: number; activePosters: number; openRestrictions: number }>;
export const jobHandlers: HandlerMap;
```

**Imported types:**

| Type | From |
|---|---|
| `Db`, `DbOrTx` | `@/lib/db` |
| `HandlerMap` | `@/modules/jobs` |
| `MediaStatus`, `Storage` | `@/modules/media` |
| `JobCardData` | SP3 `@/modules/discovery` |
| `AnnouncementCardData` | SP6 `@/modules/announcements` (with the `startsAt` SP6 adds; section 13) |
| `Category` | SP2 listings: `'maritime'\|'seasonal'\|'farm'\|'remote'` |
| `SafetyReportReason`, `Party` | SP4 `@/modules/safety` |

`CommunityExport = { posts: { id; status; publishedAt; altText; mediaId }[]; reactions: { postId; reaction; createdAt }[] }`.

`CommunityReportInput = { target: { kind: 'post'; postId: string } | { kind: 'listing'; listingId: string } | { kind: 'host_announcement'; announcementId: string }; reason: SafetyReportReason; details?: string; alsoBlock?: boolean }`. `CommunityBlockInput = { kind: 'post_author'; postId: string } | { kind: 'host'; orgId: string }`. `PlatformAnnouncementInput = { title: string; body: string; cta: { label: string; path: string } | null; category: Category | null; pinned: boolean; startsAt: Date; endsAt: Date | null; status: 'draft' | 'published' | 'archived' }`.

**Wiring touchpoint:** `src/server/paid-item-source.ts` exports `paidItemSource: PaidItemSource`. SP6 ships before SP7 and doesn't implement this port; it exposes `promote.getPaidFeedItems`, `promote.recordPaidServes`, `announcements.getAnnouncementCards` and `announcements.listRunningAnnouncements`. SP7 W1 writes and owns this file as the adapter over them, so SP6's shapes change nothing else in SP7:

- **`pickFeedItems`** calls `promote.getPaidFeedItems({ viewerUserId, limit: count + excludeKeys.length, state: null, now })`, adding `excludeOrgIds` once SP6 accepts it (section 13). SP7's signed cursor carries `seen`, so SP6's `state` isn't used, and the larger limit keeps excluded keys from starving the page. It loads cards in one batch per kind: `boosted_job` through `discovery.getJobCards(listingIds, { viewerUserId })` and `announcement` through `announcements.getAnnouncementCards(announcementIds, now)`. `key` is the `boostId` or `announcementId`; `orgId` is `card.host.orgId` or `announcement.orgId`; `label` is SP6's. It drops items whose card didn't resolve (a closed listing or an ended run), whose key is in `excludeKeys`, whose org is in `excludeOrgIds`, whose org already has an item in this batch, or whose label is empty, then keeps the first `count`. It then calls `promote.recordPaidServes({ items, surface: 'feed' })` with the SP6 items behind exactly what it returns. Every drop happens before that call, so a dropped item is never counted as served.
- **`listRunningAnnouncements`** calls `announcements.listRunningAnnouncements({ hiddenOrgIds: excludeOrgIds, before, limit, now })`. It builds SP6's `before` string from the merge position `{ startsAt, id }` and ignores `nextBefore`, because the Announcements tab merges two sources and may show fewer host items than it fetched.
- **`recordAnnouncementServes`** calls `promote.recordPaidServes({ items: ids.map((id) => ({ kind: 'announcement', announcementId: id, label: 'Paid announcement' })), surface: 'announcements_tab' })`. `getAnnouncementsPage` calls it with the host announcements on the page it returns.

**Foundation extensions SP7 needs** (SP7 W1 lands them in the Foundation modules; the Foundation module owner reviews):

| # | Module | Change |
|---|---|---|
| F1 | media | Approved `community_photo` files and their variants go to `media-private`, not `media-public` |
| F2 | media | `getSignedMediaUrls(db: DbOrTx, storage: Storage, mediaIds: string[], variants: Variant[], expiresSec = 300): Promise<Map<string, Record<Variant, string>>>`: batch signed URLs for approved media only. Server-internal: the caller has already authorized the viewer. |
| F3 | media | `KIND_RULES[kind].decisionTopic?: string`. When media of that kind reaches `approved`, `rejected` or `blocked` (automatically or by `decide`), media enqueues `{ topic, payload: { mediaId, status, altText, width, height, sha256 }, dedupeKey: 'media_decided:<id>:<status>' }` in the same transaction. `community_photo` uses `community.media_decided`. |
| F4 | media | `deleteMedia(db: DbOrTx, storage: Storage, mediaId: string): Promise<void>`: removes every storage object except evidence, sets `status='rejected'`, `rejection_reason='deleted'`. Later decisions on that media are no-ops. |
| F5 | trust | Subject handlers receive `data` with `itemId` and `operatorId` added |
| F6 | trust | `registerSubjectPreview(subjectType: string, fn: (db: DbOrTx, subjectId: string) => Promise<{ mediaId?: string; text?: string; link?: string }>)`, used by the queue item page |
| F7 | trust | Prompt `image_safety@2` adds labels `contact_info`, `solicitation`, `personal_document` and tells the model that alt text must describe the scene, never name people or guess sensitive traits |
| F8 | touchpoints | Settings keys (section 8), the `CommunityNotice` email template name, the `COMMUNITY_CURSOR_SECRET` env key, the operator sidebar entry "Community" |

## 4. Data model

Migration `drizzle/6000_community.sql`. Every table is in `app`, has RLS enabled with no policies, has `created_at` and `updated_at` with the `app.set_updated_at()` trigger, and uses UUIDv7 ids from `newId()`.

**`app.community_posts`**

| Column | Type | Constraint |
|---|---|---|
| `id` | uuid | pk |
| `author_user_id` | uuid | not null, references `app.users` |
| `media_id` | uuid | not null, unique, references `app.media` |
| `status` | text | not null default `'draft'`, check in (`draft`,`pending_review`,`published`,`hidden`,`rejected`,`removed`,`deleted`) |
| `media_status` | text | not null default `'uploaded'`, check in (`uploaded`,`scanning`,`in_review`,`approved`,`rejected`,`blocked`) |
| `rejection_reason` | text | null, check in (`guidelines`,`too_small`,`duplicate`,`scan_failed`) |
| `alt_text` | text | null, check `char_length(alt_text) between 1 and 250` |
| `alt_text_source` | text | null, check in (`ai`,`author`,`fallback`) |
| `alt_text_pending` | text | null, same length check |
| `image_sha256` | text | null |
| `width`, `height` | int | null, check `> 0` |
| `submitted_at`, `published_at`, `removed_at`, `deleted_at`, `purge_after` | timestamptz | null |
| `appeal_item_id` | uuid | null (set once; one appeal per post) |

Indexes: `community_posts_feed_idx (published_at desc, id desc) where status = 'published'`; `(author_user_id, created_at desc)`; `(image_sha256) where status in ('published','hidden','removed')`; `(purge_after) where purge_after is not null`; `(created_at) where status = 'draft'`. Check: `status <> 'published' or (published_at is not null and media_status = 'approved')`.

**`app.community_reactions`**: `post_id uuid not null references app.community_posts on delete cascade`, `user_id uuid not null references app.users`, `reaction text not null check in ('fire','wow','like','love')`, primary key `(post_id, user_id)`, index `(user_id, created_at desc)`. Counts are computed on read with one `group by` per page, never stored, so concurrent reactions can't drift (Engineering decision).

**`app.community_hides`**: `user_id uuid`, `post_id uuid references app.community_posts on delete cascade`, `reason text not null check in ('reported')`, primary key `(user_id, post_id)`, index `(post_id) where reason = 'reported'`. The count of rows per post is the distinct-reporter count.

**`app.community_restrictions`**: `id uuid pk`, `user_id uuid not null references app.users`, `kind text not null check in ('suspended','banned')`, `reason text not null`, `ends_at timestamptz` (null when banned), `review_item_id uuid`, `created_by uuid not null` (operator user), `lifted_at timestamptz`, `lifted_by uuid`. Check `(kind = 'banned') = (ends_at is null)`. Index `(user_id) where lifted_at is null`.

**`app.platform_announcements`**

| Column | Type | Constraint |
|---|---|---|
| `id` | uuid | pk |
| `source` | text | not null, check in (`operator`,`automated`) |
| `auto_key` | text | unique, null (e.g. `season:summer:2027`, `roundup:2026-W45`) |
| `status` | text | not null default `'draft'`, check in (`draft`,`published`,`archived`) |
| `title` | text | not null, check `char_length between 1 and 80` |
| `body` | text | not null, check `char_length between 1 and 600` |
| `cta_label` | text | null, check `char_length between 1 and 24` |
| `cta_path` | text | null, check `cta_path ~ '^/[A-Za-z0-9/_?=&.-]*$'` (internal paths only) |
| `category` | text | null, check in (`maritime`,`seasonal`,`farm`,`remote`) |
| `pinned` | boolean | not null default false |
| `starts_at` | timestamptz | not null default now() |
| `ends_at` | timestamptz | null, check `ends_at > starts_at` |
| `created_by` | uuid | null (operator user; null when automated) |
| `published_at` | timestamptz | null |

Checks: `(cta_label is null) = (cta_path is null)`. Indexes: `(starts_at desc, id desc) where status = 'published'`; unique `(pinned) where pinned` (one pinned row at most; archiving unpins).

**`app.community_member_state`**: `user_id uuid pk references app.users`, `announcements_seen_at timestamptz not null default 'epoch'`.

## 5. API

Every route uses `apiRoute`, zod v4 `.strict()` inputs (so `caption`, `tags`, `place` or `feeling` fields are rejected with 400), the Foundation error envelope, and `Cache-Control: private, no-store`. Seeker routes use `auth: 'seeker'`; a guest gets 401 and a host or operator gets 403.

| Method | Path | Auth | Input | Output | Rate limit |
|---|---|---|---|---|---|
| GET | `/api/v1/community/feed` | seeker | `?cursor` | `Page<FeedItem>` | n/a |
| GET | `/api/v1/community/photos` | seeker | `?cursor` | `Page<PhotoPostView>` | n/a |
| GET | `/api/v1/community/announcements` | seeker | `?cursor` | `Page<AnnouncementItem>` | n/a |
| POST | `/api/v1/community/announcements/seen` | seeker | none | `{ ok: true }` | n/a |
| GET | `/api/v1/community/status` | seeker | none | `{ unseenAnnouncements, canPost, restriction }` | n/a |
| POST | `/api/v1/community/posts` | seeker | `{ mime, sizeBytes }` | `{ postId, mediaId, uploadUrl, token }` | `community.post:<userId>` 20/hour, plus the daily cap |
| GET | `/api/v1/community/posts/:id` | seeker | none | `PhotoPostView` (others) or `OwnPostView` (author) | n/a |
| POST | `/api/v1/community/posts/:id/submit` | seeker (author) | `{ altText?: string(1..250) }` | `{ status }` | n/a |
| PATCH | `/api/v1/community/posts/:id` | seeker (author) | `{ altText: string(1..250) }` | `{ altText, pending }` | `community.alt:<userId>` 20/hour |
| DELETE | `/api/v1/community/posts/:id` | seeker (author) | none | 204 | n/a |
| GET | `/api/v1/community/me/posts` | seeker | `?cursor` | `Page<OwnPostView>` | n/a |
| PUT | `/api/v1/community/posts/:id/reaction` | seeker | `{ reaction: Reaction }` | `ReactionSummary` | `community.react:<userId>` 60/minute |
| DELETE | `/api/v1/community/posts/:id/reaction` | seeker | none | `ReactionSummary` | same |
| POST | `/api/v1/community/reports` | seeker | `CommunityReportInput` | `{ ok: true }` | `community.report:<userId>` 20/day |
| POST | `/api/v1/community/blocks` | seeker | `CommunityBlockInput` | `{ ok: true }` | `community.block:<userId>` 30/day |
| POST | `/api/v1/community/posts/:id/appeal` | seeker (author) | `{ reason: string(10..1000) }` | `{ appealItemId }` | n/a |
| GET | `/api/v1/admin/community/announcements` | operator | `?status&cursor` | `Page<PlatformAnnouncementView & { status, source }>` | n/a |
| POST | `/api/v1/admin/community/announcements` | operator | `PlatformAnnouncementInput` | `{ id }` | n/a |
| PATCH | `/api/v1/admin/community/announcements/:id` | operator | `Partial<PlatformAnnouncementInput>` | `{ id }` | n/a |
| GET | `/api/v1/admin/community/posts/:id` | operator (`moderation` or `reports`) | none | `OwnPostView & { authorUserId, reporterCount, restrictions }` | n/a |
| POST | `/api/v1/admin/community/restrictions/:id/lift` | operator, `sensitive: true` | `{ reason }` | `{ ok: true }` | n/a |

- **Upload completion** uses Foundation's existing `POST /api/v1/media/uploads/:id/complete`. No Community route duplicates it.
- **Not found and not allowed look the same:** a removed, hidden, deleted, blocked or nonexistent post returns 404 `not_found` with the message "This photo isn't available".
- **Cursors** are `base64url(json).base64url(hmac)`, signed with `COMMUNITY_CURSOR_SECRET`, holding `{ v: 1, iat, t, id, n, seen }`. A bad signature, or one older than 24 hours, returns 400 `bad_request` with `details: 'invalid_cursor'`, and the client restarts from the top.

## 6. Jobs, notifications, trust and audit

**Outbox topics and schedules** (appended to `src/server/schedules.ts`; handlers in `community.jobHandlers`):

| Topic | Trigger | Does |
|---|---|---|
| `community.media_decided` | Enqueued by media (F3) | Updates the post's `media_status`, alt text, size and hash. Applies the rules in section 8.2. |
| `community.maintenance` | `15 * * * *` | Deletes drafts older than 24 hours along with their media; rejects posts still scanning after 24 hours (`scan_failed`, notify); hard-deletes rows whose `purge_after` has passed and calls `deleteMedia` |
| `community.season_announcements` | `0 14 * * *` | Publishes the season announcement whose `monthDay` is today (section 8.5) |
| `community.weekly_roundup` | `0 15 * * 1` | Publishes the weekly roundup when there are enough new listings, and archives the previous roundup |

**Notification types** (`defineType` in `community/index.ts`; email template `CommunityNotice`, a title and a body inside the Foundation `Layout`):

| Type | Category | Mandatory | Channels | Batching | Copy (title) |
|---|---|---|---|---|---|
| `community.post_published` | community | no | in-app, push | none | Your photo is live in Community |
| `community.post_rejected` | community | no | in-app, push | none | Your photo wasn't posted |
| `community.post_removed` | community | yes | in-app, push, email | none | We removed your photo from Community |
| `community.post_restored` | community | no | in-app, push | none | Your photo is back in Community |
| `community.appeal_decided` | community | yes | in-app, email | none | We've reviewed your appeal |
| `community.restricted` | account | yes | in-app, email | none | You can't post in Community right now |

Child-safety blocks send no notification (section 8.2).

**Trust checks and queues**

| Kind | Run by | Subject | Queue on `needs_review` |
|---|---|---|---|
| `image_safety` (with `wantAltText: true`, prompt `image_safety@2`) | Foundation media scan | `media` | `moderation` |
| Child-safety hash | Foundation media scan | `media` | `child_safety` (always) |
| `text_safety` | `submitPost` / `updateAltText` when the author changes the alt text | `community_alt_text` / post id | `moderation` |
| Reports | SP4 `safety.report` | `community_post` / post id | `reports` |
| Appeals | `trust.openAppeal` | `community_post` | `appeals` |

**Subject handlers** (`registerSubjectHandlers`):

- `community_post`:
  - `approve` restores the post to `published`, clears `purge_after` and reporter hides, and sends `post_restored` if it was `hidden` or `removed`.
  - `remove` sets `removed` and `purge_after = now + 30 days`, then sends `post_removed`.
  - `suspend` removes the post and adds a `suspended` restriction (`ends_at = now + community.suspension_days`), then sends `restricted`.
  - `ban` removes every published post by the author and adds a `banned` restriction, then sends `restricted`. Foundation's second sign-off applies.
  - When `appeal_item_id` is set, the decision also sends `appeal_decided`.
- `community_alt_text`: `approve` copies `alt_text_pending` into `alt_text`; `remove` clears it.
- `registerSubjectPreview('community_post')` returns the media id, `"Photo by Maya Ruiz · 3 reports"` and `/admin/community/posts/<id>`.

**Audit actions** (`audit.record`, in the same transaction): `community.post_created`, `community.post_submitted`, `community.post_published`, `community.post_rejected`, `community.post_hidden`, `community.post_removed`, `community.post_restored`, `community.post_deleted`, `community.post_purged`, `community.alt_text_changed`, `community.appeal_opened`, `community.restriction_applied`, `community.restriction_lifted`, `community.announcement_saved`, `community.announcement_published`, `community.announcement_archived`. Reactions are not audited, because of their volume (Engineering decision).

## 7. Screens

The Community entry point is the Community icon in the seeker TopBar (product 15.1), which shows a dot when `unseenAnnouncements` is true. The BottomNav stays visible with no item marked current. Every component comes from `src/ui`. New patterns are added to `src/ui/patterns/` with gallery entries before any screen uses them: `PhotoPost`, `PhotoGrid`, `ReactionButton` (with picker), `PaidItemFrame`. `AnnouncementCard` is SP6's pattern (variants `community` and `host_page`); SP7 reuses it and adds a `platform` variant ("Explore&Earn", optional `CategoryBadge`, title, body, CTA `Button`, no label). There is no second announcement card.

| Route | Contents and components | States | Mobile / desktop |
|---|---|---|---|
| `/community` (Feed) | Header "Community", `Tabs` (Feed / Photos / Announcements, each its own route), `Button` "Post a photo" (an `IconButton` labeled "Post a photo" on mobile), a "Your photos" link. A `role="feed"` list of `PhotoPost` (`Avatar`, name, relative time, image with `srcset`, `ReactionButton`, an overflow menu: Report, Block [name]) and `PaidItemFrame` wrapping a `JobCard` (`coverBadge` = label) or SP6's `AnnouncementCard variant="community"` (`OrgLogo`, host name, label, title, body, optional image, SP6's CTA and "Until [date]"). The paid overflow menu has "Why am I seeing this?", Report and Block [host]. | Loading: 3 `Skeleton` posts. Empty: `EmptyState` "No photos yet" / "Share a photo from your work or your travels. It shows here once it passes review." Error: `ErrorState` with Retry. End: "You're all caught up". | One column, full-bleed images / a 600 px centered column. Infinite scroll by IntersectionObserver, plus a "Load more" `Button` for keyboard users. |
| `/community/photos` | `PhotoGrid` of 320 px variants, each a link to the post viewer, with alt text on the image | As Feed. Empty: "No photos yet". | 3 columns / 4 columns, max 960 px |
| `/community/announcements` | A pinned platform announcement first, then `AnnouncementCard`s: `variant="platform"` for platform ones and `variant="community"` for paid ones, which show their label and `OrgLogo`. Calls `seen` on view. | Empty: "No announcements right now". Loading and error as Feed. | One column / 600 px column |
| `/community/posts/[id]` | The 1280 px image, author, time, `ReactionButton`, overflow (others: Report, Block; author: Edit description, Delete) | Unavailable: `EmptyState` "This photo isn't available" | Full screen / `Dialog` over the tab when opened in-app, a page when deep-linked |
| `/community/new` | Step 1: file input (`accept="image/jpeg,image/png,image/webp,image/heic"`), client check ≤ 15 MB. Step 2: local preview with "Checking your photo" `Skeleton`, polling `GET posts/:id` every 2 s for up to 60 s. Step 3: `Textarea` "Description for people who use screen readers" (prefilled with the AI text, 250 max, with a counter), `Button` "Post". | In review: "Your photo needs a quick review. We'll post it as soon as it's approved." Rejected: `ErrorState` "This photo can't be posted" with a link to the community guidelines and "Choose another photo". Daily cap: "You've shared 10 photos today. You can post again tomorrow." Restricted: "You can't post in Community until [date]." / "You can't post in Community." Slow scan (60 s): "Still checking. We'll let you know when it's live." | Full screen / `Sheet` (side panel) |
| `/community/mine` | "Your photos": list rows with a `Pill` status (Checking, In review, Live, Hidden while we review reports, Not posted, Removed), actions Edit description, Delete, Appeal (removed, within 30 days, once) | Empty: "You haven't shared any photos yet" with "Post a photo" | List / two-column list |
| Guest on any `/community` route | `EmptyState` "See where the work takes people" / "Community is photos shared by seekers on Explore&Earn. Sign in to see them and share your own." `Button` "Sign in" (returns to the same route) | n/a | Same |
| Host or operator on `/community` | `EmptyState` "Community is for seekers", linking to `/host` or the console | n/a | Same |
| `/admin/community/announcements` | Operator `Sidebar` "Community". A table (title, status, source, window, pinned) and an editor `Sheet`: `Input` title (80), `Textarea` body (600), CTA label (24) and path, `Select` category, `Switch` pinned, start and end, Save draft / Publish / Archive, and a live `AnnouncementCard variant="platform"` preview | Empty: "No announcements yet" | Desktop console |
| `/admin/community/posts/[id]` | Image (signed URL), author, status, reporter count, restriction history; actions through `decide` on the open item, plus Lift restriction | n/a | Desktop console |

**ReactionButton:**

- A tap or Enter applies `DEFAULT_REACTION`, and on a post that already has your reaction it removes it.
- Press and hold for 400 ms, hover for 300 ms on desktop, or press ArrowUp while focused, and the picker opens. The picker is a `role="radiogroup"` of 4 buttons, each 44 px, moved through with the arrow keys. Enter selects and Escape closes, returning focus to the button.
- The button carries `aria-haspopup`, `aria-expanded` and the label "React, current reaction Love, 24 reactions".
- Counts show the top 3 reaction emoji (marked `aria-hidden`) and the total. Nobody can see who reacted.
- Animations are `motion-safe:` only, and reaction emoji are the only emoji in the interface.

**SEO:** every `/community` layout exports `robots: { index: false, follow: false }`, and its responses carry `X-Robots-Tag: noindex`.

## 8. Business rules

### 8.1 Posting

| Rule | Value |
|---|---|
| Who | Signed-in seekers with no active restriction and a profile name. Without a name: "Add your name to your profile to post". |
| Content | Exactly one photo per post (Engineering decision). No captions, tags, place or feeling (product 13). |
| Formats and size | Foundation `KIND_RULES` for `community_photo`: JPEG, PNG, WebP, HEIC, ≤ 15 MB. SVG is never accepted. |
| Minimum size | Shorter side ≥ 320 px, or the post is rejected as `too_small` (Engineering decision) |
| Daily cap | `community.posts_per_day` = 10 submitted posts in any rolling 24 hours (Engineering decision) |
| Open drafts | At most 3. Drafts are deleted after 24 hours. |
| Duplicates | An image whose sha256 matches a `published`, `hidden` or `removed` post by anyone is rejected as `duplicate`: "This photo is already in Community" |
| Identity shown | The seeker's profile name and avatar, and nothing else (product 13): the name as on their profile ("Maya Ruiz") from SP4 `profiles.getCommunityIdentities`, and the avatar, or initials when there is none. SP4 returns `avatarMediaId`; SP7 resolves it with Foundation `getMediaUrl(db, storage, viewer, avatarMediaId, 320)`, and since avatars are public media this is the public URL. No location, headline or profile link. Hosts can't open Community (section 10), so this doesn't touch the product 9.4 rule that hosts see only first name and last initial before an application. Showing first name and last initial here instead would change product 13 and needs the founder's sign-off. |
| Alt text | The AI alt text from the Foundation scan (`alt_text_source='ai'`). If there is none: "Photo shared by Maya Ruiz" (`fallback`), and the author is prompted to add a description. Author edits are 1–250 characters, trimmed. |
| Alt text moderation | An author edit runs `text_safety`. Approved: saved. Rejected: 400 "That description can't be used. Try describing what's in the photo." Needs review: saved in `alt_text_pending`, the previous text stays live, and a `moderation` item opens. |
| Deletion by the author | Allowed in any state. The post hides immediately; `deleteMedia` runs and the row is hard-deleted. Only `community.post_deleted` remains, in the audit log. |

### 8.2 Premoderation lifecycle

`draft` → (submit) → `published` if the media is `approved`, otherwise `pending_review`. `community.media_decided` then does this:

| Media result | Post in `draft` | Post in `pending_review` |
|---|---|---|
| `approved`, passes the size and duplicate checks | Stays `draft` and ready to submit | `published`, `published_at = now`, `post_published` notified |
| `approved`, fails the size or duplicate check | `rejected` (`too_small` or `duplicate`) | `rejected` with the same reason, `post_rejected` notified |
| `rejected` | `rejected` (`guidelines`) | `rejected`, `post_rejected` notified |
| `blocked` (child safety) | `rejected` (`guidelines`) with no notification. Foundation preserves the evidence and alerts the operators. | Same |
| No decision after 24 hours | `community.maintenance` deletes the draft | `rejected` (`scan_failed`), `post_rejected` notified ("We couldn't check your photo. Please try again.") |

- Nothing reaches `published` without `media_status='approved'`; a database CHECK enforces this.
- When the AI fails, Foundation turns the check into `needs_review`, so the post waits as `pending_review`. It is never published by default.

### 8.3 Reactions

- One reaction per seeker per post. PUT replaces the reaction and DELETE removes it; a DELETE with nothing to remove is a no-op that returns the summary.
- Reactions are allowed only on `published` posts the viewer can see. A seeker can't react to their own post (403 `forbidden`). A restricted seeker can't react (403).
- Reactions apply to seeker photos only. Paid items and platform announcements have none, so paying never buys engagement (Engineering decision).
- `top` lists the most-used reactions, at most 3, with ties broken in `REACTIONS` order.

### 8.4 Feed mix

| Rule | Value |
|---|---|
| Organic order | Newest `published_at` first, ties broken by id (Engineering decision: no engagement ranking) |
| Page size | Feed 20, Photos 30, Announcements 20 |
| Paid cap | **At most 1 in 5 items** (product 5.4). A paid item may be placed only after 4 organic items since the last slot opportunity. The counter `n` carries across pages in the cursor. So item 1 is never paid, two paid items are never adjacent, and any 5 consecutive items hold at most 1 paid item. |
| Unfilled slot | Filled by the next organic post. Paid items never fill a gap left by missing organic content, so an empty Community shows no ads. |
| Request to SP6 | After the organic query, SP7 calls `pickFeedItems` on the W1 adapter (section 3) with `count` = the slots on this page (at most 4), `excludeKeys` = `seen` (the last 40 paid keys in this feed session) and `excludeOrgIds` = `orgIds ∪ mutedOrgIds` from SP4 `safety.getBlockSet(db, viewerId)` (SP4 returns muted orgs separately). The call has a 500 ms budget. If it errors or times out, the page is organic only and a warning is logged. If it returns more than `count`, the extra items are dropped. |
| Per page | At most one paid item per org on a page |
| Eligibility | SP6 decides it. The Feed has no filter bar, so "matches the seeker's filters" (product 5.4) means it matches the seeker's private preferences from SP4; a seeker with no preferences matches any boosted job (Engineering decision, implemented by SP6). |
| Labels | Rendered exactly as SP6 supplies them ("Boosted" for jobs, "Paid announcement" for announcements). A paid item with an empty label is dropped and logged. |
| Photos tab | Seeker photos only, never paid items |
| Boosted card actions | The standard JobCard actions (Skip · Apply · Save), using SP3 and SP4 client actions with apply-source `boost`. The card body opens the SP3 listing detail. |
| Exclusions (every read) | The author is in the viewer's block set (`getBlockSet` `userIds`, either direction); the viewer reported the post (`community_hides`); the post isn't `published`; the author has an active ban; the author's identity can't be resolved (a deleted account) |

### 8.5 Announcements

| Rule | Value |
|---|---|
| Who writes | Operators (any role), plus the two automated kinds. Hosts never write free announcements (product 13). |
| Live | `status='published'`, `starts_at ≤ now`, and `ends_at` either null or after now |
| Order | The live pinned announcement first, then platform and SP6 running host announcements merged by `starts_at` desc, then id. There is no ratio cap in this tab: paid host announcements are its own content, each limited to its 7-day run. |
| Pinned | At most one. Pinning one unpins the other in the same transaction. |
| CTA | An internal path only; no external links (Engineering decision) |
| Unseen dot | Shown when a live platform announcement has `starts_at > announcements_seen_at`. Paid announcements never set the dot. |
| Season announcements | Setting `community.season_announcements`, default `[{ monthDay: '02-01', season: 'summer' }, { monthDay: '09-01', season: 'winter' }]`. Title "Summer hiring is open" (or "Winter"), body "Hosts are posting summer jobs now, and some include housing and meals.", CTA "See summer jobs" to `/seasons/summer`. Runs for 30 days. `auto_key = season:<season>:<year>`. |
| Weekly roundup | Mondays: if `discovery.countNewListings({ since: now - 7 days }).listings ≥ community.roundup_min_new_listings` (10). Title "New this week on Explore&Earn", body "{N} new jobs from {M} hosts. {H} of them include housing.", CTA "See new jobs" to `/?sort=newest`. Runs for 7 days. `auto_key = roundup:<ISO week>`. |

### 8.6 Safety

| Rule | Value |
|---|---|
| Report | Any post or paid item. `reportTarget` calls SP4 `safety.report(db, { userId: reporterId }, { subjectType, subjectId, reason, details })`, with `subjectType` `community_post` (post id), `listing` (listing id) or `announcement` (announcement id). The post is hidden for the reporter at once. `alsoBlock` also blocks the author or host. |
| Auto-hide | `community.report_hide_threshold` = 3 distinct reporters: the post becomes `hidden` (audit `community.post_hidden`) until an operator decides. The author sees "Hidden while we review reports". |
| Block | Post author (a user block, both directions) or host (an org block, which removes their paid items). `blockTarget` calls SP4 `safety.block(db, { type: 'user', id: viewerId }, target, viewerId)` with `target` = `{ type: 'user', id: <post author> }` or `{ type: 'org', id: orgId }`. Unblocking is in SP4's blocked list. |
| Suspension | `community.suspension_days` = 30, for posting and reacting. Viewing continues. |
| Ban | Community-only and permanent until lifted. All the author's published posts are removed. |
| Removal retention | A removed post is purged 30 days after removal unless it's restored (`docs/v1/05`) |
| Appeal | Once per removed post, within 30 days of removal, through `trust.openAppeal` (routed away from the deciding operator). The decision sends `appeal_decided`. |
| Notices | The author sees "It doesn't meet the community guidelines." and the guidelines link. Never the reporter or the detection details. |

## 9. Integrations and environment variables

- **No new vendors.** Moderation, alt text and the child-safety hash all run in the Foundation media pipeline: Claude Haiku 5.5 (`claude-haiku-5-5`), PhotoDNA, and Supabase Storage. Email goes through Resend and push through Web Push.
- **Secrets** live in Doppler, project `explore-and-earn`, configs `dev`, `stg` and `prd`, which map to `APP_ENV` `dev`, `preview` and `prod`. Doppler syncs them to Vercel (Development, Preview and Production) and to GitHub Actions.

| Variable | New? | Used for |
|---|---|---|
| `COMMUNITY_CURSOR_SECRET` | **New**, at least 32 characters, a different value per config | Signing feed cursors. Added to `src/lib/env.ts` as required. |
| `APP_URL`, `APP_ENV`, `DATABASE_URL` | Foundation | Links in notifications, the environment, the database |
| `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Foundation | Photo storage and signed URLs |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | Foundation | `image_safety` with alt text, `text_safety` |
| `CHILD_SAFETY_PROVIDER`, `PHOTODNA_KEY`, `CHILD_SAFETY_STUB_HASHES` (dev and stg only) | Foundation | Hash matching on every photo |
| `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | Foundation | `CommunityNotice` emails |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Foundation | Push |
| `JOBS_SECRET` | Foundation | Worker endpoint |
| `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN` | Foundation | Events and errors |

**Community launch gate:** a prod deploy with `CHILD_SAFETY_PROVIDER=stub` already refuses to start (Foundation env guard), so Community can't go live without PhotoDNA.

**Analytics (Foundation `track`, IDs only):** `community_post_submitted {postId}`, `community_post_published {postId}`, `community_reaction_set {postId, reaction}`, `community_paid_item_opened {key, kind}`. Alt text is never sent.

## 10. Security and privacy

| Actor | Can |
|---|---|
| Guest | See the explanation only. No post bytes, URLs or counts; the API returns 401. |
| Seeker (viewer) | Read published posts outside their block set; react; report; block |
| Seeker (author) | All of the viewer's rights, plus see their own posts in every status except `deleted`, edit alt text, delete, and appeal |
| Host (any role, any org) | Nothing in Community (403). They appear only through SP6 paid items. |
| Operator | Console routes. Item and post pages under `requireOperator({ queue: 'moderation' \| 'reports' })`. Announcements under `requireOperator()`. Lifting a restriction needs `sensitive: true`, and `ban` follows Foundation's second sign-off. |
| System | The handlers in section 6 |

- **Media access.** Community photos live in `media-private` (F1). URLs are 300-second signed URLs from `getSignedMediaUrls` (F2), issued only after Community has checked the viewer's rights in the same request. There is no public bucket URL, and Foundation's generic `GET /api/v1/media/:id/url` still refuses anyone but the owner or an operator. When an image fails to load, the client re-fetches the post once to get fresh URLs.
- **Every read checks:** the post status, the block set (both directions), the viewer's hides, author bans, and identity resolution. A response for someone else's post carries no user id, email, location or profile link, and the reactor list exists nowhere.
- **EXIF and GPS** are stripped by the Foundation re-encode before any variant exists. Community never asks for location.
- **The alt-text prompt** (F7) forbids naming people and inferring sensitive traits.
- **Cursors** are HMAC-signed, so a client can't raise its own paid density or reset `seen`.
- **CSRF** is handled by `apiRoute`'s Origin check, and every route responds with `Cache-Control: private, no-store`.
- **Privacy (SP8 hooks):**
  - `exportUserData` returns the user's own posts (id, status, dates, alt text, and a download through SP8's media export) and their reactions (post id, reaction, date). It never includes other users' identities.
  - `eraseUserData` deletes the user's posts and media, reactions, hides and member state. Restrictions are kept 12 months after they end, under SP8 retention, keyed by user id only.

## 11. Testing

**Unit and domain tests** (PGlite, stub providers, `memoryStorage`, a fake `PaidItemSource`):

- **Lifecycle:** every row of the 8.2 table; the `published` CHECK constraint; the daily cap at 10 with an 11th → 409 `conflict`; `too_small` and `duplicate`; alt-text edits with `hello` approved, `__block__` → 400 and `__flag__` → pending while the old text stays live.
- **Feed:** the cap property test (random organic supply of 0–200, random paid supply, 1–10 pages, every `n`); org once per page; SP6 throws, or sleeps 600 ms → organic only in under 800 ms total; a tampered cursor or one older than 24 hours → 400; an empty label is dropped.
- **Paid adapter** (`paid-item-source.test.ts`, over SP6's real modules on seeded boosts and announcements): it drops excluded keys and orgs, unresolved cards and a second item per org, returns at most `count`, and calls `recordPaidServes` for exactly the items it returns; the Announcements tab records serves only for the host items on the page.
- **Reactions:** a 4-step switch; 20 concurrent PUTs by one user on the integration Postgres → 1 row; own post → 403; a hidden post → 404.
- **Safety:** a block in either direction excludes posts; the third distinct reporter hides the post while a repeat reporter doesn't count; each subject handler action; an appeal with `excludeOperatorIds`; `ban` removes every published post by the author.
- **Announcements:** the live window; the single pin; season dedupe across two runs on the same day; the roundup skipped below 10 and archiving the previous one.
- **Privacy:** export contains no other user's id; erase leaves no rows besides restrictions and calls `deleteMedia` for every post.

**E2E:** E1–E8 from section 1, plus axe on every Community route in light and dark at 390 px and 1280 px, and a keyboard-only reaction flow.

**The 5 failure modes most likely to hurt real users**

| # | Failure | Pinned by |
|---|---|---|
| 1 | **A blocked, removed or deleted photo stays reachable** through the Feed, the Photos grid, a deep link or a fresh media URL | `access.test.ts`: after a block, removal or deletion, every read path returns no item or 404, and no new signed URL is issued for that media |
| 2 | **A photo goes live without passing moderation**: submitted mid-scan, the AI errors, or a child-safety match | `lifecycle.test.ts`: `pending_review` stays invisible; `classifier_error` never publishes; `blocked` never publishes and sends no notification |
| 3 | **Paid density breaks the 1-in-5 cap** across page boundaries, retries or concurrent tabs, or paid items repeat | The `feed.cap.test.ts` property test and the cursor-signature test |
| 4 | **SP6 or SP4 lookups fail and the whole Feed breaks** | `feed.resilience.test.ts`: a failing paid source → organic page; an unresolvable author → post skipped, the page still renders |
| 5 | **Reaction counts drift or double count** under taps from two tabs | `reactions.int.test.ts`, run concurrently on the CI Postgres; counts are always computed from rows |

## 12. Parallel workstreams

| Workstream | Owns | Migrations | Depends on |
|---|---|---|---|
| **W1** Foundations for Community | `6000_community.sql`, `community/schema.ts`, module skeleton with the section 3 types, Foundation extensions F1–F8, `src/server/paid-item-source.ts` (the adapter over SP6's `promote` and `announcements` exports, section 3), settings keys, env key | 6000–6099 | Foundation merged; SP6 merged |
| **W2** Posting pipeline | `posts.ts`: create, submit, alt text, delete, `community.media_decided`, `community.maintenance`, the notification types, `listOwnPosts` | 6100–6199 | W1 |
| **W3** Feed and reactions | `feed.ts`, `cursor.ts`, `reactions.ts`, block and hide filtering, reports and blocks through SP4 (`safety.report`, `safety.block` and `getBlockSet` as in sections 8.4 and 8.6), author identities through `getCommunityIdentities` with avatars from `getMediaUrl`, the paid mix | 6200–6299 | W1; SP4 `safety` and `profiles`; the W1 paid adapter (fake in tests) |
| **W4** Announcements | `announcements.ts`, the automated jobs, the Announcements tab merge, the unseen dot, the admin announcement API and page | 6300–6399 | W1; SP3 `countNewListings`; the W1 adapter's `listRunningAnnouncements` and `recordAnnouncementServes` |
| **W5** UI patterns | `PhotoPost`, `PhotoGrid`, `ReactionButton`, `PaidItemFrame` in `src/ui/patterns`, and the `platform` variant on SP6's `AnnouncementCard` (no second card), with gallery entries and render tests | none | Foundation design system and SP6's `AnnouncementCard` (both merged, so it can start on day one) |
| **W6** Moderation and privacy | `moderation.ts`: subject handlers and previews, restrictions, appeals, `/admin/community/posts/[id]`, `privacy.ts` exporter and eraser, `communityStats` | 6400–6499 | W1, W2 |
| **W7** Screens | Every `/community` route, the guest and host states, the TopBar dot, `noindex` | none | W2–W5 APIs and patterns |
| **C** Integration | `tests/e2e/sp7-exit.spec.ts` (E1–E8), axe, the performance check (Feed p95 ≤ 800 ms on 10,000 posts) | none | Everything above |

**Ownership rule:** as in Foundation, each workstream owns its files and migration range. Shared touchpoints (`schedules.ts`, the settings registry, `env.ts`, the operator sidebar, the seeker TopBar) are edited only at the lines W1 sets aside.

## 13. Open items

| Item | Owner | Decide before |
|---|---|---|
| Final reaction set (product 26). The working set ships as `REACTIONS` plus a CHECK constraint, so a change is one migration and one constant. | Founder | W5 locks `ReactionButton` |
| Approval of Foundation extensions F1–F8 | Engineering (Foundation media and trust owners) | W1 starts |
| SP6 additions the W1 adapter needs: `startsAt` on `AnnouncementCardData` (the Announcements tab merges by it); `listRunningAnnouncements` ordered by `starts_at desc, id desc`, with its `before` string being that keyset so the adapter can build it from the merge position; `getPaidFeedItems` accepting `excludeOrgIds`. Until `excludeOrgIds` lands, the adapter's own drop covers it. | Engineering (SP6 lead) | W1 wires `paid-item-source.ts` |
| SP4 contracts: `safety.report` returns `{ reportId, created }` and opens `reports` items with the reported subject; `safety.getBlockSet` covers both directions, with muted orgs in `mutedOrgIds`; `profiles.getCommunityIdentities` returns the profile name (first and last name, product 13), not first name and last initial as SP4 now specifies, plus `avatarMediaId`. SP4 updates `getCommunityIdentities` to match. | Engineering (SP4 lead) | W2 and W3 start |
| SP3 contracts: `discovery.countNewListings`, `robots.txt` `Disallow: /community`, the `/seasons/[season]` routes | Engineering (SP3 lead) | W4 starts |
| Community guidelines page at `/help/community-guidelines` (linked from compose and from notices) | Founder and SP8 | Launch |
| PhotoDNA approval, which gates Community at launch | Founder | Launch |
