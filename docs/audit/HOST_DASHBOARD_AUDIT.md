# Host Dashboard — Audit

_Audited 2026-06-14. Builds on the `restyle/premium-design-system` foundation
(new `ui-*` primitives, elevation/gradient/field tokens). Host scope lives under
`apps/web/app/(host)/host/**` with chrome owned by `(host)/layout.tsx`._

## 1. All host routes discovered

| Route | File | Purpose |
|-------|------|---------|
| `/host` | `(host)/host/page.tsx` → `HostDashboard` | Dashboard / command center |
| `/host/listings` | `…/listings/page.tsx` → `HostListingsManager` | Listing inventory list |
| `/host/listings/[id]` | `…/[id]/page.tsx` → `HostListingDetail` | Listing detail + recent applicants |
| `/host/listings/[id]/edit` | `…/edit/page.tsx` → `ListingForm` | Edit listing |
| `/host/listings/new` | `…/new/page.tsx` → `ListingForm` | Create listing |
| `/host/applicants` | `…/applicants/page.tsx` → `HostPipelineBoard` | Applicant pipeline (by stage) |
| `/host/applicants/[id]` | `…/[id]/page.tsx` → `HostApplicantDetail` | Applicant review + status actions |
| `/host/invites` | `…/invites/page.tsx` → `InvitesList` | Sent invites |
| `/host/messages` | `…/messages/page.tsx` → `HostThreadGroups` | Conversations |
| `/host/messages/[id]` | `…/[id]/page.tsx` → `MessageTranscript` | Thread + reply |
| `/host/analytics` | `…/analytics/page.tsx` → `HostAnalyticsDashboard` | Performance (tier-gated) |
| `/host/profile` | `…/profile/page.tsx` → `HostProfilePanel` | Public profile preview |
| `/host/profile/edit` | `…/profile/edit/page.tsx` → `HostProfileForm` | Edit profile |
| `/host/settings` | `…/settings/page.tsx` → `HostSettings` | Account / plan |
| `/host/billing` | `…/billing/page.tsx` (inline) | Plans + Stripe portal |
| `/host/seeker/[id]` | `…/seeker/[id]/page.tsx` (inline) | Seeker profile (invite/message) |
| `/host/onboarding` | `(host-onboard)/…` | Host profile creation (separate group) |

Chrome: `GlobalHeader scope="host"` (top) + `HostBottomNav` (Listings · Analytics ·
Applicants · Profile · More). Layout gates on host profile → redirects to
`/host/onboarding` if none.

## 2. Current visual / UX weaknesses

- **Dashboard reads as a generic admin template** (`HostDashboard.tsx`): a flat
  vertical stack of identical `Card` blocks holding `<dl>` stat rows. No identity
  hero, no single dominant "next action," no visual weight on what's urgent.
  `pendingActions` — the most important number — is one unstyled `<p>` among equals.
- **No KPI hierarchy.** Listings / applications / pending all render at equal
  visual weight as label→value rows. Nothing is scannable in one second.
- **Quick links** are plain bordered pills; not action-grade, no emphasis on
  "Create listing" (the host's #1 job).
- **Listing cards** (`HostListingCard`) show no cover image, no Housing/Meals/Pay
  signal, no dates beyond a text window, and bury Boost as a 32px icon among quick
  buttons — boosting should feel commercial, not like a toolbar toggle.
- **Section headings** (`HostSectionHeading`, on every route) are minimal — title +
  underlined text link. No eyebrow, no rhythm, action isn't a real button.
- **Flat surfaces everywhere** — borders-only, no `--elevation-card`, so panels
  don't separate from the paper background; the dashboard feels like one gray sheet.
- **Hardcoded hex bypassing tokens** in several host modules (error/boost color-mix
  fallbacks `#fee2e2/#dc2626/#d97706`, `text-tertiary` which isn't a token).

## 3. Mobile-first failures (375px)

- **Touch targets < 44px**: listing-card quick buttons (32×32), analytics/table
  controls, applicant action buttons. WCAG 2.5.5 fail.
- **Listing-card stats** 3-up compress to ~100px cells before the 479px collapse.
- **Analytics table** keeps 16px body + `nowrap` ellipsis; columns cut mid-word.
- **Dashboard activity row** `grid 1.5rem 1fr auto` squeezes the timestamp at 375.
- **Quick-links row** wraps awkwardly; no consistent grid.
- No `--bp-xs` (380) treatment; host components assume 480px+ is "mobile."

## 4. Broken / confusing flows

- **Dashboard → action ambiguity**: five quick links + three card links all look
  alike; no primary path. A new host with zero listings sees empty `<dl>`s, not a
  "Create your first listing" moment.
- **Listing card actions**: Manage (text+arrow) vs four icon buttons with only
  `title`/`aria-label` — destructive Archive sits inline with Boost; easy mis-tap
  at 32px.
- **Boost** opens a popup but the entry point doesn't communicate value.
- **Empty states** rely on the generic discovery `EmptyState`; not host-framed.

## 5. Repeated UI patterns → shared components

- Stat label→value rows (dashboard, listing card, analytics, profile) → **host stat**.
- "Panel" = bordered surface with a title (every Card usage) → **host panel +
  panel header** with optional elevation.
- Status pill for listing/application/invite states → **host status pill** (today:
  `Badge` + ad-hoc colors).
- Boost/featured/plan markers → **host boost/plan badge**.
- Quick action tile (dashboard quick links, profile actions) → **host action tile**.
- Page header (`HostSectionHeading`, all routes) → upgrade in place.
- Empty state → **host empty** (wraps the new `.ui-empty`).

## 6. Data / business logic that must NOT be touched carelessly

- **Auth + RLS**: every page resolves Clerk `userId` + `getToken({template:"supabase"})`
  and relies on RLS for ownership. Don't alter token flow or guards.
- **Host profile gate** in `(host)/layout.tsx` (redirect to `/host/onboarding`).
- **Listing status server actions** (`pause/resume/archive` in `app/actions/listings`)
  and the `canPause/canResume/canArchive` derivation in `HostListingCard`.
- **Application status actions** (`StatusActions`), invite/offer flows.
- **Pricing** (`FOUNDER_LOCKED_PRICING`, `PLAN_ENTITLEMENTS`) and Stripe actions
  (`startHostCheckoutAction`, `startHostBillingPortalAction`) — founder-locked; UI
  only, never fabricate billing behavior.
- **Analytics tier gating** done server-side (per-listing stats withheld for
  `subscriptionTier === "none"`). Don't expose gated data client-side.
- **Housing/Meals/Pay triad** is product law — never collapse to "Perks".

## 7. Highest-impact design improvements

1. **Rebuild the dashboard into a command center**: identity hero + dominant primary
   action; a compact KPI row; a "Needs attention" panel surfacing pending applicants
   / unread / drafts; per-listing performance; premium quick-action tiles; real
   empty state for new hosts. Same props/data.
2. **Host design-system layer** (`host.css`) — panel, panel-header, stat, status
   pill, boost badge, action tile — adopted across all host pages for one unified feel.
3. **Listing-as-asset card** — elevation, prominent status, H/M/P chips, applicant
   count with "new" emphasis, Boost promoted to a labeled action, 44px targets,
   destructive Archive separated.
4. **Applicant-as-human card** — avatar/initials, match meter, category tags,
   timeline, clear Review primary; detail view with sticky action panel on desktop.
5. **Section header upgrade** (eyebrow + display title + real action button) — one
   edit, every route benefits.
6. **Boost/featured** premium treatment (gradient gold surface, value language).

## 8. Risk areas

- `HostListingCard` is a **client component** with `useTransition` + server actions
  and `isPending` class toggling — restyle markup/classes only, keep handlers.
- `HostBottomNav` tab set is **founder-locked** (order/labels) — style only.
- Analytics gating is server-driven — don't render withheld fields.
- `ListingForm` dispatches server actions on submit — don't touch field `name`s,
  `action`, or validation wiring.
- Avatar/identity layouts elsewhere use negative-margin overlaps — match sizes.
- Build's page-data collection is flaky on this box (see foundation notes) — verify
  via typecheck/lint/compile + dev render, not only `pnpm build`.

## 9. Recommended execution order

F1 host-system CSS layer → F2 shell + section header → F3 dashboard command center
→ F4 listing card + manager → F5 applicant card + pipeline + detail → F6 listing
form → F7 profile/settings → F8 boost/billing → F9 messages/invites → F10 QA.
Foundation-first so every later page inherits the unified system.
