# Community (Sub-project 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Signed-in seekers share moderated photos, react to them and read announcements, with paid items mixed into the Feed at no more than 1 in 5.

**Architecture:** One new module, `src/modules/community`, joins the Foundation modular monolith, with its client-safe types, schemas and copy in `src/lib/community`. Photos go through Foundation media, which Phase A extends with private storage, batch signed URLs, a deletion call and a per-kind decision event. After upload, every change to a post arrives through the `community.media_decided` outbox topic, a trust subject handler or the author's own request. Paid items arrive through one port, `PaidItemSource`, whose only real implementation is the adapter over SP6 in `src/server/paid-item-source.ts`, so nothing else in SP7 calls SP6. Phase A (W0) lands every table, contract, route and touchpoint; four workstreams then build the domain and the UI patterns in parallel, two build the screens, and W7 proves spec section 1.

**Tech Stack:** The Foundation stack: Next.js 16.4 (App Router, parallel and intercepting routes), React 19, TypeScript 6.0, Drizzle 0.45 on postgres.js and PGlite, zod 4, sharp, Radix Popover, Vitest 5 with Testing Library, Playwright 1.64 with `@axe-core/playwright` and `@clerk/testing`. Claude Haiku 5.5 (`claude-haiku-5-5`) through `runCheck`; PhotoDNA, Supabase Storage, Resend and Web Push through Foundation. No new dependency and no new vendor.

**Spec:** `docs/superpowers/specs/2026-11-03-sp7-community-design.md` (the "spec" below), with its parents `2026-11-03-explore-earn-product-design.md` (sections 13, 15.1, 21, 22) and `2026-11-03-foundation-design.md`. Binding contracts: the SP2, SP3 and SP4 plans in this folder; SP6 spec section 3, with the names SP6's plan fixes (`@/lib/promote`, `encodeAnnouncementCursor`, `AnnouncementCardProps`); and SP8 spec section 3 (privacy registration). Read the spec before your task; the plan cites its sections instead of copying its tables.

**Code wins.** Foundation code is on branch `feat/foundation`. Where it differs from the Foundation plan, follow the code. Differences that matter here:
- **media:** the width type is `VariantWidth` (the spec's `Variant` is the same union). Private kinds are listed in `PRIVATE_KINDS`, which `destinationBucket` reads. `removeMedia(db, mediaId)` is the operator removal, not a deletion. `Storage` has `signedUrl` but no batch call. An image the child-safety scanner can't read (with PhotoDNA, most iPhone HEVC HEIC photos) is held `in_review` in quarantine with review reason `UNSCANNABLE_REASON`, and `approveHeldMedia` refuses it, so an operator can only remove it (Plan decision 4).
- **jobs:** outbox dedupe keys are permanent: a second event with a used key is dropped even after the first is done (Plan decision 26).
- **apiRoute:** `auth: 'operator'` calls `requireOperator()` with no options, so queue and `sensitive` checks run inside the handler. Every response carries `cache-control: no-store`. Route params merge into the input, so strict schemas include `id`. `HttpMethod` gains `PUT` in SP2 Task 1.
- **trust:** `decide` passes its parsed data to the subject handler, and SP2 Task 4 adds `reviewItemId` and `listOpenReviewItems`. `addOperator` is a trust-internal fixture.
- **AI stub:** it scores markers found in text or image bytes, but the scan sends the classifier the re-encoded WebP, so no marker in an upload ever reaches it. Task 2 adds a stub-only passthrough.
- **Tests:** they read their environment from `.env.local.example` (`vitest.config.ts`); `createTestDb()` is in `tests/helpers/db.ts`; raw SQL goes through `queryRows`.

**Prerequisites:**
- Foundation is fully merged (B1, B2, B3 and C) and the founder has approved the design gate.
- SP2, SP3, SP4 and SP6 are merged. Their exported names below are used exactly.
- SP8 W0 is merged if it has landed `@/modules/privacy` and `src/server/privacy-registry.ts`. If not, Task 5 creates the types-only `@/modules/privacy` exactly as SP3 and SP4 W0 do.
- The Foundation media and trust owners review Tasks 2 and 3 (spec section 13).

## Global Constraints

- **Platform:** pnpm on Windows, no Docker. Unit tests run on PGlite (`pnpm test <path>`). `*.int.test.ts` files run only in CI's integration job; locally, run `pnpm typecheck` on them. E2E runs on `pnpm db:local` and `pnpm dev` with `STORAGE_PROVIDER=local` and stub AI, child-safety, malware and email providers. Memory is tight: run one workstream's tests at a time.
- **Secrets:** Doppler project `exploreandearn`, config `prd` only, holds the account tokens. Read them with `doppler run --project exploreandearn --config prd -- <command>` and never print a value. Generated secrets (`COMMUNITY_CURSOR_SECRET`) go to `%USERPROFILE%\.explore-and-earn\infra.json` and the Vercel env, never to Doppler (writes are blocked) or a commit. Spec section 9's `dev`, `stg` and `prd` configs don't exist; this rule replaces them.
- **Domain:** `exploreandearn.com`. Email goes from `send.exploreandearn.com` through Resend. Seekers are 18+.
- **Tables:** `app` schema, RLS enabled with no policies, UUIDv7 `id` from `newId()`, `created_at` and `updated_at` with `app.set_updated_at()`, CHECK enums.
- **Migrations:** `drizzle/NNNN_community*.sql` in SP7's range 6000–6999: W0 6000–6099, W1 6100–6199, W2 6200–6299, W3 6300–6399, W7 6900–6999. A Phase B migration references only Foundation, SP2–SP6 and 6000 tables.
- **Imports:** `@/modules/community` imports `media`, `trust`, `notifications`, `audit`, `settings`, `jobs`, `safety`, `profiles`, `discovery` and `listings`, each only through its index. It never imports `promote`, `announcements` or `boosts`; SP6's types come from its client-safe `@/lib/promote` (type-only). Only `src/server/paid-item-source.ts` calls SP6. `src/modules/community/index.ts` starts with `import 'server-only'`. `src/lib/community/**` never value-imports `@/modules/*`, `@/lib/db`, `drizzle-orm` or `server-only` (type-only imports are fine). `src/ui/**` imports no module, types included. `drizzle-orm` appears only in modules, `src/lib/db.ts`, `src/lib/migrate.ts` and tests.
- **Ownership:** each workstream owns the files its tasks list. Only W0 edits shared files: `src/lib/env.ts`, `.env.local.example`, `playwright.config.ts`, `src/db/schema.ts`, `src/server/{api,host-routing,job-handlers,schedules,module-registrations}.ts`, `src/proxy.ts`, the openapi import list, the settings registry, `EmailTemplateName`, the seeker and admin layouts, `src/modules/community/{index,constants,paid,access,cursor,jobs,register,notification-types}.ts` and every SP7 route file. Phase B workstreams replace stub bodies only and never change a W0 signature. `package.json` doesn't change.
- **Authorization:** the viewer and the author always come from the session. A post the viewer may not see, whatever the reason, is 404 `not_found` "This photo isn't available". Seeker routes use `auth: 'seeker'`, so a guest gets 401 and a host or operator 403.
- **Errors:** the Foundation envelope, with the machine reason in `details.reason`. The one exception is the cursor error, which is exactly `details: 'invalid_cursor'` (spec 5).
- **HTTP:** every SP7 route passes `cacheControl: 'private, no-store'` (Task 1), so successes, 204s, errors and 429s all carry it.
- **Copy:** the name is written exactly **Explore&Earn**. Reaction emoji are the only emoji in the interface. The voice is plain and warm and says "you". Strings in quotes in the spec and in this plan are exact. Copy never implies that every job includes housing.
- **Accessibility:** text contrast ≥ 4.5:1 (UI and large text ≥ 3:1), 44 px targets, visible focus, `motion-safe:` animations only, real `<button>` and `<a>` elements, an `aria-label` on every icon-only control. axe finds 0 serious or critical violations at 390 px and 1280 px in light and dark. Every list has a `Skeleton`, an `EmptyState` and an `ErrorState` with Retry.
- **AI:** moderation and alt text run only through Foundation media (`image_safety` with `wantAltText`) and `runCheck` (`text_safety`). Anyone who touches a prompt or `src/lib/ai.ts` loads the `claude-api` skill first.
- **Analytics:** exactly `community_post_submitted {postId}`, `community_post_published {postId}`, `community_reaction_set {postId, reaction}` and `community_paid_item_opened {key, kind}`. Never alt text, names or report details.
- **Audit:** spec section 6's actions, through `audit.record` inside the domain transaction. Reactions are not audited. Audit `data` never holds alt text, names or report details.
- **Screens** (Phase B2) use only `src/ui` components and patterns, and W4's patterns are in the gallery before any screen uses them.
- **Commits:** end every message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

These are spec section 11's five failure modes, the ones most likely to hurt real users. Each names the input most likely to break it and the test that pins it. The narrower edge cases (microsecond cursor ties, the Feed changing between pages, emoji alt text, the ISO week-year) are Plan decisions 7, 28 and 29.

1. **A blocked, removed or deleted photo stays reachable** through the Feed, Photos, a deep link or a fresh media URL. The likeliest input is a seeker who reports a post with "Also block <name>" ticked. The report hides the post from the reporter first, so a block that checks visibility again would return 404 after the report was filed, and the author would never be blocked. A block between two Feed pages is another. Expected: every read path returns no item or 404, and no signed URL is issued for that media. Report-plus-block files the report, creates the user block, and the author's other posts leave the reporter's Feed and Photos. Page 2 after a block holds none of the blocked author's posts. Pinned in `access.test.ts` (Task 12), `safety.test.ts` (Task 15) and `feed.cap.test.ts` (Task 14).
2. **A photo goes live without passing moderation, or its author is told the wrong reason.** The inputs: a post submitted mid-scan, an AI error, a child-safety match, and an iPhone HEIC photo under real PhotoDNA. PhotoDNA can't read HEVC HEIC, and sharp can't convert it, so the scanner throws `UnscannableImageError`. Foundation (08a872f) then holds the file `in_review` in quarantine with review reason `child_safety_unscannable`, and the operator's only choice is to remove it (`removed_by_operator`). Expected: `pending_review` stays invisible, `classifier_error` never publishes, and `blocked` never publishes or notifies anyone. The unscannable photo ends `rejected` as `scan_failed` with "We couldn't check your photo. Please try again.", never "It doesn't meet the community guidelines." (Plan decision 4). Pinned in `lifecycle.test.ts` (Task 9) with a child-safety scanner fake that throws `UnscannableImageError`, because the stub hash scanner never throws, and in Task 2's F3 tests.
3. **Paid density breaks the 1-in-5 cap** across page boundaries, retries or concurrent tabs, or a paid item repeats. Expected: item 1 is organic, every window of 5 consecutive items holds at most 1 paid item, no key repeats, and a tampered or 24-hour-old cursor is 400 `invalid_cursor` (Plan decision 10). Pinned in `feed.cap.test.ts` (Task 14): the E5 test and the 200-case property test.
4. **An SP6 or SP4 lookup fails and the whole Feed breaks.** Expected: a paid source that throws, or answers after 600 ms, gives an organic-only page in under 800 ms, and the late answer records no serve, because serves are recorded only for the items a page shows (Plan decision 27). An author without an identity is skipped, and the page still holds 20 posts. Pinned in `feed.resilience.test.ts` (Task 14).
5. **Reaction counts drift or double count** under taps from two tabs. Expected: 20 concurrent PUTs by one user leave 1 row, 10 users each PUTting from two connections total 10, and counts are always computed from rows. Pinned in `reactions.int.test.ts` (Task 13, on the CI Postgres).

## Plan decisions

The spec leaves these open, or the code and sibling specs force them. Each owning task applies the decision; reviewers check it here.

1. **Workstreams.** Spec section 12's W1 is Phase A's W0 here. Its W2 (posting) and W6 (moderation and privacy) merge into W1, because both change the post lifecycle. Then spec W3 → W2, W4 → W3, W5 → W4, W7 → W5 (seeker screens) and W6 (console screens), and C → W7. No phase runs more than 4 worktrees at once.
2. **W0 writes every route file and the module barrel, final.** Routes are thin (`apiRoute`, a guard, one module call), so B1 workstreams fill module files only and never collide on a route. Task 6's route contract test covers auth, strict inputs, cache headers, rate limits and OpenAPI.
3. **F1 is `community_photo` added to `PRIVATE_KINDS`**, which `destinationBucket` already reads. Approved photos and their variants then live in `media-private`, and Foundation's generic URL route still serves only the owner and operators.
4. **F3 also fires on `in_review`, and its payload adds `rejectionReason`, `unscannable` and `seq`** (`seq` is Plan decision 26). The post's `media_status` mirrors every media change, so the compose poll can tell "checking" from "in review". Media `unsafe_content` and `removed_by_operator` map to `guidelines`, except a removal with `unscannable: true`. The child-safety scanner couldn't read that file, so Foundation held it in quarantine as `child_safety_unscannable` and the operator could only remove it. Nobody judged the photo, so it maps to `scan_failed`. Every other media rejection reason maps to `scan_failed`. `unscannable` is true on `holdUnscannable`'s `in_review` event and on `removeMedia`'s `rejected` event for a file still in `quarantine` (only an unscannable hold leaves one there), and false on every other event.
5. **Stub marker passthrough.** With `AI_PROVIDER=stub` only, the scan passes `__flag__` or `__block__` to `runCheck` as `text` when the original upload's bytes contain it. E2E fixtures carry the marker in EXIF, which the re-encode strips from every variant.
6. **`Storage.signedUrls(bucket, paths, expiresSec)`** joins the Storage interface (Supabase `createSignedUrls`), so `getSignedMediaUrls` costs one storage call per page, not three per photo.
7. **Cursors** are spec 5's, plus `k` (the list that issued it; another list refuses it). `t` holds the anchor timestamp as Postgres text (`published_at::text`) and is compared as `$t::timestamptz`, because `published_at` carries microseconds and a JavaScript `Date` would round it and repeat or skip rows at a page boundary. So 45 posts whose `published_at` values differ only in microseconds page through Photos (30 + 15) and the Feed (20 + 20 + 5) as 45 distinct posts in order. The position is a keyset, not an offset, so the Feed changing between pages (a newer post publishes, the post page 1 ended on is deleted, the viewer blocks an author) gives page 2 no repeat and no gap, and the new post appears only at the top of a fresh load. Both are pinned in Task 14.
8. **Trust handler data gains `operatorId`**: the operator who made the decision, also after a second sign-off. SP2 Task 4's `reviewItemId` is spec F5's `itemId`; Task 3 adds it as well if it's absent.
9. **`community_posts.removal_item_id`** (an addition to spec 4) stores the review item whose decision removed the post, because `trust.openAppeal` needs the original item. Posts removed as a side effect of a ban keep it null and can't be appealed one by one; the ban's own post can.
10. **The Feed layout** (Task 14) puts a slot opportunity at every 5th item of a feed session (when `n` reaches 4), whether or not a paid item fills it, and places a paid item only when another organic post follows it. So item 1 is never paid, paid items are never adjacent, and an empty or tiny Community shows no ads.
11. **Labels.** `PaidItemFrame` provides the labeled region and the menu; the visible label comes from the card inside it (`JobCard`'s `boosted` badge reads "Boosted", and `AnnouncementCard` shows its own label). Items with an empty label are dropped by the adapter and again by the Feed.
12. **Reporting a paid announcement with `alsoBlock`** needs its org, which SP7 may not ask SP6 for outside the port. The `host_announcement` report target gains an optional `orgId` (the paid item carries it), and `alsoBlock` without it is 400. A listing's org comes from SP2's `getListingSummaries`.
13. **Community guidelines** link to `/legal/community`, where SP8 section 8.5 publishes the Community Guidelines, through one constant, `COMMUNITY_GUIDELINES_PATH`. Nobody builds the spec's `/help/community-guidelines`.
14. **SP8's console links to `/admin/content/announcements`.** That route redirects to `/admin/community/announcements`, the editor that spec 7 and E7 name.
15. **Privacy registration.** SP8 reads only `privacyHandler` and `retentionRules`. Its rules are `community.removed_photos_30d` and `community.restrictions_12m`. `exportData` wraps the spec's `exportUserData`. `erase(tx, s, ctx)` runs inside SP8's one transaction for the module, so it deletes rows in `tx` only and makes no storage call. SP8's `media` eraser deletes the photos' media rows and objects in the last wave, after this step commits, and enqueues `media.cleanup` for every object (SP8 Plan decision 9). A rolled-back step therefore leaves no row pointing at a deleted file. The spec's `eraseUserData(db, d, userId)` runs the same row eraser in its own transaction and calls `deleteMedia` after the commit. A `reports` hold keeps reported posts as well as an `all` hold does (Task 11).
16. **Scan timeout.** `community.maintenance` rejects as `scan_failed` only the posts whose media is still `uploaded` or `scanning` 24 hours after submission. Media held `in_review` waits for an operator. An unscannable hold (Plan decision 4) waits for the operator's removal, and then the post ends `scan_failed`.
17. **Own posts whose media isn't approved** get empty strings in `image.src`, so no URL is ever issued for unapproved media. Screens show a placeholder instead.
18. **"Your photos" lists submitted posts.** Drafts appear only in the compose flow.
19. **One active restriction per user.** A new suspension lifts an active suspension in the same transaction, and a suspension never replaces an active ban. The restriction's `reason` is the decision's `reason` (SP8 adds it to `decide`), else its `note`, else `community_guidelines`.
20. **The daily cap** is checked at `createPost` and again at `submitPost`, counting the author's rows with `submitted_at` in the last 24 hours.
21. **Only asynchronous publishes notify.** A post that `submitPost` publishes itself (its media already approved) sends no `community.post_published`; one published later by `community.media_decided` does.
22. **Paid budget on the Announcements tab.** Host announcements get the Feed's 500 ms budget; on a failure or timeout the tab shows platform announcements only.
23. **`OverflowMenu` and `TabNav` are new patterns** (W4). Foundation has no menu or link-tabs component, and Radix Tabs are buttons, not routes.
24. **Duplicate checks** take `pg_advisory_xact_lock(hashtext('community_sha:' || sha256))`, so two concurrent posts of the same photo can't both publish.
25. **A media rejection that reaches a `published` or `hidden` post removes it** (`removed`, 30-day purge, `community.post_removed`), because spec 4's check forbids a published post without approved media. An `approved` media decision that overturns a rejection (an audit sample or an appeal, delivered as a new event by Plan decision 26) acts as follows:
    - On a `rejected` post whose `rejection_reason` is `guidelines`: a submitted post runs the size and duplicate checks and publishes with `community.post_published`, and an unsubmitted one returns to `draft`.
    - On a post rejected as `too_small`, `duplicate` or `scan_failed`: the post stays rejected, because its author was told to try again.
    - On a `removed` post: only `media_status` changes. A removal is a decision about the post, and only a `community_post` decision brings it back.

    `postSubjectHandlers.approve` restores a `hidden` or `removed` post only when its `media_status` is `approved`. Otherwise the post stays as it is, a warning is logged and the item still resolves, so spec 4's check never makes `decide` throw. In every other case, decisions change a post's status only from `draft` or `pending_review`.
26. **Every media transition is its own event.** Outbox dedupe keys are permanent (`outbox.ts`: "enqueued once, even after the first one is done"). Since Foundation 08a872f a file can go approved → rejected (`removeMedia`, which keeps the copies) → approved (`approveHeldMedia` restores a kept `unsafe_content` or `removed_by_operator` file), so spec F3's key `media_decided:<id>:<status>` would silently drop the second `approved`. Task 2 adds `media.decision_seq`, incremented in the same UPDATE as each decision, and the key becomes `media_decided:<id>:<status>:<seq>`. `community_posts.media_decision_seq` stores the last `seq` applied, and `handleMediaDecided` ignores an event whose `seq` isn't above it. That covers a replay, and an older event that a retry delivers after a newer one.
27. **Feed serves are recorded after the page is planned.** In spec 3 the adapter's `pickFeedItems` calls `recordPaidServes` itself. But `getFeedPage` races it against `PAID_BUDGET_MS` and drops more items after it returns: beyond the count, a key in `seen`, a repeated org, an empty label, and every item of an answer that arrives too late. Hosts' delivery reports would count items nobody saw. So `pickFeedItems` records nothing, the port adds `recordFeedServes(db, items: CommunityPaidItem[])`, and `getFeedPage` calls it with exactly the paid items `planFeedPage` placed. This keeps spec 3's rule that a dropped item is never counted as served.
28. **Alt text is counted in code points everywhere.** 250 emoji are 500 UTF-16 units in JavaScript and 250 characters to Postgres `char_length`, so `altTextSchema` counts `[...s].length`. 250 `🔥` are accepted, 251 are rejected, and whitespace-only text is rejected after trimming (Tasks 4 and 8).
29. **The weekly roundup is keyed by ISO week-year and runs once a week.** Monday 2026-12-28 is 2026-W53 and Monday 2027-01-04 is 2027-W01, so `auto_key` uses the ISO week-year (`roundup:2026-W53`, then `roundup:2027-W01`) and no roundup is skipped or duplicated at New Year. A second run in the same ISO week (an outbox retry or a manual run) finds this week's `auto_key` and changes nothing, so it never archives this week's roundup or collides on the unique key (Task 18).

**Requests SP7 makes upstream that the upstream plans don't provide** (Phase A adds them): Foundation F1–F8 (Tasks 1, 2, 3, 5 and 6), with `media.decision_seq` and the `unscannable` flag added to F3 (Task 2, Plan decisions 4 and 26). For SP8, which Phase A can't change: under a `reports` hold Task 11 keeps reported posts, whose `media_id` is a foreign key to `app.media`, so SP8's `media` eraser has to keep a media row that a held `community_posts` row still references. Task 29's privacy proof checks this once SP8's registry exists. SP6's plan (its Plan decision 15) already adds `startsAt` to `AnnouncementCardData`, the `listRunningAnnouncements` keyset on `starts_at desc, id desc` through `encodeAnnouncementCursor`, and `excludeOrgIds` on `getPaidFeedItems`; Task 7 verifies them and adds any that the merged code lacks. SP4 already provides `getCommunityIdentities` with the full profile name (its Task 8), `report` returning `{ reportId, created }`, and `getBlockSet` with `mutedOrgIds`. SP3 provides `getJobCards`, `countNewListings`, `useListingActions`, `DiscoveryCard`, `/seasons/[season]` and `Disallow: /community`. **Requests sibling specs make of SP7:** SP4's `community_post` report subject (Task 5); SP8's `privacyHandler`, `retentionRules` and `/admin/content/announcements` (Tasks 11 and 27).

## File Structure

| Workstream | Creates (owns) | Modifies (touchpoints) |
|---|---|---|
| **W0** contracts | `drizzle/6000_community.sql`, `drizzle/6001_community_media_decision_seq.sql`; `src/lib/community/{types,constants,schemas,copy,index}.ts`; `src/modules/community/{index,schema,constants,paid,access,cursor,jobs,register,notification-types}.ts` and the W1–W3 stub files; `src/modules/notifications/email/templates/CommunityNotice.tsx`; `src/modules/media/{decisions,delete}.ts`; `src/modules/trust/previews.ts`; every SP7 route file; `src/server/{community,paid-item-source}.ts`; `src/app/(seeker)/_components/community-nav-button.tsx` (stub); `tests/fixtures/community/*`; `tests/helpers/sp7.ts`; `tests/e2e/helpers/sp7.ts`; `tests/sp7/{registry,routes,helpers}.test.ts` | `src/lib/env.ts`, `.env.local.example`, `playwright.config.ts`, the settings registry, `src/server/{api,host-routing,job-handlers,schedules,module-registrations}.ts`, `src/proxy.ts`, `src/db/schema.ts`, the openapi import list, `src/modules/media/{kinds,schema,storage,scan,urls,index}.ts`, `src/modules/trust/{actions,index}.ts`, `src/modules/trust/prompts/image_safety.ts`, `src/app/admin/queues/[id]/page.tsx`, `EmailTemplateName`, `src/app/(seeker)/layout.tsx`, `src/app/admin/layout.tsx`, `src/server/privacy-registry.ts` (if present), SP6 modules (Task 7, only where a contract is absent) |
| **W1** posting and moderation | `src/modules/community/{posts,lifecycle,maintenance,moderation,privacy,stats}.ts` and their tests, `drizzle/61xx` | — |
| **W2** feed, reads, reactions, safety | `src/modules/community/{views,reads,reactions,feed-plan,feed,safety}.ts` and their tests, `access.test.ts`, `feed.cap.test.ts`, `feed.resilience.test.ts`, `reactions.int.test.ts`, `drizzle/62xx` | — |
| **W3** announcements | `src/modules/community/{announcements,announcements-tab,status,auto-announcements}.ts` and their tests, `drizzle/63xx` | — |
| **W4** UI patterns | `src/ui/patterns/{OverflowMenu,TabNav,PaidItemFrame,PhotoPost,PhotoGrid,ReactionButton}.tsx` and tests; `src/app/design-system/patterns/{overflow-menu,tab-nav,paid-item-frame,announcement-card-platform,photo-post,photo-grid,reaction-button}/page.tsx` | `src/ui/patterns/AnnouncementCard.tsx` and its test (the `platform` variant) |
| **W5** seeker screens | `src/app/(seeker)/community/**`, `tests/e2e/sp7-community-screens.spec.ts` | `src/app/(seeker)/_components/community-nav-button.tsx` (fills the W0 stub) |
| **W6** console screens | `src/app/admin/community/**`, `src/app/admin/content/announcements/page.tsx`, `tests/e2e/sp7-console.spec.ts` | — |
| **W7** integration | `tests/sp7/{cross-module,wiring}.test.ts`, `tests/e2e/sp7-exit.spec.ts`, `tests/perf/community-feed.int.test.ts`, `docs/runbooks/sp7-community-setup.md`, fixes in `drizzle/69xx` | any file, for integration fixes only |

## Phases

| Phase | Tasks | Runs | Depends on |
|---|---|---|---|
| **A: Contracts and touchpoints** (W0) | 1–7 | One agent, in order | Prerequisites |
| **B1: Domain and pattern workstreams** | W1: 8–11 · W2: 12–15 · W3: 16–18 · W4: 19–21 | Four worktrees in parallel; tasks within a workstream run in order | Phase A |
| **B2: Screens** | W5: 22–26 · W6: 27–28 | Two worktrees in parallel | B1 merged |
| **C: Integration** (W7) | 29–31 | One agent | Everything above |

---

## Phase A: Contracts and touchpoints (W0, one agent, sequential)

### Task 1 (W0): Environment, settings, HTTP touchpoints and e2e fixtures

**Files:**
- Create: `tests/fixtures/community/images.ts`, `tests/fixtures/community/child-safety.ts`, `tests/fixtures/community/images.test.ts`, `tests/fixtures/community/child-safety-stub.jpg` (a plain generated 800×600 JPEG, committed)
- Modify: `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.local.example`, `src/modules/settings/registry.ts`, `src/modules/settings/settings.test.ts`, `src/server/api.ts`, `src/server/api.test.ts`, `src/server/host-routing.ts`, `src/server/host-routing.test.ts`, `src/proxy.ts` (one line), `playwright.config.ts`

**Interfaces:**
- Produces:
  - `Env.COMMUNITY_CURSOR_SECRET: string`, required in every environment, at least 32 characters. With `APP_ENV` `preview` or `prod`, the `.env.local.example` value throws `COMMUNITY_CURSOR_SECRET must be generated for <APP_ENV>`.
  - `.env.local.example`: `COMMUNITY_CURSOR_SECRET=dev-only-community-cursor-secret-not-for-deploys`, and `CHILD_SAFETY_STUB_HASHES` gains `CHILD_SAFETY_FIXTURE_SHA256` (comma-separated).
  - Settings keys, each added to `SettingValues`, `SETTING_DEFAULTS` and `SETTING_SCHEMAS`:

    | Key | Default | Validation |
    |---|---|---|
    | `community.posts_per_day` | `10` | int 1–100 |
    | `community.report_hide_threshold` | `3` | int 1–50 |
    | `community.suspension_days` | `30` | int 1–365 |
    | `community.season_announcements` | `[{ monthDay: '02-01', season: 'summer' }, { monthDay: '09-01', season: 'winter' }]` | ≤ 8 entries; `monthDay` a real `MM-DD`, unique; `season` in `spring`, `summer`, `fall`, `winter` |
    | `community.roundup_min_new_listings` | `10` | int 1–10000 |

  - `ApiRouteOptions.cacheControl?: string`: when set, every response the route returns (200, 204, a returned `Response`, an error envelope, a 429) carries it as `cache-control`.
  - `isNoindexPath(pathname: string): boolean` in `host-routing.ts`: true for `/community` and anything under `/community/`, compared after `canonicalPath`. `src/proxy.ts`'s `decorate` sets `X-Robots-Tag: noindex, nofollow` when it's true.
  - `makeCommunityJpeg(o?: { width?: number; height?: number; seed?: number; marker?: '__flag__' | '__block__' }): Promise<Uint8Array>` (`images.ts`): a sharp JPEG, 1200×900 by default, whose pixels come from `seed`, so each seed has its own sha256. `marker` goes into EXIF `IFD0.ImageDescription` through `withExif`.
  - `CHILD_SAFETY_FIXTURE_PATH` and `CHILD_SAFETY_FIXTURE_SHA256` (`child-safety.ts`, no imports): the committed file's path and its sha256 as a literal.
  - `playwright.config.ts` imports `child-safety.ts` and sets `webServer.env` to `{ ...process.env, CHILD_SAFETY_STUB_HASHES: [process.env.CHILD_SAFETY_STUB_HASHES, CHILD_SAFETY_FIXTURE_SHA256].filter(Boolean).join(',') }`.

- [ ] **Step 1: Write the failing tests.**
  - **Env:** a record without `COMMUNITY_CURSOR_SECRET` throws, naming it; a 31-character value throws; `.env.local.example` parses; the example value with `APP_ENV: 'prod'` throws `COMMUNITY_CURSOR_SECRET must be generated for prod`.
  - **Settings:** `getSetting(db, 'community.posts_per_day')` → `10`; `community.season_announcements` → the two default entries; `setSetting` with `[{ monthDay: '02-30', season: 'summer' }]` → `bad_request`.
  - **Cache header:** a route with `cacheControl: 'private, no-store'` has that header on a 200, on a 204, on a thrown `notFound()`, on a 401 from the guard and on a 429.
  - **Noindex:** `isNoindexPath` is true for `'/community'`, `'/community/posts/x'` and `'/COMMUNITY'`, and false for `'/communityx'` and `'/'`.
  - **Fixtures:** `makeCommunityJpeg({ marker: '__flag__' })` contains `__flag__` when read as latin1, and `fileTypeFromBuffer` says `image/jpeg`; seeds 1 and 2 have different sha256; the committed file's sha256 equals `CHILD_SAFETY_FIXTURE_SHA256`.
- [ ] **Step 2:** Run `pnpm test src/lib/env.test.ts src/modules/settings src/server/api.test.ts src/server/host-routing.test.ts tests/fixtures/community`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp7): cursor secret, community settings, cache header option, noindex and fixtures`.
- [ ] **Step 6 (operations, before Phase A merges):** Generate three different values with `node -e "process.stdout.write(require('crypto').randomBytes(48).toString('base64url'))"`. Store them as `COMMUNITY_CURSOR_SECRET` in `%USERPROFILE%\.explore-and-earn\infra.json` and in the Vercel env for Development, Preview and Production (pipe each into `vercel env add COMMUNITY_CURSOR_SECRET <target>`), never printing them. Expected: `vercel env ls` lists the key for all three targets.

### Task 2 (W0): Media extensions (F1–F4)

**Files:**
- Create: `drizzle/6001_community_media_decision_seq.sql`, `src/modules/media/decisions.ts`, `src/modules/media/delete.ts`, `src/modules/media/community.test.ts`
- Modify: `src/modules/media/{kinds,schema,storage,scan,urls,index}.ts`, `src/modules/media/scan.test.ts`, `src/modules/media/urls.test.ts`

**Interfaces:**
- Produces:
  - **F1:** `PRIVATE_KINDS` = `['resume', 'attachment', 'community_photo']`.
  - **F3:**
    - `KindRule.decisionTopic?: string`. `KIND_RULES.community_photo` becomes its own object, `{ ...image, decisionTopic: 'community.media_decided' }`.
    - `MediaDecision = { mediaId: string; status: 'in_review' | 'approved' | 'rejected' | 'blocked'; altText: string | null; width: number | null; height: number | null; sha256: string | null; rejectionReason: string | null; unscannable: boolean; seq: number }`, exported.
    - **`media.decision_seq`** (`integer not null default 0`, added by `6001_community_media_decision_seq.sql` and as `decisionSeq` in `schema.ts`; Plan decision 26): every status change listed below sets `decision_seq = decision_seq + 1` in the same UPDATE, for every kind, and the payload's `seq` is the new value.
    - `unscannable` (Plan decision 4) is true on `holdUnscannable`'s `in_review` event and on `removeMedia`'s `rejected` event when the locked row's bucket is still `quarantine`, and false on every other event.
    - `enqueueMediaDecision(db: DbOrTx, row: { id: string; kind: MediaKind }, d: MediaDecision): Promise<void>` (internal): when the kind has a `decisionTopic`, enqueues `{ topic, payload: d, dedupeKey: 'media_decided:<id>:<status>:<seq>' }`. Each transition has its own key, so the outbox's permanent dedupe never drops a later decision about the same file.
    - Every settle path calls it in the same transaction as the status change: the scan's `approved`, `in_review` (the classifier's and `holdUnscannable`'s), `rejected` (every reason) and `blocked`; `approveHeldMedia` (`approved`); `removeMedia` (`rejected`). Settles that aren't transactional today are wrapped in one (used as is when `db` is already a transaction).
  - **Batch signing:** `Storage.signedUrls(bucket: Bucket, paths: string[], expiresSec: number): Promise<string[]>`, in input order, on the memory, local and Supabase (`createSignedUrls`) storages. Memory throws `ObjectNotFoundError` for a missing path, as `signedUrl` does.
  - **F2:** `getSignedMediaUrls(db: DbOrTx, storage: Storage, mediaIds: string[], variants: VariantWidth[], expiresSec = SIGNED_URL_TTL_SEC): Promise<Map<string, Record<VariantWidth, string>>>`. Only approved media appear in the map. `media-private` objects are signed with one `signedUrls` call per call; `media-public` objects get `publicUrl`. The record has the requested widths (callers pass all three).
  - **F4:** `deleteMedia(db: DbOrTx, storage: Storage, mediaId: string): Promise<void>`: removes the file's objects in its current bucket (variants or path) and its quarantine copy, and sets `status='rejected'` and `rejection_reason='deleted'`. It records no audit row: its caller records its own, so an author's deletion leaves only `community.post_deleted` in the audit log (spec 8.1). It never touches `evidence`, so a `blocked` file is left exactly as it is. An unknown or already deleted id is a no-op, and no decision is enqueued.
    - After `deleteMedia`, `approveHeldMedia` and `removeMedia` return without error and change nothing, so an operator can still resolve that file's review item.
    - `RejectionReason` adds `'deleted'`.
  - **Stub marker passthrough** (Plan decision 5) in `scanImage`: when `getEnv().AI_PROVIDER === 'stub'` and `Buffer.from(original).toString('latin1')` contains `__block__` (checked first) or `__flag__`, `runCheck` also gets `text: <marker>`. With any other provider nothing is added.
  - The index exports `getSignedMediaUrls`, `deleteMedia` and `MediaDecision`.

- [ ] **Step 1: Write the failing tests** (`community.test.ts`, with `memoryStorage()`, the stub providers and `makeCommunityJpeg`).
  - **F1:** an approved `community_photo` has its three variants in `media-private` and none in `media-public`. `getMediaUrl` for another user → `forbidden`; for the owner → a signed `memory://media-private/…` URL. An approved `listing_photo` still lands in `media-public`.
  - **F2:** for two approved photos, one `in_review` photo and one unknown id, the map has exactly the two approved ids, each with 320, 640 and 1280 URLs containing `expiresIn=300`. A spy saw one `signedUrls` call and no `signedUrl` call.
  - **F3:**
    - Scanning a clean JPEG creates one outbox row: topic `community.media_decided`, dedupe key `media_decided:<id>:approved:1`, payload `status: 'approved'`, `altText: 'Test image'`, `width: 1200`, `height: 900`, the original's sha256, `rejectionReason: null`, `unscannable: false` and `seq: 1`.
    - A `__flag__` JPEG → one `in_review` row (`seq: 1`). Then `approveHeldMedia` → one `approved` row (`seq: 2`); or `removeMedia` instead → one `rejected` row with `rejectionReason: 'removed_by_operator'` and `unscannable: false`.
    - A clean JPEG, then `removeMedia`, then `approveHeldMedia` → three rows with keys `…:approved:1`, `…:rejected:2` and `…:approved:3`; none is dropped.
    - With a child-safety scanner fake that throws `UnscannableImageError` → one `in_review` row with `unscannable: true`. Then `removeMedia` → one `rejected` row with `rejectionReason: 'removed_by_operator'` and `unscannable: true`, and `approveHeldMedia` still throws `conflict`.
    - A PNG declared as JPEG → `rejected` with `type_mismatch`. The child-safety fixture → `blocked`.
    - An `avatar` scan enqueues nothing. Scanning the same media again adds no row.
    - With `enqueue` mocked to throw, the media stays `scanning`.
  - **F4:** after `deleteMedia`, `storage.list('media-private')` holds no object of that file, the row is `rejected`/`deleted`, no audit row was written, a second call does nothing, and `approveHeldMedia` on it resolves. On a `blocked` file the evidence object remains and the status stays `blocked`.
  - **Passthrough:** `__flag__` in EXIF → `in_review`; `__block__` → `rejected` with `unsafe_content`; no written variant contains the marker. With `AI_PROVIDER: 'anthropic'` (the classifier mocked), the `runCheck` input has no `text`.
  - Existing scan and URL tests that expect `community_photo` in `media-public` now expect `media-private`.
- [ ] **Step 2:** Run `pnpm test src/modules/media`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/media` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(media): private community photos, batch signed URLs, decision events and deletion`.

### Task 3 (W0): Trust extensions (F5–F7) and the queue item preview

**Files:**
- Create: `src/modules/trust/previews.ts`, `src/modules/trust/previews.test.ts`
- Modify: `src/modules/trust/{actions,index}.ts`, `src/modules/trust/actions.test.ts`, `src/modules/trust/prompts/image_safety.ts`, `src/modules/trust/checks.test.ts`, `src/app/admin/queues/[id]/page.tsx`

**Interfaces:**
- Produces:
  - **F5:** subject handlers receive `data = { ...decisionData, reviewItemId: string, operatorId: string }`. `operatorId` is the operator who made the decision (`decidedBy`), also when a second operator applies it.
  - **F6:**
    - `type SubjectPreview = { mediaId?: string; text?: string; link?: string }`
    - `registerSubjectPreview(subjectType: string, fn: (db: DbOrTx, subjectId: string) => Promise<SubjectPreview>): void` (a second registration for the same type replaces the first)
    - `getSubjectPreview(db: DbOrTx, subjectType: string, subjectId: string): Promise<SubjectPreview | null>`: lazy-loads `@/server/job-handlers` for an unknown type, as `findSubjectHandler` does. A throwing preview gives null and `logger.warn('trust.preview_failed', { subjectType })`.
  - **F7:** `image_safety` `version = 'image_safety@2'`. Its labels add `contact_info`, `solicitation` and `personal_document`. Its alt-text rule says the text describes the scene and what is happening, never names or identifies a person, and never guesses anyone's age, race, ethnicity, religion, health, disability, gender identity or sexual orientation.
  - **Queue item page:** when `getSubjectPreview` returns a value, it replaces the generic preview: the media thumbnail (through `getMediaUrl` as an operator, 640 px), the text, and an "Open post" link to `link`.

- [ ] **Step 1: Write the failing tests.**
  - `decide(db, itemId, opA, 'approve')` on a `test_item` → the logged `data` has `reviewItemId === itemId` and `operatorId === opA`.
  - With two operators, a `ban` by opA that opB approves → the handler gets `operatorId === opA`.
  - `getSubjectPreview` returns a registered preview; an unregistered type → null; a throwing preview → null and one warn.
  - The `image_safety` prompt's version is `image_safety@2`, and its system text contains `contact_info`, `solicitation`, `personal_document` and "never name". A stub `runCheck` stores `prompt_version = 'image_safety@2'`.
- [ ] **Step 2:** Run `pnpm test src/modules/trust`. Expected: FAIL.
- [ ] **Step 3:** Implement. Load the `claude-api` skill before editing the prompt.
- [ ] **Step 4:** Run `pnpm test src/modules/trust`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(trust): operator id for subject handlers, subject previews, image_safety@2`.

### Task 4 (W0): Migration 6000, Drizzle schema and the client-safe contract

**Files:**
- Create: `drizzle/6000_community.sql`, `src/modules/community/schema.ts`, `src/modules/community/schema.test.ts`, `src/lib/community/{types,constants,schemas,copy,index}.ts`, `src/lib/community/contract.test.ts`
- Modify: `src/db/schema.ts` (re-exports the community schema)

**Interfaces:**
- Produces:
  - **`6000_community.sql`:** exactly spec section 4's six tables, checks and indexes, plus:
    - `community_posts.removal_item_id uuid` (null; Plan decision 9);
    - `community_posts.media_decision_seq integer not null default 0` (the last media decision applied; Plan decision 26);
    - `community_hides.user_id uuid not null references app.users`;
    - `create unique index platform_announcements_one_pinned on app.platform_announcements (pinned) where pinned`.
  - **Drizzle tables:** `communityPosts`, `communityReactions`, `communityHides`, `communityRestrictions`, `platformAnnouncements`, `communityMemberState`.
  - **`types.ts`:** every spec section 3 type verbatim (`Reaction`, `PostStatus`, `RejectionReason`, `Variant`, `PhotoImage`, `CommunityAuthor`, `ReactionSummary`, `PhotoPostView`, `OwnPostView`, `CommunityPaidItem`, `FeedItem`, `PlatformAnnouncementView`, `AnnouncementItem`, `Page`, `CommunityExport`, `CommunityReportInput`, `CommunityBlockInput`, `PlatformAnnouncementInput`). It type-imports `JobCardData` from `@/lib/discovery`, `AnnouncementCardData` from `@/lib/promote` (SP6's client-safe library), `Category` from `@/ui/categories`, `SafetyReportReason` from `@/lib/safety` and `MediaStatus` from `@/modules/media`. Additions:

    ```ts
    export type CommunityReportTarget =
      | { kind: 'post'; postId: string } | { kind: 'listing'; listingId: string }
      | { kind: 'host_announcement'; announcementId: string; orgId?: string };   // Plan decision 12
    // CommunityReportInput.target is CommunityReportTarget
    export type CommunityStatus = { unseenAnnouncements: boolean; canPost: boolean;
      restriction: { kind: 'suspended' | 'banned'; endsAt: string | null } | null };
    export type RestrictionView = { id: string; kind: 'suspended' | 'banned'; reason: string; endsAt: string | null;
      createdAt: string; liftedAt: string | null; active: boolean };
    export type AdminPostView = OwnPostView & { authorUserId: string; reporterCount: number; restrictions: RestrictionView[];
      openItems: { id: string; queue: string; reason: string; subjectType: 'community_post' | 'community_alt_text' | 'media' }[] };
    export type AdminAnnouncementRow = PlatformAnnouncementView & { status: 'draft' | 'published' | 'archived';
      source: 'operator' | 'automated'; endsAt: string | null; publishedAt: string | null; autoKey: string | null };
    ```
  - **`constants.ts`:**
    - `REACTIONS` and `DEFAULT_REACTION` exactly as spec section 3, `REACTION_KEYS`, `POST_STATUSES`, `REJECTION_REASONS`
    - `PAGE_SIZE = { feed: 20, photos: 30, announcements: 20, mine: 20, admin: 50 }`, `SEEN_KEYS_MAX = 40`, `PAID_BUDGET_MS = 500`, `CURSOR_MAX_AGE_SEC = 86400`
    - `ALT_TEXT_MAX = 250`, `MAX_OPEN_DRAFTS = 3`, `DRAFT_TTL_HOURS = 24`, `SCAN_TIMEOUT_HOURS = 24`, `REMOVAL_RETENTION_DAYS = 30`, `APPEAL_WINDOW_DAYS = 30`, `RESTRICTION_RETENTION_MONTHS = 12`, `MIN_SHORT_SIDE_PX = 320`
    - `UPLOAD_MAX_BYTES = 15728640`, `UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic'`, `COMPOSE_POLL_MS = 2000`, `COMPOSE_POLL_LIMIT_MS = 60000`
    - `COMMUNITY_GUIDELINES_PATH = '/legal/community'`, `COMMUNITY_SEEN_EVENT = 'ee:community-seen'`
    - `RATE_LIMITS = { post: { limit: 20, windowSec: 3600 }, alt: { limit: 20, windowSec: 3600 }, react: { limit: 60, windowSec: 60 }, report: { limit: 20, windowSec: 86400 }, block: { limit: 30, windowSec: 86400 } }`
  - **`schemas.ts`** (zod 4; every object is `z.strictObject`):
    - `altTextSchema`: a trimmed string with no character in `\u0000-\u001f\u007f`, 1–250 code points (`[...s].length`).
    - `postCreateInput { mime: string 1–100; sizeBytes: int 1–UPLOAD_MAX_BYTES }`, `postIdInput { id: uuid }`, `postSubmitInput { id; altText?: altTextSchema }`, `postPatchInput { id; altText: altTextSchema }`, `cursorQuery { cursor?: string ≤ 4096 }`, `reactionInput { id; reaction: enum REACTION_KEYS }`, `appealInput { id; reason: trimmed 10–1000 }`, `liftInput { id; reason: trimmed 10–1000 }`.
    - `reportInput { target: discriminated on kind (the three targets, ids as uuid); reason: enum of SP4's REPORT_REASON_LABELS keys; details?: ≤ 1000; alsoBlock?: boolean }`; `blockInput`, discriminated on `kind`: `post_author { postId }` or `host { orgId }`.
    - `announcementInput { title: 1–80 code points; body: 1–600; cta: { label: 1–24; path: /^\/[A-Za-z0-9/_?=&.-]*$/ } | null; category: enum | null; pinned: boolean; startsAt: ISO datetime → Date; endsAt: ISO datetime → Date | null; status: 'draft' | 'published' | 'archived' }`, refined so `endsAt > startsAt`; `announcementPatchInput` = its partial plus `id`; `adminAnnouncementsQuery { status?: that enum; cursor? }`.
  - **`copy.ts`:** every quoted screen and API string in spec sections 5, 7, 8.1 and 8.6 as a named constant, plus:
    - `dailyCap(n)` → "You've shared {n} photos today. You can post again tomorrow."; `restrictedUntil(date)` → "You can't post in Community until {date}."; `BANNED` = "You can't post in Community."
    - `fallbackAlt(name: string | null)` → "Photo shared by {name}", or "A photo shared in Community" without a name.
    - `REJECTION_LINES`: `guidelines` "It doesn't meet the community guidelines.", `too_small` "Photos need to be at least 320 pixels on their shorter side.", `duplicate` "This photo is already in Community", `scan_failed` "We couldn't check your photo. Please try again."
    - `STATUS_PILL` (Checking, In review, Live, Hidden while we review reports, Not posted, Removed) and `ownPostPill(v: Pick<OwnPostView, 'status' | 'mediaStatus'>): string`: `pending_review` with `uploaded` or `scanning` media → Checking; `pending_review` with `in_review` → In review; `published` → Live; `hidden` → Hidden while we review reports; `rejected` → Not posted; `removed` → Removed.
    - `whyBoosted(host)` → "{host} paid to show this job here. It matches the kinds of work in your profile. Paid items are never more than 1 in every 5 posts."; `whyAnnouncement(host)` → "This is a paid announcement from {host}. Paid items are never more than 1 in every 5 posts."
    - `formatDay(iso: string): string`: `Intl` `en-US` `{ month: 'short', day: 'numeric', year: 'numeric' }` in UTC ("Dec 3, 2026").
  - `index.ts` re-exports the four files.

- [ ] **Step 1: Write the failing tests.**
  - **Schema** (`schema.test.ts`):
    - All six tables exist with `relrowsecurity` true.
    - A `published` post with `media_status = 'scanning'`, or with `published_at` null, violates the check.
    - A 251-character `alt_text` violates; `reaction = 'laugh'` violates; `kind = 'banned'` with `ends_at` set violates.
    - `cta_label` without `cta_path` violates; `cta_path = 'https://x.com'` violates; a second pinned row violates the unique index; `ends_at = starts_at` violates.
    - Deleting a post removes its reactions and hides.
    - `information_schema.columns` for the six tables has no column named `caption`, `tags`, `place` or `feeling`, and none containing `comment`.
  - **Contract** (`contract.test.ts`):
    - `REACTIONS` deep-equals spec section 3's four entries in order, and `DEFAULT_REACTION === 'like'`.
    - `postCreateInput` rejects `{ mime: 'image/jpeg', sizeBytes: 10, caption: 'x' }`; `postPatchInput` rejects a `tags` field; `reportInput` rejects a `feeling` field.
    - `altTextSchema` accepts 250 `🔥` and rejects 251, rejects `'   '` and `'a\u0007'`, and turns `'  hi '` into `'hi'` (Plan decision 28).
    - `announcementInput` rejects the CTA path `https://x.com`, accepts `/?sort=newest`, and rejects `endsAt` before `startsAt`.
    - `ownPostPill` maps the six cases above.
    - `UPLOAD_MAX_BYTES === KIND_RULES.community_photo.maxBytes` (`KIND_RULES` imported in the test).
    - A static scan of `src/lib/community/*.ts` finds no value import of `@/modules/`, `@/lib/db`, `drizzle-orm` or `server-only`.
- [ ] **Step 2:** Run `pnpm test src/modules/community/schema.test.ts src/lib/community`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): 6000 migration, Drizzle schema and client-safe contract`.

### Task 5 (W0): Module skeleton, cursor, access rules, notification types and registries

**Files:**
- Create:
  - `src/modules/community/{index,constants,paid,access,cursor,jobs,register,notification-types}.ts` (final)
  - the stub files in the table below
  - `src/modules/notifications/email/templates/CommunityNotice.tsx`
  - tests: `src/modules/community/{cursor,access-rules,notification-types}.test.ts`, `tests/sp7/registry.test.ts`
- Modify: `src/modules/notifications/types.ts` (`EMAIL_TEMPLATE_NAMES` adds `'CommunityNotice'`) and the email template map, `src/server/job-handlers.ts`, `src/server/schedules.ts`, `src/server/privacy-registry.ts` (adds `community` if the file exists; otherwise create the types-only `src/modules/privacy/index.ts` as SP3 Task 3 describes)

**Interfaces:**
- Consumes: `registerSubjectHandlers` and `registerSubjectPreview` (trust), `registerReportSubject` (SP4 safety), `defineType` (notifications), `getStorage` (media), `MediaDecision` (Task 2).
- Produces:
  - **`index.ts`:** re-exports `src/lib/community`, `paid.ts`, every function in the stub table and `jobHandlers` from `jobs.ts`; side-effect-imports `./notification-types` and `./register`.
  - **`paid.ts`:** spec section 3's `PaidItemSource` and `CommunityDeps`, with one change (Plan decision 27): `pickFeedItems` records nothing, and the port adds `recordFeedServes(db: DbOrTx, items: CommunityPaidItem[]): Promise<void>` for the paid items a Feed page shows. Also `noPaidItems` (returns `[]` and records nothing).
  - **`cursor.ts`:**

    ```ts
    export type CursorKind = 'feed' | 'photos' | 'announcements' | 'mine' | 'admin_announcements';
    export type CursorState = { k: CursorKind; t: string; id: string; n: number; seen: string[] };
    export function encodeCursor(s: CursorState, now?: Date): string;   // base64url(json).base64url(hmac); json = { v: 1, iat, ...s }
    export function decodeCursor(raw: string, k: CursorKind, now?: Date): CursorState;
    ```
    The HMAC is SHA-256 keyed with `COMMUNITY_CURSOR_SECRET`, compared with `timingSafeEqual`. `decodeCursor` throws `badRequest('This list has changed. Start again from the top.', 'invalid_cursor')` for a bad signature, bad JSON, `v !== 1`, another `k`, an `iat` more than 86,400 s old, or an `iat` more than 60 s in the future. `encodeCursor` keeps the last 40 `seen` keys.
  - **`access.ts`:**
    - `type PostRow = typeof communityPosts.$inferSelect`
    - `getActiveRestriction(db: DbOrTx, userId: string, now?: Date): Promise<{ id: string; kind: 'suspended' | 'banned'; endsAt: Date | null } | null>`: `lifted_at is null and (ends_at is null or ends_at > now)`; a ban wins over a suspension.
    - `assertNotRestricted(db: DbOrTx, userId: string, now?: Date): Promise<void>`: throws `forbidden("You can't post in Community right now", { reason: 'restricted', kind, endsAt })`.
    - `notAvailable(): AppError` = `notFound("This photo isn't available")`.
    - `lockPost(tx: Tx, postId: string): Promise<PostRow | null>` (`for update`; null for a non-UUID or a missing id).
    - `postExists(db: DbOrTx, postId: string): Promise<boolean>` (a row that isn't `deleted`).
  - **`jobs.ts`:** `mediaDecidedPayload` (the zod schema of `MediaDecision`, `unscannable` and `seq` included) and `jobHandlers`:
    - `community.media_decided` → `handleMediaDecided(db, mediaDecidedPayload.parse(payload), now)`
    - `community.maintenance` → `runMaintenance(db, getStorage(), now)`
    - `community.season_announcements` → `runSeasonAnnouncements(db, now)`
    - `community.weekly_roundup` → `runWeeklyRoundup(db, now)`
  - **`register.ts`:** `registerSubjectHandlers('community_post', postSubjectHandlers)`, `registerSubjectHandlers('community_alt_text', altTextSubjectHandlers)`, `registerSubjectPreview('community_post', postPreview)`, `registerReportSubject('community_post', { trustSubjectType: 'community_post', exists: postExists })`.
  - **`notification-types.ts`:** spec section 6's six types: category, mandatory and channels exactly as its table, titles verbatim, email template `CommunityNotice` where the table has email, and no batching. `data` holds only `postId`, `reason`, `outcome` and `endsAt`:

    | Type | Body | `url` |
    |---|---|---|
    | `community.post_published` | "People on Explore&Earn can see it now." | `/community/posts/<postId>` |
    | `community.post_rejected` | `REJECTION_LINES[data.reason]` | `/community/mine` |
    | `community.post_removed` | "It doesn't meet the community guidelines. You can appeal within 30 days." | `/community/mine` |
    | `community.post_restored` | "We reviewed it and it's live again." | `/community/posts/<postId>` |
    | `community.appeal_decided` | `outcome: 'restored'` → "Your photo is back in Community."; `outcome: 'upheld'` → "We looked again, and the photo stays removed. It doesn't meet the community guidelines." | `/community/mine` |
    | `community.restricted` | suspended → "You can't post or react in Community until {formatDay(endsAt)}. It doesn't meet the community guidelines."; banned → "You can't post or react in Community. It doesn't meet the community guidelines." | `/community` |

  - **`CommunityNotice`:** the title as the heading and the body inside Foundation's `Layout`, fed the same way Foundation's templates are fed, with a button "Open Community" to the notification's URL.
  - **`constants.ts`:** re-exports `src/lib/community/constants` and adds `TOPICS` (the four topic names) and `AUDIT` (spec section 6's audit action names).
  - **Stub files.** Each export throws `new Error('not implemented: <name> (W<n>)')`; the handler objects hold functions that throw.

    | File | Names | Owner |
    |---|---|---|
    | `posts.ts` | `createPost`, `submitPost`, `updateAltText`, `deletePost` | W1 |
    | `lifecycle.ts` | `handleMediaDecided` | W1 |
    | `maintenance.ts` | `runMaintenance`, `purgeDuePosts` | W1 |
    | `moderation.ts` | `postSubjectHandlers`, `altTextSubjectHandlers`, `postPreview`, `appealRemoval`, `liftRestriction` | W1 |
    | `privacy.ts` | `exportUserData`, `eraseUserData`, `privacyHandler`, `retentionRules` | W1 |
    | `stats.ts` | `communityStats` | W1 |
    | `reads.ts` | `getPost`, `listOwnPosts`, `getAdminPost` | W2 |
    | `reactions.ts` | `setReaction` | W2 |
    | `feed.ts` | `getFeedPage`, `getPhotosPage` | W2 |
    | `safety.ts` | `reportTarget`, `blockTarget` | W2 |
    | `announcements.ts` | `savePlatformAnnouncement`, `updatePlatformAnnouncement`, `listPlatformAnnouncements` | W3 |
    | `announcements-tab.ts` | `getAnnouncementsPage` | W3 |
    | `status.ts` | `getCommunityStatus`, `markAnnouncementsSeen` | W3 |
    | `auto-announcements.ts` | `runSeasonAnnouncements`, `runWeeklyRoundup`, `isoWeekKey` | W3 |

    Signatures are spec section 3's, plus:
    - `updatePlatformAnnouncement(db: Db, operatorId: string, id: string, patch: Partial<PlatformAnnouncementInput>): Promise<{ id: string }>`
    - `listPlatformAnnouncements(db: DbOrTx, i: { status?: 'draft' | 'published' | 'archived'; cursor: string | null }): Promise<Page<AdminAnnouncementRow>>`
    - `getAdminPost(db: Db, d: CommunityDeps, operatorUserId: string, postId: string): Promise<AdminPostView>`
    - `handleMediaDecided(db: Db, p: MediaDecision, now: Date): Promise<void>`
    - `runMaintenance(db: Db, storage: Storage, now: Date): Promise<{ draftsDeleted: number; scanFailed: number; purged: number }>` and `purgeDuePosts(db: Db, storage: Storage, now: Date, limit: number): Promise<number>`
    - `postPreview(db: DbOrTx, postId: string): Promise<SubjectPreview>`
    - `runSeasonAnnouncements(db: Db, now: Date): Promise<{ created: number }>`, `runWeeklyRoundup(db: Db, now: Date): Promise<{ published: boolean }>`, `isoWeekKey(d: Date): string`

    `privacyHandler`'s shape is final from W0: `module: 'community'`, `tables: ['community_posts', 'community_reactions', 'community_hides', 'community_restrictions', 'platform_announcements', 'community_member_state']`, `mediaColumns: [{ table: 'community_posts', column: 'media_id', array: false }]`, with stub `exportData` and `erase`. `retentionRules` holds both rules of Plan decision 15 with their final keys and Task 11's descriptions, and stub `run` functions that return `{ deleted: 0 }`.
  - **Registries:** `job-handlers.ts` merges `community`; `schedules.ts` appends `community.maintenance` `15 * * * *`, `community.season_announcements` `0 14 * * *` and `community.weekly_roundup` `0 15 * * 1`.

- [ ] **Step 1: Write the failing tests.**
  - **Cursor:** a round trip returns the same state. A changed payload byte, a changed signature byte, a `photos` cursor read as `feed`, and an `iat` 86,401 s old each throw `bad_request` with `details === 'invalid_cursor'`. 86,399 s old decodes. 41 `seen` keys encode as the last 40.
  - **Access rules:** a suspension ending tomorrow is active; one that ended yesterday → null; a lifted one → null; a ban plus a suspension → the ban; `assertNotRestricted` throws `forbidden` with `details.reason === 'restricted'`.
  - **Notifications:** the six titles equal spec section 6's table verbatim; `community.post_removed`, `community.appeal_decided` and `community.restricted` are mandatory with email; `community.restricted` has category `account`; `CommunityNotice` renders HTML containing the title and the body; a `post_rejected` with `reason: 'scan_failed'` has the body "We couldn't check your photo. Please try again."
  - **Registry** (`tests/sp7/registry.test.ts`):
    - `handlers` has the four community topics and builds without a duplicate-topic error; `schedules` holds the three crons.
    - After importing `@/modules/community`, `findSubjectHandler('community_post', 'remove')` and `getSubjectPreview(db, 'community_post', id)` resolve.
    - SP4's `report(db, { userId }, { subjectType: 'community_post', subjectId: <a seeded post>, reason: 'spam' })` succeeds instead of failing with `unknown_subject_type`.
    - The privacy registry, when present, lists module `community`.
- [ ] **Step 2:** Run `pnpm test src/modules/community tests/sp7/registry.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): module skeleton, signed cursors, access rules, notification types and registries`.

### Task 6 (W0): Routes, deps, shell touchpoints and test helpers

**Files:**
- Create:
  - every route file in the table below
  - `src/server/community.ts`
  - `src/server/paid-item-source.ts` (a stub: `export const paidItemSource: PaidItemSource = noPaidItems;`, replaced in Task 7)
  - `src/app/(seeker)/_components/community-nav-button.tsx` (a stub)
  - `tests/helpers/sp7.ts`, `tests/e2e/helpers/sp7.ts`, `tests/sp7/routes.test.ts`, `tests/sp7/helpers.test.ts`
- Modify: `src/app/api/v1/openapi.json/route.ts` (the imports, kept sorted), `src/server/module-registrations.ts` (SP4's file; adds `import '@/modules/community';`), `src/app/(seeker)/layout.tsx`, `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: every name in Task 5's stub table; `apiRoute`, `requireOperator`, `kickWorker`; SP4's `tests/helpers/sp4.ts` (`mockDbModule`, `guardMocks`, `request`, `call`, `seedUser`, `asSeeker`, `asHost`) and `updateProfile`; SP2's `tests/e2e/helpers/sp2.ts` (`drainJobs`, `dbRows`).
- Produces:
  - **`src/server/community.ts`:** `getCommunityDeps(): CommunityDeps` (`{ storage: getStorage(), paid: paidItemSource }`), `setCommunityDepsForTests(d: CommunityDeps | null): void`, `requireOperatorForQueues(queues: Queue[]): Promise<OperatorContext>` (the first `requireOperator({ queue })` that passes, else the last denial), `COMMUNITY_CACHE = 'private, no-store'`.
  - **Routes**, under `src/app/api/v1/`. Each passes `cacheControl: COMMUNITY_CACHE`, an `openapi` entry with the `{id}` path, the lib input schema, and where listed the rate limit `{ key: (c) => '<name>:' + c.user?.id, ...RATE_LIMITS.<x> }`:

    | File | Method | auth | Input | Calls | Rate limit |
    |---|---|---|---|---|---|
    | `community/feed/route.ts` | GET | seeker | `cursorQuery` | `getFeedPage` | — |
    | `community/photos/route.ts` | GET | seeker | `cursorQuery` | `getPhotosPage` | — |
    | `community/announcements/route.ts` | GET | seeker | `cursorQuery` | `getAnnouncementsPage` | — |
    | `community/announcements/seen/route.ts` | POST | seeker | — | `markAnnouncementsSeen` → `{ ok: true }` | — |
    | `community/status/route.ts` | GET | seeker | — | `getCommunityStatus` | — |
    | `community/posts/route.ts` | POST | seeker | `postCreateInput` | `createPost` | `community.post` (`post`) |
    | `community/posts/[id]/route.ts` | GET · PATCH · DELETE | seeker | `postIdInput` · `postPatchInput` · `postIdInput` | `getPost` · `updateAltText` · `deletePost` (204) | — · `community.alt` (`alt`) · — |
    | `community/posts/[id]/submit/route.ts` | POST | seeker | `postSubmitInput` | `submitPost`, then `kickWorker()` | — |
    | `community/posts/[id]/reaction/route.ts` | PUT · DELETE | seeker | `reactionInput` · `postIdInput` | `setReaction(…, reaction)` · `setReaction(…, null)` | `community.react` (`react`, shared) |
    | `community/posts/[id]/appeal/route.ts` | POST | seeker | `appealInput` | `appealRemoval` | — |
    | `community/me/posts/route.ts` | GET | seeker | `cursorQuery` | `listOwnPosts` | — |
    | `community/reports/route.ts` | POST | seeker | `reportInput` | `reportTarget` → `{ ok: true }` | `community.report` (`report`) |
    | `community/blocks/route.ts` | POST | seeker | `blockInput` | `blockTarget` → `{ ok: true }` | `community.block` (`block`) |
    | `admin/community/announcements/route.ts` | GET · POST | operator | `adminAnnouncementsQuery` · `announcementInput` | `listPlatformAnnouncements` · `savePlatformAnnouncement` | — |
    | `admin/community/announcements/[id]/route.ts` | PATCH | operator | `announcementPatchInput` | `updatePlatformAnnouncement` | — |
    | `admin/community/posts/[id]/route.ts` | GET | operator, then `requireOperatorForQueues(['moderation', 'reports'])` | `postIdInput` | `getAdminPost` | — |
    | `admin/community/restrictions/[id]/lift/route.ts` | POST | operator, then `requireOperator({ sensitive: true })` | `liftInput` | `liftRestriction` → `{ ok: true }` | — |

  - **Shell touchpoints:**
    - The seeker layout's TopBar Community control becomes `<CommunityNavButton seeker={viewer.accountType === 'seeker'} />`. The stub renders today's control unchanged (a link to `/community` labeled "Community"); W5 fills it.
    - The admin layout gains a Sidebar item "Community" linking to the announcements editor (`/admin/community/announcements`, written in the same form as the existing items), with an icon from `src/ui/icons`.
  - **`tests/helpers/sp7.ts`:**
    - `FIXED_NOW = new Date('2026-11-03T17:00:00Z')`
    - `testDeps(o?: { paid?: PaidItemSource }): CommunityDeps & { storage: MemoryStorage }`
    - `seedCommunitySeeker(db, o?: { firstName?: string; lastName?: string; avatar?: boolean; email?: string }): Promise<CurrentUser>`: SP4's `seedUser`, then `updateProfile` with the names ("Maya Ruiz" by default; `firstName: ''` leaves the profile unnamed). `avatar` seeds an approved `avatar` media in `media-public`.
    - `seedHost(db): Promise<CurrentUser>`
    - `seedPost(db, storage, authorId, o?: { status?: PostStatus; mediaStatus?: MediaStatus; publishedAt?: Date | string; createdAt?: Date; submittedAt?: Date; sha256?: string; width?: number; height?: number; altText?: string | null; altTextSource?: 'ai' | 'author' | 'fallback'; removedAt?: Date; removalItemId?: string | null; appealItemId?: string | null; purgeAfter?: Date | null }): Promise<{ postId: string; mediaId: string }>`: a `community_photo` media row (`approved` in `media-private` with Task 2's variant paths by default; the three variant objects written when approved), then the post (`published` now by default). A string `publishedAt` is a Postgres timestamp literal, so a test can set microseconds.
    - `seedOperator(db, o?: { role?: 'owner' | 'operator'; queues?: Queue[] }): Promise<string>` (user and operator rows through `queryRows`, on shift)
    - `seedPlatformAnnouncement(db, o?: Partial<PlatformAnnouncementInput> & { source?: 'operator' | 'automated'; autoKey?: string }): Promise<string>` (published, live and unpinned by default, title "Summer hiring is open")
    - `jobCardFixture(o?: Partial<JobCardData>): JobCardData`, `announcementCardFixture(o?: Partial<AnnouncementCardData>): AnnouncementCardData`, `paidJob(o?: { key?: string; orgId?: string; label?: string }): CommunityPaidItem`, `paidAnnouncement(o?: { key?: string; orgId?: string; label?: string; startsAt?: string }): CommunityPaidItem`
    - `fakePaidSource(o?: { items?: CommunityPaidItem[] | 'endless'; announcements?: AnnouncementCardData[]; delayMs?: number; fail?: boolean; ignoreRules?: boolean }): PaidItemSource & { calls: { pick: { count: number; excludeKeys: string[]; excludeOrgIds: string[] }[]; list: { excludeOrgIds: string[]; before: { startsAt: Date; id: string } | null; limit: number }[]; served: string[][]; announcementServes: string[][] } }`. `served` holds the keys of each `recordFeedServes` call and `announcementServes` the ids of each `recordAnnouncementServes` call; `pickFeedItems` adds to neither. `'endless'` makes new items `paid-<n>` from org `org-<n>` on demand. It honors `count`, `excludeKeys` and `excludeOrgIds` unless `ignoreRules` is set, which the Feed tests use to prove the Feed's own guards.
    - `drainJobs(db: Db, now?: Date): Promise<void>` (`runWorker` with the default handlers until nothing is processed) and `notificationsFor(db: DbOrTx, userId: string): Promise<{ type: string; data: Record<string, unknown> }[]>`
  - **`tests/e2e/helpers/sp7.ts`** (Playwright; first used in Phase B2):
    - re-exports SP2's `drainJobs` and `dbRows`
    - `signUpSeeker(page, i: { firstName: string; lastName: string }): Promise<{ userId: string }>`: a Clerk testing sign-up as Foundation's `tests/e2e/shells.spec.ts` does it, seeker onboarding, then `PATCH /api/v1/me/profile` from inside the page
    - `signUpHost(page)`; `signInOperator(page)`, reproducing how Foundation's `tests/e2e/operator.spec.ts` signs in its bootstrapped Owner
    - `postPhotoByApi(page, bytes: Uint8Array, o?: { altText?: string }): Promise<{ postId: string; status: PostStatus }>`: create, `PUT` the bytes to `uploadUrl`, complete, `drainJobs`, submit
    - `seedPublishedPhotos(count: number, authorUserId: string): Promise<string[]>`: rows through `createDb(DATABASE_URL)` and variant files through `localStorage(LOCAL_STORAGE_DIR)`
    - `adminUrl(path: string): string`

- [ ] **Step 1: Write the failing tests.**
  - **Routes** (`routes.test.ts`; every route file starts with SP4's `mockDbModule` and `guardMocks`; the module functions are mocked):
    - Every seeker route as a guest → 401, and as a host → 403. Every admin route as a seeker → 403.
    - `POST /community/posts` with `caption`, `PATCH /community/posts/:id` with `tags`, and `POST /community/reports` with `feeling` → 400.
    - Responses with status 200, 204, 400, 401 and 404 all carry `cache-control: private, no-store`.
    - `GET /community/posts/:id` while `getPost` throws `notAvailable()` → 404 with message "This photo isn't available".
    - The 21st `POST /community/posts` within an hour → 429 (real `consume` on PGlite); the 61st reaction PUT or DELETE within a minute → 429.
    - `buildOpenApi().paths` holds all 21 method-and-path pairs in the table (written out as a constant in the test), and no path contains `comment`.
    - `GET /admin/community/posts/:id` for an operator covering only `reports` → 200; only `fraud` → 403. `POST /admin/community/restrictions/:id/lift` without recent reverification → 403 with `details.reason === 'reverification_required'`.
  - **Helpers** (`helpers.test.ts`): `fakePaidSource({ items: 'endless' })` returns `count` items, none in `excludeKeys` or from `excludeOrgIds`; `seedPost` with `publishedAt: '2026-11-03 17:00:00.123456+00'` reads back with those microseconds.
- [ ] **Step 2:** Run `pnpm test tests/sp7 src/server`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): routes, deps, shell touchpoints and test helpers`.

### Task 7 (W0): The paid item adapter and SP6 touchpoints

**Files:**
- Modify: `src/server/paid-item-source.ts` (the real adapter). SP6's modules only where a contract below is absent: `@/modules/announcements` (`AnnouncementCardData.startsAt`, the `listRunningAnnouncements` order and `before`) and `@/modules/promote` (`excludeOrgIds`), with tests in their own test files.
- Create: `src/server/paid-item-source.test.ts`

**Interfaces:**
- Consumes: `promote.getPaidFeedItems`, `promote.recordPaidServes` and `PaidFeedItem`; `announcements.getAnnouncementCards`, `announcements.listRunningAnnouncements` and `AnnouncementCardData`; `discovery.getJobCards(db, listingIds, { viewerUserId })`.
- SP6 contracts (spec section 13), each added only if SP6's merged code lacks it:
  - `AnnouncementCardData.startsAt: string` (ISO).
  - `listRunningAnnouncements` orders by `starts_at desc, id desc`, and its `before` is `encodeAnnouncementCursor({ startsAt: Date; id: string })` (`<ISO instant>|<uuid>`), exported by `@/modules/announcements`.
  - `getPaidFeedItems` accepts `excludeOrgIds?: string[]` and leaves those orgs out.
- Produces: `paidItemSource: PaidItemSource`, following spec section 3's three bullets, except that feed serves move to `recordFeedServes` (Plan decision 27):
  - **`pickFeedItems`:** requests `limit: count + excludeKeys.length` with `state: null` and `excludeOrgIds`; loads cards in one batch per kind; drops unresolved cards, excluded keys and orgs, a second item from the same org, and empty labels; keeps the first `count`. It never calls `recordPaidServes`, because `getFeedPage` may still drop what it returns, or give up waiting for it. `key` is the `boostId` or `announcementId`; `orgId` is `card.host.orgId` or `announcement.orgId`.
  - **`recordFeedServes`:** maps each item back to the SP6 item behind it (`{ kind: 'boosted_job', listingId, boostId: key, label: 'Boosted' }` or `{ kind: 'announcement', announcementId: key, label: 'Paid announcement' }`) and calls `recordPaidServes({ items, surface: 'feed' })`. An empty list makes no call.
  - **`listRunningAnnouncements`:** `hiddenOrgIds: excludeOrgIds`, `before: encodeAnnouncementCursor(<the merge position>)` (or none), `limit` and `now`; returns `items` and ignores `nextBefore`.
  - **`recordAnnouncementServes`:** `recordPaidServes({ items: ids.map((id) => ({ kind: 'announcement', announcementId: id, label: 'Paid announcement' })), surface: 'announcements_tab' })`. An empty list makes no call.

- [ ] **Step 1: Write the failing tests** (`paid-item-source.test.ts`, on SP6's real modules, with boosts and announcements seeded through SP6's test helpers, or inserted into its tables as its schema defines when it has none).
  - Two boosts from one org plus one running announcement, `count: 4` → one boosted job and one announcement; `getJobCards` and `getAnnouncementCards` were each called once.
  - A key in `excludeKeys` and an org in `excludeOrgIds` never come back.
  - A boost whose listing closed is dropped, and so is an item whose SP6 label is empty (SP6 mocked for that case).
  - `count: 1` with three candidates → one item, and the spied `recordPaidServes` wasn't called. `recordFeedServes(db, [that item])` → `recordPaidServes` received exactly the SP6 item behind it, and the `feed` served count in `boost_daily_stats` rose by 1. `recordFeedServes(db, [])` makes no call.
  - `listRunningAnnouncements` with `before` at the third item's position returns only the items after it, in `starts_at desc, id desc` order, each with `startsAt`.
  - `recordAnnouncementServes(db, [a, b])` adds 1 to the `announcements_tab` served count of each; `[]` makes no call.
- [ ] **Step 2:** Run `pnpm test src/server/paid-item-source.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test and SP6's module tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): paid item adapter over SP6 promote and announcements`.

---

## Phase B1: Domain and pattern workstreams (in parallel; one worktree per workstream, based on Phase A)

Each workstream replaces stub bodies in its own files and keeps every W0 signature. Foundation, SP2, SP3 and SP4 modules are real in tests; SP6 is reached only through the adapter, so tests pass `testDeps({ paid: fakePaidSource(...) })`. A function another B1 workstream owns is still a W0 stub in your worktree: don't call it. The tables are real, so read and write them through `schema.ts`. Each test file opens its own database with `createTestDb()` and seeds through `tests/helpers/sp7.ts`.

### Task 8 (W1): Create, submit, alt text and delete

**Files:**
- Modify: `src/modules/community/posts.ts`
- Create: `src/modules/community/posts.test.ts`

**Interfaces:**
- Consumes: `requestUpload` and `deleteMedia` (media), `runCheck` (trust), `getCommunityIdentities` (SP4 profiles), `assertNotRestricted`, `lockPost` and `notAvailable` (Task 5), `getSetting(db, 'community.posts_per_day')`, `record`, `track`.
- Produces (spec section 3 signatures):
  - **`createPost`:**
    - The author needs a profile name (present in `getCommunityIdentities`), else `forbidden('Add your name to your profile to post', { reason: 'name_required' })`, and no active restriction (`assertNotRestricted`).
    - At most 3 open drafts: with 3 `draft` posts it throws `conflict('Finish or delete the photo you started first', { reason: 'too_many_drafts' })`.
    - With `community.posts_per_day` or more posts whose `submitted_at` is in the last 24 hours, it throws `conflict(dailyCap(n), { reason: 'daily_cap' })` (Plan decision 20).
    - `requestUpload(db, d.storage, { userId }, { kind: 'community_photo', mime, sizeBytes })` (its `bad_request` for SVG or size passes through), then a `draft` post for the media, and audit `community.post_created`.
  - **`submitPost`:**
    - Another author's post, or a `deleted` one → `notAvailable()`. Any status but `draft` → `conflict('This photo was already submitted', { reason: 'already_submitted' })`. The restriction and the daily cap as above.
    - An `altText` that differs from the stored text runs `runCheck(db, { kind: 'text_safety', subjectType: 'community_alt_text', subjectId: postId, text })` before the transaction. `rejected` → `badRequest("That description can't be used. Try describing what's in the photo.", { reason: 'alt_text_rejected' })` and nothing changes; `needs_review` → the text goes to `alt_text_pending` (`runCheck` opens the item); `approved` → `alt_text`, source `author`.
    - In one transaction under `lockPost`: approved media → the duplicate check (Plan decision 24), then `rejected` with `duplicate`, or `published` with `published_at`; media `uploaded`, `scanning` or `in_review` → `pending_review`. `submitted_at = now`. Audit `community.post_submitted`, `community.alt_text_changed` when the text changed, and `community.post_published` when it publishes. `track('community_post_submitted', { postId })`, and `community_post_published` when it publishes. No notification (Plan decision 21).
    - Returns `{ status }`.
  - **`updateAltText`:** the author's post; `deleted` → `notAvailable()`; `rejected` → `conflict(…, { reason: 'not_editable' })`. The same three check outcomes. Audit `community.alt_text_changed` with `data: { pending }`. Returns `{ altText: <the live text>, pending }`.
  - **`deletePost`:** the author's post in any status but `deleted`. Transaction 1 sets `deleted`, `deleted_at` and `purge_after` to now, and records audit `community.post_deleted`. Then `deleteMedia` and a hard delete of the row. A failure after transaction 1 is logged and left for `purgeDuePosts`.

- [ ] **Step 1: Write the failing tests.**
  - **Daily cap:** with 10 posts submitted in the last 24 hours, the 11th `createPost` is 409 `conflict` with `details.reason 'daily_cap'` and the message "You've shared 10 photos today. You can post again tomorrow."; when the oldest was submitted 24 hours and 1 second ago, it succeeds.
  - A 4th open draft → 409 `too_many_drafts`. An unnamed seeker → 403 `name_required`. A suspended seeker → 403 `restricted`. `mime: 'image/svg+xml'` → 400.
  - **Alt text:** `hello` → `alt_text 'hello'`, source `author`. `__block__` → 400 with the exact message, and the post is still `draft`. `__flag__` → `alt_text_pending '__flag__'`, the previous text still in `alt_text`, and one open `moderation` item with subject `community_alt_text` and the post id. 250 `🔥` saves (Plan decision 28).
  - **Submit:** approved media → `published` with `published_at`, and no notification row; `scanning` media → `pending_review`; submitting twice → 409 `already_submitted`; another seeker's post → 404 "This photo isn't available". Two posts of the same approved sha256: the second submit leaves it `rejected` with `duplicate`.
  - **Delete:** the row is gone, its reactions and hides are gone, its media is `rejected`/`deleted`, and the only audit row written by the deletion is `community.post_deleted`. With storage `remove` failing, the row stays `deleted` with `purge_after` set.
- [ ] **Step 2:** Run `pnpm test src/modules/community/posts.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): create, submit, alt text and delete posts`.

### Task 9 (W1): Media decisions and maintenance

**Files:**
- Modify: `src/modules/community/{lifecycle,maintenance}.ts`
- Create: `src/modules/community/lifecycle.test.ts`, `src/modules/community/maintenance.test.ts`

**Interfaces:**
- Consumes: `MediaDecision` and `deleteMedia` (Task 2), `notify`, `getCommunityIdentities`, `lockPost`, `record`, `track`; in tests, media's `scanMedia`, `UnscannableImageError`, `stubMalwareScanner` and `UNSCANNABLE_REASON`, and trust's `decide`.
- Produces:
  - **`handleMediaDecided(db, p, now)`:** one transaction under `lockPost` on the post whose `media_id = p.mediaId` (none, or `deleted` → return). An event whose `p.seq` isn't above the post's `media_decision_seq` changes nothing: a replay, or an older event that a retry delivered after a newer one (Plan decision 26). Otherwise it sets `media_status = p.status` and `media_decision_seq = p.seq`, then applies spec 8.2 and Plan decision 25:
    - `in_review` → nothing else.
    - `approved` → copies `width`, `height` and `sha256`. A shorter side under 320 → reject as `too_small`; a duplicate (Plan decision 24) → reject as `duplicate`. Otherwise, unless `alt_text_source = 'author'`, `alt_text` becomes `p.altText` (source `ai`) or `fallbackAlt(displayName)` (source `fallback`). A `pending_review` post then publishes (`published_at = now`, audit `community.post_published`, `track`, notify `community.post_published` with `{ postId }`); a `draft` stays `draft`.
    - `approved` on a `rejected` post with `rejection_reason = 'guidelines'` (an overturned rejection): `rejection_reason` is cleared and the post goes through the path above as a `pending_review` post when `submitted_at` is set, or as a `draft` otherwise. A post rejected as `too_small`, `duplicate` or `scan_failed`, and a `removed` post, change only `media_status`.
    - `rejected` → reject as `guidelines` for `unsafe_content`, or for `removed_by_operator` with `unscannable: false`; as `scan_failed` for a removal with `unscannable: true` and for every other reason (Plan decision 4).
    - `blocked` → reject as `guidelines`, never notified.
    - Rejecting sets `rejected` and `rejection_reason`, records audit `community.post_rejected`, and notifies `community.post_rejected` with `{ postId, reason }` only when the post was `pending_review` and the media isn't `blocked`. A `rejected` decision on a `published` or `hidden` post removes it instead (`removed`, `removed_at`, `purge_after` 30 days on, notify `community.post_removed`).
    - Replaying a payload changes nothing and notifies nothing the second time.
  - **`runMaintenance(db, storage, now)`:** deletes `draft` posts created more than 24 hours ago (`deleteMedia`, hard delete); rejects as `scan_failed`, with notification, `pending_review` posts whose media is `uploaded` or `scanning` and whose `submitted_at` is more than 24 hours old (Plan decision 16); then `purgeDuePosts(db, storage, now, 500)`.
  - **`purgeDuePosts(db, storage, now, limit)`:** for posts with `purge_after <= now`, oldest first, up to `limit`: `deleteMedia`, hard delete, audit `community.post_purged`. Returns the count.

- [ ] **Step 1: Write the failing tests.**
  - **`lifecycle.test.ts`** (failure mode 2):
    - Each row of spec 8.2 in both columns, asserting the status, `rejection_reason` and exact notification rows: an approved draft → `draft` with `alt_text 'Test image'`, source `ai`; an approved pending post → `published` and one `community.post_published`; a 319 px shorter side → `too_small` (320 passes); a duplicate → `duplicate`; rejected `unsafe_content` → `guidelines`; `blocked` → `rejected`/`guidelines` with zero notification rows for the author, in either column.
    - `classifier_error`: the media is `in_review`, and the post stays `pending_review` and out of every `status = 'published'` query.
    - **Unscannable photo** (Review Focus 2): with a child-safety scanner fake that throws `UnscannableImageError`, a submitted post's media goes through the real `scanMedia` and is held `in_review` in quarantine, and the post stays `pending_review`. `decide(remove)` on the media's `moderation` item (reason `UNSCANNABLE_REASON`), then `drainJobs`, leaves the post `rejected` as `scan_failed` with one `community.post_rejected` whose body is "We couldn't check your photo. Please try again.", never "It doesn't meet the community guidelines." The stub hash scanner never throws, so this fake is the only way to reach the production path.
    - On the stub scanner's path, `unsupported_format` (a HEIC that libvips can't decode) and `type_mismatch` → `scan_failed`, with the same body.
    - Approved with `altText: null` for Maya Ruiz → "Photo shared by Maya Ruiz", source `fallback`; an author-written text is kept.
    - A `rejected` decision on a `published` post → `removed`, `purge_after` 30 days on, and one `community.post_removed`.
    - **Sequences** (Plan decisions 25 and 26): a published post that gets `approved` (seq 1), `rejected` with `removed_by_operator` (seq 2) and `approved` (seq 3) ends `removed`, with `media_status 'approved'`, `media_decision_seq 3` and exactly one `community.post_removed`; delivering seq 2 again afterwards changes nothing. A pending post rejected as `guidelines` for `unsafe_content` (seq 1), then `approved` (seq 2, an audit sample overturning it) → `published`, `rejection_reason` null and one `community.post_published`. A post rejected as `scan_failed` stays rejected on a later `approved`.
    - The same payload twice → one notification. A decision about a deleted post's media → no change and no error.
  - **`maintenance.test.ts`:** a 25-hour-old draft is gone and its media `deleted`, while a 23-hour-old one stays; a pending post with `scanning` media submitted 25 hours ago → `scan_failed` and a notification; with `in_review` media → unchanged; a removed post whose `purge_after` was yesterday → gone, media deleted, audit `community.post_purged`; `purgeDuePosts(…, 1)` with two due → 1.
- [ ] **Step 2:** Run `pnpm test src/modules/community/lifecycle.test.ts src/modules/community/maintenance.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): premoderation lifecycle and maintenance`.

### Task 10 (W1): Moderation handlers, restrictions, appeals and previews

**Files:**
- Modify: `src/modules/community/moderation.ts`
- Create: `src/modules/community/moderation.test.ts`

**Interfaces:**
- Consumes: the Task 3 handler data (`reviewItemId`, `operatorId`, `note`, and `reason` once SP8 adds it); `openAppeal`; `notify`; `getSetting(db, 'community.suspension_days')`; `getCommunityIdentities`; `lockPost` and `getActiveRestriction`.
- Produces:
  - **`postSubjectHandlers: SubjectHandlers`** for `community_post`. Each parses `data` for `reviewItemId` and `operatorId`; a missing or `deleted` post is a no-op.
    - `approve`: a `hidden` or `removed` post whose `media_status` is `approved` → `published` (clears `removed_at`, `purge_after` and `removal_item_id`), audit `community.post_restored`, notify `community.post_restored`. With any other `media_status` (the media was rejected, Plan decision 25) the post stays as it is and the handler logs `logger.warn('community.restore_without_media', { postId, mediaStatus })`. It never throws, so the item still resolves and spec 4's check is never broken. In any status it deletes the post's `reported` hides.
    - `remove`: a `published` or `hidden` post → `removed`, `removed_at = now`, `purge_after = now + 30 days`, `removal_item_id = reviewItemId`; audit `community.post_removed`; notify `community.post_removed`.
    - `suspend`: as `remove`, then `applyRestriction` with kind `suspended` and `ends_at = now + community.suspension_days`, and notify `community.restricted`.
    - `ban`: every `published` or `hidden` post by the author → `removed` (only the subject post gets `removal_item_id`), `applyRestriction` with kind `banned`, and one `community.restricted` notification, with no `community.post_removed` per post.
    - Whenever `reviewItemId === post.appeal_item_id`, it also notifies `community.appeal_decided` with `outcome: 'restored'` when `approve` restored the post and `'upheld'` otherwise.
  - **`applyRestriction(tx: Tx, i: { userId: string; kind: 'suspended' | 'banned'; reason: string; reviewItemId: string; operatorId: string; now: Date }): Promise<{ restrictionId: string } | null>`** (internal; Plan decision 19): `reason` comes from the decision data as Plan decision 19 says. It returns null when a suspension meets an active ban; otherwise it lifts an active suspension (`lifted_at`, `lifted_by`), inserts the row with `created_by = operatorId`, and records audit `community.restriction_applied`.
  - **`altTextSubjectHandlers`:** `approve` copies `alt_text_pending` into `alt_text` (source `author`) and clears it; `remove` clears it. Both are no-ops without a pending text.
  - **`postPreview(db, postId)`** → `{ mediaId, text: 'Photo by <displayName> · <n> reports', link: '/admin/community/posts/<postId>' }`, with "1 report" in the singular, no count part at 0, and "Photo by a deleted account" without an identity.
  - **`appealRemoval`:**
    - The author's `removed` post, else `notAvailable()` or `conflict(…, { reason: 'not_appealable' })`. `removal_item_id` null → `not_appealable`. `appeal_item_id` set → `conflict(…, { reason: 'already_appealed' })`. Removed more than 30 days ago → `conflict(…, { reason: 'appeal_window_closed' })`.
    - Then `openAppeal(db, { originalItemId: removal_item_id, reason })`, stores `appeal_item_id`, records audit `community.appeal_opened`, and returns `{ appealItemId }`.
  - **`liftRestriction`:** an active restriction, else `notFound()` or `conflict(…, { reason: 'not_active' })` → `lifted_at`, `lifted_by`, and audit `community.restriction_lifted` with `data: { restrictionId, reason }`.

- [ ] **Step 1: Write the failing tests** (two operators from `seedOperator`; items opened through SP4's `report` and decided with `decide`).
  - `remove` → `removed`, `purge_after` 30 days on, `removal_item_id` = the item, and one mandatory `community.post_removed` with its `CommunityNotice` email queued.
  - `approve` on a `hidden` post → `published`, its hides gone, and one `community.post_restored`; `approve` on a `published` post → its hides gone and no notification.
  - `approve` (on a `reports` item) for a post that a media rejection removed (`media_status 'rejected'`) → still `removed`, one `community.restore_without_media` warn, no notification, and `decide` resolves the item without an error. After a later `approved` media event, an `approve` on a new `reports` item (opened through SP4's `report`) → `published`.
  - `suspend` → a restriction ending 30 days on, and `createPost` → 403 `restricted`; a second suspension lifts the first; a suspension during a ban adds nothing.
  - `ban` → `decide` returns `pending_second` and nothing changes. After `approveSecond` by the other operator, all three of the author's published posts are `removed`, a `banned` restriction exists with `created_by` = the first operator, and there is exactly one `community.restricted` notification.
  - **Appeals:** `appealRemoval` → an `appeals` item whose `exclude_operator_ids` contains the deciding operator. A second appeal → 409 `already_appealed`; 31 days after removal → 409 `appeal_window_closed`; a post removed by another post's ban → 409 `not_appealable`. Approving the appeal → `published` and one `community.appeal_decided` with `outcome: 'restored'`; removing it instead → still `removed`, with `outcome: 'upheld'`.
  - **Alt text:** `approve` copies the pending `__flag__` text into `alt_text`; `remove` clears it and keeps the old text.
  - A decision on a deleted post resolves its item without an error.
  - **Preview:** 3 reporters → `Photo by Maya Ruiz · 3 reports`; 1 → `· 1 report`; the link is `/admin/community/posts/<id>`.
  - `liftRestriction` → `getActiveRestriction` returns null and `createPost` works again; lifting twice → 409 `not_active`.
- [ ] **Step 2:** Run `pnpm test src/modules/community/moderation.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): subject handlers, restrictions, appeals and previews`.

### Task 11 (W1): Privacy, retention and stats

**Files:**
- Modify: `src/modules/community/{privacy,stats}.ts`
- Create: `src/modules/community/privacy.test.ts`, `src/modules/community/stats.test.ts`

**Interfaces:**
- Consumes: `deleteMedia` and `getStorage` (media); `Tx` (`@/lib/db`); the type-only `PrivacyHandler`, `RetentionRule`, `PrivacySubject`, `HoldScope` and `EraseResult` from `@/modules/privacy`; `purgeDuePosts` (Task 9).
- Produces:
  - **`exportUserData(db, userId)`** → spec 3's `CommunityExport`: the user's posts except `deleted` (`id`, `status`, `publishedAt`, `altText`, `mediaId`) and their reactions (`postId`, `reaction`, `createdAt`). It holds no other user's id.
  - **`eraseCommunityRows(tx: Tx, userId: string, holds: HoldScope[], now: Date): Promise<EraseResult & { mediaIds: string[] }>`** (internal; Plan decision 15). It runs only SQL in `tx` and never touches storage.
    - With `'all'` in `holds` it deletes nothing and reports each table holding the user's rows as `legal_hold`.
    - With `'reports'` in `holds` it keeps the user's posts that have a `reported` hide or are `hidden` or `removed`, with their hides and reactions, and reports `community_posts` as `legal_hold` (`until: null`).
    - Otherwise, and for every post not held, it hard-deletes the user's posts (their reactions and hides cascade), deletes the user's own reactions, hides and member state, keeps their restrictions, and sets `created_by = null` on announcements they wrote. `mediaIds` lists the deleted posts' media.
    - `retained` adds `{ table: 'community_restrictions', reason: 'safety', until }` when the user has restrictions. `until` is null while a ban is active (not lifted); otherwise it is the latest `coalesce(lifted_at, ends_at)` plus 12 months, as an ISO date.
    - Idempotent: a second run erases 0 and returns the same `retained`.
  - **`eraseUserData(db, d, userId)`** (spec 3): `eraseCommunityRows` in its own transaction with no holds; after the commit, `deleteMedia(db, d.storage, id)` for each of its `mediaIds`. A failed `deleteMedia` is logged and doesn't throw. Its media row is then referenced by nothing, so SP8's media eraser or orphan sweep removes it.
  - **`privacyHandler.exportData(db, s)`:** `{ records: { posts, reactions }, files: <each approved post as { mediaId, name: '<postId>.webp' }> }`. An `org` subject gets empty parts.
  - **`privacyHandler.erase(tx, s, ctx)`:** `eraseCommunityRows(tx, s.userId, ctx.holds, ctx.now)`, returning `{ erased, retained }`. It never calls `deleteMedia` or storage, because SP8's transaction can still roll back. The photos' media rows and objects go in SP8's last-wave `media` step, after this step commits. An `org` subject erases nothing.
  - **`retentionRules`:**
    - `community.removed_photos_30d`, "Removed Community photos are deleted 30 days after removal unless they are restored.": runs `purgeDuePosts` with `getStorage()`.
    - `community.restrictions_12m`, "Community restrictions are deleted 12 months after they end. Bans are kept while they are active.": deletes rows whose `lifted_at` or `ends_at` is more than 12 months past, at most `limit`.
  - **`communityStats(db, since)`:** posts published since, posts removed since, reactions since, distinct authors who submitted since, and restrictions active now.

- [ ] **Step 1: Write the failing tests.**
  - Export for A, who has posts and reactions, has exactly spec 3's keys, and its JSON contains no id of B (B reacted to A's post).
  - After `eraseUserData` for A, A has no posts, reactions, hides or member state; `deleteMedia` (spied) ran once per post, after the commit; A's restriction remains. A second erase returns `erased: 0` and the same `retained`.
  - `privacyHandler.erase` inside a transaction that the test rolls back leaves every row and every storage object in place. Committed, A has no community rows, neither `deleteMedia` nor the storage spy saw a call, and A's media rows are still there for SP8's media step.
  - `holds: ['all']` → nothing deleted. `holds: ['reports']` → A's reported post and A's removed post stay with their hides, A's other posts are erased, and `retained` lists `community_posts` as `legal_hold`. An `org` subject → `erased: 0`.
  - `retained.until`: with an active ban → `null`; with only a suspension lifted on 2026-10-01 → `'2027-10-01'`.
  - **Rules:** a restriction lifted 13 months ago is deleted, while one lifted 11 months ago and an active ban stay; a removed post 31 days old is purged.
  - **Stats:** over seeded data, the five numbers are exact.
- [ ] **Step 2:** Run `pnpm test src/modules/community/privacy.test.ts src/modules/community/stats.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/community`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): privacy handler, retention rules and stats`.

### Task 12 (W2): Post views, access and reads

**Files:**
- Create: `src/modules/community/views.ts`, `src/modules/community/views.test.ts`, `src/modules/community/access.test.ts`
- Modify: `src/modules/community/reads.ts`

**Interfaces:**
- Consumes: SP4's `getBlockSet` and `getCommunityIdentities`; media's `getSignedMediaUrls` and `getMediaUrl`; trust's `listOpenReviewItems` (SP2 Task 4); `getActiveRestriction` and `notAvailable`.
- Produces (`views.ts`, internal):
  - `viewerExclusions(db: DbOrTx, viewerId: string): Promise<{ userIds: string[]; orgIds: string[] }>`: `getBlockSet`'s `userIds`, and its `orgIds ∪ mutedOrgIds`.
  - `visiblePostsSql(viewerId: string, blockedUserIds: string[]): SQL`: spec 8.4's exclusions as one predicate (status `published`, author outside the block set, no hide by the viewer, author without an active ban).
  - `summarizeReactions(db: DbOrTx, postIds: string[], viewerId: string): Promise<Map<string, ReactionSummary>>`: one `group by`; `top` = up to 3 reactions by count, ties in `REACTIONS` order; `mine` = the viewer's.
  - `buildPhotoViews(db: DbOrTx, d: CommunityDeps, viewerId: string, rows: PostRow[]): Promise<PhotoPostView[]>`:
    - drops rows whose author has no identity;
    - avatars through `getMediaUrl(db, d.storage, { userId: viewerId, orgIds: [], isOperator: false }, avatarMediaId, 320)`, null on any error;
    - images through one `getSignedMediaUrls` call (all three widths, 300 s);
    - `alt` = `alt_text`, else `fallbackAlt(displayName)`; `isMine`.
  - `buildOwnPostViews(db: DbOrTx, d: CommunityDeps, authorId: string, rows: PostRow[]): Promise<OwnPostView[]>`: as above plus the status fields; empty `src` strings unless the media is approved (Plan decision 17); the author's identity, else the display name "You"; `canAppeal` = `removed`, `removal_item_id` set, no `appeal_item_id`, removed within 30 days.
- Produces (`reads.ts`, spec signatures):
  - `getPost`: the author gets `OwnPostView` in any status but `deleted`; anyone else gets `PhotoPostView` only through `visiblePostsSql`, else `notAvailable()`.
  - `listOwnPosts`: the author's posts except `draft` and `deleted` (Plan decision 18), `created_at desc, id desc`, 20 per page, cursor kind `mine`.
  - `getAdminPost(db, d, operatorUserId, postId)`: any status but `deleted` (else `notAvailable()`); the images through `getMediaUrl` as an operator, so `in_review` media shows; `authorUserId`; `reporterCount` (the post's `reported` hides); the author's restrictions, newest first; and `openItems` from `listOpenReviewItems` for `community_post` and `community_alt_text` with the post id, and `media` with the media id.

- [ ] **Step 1: Write the failing tests.**
  - **`access.test.ts`** (failure mode 1; `getSignedMediaUrls` spied):
    - For each case (B blocked A; A blocked B; B reported the post; the post is `removed`, `hidden`, `deleted`, `pending_review` or `rejected`; A is banned; A has no identity), `getPost` for B is 404 "This photo isn't available" and the spy never received that media id.
    - A sees their own `pending_review` post with `status`, `mediaStatus 'scanning'` and empty `src` values, and their own `hidden` post with its URLs.
    - The JSON of B's `PhotoPostView` has no key `authorUserId`, `email`, `userId` or `location`.
  - **`views.test.ts`:**
    - Counts of fire 2, love 2, like 1 and wow 1 → `top ['fire', 'love', 'like']` (ties keep `REACTIONS` order).
    - An avatar lookup that throws → `avatarUrl: null`, and the view is still built.
    - `canAppeal`: removed 29 days ago → true; 31 days → false; already appealed → false; `removal_item_id` null → false.
    - `getAdminPost` for a `pending_review` post lists its `media` item in `openItems` and has a non-empty `src`.
    - `listOwnPosts` leaves out drafts, and 25 posts page as 20, then 5.
- [ ] **Step 2:** Run `pnpm test src/modules/community/access.test.ts src/modules/community/views.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): post views, access rules and reads`.

### Task 13 (W2): Reactions

**Files:**
- Modify: `src/modules/community/reactions.ts`
- Create: `src/modules/community/reactions.test.ts`, `src/modules/community/reactions.int.test.ts`

**Interfaces:**
- Consumes: `visiblePostsSql`, `viewerExclusions` and `summarizeReactions` (Task 12); `getActiveRestriction`; `track`.
- Produces: `setReaction(db, viewerId, postId, r)`:
  - A post the viewer can't see → `notAvailable()`. The viewer's own post → `forbidden("You can't react to your own photo", { reason: 'own_post' })`. A restricted viewer → 403 `restricted`.
  - `r` set → `insert … on conflict (post_id, user_id) do update set reaction = excluded.reaction`, then `track('community_reaction_set', { postId, reaction })`. `r` null → delete (nothing to delete is a no-op).
  - Returns the post's summary.

- [ ] **Step 1: Write the failing tests.**
  - B reacts fire → total 1, `mine 'fire'`; love → total 1, `mine 'love'`; null → total 0, `mine null`; null again → total 0 (E4).
  - A on A's own post → 403; on a hidden post → 404; a suspended B → 403.
  - **`reactions.int.test.ts`** (CI Postgres; failure mode 5): 20 concurrent PUTs by one user → 1 row; 10 users each PUT from two concurrent connections → total 10.
- [ ] **Step 2:** Run `pnpm test src/modules/community/reactions.test.ts` and `pnpm typecheck`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit test. Expected: PASS. CI runs the integration file.
- [ ] **Step 5:** Commit: `feat(community): reactions computed from rows`.

### Task 14 (W2): Feed, Photos and the paid mix

**Files:**
- Create: `src/modules/community/feed-plan.ts`, `src/modules/community/feed-plan.test.ts`, `src/modules/community/feed.cap.test.ts`, `src/modules/community/feed.resilience.test.ts`
- Modify: `src/modules/community/feed.ts`

**Interfaces:**
- Consumes: `encodeCursor` and `decodeCursor` (Task 5); `viewerExclusions`, `visiblePostsSql` and `buildPhotoViews` (Task 12); `d.paid.pickFeedItems` and `d.paid.recordFeedServes`.
- Produces:
  - `planFeedPage<O, P>(i: { organic: O[]; hasMore: boolean; paid: P[]; n: number; pageSize: number }): { items: (O | P)[]; organicUsed: number; paidUsed: number; n: number }` and `countSlots(i: { organicAvailable: number; hasMore: boolean; n: number; pageSize: number }): number`, both pure (Plan decision 10):

    ```text
    walk positions 1..pageSize while organic items remain:
      if n == 4:                                   # a slot opportunity
        if a paid item remains and another organic item follows (on this page, or hasMore):
          emit the next paid item
        else:
          emit the next organic item
        n = 0
      else:
        emit the next organic item; n += 1
    countSlots = the number of slots this walk meets when every slot is filled (at most 4)
    ```
  - **`getFeedPage`:**
    - Decodes the cursor with kind `feed` (none → `n 0`, `seen []`).
    - Reads `pageSize + 1` visible posts after `(t, id)` by `published_at desc, id desc`, selecting `published_at::text` for the next cursor (Plan decision 7), and reads again (at most 3 rounds) when rows drop for missing identities.
    - Asks `pickFeedItems` for `countSlots(...)` items with `excludeKeys: seen` and `excludeOrgIds` from `viewerExclusions`, within `PAID_BUDGET_MS` (`Promise.race` with a timer; an error or a timeout logs `logger.warn('community.paid_items_failed', { reason })` and uses `[]`). An answer that arrives after the timer is discarded, and nothing in it is ever recorded (Plan decision 27).
    - Then drops paid items beyond the count, with a key in `seen`, from an org already used on this page, or with an empty label (`logger.warn('community.paid_item_unlabeled', { key })`).
    - Plans the page. When the page holds paid items, it calls `d.paid.recordFeedServes(db, <exactly the paid items planFeedPage placed, in page order>)`. A failure logs `logger.warn('community.paid_serves_failed')`, and the page is still returned. The next cursor holds the last organic post, the new `n`, and `seen` plus the keys shown; `nextCursor` is null when no organic post remains.
  - **`getPhotosPage`:** the same organic query, 30 per page, cursor kind `photos`, never a paid item.

- [ ] **Step 1: Write the failing tests.**
  - **`feed.cap.test.ts`** (failure mode 3):
    - `it('E5: 100 photos and an endless paid source over 5 pages')`: item 1 is organic; every window of 5 consecutive items across the 5 pages holds at most 1 paid item; no paid key repeats; every paid item has a non-empty label. Each page's `recordFeedServes` call (the fake's `served`) holds exactly that page's paid keys, and a page without a paid item makes no call.
    - A property test with a seeded PRNG (mulberry32, 200 cases): organic supply 0–200, paid supply 0–50 or endless, 1–10 pages, a starting `n` of 0–4. The same three checks hold, the last item overall is never paid, and 0 organic posts give 0 paid items.
    - `fakePaidSource({ items: 'endless', ignoreRules: true })` returning 6 items, 2 per org, one labeled `''`: at most `count` are shown, one per org per page, none unlabeled.
    - A cursor with one changed character, or one issued 24 hours and 1 second ago → 400 `invalid_cursor`.
    - The Photos tab over the same data never holds a paid item.
    - **Plan decision 7, microseconds:** 45 posts whose `published_at` differ only in microseconds page through Photos (30 + 15) and the Feed (20 + 20 + 5) as 45 distinct ids in order.
    - **Plan decision 7, a changing Feed** (also Review Focus 1): after page 1, delete the last post of page 1, publish a new post, and have B block one author. Page 2 continues after page 1 with no repeat and no gap among the remaining posts, holds none by the blocked author, and the new post appears only on a fresh page 1.
  - **`feed.resilience.test.ts`** (failure mode 4): a source that throws → an organic-only page; one that sleeps 600 ms → an organic-only page in under 800 ms, and once that source has resolved, its `served` is still empty (Plan decision 27); an author without an identity → their post skipped, and the page still has 20 items when 20 others exist; `getBlockSet`'s org ids and muted org ids reach `excludeOrgIds`.
  - **`feed-plan.test.ts`:** `countSlots({ organicAvailable: 21, hasMore: false, n: 0, pageSize: 20 })` → 4; 4 organic items and nothing more → 0; `planFeedPage` with `n: 3` puts the first paid item at position 2.
- [ ] **Step 2:** Run `pnpm test src/modules/community/feed`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): feed and photos with the 1-in-5 paid mix`.

### Task 15 (W2): Report and block

**Files:**
- Modify: `src/modules/community/safety.ts`
- Create: `src/modules/community/safety.test.ts`

**Interfaces:**
- Consumes: SP4's `report`, `block` and (in tests) `isBlockedBetween`; SP2's `getListingSummaries`; Task 12's visibility; `getSetting(db, 'community.report_hide_threshold')`; `record`.
- Produces:
  - **`reportTarget(db, reporterId, i)`:**
    - `post`: visible to the reporter (else `notAvailable()`) and not their own (403 `own_post`). The author's id is read in this same check, before anything changes. Then, in one transaction:
      - `report(tx, { userId: reporterId }, { subjectType: 'community_post', subjectId, reason, details })`;
      - the hide (`on conflict do nothing`). When the post's `reported` hides reach the threshold and it is `published`, it becomes `hidden` with audit `community.post_hidden`;
      - with `alsoBlock`, SP4's `block(tx, { type: 'user', id: reporterId }, { type: 'user', id: authorUserId }, reporterId)`, using the author id read above. It never calls `blockTarget`, whose visibility check would now fail on the reporter's own hide and return 404 after the report was filed (Review Focus 1).
    - A repeat report of the same post by the same seeker fails the visibility check, because their own hide now hides it. So it is 404 "This photo isn't available", SP4's `report` isn't called again, and the hide count doesn't change.
    - `listing`: `subjectType: 'listing'`. `alsoBlock` blocks the org that `getListingSummaries` returns (an unknown listing → 404).
    - `host_announcement`: `subjectType: 'announcement'`. `alsoBlock` blocks `target.orgId`, and without it throws `badRequest('Choose the host to block', { reason: 'org_required' })` (Plan decision 12).
  - **`blockTarget(db, blockerId, i)`:** `post_author` → the post must be visible to the blocker (else 404) and not theirs (400 `self_block`), then `block(db, { type: 'user', id: blockerId }, { type: 'user', id: authorId }, blockerId)`; `host` → `block(db, { type: 'user', id: blockerId }, { type: 'org', id: orgId }, blockerId)`.

- [ ] **Step 1: Write the failing tests** (E6's core).
  - Three different seekers report one post → `hidden`, with one `community.post_hidden` audit row and a `reports` item with subject `community_post` and the post id. After the first report, the reporter gets 404 from `getPost` while others still see the post.
  - The same seeker reporting the post a second time → 404 "This photo isn't available", SP4's `report` (spied) was called once, and the post's `reported` hide count is still 1.
  - **Report and block** (Review Focus 1): B reports one of A's posts with `alsoBlock: true` → it resolves without an error, SP4's `isBlockedBetween(db, { type: 'user', id: B }, { type: 'user', id: A })` returns `{ blocked: true, byA: true, byB: false }`, and A's other published posts are gone from B's Feed and Photos.
  - B blocks A through `post_author` → A's posts are gone from B's Feed and Photos, and `getPost` for B is 404; A's Feed loses B's posts too.
  - A `host` block → the org id is in the next `pickFeedItems` call's `excludeOrgIds`.
  - A listing report with `alsoBlock` → an org block on the listing's org. A `host_announcement` report with `alsoBlock` and no `orgId` → 400 `org_required`.
  - Reporting your own post → 403; blocking yourself → 400.
- [ ] **Step 2:** Run `pnpm test src/modules/community/safety.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/community`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): report and block from every community surface`.

### Task 16 (W3): Platform announcements and the admin list

**Files:**
- Modify: `src/modules/community/announcements.ts`
- Create: `src/modules/community/announcements.test.ts`

**Interfaces:**
- Consumes: `announcementInput` (Task 4), `encodeCursor`/`decodeCursor`, `record`.
- Produces:
  - **`savePlatformAnnouncement(db, operatorId, i)`:** validates with `announcementInput`'s rules; inserts (source `operator`, `created_by`) or updates by `id` (unknown → 404). In one transaction: `pinned: true` unpins every other row; `archived` unpins this one; the first move to `published` sets `published_at`. Audit `community.announcement_saved` every time, plus `community.announcement_published` or `community.announcement_archived` when the status changes to that.
  - **`updatePlatformAnnouncement(db, operatorId, id, patch)`:** merges the patch over the stored row, then saves as above.
  - **`listPlatformAnnouncements(db, i)`:** every row of either source, with the optional status filter, `starts_at desc, id desc`, 50 per page, cursor kind `admin_announcements`, as `AdminAnnouncementRow`.
  - **`isLiveAnnouncement(row: typeof platformAnnouncements.$inferSelect, now: Date): boolean`** (internal; Tasks 17 and 18 use it): `published`, `starts_at <= now`, and `ends_at` null or after now.

- [ ] **Step 1: Write the failing tests.**
  - An 81-character title, the CTA path `https://x.com`, a label without a path, and `endsAt` before `startsAt` → 400.
  - Pinning B unpins A in the same transaction; archiving a pinned row unpins it.
  - Draft → published sets `published_at` once, and a later save keeps it. The audit actions are `saved`; then `saved` and `published`; then `saved` and `archived`.
  - A PATCH of `{ title }` keeps every other field.
  - The admin list pages 55 rows as 50, then 5, and filters `status: 'draft'`.
- [ ] **Step 2:** Run `pnpm test src/modules/community/announcements.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): platform announcements and the admin list`.

### Task 17 (W3): Announcements tab, unseen dot and status

**Files:**
- Modify: `src/modules/community/{announcements-tab,status}.ts`
- Create: `src/modules/community/announcements-tab.test.ts`, `src/modules/community/status.test.ts`

**Interfaces:**
- Consumes: `isLiveAnnouncement` (Task 16); `d.paid.listRunningAnnouncements` and `d.paid.recordAnnouncementServes`; SP4's `getBlockSet` and `getCommunityIdentities`; `getActiveRestriction`.
- Produces:
  - **`getAnnouncementsPage(db, d, viewerId, cursor)`** (cursor kind `announcements`; Plan decision 22):

    ```text
    page 1 only: the live pinned platform row comes first and counts toward the 20
    platform = live rows other than that pinned row, (starts_at, id) < cursor position, desc, limit 21
    host     = d.paid.listRunningAnnouncements({ viewerUserId, excludeOrgIds: orgIds ∪ mutedOrgIds from getBlockSet,
                 before: the cursor position or null, limit: 21, now }) within PAID_BUDGET_MS; [] on an error or timeout
    merge both by startsAt desc, then id desc, and take items until the page holds 20
    nextCursor = the position of the last item taken, when either source has more
    ```
    Host items become `{ kind: 'host', key: id, label, announcement }`, and an empty label drops the item. After building the page it calls `recordAnnouncementServes(db, <the host ids on the page>)`, whose failure is logged and never thrown.
  - **`getCommunityStatus(db, viewerId)`:** `unseenAnnouncements` = a live platform row with `starts_at > announcements_seen_at` (the epoch without a member row); `restriction` from `getActiveRestriction`; `canPost` = no restriction and the viewer is in `getCommunityIdentities`.
  - **`markAnnouncementsSeen(db, viewerId)`:** upserts `announcements_seen_at = now`.

- [ ] **Step 1: Write the failing tests.**
  - **Tab:**
    - A row that starts tomorrow, an ended row and a draft are absent. The live pinned row is first on page 1 and on no later page.
    - Platform rows at 10:00 and 08:00 and host items at 09:00 and 07:00 → 10:00, 09:00, 08:00, 07:00.
    - 45 items page as 20, 20 and 5 with no repeat.
    - The fake's `list` call has `excludeOrgIds` holding a blocked org and a muted org.
    - A failing host source → platform items only and one warn. `recordAnnouncementServes` got exactly the host ids on the page.
  - **Status:** a live row newer than `announcements_seen_at` → `unseenAnnouncements: true`, and after `markAnnouncementsSeen`, false; a running paid item never sets it; an unnamed seeker → `canPost: false, restriction: null`; a suspension → `canPost: false` and its `endsAt`.
- [ ] **Step 2:** Run `pnpm test src/modules/community/announcements-tab.test.ts src/modules/community/status.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): announcements tab, unseen dot and status`.

### Task 18 (W3): Automated announcements

**Files:**
- Modify: `src/modules/community/auto-announcements.ts`
- Create: `src/modules/community/auto-announcements.test.ts`

**Interfaces:**
- Consumes: `getSetting` for `community.season_announcements` and `community.roundup_min_new_listings`; SP3's `countNewListings(db, { since })`; `record`.
- Produces:
  - **`runSeasonAnnouncements(db, now)`:** for each setting entry whose `monthDay` is today's UTC `MM-DD`, inserts a published `automated` row (on conflict on `auto_key`, nothing): title "Summer hiring is open" (the season capitalized), body "Hosts are posting summer jobs now, and some include housing and meals.", CTA "See summer jobs" to `/seasons/summer`, `starts_at = now`, `ends_at = now + 30 days`, `auto_key = season:<season>:<UTC year>`; audit `community.announcement_published` (actor `system`).
  - **`runWeeklyRoundup(db, now)`** (Plan decision 29), in one transaction:
    - When a row with `auto_key = roundup:<isoWeekKey(now)>` already exists, in any status, it returns `{ published: false }` and changes nothing (an outbox retry or a second run in the same ISO week).
    - Otherwise `countNewListings({ since: now − 7 days })`. Below the setting → `{ published: false }`.
    - Otherwise it archives every published row whose `auto_key` starts with `roundup:` and isn't this week's. Then it inserts, with `on conflict (auto_key) do nothing`, title "New this week on Explore&Earn", body "{N} new jobs from {M} hosts. {H} of them include housing.", CTA "See new jobs" to `/?sort=newest`, a 7-day run and `auto_key = roundup:<isoWeekKey(now)>`, and returns `{ published: true }`. With M = 1 the text says "from 1 host"; with H = 1, "1 of them includes housing."; with H = 0 the second sentence is left out.
  - **`isoWeekKey(d)`:** the ISO 8601 week-year and week, `YYYY-Www`.

- [ ] **Step 1: Write the failing tests.**
  - At 2027-02-01T14:00Z → one summer row with the exact title, body and CTA, `auto_key 'season:summer:2027'`, ending 2027-03-03T14:00Z; a second run the same day leaves one row. 2027-09-01 → "Winter hiring is open" with `/seasons/winter`. 2027-02-02 → none.
  - **Roundup:** 9 new listings → none. 10 from 4 hosts, 3 with housing → body "10 new jobs from 4 hosts. 3 of them include housing.", and last week's roundup is `archived`. 12 from 1 host, 0 with housing → "12 new jobs from 1 host." With H = 1 the body ends "1 of them includes housing."
  - **Two runs on the same Monday:** the second returns `{ published: false }`, and the table holds one published roundup with this week's `auto_key` and last week's roundup `archived`.
  - **Plan decision 29:** `isoWeekKey(new Date('2026-12-28T15:00:00Z')) === '2026-W53'`, `isoWeekKey(new Date('2027-01-03T15:00:00Z')) === '2026-W53'`, and `isoWeekKey(new Date('2027-01-04T15:00:00Z')) === '2027-W01'`.
- [ ] **Step 2:** Run `pnpm test src/modules/community/auto-announcements.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/community`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community): season announcements and the weekly roundup`.

### Task 19 (W4): OverflowMenu, TabNav, PaidItemFrame and the platform AnnouncementCard

**Files:**
- Create: `src/ui/patterns/{OverflowMenu,TabNav,PaidItemFrame}.tsx`, `src/ui/patterns/community-frames.test.tsx`, `src/app/design-system/patterns/{overflow-menu,tab-nav,paid-item-frame,announcement-card-platform}/page.tsx`
- Modify: `src/ui/patterns/AnnouncementCard.tsx` and its test (SP6's)

**Interfaces:**
- Produces (props only; no module imports):
  - `OverflowMenu({ label: string; items: { key: string; label: string; onSelect(): void; tone?: 'default' | 'danger' }[]; align?: 'start' | 'end' })`: an `IconButton` (`MoreHorizontal` from `src/ui/icons`) with `aria-label={label}`, `aria-expanded` and `aria-controls`, opening a Radix Popover that holds a list of real `<button>`s. Opening focuses the first item; ArrowDown and ArrowUp move between items, wrapping; Escape closes and returns focus to the trigger; Tab closes.
  - `TabNav({ label: string; items: { href: string; label: string; current: boolean; dot?: string }[] })`: `<nav aria-label={label}>` with links styled like `Tabs`, `aria-current="page"` on the current one, 44 px targets. `dot` draws a dot with that text for screen readers ("New announcements").
  - `PaidItemFrame({ label: string; hostName: string; menuLabel: string; menu: OverflowMenuProps['items']; posinset?: number; setsize?: number; children: ReactNode })`: an `<article>` named `` `${label} from ${hostName}` `` with `aria-posinset` and `aria-setsize`, the `OverflowMenu` in its top corner, and `children`. It draws no label of its own (Plan decision 11).
  - `AnnouncementCard` gains `variant: 'platform'` as a new member of its props union, inside SP6's one variant switch; SP6's `community` and `host_page` props stay as SP6 wrote them: `{ variant: 'platform'; title: string; body: string; category: Category | null; cta: { label: string; href: string } | null; headingAs?: 'h2' | 'h3' }`. It shows "Explore&Earn" as the source line, a `CategoryBadge` when `category` is set, the title, the body as plain text and the CTA as a `Button` link, with no `Badge` label and no `OrgLogo`.

- [ ] **Step 1: Write the failing tests.**
  - **OverflowMenu**, keyboard only: Enter opens it with focus on item 1, ArrowDown moves to item 2, and Enter calls its `onSelect`; Escape returns focus to the trigger; the trigger has `aria-expanded="true"` while open.
  - **TabNav:** the current link has `aria-current="page"`, and a `dot` renders its text for screen readers.
  - **PaidItemFrame:** `getByRole('article', { name: 'Paid announcement from Kettle Ridge Lodge' })` exists, its children render, and the frame itself adds no "Paid announcement" text.
  - **Platform card:** shows "Explore&Earn", the title, the body and a link "See summer jobs" to `/seasons/summer`, and no "Paid announcement" text; `category: 'seasonal'` shows the Seasonal badge. SP6's `community` variant tests still pass.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns`. Expected: FAIL.
- [ ] **Step 3:** Implement, with the gallery pages in light and dark.
- [ ] **Step 4:** Run `pnpm test src/ui/patterns` and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): overflow menu, tab nav, paid item frame and platform announcement card`.

### Task 20 (W4): PhotoPost and PhotoGrid

**Files:**
- Create: `src/ui/patterns/{PhotoPost,PhotoGrid}.tsx`, `src/ui/patterns/photo-patterns.test.tsx`, `src/app/design-system/patterns/{photo-post,photo-grid}/page.tsx`

**Interfaces:**
- Produces:
  - `PhotoPost({ author: { name: string; avatarSrc: string | null }; timeLabel: string; dateTime: string; image: { src: Record<320 | 640 | 1280, string>; width: number; height: number; alt: string }; href?: string; sizes?: string; reaction: ReactNode; menu: OverflowMenuProps | null; posinset?: number; setsize?: number; onImageError?(): void; placeholder?: ReactNode })`:
    - an `<article>` named `` `Photo by ${name}` ``, with `Avatar` (initials without a src), the name and `<time dateTime={dateTime}>{timeLabel}</time>`;
    - the image as `Img` with `srcSet` "<320> 320w, <640> 640w, <1280> 1280w", `sizes` defaulting to `(min-width: 768px) 600px, 100vw`, `width` and `height` set, wrapped in a link to `href` when given;
    - then the `reaction` slot and the menu. An empty `src[640]` renders `placeholder` instead of the image. Full-bleed under 768 px.
  - `PhotoGrid({ items: { id: string; href: string; src: string; alt: string }[]; onImageError?(id: string): void })`: a `<ul>` grid with 3 columns under 768 px and 4 above, at most 960 px wide; each item is a link around a square-cropped `Img` with the item's alt.

- [ ] **Step 1: Write the failing tests.**
  - PhotoPost renders an `img` with alt "Sunset over the dock", a `srcset` containing `320w`, `640w` and `1280w`, and `width="1200"`; "MR" initials without an avatar; a `time` element with `datetime`; `onImageError` fires on the image's error event; an empty src renders the placeholder and no `img`.
  - PhotoGrid renders one link per item with its image's alt, and 3 items give 3 `li`.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/photo-patterns.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement, with the gallery pages.
- [ ] **Step 4:** Run the test and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): photo post and photo grid`.

### Task 21 (W4): ReactionButton

**Files:**
- Create: `src/ui/patterns/ReactionButton.tsx`, `src/ui/patterns/ReactionButton.test.tsx`, `src/app/design-system/patterns/reaction-button/page.tsx`

**Interfaces:**
- Produces: `ReactionButton({ reactions: readonly { key: string; emoji: string; label: string }[]; defaultKey: string; mine: string | null; total: number; top: string[]; onChange(next: string | null): void; readOnly?: boolean; disabled?: boolean })`, per spec section 7:
  - A tap, Enter or Space applies `defaultKey`, or removes `mine` when it's set.
  - A 400 ms press-and-hold, a 300 ms mouse hover, or ArrowUp while focused opens the picker; releasing a hold that opened it doesn't also tap.
  - The picker is a `role="radiogroup"` named "Choose a reaction" of 44 px `role="radio"` buttons (`aria-checked`, roving `tabIndex`), moved through with the arrow keys. Enter or Space selects (`onChange(key)`) and closes; Escape closes; either way focus returns to the button.
  - The button has `aria-haspopup="true"`, `aria-expanded`, and `aria-label` "React, current reaction Love, 24 reactions"; without `mine`, "React, 24 reactions"; in the singular, "React, 1 reaction".
  - The count shows the `top` emoji (`aria-hidden`) and the total. `readOnly` renders only the count, read as "24 reactions", with no button.
  - Animations use `motion-safe:` classes only.

- [ ] **Step 1: Write the failing tests.**
  - Enter with `mine: null` → `onChange('like')`; with `mine: 'love'` → `onChange(null)`.
  - ArrowUp opens the radiogroup with focus on the checked radio (or the first). From Fire, ArrowRight twice, then Enter → `onChange('like')`, and focus is back on the button. Escape closes it with no change.
  - With fake timers: a 400 ms touch hold opens the picker and its release calls no `onChange`; a 300 ms mouse hover opens it; 299 ms doesn't.
  - Labels: `mine 'love'` with total 24 → "React, current reaction Love, 24 reactions"; total 1 without `mine` → "React, 1 reaction".
  - `readOnly` renders no button and reads "24 reactions".
  - Every animation class in the rendered tree starts with `motion-safe:`.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/ReactionButton.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement, with the gallery page (every state, light and dark).
- [ ] **Step 4:** Run the test and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): reaction button with a keyboard picker`.

---

## Phase B2: Screens (W5 and W6 in parallel; based on B1 merged)

Pages are server components. Seeker pages read the viewer with SP3's `getPageViewer()` and call `@/modules/community` with `getDb()` and `getCommunityDeps()`; console pages call their guard first. Client components change state only through `/api/v1/community/*` with SP4's `apiFetch`. Screens use only `src/ui` components and W4's patterns, and follow spec section 7's row for their components, states and mobile and desktop layout. Each e2e file runs `AxeBuilder` at 390 px and 1280 px in light and dark and expects 0 serious or critical violations.

### Task 22 (W5): Community shell, guest and host states, and the TopBar dot

**Files:**
- Create: `src/app/(seeker)/community/layout.tsx`, `src/app/(seeker)/community/@modal/default.tsx`, `src/app/(seeker)/community/_components/{community-header,community-tabs,guest-state,not-for-seekers}.tsx`, `src/app/(seeker)/community/_components/{api,format}.ts`, `_components/format.test.ts`, `src/app/(seeker)/_components/community-nav-button.test.tsx`, the shell part of `tests/e2e/sp7-community-screens.spec.ts`
- Modify: `src/app/(seeker)/_components/community-nav-button.tsx` (fills the W0 stub)

**Interfaces:**
- Consumes: `getPageViewer`, `getCommunityStatus`, `TabNav`, `EmptyState`, `Button`, `IconButton`, `apiFetch`, `COMMUNITY_SEEN_EVENT`, `formatDay`.
- Produces:
  - **Layout:** `export const metadata = { robots: { index: false, follow: false } }`. A guest gets `GuestState` (spec 7's `EmptyState` with a "Sign in" `Button` to `/sign-in?redirect_url=<the current path>`). A host gets `NotForSeekers` linking to `/host`, and an operator gets it linking to the console. A seeker gets:
    - `CommunityHeader`: the h1 "Community", a "Post a photo" `Button` on desktop or an `IconButton` labeled "Post a photo" on mobile, both to `/community/new`, and a "Your photos" link to `/community/mine`;
    - `CommunityTabs`: a `TabNav` labeled "Community" with Feed (`/community`), Photos (`/community/photos`) and Announcements (`/community/announcements`, with the dot from `getCommunityStatus`);
    - then `{children}` and the `{modal}` slot.
  - **`api.ts`:** typed `apiFetch` wrappers for every `/api/v1/community/*` route: `fetchFeed(cursor)`, `fetchPhotos`, `fetchAnnouncements`, `fetchPost(id)`, `fetchMine`, `fetchStatus`, `react(id, r | null)`, `report(input)`, `blockAuthor(postId)`, `blockHost(orgId)`, `createPost`, `submitPost`, `patchAltText`, `deletePost`, `appeal`, `markSeen`.
  - **`format.ts`:** `relativeTime(iso: string, now: Date): string` → "Just now" under a minute, "5 min ago", "3 h ago", "2 d ago" under 7 days, else `formatDay`.
  - **`CommunityNavButton({ seeker: boolean })`:** for a seeker, one `fetchStatus()` on mount. While `unseenAnnouncements`, it shows the dot and is named "Community, new announcements" instead of "Community". The window event `COMMUNITY_SEEN_EVENT` clears it.

- [ ] **Step 1: Write the failing tests.**
  - `relativeTime` at 30 seconds, 5 minutes, 3 hours, 2 days and 8 days.
  - **Nav button:** with a mocked status of `unseenAnnouncements: true`, the link is named "Community, new announcements"; after `COMMUNITY_SEEN_EVENT`, "Community"; with `seeker: false` there is no fetch.
  - **E2E:**
    - A guest on `/community`, `/community/photos` and `/community/posts/<id>` sees "See where the work takes people", and "Sign in" brings them back to the same route.
    - A host sees "Community is for seekers" with a link to `/host`.
    - Every `/community` response has `X-Robots-Tag: noindex, nofollow` and `<meta name="robots" content="noindex, nofollow">`.
    - At 390 px on `/community`, the BottomNav is visible and none of its items has `aria-current`; the Feed tab link has `aria-current="page"`.
    - Axe passes.
- [ ] **Step 2:** Run `pnpm test "src/app/(seeker)"` and `pnpm e2e tests/e2e/sp7-community-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community-ui): community shell, guest and host states, nav dot`.

### Task 23 (W5): Feed and Photos screens

**Files:**
- Create (replacing the placeholder `page.tsx`): `src/app/(seeker)/community/page.tsx`, `src/app/(seeker)/community/photos/page.tsx`, `_components/{feed-list,photos-list,use-paged-list,post-card,paid-item,why-dialog}.tsx`, `_components/feed-list.test.tsx`, the Feed part of the e2e file

**Interfaces:**
- Consumes: `getFeedPage`, `getPhotosPage`, `PhotoPost`, `PhotoGrid`, `ReactionButton`, `PaidItemFrame`, `OverflowMenu`, SP3's `DiscoveryCard`, SP6's `AnnouncementCard`, `REACTIONS`, `DEFAULT_REACTION`, `whyBoosted`, `whyAnnouncement`, `trackClient`.
- Produces:
  - `usePagedList<T>(i: { initial: Page<T>; fetchPage(cursor: string): Promise<Page<T>>; key(item: T): string }): { items: T[]; status: 'idle' | 'loading' | 'error' | 'done'; loadMore(): Promise<void>; retry(): void; restart(): void; sentinelRef: RefCallback<Element> }`: an IntersectionObserver on the sentinel loads the next page; items are deduplicated by key; a 400 with `details === 'invalid_cursor'` calls `restart()`, which loads page 1 again and replaces the list.
  - **Feed page:** the server calls `getFeedPage(getDb(), getCommunityDeps(), viewer.seekerId, null)` and renders `FeedList`: a `role="feed"` list (`aria-busy` while loading) of `PostCard` and `PaidItem`, each with `aria-posinset` and `aria-setsize={-1}`, followed by a "Load more" `Button` for keyboard users. States per spec 7: 3 `Skeleton` posts, `EmptyState` "No photos yet" with its body, `ErrorState` with Retry, and "You're all caught up".
  - **`PostCard({ post: PhotoPostView })`:** `PhotoPost` with `relativeTime` and `href=/community/posts/<id>`, and a `ReactionButton` fed from `REACTIONS` and `DEFAULT_REACTION` with an optimistic update that rolls back on an error (`readOnly` on your own posts). On an image error it refetches the post once and swaps in the new URLs. Task 24 completes its menu.
  - **`PaidItem({ item: CommunityPaidItem; surface: 'feed' | 'announcements_tab' })`:** `PaidItemFrame` around SP3's `DiscoveryCard` (`source: 'boost'`, the card as given, so `JobCard` shows "Boosted") or SP6's `AnnouncementCard variant="community"`, with its props built from the `AnnouncementCardData` (`org: { name: orgName, logoSrc: orgLogoUrl, href: '/hosts/<orgSlug>' }`, `image`, `cta: { label: ctaLabel, href: announcementOpenHref(id, surface) }`, `endsLabel: formatPromoteDate(endsAt)`, all from `@/lib/promote`), so the CTA goes through SP6's click route. Opening either calls `trackClient('community_paid_item_opened', { key, kind })`. The menu has "Why am I seeing this?" (a `WhyDialog` with `whyBoosted(host)` or `whyAnnouncement(host)`), plus Report and Block <host> (Task 24).
  - **Photos page:** `getPhotosPage` → `PhotosList`, a `PhotoGrid` of the 320 px variants linking to the post viewer, with the same paging, the same one-time refetch on an image error, and the same states ("No photos yet").

- [ ] **Step 1: Write the failing tests.**
  - **`feed-list.test.tsx`:**
    - `it('E5: every paid item renders its label')`: a page of 16 posts and 4 paid items (2 boosted jobs, 2 announcements) → each paid `article` contains its label text.
    - Reacting calls `react` and shows the new count before the response; a 403 rolls it back.
    - A mocked `invalid_cursor` error on "Load more" restarts from page 1.
  - **E2E:** with 25 seeded photos the Feed shows 20; scrolling, and separately "Load more" by keyboard, shows 25 and "You're all caught up". With no photos: "No photos yet". Photos shows a grid whose images carry their alt text and open the viewer. Axe passes.
- [ ] **Step 2:** Run `pnpm test "src/app/(seeker)/community"` and the e2e file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community-ui): feed and photos`.

### Task 24 (W5): Post viewer and post actions

**Files:**
- Create: `src/app/(seeker)/community/posts/[id]/page.tsx`, `src/app/(seeker)/community/@modal/(.)posts/[id]/page.tsx`, `_components/{post-viewer,post-menu,report-sheet,block-dialog,edit-description-dialog,delete-dialog}.tsx`, `_components/post-actions.test.tsx`, the viewer part of the e2e file
- Modify: `_components/{post-card,paid-item}.tsx` (wires their menus)

**Interfaces:**
- Consumes: `getPost`, SP4's `REPORT_REASON_LABELS` and `REPORT_THANKS`, `Dialog`, `Sheet`, `RadioGroup`, `Textarea`, `Checkbox`.
- Produces:
  - `PostViewer({ post: PhotoPostView | OwnPostView; mode: 'page' | 'dialog' })`: the 1280 px image, the author, the time, `ReactionButton` and the menu. `dialog` wraps it in a `Dialog` over the tab (the intercepted route); `page` renders it full screen. A 404 renders `EmptyState` "This photo isn't available".
  - `postMenuItems(post)`: others → "Report", "Block <name>"; the author → "Edit description", "Delete".
  - `ReportSheet({ target: CommunityReportTarget; blockName: string; onDone(): void })`: a `Sheet` with SP4's `REPORT_REASON_LABELS` as a `RadioGroup`, a details `Textarea` (≤ 1000, with a counter), a `Checkbox` "Also block <name>", and Submit → `report(...)`. Success shows `REPORT_THANKS` and removes the post from the list in place; a 429 shows "You've sent a lot of reports today. Try again tomorrow."
  - `BlockDialog({ kind: 'post_author' | 'host'; name: string; id: string; onBlocked(): void })`: "Block <name>?", with a body line saying you won't see their photos (author) or their jobs and announcements (host), and that they won't be told. Confirming calls `blockAuthor` or `blockHost`, then removes every item by that author or org from the list.
  - `EditDescriptionDialog`: a `Textarea` labeled "Description for people who use screen readers", 250 at most with a counter → `patchAltText`. A 400 `alt_text_rejected` shows its message; `pending: true` shows "Thanks. Your new description is in review, and the current one stays until then."
  - `DeleteDialog`: "Delete this photo?" with "It's removed from Community right away. This can't be undone." → `deletePost`, then back to the list or `/community/mine`.

- [ ] **Step 1: Write the failing tests.**
  - **Report:** Submit is disabled until a reason is chosen; it sends `{ target: { kind: 'post', postId }, reason: 'spam', alsoBlock: true }`; for a paid announcement the target carries `orgId`.
  - **Block:** confirming removes both of the author's cards from a list of 3.
  - **Edit:** a mocked 400 shows "That description can't be used. Try describing what's in the photo."
  - **E2E:** opening a post from the Feed shows a dialog with the URL `/community/posts/<id>`; a reload shows the full page; Escape closes the dialog back to the Feed; a deleted post shows "This photo isn't available". Axe passes on both.
- [ ] **Step 2:** Run `pnpm test "src/app/(seeker)/community"` and the e2e file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community-ui): post viewer, report, block, edit and delete`.

### Task 25 (W5): Compose

**Files:**
- Create: `src/app/(seeker)/community/new/page.tsx`, `src/app/(seeker)/community/@modal/(.)new/page.tsx`, `_components/compose.tsx`, `_components/upload.ts`, `_components/compose.test.tsx`, the compose part of the e2e file

**Interfaces:**
- Consumes: `getCommunityStatus`, the Task 22 `api.ts` wrappers, `POST /api/v1/media/uploads/{id}/complete`, `UPLOAD_ACCEPT`, `UPLOAD_MAX_BYTES`, `COMPOSE_POLL_MS`, `COMPOSE_POLL_LIMIT_MS`, `REJECTION_LINES`, `COMMUNITY_GUIDELINES_PATH`.
- Produces:
  - `uploadToSignedUrl(url: string, file: Blob): Promise<void>`: a `PUT` of the file with its `content-type`; throws on a non-2xx response.
  - `Compose({ status: CommunityStatus })`, per spec 7's `/community/new` row:
    - **Blocked:** a restriction shows "You can't post in Community until <formatDay>." or "You can't post in Community."; `canPost` false without a restriction shows "Add your name to your profile to post" with a link to `/profile`.
    - **Step 1:** a file `Input` with `accept` = `UPLOAD_ACCEPT` and a client check of ≤ 15 MB ("Choose a photo under 15 MB"), then `createPost` (a 409 `daily_cap` shows its message), `uploadToSignedUrl` and the complete call.
    - **Step 2:** the local preview (an object URL) with a `Skeleton` and "Checking your photo", polling `fetchPost` every 2 s for up to 60 s. `mediaStatus 'approved'` → step 3. `in_review` → step 3, with the in-review line shown after Post. `rejected` → `ErrorState` "This photo can't be posted" with `REJECTION_LINES[reason]`, the guidelines link for `guidelines` only, and "Choose another photo". After 60 s: "Still checking. We'll let you know when it's live.", with Post still offered.
    - **Step 3:** a `Textarea` "Description for people who use screen readers", prefilled with the post's alt text, 250 at most with a counter, and "Post" → `submitPost({ altText })`. `published` → the post viewer; `pending_review` → "Your photo needs a quick review. We'll post it as soon as it's approved."; a 400 shows its message in place.
    - Full screen under 768 px; above it, a `Sheet` (side panel) over the Feed through the intercepted route.

- [ ] **Step 1: Write the failing tests.**
  - A 16 MB file is refused before any request.
  - With the API mocked: an approved photo → the textarea holds "Test image"; editing it to "Boat at the dock" and pressing Post sends exactly that text. A 409 `daily_cap` shows "You've shared 10 photos today. You can post again tomorrow." A `scan_failed` rejection shows its line and no guidelines link. 31 polls without a decision show the slow-scan line (fake timers).
  - **E2E:** a `makeCommunityJpeg({ seed })` photo posts and appears at the top of the Feed; a `__flag__` JPEG shows the in-review line. Axe passes at each step.
- [ ] **Step 2:** Run `pnpm test "src/app/(seeker)/community"` and the e2e file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community-ui): compose with checks, alt text and review states`.

### Task 26 (W5): Announcements tab and Your photos

**Files:**
- Create: `src/app/(seeker)/community/announcements/page.tsx`, `src/app/(seeker)/community/mine/page.tsx`, `_components/{announcements-list,mine-list,appeal-dialog}.tsx`, `_components/mine-list.test.tsx`, the matching part of the e2e file

**Interfaces:**
- Consumes: `getAnnouncementsPage`, `listOwnPosts`, `AnnouncementCard`, `PaidItem` (Task 23), `usePagedList`, `ownPostPill`, `Pill`, `COMMUNITY_SEEN_EVENT`.
- Produces:
  - **Announcements page:** `getAnnouncementsPage` → `AnnouncementsList`, paged like the Feed: `AnnouncementCard variant="platform"` for platform items (CTA to `cta.path`) and `PaidItem` with `surface: 'announcements_tab'` for host items. On mount it calls `markSeen()` once and dispatches `COMMUNITY_SEEN_EVENT`. Empty: "No announcements right now". One column on mobile; a 600 px column on desktop.
  - **Your photos:** `listOwnPosts` → `MineList`: rows with the photo (or a placeholder), a `Pill` from `ownPostPill`, and the actions Edit description, Delete, and Appeal when `canAppeal`. Empty: "You haven't shared any photos yet" with "Post a photo". A list on mobile; a two-column list on desktop.
  - **`AppealDialog`:** a `Textarea` (10–1000 characters) labeled "Tell us why this photo should be back in Community" → `appeal`. Success shows "We'll review your appeal and let you know." and the Appeal action disappears.

- [ ] **Step 1: Write the failing tests.**
  - **`mine-list.test.tsx`:** six posts render the six `ownPostPill` labels; Appeal shows only when `canAppeal`; a 9-character reason keeps Submit disabled.
  - **E2E:** after a platform announcement is published (inserted with `dbRows`), the TopBar Community control is named "Community, new announcements"; opening Announcements clears it; the pinned announcement comes first. Axe passes.
- [ ] **Step 2:** Run `pnpm test "src/app/(seeker)/community"` and the e2e file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(community-ui): announcements tab and your photos`.

### Task 27 (W6): Announcement editor

**Files:**
- Create: `src/app/admin/community/announcements/page.tsx`, `src/app/admin/community/announcements/_components/{announcement-table,announcement-editor}.tsx`, `_components/announcement-editor.test.tsx`, `src/app/admin/content/announcements/page.tsx`, `tests/e2e/sp7-console.spec.ts` (the editor part)

**Interfaces:**
- Consumes: `requireOperator`, `listPlatformAnnouncements`, the admin announcement routes, `AnnouncementCard variant="platform"`, `Sheet`, `Input`, `Textarea`, `Select`, `Switch`, `Pill`.
- Produces:
  - **Page:** `requireOperator()`, then `listPlatformAnnouncements` → a table (title, status `Pill`, source, a window such as "Nov 3 – Dec 3, 2026", pinned) with a status filter and "New announcement". Empty: "No announcements yet".
  - **Editor `Sheet`:** `Input` title (80, with a counter), `Textarea` body (600, with a counter), CTA label (24) and path, `Select` category (none, Maritime, Seasonal, Farm, Remote), `Switch` pinned, start and end (`datetime-local`, sent as ISO), and Buttons "Save draft", "Publish" and "Archive" (each sets `status`), beside a live `AnnouncementCard variant="platform"` preview. POST creates and PATCH updates; a 400 shows each issue under its field.
  - **`/admin/content/announcements`:** `redirect('/admin/community/announcements')` (Plan decision 14).

- [ ] **Step 1: Write the failing tests.**
  - **Editor:** typing a title updates the preview; a CTA path starting `https://` shows the API's field error; Publish sends `status: 'published'`.
  - **E2E:** an operator creates, publishes and pins an announcement, and the table shows it pinned; `/admin/content/announcements` lands on the editor. Axe passes.
- [ ] **Step 2:** Run `pnpm test src/app/admin/community` and `pnpm e2e tests/e2e/sp7-console.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run both. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(console): community announcement editor`.

### Task 28 (W6): Post review page

**Files:**
- Create: `src/app/admin/community/posts/[id]/page.tsx`, `src/app/admin/community/posts/[id]/_components/{post-review,lift-dialog}.tsx`, the review part of `tests/e2e/sp7-console.spec.ts`

**Interfaces:**
- Consumes: `requireOperatorForQueues`, `getAdminPost`, Foundation's console `decide` server action in `src/app/admin/actions.ts`, the lift route.
- Produces:
  - **Page:** `requireOperatorForQueues(['moderation', 'reports'])`, then `getAdminPost` → the image, the author's name, a status `Pill`, the reporter count and the restriction history (kind, reason, window, lifted). For each open item: its queue, its reason, and the decisions its subject allows (`community_post`: Approve, Remove, Suspend, Ban; `community_alt_text` and `media`: Approve, Remove) through the console `decide` action. A ban shows the pending second sign-off that `decide` returns.
  - **Lift:** "Lift restriction" on an active restriction opens `LiftDialog` (reason, 10–1000 characters) → the lift route. A 403 `reverification_required` starts Clerk reverification, then retries.

- [ ] **Step 1: Write the failing tests** (e2e).
  - A post with 3 reports shows "3" and its `reports` item; Remove → the status reads Removed; Suspend → the restriction appears; Lift, after reverification → it shows as lifted.
  - An operator covering only `fraud` gets 403.
  - Axe passes.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp7-console.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(console): community post review page`.

---

## Phase C: Integration (W7)

### Task 29 (W7): Cross-module proofs and wiring

**Files:**
- Create: `tests/sp7/cross-module.test.ts`, `tests/sp7/wiring.test.ts`
- Modify: any module, for integration fixes only (migrations in 6900–6999)

**Interfaces:**
- Consumes: every real module, the real `paidItemSource`, and `runWorker` with the default handlers.

- [ ] **Step 1: Write the failing tests.**
  - **Report to appeal**, on real SP4: three seekers report a post → `hidden`. `decide(remove)` by opA → `removed` and `community.post_removed`. `appealRemoval` → an `appeals` item not assigned to opA. `decide(approve)` by opB → `published` and `community.appeal_decided`.
  - **Ban** with two operators: `pending_second`, then `approveSecond` → every post by the author is removed, and another seeker's `getFeedPage` has none of them.
  - **Media in review** (E2's core): a `__flag__` JPEG uploaded through `requestUpload`, `completeUpload` and the real scan; its `media` item approved with `decide`; after the worker drains, the post is `published` and the author has `community.post_published`.
  - **The real adapter in the Feed:** with 24 published posts and three boosts from three orgs seeded in SP6 (paid delivery enabled), page 1 has paid items at positions 5, 10 and 15, each labeled "Boosted"; position 20 is a photo; and the `feed` served counts in `boost_daily_stats` rose by exactly 3.
  - **Privacy:** when SP8's privacy registry exists, running its eraser for a seeker leaves only their community restrictions, and no storage object of their photos. With a `reports` hold, their reported post and its media row both remain, and the run doesn't fail on the `media_id` foreign key.
  - **`wiring.test.ts`:** importing only `src/app/api/v1/community/reports/route.ts` (guards mocked), a POST about a seeded post returns `{ ok: true }`, proving the `community_post` report subject registers on a cold route. In a fresh module graph, `findSubjectHandler('community_post', 'approve')` resolves through `@/server/job-handlers`.
- [ ] **Step 2:** Run `pnpm test tests/sp7`. Expected: FAIL until the modules are wired together.
- [ ] **Step 3:** Fix the integration gaps.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp7): cross-module proofs for moderation, appeals, paid mix and wiring`.

### Task 30 (W7): Exit-criteria e2e and the accessibility sweep

**Files:**
- Create: `tests/e2e/sp7-exit.spec.ts`, `docs/runbooks/sp7-community-setup.md`
- Modify: `tests/e2e/helpers/sp7.ts` (adds `seedBoosts` and `seedHostAnnouncement`, through SP6's own e2e helper if it has one, else its tables)

**Interfaces:**
- Consumes: the Task 6 e2e helpers, `makeCommunityJpeg`, `CHILD_SAFETY_FIXTURE_PATH`.

- [ ] **Step 1: Write the failing e2e tests** (on `pnpm db:local` with the stub providers).
  - **E1:** seeker A posts a `makeCommunityJpeg({ seed })` photo at `/community/new` through the UI, sees "Test image" in the description, changes it to "Boat at the dock" and posts. Seeker B sees it in Feed and Photos with that alt text, and a `request.get` of its image's `currentSrc` returns 200.
  - **E2:** A posts a `__flag__` JPEG and sees "Your photo needs a quick review. We'll post it as soon as it's approved."; B's Feed doesn't have it and B's `GET /api/v1/community/posts/<id>` is 404. An operator approves the media item at the console queue item page; after `drainJobs`, B sees it and A has a `community.post_published` notification row.
  - **E3:** a `__block__` JPEG ends in the compose rejected state and appears in nobody's Feed or Photos. The child-safety fixture leaves the post `rejected`, with zero notification rows for A about it and one open `child_safety` review item (`dbRows`).
  - **E4:** B reacts Fire through the picker, switches to Love, then removes it, and the button's label reads totals of 1, 1 and 0. A's PUT on A's own post → 403. The same flow by keyboard only (Tab to the button, ArrowUp, the arrow keys, Enter, Escape) works, and axe passes.
  - **E5** (a smoke test on real SP6 data; the full property is Task 14's named test, and the labels are Task 23's): with 30 seeded photos and 2 seeded boosts, item 1 is a photo, no two paid items are adjacent, and each paid item shows "Boosted".
  - **E6:** B blocks A from a post menu, and A's posts vanish from B's Feed, Photos and the deep link (the "This photo isn't available" page). Three other seekers report one of A's posts; A's Your photos shows "Hidden while we review reports", and a `reports` item exists.
  - **E7:** an operator publishes an announcement at `/admin/community/announcements`; a seeker's Announcements tab shows it together with a seeded running host announcement, which shows "Paid announcement".
  - **E8:** a guest sees the explanation on every `/community` route, and `GET /api/v1/community/feed` returns 401; a host sees "Community is for seekers", and the API returns 403; every `/community` page carries `X-Robots-Tag: noindex, nofollow`; `GET /api/v1/openapi.json` has no path containing `comment`.
  - **Axe:** every `/community` route and both console pages, in light and dark, at 390 px and 1280 px: 0 serious or critical violations.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp7-exit.spec.ts`. Expected: FAIL until everything is wired together.
- [ ] **Step 3:** Fix the integration gaps.
- [ ] **Step 4:** Write `docs/runbooks/sp7-community-setup.md`, with exact steps for:
  - `COMMUNITY_CURSOR_SECRET` in `infra.json` and the three Vercel targets (Task 1 Step 6), never in Doppler or a commit;
  - adding `CHILD_SAFETY_FIXTURE_SHA256` to `CHILD_SAFETY_STUB_HASHES` in the Vercel Development and Preview env, and to a reused local dev server's environment (never Production, where the env guard refuses the stub provider);
  - the Community launch gate: PhotoDNA approved and `CHILD_SAFETY_PROVIDER=photodna` in Production (spec 9);
  - the founder's open items: the final reaction set (one constant and one migration), and the Community Guidelines published at `/legal/community` by SP8.

  Run the e2e file again. Expected: PASS.
- [ ] **Step 5:** Commit: `test(sp7): exit-criteria e2e and accessibility sweep; docs: community runbook`.

### Task 31 (W7): Feed performance gate

**Files:**
- Create: `tests/perf/community-feed.int.test.ts`

**Interfaces:**
- Consumes: `getFeedPage`, `getPhotosPage`, `seedPost`-style bulk inserts through `queryRows`, `fakePaidSource`.

- [ ] **Step 1: Write the failing test** (CI Postgres). Seed 10,000 published posts by 500 named seekers, 50,000 reactions, and a viewer with 50 blocks and 20 hides. Then:
  - 50 sequential `getFeedPage` calls (page 1, and cursor pages 2–5, with `memoryStorage()` and `fakePaidSource({ items: 'endless', delayMs: 50 })`) → p95 ≤ 800 ms;
  - 50 `getPhotosPage` calls → p95 ≤ 800 ms;
  - `explain` of the organic query uses `community_posts_feed_idx`.
- [ ] **Step 2:** Run `pnpm typecheck` locally; CI runs the file. Expected: FAIL until the queries meet the budget.
- [ ] **Step 3:** Fix any slow query (indexes go in a 69xx migration).
- [ ] **Step 4:** Run the full suite: `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test && pnpm e2e`. Expected: all pass. CI runs the integration files.
- [ ] **Step 5:** Commit: `test(sp7): feed p95 under 800 ms on 10,000 posts`.

When Tasks 29–31 pass, every row of spec section 1 is proven. Community's launch still waits on PhotoDNA approval and the published Community Guidelines (spec section 13).
