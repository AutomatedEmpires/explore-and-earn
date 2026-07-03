# Host Dashboard — Premium Restyle Plan

_Executable companion to HOST_DASHBOARD_AUDIT.md. Builds on the
`restyle/premium-design-system` foundation. CSS/markup-class only — no routing,
auth, RLS, server-action, contract, or pricing changes._

## 1. Design direction

A **marketplace command center**, not an admin panel. Adventure-seasonal identity
(warm paper + sky-blue action, Patrick Hand display / Inter UI) with Stripe-grade
clarity and Linear-grade spacing. Depth via the foundation's `--elevation-card`
whisper-lift; gradients reserved for hero + boost moments; one dominant action per
screen; status always legible (label + color, never color-only).

## 2. Mobile-first layout strategy

Design at 375 up. Single-column stacks; KPI grids `repeat(2,1fr)` at xs →
`repeat(3–4,1fr)` at md. 44px (`--tap-min`) minimum on every control. Sticky mobile
primary CTA on form-heavy pages. Desktop (≥1024) gains richer two-column panels and
a sticky action rail on the applicant detail. Use `--bp-xs:380`, `--bp-md:768`,
`--bp-lg:1024`.

## 3. Information architecture (dashboard)

Priority order, top → bottom:
1. **Identity hero** — company name, plan/verification chip, profile completeness,
   and the single strongest next action (Create listing / Review applicants).
2. **KPI row** — Live listings · New applicants · Pending actions · Unread (compact
   stat cards; pending/new get primary emphasis when > 0).
3. **Needs attention** — actionable list (pending reviews, unread, drafts) each with
   a deep link; collapses to "All caught up" celebration.
4. **Listing performance** — top per-listing stats as cards.
5. **Quick actions** — Create listing · Review applicants · Boost · Edit profile ·
   Messages as premium tiles.
6. **Recent activity** — timeline.
New-host empty state replaces 2–4 with a "Create your first listing" hero.

## 4. Navigation strategy

Keep the founder-locked `HostBottomNav` (style only — already de-hardcoded +
focus-fixed in foundation) and `GlobalHeader scope="host"`. Add `--elevation-card`
separation. Ensure all tap targets ≥ 44px.

## 5. Component strategy — the host-system layer (`apps/web/styles/host.css`)

Global `host-*` classes (mirrors the `ui-*` / `shell-*` convention), imported once
in `(host)/layout.tsx`:
- `.host-panel` (+`--raised`, `--flush`) — the canonical surface.
- `.host-panel__head` / `__title` / `__eyebrow` / `__action`.
- `.host-hero` — gradient identity band.
- `.host-kpi` (+`--primary`) — compact metric card.
- `.host-stat` row (label/value) for dense lists.
- `.host-status` pill with `data-state` (live/draft/paused/closed/archived/
  under_review/boosted/featured) → token colors.
- `.host-boost-badge` — gradient-gold premium marker.
- `.host-action-tile` — icon + label + chevron quick action.
- `.host-attention` row.
These compose the foundation tokens; no new color values.

## 6. Card / list / table strategy

- **Panels**: `.host-panel--raised` replaces bare `Card` where hierarchy matters.
- **Lists**: dense `.host-stat` rows; tabular-nums for figures.
- **Tables** (analytics): reduce to 14px + wrap titles ≤ 640px; horizontal scroll
  with sticky first column where needed.

## 7. Applicant review strategy

- **Card** (`HostApplicantCard`): avatar/initials, name, applied-listing, match
  `Meter`, category chips, timeline, status pill, **Review** primary + Message/
  Shortlist/Offer secondary (existing actions only). Human, scannable, ≥44px.
- **Detail** (`HostApplicantDetail`): mobile = stacked summary → fit → resume →
  actions; desktop = two-column with a **sticky action panel** (status, message,
  offer, reject). Keep `StatusActions` + resume popup wiring intact.
- **Pipeline** (`HostPipelineBoard`): stage columns with count headers, premium
  cards, horizontal scroll on mobile with an edge affordance.

## 8. Listing management strategy

`HostListingCard` → marketplace asset: optional cover (if `coverPhotoUrl` present),
status pill top-right, title + location + dates, **H/M/P chips**, applicant count
with "new" emphasis, Boost as a labeled gold action, Manage primary; destructive
Archive moved into an overflow/secondary position; 44px controls; `--elevation-card`
with hover lift. `HostListingsManager` grid: 1-col xs, 2-col md, 3-col lg.

## 9. Boosted / featured strategy

`.host-boost-badge` + a boost panel using `--gradient-gold`. Language: "Boosted
visibility," "Featured placement," "Homepage slot," "Matched seeker reach,"
"Priority discovery." `BoostListingPopup` restyled to feel commercial. Presentational
only — no billing logic invented; real Stripe actions on billing page untouched.

## 10. Forms strategy

`ListingForm` / `HostProfileForm` adopt the foundation `--field-*` system (focus
rings, placeholder, 44px), grouped `.host-panel` sections with `__eyebrow` headers,
inline help, required clarity, and a sticky mobile submit bar. No field `name`/
`action`/validation changes.

## 11. Empty / loading / error states

- **Empty**: `.host-empty` wrapping `.ui-empty` with host copy + a primary CTA per
  surface (no listings → Create; no applicants → Share listing; etc.).
- **Loading**: shimmer skeletons (foundation) sized to the new cards; upgrade
  `HostDetailSkeleton`.
- **Error**: tokenized inline `.ui-error`; de-hardcode the host error hexes.

## 12. Implementation phases

| Phase | Work | Key files |
|-------|------|-----------|
| H1 | host-system CSS layer | `apps/web/styles/host.css`, `(host)/layout.tsx` (import) |
| H2 | shell + section header | `(host)/layout.module.css`, `HostSectionHeading.tsx/.module.css` |
| H3 | **dashboard command center** | `HostDashboard.tsx/.module.css` |
| H4 | listing card + manager | `HostListingCard.*`, `HostListingsManager.*` |
| H5 | applicant card + pipeline + detail | `HostApplicantCard.*`, `HostPipelineBoard.*`, `HostApplicantDetail.*` |
| H6 | listing form | `ListingForm.*`, `HostListingForm.*` |
| H7 | profile + settings | `HostProfilePanel.*`, `HostProfileHero.*`, `HostSettings.*` |
| H8 | boost + billing | `BoostListingPopup.*`, `(host)/host/billing/page.tsx` |
| H9 | messages + invites | `HostThreadGroups.*`, `HostThreadList.*`, `InvitesList` |
| H10 | QA | lint, typecheck, build, dev render @375/768/1440 |

## 13. Exact files likely edited

New: `apps/web/styles/host.css`.
Edited (high-confidence): `(host)/layout.tsx` + `layout.module.css`,
`HostDashboard.tsx` + `.module.css`, `HostSectionHeading.tsx` + `.module.css`,
`HostListingCard.*`, `HostListingsManager.*`, `HostApplicantCard.*`,
`HostApplicantDetail.*`, `HostPipelineBoard.*`, `BoostListingPopup.*`,
`HostProfilePanel.*`, `HostAnalyticsDashboard.module.css`, `HostListingForm.module.css`.
Each edit is markup-class/CSS only; client-component handlers, server actions, and
data props are preserved verbatim.
