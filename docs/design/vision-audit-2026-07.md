# Explore & Earn — Founder Vision Audit & Transformation Charter

> **Date:** 2026-07-08 · **Continuation verified:** 2026-07-09 · **Author:** repo-resident design agent · **Skill:** `design-audit`
> **Mandate (founder, verbatim intent):** "audit the design — i don't feel the product represents my vision as well as it should… this needs to be an intelligent, beautiful, worldclass experience. you are in full control. take it to the next level. every surface."
> Grounded in **rendered** surfaces (homepage, seek, swipe, resume, host-listing-upload) at 380/1024, not code intent. Judged against [`brand-direction.md`](./brand-direction.md) + [`page-scorecard.md`](./page-scorecard.md).

---

## 0. The verdict

The app is **not generic SaaS** — the homepage, scenic photography, warm paper base, and Discovery Card's ambition are genuinely on-brand and ahead of most job boards. The continuation work materially closed the highest-risk convergence gaps, but the broader product is **not yet worldclass**:

1. **The core opportunity object now serves its thesis.** HOUSING / MEALS / PAY are visually primary, use truthful offered/not-offered/not-confirmed semantics, and retain the protected card identity. The remaining work is to keep every adapter and new surface on that canonical contract.
2. **The public benefit loop is now converged.** Search, homepage, Seek, and listing detail consume the same structured Housing/Meals and Pay contracts; the four slots remain visible even when a host has not published a photo. Pay validation, persisted currency, null-clears, exchange, max-only ranges, and public summaries now share one projection. The host composer explains exactly when the saved-listing photo editors unlock.
3. **Identity creation now tells the same story on both sides.** The host listing composer includes a responsive live seeker-card preview driven by draft fields, imagery, dates, and the benefit triad; the seeker résumé now previews the exact read-only applicant card hosts receive and incorporates unsaved section drafts without implying they have been persisted. The remaining identity gap is journey-level reward and richer real media, not preview parity.

Everything else is a gradient off these three.

---

## 1. Canonical vision (locked — the north star for every surface)

| Pillar | The rule |
|---|---|
| **Taxonomy** | **Four lanes only**: Maritime · Seasonal · Remote · Farm (+ `mix`). Never 8. Sub-roles are filters inside `/seek`, never top-level categories. |
| **Core object** | The **Discovery Card** is atomic and identical everywhere (seek grid, swipe deck, map pin, listing rail, homepage). Vary imagery + lane accent, never the component. |
| **Triad primacy** | HOUSING / MEALS / PAY are the **dominant** module on the card — glanceable, never "Perks", never buried. |
| **Glance state** | Each benefit reads **offered (green ✓) / not-offered (red ✕)** in ≤0.5s. Icon **and** color (a11y), not color alone. **Founder-confirmed 2026-07-08: not-offered is RED** (overrides the old "muted-neutral, never red" card decision). |
| **Interactivity** | Every available benefit opens the shared contextual experience. **Housing** exposes the four persisted views (exterior · interior · bathroom · other); **Meals** exposes kitchen · typical meal · dining · other. **Pay** uses one day/hour scale-and-range contract. Unavailable benefits remain static and truthful. |
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
Re-rendered at 390px and 1024px on 2026-07-09: the Seeker OS, saved-search controls, filters, employer context, and canonical opportunity cards all reach meaningful DOM without the error boundary. The keyless review harness now clears public data configuration explicitly and uses canonical fixtures; configured query failures still surface instead of being masked, and production refuses fabricated data. **Verdict: functional and coherent; continue converging duplicated parsing/adapters with `/search`, and revisit the opacity-pulse loading skeleton.**

### `/search` — public structured search · **rendered**
The route now loads its token-driven styles (the stylesheet existed but was never imported), keeps filters together as a desktop sidebar beside results, remains single-column on mobile, and maps to the **Seek** navigation lane. Known benefit provision reaches the canonical card, so “not provided” states stay red/static instead of being inferred as offered. Search now derives its local fixture view-model from canonical discovery fixtures: Listing destinations resolve, Map actions appear only when coordinates exist, and signed-out fixtures never expose personalized match scores. **Verdict: repaired baseline; consolidate its remaining duplicate parser/adapter layer with Seek in a follow-on slice.**

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

### Seeker **résumé** · **rendered baseline, implementation iterated**
The 5-step builder (Info/Experience/Education/Certs/Review) now composes against the real read-only `SeekerResumeCard` host view. Persisted data and the active unsaved draft merge into a responsive preview, preview links are intentionally inert, and advancing no longer claims to save a section. Completion only advances after a successful save. The remaining worldclass gap is a stronger sense of journey/reward and richer real profile media—not a disconnected document form. **Verdict: materially converged; continue experiential polish.**

### Host **listing upload** · **rendered and iterated**
The persisted create/edit form now composes beside a responsive live seeker-card preview. Title, category, location, dates, cover image, Housing, Meals, and structured Pay update the canonical card as the host types; incomplete benefits remain neutral rather than optimistic. Initial creation explicitly explains that the eight structured Housing/Meals photo slots unlock after the first draft save, and the primary action says “Create draft & continue.” **Verdict: materially converged; the saved-ID boundary remains intentionally required for uploads.**

### Not yet re-rendered this pass (audit from code + prior shots; render before redesign)
`/map`, `/host/[id]` (weather + location intelligence — **not yet present**), `/community`, seeker dashboard, admin dashboard, the newly iterated authenticated résumé preview, and the chatbot surface. Listing detail, listing composer, and the host-dashboard incomplete-setup state were re-rendered in the continuation harness.

---

## 3. Vision-gap map (what's specified but missing/weak)

| Vision element | State today | Gap |
|---|---|---|
| 4 categories not 8 | ✅ **fixed this pass** (`home-data.ts`) | — |
| Triad primacy on card | ✅ **fixed in Phase 1** | Preserve the protected card identity and verify every adapter supplies structured state |
| Red/green offered glance | ✅ **fixed for known states**; missing provision is neutral “not confirmed” | Continue eliminating incomplete adapters rather than guessing |
| Housing popup — 4 photo slots | ✅ Persisted IDs and semantics remain stable; public labels read Exterior/Interior/Bathroom/Other view and all four slots expose truthful empty states | Introduce bedroom/common-area buckets only with an explicit data migration |
| Meals popup — 4 photo slots | ✅ Kitchen/Typical meal/Dining area/Other view remain visible with truthful empty states | Keep editor/view language aligned as the schema evolves |
| Pay popup — day/hour scale/range | ✅ One projection drives form preview, persistence, discovery, applied/invite/admin adapters, public-host cards, and detail; unavailable Pay is static and comparative UI appears only with a real meter | Preserve the shared contract across future surfaces |
| Host uploads for benefit photos | ✅ Four-slot editors remain attached to saved listing IDs; first-run composition now explains the boundary and continues into the draft | Consider an autosaved draft only if discard/recovery semantics are designed |
| Host profile weather + location intel | ◐ Persisted host/live-listing locations now form a truthful grouped context card; physical places link to Maps and Remote stays static. Weather is absent. | Add weather only with an authorized, reliable data source; never infer it from a location string |
| Live card preview in résumé/listing | ✅ Listing composer uses the canonical Discovery Card; résumé uses the real read-only host-facing applicant card | Continue reward/media polish without creating a second identity component |
| Pipeline states both sides | ✅ Decline uses canonical `offered → withdrawn`; terminal history remains visible instead of being filtered out | Migration 058 provides ownership-checked, expiry-aware atomic seeker intents, serialized capacity checks, and decision timestamps. Continue the broader host/seeker pipeline audit. |
| Chatbot integrated | Assistant route exists | Verify it's a first-class, context-aware surface |

---

## 4. Execution roadmap (leverage order — "fix as we go")

The Discovery Card is the multiplier: it renders on 5 surfaces, so fixing it lifts seek/swipe/map/listing/homepage at once.

- **Phase 1 — Discovery Card (the core object) — completed baseline.** The triad is the dominant module, known Housing/Meals states use explicit green/red icon+color semantics, and missing provision fails neutral rather than optimistic. Continue migrating remaining inline presentation only when a concrete card defect requires it.
- **Phase 2 — Benefit-interaction convergence — completed baseline.** The shared four-slot Housing/Meals and Pay payloads now open consistently from public discovery and listing detail, expose truthful empty slots, distinguish a public read outage from genuinely unpublished content, and remain discoverable from the initial host composer without pretending uploads can exist before a listing ID. Benefit editors guard unsaved changes and in-flight uploads across every dismissal path.
- **Phase 2b — Overlay system — completed baseline.** `PopupShell` is the canonical centered desktop dialog and full-width mobile bottom sheet with focus trapping, scroll locking, focus restoration, entrance/exit lifecycle, handle-only swipe dismissal, snap-back, reduced-motion behavior, and a synchronous preflight hook that can veto dirty/busy dismissal before exit begins.
- **Phase 3 — Discovery system (seek / swipe / map).** One lens system: promote triad on the swipe face, integrate match score, fix the skeleton (shimmer + paper, not opacity-pulse), unify map pins to the card.
- **Phase 4 — Identity surfaces — completed baseline.** Listing upload has the live Discovery-Card preview and explicit benefit-photo continuation; résumé has the live host-facing applicant-card preview, protects every dirty step-change path, and keeps mobile navigation ahead of the full preview. Continue into real-media richness and completion reward.
- **Phase 5 — Host public profile — location baseline completed.** The profile already showcases real identity, story, imagery, reviews, and live opportunities; its location module now uses only persisted host/listing places and truthful counts. Weather remains intentionally absent until a real provider and failure policy exist.
- **Phase 6 — Dashboards + pipeline + community + chatbot.** Host readiness now derives from real profile/listing state and cannot show “all caught up” without a complete public profile plus live inventory. The seeker offer response is canonical and RLS-safe. Continue into the remaining dashboard, pipeline, community, and assistant surfaces.

**Next deliberate slice:** re-render the authenticated résumé and public host location context, then choose between the remaining discovery-lens convergence and host weather integration based on real provider/data readiness.
