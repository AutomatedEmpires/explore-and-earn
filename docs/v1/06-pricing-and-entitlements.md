# Monthly host subscriptions, capacity and focused upsells

## 1. Commercial direction and status

**Current user direction:** host monthly subscriptions named **Starter / Professional / Enterprise**. **Confirmed:** seekers free forever, including discovery, native resume build/reviewed import/export, applications and seeker community. Exact host prices, tier allowances, free host preview/trial, analytics split and optional credit products remain Open D27. Earlier free-Starter/Growth/Pro dollar amounts and numeric quotas are superseded assistant proposals; none are current defaults.

Recommend monthly plans sell **concurrent active listing capacity**. Example only: an allowance of N active jobs permits replacing a closed job without paying a new lifetime posting credit, while never exceeding N live/reserved slots. Drafts and hiring history do not consume live capacity. A job freshness/review expiry is independent from the subscription renewal date. This interpretation is recommended, not a locked answer to the user's “sell total listings?” question.

Security, reporting, accessibility, honest job terms and necessary existing application/history access are available across tiers; payment never buys broader private-profile access or verification. No application fee, paid seeker boost or mandatory seeker qualification fee. Business verification is a trust process, not an upsell. No service/checkout/pricing is activated by this specification.

## 2. Proposed tier differentiation — values not set

| Plan | Monthly price / active-job allowance / seats | Recommended role | Analytics proposal |
| --- | --- | --- | --- |
| Starter | All TBD | Small host; public profile, posting, applicant pipeline, interview-state tracking, messages | Basic per-listing views, applications and external exits with honest definitions |
| Professional | All TBD | Higher active-job capacity and collaboration, built team controls | Starter + per-listing comparisons, trends and conversion summaries where implemented |
| Enterprise | Quote and agreed monthly allowance/seats; no assumed unlimited use | Larger/multi-location operation with agreed service/capacity terms | Professional + organization/location comparisons and reporting where implemented |

Do not advertise integrations, scheduling, sourcing, custom SLAs, exports or “advanced AI” as delivered merely to differentiate Enterprise. Higher tiers primarily scale capacity and team/reporting needs; actual delivered entitlements must be enumerated and versioned. Basic applicant/status/message access is not a paid analytics report. Whether Starter is priced, trialed or has a free preview is still open; the previous $0 Starter live-listing entitlement is retired, not silently carried forward.

Recommended unsubscribed baseline: owner may draft/preview and access required historical applications/messages/billing/privacy controls, with **0 new/live listing slots**, **1 owner operational seat**, and no paid campaign grant. Whether an already-approved public host page persists with no jobs remains a product policy; recommend yes while active/clear, labeled No active listings. Trial/support publication grants, if adopted, are explicit time-bounded records rather than a hidden free Starter plan. More seats for continuing obligations require an explicit approved policy/credit, not unauthorized access.

Usage counts live unexpired listings plus pending new-publication reservations; pending edits of a live job do not consume another slot. Paused/closed/expired/archived jobs release capacity. Active memberships plus pending invitations count toward seats. Retain owner on downgrade. Multi-location records need not add another fee unless separately chosen. A paid monthly renewal does not silently republish stale jobs. Plan allowance updates never rewrite prior invoices/terms.

## 3. Keep the launch catalog small

| Product idea | Recommendation / status | Meaning |
| --- | --- | --- |
| Monthly subscription | Current business direction; exact values Open | Core active-job capacity, team and implemented reporting entitlements |
| Boosted job | Initial upsell recommended, price/term/placement Open | Labeled promotion of a canonical eligible job through the existing campaign system; no better fit/verification |
| Announcement campaign | Initial upsell recommended, price/term Open | Moderated employer notice linking to public host/jobs; shared caps with other paid formats |
| Extra active-listing capacity | Optional later; Open | If adopted, favor clear recurring slot packs or upgrade, rather than a parallel ambiguous “total postings” credit wallet |
| Recruitment invitation credits | Open/deferred; not V1 dependency | New seeker outreach needs opted-in recipients, consent, safe targeting/rate limits and accept/decline/block/report. No public seeker directory or outreach API is implied |

Host **team invitations** add staff memberships and consume seats; they are not recruitment invitation credits. A candidate recruitment invitation, if ever adopted, is not an application and cannot expose an entire seeker profile. Define what consumes/refunds a credit, expiry, failed/duplicate delivery, opt-out and subscription-cancel effects before selling it. Keep this out of the initial paid catalog unless user explicitly promotes the feature.

Boost and announcement share creative review, payment, inventory, frequency caps, cancellation and aggregate reporting from [community/campaigns](12-community-and-campaigns.md). “Boosted” need not imply Seek/Swipe/Map ad placement: Community Feed placements are planned; discovery placements remain D21. Avoid a separate featured-host product until needed. No extra recurring seat fee, pay-per-application, independent listing token wallet or standalone listing purchase is assumed. Old one-off prices are not current market evidence or checkout products.

Version price/currency/limits/analytics/terms in immutable PlanVersion records. Adopt values, unsubscription behavior, taxes/refunds and a tested payment lifecycle before accepting money. Prices and conversion/revenue forecasts require future validation; this recommendation is based on product simplicity, not external market research.


## 4. Billing state and authoritative entitlements

`Subscription` fields: organization_id, plan_version_id, provider_customer_id, provider_subscription_id unique, status `pending|active|past_due|canceled|ended`, current_period_start/end, paid_through_at, cancellation_at_period_end, pending_plan_version_id/effective_at, last_reconciled_at. Store invoices/provider references, never card numbers. `EntitlementGrant` fields: organization_id, source `unsubscribed_baseline|subscription|trial|support_credit`, source_ref, slot_limit, seat_limit, valid_from/until, state, reason, actor. One adopted Starter/Professional/Enterprise subscription replaces the unsubscribed baseline; never sum multiple paid plan allowances. Trial and support grants require explicit scope/expiry; there is no default free-Starter publication grant. Support credits are explicit time-bounded overrides, audited and reconciled, not new hidden plans.

Checkout requires owner/billing capability, server-selected plan version, correct organization/customer mapping, idempotency and allowed return URLs. Enforce one `OrganizationBillingAccount` per org, one current non-ended provider agreement and at most one pending `BillingOperation` (checkout or change). Serialize creation with an org-scoped lock/constraint; stable operation IDs supply provider idempotency keys. Two tabs with different browser request keys reuse the same pending same-plan session. A different-plan request returns conflict until the existing operation is canceled/expired/reconciled. Provider calls run outside the DB transaction through the recorded operation/outbox; network retries reuse its key. Upgrades/downgrades update the adopted agreement rather than opening a second subscription. If provider behavior still yields a competing agreement/charge, quarantine it, grant nothing extra, stop new checkout and alert Finance to resolve/cancel/refund the duplicate according to approved policy while preserving the valid agreement.

Browser payment success means “Processing” until signed webhook/provider reconciliation confirms activation against that operation/agreement. Store unique provider event IDs and apply subscription state according to authoritative provider state, handling out-of-order delivery. Daily reconciliation compares provider and internal state, including duplicate agreements, alerts drift and repairs safely. Grant activation and quota checks occur server-side.

Upgrade: show total price, currency, current/next renewal dates, effective limit and provider proration preview. User explicitly accepts before payment; no guessed proration math. Capacity increases only after confirmed provider success. If confirmation fails, keep existing plan and drafts; show pending/retry status and avoid duplicate checkout.

Cancel: stop auto-renewal, retain paid capacity through paid_through_at, display exact effective date. At term end use downgrade procedure. No deletion of applicants/resumes/messages because a host cancels. Hosts can still review existing applications and meet privacy/support obligations, subject to sanctions. Closing organization is a separate owner workflow, not cancellation.

Payment failure: notify billing contact, retry per provider configuration and offer portal. Proposed grace: 7 days after paid period end for existing publications, no new paid-capacity publication/invites; after grace fall back to the adopted unsubscribed baseline (proposed 0 live slots, owner operational access retained), not a free Starter plan. Admin may extend a specific case with recorded expiry. During grace existing applicants remain accessible and messaging works. Unknown provider state triggers reconciliation, not automatic destructive downgrade.

## 5. Downgrades and over-limit behavior

At request, show future limits. Only owner/admin may select which listings remain live and members remain active through a versioned retention-selection action; Admin can make this operational selection but cannot change the purchased plan. A Billing-only requester sees capacity counts/effective date and selection-complete status, not job titles/applicant/team identities. Notify owner/admin to make the selection. Billing may schedule a downgrade with explicit acknowledgement that the deterministic fallback applies if owner/admin do not select in time; no additional content permission is granted. All hosts must retain an owner within the seat cap. At effective time, in one usage reconciliation:

1. Apply future plan/grant after paid-through/grace rules.
2. Keep selected eligible live listings up to cap. If host made no complete choice, retain earliest-published eligible jobs first, tie by ID, and pause the rest. Pending new-publication reservations use remaining capacity; excess return to draft with a billing-capacity reason. A pending edit of a retained listing stays pending, without extra capacity.
3. Keep owner plus selected members up to cap. Otherwise retain owner then earliest-joined active members, tie by ID. Excess members are suspended for billing capacity, not deleted; cancel excess pending invitations newest first. Role changes never bypass cap.
4. Audit, notify owner/billing and affected members; show paused jobs/member access changes. Require manual reactivation after an upgrade; do not silently republish stale jobs or reinstate removed users.

Member suspension stops new access immediately. Preserve authored notes/history and applicant records. A listing paused for billing is not labeled filled/rejected. Slot usage and membership capacity must be transactionally enforced during concurrent publications, invitations and webhook processing.

## 6. Refunds, disputes and reporting

Policy approval is a launch gate. V1 finance interface can record/request provider-supported refunds with invoice, reason, amount, actor and reviewer where required; no automatic broad refund promise. Credits/refunds do not silently revoke data or alter application status. Chargebacks may trigger risk review, but moderation and billing sanctions remain separately recorded.

Analytics distinguishes billed revenue, collected cash, refunds, tax and active recurring subscriptions. Do not count free hosts, one-off proposed products, pending checkouts or canceled-at-term subscriptions beyond paid period as new paid MRR. No revenue forecast in this spec is claimed as evidence of demand.
