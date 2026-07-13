# Explore&Earn Host Product Feedback Loop

Last updated: 2026-07-12
Purpose: turn founding-host conversations and onboarding behavior into evidence-backed product improvements without turning individual requests into unreviewed product truth

## Loop

```text
Outreach response → structured capture → weekly synthesis → product-area owner
→ decision / experiment → instrumented pilot → host + seeker outcome review
→ canon / backlog / no-change record
```

The CRM is the raw evidence layer. Durable product decisions still belong in the repository/Notion canon and must pass the relevant founder gates. Sales enthusiasm is not a substitute for consent, trust review, or data validation.

## Capture within one business day

For every meaningful response, record:

| Field | Description |
| --- | --- |
| `feedback_id` | Stable internal ID |
| `prospect_or_host_id` | CRM record; never a public identifier |
| `company_category` / `region` | Cohort context |
| `funnel_stage` | Outreach, fit call, onboarding step, submitted, active, declined |
| `source_channel` | Email, call, permissioned SMS, social DM, onboarding behavior, support |
| `product_area` | One primary taxonomy tag below; optional secondary tag |
| `feedback_type` | Need, friction, objection, confusion, defect, request, trust concern, positive signal |
| `summary` | Operator paraphrase with no unnecessary personal data |
| `verbatim_quote` | Optional; only with permission for internal use and never for marketing by default |
| `evidence_strength` | Observed behavior, direct statement, operator inference |
| `severity` | Blocks onboarding, materially slows, minor, idea |
| `frequency` | First report, repeated, widespread in cohort |
| `requested_outcome` | What the host was trying to accomplish |
| `current_workaround` | Existing process or channel |
| `consent_and_privacy_notes` | Recording permission, restrictions, sensitive details removed |
| `captured_at` / `owner` | Audit trail |

Operator inference must be labeled. Do not convert “housing changes every year” into “housing provided,” or “we run summer trips” into “we hire every summer.”

## Product-area routing taxonomy

### 1. Listing creation

Capture:

- time to complete, unclear fields, save-and-return failures, repeated text, role reuse needs;
- what hosts try to paste or import and why;
- differences by role, property, season, and employment arrangement; and
- which fields a host cannot answer at draft time.

Feed into:

- clearer step order and conditional logic;
- reusable host-owned templates that never import third-party copy;
- explicit `unknown`, `variable`, and `confirm by` states;
- draft versioning and required reviewer notes.

Pilot measure: median time to a complete original draft; changes requested per draft; abandonment by step.

### 2. Housing evidence popups

Capture:

- evidence a host can safely provide, evidence age, privacy/security concerns, and seasonal variability;
- seeker questions hosts repeatedly answer;
- what exact photos or documents are unavailable and why; and
- discomfort with displaying exact addresses or interiors publicly.

Feed into:

- evidence-state labels (`host_attested`, `photo_supported`, `document_supported`, `needs_confirmation`);
- role/season-specific evidence and `last confirmed` dates;
- public/private evidence separation and location redaction;
- popup copy that explains evidence without implying inspection or habitability certification.

Pilot measure: evidence completion, evidence freshness, seeker opens, pre-application housing questions, and reported mismatches.

### 3. Meal evidence

Capture:

- meals per shift/day, days off, kitchen access, discounts/stipends, deductions, grocery distance;
- dietary accommodations hosts can and cannot commit to; and
- differences between guest food service and employee meals.

Feed into:

- structured meal schedules, costs, and variability;
- evidence prompts for employee dining rather than marketing food photos;
- a visible “ask before accepting” state for uncertain accommodations.

Pilot measure: meal-field completion and meal-related clarification messages before application.

### 4. Pay comparison

Capture:

- compensation cadence, ranges, expected hours, overtime, tips, bonuses, deductions, and seasonal changes;
- what inputs the host can substantiate and when;
- host concerns about an estimated comparison being mistaken for guaranteed take-home pay.

Feed into:

- structured inputs with effective dates and version history;
- gross-pay scenarios separated from housing/meal deductions;
- visible assumptions, ranges, and “host-provided” labels;
- no estimate when a required input is unknown.

Pilot measure: pay-field error rate, correction rate, and seeker misunderstanding reports. Any ranking or “best value” use requires explicit product review.

### 5. Verification badges

Capture:

- what hosts and seekers believe “Verified Host” means;
- which checks they expect: paid status, identity, business existence, property control, claim evidence, moderation history;
- willingness to complete each check and privacy burden; and
- confusion between Founding Host cohort status and verification.

Feed into:

- precise badge qualifiers and explainer copy;
- distinct labels for cohort, subscription, host attestation, evidence, and any future independent check;
- prohibition on a single badge silently accumulating multiple meanings.

Pilot measure: comprehension interviews and support questions, not clicks alone. Badge issuance, KYC, moderation, or trust claims are `gate:trust-safety` decisions and cannot be changed from this loop without founder approval.

### 6. Host profile

Capture:

- information hosts want to reuse across opportunities;
- public contact and location-privacy preferences;
- staff roles, response expectations, operating story, accessibility, transport, and recurring seasons;
- profile elements seekers ask about that do not belong in a single listing.

Feed into:

- clear company-vs-opportunity boundaries;
- explicit public/private controls;
- host-owned update reminders and freshness indicators;
- a rights-cleared media library scoped to the host.

Pilot measure: profile completeness, reuse rate, update time, and seeker profile opens before applying.

### 7. Seeker application flow

Capture:

- questions hosts truly need to decide next steps;
- existing ATS or email handoffs and duplicate-entry pain;
- response-time expectations, interview stages, certifications, and accessibility alternatives;
- fields that could introduce discrimination, sensitive-data collection, or unsafe disclosure.

Feed into:

- smallest useful common application plus role-specific questions;
- stage/status clarity and on-platform messaging;
- explicit host screening scope and consent-aware handoffs;
- guardrails against protected-class or irrelevant sensitive questions.

Pilot measure: application completion, host review time, duplicate data entry, status response time, and withdrawal reasons.

### 8. Safety and trust requirements

Capture:

- unsafe-condition reports, housing/pay mismatches, off-platform payment requests, identity concerns, harassment, retaliation, and emergency escalation needs;
- evidence the reporter can safely share and confidentiality requirements;
- host requests for screening and seeker requests for independent verification.

Feed into:

- report categories, triage severity, evidence preservation, response targets, appeals, repeat-actor review, and emergency guidance;
- explicit separation between platform review and legal/physical inspection;
- minimal, role-limited access to sensitive reports.

Immediate escalation: credible imminent harm, exploitation, trafficking indicators, unlawful fees, identity fraud, retaliation, or a material Housing / Meals / Pay mismatch. The growth operator pauses the affected listing/outreach path and routes it to the approved trust/safety owner. Do not investigate beyond role or promise confidentiality that the system cannot provide.

## Weekly synthesis

Every Friday, the growth operator produces a one-page digest:

1. cohort and funnel counts;
2. top five repeated frictions with frequency and severity;
3. one positive workflow signal worth preserving;
4. trust/safety escalations, de-identified;
5. proposed experiments with owner and success metric;
6. decisions needed and the applicable founder gate; and
7. feedback closed since the prior digest.

Minimum evidence for a routine experiment: three independent hosts report the same friction, or one directly observed blocker prevents onboarding. One strategic or severe trust issue can be escalated immediately without waiting for frequency.

## Decision states

Every synthesized item receives one state:

- `clarify_copy` — reversible language change within existing canon;
- `prototype` — test a workflow without changing trust, legal, billing, schema, or public-launch commitments;
- `backlog` — valid but not first-wave critical;
- `needs_research` — missing seeker view, data, or cross-category evidence;
- `founder_gate` — money, auth, database/RLS, trust/safety, legal, public launch, or locked philosophy;
- `no_change` — documented reason, so the same request is not repeatedly rediscovered;
- `shipped_and_measuring` — experiment live with owner, cohort, and stop rule;
- `validated` or `reverted` — outcome recorded.

## Experiment guardrails

- Never test by fabricating host details, housing, meals, pay, demand, applicant volume, or seat scarcity.
- Never publish a prospect or draft without host authorization.
- Never use a trust/safety experiment to weaken reporting, consent, or evidence disclosure.
- Do not reuse host quotes, logos, photos, or names in marketing without separate permission.
- Do not expose individual response data in analytics; use stable internal IDs and minimized event properties.
- A product experiment has a start date, owner, cohort, hypothesis, primary metric, harm/complaint stop rule, and review date.

## Closing the loop with hosts

For hosts who contributed material feedback, send a concise outcome note only through a permitted channel:

> You told us [paraphrased problem]. We [clarified / tested / decided not to change] [specific workflow] because [reason]. The current behavior is [what to expect]. Thank you for helping us make the host experience more accurate.

Do not imply the host endorsed the final solution. Product feedback participation is not a partnership, testimonial, or waiver of future complaints.
