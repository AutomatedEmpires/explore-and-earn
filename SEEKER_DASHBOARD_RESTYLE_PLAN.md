# Explore&Earn — Seeker Dashboard Restyle Plan

_Companion to `SEEKER_DASHBOARD_AUDIT.md`. Executable. Elevate within the
founder-locked "Adventure Paper & Sky" system — never replace it._

## 0. Operating principles

- **Tokens are law.** No raw hex/px in feature CSS or JS. New shared values become
  tokens in `tokens.css` first, then everything inherits.
- **CSS / markup-class / presentational-prop only.** No changes to routing, data
  fetching, auth, Supabase, server actions, contracts, pricing, or the
  Housing/Meals/Pay triad copy.
- **Foundation before surfaces.** Phase 3 tokens + shared classes, then surfaces
  inherit the upgrade.
- **Preserve the strong surfaces** (DiscoveryCard, SeekerHero shell, Community,
  StatusCard art). Extend; don't rebuild.
- **Mobile-first at 375px**, then 768, then 1440. Use the `--bp-*` ladder.

---

## 1. Design direction

Identity stays: **adventurous, practical, human field-journal meets cool sky-blue
action.** Push from "clean prototype" to "premium marketplace cockpit":

- **A unified category atmosphere** — one tokenized gradient per category
  (farm/maritime/remote/seasonal/mix), plus a `-soft` tint for rails/pills, so
  every "maritime" surface is the same blue. Imagery + accent vary; the system
  doesn't.
- **Hierarchy** — one dominant number/CTA per module (`ui-stat--primary`,
  `--color-cta` CTAs); everything else recedes.
- **Depth, carefully** — `--elevation-card` on raised modules, `--elevation-hover`
  on interactive cards/rails. Borders-first stays the rule; shadow is a whisper.
- **Motivation made visible** — readiness, resume completion, application pipeline,
  match score rendered as confident, scannable progress, not dense admin chrome.
- **Delight with restraint** — edge-fade rails, sticky CTAs, friendly empty states
  with a forward action, reduced-motion-safe micro-lifts.

---

## 2. Mobile-first layout strategy

- Design every seeker surface from 375px up; single-column stack is the base case.
- **44px minimum** interactive height everywhere (`--tap-min`).
- Collapse all `repeat(2–3,1fr)` grids to 1 col at `--bp-xs` (380px), 2 at
  `--bp-sm`, 3+ at `--bp-lg`. Replace raw-px media queries with the `--bp-*` ladder.
- Horizontal rails: fluid `clamp()` card widths + an edge-fade affordance + scroll
  snap.
- Sticky bottom CTA on long forms (resume steps, profile edit) with a hairline +
  `--elevation-card` and safe-area inset.
- Safe-area insets on the photo-picker bottom sheet and the mobile nav drawer.

---

## 3. Seeker information architecture

Landing (`/home`) is the **command center**, top to bottom:
1. **Immersive hero** — cover (framed photo or category gradient) · avatar · name ·
   seeker badge · preferred-category badge · bio preview · `ReadinessSlider`.
2. **Primary action** — one state-driven CTA (complete resume / explore matches /
   review offers / respond to invite / continue application).
3. **Status strip** — Resume % (primary if low) · Saved · Applied · Offers · Invites
   · Messages, using `ui-stat`/`ui-stat--primary`.
4. **Matched rail** — top matches with score + reason.
5. **Saved rail** — "Apply now" emphasis.
6. **Invites/Offers panel** — actionable.
7. **Featured employers** — discovery.
8. **Quick actions** — Edit resume · Explore · Saved · Applications · Messages · Offers.

`BucketChips` provide cross-bucket nav on lifecycle pages. Profile (`/profile`)
mirrors the hero as the seeker's marketplace identity.

---

## 4. Navigation strategy

- `SeekerBottomNav` (locked tabs) — keep; ensure ≥44px tap, add reduced-motion-safe
  active transition, add top hairline + `--elevation-card`.
- `SeekerSidebar` (desktop) / `DashboardNav` (mobile drawer) — tokenize avatar/
  badge/resume colors, add safe-area inset to the drawer, unify badge color
  (`--status-match-fg`), grow the resume progress bar.
- `SectionHeading` "See all" → padded ≥44px link with a chevron icon.

---

## 5. Component strategy (Phase 3 — build first)

Add to `tokens.css`:
```
/* category atmospheres — full + soft tint */
--gradient-category-farm / -maritime / -remote / -seasonal / -mix
--gradient-category-farm-soft / … (rail + pill tints)
--category-farm-ink / … (on-gradient text/border helpers as needed)
/* progress / state */
--state-ready-bg / -ready-fg        (green — ready now / can apply / accepted)
--state-soon-bg / -soon-fg          (amber — 1–3 months / pending)
--state-later-bg / -later-fg        (clay — 6 months / later)
--state-urgent-bg / -urgent-fg      (warm — expiring offers/invites)
--gradient-progress                 (pipeline connector / resume fill)
```
Add to `primitives.css`:
- `.ui-avatar` (+ `--initials`) — circle avatar with gradient initials fallback.
- `.ui-rail` + `.ui-rail__fade` — scroll-snap rail with edge fade + `--elevation`.
- `.ui-response-actions` — Accept(primary)/Decline(secondary) pair, full-width
  stack < `--bp-sm`.
- `.ui-readiness` pill states wired to `--state-*`.
- `.ui-stat--ready/-soon/-urgent` state modifiers (extend existing `ui-stat`).

Then refactor JS/CSS duplicates (SeekerHero, ProfileHub, HeroPhotoPickerModal,
MatchCardRail, FeaturedEmployerStrip, ReadinessSlider, JourneyPipeline,
SeekerSidebar, DashboardNav, SeekerDashboard) to reference the tokens — deleting
the inline hex maps.

---

## 6. Discovery card strategy

- `DiscoveryCard` (packages/ui) stays the canonical primitive — **class-level CSS
  only.** Add the shared `--elevation-hover` lift where it doesn't conflict with
  existing container-query/inline-style logic.
- Rail cards (Match, Featured) become a unified premium treatment via `.ui-rail`
  card styling + category-gradient tokens, fluid widths, correct benefit icons.
- Variants reuse the same shell, differing by `surface`/`cardState` (already wired):
  discovery · saved · matched · applied · offer · invite · featured.

---

## 7. Saved / matched / applied strategy

- **Saved:** section hero + "Apply now"-emphasis CTA on cards; `ui-empty` → Swipe/
  Seek. Mobile grid 1→2→3.
- **Matched:** lead with match score + reason chips; `ui-empty` explains how to
  improve matches (resume/preferences). Fix benefit icons + fluid widths.
- **Applied:** clear status badges (status-colored), mobile-collapsing benefit
  triad, `applied/[id]` timeline gets a progress indicator; quiet→clear Withdraw
  with confirm.

---

## 8. Resume / profile completion strategy

- Keep the 5-step stepper + server-action flow **exactly**; restyle only.
- Per-step intro (icon + one motivating line). Move progress label below the bar;
  show "Step n/5 · NN%".
- Compose `ui-field/ui-input/ui-textarea/ui-label/ui-help/ui-error`; `ui-category-
  badge`/`ui-chip` for tags/skills/categories.
- `.iconBtn` 28→44px. Sticky step footer on mobile (hairline + blur + safe-area).
- `ProfileEditForm`: group into sections with `ui-section-head`; replace outline
  selection with bg+border selected state; stack option/tag/footer rows at `--bp-xs`.

---

## 9. Offer / invite strategy

- Accept = primary (`--color-cta`), Decline = secondary, full-width-stacked on
  mobile (`.ui-response-actions`).
- Expiry uses `--state-urgent-*`; <24h shows an urgency banner (data-driven only —
  uses existing `expiresAt`).
- `ui-empty` copy explains what offers/invites are and what to do.

---

## 10. Map / travel / pins strategy

- `OpportunityMap` (presentational region index — no faked backend): responsive
  card widths (no overflow), category-gradient region headers, optional category
  filter chips using existing data. Keep `?focus=` deep-link.
- `TravelPanel`/`SchedulePanel`: status badges via `--state-*`, link destination to
  map, add loading/success/validation states to the Travel/Schedule **forms**
  (client UX only — server actions unchanged).
- `JourneyTimeline` already solid; tokenize JourneyPipeline colors.

---

## 11. Forms strategy

`ui-field` everywhere (resume, profile edit, travel, schedule, notif prefs). Real
states already exist (focus ring, placeholder, disabled, `aria-invalid`). Add
loading/disabled-on-submit + inline success/error on the bare Travel/Schedule
forms. Checkboxes → 24px in a ≥44px label hit zone.

---

## 12. Empty / loading / error state strategy

- **Empty:** retrofit every lifecycle page + rail to `ui-empty` (icon pill +
  display title + body + forward CTA). Replace apologetic copy with encouraging copy.
- **Loading:** adopt `ui-skeleton--shimmer`; fix `saved/loading` grid to collapse;
  give the message thread a bubble skeleton instead of `HostDetailSkeleton`.
- **Error:** keep `StatusCard` art (already reused by error.tsx routes).

---

## 13. Implementation phases

| Phase | Work | Key files | Risk |
|-------|------|-----------|------|
| **P3 Tokens/primitives** | category-gradient + state tokens; `ui-avatar`, `ui-rail`, `ui-response-actions`, `ui-stat` state mods; refactor JS/CSS hex dups | `styles/tokens.css`, `styles/primitives.css`, SeekerHero, ProfileHub, HeroPhotoPickerModal, MatchCardRail, FeaturedEmployerStrip, ReadinessSlider, JourneyPipeline, SeekerSidebar, DashboardNav, SeekerDashboard | med (JS hex removal — keep class contracts) |
| **P4 Landing** | hero photo-frame + tokens; StatusStrip→`ui-stat`/`--primary`; PrimaryActionCard accent+CTA; ProfileHub hero/stats; home route cards 2-up tier | home/page, SeekerHero, StatusStrip, PrimaryActionCard, ProfileHub | med |
| **P5 Cards** | rail unification, correct benefit icons, fluid widths, edge fade, card hover | MatchCardRail, FeaturedEmployerStrip, SavedCardGrid, LifecycleList, CardStatus | med |
| **P6 Lifecycle** | section heroes, `ui-empty`, benefit-triad mobile, action-pair hierarchy, confirm-withdraw | saved/applied/accepted/offered/invites/not-selected/withdrawn pages, InviteActions, OfferedActions, WithdrawButton, BucketChips, BucketPage | med |
| **P7 Resume/profile** | sticky CTA, 44px, `ui-field`, step intros, sections | ResumeBuilder, ResumePanel, SeekerResumeCard, ProfileEditForm, edit.module.css | **high** (validation/save — class-only) |
| **P8 Comms** | MessageList scannability+routing, NotificationList grouping+tappable, thread skeleton | MessageList, NotificationList, messages/notifications loading | low-med |
| **P9 Map/travel/schedule** | responsive map, status tokens, form states | OpportunityMap, TravelPanel, SchedulePanel, travel/schedule pages | low-med |
| **P10 Settings/profile** | tappable settings rows, 24px checkbox, profile polish | SettingsPanel, NotificationPrefsForm, settings page | low |
| **P11 QA** | lint, typecheck, build; 375/768/1440 sweep; fix regressions | — | — |

P3 ships first and is the keystone. P4–P10 apply it surface by surface; each keeps
the build green.

---

## 14. Exact files likely edited

**Foundation:** `apps/web/styles/tokens.css`, `apps/web/styles/primitives.css`.

**Components (`apps/web/components/seeker/`):** SeekerHero, ProfileHub, StatusStrip,
PrimaryActionCard, ReadinessSlider, HeroPhotoPickerModal, MatchCardRail,
FeaturedEmployerStrip, LifecycleList, CardStatus, SavedCardGrid, BucketChips,
BucketPage, JourneyPipeline, ResumeBuilder, ResumePanel, SeekerResumeCard,
MessageList, NotificationList, TravelPanel, SchedulePanel, SettingsPanel,
NotificationPrefsForm, SeekerSidebar, DashboardNav, SeekerBottomNav, SectionHeading,
InviteActions, OfferedActions, SeekerDashboard (+ each `.module.css`).

**Routes (`apps/web/app/(seeker)/`):** home, saved, applied(+[id]), accepted,
offered, invites, not-selected, withdrawn, resume, profile(+edit), messages(+[id]),
notifications, travel, schedule, settings, map (page/loading/empty modules as needed).

No edits to: contracts, db, server actions, DiscoveryCard JSX, auth, middleware.
