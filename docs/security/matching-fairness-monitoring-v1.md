# Matching Fairness & Disparate-Impact Monitoring V1

> DRAFT — architecture/policy only. Defines the **post-launch monitoring** that must exist before and after the scoring engine goes live (A-MATCH-DEPLOY). No collection pipeline, dashboard, or alerting is implemented here. All thresholds are **proposed** and require founder + legal ratification (`../source-of-truth/founder-approval-queue.md`). This doc operationalizes the directive's "high-risk" framing: a matching system can cause harm through **disparate impact** even when it never reads a protected attribute.

## Why monitoring is mandatory (not optional)

The matching pipeline never ingests protected/sensitive attributes (`../matching/prohibited-signals-v1.md`, G8). But neutral-looking signals (location, schedule, response behavior) can act as **proxies** and produce skewed outcomes. Fairness is therefore an **outcome-monitoring** obligation, not just an input rule. We watch the *distribution of results*, detect drift, and escalate — we never auto-adjust scores based on these metrics (that would itself be an opaque, ungoverned intervention).

## Governing constraints

1. **Monitor outcomes, never collect protected classes by default.** V1 monitoring uses *non-protected* dimensions (listing category, region, listing type, host tier, profile completeness band). Any disparate-impact analysis that requires protected-class data is a **separate, legal-approved, consented process** — not built into the product pipeline. (`Q-FAIR-PROTECTED-ANALYSIS`).
2. **Aggregate-only.** Metrics are computed over cohorts, never exposed per-person; small cohorts (< k, proposed k=20) are suppressed to prevent re-identification.
3. **Alert, don't auto-correct.** Threshold breaches open a founder/trust review, never a silent re-weighting.
4. **Explainable + reproducible.** Every metric has a written definition and a deterministic query; tie-break and cap behavior are auditable (see `../matching/match-edge-cases-v1.md`).

## Monitored metrics (proposed definitions)

| ID | Metric | Definition | Why it matters | Proposed alert (founder-gated) |
| --- | --- | --- | --- | --- |
| FM1 | Band distribution by cohort | Share of surfaced matches in strong/developing/needs_attention, split by category & region | Detect skew where one cohort is systematically scored lower | Band mix deviates > X pp from platform baseline for a cohort with n >= k |
| FM2 | Cap-application rate | % of scored pairs hitting each hard cap, by cap type & cohort | A cap firing far more for one cohort may signal a proxy | Cap rate for a cohort > Y× platform median |
| FM3 | Confidence-withhold rate | % of pairs withheld for confidence < 40, by cohort | High withhold can mask a cohort from hosts entirely | Withhold rate for a cohort > Z pp above baseline |
| FM4 | Explanation coverage | % of surfaced scores that carry a non-empty explanation | Hard invariant: no score without explanation | < 100% — page immediately (contract violation) |
| FM5 | Stale-shown rate | % of surfaced results where now > staleAt | Stale results erode trust/accuracy | > W% sustained over 24h |
| FM6 | Tie-break audit | Sampled re-rank of identical pools to confirm identical ordering | Proves determinism; catches accidental randomness/proxy keys | Any non-deterministic ordering — page immediately |
| FM7 | Proxy-correlation watch | Correlation between final score and known proxy dimensions (e.g. region) within same category | Rising correlation hints a proxy is dominating | |corr| trend exceeds founder-set band; opens review |
| FM8 | Match dispute rate | % of matches a host/seeker flags as "wrong/irrelevant", by cohort | Ground-truth signal of quality + fairness | Dispute rate for a cohort > V× baseline |
| FM9 | Recommendation reachability | % of active seekers receiving >= 1 surfaced opportunity / 30d, by cohort | Detect cohorts the pipeline never surfaces | Reachability for a cohort < U% |

(X/Y/Z/W/V/U/k are **placeholders** — founder + legal assign final values.)

## Review cadence & ownership (proposed)

- **Real-time invariants** (FM4 explanation coverage, FM6 determinism): page on breach — these are correctness contracts, not statistical signals.
- **Weekly**: FM1–FM3, FM5, FM8 reviewed by the trust/founder owner.
- **Monthly**: FM7, FM9 trend review; any sustained breach escalates to a fairness review with documented decision (logged like an ADR).
- **Owner**: founder / designated trust lead until a formal Trust & Safety function exists. No automated remediation without sign-off.

## Data & privacy posture

- Source: the analytics events already defined in `../analytics/matching-hiring-events-v1.md` plus aggregate `MatchResult` outcome rollups. No new protected-class fields.
- Storage: aggregated cohort rollups only; raw per-pair scores remain internal/admin (G11) and are not exposed in monitoring surfaces.
- Retention & access for monitoring rollups: defer to the Backend/Security build pack (`Q-FAIR-RETENTION`).

## Pre-launch gate (blocks A-MATCH-DEPLOY)

Before the scoring engine may serve production traffic, the following must be true (proposed acceptance):

- [ ] FM4 (explanation coverage) and FM6 (determinism) instrumented and green in staging.
- [ ] FM1–FM3 baselines captured on seed/staging data.
- [ ] Founder + legal have ratified thresholds and the protected-class analysis policy (`Q-FAIR-PROTECTED-ANALYSIS`).
- [ ] A documented escalation path (who reviews, how a breach pauses rollout) exists.

## Open items

- `TODO(?)` Final thresholds for FM1–FM9 (founder + legal).
- `Q-FAIR-PROTECTED-ANALYSIS`: consented, legally-reviewed process for any protected-class disparate-impact study (out of product pipeline).
- `Q-FAIR-RETENTION`: retention/access policy for monitoring rollups.
- Canon-sync of this monitoring spec into Notion (`Q-CANON-SYNC-MATCH`).
