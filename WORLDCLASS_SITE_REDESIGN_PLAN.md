# Explore&Earn — World-Class Redesign & Production Plan

_Companion to `WORLDCLASS_SITE_AUDIT.md`. A practical execution plan, not vague design advice._
_Written 2026-06-15 against branch `restyle/premium-design-system`._

> **Governing reality.** Explore&Earn already has a **founder-locked design system**
> ("Adventure Paper & Sky", `tokens.css`) and a substantial `ui-*` primitive layer. AGENTS.md §6
> forbids inventing visual direction or bypassing tokens; §4 forbids touching auth, schema, Stripe,
> matching, RLS, and pricing values without founder approval. So this plan is **elevation within the
> locked system + additive production hardening**, never a from-scratch reskin. Where a section would
> require backend/founder work, it is marked **[GATED]**.

---

## 1. Product positioning

Explore&Earn is a **premium discovery marketplace for lifestyle work** — seasonal, remote, travel,
hospitality, maritime, farm, ranch, adventure, and work-exchange. The wedge is **radical upfront
transparency**: every listing answers **Housing / Meals / Pay** before you click in. Seekers are
free, forever; hosts fund the marketplace via subscription + boosted placement. Voice: human,
trustworthy, adventurous — not sterile SaaS gray, not childish.

## 2. Unified visual direction

Keep "Adventure Paper & Sky": warm paper + ink base (field-journal soul) lifted by cool sky-blue
brand actions, chrome/graphite neutrals, earthy clay/gold accents. Borders-first surfaces with
*whisper* elevation; hand-drawn photo frames (frame-not-filter); Patrick Hand display + Inter UI;
Streamline Freehand icons via the `<Icon>` registry only. **Vary imagery + accent per category,
never the component system.**

## 3. Design token strategy

Tokens are the contract. Feature code references **TIER 2 semantic tokens only** (never TIER 1
primitives, never raw hex). The token layer is essentially complete: surfaces, ink, category accents,
triad, status/lifecycle, spacing (2px scale), radius, elevation, motion, breakpoints (incl. `--bp-xs`),
typography, `--tap-min`, gradients, and `--field-*`. **Remaining token work:** retire the last raw
hexes in `StatusCard` into `--gradient-state-*`/`--color-gold`; ensure new surfaces consume gradient
+ elevation tokens instead of re-rolling.

## 4. Typography strategy

Display = Patrick Hand (titles, hero, section heads). UI/body = Inter. Accent = Cabin Sketch
(marketing only). Use the locked size/lh pairs (`--type-display` → `--type-label`). Weights 400/500/600
only. `next/font` with `display: swap` is already wired — no CLS regressions.

## 5. Layout / grid strategy

Mobile-first single column → progressive multi-column at `--bp-sm`/`-md`/`-lg`. Page shells via
`host-page`/`ui-card`/section primitives. Content max-widths for readability on legal/marketing.
Rails use `.ui-rail` (scroll-snap + edge fade). No fixed desktop-first grids that don't collapse at 375.

## 6. Mobile-first strategy

Design every surface at 375px first; enhance up. Enforce `--tap-min: 44px` on all interactive
elements. Collapse multi-column grids at `--bp-xs`. Adapt tables to stacked cards below `--bp-sm`.
Give every horizontal rail a scroll affordance. Verify no horizontal overflow at 375/768/1024/1440.

## 7. Navigation architecture

Role-aware, unchanged in structure (it works): public header + bottom nav; seeker nav + bottom nav;
host header + nav; admin minimal gated; site footer everywhere; legal section-nav. **Additive:** a
**FAQ** entry in the footer + legal nav. Ensure active state + `aria-current` + visible focus on every
nav + inline link.

## 8. Public marketing page strategy

Homepage stays the conversion centerpiece (hero + category reel + employer pricing + community teaser +
featured rails) — elevate, don't rebuild. **Add:** `Organization` + `WebSite` (`SearchAction`) JSON-LD;
a **public FAQ** page; richer internal links (home ↔ about ↔ faq ↔ seek). `(marketing)`/`(public)`
empty groups: either build a dedicated "How it works" / "For hosts" page later or remove. [Partly this pass.]

## 9. Seeker experience strategy

Premium mobile-first consumer dashboard (mostly delivered on branch): immersive `SeekerHero`,
readiness control, resume completion, matched/saved/applied rails, rich DiscoveryCards, clear next
actions, trustworthy offer/application states. **Remaining:** `loading.tsx` skeletons; finish `ui-field`
adoption in resume/profile/settings forms; polish empty + success states via `ui-empty`.

## 10. Host experience strategy

Marketplace command center (largely delivered on branch via `host.css`): KPI strip with promoted
primary metric, listing cards as assets, human applicant review, attention/needs-review system,
boost UI that feels commercially valuable. **Remaining:** guided listing builder polish; analytics
table mobile adaptation; `loading.tsx`; do not touch billing logic.

## 11. Community experience strategy

Social hub (skeletons added on branch): feed feels alive, photos immersive (frame+mat), announcements
official + visually distinct, easy posting, protected host/official posting. Polish empty/loading/error
via shared primitives. Moderation actions exist — keep server-enforced.

## 12. Admin / official experience strategy **[GATED]**

Keep service-role gating (layout `isAdminUserId` + `guardAdmin`). Safe UI only: clearer role-aware
controls, confirmation flows on destructive moderation, better permission-denied + empty states.
**Never** expose admin UI to unauthorized users or alter permission logic.

## 13. Listing / discovery strategy

DiscoveryCard is the locked core primitive — preserve its container-query/atmosphere system; extend
mobile only. Listing detail (`/listing/[id]`) is SEO-critical and strong — keep `generateMetadata` +
JobPosting JSON-LD; add `BreadcrumbList` (nice-to-have). Ensure `next/image` on all galleries.

## 14. Application / offer / messaging strategy

Flows are server-enforced and correct. UI polish only: optimistic message send, clearer offer
accept/decline states, post-apply confirmation, premium empty inboxes. **No data/RLS changes.**

## 15. Billing / Stripe strategy **[GATED]**

Stripe is real (subs + announcement boosts), webhook-verified, ownership-checked. **Plan:**
(a) **document price-ID env vars** in `.env.example` + verify in Vercel [this pass, docs only];
(b) restyle plan cards / billing surface within tokens [safe]; (c) **never** change checkout, webhook,
tier-sync, or pricing values. Pricing-drift guardrail enforces canon.

## 16. SEO strategy

Preserve the strong baseline (template metadata, canonicals, per-detail `generateMetadata`, JobPosting
JSON-LD, sitemap, robots, OG image). **Add:** homepage `Organization` + `WebSite` JSON-LD; `FAQPage`
JSON-LD on the new FAQ; `BreadcrumbList` on detail pages; FAQ in sitemap + footer. No keyword stuffing.

## 17. LLM / chatbot optimization strategy

Ship a **`llms.txt`** AI site guide (served at `/llms.txt`) covering: what Explore&Earn is; seekers vs
hosts; the Housing/Meals/Pay model; categories (farm/maritime/remote/seasonal); how applying works;
how hosting works; key public URLs. Ship a **public FAQ** whose plain-language Q&A is both human-useful
and `FAQPage`-structured. Keep core explanations in server-rendered text (already true).

## 18. Accessibility strategy (WCAG 2.2 AA)

Maintain landmarks, heading order, alt-text discipline, reduced-motion, focus rings, 44px targets.
**Add:** global `:focus-visible` fallback for inline links; fix sub-44px targets; verify dialog/drawer
focus-trap + restore + `Esc`; confirm `aria-describedby` wires field errors to `.ui-error`.

## 19. Performance strategy

`loading.tsx` skeletons on heavy dashboards; `next/image` everywhere; keep Mapbox client-scoped to
`/map`; conservative Sentry sampling; no large new dependencies; watch DiscoveryCard inline-style churn.

## 20. Implementation phases

1. **Audit + plan** (this doc + `WORLDCLASS_SITE_AUDIT.md`). ✅
2. **Foundation** — token + `ui-*` primitive layer. ✅ (on branch; finish adoption sweep).
3. **Public pages** — homepage elevation + **SEO/LLM hardening (`llms.txt`, FAQ, structured data)**. ◐ this pass.
4. **Seeker** — finish form adoption, loading states, empty/success polish.
5. **Host** — builder polish, table mobile, loading states.
6. **Community** — empty/loading/error polish.
7. **Admin** — safe UI + confirmations [GATED].
8. **SEO/LLM** — structured data + internal linking. ◐ this pass.
9. **A11y** — focus fallback, targets, dialogs. ◐ this pass (focus fallback).
10. **Performance** — skeletons + `next/image`.
11. **QA + hardening** — multi-breakpoint pass, build, E2E, guardrails.

## 21. Exact files / components likely to change

- **This pass (safe, additive):** `app/llms.txt/route.ts` (new) · `app/(legal)/faq/page.tsx` (new) +
  `(legal)/LegalPageNav.tsx` + `components/SiteFooter.tsx` + `app/sitemap.ts` · `lib/seo.ts`
  (Organization/WebSite/FAQ helpers) · `app/page.tsx` (inject JSON-LD) · `styles/primitives.css`
  (`:focus-visible` link fallback) · `(seeker-onboard)/layout.tsx` + `(host-onboard)/host/onboarding/layout.tsx`
  (metadata desc) · `.env.example` (Stripe price IDs, cron, resend-from).
- **Later phases:** `StatusCard.module.css` (tokenize) · seeker/host forms (`ui-field` adoption) ·
  `loading.tsx` siblings · listing galleries (`next/image`) · `app/(legal)/faq` content growth.
- **Do not touch:** `middleware.ts`, `app/actions/*` logic, `services/stripe/*`, `packages/db` queries/RLS,
  `tokens.css` values, the DiscoveryCard JSX contract.

## 22. Risks and safeguards

- **In-flight WIP collision:** 83 uncommitted changes from prior restyle sessions live on this branch.
  Safeguard: this pass only **adds** files or makes surgical, isolated edits to files not in active
  visual flux (seo/llms/faq/env/focus-fallback) — no broad component rewrites that could clobber WIP.
- **Token drift:** never introduce raw hex; reference semantic tokens.
- **Backend safety:** zero changes to auth, RLS, Stripe logic, pricing, mutations, contracts.
- **Build safety:** `tsc -b` + `eslint .` + `next build` must stay green after every change.

## 23. QA checklist

- [ ] `pnpm typecheck` ✓  [ ] `pnpm lint` ✓  [ ] `pnpm build` ✓
- [ ] `/llms.txt` returns the guide (text/plain).
- [ ] `/faq` renders, is in sitemap, footer, and legal nav; `FAQPage` JSON-LD validates.
- [ ] Homepage emits `Organization` + `WebSite` JSON-LD (validates in Rich Results).
- [ ] No horizontal overflow at 375 / 768 / 1024 / 1440 on `/`, `/about`, `/faq`, `/listing/[id]`.
- [ ] Inline links show a visible focus ring on keyboard tab.
- [ ] Auth gate, role nav, admin protection, Stripe routes, Supabase queries **unchanged** and working.
- [ ] No faked backend behavior introduced.

## 24. Definition of done

A unified, premium, production-ready marketplace where: public pages explain the product and convert;
seeker/host/community surfaces feel personal, powerful, and alive; listings feel premium and
actionable; navigation is obvious across roles; mobile is intentional; accessibility is materially
improved; **SEO + AI/chatbot readability are materially improved** (sitemap, structured data, FAQ,
`llms.txt`); Stripe/billing is audited + safe; auth/permission/RLS intact; empty/loading/error states
polished; the design language is unified; and **lint/typecheck/build pass**.
