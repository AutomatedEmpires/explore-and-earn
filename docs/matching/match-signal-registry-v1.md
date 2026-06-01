# Match Signal Registry V1

> DRAFT — architecture only. Signals map to the canonical component weights ("Exact Ranking, Matching & Boost Formula"). Final per-signal weights are ADR/founder-gated and marked TODO(?). No signal here may include or infer a prohibited signal (see `prohibited-signals-v1.md`).

Legend: Seeker-visible / Host-visible = whether the signal (or its contribution) may surface to that party. Weight locked = whether canon fixes its contribution. V1 = allowed in first implementation pass. Deferred = pushed to a later pack.

| Signal | Description | Source | Seeker-visible | Host-visible | Weight locked | Privacy risk | Fairness risk | V1 | Deferred |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `availability_fit` | Seeker availability overlaps listing timeline/season | Seeker profile, listing dates | Yes (reason) | Yes | Yes (Timeline 20) | Low | Low | Yes | No |
| `category_role_fit` | Seeker desired category/role matches listing | Seeker prefs, listing category | Yes | Yes | Yes (Role/category 15) | Low | Low | Yes | No |
| `skills_cert_fit` | Structured skills/certs match listing requirements | Seeker resume (structured), listing reqs | Yes (reason) | Yes | Yes (Skills/certs 20) | Med | Med (proxy risk) | Yes | No |
| `housing_pref_fit` | Housing provided vs seeker housing need | Seeker prefs, listing HOUSING | Yes | Yes | Yes (housing 5) | Low | Low | Yes | No |
| `meals_pref_fit` | Meals provided vs seeker preference | Seeker prefs, listing MEALS | Yes | Yes | Yes (meals 3) | Low | Low | Yes | No |
| `pay_fit` | Pay range vs seeker minimum/preference | Seeker prefs, listing PAY | Yes | Yes | Yes (pay 7) | Med | Med | Yes | No |
| `location_travel_fit` | Relative location / travel willingness | Seeker prefs, listing location | Yes | Partial (relative only) | Yes (Location 10) | Med (precise loc) | Med | Yes | No |
| `goals_open_to_fit` | Seeker stated goals / open-to alignment | Seeker profile | Yes | Yes | Yes (Goals 10) | Low | Low | Yes | No |
| `completeness_confidence` | Profile/listing completeness backing the score | Profile + listing | Partial (improve prompt) | Yes (as confidence) | Yes (Completeness 5 + confidence axis) | Low | Low | Yes | No |
| `behavioral_reliability` | Responsiveness/completion history (internal) | Platform activity | No | Aggregate/transparent only | Yes (Behavioral 5) | High | High | TODO(?) — founder gate | Partial |
| `host_requirements_fit` | Listing hard requirements (cert/visa/timeline) | Listing requirements | Yes (missing surfaced) | Yes | Yes (hard modifiers) | Med | Med | Yes | No |
| `work_style_fit` | Work-style / schedule preference alignment | Seeker + listing | TODO(?) | TODO(?) | No (TODO?) | Med | Med | TODO(?) | TODO(?) |

Notes:
- `behavioral_reliability` and all responsiveness inputs are **internal-only** per canon ("do not publicly shame seekers"). Host transparency, if any, is aggregate and explainable — never a raw penalty. See `../hiring/responsiveness-inactivity-v1.md`.
- Any signal touching skills/location/pay carries **proxy fairness risk**; flagged for founder/legal review before weights are locked.
- `work_style_fit` is exploratory; not in canonical weight table → defaults deferred / TODO(?).
