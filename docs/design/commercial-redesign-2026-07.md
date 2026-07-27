# Commercial redesign program — 2026-07-27

Founder directive (2026-07-27, full implementation authority): the pre-redesign
experience "does not communicate enough value, trust, quality, or
differentiation to justify the host pricing." Central conversion principle:

> Let the host build, preview, understand, and desire the product before
> billing becomes the activation gate.

This document is the binding spec for the program. It supersedes the
"pay-before-profile" funnel decision and the "locked 3-font stack" in
visual-system.md §2. It does NOT supersede the honesty rules (no fabricated
counts/testimonials/metrics; demo content always labeled), the design ratchets
(G50/G51/G52), or the money-path invariants shipped 2026-07-27.

## Current-state audit (verified 2026-07-27, main @ ab6fd6c)

- Fonts: Patrick Hand (display) + Cabin Sketch (accent) + Inter (UI), loaded in
  app/layout.tsx, consumed ONLY via --font-display/--font-ui/--font-accent
  (tokens.css + primitives.css). Zero literal font-name strings elsewhere.
- Theme: Light/Dark/System contract in lib/theme.ts; ThemeSwitcher rendered in
  GlobalHeader (public) + Host/Admin/Seeker shells + seeker Settings.
- Header: GlobalHeader carries community tabs, section nav, ThemeSwitcher, and
  a public auth menu that includes an ADMIN sign-in entry.
- Footer: four columns already (Explore/Hosts/Company/Legal); Explore carries
  Seek/Swipe/Map plus four category pages (clutter).
- Discovery: /seek, /swipe, /map ALREADY EXIST as distinct seeker routes with a
  separate dashboard cluster (saved/applied/messages/profile/settings/…).
  /map is a REAL Mapbox integration (MapView/MapViewLazy;
  NEXT_PUBLIC_MAPBOX_TOKEN live in prod). The ae registry's "maps: null" was
  stale and is corrected.
- The ONLY fake map is the homepage Map-mode preview card (decorative
  .mapCanvas with terrain shapes + ink pins in MarketplaceHome.module.css).
- Homepage sections: Hero(+search+trust badges+live peek), ThreeQuestions,
  AnnouncementRail, FeaturedJobs, DiscoverModes, CategoryGrid, DestinationGrid,
  FreeForeverBand (seeker-side "you never pay" — honest, keep), HostPitch,
  FinalCta.
- Host funnel (shipped this morning): /host/plans → Stripe checkout →
  /host/checkout/complete → onboarding. Payment IS the third meaningful screen
  — exactly what the founder now rejects.
- Entitlements: migration 083 gates create_my_host_profile on a PAID tier;
  the allowance trigger counts live/paused/under_review with plan-term 0 for
  tier 'none' — meaning DRAFTS ARE ALREADY UNGATED at the DB layer and
  PUBLICATION IS ALREADY DENIED for unpaid hosts. The pre-billing model needs
  only the profile-creation gate relaxed, not a new enforcement system.
- Pricing surfaces: /host/plans (three cards, honest, thin) + /for-hosts#pricing.
- Founding Host: FOUNDING_LOCKED_PRICING + FOUNDING_SEAT_CAP=100 in contracts;
  six dormant live Stripe prices exist; NO claim path, NO capacity tracking,
  NO UI (correctly de-advertised; audit doc marks it unimplemented).
- Add-ons: centralized in packages/contracts/src/pricing.ts (ADDON_PRICING);
  additional-listing add-on fully live; boost/announcement/invite-packs live.
- Analytics: PostHog wired (project exploreandearn/291166).
- Stripe test tooling: packages/stripe-seed (catalog + manifest).
- Imagery: Cloudinary removed 2026-07-27; NO photography pipeline exists (no
  Unsplash key on this machine). Marketing surfaces are gradient-first.
  scripts/seed-site-photos.mjs + public bucket `site-photos` await a key.

## Product decisions (numbered; the founder can veto any by number)

D1. One typeface: Manrope (weights 400–800), loaded once in layout.tsx. The
    THREE font-role tokens keep their names (--font-display/--font-ui/
    --font-accent) and all resolve to Manrope — personality moves from
    typeface novelty to weight/scale/spacing. Zero component churn.
D2. ThemeSwitcher leaves the PUBLIC header. It stays in seeker Settings
    (Appearance) and in authenticated shells (workspace chrome, not marketing).
    The Light-default theme contract (founder 2026-07-22) is unchanged.
D3. The admin sign-in entry leaves the public auth menu (admins know the URL).
D4. Footer Explore column: Seek/Swipe/Map + one "Browse all jobs" link.
    Category pages remain live for SEO, reachable from /jobs and /seek filters.
D5. Homepage Map-mode card: the decorative canvas is replaced with an honest
    preview built from the real listings the section already receives
    (location rows + real pin count), CTA to the REAL /map.
D6. Pre-billing host mode ("prospect"): hosts can create an account, create a
    profile, brand it, draft listings, preview everything, and tour a demo —
    WITHOUT paying. The PAID line is: publish/discoverable/applicants/
    messaging/announcements/real analytics. DB enforcement: relax ONLY the
    create_my_host_profile paid-tier gate (migration 086); publication remains
    denied by the existing allowance trigger (plan term 0) and 082's
    transition rules. Host state model reuses host_subscriptions:
    no row/tier none+no sub = PROSPECT; tier none+billing lapsed = LAPSED;
    paid tier = ACTIVE; cancelled = CANCELED. No new state storage.
D7. "I just want to browse first" becomes a first-class secondary action on
    /host/plans and checkout-adjacent screens → lands in the host workspace
    (prospect mode) with a persistent, non-hostile activation banner:
    "Your workspace is ready. Activate a plan when you want to publish."
D8. Enterprise demo workspace: canonical demo org "Explore & Earn"
    (Coeur d'Alene, Idaho; Enterprise; Verified), seeded as FIXTURES (the
    existing discovery/fixtures.ts pattern), never as production DB rows.
    Every demo surface is labeled ("Demo data" / "Example performance").
    Demo job: "Lakeside Guest Experience & Adventure Operations", $21–25/hr,
    May–Sept, housing + meals included, season bonus, ~40 h/wk.
D9. Imagery: real-UI previews + the token gradient system NOW; photography
    slots exist and fill via seed-site-photos.mjs when the founder supplies
    UNSPLASH_ACCESS_KEY (EXTERNALLY BLOCKED item). No broken remotes, no
    stock-photo fakery, no invented brand marks. The in-repo icon/wordmark
    (app/icon.tsx + apple-touch PNG) is the only logo used.
D10. Founding Host: becomes a REAL config-backed program or stays invisible.
    Admin-configurable capacity/claimed/deadline (new table, service-role
    written); UI renders counts/countdown ONLY when configured and never
    fabricates; checkout path uses the six dormant founding Stripe prices;
    claims counted transactionally against capacity. Until the founder sets
    capacity+deadline, the section renders the program as "coming" WITHOUT
    numbers or countdowns.
D11. Pricing page becomes a value narrative (hero → what you get → product
    previews → plan cards → entitlement matrix → Founding Host → add-ons →
    ROI/comparison → FAQ → billing terms), with a "Traditional listing
    platform vs Explore & Earn" comparison. CoolWorks is named ONLY where
    claims are verified against current public info; otherwise the generic
    comparison stands. NO price changes: $199/$399/$749 & annual = 10×monthly
    stay as founder-locked.
D12. Billing/checkout page: two-column activation summary (what you get, exact
    amount, renewal, limits, cancellation terms, what happens next) with
    "Continue building my profile" as the escape hatch.
D13. Team seats stay ABSENT from all plan claims until access exists (the
    teamSeatCapability guard test remains the enforcement).
D14. Billing verification: (a) Stripe TEST-MODE full lifecycle via
    stripe-seed + a test-clock script; (b) owner-only LIVE smoke: restricted
    single-use 100%-discount-minus-minimum coupon on a private $1-2 internal
    price, allowlisted by Clerk id, metadata internal_billing_test=true,
    excluded from revenue reporting, immediately refundable; (c) admin
    entitlement grant/revoke tool for state testing. No full-price personal
    purchase required.
D15. Funnel analytics: PostHog events for every step in the brief's list
    (host_landing_viewed … first_job_published), named snake_case, no PII
    beyond ids already in PostHog.

## Phases

- P1 Design system + chrome (fonts, switcher, header trim, footer, homepage
  map card) — THIS PR.
- P2 Pre-billing host mode (migration 086 + browse-first + activation banner +
  funnel events).
- P3 /for-hosts rebuild + Enterprise demo workspace + product tour.
- P4 Pricing narrative + billing page + Founding Host program + add-on
  presentation.
- P5 Billing verification tooling (test-mode lifecycle, owner-only live smoke,
  admin entitlement tool).
- P6 Verification (responsive, WCAG 2.2 AA pass, visual review, funnel check).

Each phase is its own PR. P2/P3 parallelize; P4 follows P2; P6 last.

## Externally blocked

- Photography: needs UNSPLASH_ACCESS_KEY (or a founder-supplied asset pack).
- Founding Host go-live: needs founder-set capacity + deadline (D10).
- New brand assets (logo/wordmark beyond the in-repo mark): founder-supplied.
- Live-smoke execution: needs a real card at ~$1–2 once (owner).
