# Match Signal Registry V1

> DRAFT — architecture only. Signals map to the canonical component weights ("Exact Ranking, Matching & Boost Formula"). **Per-signal weights are LOCKED 2026-05-31** (founder-authorized) in [`match-tuning-v1-decisions.md`](./match-tuning-v1-decisions.md) / `packages/contracts/src/matching-config.ts`. No signal here may include or infer a prohibited signal (see `prohibited-signals-v1.md`).

Legend: Seeker-visible / Host-visible = whether the signal (or its contribution) may surface to that party. Weight = locked V1 contribution. V1 = allowed in first implementation pass. Deferred = pushed to a later pack.

| Signal | Description | Source | Seeker-visible | Host-visible | Weight (locked) | Privacy risk | Fairness risk | V1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `availability_fit` | Seeker availability overlaps listing timeline/season | Seeker profile, listing dates | Yes (reason) | Yes | Timeline 20 (overlap 14 / start 4 / shift 2) | Low | Low | Yes |
| `category_role_fit` | Seeker desired category/role matches listing | Seeker prefs, listing category | Yes | Yes | Role 15 (primary 11 / adjacent 4) | Low | Low | Yes |
| `skills_cert_fit` | Structured skills/certs match listing requirements | Seeker resume (structured), listing reqs | Yes (reason) | Yes | Skills 20 (required 12 / preferred 5 / tags 3) | Med | Med (proxy risk) | Yes |
| `housing_pref_fit` | Housing provided vs seeker housing need | Seeker prefs, listing HOUSING | Yes | Yes | housing 5 | Low | Low | Yes |
| `meals_pref_fit` | Meals provided vs seeker preference | Seeker prefs, listing MEALS | Yes | Yes | meals 3 | Low | Low | Yes |
| `pay_fit` | Pay range vs seeker minimum/preference | Seeker prefs, listing PAY | Yes | Yes | pay 7 (meets-min 5 / margin 2) | Med | Med | Yes |
| `location_travel_fit` | Relative location / travel willingness | Seeker prefs, listing location | Yes | Partial (relative only) | Location 10 (region 6 / travel 4) | Med (precise loc) | Med | Yes |
| `goals_open_to_fit` | Seeker stated goals / open-to alignment | Seeker profile | Yes | Yes | Goals 10 (open-to 6 / goal 4) | Low | Low | Yes |
| `completeness_confidence` | Profile/listing completeness backing the score | Profile + listing | Partial (improve prompt) | Yes (as confidence) | Completeness 5 + confidence axis | Low | Low | Yes |
| `behavioral_reliability` | Responsiveness/completion history (internal) | Platform activity | No | Aggregate label only | Behavioral 5 (recency 3 / response 2; capped) | High | High | Yes (internal-only, capped) |
| `host_requirements_fit` | Listing hard requirements (cert/visa/timeline) | Listing requirements | Yes (missing surfaced) | Yes | hard modifiers (caps 50-65) | Med | Med | Yes |
| `work_style_fit` | Work-style / schedule preference alignment | Seeker + listing | n/a | n/a | Deferred to V2 (not in canonical 100-pt table) | Med | Med | No (V2) |

## Proxy-risk review (fairness)

Signals carrying elevated **proxy** risk for protected attributes — `skills_cert_fit`, `location_travel_fit`, `pay_fit` — keep their locked weights **only while tied to explicit listing requirements** (not free inference). Location can proxy for national origin; certain credentials can proxy for age or national origin. Mitigation (locked): requirement-tied inputs only, surfaced in explanations, never demographic inference. **A founder/legal review is still recommended before production** (`A-MATCH-PROXY`).

## Notes

- `behavioral_reliability` and all responsiveness inputs are **internal-only** per canon ("do not publicly shame seekers"). Host transparency is an aggregate label, never a raw penalty. The penalty is capped at the 5-point component, with a cold-start grace and recovery curve — see `../hiring/responsiveness-inactivity-v1.md` and ADR-0001 §5.
- `work_style_fit` is deferred to V2 (decision 2026-05-31) to avoid diluting the locked 100-point model.
