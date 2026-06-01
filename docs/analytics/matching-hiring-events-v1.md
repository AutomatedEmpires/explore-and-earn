# Matching & Hiring Analytics Events V1

> DRAFT — taxonomy only. No PostHog sending implemented. Canonical event names come from the "Canonical Event Registry" — **the registry wins** over the directive's draft names. Conflicts and additions are flagged for founder/Event-Registry update.

Convention (canon): snake_case, past-tense.

## Canonical events (use these — already in Event Registry)

### Matching
`match_generated`, `match_marked_stale`, `match_refreshed`, `matched_bucket_viewed`, `match_reason_opened`, `match_score_clicked`, `empty_match_bucket_shown`, `match_pool_building_prompt_shown`.

### Invite
`invite_created`, `invite_sent`, `invite_delivered`, `invite_viewed`, `invite_applied`, `invite_ignored`, `invite_expired`, `invite_withdrawn`, `invite_credit_consumed`, `invite_credit_restored`.

### Offer
`offer_created`, `offer_sent`, `offer_delivered`, `offer_viewed`, `offer_accepted`, `offer_declined`, `offer_expired`, `offer_withdrawn`.

### Application
`application_started`, `application_submitted`, `application_viewed_by_host`, `application_status_changed`, `application_withdrawn`, `application_not_selected`, `application_expired`, `application_accepted`, `application_completed`.

## Directive → canon reconciliation

| Directive event | Resolution |
| --- | --- |
| `match_score_viewed` | Use `match_score_clicked` (registry). `*_viewed` for score → TODO(?) if a passive impression event is wanted. |
| `match_explanation_opened` | Use `match_reason_opened` (registry). |
| `application_viewed_by_host` | Matches registry ✓. |
| `invite_sent` / `invite_viewed` / `invite_expired` | Match registry ✓. |
| `offer_sent` / `offer_viewed` / `offer_accepted` / `offer_declined` | Match registry ✓. |
| `application_submitted` | Matches registry ✓. |
| `candidate_card_opened` | Not in registry → **TODO(?)** propose add. |
| `candidate_profile_popup_opened` | Not in registry → **TODO(?)** propose add. |
| `candidate_invited` | Likely duplicate of `invite_created`/`invite_sent` → reconcile; **TODO(?)**. |
| `invite_responded` | Split into `invite_applied` / `invite_ignored` (registry) → prefer registry. |
| `quick_apply_clicked` | Not in registry → **TODO(?)** propose add. |
| `candidate_shortlisted` | **CONFLICT** — "shortlisted" terminology is prohibited by canon. Use `candidate_saved` / save-by-host event → **TODO(?)** confirm event name. |
| `candidate_not_selected` | Maps to `application_not_selected` (registry) → prefer registry. |

## Per-event metadata (template)

For each event define: **actor** (seeker/host/system), **surface** (card / review list / popup / dashboard), **properties** (ids only — `match_result_id`, `listing_id`, `application_id`, etc.), **privacy rules**, and **what NOT to track**.

## Privacy / what NOT to track

- Never log protected/sensitive attributes (see `../matching/prohibited-signals-v1.md`).
- Never log raw resume content, precise location, or private contact in event properties — IDs only.
- No cross-context behavioral profiles beyond approved retention (G28).

## Not implemented here

No capture calls, no PostHog client. Type-only `HiringEvent` union in `packages/contracts/src/matching-events.ts`.
