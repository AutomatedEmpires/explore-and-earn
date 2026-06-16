# Explore&Earn — Seeker Dashboard Audit

_Audited 2026-06-15. Scope: every seeker-side route, flow, page, component, and
state. Mobile-first (375px). Companion to the whole-app `DESIGN_RESTYLE_AUDIT.md`,
but **seeker-specific and deeper**._

> **This is elevation within a founder-locked system, not a rebuild.** The
> "Adventure Paper & Sky" tokens (`apps/web/styles/tokens.css`) and `ui-*`
> primitives (`apps/web/styles/primitives.css`) are mature — they already ship
> `ui-stat / ui-stat--primary`, `ui-section-head`, `ui-empty`, `ui-field /
> ui-input / ui-textarea / ui-select`, `ui-category-badge`, gradients
> (`--gradient-sky/-paper-warm/-hero-scrim`), elevations (`--elevation-card/
> -hover`), `--bp-xs: 380px`, `--tap-min: 44px`, and a shimmer skeleton. The
> seeker work is to **apply and elevate** these across the seeker surface, close
> the mobile-first gaps, and **systematize the patterns currently re-invented
> per component** (above all, the category gradients and status-state colors
> duplicated as raw hex in JS).

---

## 1. All seeker routes discovered

Route group: `apps/web/app/(seeker)/` — wrapped by `layout.tsx`
(GlobalHeader + `<main>` + founder-locked `SeekerBottomNav`: Seek · Map · Swipe ·
Profile). Onboarding gate redirects incomplete profiles.

| Route | Purpose | Primary component(s) |
|-------|---------|----------------------|
| `/home` | Seeker landing / command center | `home/page.tsx`, `SeekerHero`*, `StatusStrip`, `PrimaryActionCard`, `MatchCardRail`, `LifecycleList` |
| `/seek` | Discovery feed + dashboard panel | `seek/page.tsx`, `SeekBrowser`, `SeekerDashboard` |
| `/swipe` | Tinder-style opportunity deck | `swipe/page.tsx`, `SwipeDeck` |
| `/map` | Geo/region opportunity index | `map/page.tsx`, `OpportunityMap` / `MapView` |
| `/profile` | Seeker marketplace identity | `profile/page.tsx`, `ProfileHub` |
| `/profile/edit` | Edit identity & preferences | `ProfileEditForm` |
| `/resume` | 5-step resume/profile builder | `resume/page.tsx`, `ResumeBuilder` |
| `/saved` | Saved listings | `saved/page.tsx`, `SavedCardGrid` |
| `/applied` | Applications (active + closed) | `applied/page.tsx`, `WithdrawButton` |
| `/applied/[id]` | Application detail + timeline | `applied/[id]/page.tsx` |
| `/accepted` | Confirmed roles | `accepted/page.tsx`, `CardStatus` |
| `/offered` | Open offers (accept/decline) | `offered/page.tsx`, `OfferedActions`, `LifecycleList` |
| `/invites` | Host invitations | `invites/page.tsx`, `InviteActions`, `LifecycleList` |
| `/not-selected` | Closed-loop rejections | `not-selected/page.tsx`, `CardStatus` |
| `/withdrawn` | Withdrawn applications | `withdrawn/page.tsx`, `CardStatus` |
| `/messages` | Conversation list | `messages/page.tsx`, `MessageList` |
| `/messages/[id]` | Thread detail | `messages/[id]/page.tsx`, `MessageTranscript` |
| `/notifications` | Notification feed | `notifications/page.tsx`, `NotificationList` |
| `/journey` | Accepted-role journey timeline | `journey/page.tsx`, `JourneyTimeline` |
| `/travel` | Travel prefs + trip list | `travel/page.tsx`, `TravelPanel` |
| `/schedule` | Availability + proposals | `schedule/page.tsx`, `SchedulePanel` |
| `/settings` | Notification prefs (only) | `settings/page.tsx`, `NotificationPrefsForm`, `SettingsPanel` |
| `/help` | Static help list | `help/page.tsx`, `HelpPanel` |
| `/community` (+`/photos`,`/announcements`) | Community dashboard | `CommunityDashboard` (already premium — out of scope) |

Shared shell/nav: `SeekerSidebar` (desktop), `DashboardNav` (mobile drawer),
`SeekerBottomNav` (locked 4-tab bar), `SectionHeading`, `BucketChips`,
`BucketPage`, `ReadinessSlider`, `HeroPhotoPickerModal`.

---

## 2. The single highest-impact finding — gradients & status colors are hardcoded in JS

A **category-gradient + status-state color system is re-implemented as raw hex in
JavaScript**, duplicated across at least six components with drifting values:

| Component | What's hardcoded |
|-----------|------------------|
| `SeekerHero.tsx` L27–36 | `maritime/farm/remote/seasonal/mix` hero gradients + category pill rgba (CSS L284–288) + badge dot `#6AE89A` |
| `ProfileHub.tsx` L21–26 | Same 5 category gradients (drifted values) + status colors `#2D7A3A`/`#C48A18` + amber resume callout |
| `HeroPhotoPickerModal.tsx` L26–36 | Preset gradient swatches (maritime/farm/remote/seasonal/…) |
| `MatchCardRail.tsx` L25–32 | `CATEGORY_COLORS` gradients + box-shadows |
| `FeaturedEmployerStrip.tsx` L10–15 | `CATEGORY_GRADIENTS` |
| `ReadinessSlider.module.css` L88–129 | now/soon/later pill gradients `#1E8A50…`, dot `#4ADE80` |
| `JourneyPipeline.module.css` L33/72–81 | connector + active + urgent gradients `#2F667A`/`#5AA0BF`/`#C48A18` |
| `SeekerSidebar.module.css`, `DashboardNav.module.css`, `SeekerDashboard.tsx` | avatar/badge gradients, resume ring colors, nav badge `#2F667A` |

**Consequences:** off-palette drift, no single source of truth, violates the
drift rule (AGENTS.md §6), and makes a coherent premium look impossible because
every surface renders a slightly different "maritime blue."

**Fix (Phase 3):** promote these to tokens —
`--gradient-category-{farm|maritime|remote|seasonal|mix}`,
`--gradient-category-{…}-soft` (rail/pill tints), and readiness/progress/state
tokens — then point every component at them. This is the keystone change: it
unifies the entire seeker look in one move and unblocks the premium pass.

---

## 3. Current visual / UX weaknesses (by theme)

**Landing (`/home`, ProfileHub):**
- Hero is strong (scrim, avatar overlap, category pills) but its gradients are
  hardcoded and there is **no photo-frame language** when a cover photo exists
  (design rule: frame + mat, never full-bleed filtered photo).
- `StatusStrip` / ProfileHub stat row: flat, uniform cells; **no hierarchy** —
  the one number that matters (pending offers, "Can Apply", readiness) doesn't
  lead. `ui-stat--primary` exists but isn't used here.
- `PrimaryActionCard` CTA uses `--text-primary` as its fill (dark, low-energy)
  instead of `--color-cta`; no per-action-type accent, so an expiring offer
  looks identical to "explore matches."
- `MatchCardRail` renders **the wrong icons** — `action.more` where
  `benefit.housing` / `benefit.meals` belong (MatchCardRail.tsx). Fixed-px card
  widths, hardcoded breakpoint `@media (min-width:480px)`.
- Empty rails (MatchCardRail, lifecycle) use bespoke placeholders instead of the
  shared `ui-empty` with a real CTA.

**Listing lifecycle (saved/applied/accepted/offered/invites/not-selected/withdrawn):**
- Pages are bare buckets — no section hero, no motivating copy, weak/empty CTAs.
- `applied/page.tsx` benefit triad is a fixed `repeat(3,1fr)` that **overflows /
  truncates on phones** (values like "Not included" clip).
- Accept/Decline (offers, invites) are **equal-weight** buttons — Accept should
  be the primary CTA; Decline secondary.
- `WithdrawButton` is one-click destructive with no confirm and an error message
  in `--text-secondary` (too quiet).
- Empty states are generic/apologetic with no forward action.

**Resume / Profile builder:**
- Stepper + progress bar exist, but steps are visually flat (no per-step "why
  this matters" intro), the progress label is `position:absolute` over the bar
  (hard to read), and forms **roll their own `.input/.textarea/.tag` instead of
  composing `ui-field/ui-input/ui-textarea/ui-category-badge`**.
- `ProfileEditForm` is one long ungrouped form (no sections/fieldsets), with
  outline-based selection that collides visually with focus rings.

**Comms / map / settings:**
- `MessageList`: listing title is `text-transform:uppercase` (unscannable),
  preview not truncated, no category badge, items don't route richly.
- `NotificationList`: flat (no category grouping), items not tappable to their
  source surface, icons all one color.
- `Map` / `Travel` / `Schedule`: read-only indexes that feel like placeholders;
  Travel/Schedule forms are bare HTML with no loading/success/validation states.
- `Settings` only exposes notification prefs; `SettingsPanel` rows are static
  (not links).

---

## 4. Mobile-first failures (audited at 375px)

- **Sub-44px touch targets:** ResumeBuilder `.iconBtn` 28×28; NotificationPrefs
  `.checkbox` 20×20; notifications `.button` `min-height:40px`; `SectionHeading`
  "See all" text link (no padding); SeekerHero/ReadinessSlider pills.
- **Grids that don't collapse at `--bp-xs`:** applied triad `repeat(3,1fr)`;
  `saved/loading` `repeat(2,1fr)`; ProfileHub 5-cell stat row; home route cards
  jump 1-up → 3-up with no 2-up tier.
- **Hardcoded px breakpoints** (`480px`, `640px`, `1024px`) instead of the
  `--bp-*` ladder, scattered across lifecycle + rail modules.
- **No sticky mobile CTA** on ResumeBuilder / ProfileEditForm — the save/next
  footer scrolls out of view on long steps.
- **Fixed-px card widths** in MatchCardRail / FeaturedEmployerStrip overflow the
  narrowest phones; horizontal rails have **no edge-fade scroll affordance**.
- **No safe-area insets** on `HeroPhotoPickerModal` bottom sheet and
  `DashboardNav` drawer (notch / home-indicator overlap).

---

## 5. Repeated UI patterns that should become shared

| Pattern | Re-invented in | Make shared as |
|---------|----------------|----------------|
| Category gradient (full + soft tint) | 6+ components (see §2) | `--gradient-category-*` tokens |
| Status-state color (ready/incomplete/progress/urgent) | ProfileHub, JourneyPipeline, SeekerDashboard, ReadinessSlider | `--state-*` tokens |
| Stat cell | StatusStrip, ProfileHub, SeekerDashboard | `ui-stat` / `ui-stat--primary` (exists — adopt) |
| Section header | SectionHeading + bespoke pairs | `ui-section-head` (exists — align) |
| Empty state | discovery, MatchCardRail, every lifecycle page | `ui-empty` (exists — adopt) |
| Lifecycle bucket page scaffold | 7 pages | `BucketPage` (exists — enrich) |
| Accept/Decline action pair | InviteActions, OfferedActions | shared `ResponseActions` styling (Accept=primary) |
| Avatar w/ initials fallback | Hero, Sidebar, DashboardNav, ProfileHub, MessageList | `ui-avatar` helper class |

---

## 6. Data / business logic that must NOT be touched carelessly

Restyle is **CSS + markup-class + presentational-prop only.** No changes to data,
routing, server actions, contracts, or the Housing/Meals/Pay triad copy.

Server actions / queries that must keep working unchanged:
- **Resume:** `saveInfoAction`, add/update/delete Experience/Education/
  Certification actions, `saveSkills` → all `startTransition` + `router.refresh`;
  `revalidatePath("/resume"|"/profile")`. Deletes guarded by `confirm()`.
- **Profile:** `saveOnboardingStep` (ProfileEditForm), `saveReadinessAction`
  (ProfileHub `useOptimistic`), `uploadProfilePhoto` + `saveProfilePhotoAction`,
  `saveHeroCoverAction` (HeroPhotoPickerModal).
- **Lifecycle:** `withdrawApplicationAction`, `acceptOfferAction`,
  `declineOfferAction`, `respondToInviteAction`, `saveListingAction`,
  `getSwipeBatchAction`.
- **Comms:** `getConversations`, `getLastMessagesForConversations`,
  `getMessages`, `markMessagesReadAction`, `markAllNotificationsReadAction`,
  `getNotificationPrefsAction` + its save action.
- **Locked constants:** `SEEKER_TABS` (bottom nav), `DISCOVERY_LANES` order/
  icons, `NAV_SECTIONS`, readiness `OPTIONS` values (`now/1_month/3_months/
  6_months`), resume thresholds (apply 80 / recommended 85), `MARKETPLACE_
  CATEGORIES`.
- **Risk hotspots** (per whole-app audit): `DiscoveryCard` container-query +
  inline-style contract (avoid JSX edits; class-level only), avatar negative-
  margin overlap math (Hero/ProfileHub), animation keyframes tied to px.

---

## 7. Highest-impact design improvements (ordered)

1. **Tokenize the category-gradient + status-state system** and refactor all JS/
   CSS duplicates to it. _One change, whole-surface coherence._ (§2)
2. **Immersive landing**: hero photo-frame + `ui-stat--primary` hierarchy on the
   stat strip + per-action-type accent on `PrimaryActionCard` (CTA → `--color-cta`).
3. **Fix MatchCardRail** (correct benefit icons, fluid card width, edge fade) and
   give matched/saved/featured rails a unified premium card treatment.
4. **Lifecycle pages → marketplace**: section heroes, `ui-empty` with CTAs,
   mobile-collapsing benefit triad, Accept-primary action pairs, confirm-on-withdraw.
5. **Resume/profile guided feel**: sticky mobile CTA, 44px controls, `ui-field`
   adoption, per-step intros, `ui-category-badge` for tags.
6. **Mobile sweep**: 44px targets everywhere, `--bp-*` instead of raw px, safe-area
   insets, rail overflow affordances.
7. **Comms polish**: MessageList scannability + routing, NotificationList grouping
   + tappable items, form loading/success states.

---

## 8. Risk areas (where careless edits break things)

- **`DiscoveryCard` (packages/ui)** — every lifecycle/discovery surface composes
  it; its responsive `--dc-*` vars feed inline styles. Touch class-level CSS only,
  never the JSX contract. **Highest risk.**
- **Avatar overlap math** (Hero, ProfileHub) — negative margins are load-bearing;
  changing identity-bar padding without matching avatar size clips the avatar.
- **JS-toggled classnames** (stepper stages, nav active, chips, swipe physics) —
  rename nothing; only restyle existing class names.
- **`useOptimistic` / `startTransition` flows** (readiness, notif prefs) — keep
  state wiring; restyle markup only.
- **HeroPhotoPickerModal / SwipeDeck** — file upload + gesture physics; CSS only.
- **Forbidden** (AGENTS.md §4): auth/session, schema/migrations, Stripe, matching,
  RLS, pricing values, triad copy.

---

## 9. Recommended execution order

1. **Phase 3 — Primitives/tokens:** category-gradient + state tokens; shared
   helper classes (`ui-avatar`, rail edge-fade, response-actions). Refactor JS/CSS
   duplicates onto tokens. _Foundation; unblocks everything._
2. **Phase 4 — Landing:** SeekerHero, StatusStrip → `ui-stat`, PrimaryActionCard,
   ProfileHub hero/stats, home route cards. _Most-seen surface._
3. **Phase 5–6 — Cards + lifecycle:** MatchCardRail/FeaturedEmployerStrip fixes,
   lifecycle page heroes + `ui-empty`, benefit-triad mobile, action-pair hierarchy.
4. **Phase 7 — Resume/profile:** sticky CTA, 44px, `ui-field`, step intros.
5. **Phase 8–10 — Comms/map/settings:** MessageList, NotificationList, Travel/
   Schedule form states, Map responsive, Settings/profile polish.
6. **Phase 11 — QA:** lint, typecheck, build; 375/768/1440 sweep; fix regressions.

Each phase keeps the build green before the next.
