# Seeker lane (`apps/web/app/[locale]/(seeker)`)

Mobile-first seeker command center. Server components reading real per-seeker
rows through `@explore-and-earn/db`; the fixture fallbacks are dev-only.

## Routes

### Home + discovery

- `/home` — the seeker dashboard: next action, the three discovery doorways
  (LINKS, never embeds), an at-a-glance count row (saved / applications /
  conversations / offers), pipeline, matched rails.
- `/seek` — serious search. Filters live in the URL; every one maps to a real
  predicate in `searchListings` (the enumerated set is documented on
  `SeekFilterPopupValue`, and `tests/unit/seek-filters.test.ts` walks the whole
  chain control → param → parser → predicate → column).
- `/swipe` — one card at a time. Gesture, arrow keys, AND visible buttons.
- `/map` — Mapbox. Viewport-scoped result tray, host-placed pins with an
  explicit precision disclosure.

### Application lifecycle

- `/saved` `/applied` `/offered` `/accepted` `/not-selected` `/invites`
  `/withdrawn` — lifecycle buckets.

### Profile, community & account

- `/profile` `/resume` `/badges` `/journey` `/travel` `/schedule`
- `/community` — authenticated seeker space (D18); every path is auth-gated in
  middleware AND in `community/layout.tsx`.
- `/messages` `/notifications` `/settings` `/help` `/assistant`

## Conventions

- Lane-local components live in `apps/web/components/seeker` with a barrel
  `index.ts`.
- **One card system.** Every listing renders the canonical
  `@explore-and-earn/ui` `DiscoveryCard` through the
  `components/discovery/ListingCard` wrapper, which supplies ONE shared popup
  host per surface. Do not build a second card and do not fork the popup
  wiring — /seek did exactly that, which is why the card's newer popovers took
  three phases to reach the marketplace's main browse surface.
- Styling uses CSS modules + semantic tokens only. `px` appears only in
  media-query breakpoints.
- No matching/scoring logic here. Scores are READ from `match_scores`; the
  reason sentence is composed at render time from the stored component numbers
  (G34 — reason text is never persisted).
- **Honesty rules are law.** A field the host never filled in renders as
  unanswered, never as a default. `cardRecordCompleteness` in
  `@explore-and-earn/contracts` is the shared derivation, and the card's
  "what's missing" line comes from it.

## Navigation (D17)

- MOBILE dock: **Explore · Swipe · Saved · Applications · Profile**. This
  replaced the earlier Swipe · Map · Seek · Profile set; Map moved to the rail /
  drawer and to the "Map view" control on /seek. See the header comment in
  `components/seeker/SeekerShell.tsx` for the reasoning and what it cost.
- Secondary / scope nav is the shared `<ScopeShellNav>` — a left rail at
  ≥1024px, a hamburger drawer below it.
- The onboarding tour is **non-blocking** (D19): three anchored coachmarks in
  `components/seeker/SeekerCoachmarks.tsx`. Never re-introduce a modal tour.
