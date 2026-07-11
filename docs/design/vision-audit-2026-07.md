# Explore & Earn — Founder Vision Audit & Transformation Charter

> **Date:** 2026-07-08 · **Author:** repo-resident design agent · **Skill:** `design-audit`
> **Mandate (founder, verbatim intent):** "audit the design — i don't feel the product represents my vision as well as it should… this needs to be an intelligent, beautiful, worldclass experience. you are in full control. take it to the next level. every surface."
> Grounded in **rendered** surfaces (homepage, seek, swipe, resume, host-listing-upload) at 380/1024, not code intent. Judged against [`brand-direction.md`](./brand-direction.md) + [`page-scorecard.md`](./page-scorecard.md).

---

## 0. The verdict

The app is **not generic SaaS** — the homepage, the scenic photography, the warm paper base, and the Discovery Card's ambition are genuinely on-brand and ahead of most job boards. But it is **not yet worldclass**, and three structural things keep it from representing the vision:

1. **The core object under-serves its own thesis.** HOUSING / MEALS / PAY are the reason this product exists, yet on the Discovery Card they are the *smallest, last* row — three tiny icon+label cells below host, title, location, and dates. The triad should be the loudest thing on the card. Today it whispers.
2. **The promised interactivity is hollow.** The housing/meals popups open to a single "No media yet" empty blob — not the founder's **four defined photo slots** (bedroom / common / bath / misc · food / kitchen / dining / misc). Pay opens **nothing** (no day/hour scale popup). And there is **no host-side uploader** for those photo buckets, so the popups can never fill. The interactive, "resolvable-at-a-glance" product is specified but not built.
3. **The two identity surfaces are competent forms, not worldclass.** The seeker résumé and host listing-upload are clean multi-step forms on warm paper — but they read as data entry, not as *building an adventure profile* / *composing a beautiful listing with a live card preview*. The brand says "Profile = a journey"; today it's fields.

Everything else is a gradient off these three.

---

## 1. Canonical vision (locked — the north star for every surface)

| Pillar | The rule |
|---|---|
| **Taxonomy** | **Four lanes only**: Maritime · Seasonal · Remote · Farm (+ `mix`). Never 8. Sub-roles are filters inside `/seek`, never top-level categories. |
| **Core object** | The **Discovery Card** is atomic and identical everywhere (seek grid, swipe deck, map pin, listing rail, homepage). Vary imagery + lane accent, never the component. |
| **Triad primacy** | HOUSING / MEALS / PAY are the **dominant** module on the card — glanceable, never "Perks", never buried. |
| **Glance state** | Each benefit reads **offered (green) / not-offered (red)** in ≤0.5s. Icon **and** color (a11y), not color alone. |
| **Interactivity** | Every benefit is a popup. **Housing** popup = 4 slots (bedroom · common · bath · misc). **Meals** = 4 slots (typical food · kitchen · dining · misc). **Pay** = scale/range popup (by **day or hour**). |
| **Discovery = 3 lenses** | Seek (grid) · Swipe (Tinder) · Map (Zillow) are three views of the **same** opportunity object, one system. |
| **Host profile** | Public showcase of the business + its opportunities, with **weather widget** + **location intelligence**. |
| **Pipeline** | Both sides see status at a glance: Saved · Applied · Reviewing · Offered · Not selected · Accepted. |
| **Identity surfaces** | Seeker **résumé** and host **listing upload** must be **worldclass** — photo/tag-heavy, live preview, delightful. |
| **System qualities** | Intelligent · fast · photo/tag-heavy · **mobile-first** · integrated chatbot. |

---

## 2. Per-surface scorecard (rendered)

Scores are 1–10 against [`page-scorecard.md`](./page-scorecard.md). Gate = every dim ≥8. **These are honest, low-anchored.**

### Discovery Card — the core object · **rendered on homepage + swipe**
`packages/ui/src/DiscoveryCard.tsx` (1,000 lines, **inline-style objects throughout**)

| Dim | Score | Why |
|---|---|---|
| 1 First impression | 6 | Photo + host circle land; but no single dominant element — 6 stacked full-width trays compete. |
| 4 Visual hierarchy | **4** | Triad is the *smallest, last* row. Host/title/location/dates each get a full-width tray of equal weight; the thing that matters is quietest. |
| 5 Emotional pull | 6 | Scenic covers pull; the tray stack reads product-y, not keepsake. |
| 6 Premium feel | 6 | Warm, but 6 bordered pills + custom triangle "match bar" feel busy, not editorial. |
| 8 Conversion | 6 | Quick Apply is clear; but the decision inputs (H/M/P) are de-emphasized at the decision point. |
| 9 Accessibility | 5 | Housing "not provided" is **muted neutral, deliberately never red** — the glance signal the founder wants is absent; provided vs not is a subtle teal-vs-grey, weak at 0.5s. |
| 11 Component consistency | **3** | The app's most-reused object is 1,000 lines of inline `CSSProperties` + a `<style>` string injected per render. No token classes, unmaintainable, drifts by definition. |
| 12 Info clarity | 6 | Honest, but housing cell just says "Housing/Private/Shared"; pay is a bare string; no glance semantics. |
| *(2,3,7,10,13 ≈ 6–7)* | | Collapses on mobile; on-brand palette; motion is a hover-scale only. |

**LOWEST: Component consistency @3, Visual hierarchy @4.** Verdict: **ITERATE — this is the #1 surface.**

### `/seek` — discovery grid
Rendered **broken in the review harness**: mobile → error state ("Something went sideways"), desktop → stuck on **opacity-pulse grey skeletons**. (Root cause is the dev-bench RLS token, not necessarily prod — but the **skeleton itself is an amateur tell**: flat grey blocks, opacity pulse, no paper/shimmer.) Can't score composition until it renders real cards; skeleton scores **3** on premium/brand.

### `/swipe` — Tinder lens · **rendered**
| Dim | Score | Why |
|---|---|---|
| 1 First impression | 7 | Big photo card is the right instinct — the most card-forward surface. |
| 4 Hierarchy | **4** | Same problem, worse: card face is **3 identical full-width trays** (host/title/location) and the **triad falls below the fold** — you can't see housing/meals/pay without scrolling, on the surface where you decide fastest. |
| 5 Emotional pull | 7 | Closest to the vision's feel. |
| 12 Info clarity | 5 | Match "88" is tiny text floating above the card, not integrated. |

**Verdict: ITERATE** — promote the triad onto the card face; kill the tray redundancy.

### `/` homepage · **rendered — the strongest surface**
| Dim | Score | Why |
|---|---|---|
| 1 First impression | 8 | Scenic autumn hero + honest promise + search + a peek card. Genuinely good. |
| Most dims | 7–8 | Real cards, featured employers, destinations, map teaser, warm throughout. |
| 7 Brand fit | **5** | **Eight category tiles** (Hospitality/Parks/Resorts/Guiding/Trades) fracture the 4-lane taxonomy — the founder's named complaint. *(FIXED this pass → 4 lanes.)* |
| 12 Info clarity | 7 | Long — reads more marketing page than product entry; could lose one module (Chanel rule). |

**Verdict: near-SHIP** once taxonomy is 4 (done) and it trims one module.

### Seeker **résumé** · **rendered**
Clean 5-step form (Info/Experience/Education/Certs/Review), warm sidebar "Seeker OS", timeline pills, interest chips (correctly 4+Mix). **Scores 5–6 on first-impression/emotional-pull/premium.** It's a *good form*. The vision is "Profile = a **journey**": it needs a visual identity build, a **live preview of the applicant card hosts will see**, photo/tag richness, and reward for completion. **Verdict: ITERATE (worldclass gap).**

### Host **listing upload** · **rendered**
Long single-column form. Honest H·M·P section — but **Housing/Meals are plain textareas** and **there is no photo uploader in view**, so the 4-slot benefit buckets the seeker popup promises **can never be filled**. No **live Discovery-Card preview** as you type. **Verdict: ITERATE (worldclass gap + closes the popup loop).**

### Not yet re-rendered this pass (audit from code + prior shots; render before redesign)
`/map`, `/listing/[id]`, `/host/[id]` (weather + location intelligence — **not yet present**), `/community`, seeker & host & admin dashboards, application-pipeline surfaces, the chatbot surface.

---

## 3. Vision-gap map (what's specified but missing/weak)

| Vision element | State today | Gap |
|---|---|---|
| 4 categories not 8 | ✅ **fixed this pass** (`home-data.ts`) | — |
| Triad primacy on card | Smallest, last row | **Promote to dominant module** |
| Red/green offered glance | Teal vs muted-neutral (never red) | **Add explicit green/red + icon state** |
| Housing popup — 4 photo slots | Single empty blob | **Build 4 named slots** (bedroom/common/bath/misc) |
| Meals popup — 4 photo slots | Single empty blob | **Build 4 named slots** (food/kitchen/dining/misc) |
| Pay popup — day/hour scale/range | **Opens nothing** | **Build pay scale popup** |
| Host uploads for benefit photos | **Absent** | **Add 4-slot uploaders** to listing form (closes the loop) |
| Host profile weather + location intel | Absent | **Add weather widget + location intelligence** |
| Live card preview in résumé/listing | Absent | **Add live Discovery-Card preview** both sides |
| Pipeline states both sides | Partial (states exist as card badges) | **Audit both dashboards for the full 6-state ladder** |
| Chatbot integrated | Assistant route exists | Verify it's a first-class, context-aware surface |

---

## 4. Execution roadmap (leverage order — "fix as we go")

The Discovery Card is the multiplier: it renders on 5 surfaces, so fixing it lifts seek/swipe/map/listing/homepage at once.

- **Phase 1 — Discovery Card (the core object).** Rebuild `DiscoveryCard.tsx` off inline styles onto token CSS-module classes (fixes consistency @3); **promote the triad to the dominant module**; add explicit **green/red glance state** (icon+color) for housing/meals; make housing/meals/pay the visual anchor. No API/contract change → every surface benefits, nothing breaks.
- **Phase 2 — Benefit interactivity.** Rebuild the housing & meals popups as **4 named photo slots**; build the **pay scale/range popup** (day|hour). Add the **4-slot photo uploaders** to the host listing form so the buckets fill. This is one coherent loop across card → popup → host upload.
- **Phase 3 — Discovery system (seek / swipe / map).** One lens system: promote triad on the swipe face, integrate match score, fix the skeleton (shimmer + paper, not opacity-pulse), unify map pins to the card.
- **Phase 4 — Identity surfaces.** Résumé → "journey" with live applicant-card preview; listing upload → live Discovery-Card preview + photo-forward.
- **Phase 5 — Host public profile.** Weather widget + location intelligence + opportunities showcase.
- **Phase 6 — Dashboards + pipeline + community + chatbot** polish to the same bar.

**First safe step:** Phase 1 on the Discovery Card, behind its unchanged public API, verified by re-render at 380/1024 against this charter.
