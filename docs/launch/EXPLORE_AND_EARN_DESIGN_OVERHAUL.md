# Explore & Earn — Design Overhaul (Glacier)

> Branch: `design/product-experience-overhaul` · Base: `main` @ `5989853` (PR #245)
> Date: 2026-07-13 · Scope: founder-directed visual + experience overhaul for launch.
> Not a spec — a record of what was actually implemented, verified, and what remains.

This overhaul was iterative and founder-steered. It began as a convergence pass on the
warm "Adventure Paper & Sky" system, then the founder redirected the entire visual
direction to **Glacier — Ice & Chrome** and progressively reshaped the card, the immersive
surfaces, and the dashboards. This doc reflects the end state on the branch.

---

## 1. Baseline

Mobile-first, card-first work-travel marketplace (Farm · Maritime · Remote · Seasonal) on a
pnpm + Turborepo monorepo: Next 15 App Router (`apps/web`), shared primitives (`packages/ui`),
typed contracts (`packages/contracts`), db access (`packages/db`). Auth = Clerk, data =
Supabase, payments = Stripe, email = Resend. A **Dev Mock Bench** (`ee_dev_role` cookie,
webpack dev path only) renders every surface as seeker/host/admin with fixtures, so most of
the app runs locally without secrets.

## 2. Design direction — Glacier (Ice & Chrome)

Founder redirect (2026-07-13): replace the warm-pastel palette with **Glacier** — a cool
ice-white base, chrome/graphite neutrals, and a **glacier-blue → teal action gradient**.
Included benefits read **emerald**, not-offered reads **rose**, and **gold is reserved for the
paid register** (boosted · featured · founding). Strong, gradient-forward, rounded, "things
pop." Implemented at the token-primitive layer in `apps/web/styles/tokens.css` (V3), so every
semantic token and surface — page grounds, cards, buttons, badges, status — recolored from one
edit. Token NAMES are stable; only values changed.

Fonts unchanged (Patrick Hand display / Inter UI / Cabin Sketch accent). Icons remain Phosphor
via the `<Icon>` registry (CI guardrail G30). Photos framed, never filtered.

## 3. Protected / preserved

- **Canonical DiscoveryCard** — still the one card on every surface. The founder explicitly
  authorized redesigning it; it is now a single premium Glacier design (no per-category tint),
  photo-forward, host always verified, one category badge top-right with the match-center /
  boosted-under-category rule, color-only Housing/Meals (✓/✕ by colour, descriptor in the
  popup), compact single-row triad, a colour-coded match bar, and a **Skip · Apply · Save
  20/60/20** action bar. Its public API/row-order/tap-map stay stable; badges never overlap
  at any width (inline-size container).
- **Four categories** (Farm · Maritime · Remote · Seasonal + internal `mix`) — unchanged.
- **Seeker bottom dock** (Swipe · Map · Seek · Profile) — unchanged on mobile.
- **PR #237 convergence** (anonymous discovery, assistant resume, honest next-actions, LCP) —
  preserved (merged before this branch); not regressed.
- **No fabricated data** — de-fabricated the analytics that violated it (removed synthesized
  sparklines, a static "Optimizable" stamp, a false farm icon); pricing only from contracts.

## 4. What changed (by area)

**Design system** — Glacier token system; shared `.ui-pressable`; monetization ranking util
(`apps/web/lib/ranking.ts`, Boosted > Enterprise > Matched≥90 > Professional > Starter — never
hides, only orders); `ListingHost.tier` + host-profile `narrative` schema (migration 059).

**Discovery card** — full Glacier redesign + refinements (see §3); skeleton parity + warm
shimmer; recovery empty states.

**Homepage** — "Built for seekers, by seekers" anthem, full-bleed hero with a **dynamic
rotating image** bucket, Three-Questions band, Discover-your-way (Seek/Swipe/Map), founding-
host pricing, columned footer.

**Discovery modes** — Seek: sort by the 4 lanes + filter (pay slider day/hour · housing ·
meals · visa · begins-range). Swipe: immersive Tinder (only the card, drag + desktop arrows,
skip/save toast + undo, sort/filter). Map: immersive Zillow-style (full-bleed, floating
sort/filter, category pins, compact pin-card popup, swipe-up in-view listing sheet); token
threaded server-side.

**Immersive shells (seeker · host · admin)** — a shared `ScopeShellNav`: a persistent left
rail at ≥1024px and a hamburger drawer below that for all secondary nav; the mobile bottom
dock stays for primary seeker modes. Dashboards are content-first + personalized ("Welcome
back, {name}" → the one next action → clickable pipeline → matched/boosted rails; host →
what-needs-attention; admin → operational queues). No bottom selector clusters.

**Community** — immersive feed (no helper hero, header hides on scroll), 5 defined reactions,
photo captions + up to 3 tags, host-only announcements (megaphone + host + linkified body),
and feed regulation (per 10 posts ≤6 photos / 2 listings / 2 announcements).

**Seeker + host profiles** — seeker landing leads with résumé + offers + matched/boosted rails,
routing tucked. Host public profile is a showcase (logo + separate cover, all lanes, a 10-day
weather widget, About / Team / Activities / Perks / Why-work sections, live listings).

**Auth** — two-route sign-in/up (I'm a seeker / I'm a host) + header login chooser (Clerk
wiring untouched). Host listing composer rebuilt into a 7-step wizard with a live card preview.

**Benefit popups** — housing/meals/pay popups now carry the descriptor the card dropped, plus
an "always verify accuracy with the host" note.

**Dev catalog** — `/dev/catalog` (dev-only, fixtures): every card state + every popup at any
screen size (375/430/768/1280/1440). The founder's visualization tool.

**Crash/resilience fixes** — `/seek` invalid `"use server"` export; `/seek` + `/swipe` degrade
to the public feed on a personalization fault; phantom-token purge.

## 5. Verification

- **Typecheck** (`apps/web` + `packages/ui` + `packages/contracts` build) — green.
- **Lint** — full `eslint .` on `apps/web` + `packages/ui` green (incl. G30 icon guardrail).
- **Unit tests** — `apps/web` vitest green.
- **Browser (dev bench, 375 + 1024)** — homepage, `/for-hosts`, `/seek` (+ seeker dashboard),
  `/swipe`, `/community`, `/profile`, `/dev/catalog`, and card states verified rendered.

## 6. Remaining / risks

- **Local-env verification limits:** host + admin dashboards and the live Mapbox map do not
  render in the local dev bench (no Supabase keys; the map also hits a `react-map-gl@7` /
  `mapbox-gl@3` or dev-CSP init issue — errors before any network request, with the token
  present and WebGL available). The code is green and follows the verified seeker pattern;
  verify these in a configured deploy. If the map is blank there too, align the map deps.
- **DB wiring:** `host.tier` and the host `narrative` column work off types + fixtures; the DB
  row-mappers/queries + migration 059 need applying to surface real values.
- **Not fabricated-data-safe by construction only:** the weather widget is a shell (honest
  "connects at launch" state) until a weather feed is wired.
- **Phase C in progress:** chatbot NL search, photo systems, host onboarding, reaction glyphs,
  monetization/DB plumbing.

## 7. Launch verdict

**Ready for controlled beta** on the seeker + public surfaces (verified end-to-end locally),
pending the deploy-only checks (host/admin/map render) and the DB wiring above. Not a generic
reskin — the product direction is legible in one scroll on every surface.
