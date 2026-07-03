# Design — Intelligent Matching Engine (ADR-040)

**Date:** 2026-07-02
**Branch:** `feat/matching-engine`
**Status:** Plan → implementing (founder-authorized; unblocks A-MATCH-DEPLOY / issue #46)
**Consumes (does not change):** `packages/contracts/src/matching-config.ts` (LOCKED ADR-040 weights, caps, exclusions, confidence, bands; guardrails G31–G34).

## 1. Vision — why E&E matching is not job-board matching

A generic job board matches **skills → requirements**. Explore&Earn matches **a life to a season**: *where will I sleep, what will I eat, what will I earn, can I get there, and am I free when it runs.* The HOUSING/MEALS/PAY triad is the moat (§1 of AGENTS), and seasonal work makes **availability** and **timing** first-class — a perfect skills match is worthless if the seeker can't be there in June. ADR-040's six weighted components encode exactly this life-fit, and this engine makes them real:

| Component | Weight | What it answers |
|---|---|---|
| categoryRoleFit | 30 | Is this the *kind* of work I want? (category + roles + skills/interests) |
| locationTravelFit | 20 | Can I actually get there / does the location suit me? (remote pref, travel readiness) |
| availabilityOverlap | 20 | Am I free when it runs? (season/date overlap) |
| payAlignment | 15 | Does it clear what I need to earn? |
| housingMealsFit | 10 | Are my living needs met? (housing/meals required vs included) |
| profileCompleteness | 5 | Do we have enough signal to trust the match? |

**Design tenets (defended):**

1. **Deterministic & explainable, no ML in V1.** Every score is a pure function of two rows — reproducible, debuggable, tunable by editing one weight. It surfaces *why* ("Strong on availability & pay") from the component keys at render time. We do **not** ship a black box a seeker can't trust or a founder can't tune. (ML re-ranking is a Stage-4 option, layered *on top* of this transparent base — never replacing it.)
2. **Two-sided, one engine.** The same `computeMatch(seeker, listing)` scores the seeker's discovery feed **and** the host's applicant ranking. Symmetry prevents two divergent notions of "fit."
3. **Caps & exclusions are honesty rails, not bonuses.** Exclusions remove impossible pairings (not live, blocked, suspended). Caps *ceiling* a score when a hard requirement is unmet (missing required cert, impossible timeline, housing required but not offered, visa needed but unavailable) — so a listing can never read "Strong match" for a job the seeker literally cannot take. This is the product's promise of *honest data* made computational.
4. **Confidence ≠ score.** A thin profile still gets matches (graceful fallback), but with low **confidence** — which is the seeker's nudge to complete their profile, not a punishment that hides opportunities. Confidence and score are separate axes (ADR-040).
5. **Monetization is quarantined.** Match score **never** sees boost/featured/billing (ADR-007 / G8; enforced by the `check-match-isolation` guardrail). Money buys *exposure* in discovery ranking, never *fit*.
6. **G34 — never store sentences.** We persist component *scores* (numbers), never explanation text. The human-readable reason is derived at render from the top-contributing keys, so copy can change without a migration and we never ship stale explanations.

## 2. Architecture

```
packages/contracts/src/
  matching-config.ts     (LOCKED — weights/caps/exclusions/bands/confidence)
  match.ts        [NEW]  — MatchResult, MatchComponentScores, MatchExplanation,
                           topMatchReasons() (render-time, G34-safe)
packages/db/src/lib/
  matchEngine.ts  [NEW]  — computeMatch(seeker, listing): pure ADR-040 engine.
                           scoreListingForSeeker() (existing) delegates here, so
                           every current caller upgrades with zero edits.
  matchScore.ts   (kept as a thin re-export shim for back-compat)
apps/web/services/matching/
  index.ts    [REWRITE]  — real service: computeMatchesForSeeker(),
                           upsertMatchScores(), getPersistedMatches().
                           Monetization-free (guardrail).
supabase/migrations/
  051_matching_fields.sql [NEW] — typed match inputs + indexes + pg_trgm
  052_match_scores.sql    [NEW] — match_scores cache + RLS
```

### 2.1 The engine (pure)
`computeMatch(seeker, listing): MatchResult` where
```
MatchResult = {
  excluded: MatchExclusion | null      // if set, not scored/shown
  score: number                        // 0–100 integer, post-caps
  rawScore: number                     // pre-caps
  band: MatchBand                      // strong | developing | needs_attention
  confidence: number                   // 0–100, separate axis
  components: Record<MatchScoreComponent, number>  // each 0–100 (pre-weight)
  capsApplied: MatchCap[]              // which ceilings fired
}
```
- Each component returns a **normalized 0–100 sub-score**; the weighted sum (÷100) is the raw score. Weights come straight from `MATCH_SCORE_WEIGHTS` (so G31's sum-to-100 keeps the math coherent).
- Caps take `min(score, cap)` for any hard requirement unmet.
- Missing seeker/listing fields degrade a component to a neutral partial (never a hard zero unless semantically true), and lower **confidence** — never silently exclude.
- Pure, synchronous, no I/O → exhaustively unit-testable.

### 2.2 Persistence — `match_scores` (why a table)
Today scoring runs inline: fetch all live listings → score each in Node → sort → slice. That's O(N) per request and can't power host-side ranking, "new strong match" notifications, or off-request recompute. `match_scores` caches the pairwise result:
```
match_scores(
  seeker_profile_id uuid, listing_id uuid,
  score int, raw_score int, band text, confidence int,
  components jsonb,            -- {categoryRoleFit: 82, ...} numbers only (G34)
  caps_applied text[],
  computed_at timestamptz,
  PRIMARY KEY (seeker_profile_id, listing_id)
)
```
RLS: a seeker reads only their own rows; a host reads rows for listings they own (applicant ranking); writes are service-role only. No explanation text is ever stored (G34).

### 2.3 Surfacing
- `getMatchedListings` upgrades transparently (delegation) and additionally carries `matchBand` + `matchReasons` (top ≤2 component keys → label via `topMatchReasons`) onto the DiscoveryCard as **optional** fields (additive; the card already renders a `matchScore` Meter).
- Explanation is derived at render (G34); nothing new is stored beyond numeric components.

## 3. Schema changes (migrations)

**051 — typed match inputs + indexes (additive, idempotent):**
- `listings`: `required_skill_tags text[]`, `required_certifications text[]`, `physical_demand smallint` (0–3), `experience_level_required text`, `seasonality text[]` — promote match-critical fields out of untyped `listing_relevance_extensions.structured_data`.
- `seeker_profiles`: `remote_preference text` (`remote|on_site|hybrid|any`), `interest_tags text[]`, `experience_level text`, `visa_support_needed boolean`.
- Indexes: GIN on the new array columns; btree on `listings(compensation_min_cents, compensation_max_cents)` (pay filtering/ranking); missing FK indexes (`conversations.application_id/listing_id`, `host_reviews.application_id`); `pg_trgm` extension + broaden `search_vector` sources for fuzzy `/search`.

**052 — `match_scores` cache + RLS** (as §2.2).

Both are additive and safe; applied by the `db-migrate` CI pipeline on merge (not touched in prod here). New columns are read via the repo's existing **untyped-client** convention until `types.gen.ts` is regenerated, so no local-DB dependency blocks this work.

## 4. Staging
- **Stage 1 (this PR):** contracts + engine + tests + migrations 051/052 + service + transparent wiring + card explainability. Ships *real intelligent scoring on live data* immediately (engine runs on existing columns; new columns enrich as hosts/seekers fill them).
- **Stage 2 (follow-up):** background recompute on profile/listing change; host applicant-ranking UI; "new strong match" notification; `types.gen.ts` regen after 051/052 apply.
- **Stage 3 (future):** optional ML re-rank layered atop the transparent base; behavioral signals from the `events` table.

## 5. Guardrail compliance
- **G31/G32/G33** — engine reads weights/sub-weights/bands from the locked config; never redefines them.
- **G34** — only numeric components persisted; explanations derived at render.
- **G8 / ADR-007 / check-match-isolation** — `services/matching` imports no `stripe/billing/boost/featured/entitlements`.
- **Migration guards** — 051/052 reserved in `migration-allocations.json`; `NNN_snake_case.sql`.

## 6. Verification
Pure-engine unit tests (component math, caps, exclusions, confidence, bands, incomplete-profile degradation); `typecheck`, `lint`, `build`, full `guardrails` (incl. isolation + migration-prefix), workspace tests.
