# Pricing, entitlements and billing lifecycle

> **The prices in this file are not current.** On 4 November 2026 the founder approved Starter $99, Professional $299, and Enterprise $599 per month, and a first-100-organization introductory discount. See [FD-6 and FD-7](../decisions/2026-11-04-founder-decisions.md). This file is the earlier commercial discussion and stays as history.

## 1. Commercial status

All prices are **proposed USD launch hypotheses**, carried forward from brainstorming for validation. No checkout, vendor account, promotion or subscription is activated by this documentation. Product/business approval, payment-provider configuration, tax/terms review and a completed test lifecycle are required before charging anyone. Do not reuse earlier competitor prices as current market facts.

Employer-funded marketplace: seekers pay **$0** for discovery, profiles, basic matching, resumes, saving and applications. No application fee, mandatory paid qualification check or charge to access basic job terms. Business verification is a trust process available without a paid upgrade; payment never purchases the badge.

## 2. V1 plan contract (proposed)

| Plan | Monthly price | Concurrent publication slots | Active team seats (owner included) | Included V1 capabilities |
| --- | --- | --- | --- | --- |
| Seeker | $0 | Not applicable | Not applicable | All core seeker flows |
| Host Starter | $0 | 1 | 1 | Storefront, multiple location records, internal/external apply, applicant pipeline, messages, basic counts |
| Host Growth | $49 | 5 | 3 | Starter + team collaboration, aggregate recruiting analytics |
| Host Pro | $129 | 25 | 10 | Growth + higher capacity; no unbuilt sourcing/integration claims |

All plans share security, moderation, application-history access, required accessibility and support/reporting. A single Starter owner can recruit and publish. Additional draft listings/locations do not consume paid slots. V1 has no location count charge; each active listing still identifies one worksite. Usage includes live unexpired listings and pending new-publication reservations; pending edits of an existing live job do not consume another slot. Paused/closed/expired/archived listings do not consume concurrent subscription slots. Seats include active memberships and unexpired pending invitations to prevent race-based overbooking.

Prices and limits live in immutable `PlanVersion` records with effective dates, currency, provider product/price IDs and terms version. A subscription references the agreed plan version. Do not hardcode amounts in browser checks or mutate historic invoices when changing prices. Upgrades to limits do not grant broader access to applicant data than role permissions.

## 3. Later offers, not V1 checkout products

Earlier brainstorm hypotheses retained for later validation:

| Offer | Proposed price | Required work before launch |
| --- | --- | --- |
| Standalone listing | $29 / 30 days | Explicit listing-bound grant, purchase/expiry/refund policy, no unlimited rotation through jobs |
| Featured job | $19 / 7 days | Promotion inventory, eligibility, labeling, fair-placement and analytics design |
| Featured host | $49 / 30 days | Same safeguards; paid placement never changes verification/fit |
| Extra recruiter seat | $9 / month | Quantity billing and effective-date seat ledger |
| Extra active listing | $10 / month | Quantity/grant reconciliation and downgrade rules |
| Enterprise | Custom | Quote/contract, integrations and custom provisioning workflow |

V1 prices page may show a non-purchasable “Contact us” enterprise note, but must not advertise sourcing, ATS integration or advanced analytics as delivered. No pay comparison slider or paid fit manipulation. Standalone/promotion/add-on products remain disabled until separate issues define full grant behavior and deliverability.

## 4. Billing state and authoritative entitlements

`Subscription` fields: organization_id, plan_version_id, provider_customer_id, provider_subscription_id unique, status `pending|active|past_due|canceled|ended`, current_period_start/end, paid_through_at, cancellation_at_period_end, pending_plan_version_id/effective_at, last_reconciled_at. Store invoices/provider references, never card numbers. `EntitlementGrant` fields: organization_id, source `starter|subscription|support_credit`, source_ref, slot_limit, seat_limit, valid_from/until, state, reason, actor. For V1 subscription replaces Starter limits; do not accidentally sum Starter+Growth+Pro. Support credits are explicit time-bounded overrides, audited and reconciled, not new hidden plans.

Checkout requires owner/billing capability, server-selected plan version, correct organization/customer mapping, idempotency and allowed return URLs. Enforce one `OrganizationBillingAccount` per org, one current non-ended provider agreement and at most one pending `BillingOperation` (checkout or change). Serialize creation with an org-scoped lock/constraint; stable operation IDs supply provider idempotency keys. Two tabs with different browser request keys reuse the same pending same-plan session. A different-plan request returns conflict until the existing operation is canceled/expired/reconciled. Provider calls run outside the DB transaction through the recorded operation/outbox; network retries reuse its key. Upgrades/downgrades update the adopted agreement rather than opening a second subscription. If provider behavior still yields a competing agreement/charge, quarantine it, grant nothing extra, stop new checkout and alert Finance to resolve/cancel/refund the duplicate according to approved policy while preserving the valid agreement.

Browser payment success means “Processing” until signed webhook/provider reconciliation confirms activation against that operation/agreement. Store unique provider event IDs and apply subscription state according to authoritative provider state, handling out-of-order delivery. Daily reconciliation compares provider and internal state, including duplicate agreements, alerts drift and repairs safely. Grant activation and quota checks occur server-side.

Upgrade: show total price, currency, current/next renewal dates, effective limit and provider proration preview. User explicitly accepts before payment; no guessed proration math. Capacity increases only after confirmed provider success. If confirmation fails, keep existing plan and drafts; show pending/retry status and avoid duplicate checkout.

Cancel: stop auto-renewal, retain paid capacity through paid_through_at, display exact effective date. At term end use downgrade procedure. No deletion of applicants/resumes/messages because a host cancels. Hosts can still review existing applications and meet privacy/support obligations, subject to sanctions. Closing organization is a separate owner workflow, not cancellation.

Payment failure: notify billing contact, retry per provider configuration and offer portal. Proposed grace: 7 days after paid period end for existing publications, no new paid-capacity publication/invites; after grace fall back to Starter limits. Admin may extend a specific case with recorded expiry. During grace existing applicants remain accessible and messaging works. Unknown provider state triggers reconciliation, not automatic destructive downgrade.

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
