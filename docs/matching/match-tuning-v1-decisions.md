# Match Tuning V1 — Locked Decisions & Justification

> **STATUS: LOCKED for V1.** Founder authorization 2026-05-31 (thread: "you can determine the match weights, band thresholds, inactivity penalty and so on... do it intentionally... justify... defend"). This document is the canonical justification for every tunable in the matching/hiring system. The locked numbers are encoded as **config data** in `packages/contracts/src/matching-config.ts` (no algorithm). The scoring **engine** that consumes them is still gated by `A-MATCH-DEPLOY` (production matching deploy) and unbuilt.
>
> Canon anchors: "Exact Ranking, Matching & Boost Formula", "Matching Pipeline / Scoring / Refresh", "Application, Invite & Offer State Machines", "Lifecycle Registry", "Host Dashboard Spec", "Permission / Visibility / RLS Registry". Where canon already fixed a value, this doc **ratifies and defends** it; where canon left a `TODO(?)`, this doc **determines** it and explains why.

## Decision framework

Every tunable below is argued with: **Decision → Rationale → Why best for Explore&Earn → Alternatives rejected → Tradeoffs → Revisit trigger.** Two invariants constrain all choices:

1. **The score is assistive, not a verdict.** It ranks and explains; it never auto-decides (Critical Rule). So tuning optimizes *useful ordering + honest explanation*, not *precision theater*.
2. **Fit beats platform behavior.** Genuine seeker/listing fit must always dominate engagement/responsiveness signals, so the marketplace rewards real matches, not the most active accounts.

---

## 1. Component weights (top level, sum = 100)

| Component | Weight | Decision basis |
| --- | --- | --- |
| Timeline / availability | 20 | canon, ratified |
| Skills / certifications | 20 | canon, ratified |
| Role / category | 15 | canon, ratified |
| Housing / Meals / Pay | 15 (H5 / M3 / P7) | canon, ratified |
| Location / travel | 10 | canon, ratified |
| Goals / open-to | 10 | canon, ratified |
| Completeness confidence | 5 | canon, ratified |
| Behavioral reliability | 5 | canon, ratified |

**Rationale / defense.** The two **gating realities** of whether a placement can physically happen are *can the person be there at the right time* (timeline) and *can they do the work* (skills/certs). These are weighted highest (20 each = 40% combined) because a perfect score on everything else is worthless if either fails. Role/category (15) ensures the opportunity *type* matches intent before lifestyle factors. The **HOUSING/MEALS/PAY triad** (15) is the core value exchange of Explore&Earn — never "perks" — and pay carries the most weight inside it (7) because it is the most universally decisive economic factor, housing next (5) because it is the lifestyle differentiator E&E is known for, and meals least (3) because it is the smallest swing in a decision. Location/travel (10) and goals/open-to (10) are strong secondary fit. Completeness (5) and behavioral (5) are intentionally the **smallest** weights: they are tie-breakers, so the system can never let a polished-but-wrong profile out-rank a genuine fit.

**Alternatives rejected.** (a) Equal weighting — rejected: treats "can they legally/physically do this" the same as "is their profile tidy," which produces misleading ranks. (b) Pay-dominant model — rejected: E&E's differentiator is the lifestyle/experience exchange, not pure wage maximization. **Tradeoffs.** Heavy timeline/skills weighting can under-rank a flexible generalist; mitigated by adjacency credit (see sub-weights) and explanations. **Revisit trigger.** Post-launch match-acceptance data, or any change to the canonical formula.

## 2. Sub-weights (determined 2026-05-31; each block sums to its parent)

| Component (parent) | Sub-signal | Sub-weight |
| --- | --- | --- |
| Timeline (20) | availability-window overlap ratio | 14 |
| | start-date alignment | 4 |
| | shift / schedule compatibility | 2 |
| Skills/certs (20) | required-skill coverage | 12 |
| | preferred-skill coverage | 5 |
| | structured tag overlap | 3 |
| Role/category (15) | primary category match | 11 |
| | adjacent / secondary category | 4 |
| HMP (15) | housing provided meets need | 5 |
| | meals provided meets preference | 3 |
| | pay meets minimum | 5 |
| | pay above minimum (margin) | 2 |
| Location (10) | within preferred region / commute | 6 |
| | travel-willingness alignment | 4 |
| Goals (10) | explicit open-to category | 6 |
| | stated-goal alignment | 4 |
| Completeness (5) | completeness | 5 |
| Behavioral (5) | activity recency | 3 |
| | response rate | 2 |

**Rationale / defense.** Within **timeline**, the *amount* of overlap (14) matters far more than the exact start date (4) or shift nuance (2): a candidate available the whole season is materially better than one available for a sliver. Within **skills**, *required* coverage (12) dominates *preferred* (5) and weak *tags* (3) — and a truly missing **required certification** is not a sub-weight problem at all, it is a hard cap (see §4). Within **role**, an exact category (11) should clearly beat an adjacent one (4) but adjacency still earns credit so flexible seekers aren't erased. Within **HMP**, *meeting* the pay minimum (5) is decisive while paying *above* it (2) is a smaller bonus — we reward clearing the bar, not bidding wars. **Location** favors actually being reachable (6) over willingness to travel (4). **Goals** favors an explicit open-to declaration (6) over inferred goal text (4) to stay requirement-tied (anti-proxy). **Behavioral** splits 3/2 between recency and response rate, both capped (see §5).

**Alternatives rejected.** Binary required-skill gate that zeroes the whole skills block — rejected: too brittle and hides partial fit; the hard-cap mechanism (§4) is the explainable place for true blockers. **Tradeoffs.** More sub-signals = more to compute and explain; mitigated by keeping every sub-signal requirement-tied and surfaced in the explanation. **Revisit trigger.** Sub-weights are the first thing to tune from real acceptance/decline data; CI check **G32** asserts each block still sums to its parent.

## 3. Confidence components (canon, ratified)

Resume 25 / Listing 25 / Relevance extension 15 / Structured skills-certs-tags 15 / Host trust media 10 / Recency-activity 10 (sum 100). **Defense.** Confidence answers "how much do we actually know," so the two completion sources (resume + listing, 25 each) dominate — a score built on empty profiles must read as low-confidence. This axis is what powers the display gating in §7.

## 4. Hard-modifier caps (canon, ratified)

| Condition | Cap | Why this number |
| --- | --- | --- |
| Required certification missing | 60 | Top of "Developing" — visible with reason, never "Strong" |
| Impossible timeline conflict | 50 | Band boundary — clearly demoted but still explainable |
| Housing required but not included | 65 | Mid-"Developing" — a real but sometimes-negotiable blocker |
| Visa support required, unavailable | 50 | Band boundary — hard blocker, still shown with reason |
| Trust / moderation concern | cap **or hide** | Safety; handled by moderation service, not a fixed number |

**Rationale / defense.** Caps are deliberately set **at band boundaries** so a capped candidate lands in a band that *tells the truth*: a missing required cert can never present as "Strong" (cap 60 = top of Developing), and an impossible timeline sits exactly on the Developing/Needs-attention line (50). Crucially, caps **demote with an explanation** rather than silently delete (no hidden disqualifiers — Critical Rule). Housing-not-included caps *higher* (65) than a timeline conflict (50) because housing is more often negotiable than physics. **Alternatives rejected.** Hard exclusion on missing cert — rejected: removes host agency and hides candidates a host might still want. **Tradeoffs.** A capped-but-visible candidate can frustrate hosts who expected filtering; mitigated by clear concern messaging and host-side filters. **Revisit trigger.** Founder/legal review of any cap tied to a proxy-risk signal (`A-MATCH-PROXY`).

**Exclusions (not scored at all):** listing not live; seeker blocked/restricted; account banned/suspended; listing closed/archived. These are eligibility, not fit.

## 5. Inactivity / responsiveness model (touches Behavioral 5 ONLY)

**Decision.** Responsiveness can move **at most the 5-point behavioral component** — split activity-recency (max 3) + response-rate (max 2). It **never hides** a candidate and **never excludes**.

- **Cold-start grace:** behavioral component stays neutral until *both* (a) >=14 days since signup *and* (b) >=3 opportunities (invites/applications/offers) presented. New users are never penalized for a track record they could not yet build.
- **Activity recency (max 3):** active <=7d -> 3.0; 8-21d -> 2.0; 22-45d -> 1.0; >45d -> **0.5 floor** (never 0, so inactivity alone can't drop the component to zero).
- **Response rate (max 2):** only computed after >=5 surfaced opportunities in a rolling 90-day window. Ignore-rate -> points: <=20% -> 2.0; 21-50% -> 1.0; >50% -> 0.5. Below sample size -> neutral 2.0. An explicit **"not interested"** decline is **not** an ignore (it's healthy signal).
- **Recovery:** any qualifying activity resets recency immediately; response-rate ages out over the rolling 90 days, so old silence stops mattering.
- **Seeker framing:** never "you were penalized" — always "stay active to improve your visibility," with a recovery path.
- **Host transparency:** aggregate label only ("Active this week" / "Active recently" / "Last active 3+ weeks ago") — never a raw penalty number.

**Rationale / defense.** Capping the entire responsiveness effect at 5/100 makes it mathematically impossible for an active-but-wrong candidate to out-rank an inactive-but-perfect one by responsiveness alone — fit always wins. The cold-start window and 0.5 floor directly satisfy the canon rules "do not over-penalize early users" and "avoid black-box suppression." Separating *not-interested* from *inactive* prevents punishing honest declines. **Alternatives rejected.** A multiplicative activity penalty on the whole score — rejected: lets engagement dominate fit and is exactly the black-box suppression canon forbids. **Tradeoffs.** A genuinely unresponsive top-fit candidate may still rank highly; acceptable because the host sees the activity label and decides. **Revisit trigger.** `A-MATCH-INACTIVITY` re-review if abuse (ghosting) data shows 5 points is too soft.

## 6. Band thresholds (host + internal)

| Band | Score range | Host label | Seeker label |
| --- | --- | --- | --- |
| Strong | 75-100 | Strong | Strong fit |
| Developing | 50-74 | Developing | Good fit |
| Needs attention | 0-49 | Needs attention | Partial fit |

**Rationale / defense.** With the weight distribution, reaching **75** requires clearing most of the two gating realities (timeline+skills = 40) *plus* solid secondary fit — so "Strong" honestly means "both gating realities met and real lifestyle fit." **50** means at least one gating reality is solidly met (and no disqualifying cap dragged them lower). Below 50, a gating reality is weak or a hard cap applied -> the host should look closely ("needs attention"). The thresholds also line up with the §4 caps (60 sits inside Developing; 50 on the boundary) so caps and bands tell a consistent story. **Alternatives rejected.** Four or five bands — rejected: more bands imply more precision than a heuristic warrants (false precision) and clutter the host UI. **Tradeoffs.** Three bands are coarse; mitigated by the always-present explanation. **Revisit trigger.** `A-MATCH-HOST-RANK`; CI check **G33** asserts thresholds stay strictly ordered.

## 7. Confidence display gating (no false precision)

- **confidence < 40:** withhold score *and* band; show "Building match — complete your profile" (seeker) / "Limited data" (host).
- **40 <= confidence < 60:** show band with a "based on limited info" qualifier.
- **confidence >= 60:** full display (band, and a rounded integer score where shown).

**Rationale / defense.** Resume (25) + listing (25) completion alone can produce a 50 score, so a sub-40 confidence means even basic completion is missing — showing a confident band there would be a lie. 40 is the "enough to say something, with a caveat" line; 60 is "enough to stand behind it." This operationalizes the Critical Rule **no false precision** and the "low confidence must visibly temper the score" canon. **Alternatives rejected.** Always show the number — rejected: invites "97% perfect match" misreads. **Tradeoffs.** Some real matches are hidden until profiles fill in; mitigated by an explicit completion prompt. **Revisit trigger.** `Q-MATCH-STALE-DISPLAY` resolution review.

**Stale-but-shown rule.** If `now > staleAt` but confidence >= 40, show the last good band with a subtle "Refreshing" indicator and queue a refresh; if a high-impact input changed (availability/skills/requirements), mark stale, queue an **immediate** recompute, and show "Updating match" instead of a possibly-wrong band.

## 8. Invite anti-spam caps

| Cap | Value |
| --- | --- |
| Active invites per (host, seeker, listing) | 1 |
| Concurrent active invites per (host, seeker) | 2 |
| Invites per (host -> seeker) per rolling 30 days | 3 |
| Per-host daily soft cap (beyond credits) | 50 |
| Per-seeker newly-surfaced invites/day | 10 (overflow digested) |
| Credit restored when | withdrawn/expired **before delivered** only |

**Rationale / defense.** Seeker trust is a core E&E asset, so the tightest limits protect the seeker: no duplicate invite to the same listing, and a hard ceiling of 3 invites from one host in 30 days stops a single host from badgering one person. Caps are framed *per relationship* rather than purely global so legitimate high-volume hosts (Enterprise tier, 10 included invites) aren't blocked — the 50/day soft cap only catches abuse far beyond any tier's economics. Credit restoration only **before delivery** because once a seeker has seen an invite, the host consumed the value (a view happened); restoring then would be gameable. **Alternatives rejected.** Purely credit-gated with no relationship caps — rejected: a host could dump all credits on one seeker. **Tradeoffs.** A host re-engaging a great candidate across several listings hits the concurrent-2 cap; acceptable to protect seekers, and withdrawals free slots. **Revisit trigger.** `Q-INVITE-SPAM` review with real abuse data.

## 9. Reminder schedule (policy locked; sending deferred)

- `invite_expires_soon`: **T-3 days and T-1 day** before expiry (14-day window).
- `offer_expires_soon`: **T-3 days and T-1 day** before expiry (7-day window).
- `profile_incomplete`: weekly digest, max 1/week, suppressible.
- Global: max **2** reminders per object; never same-day duplicates; respect G18 suppression/digest.

**Rationale / defense.** Two nudges, spaced, with a final-day urgency beat is the lightest schedule that meaningfully reduces silent expiries without nagging — critical because over-reminding erodes the trust the marketplace runs on. The same T-3/T-1 shape works for both the 14-day invite and 7-day offer (still well separated at 7 days). **Sending stays gated** behind the Notification build pack — this locks the *policy*, not an implementation. **Alternatives rejected.** Daily reminders — rejected as nagging; single reminder — rejected as too easy to miss. **Revisit trigger.** Open-rate / expiry data once the Notification pack ships (`A-MATCH-REMINDERS`).

## 10. Offer expiry (canon, ratified)

**Decision.** 7 days after `extended_at`. **Defense.** Long enough for a seeker to weigh a real relocation/housing/lifestyle decision, short enough to keep marketplace velocity and free the host to extend elsewhere. **Tradeoffs.** Tight for big moves; mitigated by the T-3/T-1 reminders and host's ability to re-extend. **Revisit trigger.** `A-OFFER-EXPIRY`. (Invite 14 days and application auto-expire 30 days are likewise ratified.)

## 11. Not-selected behavior

**Decision.** Neutral and non-shaming: the seeker sees "Not selected" with **no score and no reason**; **no free-text reason** is stored in analytics; `not_selected` does **not** feed any seeker matching/behavioral penalty. Re-apply is allowed when the listing materially re-opens (new dates/season) **or** after 30 days, capped at **2 applications per (seeker, listing) per 12 months**.

**Rationale / defense.** A not-selected is a host *fit* decision, not a statement about the seeker's quality — treating it as a seeker-quality signal would be both unfair and a fairness/legal risk, so it is explicitly firewalled from matching. Hiding reasons protects both parties (no defamation surface, no shaming). The re-apply window respects seeker agency while preventing churn/harassment of a host. **Alternatives rejected.** Capturing structured rejection reasons in V1 — rejected: high sensitivity/legal exposure with little V1 value. **Revisit trigger.** `A-NOT-SELECTED`.

## 12. Seeker-visible copy

Band labels — seeker: **Strong fit / Good fit / Partial fit**; host: **Strong / Developing / Needs attention**. Explanation header: **"Why this fits"**. Missing-info framing: **"Add this to improve your match"**. A rounded integer score may accompany the band only at confidence >= 60. **Defense.** Seeker copy is honest but encouraging ("Partial fit," never "bad match" or "low"), preserving dignity and agency; host copy is operational. No sub-percent precision anywhere (no "97%"). **Revisit trigger.** `A-MATCH-SEEKER-COPY` with design.

## 13. Explanation storage

**Decision.** Derive explanations **on read**; persist only the structured `reasons[]` on `MatchResult`. Do **not** store explanation free-text. **Defense.** Minimizes retention/privacy scope (G28), avoids stale or drifting explanation text, and keeps explanations cheap to regenerate from canonical reasons. Because nothing is stored, the `A-MATCH-EXPL-STORE` gate is satisfied by **not crossing it**. **Revisit trigger.** A compliance/audit requirement for immutable explanation snapshots.

## 14. AI / ML usage

**Decision.** **None** in V1 — heuristic, deterministic, fully explainable. **Defense.** Opaque models conflict with the explainability Critical Rule and add cost/privacy/fairness risk; abstaining requires no approval and is the safe default. **Revisit trigger.** Post-launch, via `A-MATCH-AI`, only with an explainability story.

## 15. `behavioral_reliability` & `work_style_fit`

`behavioral_reliability` ships in V1 (internal-only, capped at 5, per §5). `work_style_fit` is **deferred to V2** — it is not in the canonical 100-point table and adding it now would dilute a locked model.

## 16. Event naming

`candidate_shortlisted` is **retired** ("shortlisted" is prohibited); the canonical event is **`candidate_saved`** (mirrors `saved_by_host`). UI events `candidate_card_opened`, `candidate_profile_popup_opened`, `quick_apply_clicked`, and the passive `match_score_impression` are **adopted** for V1 instrumentation (IDs only). **Canon-sync owed:** these must be mirrored into the Notion Event Registry (`Q-MATCH-EVENT-ADDS`, `Q-MATCH-EVENT-SHORTLIST`).

---

## Guardrail implications (proposed CI checks)

- **G31** — component weights in `matching-config.ts` sum to exactly 100.
- **G32** — each sub-weight block sums to its parent component weight.
- **G33** — band thresholds are strictly ordered (0 <= developing_min < strong_min <= 100).
- **G34** — no stored explanation text (enforces §13); explanation derived from `reasons[]`.
- Existing G8/G11/G13/G16 continue to apply. New G-numbers are **proposed**; founder assigns final numbers (G1-G30 are locked).

## What is still NOT decided here

- Production matching deployment (`A-MATCH-DEPLOY`) — still gated.
- Proxy-risk / fairness signals (`A-MATCH-PROXY`) — weights locked but **legal review recommended before production**; signals stay tied to explicit listing requirements.
- Any AI/ML use (`A-MATCH-AI`) — intentionally not used in V1.
- Notification **sending** — deferred to the Notification build pack.
