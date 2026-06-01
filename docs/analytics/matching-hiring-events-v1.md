# Matching & Hiring Analytics Events V1

> DRAFT — taxonomy only. No PostHog sending implemented. Canonical event names come from the "Canonical Event Registry" — **the registry wins** over the directive's draft names. **Event-name conflicts resolved 2026-05-31** (ADR-0001 §16); new events are adopted with a **canon-sync owed** back to the Notion Event Registry (`Q-MATCH-EVENT-ADDS`, `Q-MATCH-EVENT-SHORTLIST`).

Convention (canon): snake_case, past-tense. **Properties are IDs only** — never protected attributes, raw resume content, precise location, or private contact.

## Matching events

| Event | Actor | Surface | Properties (ids only) | Privacy | Do NOT track |
| --- | --- | --- | --- | --- | --- |
| `match_generated` | system | server | `seeker_profile_id`, `listing_id`, `match_result_version` | internal | subscores, protected attrs |
| `match_marked_stale` | system | server | `match_result_id`, `reason` | internal | — |
| `match_refreshed` | system | server | `match_result_id`, `trigger` | internal | — |
| `matched_bucket_viewed` | seeker/host | feed/dashboard | `bucket_id`, `count` | standard | individual seeker ids in bulk |
| `match_reason_opened` | seeker/host | card/review | `match_result_id` | standard | explanation free-text |
| `match_score_clicked` | seeker/host | card/review | `match_result_id` | standard | raw numeric subscores |
| `match_score_impression` | seeker/host | card/review | `match_result_id` | standard | raw numeric subscores |
| `empty_match_bucket_shown` | seeker/host | feed | `bucket_id` | standard | — |
| `match_pool_building_prompt_shown` | seeker | feed | `bucket_id` | standard | — |

## Candidate review / UI events (ADOPTED 2026-05-31 — canon-sync owed)

| Event | Actor | Surface | Properties (ids only) | Privacy | Do NOT track |
| --- | --- | --- | --- | --- | --- |
| `candidate_saved` | host | review | `application_id` or `seeker_profile_id`, `listing_id` | standard | host notes free-text |
| `candidate_card_opened` | host | review | `seeker_profile_id`, `listing_id` | standard | resume content |
| `candidate_profile_popup_opened` | host | review | `seeker_profile_id` | standard | resume content |
| `quick_apply_clicked` | seeker | listing/feed | `listing_id` | standard | — |

`candidate_saved` replaces the prohibited `candidate_shortlisted` and mirrors the `saved_by_host` state.

## Invite events

| Event | Actor | Surface | Properties (ids only) | Privacy | Do NOT track |
| --- | --- | --- | --- | --- | --- |
| `invite_created` | host | review/dashboard | `invite_id`, `listing_id`, `seeker_profile_id`, `match_result_id` | standard | resume content |
| `invite_sent` | host/system | server | `invite_id` | standard | — |
| `invite_delivered` | system | server | `invite_id` | standard | — |
| `invite_viewed` | seeker | invite surface | `invite_id` | standard | — |
| `invite_applied` | seeker | invite surface | `invite_id`, `application_id` | standard | — |
| `invite_ignored` | system | server | `invite_id` | internal | — |
| `invite_expired` | system | server | `invite_id` | internal | — |
| `invite_withdrawn` | host | dashboard | `invite_id` | standard | — |
| `invite_credit_consumed` | system | server | `host_id`, `invite_id` | billing-internal | — |
| `invite_credit_restored` | system | server | `host_id`, `invite_id`, `reason` | billing-internal | — |

## Offer events

| Event | Actor | Surface | Properties (ids only) | Privacy | Do NOT track |
| --- | --- | --- | --- | --- | --- |
| `offer_created` | host | review/dashboard | `offer_id`, `listing_id`, `seeker_profile_id` | standard | pay terms as free-text |
| `offer_sent` | host/system | server | `offer_id` | standard | — |
| `offer_delivered` | system | server | `offer_id` | standard | — |
| `offer_viewed` | seeker | offer surface | `offer_id` | standard | — |
| `offer_accepted` | seeker | offer surface | `offer_id` | standard | — |
| `offer_declined` | seeker | offer surface | `offer_id` | standard | decline reason free-text |
| `offer_expired` | system | server | `offer_id` | internal | — |
| `offer_withdrawn` | host | dashboard | `offer_id` | standard | — |

## Application events

| Event | Actor | Surface | Properties (ids only) | Privacy | Do NOT track |
| --- | --- | --- | --- | --- | --- |
| `application_started` | seeker | listing/apply | `listing_id` | standard | — |
| `application_submitted` | seeker | apply | `application_id`, `listing_id` | standard | resume content |
| `application_viewed_by_host` | host | review | `application_id` | standard | — |
| `application_status_changed` | host/system | server | `application_id`, `from`, `to` | standard | — |
| `application_withdrawn` | seeker | dashboard | `application_id` | standard | — |
| `application_not_selected` | host/system | review | `application_id` | standard | reason free-text (never stored) |
| `application_expired` | system | server | `application_id` | internal | — |
| `application_accepted` | seeker/system | server | `application_id` | standard | — |
| `application_completed` | host/system | server | `application_id` | standard | — |

## Directive -> canon reconciliation (RESOLVED 2026-05-31)

| Directive event | Resolution |
| --- | --- |
| `match_score_viewed` | Passive impression -> adopt `match_score_impression` (distinct from `match_score_clicked`). |
| `match_explanation_opened` | Use `match_reason_opened` (registry). |
| `application_viewed_by_host` | Matches registry. |
| `invite_sent` / `invite_viewed` / `invite_expired` | Match registry. |
| `offer_sent` / `offer_viewed` / `offer_accepted` / `offer_declined` | Match registry. |
| `application_submitted` | Matches registry. |
| `candidate_card_opened` | Adopted (UI event). Canon-sync owed. |
| `candidate_profile_popup_opened` | Adopted (UI event). Canon-sync owed. |
| `candidate_invited` | Use canonical `invite_created` / `invite_sent`. |
| `invite_responded` | Split into `invite_applied` / `invite_ignored` (registry). |
| `quick_apply_clicked` | Adopted (UI event). Canon-sync owed. |
| `candidate_shortlisted` | **Retired** — "shortlisted" prohibited. Use `candidate_saved`. |
| `candidate_not_selected` | Maps to `application_not_selected` (registry). |

## Privacy / what NOT to track (global)

- Never log protected/sensitive attributes (see `../matching/prohibited-signals-v1.md`).
- Never log raw resume content, precise location, or private contact in event properties — IDs only.
- No cross-context behavioral profiles beyond approved retention (G28).

## Not implemented here

No capture calls, no PostHog client. Type-only `MatchingHiringEventType` union in `packages/contracts/src/matching-events.ts` (now includes `CandidateReviewEventType`).
