# Seeker Dashboard Overhaul — Design Spec

- **Date:** 2026-06-16
- **Owner station:** engineer (interchangeable implementer)
- **Status:** Approved by founder (Jackson) — execute
- **Scope tier:** Foundation slice (per founder), within the locked Design System V1/V2
- **Source command:** `/frontend-design` — "overhaul this seeker dashboard landing and sub pages. unify. align. make worldclass"

## 1. Problem

The seeker experience has **six** navigation surfaces, three of them redundant, and a cluttered home base:

| Surface | Where | Verdict |
| --- | --- | --- |
| Bottom nav (Seek/Map/Swipe/Profile) | all pages | **Founder-locked — do not touch** |
| Global header (brand + Explore/Community + bell + avatar) | top | Keep; one link bug to fix |
| Hamburger drawer (`DashboardNav`, 14 links / 4 groups) | Profile **and** /seek | **Redundant — delete** |
| "Manage" 12-tile grid | Profile page | **The crammed nav — replace** |
| `StatusStrip` + `BucketChips` | `/home` | On a **dead page** |
| `/home` route | — | **Orphaned** (zero inbound links), duplicates Profile |

The hamburger drawer and the 12-tile grid link to the **same ~12 destinations** — two ways (one hidden, one cluttered) to reach the same places. `/home` duplicates the Profile dashboard but is unreachable. The Profile tab is the de-facto home base and is overloaded (public-profile identity + dashboard stats + a 12-tile nav dump).

The fix is **information architecture and alignment**, not restyling. Visual direction is already locked and must be used verbatim.

## 2. Founder decisions (locked for this work)

1. **Bottom nav is untouchable.** Seek/Map/Swipe/Profile stay exactly as-is.
2. **Landing shape = "Profile + hub."** Keep a real public-profile feel up top (full-bleed category cover, avatar, name, category pills, bio — frame-not-filter), with status + an organized directory below.
3. **Lifecycle = "keep routes, unify styling."** Do **not** merge the 6 lifecycle routes or add redirects. Give them a shared page template and reach them from a tidy "Applications" group on the hub with live counts.
4. **Scope = foundation slice first.** Ship a coherent, world-class vertical slice now; migrate remaining sub-pages to the shared template in a fast follow.
5. Directory groups render **flat and fully visible** (not collapsible).

## 3. Design system guardrails (non-negotiable)

- Locked tokens only (`apps/web/styles/tokens.css`) — never hardcode color/type/spacing/radius.
- Compose `packages/ui` primitives (`Card`, `Button`, `Badge`, `Chip`, `Meter`, `Skeleton`, `ui-stat`) — do not reimplement.
- Icons via `<Icon name="domain.name"/>` registry only — no inline SVG in feature code, no other icon libs (CI guardrail G30).
- Photos: hand-drawn frame + paper mat **around** untouched images — never filters/overlays on host/user photos.
- Type: Patrick Hand display titles, Inter body. Motion: `--motion-fast/base`, `--ease-standard`, honor reduced-motion.
- A11y: 44px+ targets, `aria-current`, labels, WCAG AA contrast, never state-by-color-alone.
- No forbidden areas touched (no auth/session, schema/migrations, Stripe, matching algorithm, destructive ops).

## 4. Target navigation model

One home base + the locked bottom tabs. Concretely:

- **Delete** `DashboardNav` (`apps/web/components/seeker/DashboardNav.tsx` + `.module.css`) and remove its usage in `ProfileHub` and `SeekerDashboard` (remove the hamburger trigger buttons too).
- **Global header:** fix the "Explore" link — for a signed-in seeker `homeHref` resolves to `/` (marketing root); it should target `/seek`. (Host scope unchanged.)
- **`/home`:** replace the page body with a permanent redirect to `/profile`. Fold its `PrimaryActionCard` "next best action" intent into the hub's callout. `StatusStrip`/`BucketChips`/`PrimaryActionCard` components remain in the tree (reused/retired later); only the dead page goes.

## 5. The Profile home base (Profile + hub)

Single client component `ProfileHub`, rebuilt. Top-to-bottom sections:

1. **Cover** — full-bleed category-tinted gradient (`--gradient-category-*` by first preferred category) or the seeker's cover photo (framed, never filtered). Top bar keeps a subtle "Edit cover" affordance → `/profile/edit`. **Hamburger menu button removed.**
2. **Identity** — avatar straddling the cover/content seam; name + a "Seeker · Ready now" badge whose live dot reflects readiness; category pills tinted via `--accent-*`; bio or "+ Add a bio" → `/profile/edit`.
3. **Readiness** — existing `ReadinessSlider` (Ready now / 1mo / 3mo / 6mo), restyled for rhythm.
4. **Status row** — rebuilt on the shared `ui-stat` primitive: **Resume % · Saved · Applied · Offers · Upcoming**, each a tappable cell to its destination. "One number that matters" leads — Offers (`ui-stat--primary`) when present, else Resume (`ui-stat--soon`/amber) when below `RESUME_APPLY_THRESHOLD`. Replaces today's ad-hoc `statsRow` + the separate Can-Apply cell.
5. **Matched for you** — `MatchCardRail` (kept), framed cards, "See all →" `/seek`.
6. **Next-best-action callout** — one prominent callout folding `PrimaryActionCard` logic: resume not ready → finish resume (with progress); resume ready + offers waiting → review offers; else keep exploring.
7. **Directory** — replaces both the 12-tile grid and the drawer. Three labeled groups of cell-rows (icon chip · label · count/detail · chevron), correct registry icons, 44px+ targets, `--radius-cell`/`--border-soft`:
   - **Applications:** Saved (n) `/saved` · Applied (n) `/applied` · Offers (n) `/offered` · Invites `/invites` · Accepted `/accepted` · Past `/not-selected`
   - **Your profile:** Edit profile `/profile/edit` · Resume (n%) `/resume` · Travel `/travel` · Schedule `/schedule`
   - **Account:** Settings `/settings` · Notifications (n) `/notifications` · Help `/help`
8. **Badges** — kept when present.

Icon mapping cleans up today's `action.more` placeholders (e.g. resume → `profile.resume`, settings → `nav.settings`, notifications → `nav.notifications`, help → `system.info`, travel → `mappin.cluster`, schedule → `category.seasonal`/`status.begins`).

## 6. Shared page template `SeekerPage` (the "align" fix)

Upgrade `BucketPage` into a reusable `SeekerPage` wrapper:

- **Consistent page header:** back chevron (← to hub), Patrick Hand page title, optional subtitle, optional trailing action.
- **Consistent rhythm:** `--space-section` blocks; shell max-width + gutters.
- **Consistent empty/loading:** existing `LifecycleList` empty props + a shared skeleton.

`BucketPage` becomes a thin wrapper over `SeekerPage` (or is replaced by it) so the 6 lifecycle pages inherit it with no per-page divergence.

**Migrated this slice:** `saved · applied · offered · invites · accepted · not-selected` (the Applications group — highest traffic, makes the unification visible).

**Fast follow (same template, next pass):** `resume · travel · schedule · settings · notifications · messages · withdrawn · journey · help · profile/edit`.

## 7. Visual execution (within tokens)

Warm paper canvas; flat surfaces, hairline `--border-soft`, whisper `--elevation-card`/`--elevation-hover` on lift; Patrick Hand titles, Inter body. Directory rows are `--radius-cell` cells; counts are small neutral badge pills; status uses `ui-stat`. Category accents drive the cover gradient + pills. One tasteful staggered load reveal (reduced-motion respected). State never by color alone.

## 8. File-level change list

**Delete**
- `apps/web/components/seeker/DashboardNav.tsx`
- `apps/web/components/seeker/DashboardNav.module.css`

**Rewrite**
- `apps/web/components/seeker/ProfileHub.tsx` + `ProfileHub.module.css` (the hub: identity, readiness, status, matched, callout, directory)

**Add**
- `apps/web/components/seeker/SeekerPage.tsx` + `SeekerPage.module.css` (shared page template)
- `apps/web/components/seeker/SeekerDirectory.tsx` + `SeekerDirectory.module.css` (grouped directory rows) — or co-located in ProfileHub if cleaner

**Edit**
- `apps/web/components/seeker/SeekerDashboard.tsx` — remove `DashboardNav` usage + hamburger trigger
- `apps/web/components/global/GlobalHeader.tsx` — seeker "Explore" → `/seek`
- `apps/web/app/(seeker)/home/page.tsx` — redirect → `/profile`
- `apps/web/components/seeker/BucketPage.tsx` — wrap/forward to `SeekerPage`
- 6 lifecycle pages under `apps/web/app/(seeker)/{saved,applied,offered,invites,accepted,not-selected}/page.tsx` — adopt `SeekerPage`
- `apps/web/components/seeker/index.ts` — export updates

## 9. Verification

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, design-drift / G30 guardrails — all green.
- Manual: every former drawer/grid destination is reachable from the hub directory; `/home` redirects; no hamburger anywhere; bottom nav unchanged; the 6 lifecycle pages share one header/rhythm.
- Visual QA at `--bp-xs`/`sm`/`md` against the design system (tap targets, contrast, reduced-motion).

## 10. Out of scope (this slice)

Bottom-nav changes; route merges/redirects for lifecycle; the fast-follow sub-pages; any forbidden area. These are explicitly deferred.
