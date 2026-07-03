# Community Dashboard — Audit

**Scope:** Explore&Earn community area only (Feed · Photos · Announcements). Seeker/host/admin dashboards are out of scope except where shared components touch community.
**Date:** 2026-06-14
**Method:** Full read of every community route, component, server action, query, contract, and migration. Findings are tied to real files and line numbers. No code changed during the audit.

---

## 1. Routes discovered

All community routes live under the `(seeker)` route group and render a single client component, `CommunityDashboard`, with a `tab` prop.

| Route | File | Tab | Purpose |
|---|---|---|---|
| `/community` | [page.tsx](apps/web/app/(seeker)/community/page.tsx) | `feed` | Combined feed: real photos + real host announcements, interleaved with fixture/marketing items (blog, boosted listings, featured employers). |
| `/community/photos` | [photos/page.tsx](apps/web/app/(seeker)/community/photos/page.tsx) | `photos` | Seeker photo wall + upload form. |
| `/community/announcements` | [announcements/page.tsx](apps/web/app/(seeker)/community/announcements/page.tsx) | `announcements` | Host announcements list + (host-only) announcement composer + post-purchase draft activation. |
| error boundary | [error.tsx](apps/web/app/(seeker)/community/error.tsx) | — | Sentry-reported error state with "Try again". |

**Primary UI surface:** [CommunityDashboard.tsx](apps/web/components/seeker/CommunityDashboard.tsx) (1,389 lines) + [CommunityDashboard.module.css](apps/web/components/seeker/CommunityDashboard.module.css) (2,352 lines).
**Shared community component:** [PostEngagement.tsx](apps/web/components/community/PostEngagement.tsx) (reactions + comments), [PostEngagement.module.css](apps/web/components/community/PostEngagement.module.css).
**Host composer (rendered inside community):** [HostAnnouncementComposer.tsx](apps/web/components/host/HostAnnouncementComposer.tsx) + its module CSS.

---

## 2. Current abilities per route

### Feed (`/community`)
- Read interleaved feed. Real seeker photos and real host announcements are merged into a fixed 12-slot fixture template ([CommunityDashboard.tsx:124-137](apps/web/components/seeker/CommunityDashboard.tsx#L124-L137), merge logic [L1217-L1226](apps/web/components/seeker/CommunityDashboard.tsx#L1217-L1226)).
- React to posts (5 emoji), comment on real posts, open the post "more" menu (Report / Hide from feed / Copy link — [PostMenu L519-L587](apps/web/components/seeker/CommunityDashboard.tsx#L519-L587)).
- "Add photo" CTA links to `/community/photos` (`ShareComposer` [L926-L940](apps/web/components/seeker/CommunityDashboard.tsx#L926-L940)).

### Photos (`/community/photos`)
- Upload a photo (file + caption + location), gated at 80% profile completion (`PhotoUploadForm` [L353-L468](apps/web/components/seeker/CommunityDashboard.tsx#L353-L468)).
- Browse a polaroid masonry grid; open a lightbox (`PhotoMasonryGrid` [L983-L1033](apps/web/components/seeker/CommunityDashboard.tsx#L983-L1033), `PhotoLightbox` [L944-L979](apps/web/components/seeker/CommunityDashboard.tsx#L944-L979)).
- React/comment via the feed card path (only on the `feed` tab; **the masonry tiles themselves have no reaction/comment affordance** — see §10).

### Announcements (`/community/announcements`)
- Read host announcements (real + fixture).
- **Hosts only:** compose a free announcement (Pro/Enterprise quota), or buy a timed slot ($150 / $250 / $350), or activate a purchased draft (`HostAnnouncementComposer`).
- React/comment on announcements.

---

## 3. Admin-only abilities

**There are none.** There is no admin role, no admin gate, no moderation queue, no pin/feature/remove-others action anywhere in the community server actions, queries, or migrations. The only privileged surface is **host**-gated announcement posting. See §5.

The "Report post" action ([PostMenu handleReport L554-L557](apps/web/components/seeker/CommunityDashboard.tsx#L554-L557)) is **purely cosmetic** — it shows a thank-you toast and writes nothing to any table. There is no moderation backend behind it.

---

## 4. Explore&Earn "official" posting abilities

**There is no Explore&Earn / first-party "official" posting channel in the data model.** The brief anticipates one; the code does not have it. What exists:

- A **fixture** blog card ("7 Travel Tips…", branded "Explore & Earn" in the reference mockups) is hard-coded marketing, not a real post type ([BLOG_POST_BASE L107-L114](apps/web/components/seeker/CommunityDashboard.tsx#L107-L114)). It links to `/help`.
- Host announcements can be **purchased** (paid placement). The contract carries `isPurchased` ([contracts/community.ts HostAnnouncement.isPurchased], derived from `stripe_payment_intent_id`), but **the UI never surfaces this flag** — purchased and free announcements render identically (`announcementsToFeedItems` drops it, [L335-L349](apps/web/components/seeker/CommunityDashboard.tsx#L335-L349)).

➡️ **Gap to document, not invent:** "Official E&E posts" do not exist as a backend capability. The nearest real, data-backed distinction is **purchased/promoted host announcements**. The restyle will surface `isPurchased` as a "Promoted/Featured" treatment and will **not** fabricate an admin/official posting flow.

---

## 5. Role / permission logic that must not break

Enforced server-side in [app/actions/community.ts](apps/web/app/actions/community.ts) and by Supabase RLS in migrations 031/032. **All of this must be preserved.**

| Action | Gate | Where |
|---|---|---|
| Upload photo | authenticated **seeker**, `completion_score >= 80` | `uploadCommunityPhotoAction` (`getSeekerCompletionScore`, `<80` rejected) |
| Delete photo | photo **owner** only | `deleteCommunityPhotoAction` → `getOwnedPhotoPath(seekerProfileId, photoId)` |
| Post free announcement | authenticated **host**, tier quota (`none/starter:0`, `professional:1`, `enterprise:3`) | `postHostAnnouncementAction` → `ANNOUNCEMENT_MONTHLY_QUOTA` + `countHostAnnouncementsThisMonth` |
| Buy announcement slot | authenticated **host** | `createAnnouncementCheckoutAction` (Stripe; webhook creates draft) |
| Activate draft | **host owner** of draft (`status='draft'`) | `activateDraftAnnouncementAction` → `activateHostAnnouncement(draftId, hostProfileId)` |
| Toggle reaction | any authenticated user | `toggleReactionAction` (RLS: `clerk_user_id = auth.jwt() sub`) |
| Add comment | any authenticated user | `addCommentAction` (author name resolved server-side) |
| Remove comment | comment **author** only | `removeCommentAction` → `softDeleteComment(commentId, clerkUserId)` |

UI gating surfaces this correctly today: the composer only renders for `isHost` ([CommunityDashboard.tsx:1265](apps/web/components/seeker/CommunityDashboard.tsx#L1265)); the upload form shows a completion gate below 80% ([L368-L394](apps/web/components/seeker/CommunityDashboard.tsx#L368-L394)); comment delete only renders for the author ([PostEngagement.tsx:145](apps/web/components/community/PostEngagement.tsx#L145)). **The restyle must keep every one of these conditions byte-for-byte.**

---

## 6. Data flows & mutation points

- **Reads** (server components, per-request `force-dynamic`): `getFeedPhotos`, `getFeedAnnouncements`, `getHostTierAndProfile`, `getPhotoReactionsBatch` / `getAnnouncementReactionsBatch`, `countHostAnnouncementsThisMonth`, `getLatestDraftAnnouncement`. All wrapped in `Promise.allSettled` and degrade gracefully on failure.
- **Mutations** (server actions): photo upload/delete, announcement post/checkout/activate, reaction toggle, comment add/remove. Reactions/comments are optimistic on the client with localStorage backing and rollback ([usePostReactions L34-L112](apps/web/components/community/PostEngagement.tsx#L34-L112)).
- **Client-only state:** hidden posts (`ee_hidden_posts`), per-post reactions (`ee_rx_<id>`) in localStorage.

➡️ The restyle is **presentational**: no data flow, action signature, or table touched.

---

## 7. Visual / UX weaknesses (highest-impact first)

1. **Broken photo upload form + gate styling.** `PhotoUploadForm` and `photoGate` CSS reference a *phantom token vocabulary* that exists nowhere in the design system: `--surface-card`, `--surface-primary`, `--radius-xl`, `--radius-full`, `--text-tertiary`, `--font-body`, `--color-error` (verified absent in `tokens.css` / `primitives.css`). Result: the upload card renders with **no surface fill, square corners, and a non-pill submit button** — it looks unstyled and off-brand on the Photos route ([CSS L2181-L2336](apps/web/components/seeker/CommunityDashboard.module.css#L2181-L2336)). This is the single biggest visible defect.
2. **No community identity.** The top of every route is a personal **XP/level "Welcome back" bar** (`WelcomeBar` [L1037-L1075](apps/web/components/seeker/CommunityDashboard.tsx#L1037-L1075)), not a community hero. Nothing on the page explains *what the community is* or what Feed/Photos/Announcements are for. The space reads as a personal dashboard, not a shared hub.
3. **Real announcements look impoverished vs fixtures.** Real host announcements carry **no cover images** (`coverUrls: []`, [L342](apps/web/components/seeker/CommunityDashboard.tsx#L342)), so they render as bare text blocks, while fixture announcements get 1–3 photos. Real content looks *worse* than fake content.
4. **Purchased/"promoted" status is invisible.** `isPurchased` is fetched but never shown (§4) — a free trust/quality signal is being thrown away.
5. **Photos tab has no reactions/comments at the tile.** The masonry polaroids only open a lightbox; engagement lives on the feed card. The "immersive gallery" can't be liked or commented from where users browse it.
6. **Fixture-heavy feed.** The default feed is mostly fabricated seeker posts/names ([SEEKER_NAMES L100](apps/web/components/seeker/CommunityDashboard.tsx#L100), `CATEGORY_CAPTIONS L187-L193](apps/web/components/seeker/CommunityDashboard.tsx#L187-L193)). Acceptable as seed content, but the seams show when real data is sparse.
7. **No loading skeletons.** Routes are `force-dynamic` server components; on slow data the user gets a blank shell, not a skeleton.
8. **Announcement seeker context is thin.** Non-hosts on `/community/announcements` see a list with no explanation of who posts here or why (it's host hiring/housing news).
9. **Off-system color.** The community tree hardcodes a scoped green palette (`--community-green: #2A5724` [CSS L8-L12](apps/web/components/seeker/CommunityDashboard.module.css#L8-L12)) instead of the locked V2 "Adventure Paper & Sky" brand tokens (sky `--color-cta`, gold `--color-gold`). Intentional as a "community" accent, but it drifts from the rest of the app and from the gold/sky used in CTAs elsewhere.

---

## 8. Mobile-first failures

- The **XP group is dropped entirely under 600px** ([CSS L156-L160](apps/web/components/seeker/CommunityDashboard.module.css#L156-L160)) — the only "community identity" element vanishes on phones, leaving just an avatar + name.
- The right **`aside` (welcome, popular tags, upcoming listings, help) is `display:none` under 860px** ([CSS L347-L355](apps/web/components/seeker/CommunityDashboard.module.css#L347-L355)). On mobile, the `MobileProfileStrip` partially compensates, but **Popular Tags / Upcoming Listings / Help are simply gone** on phones — content loss, not reflow.
- The broken upload form (§7.1) is most visible on mobile where it's full-width.
- Tab nav is horizontally scrollable but the three tabs always fit; the scroll affordance is unused overhead.

---

## 9. Broken or confusing flows

- **Report** does nothing (§3) — sets a false expectation of moderation.
- **Photos tab → upload success** calls `onSuccess` with an empty body and relies on "server revalidation handles grid refresh" ([L1260](apps/web/components/seeker/CommunityDashboard.tsx#L1260)) — but the action does not `revalidatePath`, so a freshly uploaded photo does **not** appear until a manual reload. Confusing.
- **Comments on the Photos tab:** the masonry path renders no `PostEngagement`, so a user who uploads can't see comments where they browse.
- Real vs fixture interleaving can place a fabricated "Maya R." seeker post above a real user's post, which is odd once real content exists.

---

## 10. Repeated UI patterns that should become shared community primitives

| Pattern | Repeated in | Proposed primitive |
|---|---|---|
| Pill badge (Seeker / Host / Blog / status) | `seekerBadge`, `hostBadge`, `blogBadge`, `hostBadgeInline` | `CommunityBadge` (variant: seeker/host/official/promoted) |
| Card header (avatar + name row + time + menu) | `SeekerCard`, `AnnouncementCard` | `PostCardHeader` |
| Eyebrow row (Boosted / Featured / Featured employer) | `listingEyebrow`, `employerEyebrow` | `CardEyebrow` |
| Avatar with initial fallback | 6+ places (welcome, card, composer, comment, mobile strip) | `Avatar` |
| Empty state | feed/photos/announcements (3 variants inline) | `CommunityEmptyState` (icon + heading + sub + CTA) |
| Outline pill CTA (uppercase) | `viewHostBtn`, `readMoreBtn`, `widgetCta`, `employerCta`, `listingCta` | `CommunityPillCTA` |
| Section context/intro bar | none yet | `SectionIntro` (new) |
| Loading skeleton | none yet | `PostSkeleton` / `PhotoSkeleton` (new) |

---

## 11. Highest-impact design improvements (ranked)

1. **Fix the broken photo form/gate tokens** and give the composer a real premium surface (instant, visible win).
2. **Add a section-aware community header/hero** that states the mission and labels Feed/Photos/Announcements — turns "my dashboard" into "our hub".
3. **Surface `isPurchased` as a "Promoted" treatment** on announcements (gold accent), and give real announcements a dignified text-first layout so they don't look broken without images.
4. **Add a `SectionIntro` band** on Photos and Announcements explaining the space + primary action.
5. **Loading skeletons** for feed/photos/announcements.
6. **Stronger, on-brand empty states** with a clear CTA.
7. **Keep mobile content** (don't `display:none` the widgets — move them into a collapsible/mobile-ordered block).

---

## 12. Risk areas (do not break)

- **Permissions (§5)** — composer `isHost` gate, 80% upload gate, owner-only delete, author-only comment delete. Touch markup/classes only, never the conditions.
- **Optimistic reaction/comment logic** in `PostEngagement` (localStorage keys, rollback). Restyle classes, not the hook.
- **Server action signatures** consumed by client forms (`uploadCommunityPhotoAction`, `postHostAnnouncementAction`, etc.). Keep `name=` form fields intact (`photo`, `caption`, `location_tag`, `title`, `body`, `kind`).
- **`force-dynamic`** and `Promise.allSettled` graceful-degrade reads — keep.
- **Icon system** — `<Icon name="domain.name"/>` only; no inline SVG / other icon libs (CI guardrail G30, AGENTS.md §6).
- **Tokens** — reference semantic tokens; never hardcode raw hex that bypasses them (AGENTS.md §6). The existing scoped `--community-*` block is the one sanctioned local exception; extend it, don't multiply ad-hoc colors.
- **Photo language** — frame + mat around photos, never filters/overlays on host photos (AGENTS.md §6).

---

## 13. Recommended execution order

1. **Primitives & token fix** — repair phantom tokens; add `SectionIntro`, `CommunityBadge` (incl. `promoted`/`official`), skeletons, shared empty state. (Phase 3)
2. **Community shell/header** — section-aware hero + keep `WelcomeBar` as a compact strip; preserve tab nav, restore mobile content. (Phase 4)
3. **Feed** — promoted-announcement badge, real-announcement layout dignity, card polish. (Phase 5)
4. **Photos** — fix/upgrade composer, gallery intro, tile engagement affordance, skeletons. (Phase 6)
5. **Announcements** — seeker context intro, official/promoted treatment, host composer polish. (Phase 7–8)
6. **Forms/modals/states** — composer, upload, lightbox, empty/loading/error consistency. (Phase 9)
7. **QA** — lint, typecheck, build, responsive review at 375/768/1440. (Phase 10)

---

## 14. Files in scope

**Edit (presentational):**
- `apps/web/components/seeker/CommunityDashboard.tsx` + `.module.css`
- `apps/web/components/community/PostEngagement.tsx` + `.module.css`
- `apps/web/components/host/HostAnnouncementComposer.tsx` + `.module.css`
- `apps/web/app/(seeker)/community/{page,photos/page,announcements/page,error}.tsx` (markup/wiring only)

**New (community primitives):**
- `apps/web/components/community/CommunityBadge.tsx`
- `apps/web/components/community/SectionIntro.tsx`
- `apps/web/components/community/Skeletons.tsx`
- shared module CSS for the above

**Do not touch:** `app/actions/community.ts`, `packages/db/src/queries/community.ts`, `packages/contracts/src/community.ts`, `supabase/migrations/*`.
