# ADR-0001 — Matching Tuning V1

- **Status:** Accepted (founder-authorized 2026-05-31)
- **Context:** The Matching V1 build pack (PR #10) left all numeric tuning as `TODO(?)` behind founder approval gates. The founder authorized the architect to determine the match weights, band thresholds, inactivity penalty, anti-spam caps, reminder policy, and related values — intentionally and with justification.
- **Decision:** Lock the values below. Full justification (Decision -> Rationale -> Why best for E&E -> Alternatives -> Tradeoffs -> Revisit) lives in [`../../matching/match-tuning-v1-decisions.md`](../../matching/match-tuning-v1-decisions.md). Values are encoded as **config data** in `packages/contracts/src/matching-config.ts` — no algorithm.

## Locked summary

- **Weights (sum 100):** Timeline 20, Skills/certs 20, Role/category 15, HMP 15 (H5/M3/P7), Location 10, Goals 10, Completeness 5, Behavioral 5.
- **Sub-weights:** see decisions doc / `matching-config.ts` (each block sums to its parent).
- **Hard caps:** cert-missing 60, timeline-conflict 50, housing-not-included 65, visa-unavailable 50, trust -> cap/hide.
- **Bands:** Strong 75-100, Developing 50-74, Needs attention 0-49.
- **Confidence display:** withhold <40, qualify 40-59, full >=60.
- **Inactivity:** affects behavioral 5 pts only; 14d + 3-opportunity cold-start grace; recency 3.0/2.0/1.0/0.5 floor; response-rate (max 2) after >=5 sample in 90d; not_interested != ignore; never hides.
- **Invite caps:** 1 per host/seeker/listing, 2 concurrent per host/seeker, 3 per 30d, 50/day host soft cap, 10/day seeker surfaced; credit restored only before delivery.
- **Reminders:** invite & offer T-3 / T-1; profile weekly digest; max 2/object. Sending deferred to Notification pack.
- **Expiry:** application 30d, invite 14d, offer 7d (after extended_at).
- **Not-selected:** neutral; no reason exposed/stored; no seeker matching penalty; re-apply after 30d or re-open, max 2/year.
- **Copy:** seeker Strong fit / Good fit / Partial fit; host Strong / Developing / Needs attention; header "Why this fits".
- **Explanations:** derive on read; store structured reasons only.
- **AI/ML:** none in V1 (heuristic + explainable).
- **Events:** retire `candidate_shortlisted` -> `candidate_saved`; adopt `candidate_card_opened`, `candidate_profile_popup_opened`, `quick_apply_clicked`, `match_score_impression` (canon-sync owed).

## Consequences

- Resolves founder-queue rows A-MATCH-WEIGHTS, A-MATCH-INACTIVITY, A-MATCH-HOST-RANK, A-MATCH-SEEKER-COPY, A-MATCH-REMINDERS (policy), A-OFFER-EXPIRY, A-NOT-SELECTED, A-MATCH-EXPL-STORE, A-MATCH-AI.
- Still gated: A-MATCH-DEPLOY (production), A-MATCH-PROXY (legal review before prod).
- Proposes CI checks G31-G34 (founder assigns final numbers; G1-G30 locked).
- Canon-sync owed: mirror the new events + locked tuning into Notion canon.
