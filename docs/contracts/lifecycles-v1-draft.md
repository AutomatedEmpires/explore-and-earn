# Lifecycle Contracts — V1 (DRAFT, review-only)

> Verified mirror of the canon **Lifecycle Registry**, formatted as the data that seeds `lifecycle_transitions` and powers the single `assert_lifecycle_transition()` trigger (DR-B10 / G16). NOT executed. Every status change must be a row below; anything else raises.

## Timing constants (verified)
| Constant | Value | Source |
|---|---|---|
| Application auto-expiry | 30 days idle in applied/reviewing/saved_by_host | Application Lifecycle |
| Invite expiry | 14 days after sent/delivered | Invite Lifecycle |
| Offer expiry | 7 days after extended_at (or shorter explicit) | Offer Lifecycle |
| Attestation stale grace | 30 days after policy version bump | HostAttestation Lifecycle |
| Removal appeal window | 14 days from removed_at | HostRemovalAppeal Lifecycle |
| Appeal admin first-response SLA | 7 calendar days | HostRemovalAppeal Lifecycle |

## Transition tables (entity, from -> to)
```
-- Application (NO 'declined')
applied -> reviewing -> saved_by_host -> offered -> accepted -> active -> completed
{applied,reviewing,saved_by_host} -> {not_selected, withdrawn, expired}
offered -> accepted (via offer accept)   accepted -> active (role start)   active -> completed (check-in)

-- Invite
created -> delivered -> viewed -> applied
{created,delivered,viewed} -> {withdrawn, expired, ignored}

-- Offer
created -> delivered -> viewed -> accepted
{created,delivered,viewed} -> {declined, expired, withdrawn}
-- post-accept withdrawal requires dispute/admin

-- HostAttestation (ADR-029)
not_attested -> attested
attested -> attested_stale (auto on policy bump)   attested_stale -> attested (re-attest in grace)
attested_stale -> not_attested (auto after 30d)    attested -> withdrawn    withdrawn -> attested

-- HostProfile account status (ADR-029)
active -> paused -> active
active -> removed (admin)   removed -> appealing (appeal inserted)   appealing -> active (granted)
appealing -> removed (denied)   removed -> active (manual reinstatement, audited)
-- removed triggers listings.status='paused'; ban = removed + reason in {fraud,legal_compliance} + window passed

-- HostRemovalAppeal (ADR-029)
submitted -> under_review -> {granted, denied}
{submitted,under_review} -> withdrawn   withdrawn -> [new appeal row if within 14d]

-- RefundReview (only refund execution path, G5)
opened -> under_review -> approved -> processed         (outcome_type=stripe_refund)
under_review -> {denied, cancelled}
approved -> failed -> under_review (retriage)
approved -> service_credit_issued                      (outcome_type=service_credit, terminal)
-- insert with related_object_type='invite_credit_purchase' is REJECTED (non-refundable)

-- DisputeCase
open -> under_review -> resolved -> closed
under_review -> awaiting_user -> under_review
under_review -> escalated -> {under_review, resolved, denied, closed}
under_review -> denied -> closed

-- ConversationThread
active -> closed -> archived
active -> restricted -> {active, closed}    active -> expired -> archived

-- SchedulingRequest (internal only, no external calendar)
proposed -> selected -> completed
proposed -> alternate_requested -> {proposed, selected}
{proposed,selected} -> {cancelled, expired}    selected -> no_show

-- MediaAsset
processing: uploaded -> processing -> {ready, failed}
moderation: pending -> under_review -> approved
{pending,under_review} -> {rejected, hidden, removed}   approved -> {hidden, removed}

-- BoostCampaign / FeaturedEmployerCampaign
scheduled -> active -> completed
{scheduled,active} -> paused -> {active, cancelled}    {scheduled,active} -> cancelled
active -> removed    {active,completed} -> refunded (if policy)
-- delivery: under_delivered <-> on_track <-> over_delivered; blocked; completed

-- ReportCase
submitted -> triaged -> under_review -> action_taken -> closed
under_review -> dismissed -> closed    under_review -> escalated -> {action_taken, resolved, closed}

-- ModerationCase (every action writes AuditLogEntry, G15)
open -> triaged -> under_review -> action_taken -> resolved -> closed
under_review -> awaiting_user -> under_review
under_review -> escalated -> {under_review, action_taken, resolved}

-- Review
draft -> submitted -> under_review -> approved
{submitted,under_review} -> {hidden, removed}    approved -> {hidden, removed}

-- CheckIn
scheduled -> sent -> completed
sent -> {skipped, expired}    {sent,completed} -> escalated (if risk)
```

## Seed shape
`lifecycle_transitions(entity text, from_status text, to_status text, is_auto boolean default false)` — one row per edge above. The `BEFORE UPDATE` trigger calls `assert_lifecycle_transition(TG_TABLE_NAME, OLD.status, NEW.status)` and raises on any unlisted edge. Auto edges (e.g. expiry, stale) are driven by scheduled jobs that perform the canonical transition rather than a raw UPDATE.
