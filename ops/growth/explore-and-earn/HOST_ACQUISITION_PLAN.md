# Explore&Earn Founding-Host Acquisition Plan

Last updated: 2026-07-12

Owner: Growth / founding-host operator

Scope: first-wave United States supply acquisition

## Outcome

Build a consent-aware pipeline that converts 100 public business prospects into 30 personalized outreach targets, 10 call-ready conversations, and 3 founding-host pilots. The system acquires hosts; it never imports, mirrors, or republishes another marketplace's listings.

| Funnel stage | First-wave target | Exit requirement |
| --- | ---: | --- |
| Sourced prospects | 100 | Public business identity, website or authoritative directory source, location, fit rationale, and check date |
| Priority outreach | 30 | Score at least 65, usable public business contact route, strategic category/geography value, personalized reason to contact, no suppression flag |
| Call-ready | 10 | Score at least 70, current public phone or named/hiring contact, likely seasonal need, two researched questions |
| Pilot target | 3 | Strong category/geography value, credible recurring need, willingness to validate Housing / Meals / Pay, and a reachable decision-maker |

The canonical first-wave records are in `data/growth/explore-and-earn/host_prospects.csv`. “Prospect” never means “partner.” A company becomes a participating host only after an authorized representative opts in and completes onboarding.

## Supply thesis

Explore&Earn is most useful where place, season, and basic living logistics shape a worker's decision. The first wave deliberately spans farms, ranches, fisheries, marinas, resorts, lodges, camps, outdoor operators, campgrounds, and remote hospitality employers. The portfolio must maintain at least five categories and five states/regions; category balance matters more than producing a long list from a single association.

The strongest early hosts have:

- a recurring or concentrated labor season;
- a public business footprint and a reachable operator or hiring route;
- a reason to explain Housing, Meals, and Pay clearly;
- direct control over their opportunity details and media rights;
- enough operational maturity to answer applicant questions promptly; and
- interest in shaping a new seeker-first channel without replacing their existing hiring channels.

## Competitor-aware acquisition position

Explore&Earn does not need to beat general aggregators on inventory volume or replace category specialists. The first-wave pitch is a complementary, host-controlled decision layer for seekers choosing a place and practical arrangement:

- Farm, Maritime, Remote, and Seasonal only;
- Seek, Swipe, and Map discovery around the reusable Discovery Card;
- Housing, Meals, and Pay visible as structured answers rather than buried in generic perks; and
- host-created profiles, opportunity details, and rights-cleared evidence rather than copied marketplace inventory.

Competitor boards may be used for market vocabulary and employer-name discovery only. A lead enters this pipeline only after the operator independently resolves the official host domain and verifies the public business contact route. See `COMPETITOR_INTELLIGENCE.md`, `CATEGORY_SEARCH_PLAYBOOK.md`, and `SEARCH_QUERY_BANK.md`.

Normalized to the four marketplace lanes, the current 30 high-priority records are 21 Seasonal, 6 Farm, 3 Maritime, and 0 Remote. Preserve all 30 high-priority statuses, but sequence them for learning:

1. call the existing top 10 in their ranked order;
2. contact the five remaining Farm and two remaining Maritime records, plus one camp/outdoor operator;
3. use those results before scaling the remaining twelve Seasonal records; and
4. run a separate 15-record Remote discovery sprint for official-site-verified travel/outdoor/farm/maritime/seasonal-life employers.

This is a within-band contact order, not a rescore or an assertion that a prospect uses any particular competitor. The detailed record order and hypotheses are in `HOST_ACQUISITION_COMPETITOR_GAP_STRATEGY.md`.

## Data and legal operating rules

1. Research only public, no-login business websites and public government, chamber, tourism, agriculture, marina, resort, camp, or association directories.
2. Store the business identity, public business contact route, source URL, and an original fit assessment. Do not collect or copy job-board listing text, photos, pay, housing, meals, or applicant data.
3. Treat `likely_season`, `likely_housing`, and `why_fit` as internal outreach hypotheses. They must not be published as facts. Housing remains `Unknown — confirm with host` unless the host's own site explicitly supports a stronger statement.
4. Never say a prospect is “on Explore&Earn,” “verified,” “featured,” or “partnered” before an authorized representative accepts and the relevant product requirements are met.
5. Use individualized messages only. No purchased lists, address guessing, email-pattern generation, hidden-page extraction, automation behind logins, or scraping around technical restrictions.
6. Before every send, check the suppression list and re-open the cited source. If the address or role cannot be confirmed, use the public contact form or main business line.
7. Commercial email must use accurate sender details, an honest subject, a valid physical postal address, and a clear opt-out. Suppress an opt-out immediately and in all cases within 10 business days. The FTC states that CAN-SPAM applies to business-to-business commercial email as well as bulk email: [FTC CAN-SPAM compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
8. A public phone number is not treated as SMS consent. Do not cold-text this list. The included SMS copy may be used only after the recipient explicitly asks for or agrees to a text follow-up. Do not use autodialers, prerecorded calls, or bulk texting. See the FCC's guidance on consent and revocation for robocalls and robotexts: [FCC 24-24](https://docs.fcc.gov/public/attachments/FCC-24-24A1_Rcd.pdf).
9. This is a conservative U.S.-first operating policy, not legal advice. Counsel must review expansion into other countries, high-volume automation, purchased enrichment, or a materially different channel.

## Scoring model

Score only evidence available from the cited public source. `confidence_score` is a reproducible research-confidence and fit index, not a probability, credit score, legal conclusion, or claim that the prospect hires seasonally or provides housing. Scores are capped at 95 until a host confirms the operating facts.

| Dimension | Points | Evidence |
| --- | ---: | --- |
| Seasonal / recurring workforce fit | 15 or 25 | 15 when inferred from the operating model; 25 when the official source states seasonal hiring, jobs, dates, or a season |
| Explore&Earn category and place fit | 20 | Retained only when the public operating model fits an in-scope host category |
| Housing / meals discovery value | 8, 10, or 15 | 15 only for an official employee-housing statement; 10 for remote/on-site operations; 8 for other place-based targets; no provision is assumed |
| Contactability | 0–15 | Public email +7, phone +4, named contact +3, public role +1, capped at 15 |
| Trust footprint | 0–10 | 10 for a current official-site source; directory-only records score lower and did not survive the final cut |
| Portfolio diversity value | 0–10 | +5 when the final-wave category has six or fewer records; +5 when the state has two or fewer |
| Timing signal | 3 or 5 | 5 when an official schedule/date supports timing; 3 when timing is an explicitly labeled inference |

Priority bands:

- `high`: one of the selected 30 outreach records, score at least 65, a current direct route, and strategic category/geography value;
- `medium`: a source-verified reserve record that is not in the first 30;
- `low`: directory/contact pending, no usable route, or weak fit; no `low` record remains in the final 100.

The final scores range from 62 to 90. Outreach priority is a separate operator decision and is not produced by sorting score alone.

## CRM stages and required actions

| Stage | Operator action | Required evidence |
| --- | --- | --- |
| `researched` | Verify site, source, category, location, and contact route | `source_url`, `last_checked_at`, `verification_status` |
| `ready_for_personalization` | Add one company-specific reason and one discovery question | `why_fit`, source note |
| `approved_to_contact` | Check suppression and channel rules | channel, operator initials, approval timestamp |
| `email_1_sent` | Send one-to-one cold email | exact template version, sent timestamp |
| `call_attempted` | Call a public business line manually | outcome and any permission to text |
| `follow_up_1_sent` | Send only if no opt-out | sent timestamp |
| `conversation` | Record needs in the feedback taxonomy | response summary, direct quote only with permission |
| `pilot_candidate` | Confirm decision-maker, need, and triad readiness | pilot criteria checklist |
| `onboarding` | Send host-owned onboarding link | authorized contact and consent timestamp |
| `activated` | Host submits original listing and media | host account/listing reference |
| `nurture` | Set a relevant future month; stop current sequence | reason and next-review date |
| `suppressed` | Stop all promotional contact | channel, reason, request timestamp, effective timestamp |

Maintain a global suppression table outside the prospect export with: normalized email, normalized phone, domain/company, channel, reason, request text, requested_at, suppressed_at, source campaign, and operator. Suppression wins over any later re-import.

## First-wave sequence

The operator sends no more than one action per company per business day and stops immediately on any opt-out, wrong-recipient complaint, or explicit lack of interest.

| Timing | Action | Purpose |
| --- | --- | --- |
| Day 0 | Short personalized email | Ask whether transparent seasonal recruiting is relevant; do not ask for a meeting and a listing at once |
| Day 3–4 | Manual call to public business line for the top 10 only | Identify the right owner/operator and request a 15-minute fit conversation |
| Day 6–7 | Follow-up 1 | Share the three-question Housing / Meals / Pay frame and one clear CTA |
| Day 12–14 | LinkedIn/Facebook message only where the business publicly uses that channel | Ask permission to route the note to the right person; never automate DMs |
| Day 18–21 | Follow-up 2 | Close the loop and offer a later-season reminder |
| After Day 21 | Nurture or suppress | No indefinite drip sequence |

Warm introductions bypass the cold sequence and start with the warm-intro template. SMS is never a cold step.

## Call-ready packet

Before calling any of the top 10, prepare a one-page CRM view containing:

- company, public contact, time zone, website, and exact source URL;
- category and one-sentence fit hypothesis;
- two questions that do not assume hiring, housing, meals, or pay;
- the relevant season hypothesis, labeled as an inference;
- current Founding Host pricing and seat terms from the repository canon;
- response choices: pilot now, revisit month, not a fit, wrong contact, or suppress.

Add two competitor-aware fields to the call card:

- `current_channels_to_ask_about` — an unanswered discovery prompt, never a claim that the company uses a platform; and
- `clarity_hypothesis` — one Housing / Meals / Pay, place, evidence, credential, or application expectation that may still require applicant follow-up.

Do not lead by naming a competitor. Ask where the host's current channels work well and what candidates still need clarified.

## Pilot selection

Choose three pilots from the top 10 only after a live conversation. Aim for complementary learning:

1. a remote lodging or resort operation, to test housing and meal evidence;
2. a farm, ranch, or fisheries operation, to test variable schedules and pay presentation; and
3. a camp, marina, campground, or outdoor operator, to test high-volume seasonal applicant flow.

Do not call a company a pilot target externally until it agrees. The source log records the three recommended outreach-first prospects; CRM status changes to `pilot_candidate` only after a positive conversation.

## Weekly operating cadence

- Monday: refresh 20 records, check suppression, approve 10 personalized emails.
- Tuesday: send approved emails; research the next cohort.
- Wednesday: make top-10 manual calls and log feedback within the same day.
- Thursday: send due follow-ups and hold onboarding sessions.
- Friday: review funnel metrics and update the product feedback digest.

Until the Remote lane has a qualified cohort, use one Monday research block for the 15-record Remote discovery sprint. Do not add generic remote employers merely to balance the table.

Metrics: verified-source rate, direct-contact rate, positive-reply rate, conversation rate, pilot acceptance rate, listing-start rate, listing-completion rate, time to first live listing, opt-out rate, complaint rate, and the share of listings with complete Housing / Meals / Pay evidence. Complaint rate above zero pauses the sequence for operator review; missing suppression evidence also pauses sends.

## Definition of done

The first wave is complete when the dataset passes schema and URL checks, contains 100 unique prospects across at least five categories and five states/regions, identifies 30 high-value outreach records, prepares 10 call-ready packets, and produces three conversation-dependent pilot recommendations. No copied inventory is created; every live opportunity must originate from an opted-in host.
