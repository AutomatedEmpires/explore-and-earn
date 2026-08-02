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
  → SUPERSEDED by V2 D16: Wikimedia Commons pipeline needs no key.
- Founding Host go-live: needs founder-set capacity + deadline (D10).
- New brand assets (logo/wordmark beyond the in-repo mark): founder-supplied.
- Live-smoke execution: needs a real card at ~$1–2 once (owner).

# ═══════════════════════════════════════════════════════════════════
# V2 — FULL PRODUCT REDESIGN (founder directive, 2026-07-27 late)
# ═══════════════════════════════════════════════════════════════════

The founder rejected the V1-era surfaces wholesale via a 20-screenshot
baseline (screenshots not received; the directive's verbal per-screen findings
are the operative baseline) and an 85-criterion acceptance list. V1 decisions
that still stand: D1 (Manrope), D2/D3 (no public switcher/admin entry), D6/D7
(build-first, browse-first), D10 (Founding Host dark-until-configured), D13
(no seat claims), D14 (billing verification), honesty rules, ratchets, money
invariants. Explicitly SUPERSEDED:

- D9 gradient-first imagery → D16 photography is a REQUIRED product layer.
- P3's three-step tour modal → D19 anchored coachmark tour.
- The V1 plans page presentation → D21 commercial decision surface.
- Public Community as a role-neutral top-level destination → D18.

## V2 decisions

D16. PHOTOGRAPHY PIPELINE, no key required: scripts/seed-site-photos.mjs gains
     a Wikimedia Commons source (API needs no credential). Each asset records
     author, license (CC-BY/CC-BY-SA/PD only), source URL, and license URL in
     a manifest stored beside the images in the public `site-photos` bucket
     and mirrored in-repo; attribution rendered where the license requires it
     (a /credits surface + alt-text discipline). Curated queries: Coeur
     d'Alene lake, lake cabins/lodges, paddleboarding, docks, trail work,
     commercial kitchens, seasonal crews. EXIF location stripped on ingest.
     If the founder later supplies an Unsplash/Pexels key the same manifest
     shape absorbs those sources.
D17. ROLE-SCOPED CHROME: role pill (Seeker/Host/Admin) beside the wordmark;
     no pill signed-out; host top bar reduced to search/notifications/
     messages/create/account (no rail duplication); host rail regrouped
     primary (Overview, Listings, Applicants, Outreach, Messages,
     Announcements, Analytics) / business (Employer profile, Team, Billing) /
     support (Coach, Settings, Help). "Invites" → **Outreach** (invites remain
     a state within it; routes get redirects). "Assistant" → **Recruiting
     Coach**.
D18. Community becomes an authenticated SEEKER space. Signed-out header: For
     Seekers / For Hosts / Sign in / Get started. Community reachable via the
     For Seekers menu → /sign-in?role=seeker&returnTo=/community with safe
     return handling; no pre-auth profile creation anywhere (verify server
     truth, not just nav). Route-access matrix tested for guest/seeker/host/
     team/admin/demo.

     SHIPPED (phase C). What was actually wrong: /community was already outside
     the public matcher, but NOTHING OWNED THE SIGNED-OUT ANSWER, and Clerk's
     auth.protect() gives two — a browser was sent to `signInUrl`, which with no
     NEXT_PUBLIC_CLERK_SIGN_IN_URL configured is Clerk's hosted Account Portal
     (off-domain, no role, no return target), while every non-document request
     (crawler, unfurler, curl, fetch) got notFound() and read as a plain 404.
     Same class as the /swipe and /for-hosts/demo misses. Fixes: a
     `protectedFunnel` entry keyed on lib/communityRoutes.isCommunityPath, so
     every Community path — deep links included — 307s to
     /sign-in?role=seeker&returnTo=<exact path+query> in BOTH middleware
     branches; a server-side gate at (seeker)/community/layout.tsx as the
     in-render backstop; `returnTo` accepted beside Clerk's `redirect_url` and
     validated by one function (lib/authRedirect) at the middleware, the
     sign-in page, and the onboarding wizard's last step; a host without a
     seeker profile gets an explicit "join as a seeker" screen and no silent
     conversion. Nothing on the path mutates — the ROUTE flow never attempts
     the write the database was already refusing.

     PRICING LINK DEVIATION: the For Hosts menu points "Pricing" at
     /for-hosts#plans, not /host/plans. /host/plans is a private dashboard
     segment (lib/hostRoutes), so the literal reading auth-walls a prospect
     before they see a number — the pay-before-you-look funnel D6/D7 removed.
     The public page publishes the same founder-locked prices and its cards
     lead into /host/plans for anyone ready to activate.
D19. TOUR: anchored, one-at-a-time, persistent-progress coachmarks attached to
     real controls (the P3 ProductTour foundation evolves; the blocking modal
     dies). Resumable from Help.
D20. DEMO V2: the /for-hosts/demo becomes an immersive read-only Enterprise
     workspace mid-season: 7 roles (5 live incl. one closing-soon, 2 drafts),
     96 applications reconciling exactly across stages (21 new / 18 reviewing
     / 12 saved / 9 interviews / 7 offers / 5 accepted / remainder
     not-selected+withdrawn), 34 outreach invitations (19 accepted), message
     threads, 3 published + 1 scheduled + 1 draft announcements, populated
     analytics, team + plan usage, weather labeled "Sample data", view-as-
     seeker, session-local stage moves + reset, noindex, zero production
     writes. Aggregates MUST derive from records (single fixture source with
     derivation functions, not parallel constants).
D21. Plans/billing surfaces dedup: ONE commercial decision surface pattern
     (previews → comparison → add-ons → founding → terms) feeding /host/plans
     and the activation page; Billing = subscription/account-value center
     (usage, invoices, add-ons, honest value summary), never a second plans
     page; Settings links to Billing, never re-renders it.
D22. SURFACE SYSTEM: retire "white rounded card on pale blue" as the default.
     Warm off-white canvas token, three surface levels, selective borders/
     shadows, radius hierarchy (controls 8–12 / cards 14–18 / feature 20–24),
     desktop type scale enlarged (product page titles 32–40), tabular
     numerals for metrics/prices, full-bleed where photography leads. Palette
     direction: ink/navy text, lake-teal action, alpine-green identity,
     sky demoted to status, gold = premium only. Token re-valuing over
     renaming (Tier-1 primitives re-valued; semantic names stable).
D23. EMPTY/LOADING/ERROR/GATED discipline: every major route ships all four,
     with empty states that teach (template/example/demo links), no
     zero-value donut, no giant empty slabs. Demo never shows empty surfaces.
D24. Host overview = recruiting command center (identity/season band incl.
     sample-labeled weather, hiring-pulse KPI strip with comparisons, Needs
     Attention queue, pipeline, rich listing-performance cards, calendar,
     communications, plan usage) — deduplicated tasks, evidence-linked
     diagnoses only.
D25. Analytics: real workspace (controls, trends, funnel, sources, listing
     comparison, plain-language diagnoses linked to evidence); accessible
     table equivalents; sample data always labeled.
D26. Coach: context-embedded assistance + a workspace summarizing real state;
     never invents data; confirms before mutations; useful without the model.

## V2 phases (each = PR(s); agents execute; orchestrator merges)

- A  Photography pipeline + asset ingestion + credits surface  [critical path]
- B  Design-system v2 (tokens/surfaces/type) + role shells + nav (D17/D22)
- C  Public IA + Community auth correction + homepage v2 (D18)
- D  Demo v2 (D20) + coachmark tour (D19)
- E  Host onboarding v2 (welcome, previews) + plans surface v2 (D21)
- F  Host workspace v2 (overview D24, listings, applicants, outreach,
    messages, announcements, analytics D25, coach D26, billing/settings D21)
- G  Seeker surfaces v2 (For Seekers, Seek/Swipe/Map polish, dashboard,
    community-as-seeker-space)
- H  Admin v2 + final QA (visual regression, route-access matrix, a11y,
    perf, screenshots at 390/768/1440)

Sequencing: A ∥ B first; C after B; D after A+B; E/F after B (D fixtures
feed F empty-state examples); G after C; H last.

## Redesign W — the world-class program (founder directive 2026-07-29)

Standing mandate: page-by-page redesign of every surface to an investor-ready
standard ("you determine" — direction selection delegated). Locked application
truths: the mobile dock (Explore | Swipe | Saved | Applications | Profile),
role-scoped headers, the dashboard as its own surface, Community, exactly four
categories (maritime/remote/seasonal/farm), and the DiscoveryCard as canon.

### W1 — Seeker dashboard ("Basecamp"), delivered
Chosen from three built directions (Basecamp / Atlas / Field Desk; comps and
comparison in the program workspace). Structure = the season's own shape: a
written lede composed from real state; the pending offer as a full object
(photo, facts, expiry, actions — never a sentence); "This week" as a
deadline-ordered queue; the season timeline drawn only from real dates;
readiness; applications with "last movement / next step" (from
applications.reviewed_at) and retired-ink closed rows; deadline-sorted
watching; the clickable five-stage pipeline; matches last. Honesty contract
pinned in tests (season-board.test.ts): no date → no claim; an unreadable
offer still surfaces as a claim with a destination, never facts. Typeface
stays Manrope alone (a display-serif proposal is parked as its own decision).
D27: the number-is-the-pixel spacing scale, token-only color, and the V2
guardrails carry unchanged into every W surface.

### W2 — Host dashboard ("the host's morning briefing"), delivered
PR #307. hostLede() composes the written briefing from the SAME attention
queue the page renders (workspaceModel.ts) — lede and list cannot disagree;
attentionActionLabel gives every queue row one verb; first-run quieting
renders header + queue + demo band only until real signals exist; cover
honesty strengthened (no cover → nothing renders).

### W3 — Seeker discovery (/seek, "the marketplace speaks for its page"),
delivered
PR #308. W-voice header over the untouched browse machinery: eyebrow "The
marketplace" → "Seek." → a lede claiming only page-proved facts (fetched-page
counts, stamped match counts, the more-pages flag — the server never fetches
a total). Elevated zero-inventory empty state (production's live face) and
the filter dead-end recovery pattern: one removal chip per active filter,
each a plain link dropping exactly that param. Card/filters/sort/saved
searches untouched.

### W4 — Search & results (/search · /jobs · /jobs/{lane}), delivered
The public acquisition tier gets one coherent funnel: /jobs is the storefront
(the homepage's primary CTA target — Basecamp header, a no-JS GET search band
handing q to /search, the four founder lanes, browse + host bands, lane
ItemList JSON-LD); /jobs/{lane} are the keyword landings (W-voice hero over
the lane gradient, a state lede written from the rendered rows, per-lane
opengraph-image cards); /search is the public query door (full Basecamp
rebuild, /seek-parity filters incl. visa + begins-within, pagination,
breadcrumb JSON-LD, the two-worlds empty state pinned by
tests/unit/search-lede.test.ts).
Defects closed in the same pass: /search shipped with an ORPHANED stylesheet
(components/search/search.css was imported by nothing — the live page was
unstyled) and zero inbound links; the four lane pages lost og:image /
twitter:image / og:site_name / og:type to the Next shallow-metadata-merge
(builder now restates siteName/type, the segment's own opengraph-image.tsx
supplies the card, and category-landing.test.ts pins the fix); the bare
/search empty state blamed filters the visitor never applied; empty lanes
rendered the four lane links twice. The canonical search story is deliberate:
/seek stays the flagship (WebSite SearchAction target, sitemap 0.9), /search
is the deep-linkable public door (0.7) — now reachable from /jobs and every
lane page.

### W5 — Opportunity detail (/listing/[id]), delivered
An ELEVATE pass (the page's honesty machinery — stored-fit resolution, benefit
evidence, sourced gating — was already strong and is untouched). Shipped: pay
now renders through the founder formatCompensation contract (the inline roll
ignored compensationMaxCents and printed "See listing" — a named invention);
the hero gains the Basecamp signature (display rank + gold full-stop kept out
of the accessible name, a written lede composed clause-per-fact by
listingLede.ts, unit-pinned) and a COMPACT posture when no cover photo exists
(the old 62vh reservation rendered a viewport of empty gradient); desktop
>=1024px becomes a true two-column read with a sticky deal rail (pay / season
/ housing / meals + the posture-aware actions — one ApplyButton, fixed bar on
mobile, in-rail on desktop); apply-flow hardening (already_applied resolves to
the applied state instead of printing a machine string, unknown errors always
fall to the generic sentence, Submitting… pending state, focus survives the
applied swap, sourced CTA announces it leaves the platform, guests on sourced
listings get a sign-in door); a detail-shaped loading.tsx (the ancestor
boundary showed a discovery grid that lied about the page shape) and a
listing-true not-found.tsx in the Basecamp voice (generateMetadata now RETURNS
not-found metadata instead of throwing, so the route-local boundary — not the
site-wide cosmic-joke 404 — renders for gone listings; "Page not found" title
+ noindex kept for the crawl/e2e contract); "Not stated" no longer wears
asserted-fact styling (muted, regular weight, derived from the same
benefitStateLabel result) in the triad, glance, and rail; honesty caveats on
connectivity/vessel facts move from shouty tracked micro-caps to a legible
note style; SourcedNotice links become dark-aware (--color-cta — they were
~1.6:1 on the dark banner); the host block gains its missing h2 (via
ListingSection); the dead pre-honesty component branch (ListingDetail,
BenefitTriadDetail, ApplyForm, ImageGallery, SeekerFitSignal, toDetailData) is
deleted. Verification note: production inventory is zero, so the live-probeable
W5 surface is the 404 face; populated-state evidence is the bench fixture at
390/768/1440 plus the keyless e2e smoke pins (fixture h1 + visible triad +
not-found title all green). Known environmental e2e failures on /seek and
/host (Supabase unreachable from the WSL harness; those pages predate the
read-fault degradation pattern) are pre-existing and chipped as their own
scoped fix.
