# Route Contracts — V1 (DRAFT, review-only)

> Status: **DRAFT / planning only.** This is the per-route implementation matrix derived from the canon **API Contract Registry** and **Canonical Event Registry**. It is not runnable code and authorizes no endpoints. It exists so coding agents do not invent route behavior. Where this doc and a registry disagree, **the Notion registry wins** and this file is corrected.

## 0. Canonical response envelope (verified against API Contract Registry)

Every route returns exactly one of:

```jsonc
// success
{ "ok": true, "data": { /* serialized resource */ }, "meta": { /* paging, cursors */ } }
// failure
{ "ok": false, "error": { "code": "STRING_CODE", "message": "safe message", "details": {} } }
```

**Reconciliation note (correction):** the first-pass `docs/api/contracts-v1-draft.ts` modeled a generic `ApiResponse`/`ApiError` pair. The canonical shape is the `ok`-discriminated union above. `contracts-v1-draft.ts` must be updated to:

```ts
export type ApiSuccess<T> = { ok: true; data: T; meta?: Record<string, unknown> }
export type ApiFailure = { ok: false; error: { code: ApiErrorCode; message: string; details?: Record<string, unknown> } }
export type ApiResult<T> = ApiSuccess<T> | ApiFailure
```

### Canonical error-code union (verified)
`UNAUTHENTICATED · UNAUTHORIZED · FORBIDDEN · NOT_FOUND · VALIDATION_ERROR · COMPLETION_GATE_NOT_MET · PLAN_ENTITLEMENT_REQUIRED · INVITE_CREDITS_REQUIRED · LISTING_CAPACITY_EXCEEDED · OBJECT_NOT_ACTIVE · OBJECT_EXPIRED · RATE_LIMITED · MODERATION_RESTRICTED · BILLING_REQUIRED · CONFLICT` plus signup-only `under_18` (G25).

### Cross-cutting rules applied to every route below
- **Server-side permission enforcement** — every mutation runs `requireEntitlement(scope, action)` before logic (G14). Frontend gates are UX only.
- **Canonical enums only** — request/response enum fields import from `packages/contracts/enums` (G13).
- **No trusted client entitlement** — plan/credit state is recomputed server-side from `entitlement_snapshots`, never read from the request body.
- **State changes emit events** — every side effect emits the named event(s) from the Event Registry; agents may not invent names (G-governance: `schema_drift_detected`).
- **Audit on trust/billing/moderation** — those routes write one `audit_log_entries` row inside the mutation transaction (G15).
- **Safe serializers on public reads** — `publicHostProfileDTO()` etc. strip `trust_score`, `discovery_display_score`, and `internal_*` (G11).
- **Idempotency** — unsafe POSTs that create money/credit movement accept an `Idempotency-Key` header recorded in a dedupe table; Stripe webhook dedupes on `event_id` (G17).

## 1. Route matrix

Legend — Gate codes: `auth`=authenticated, `prof`=profile completion gate, `list`=listing completion gate, `cap`=capacity available, `cred`=invite credits, `ent`=plan entitlement, `rl`=rate limited, `active`=object active/not expired.

<table header-row="true">
<tr><td>Route</td><td>Scope</td><td>Gates</td><td>Side effects</td><td>Events</td><td>Errors</td></tr>
<tr><td>GET /api/listings</td><td>public→seeker</td><td>—</td><td>read; match_score only where eligible; never expose display_score</td><td>search_performed, listing_impression</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/host/listings</td><td>host listing_create</td><td>auth</td><td>create draft; init relevance shell</td><td>listing_draft_created</td><td>UNAUTHORIZED, VALIDATION_ERROR</td></tr>
<tr><td>PATCH /api/host/listings/:id</td><td>host listing_edit</td><td>auth</td><td>update; recompute completion/quality; mark MatchResults stale if matchable fields changed</td><td>listing_updated, listing_quality_recalculated, match_marked_stale</td><td>NOT_FOUND, UNAUTHORIZED</td></tr>
<tr><td>POST /api/host/listings/:id/publish</td><td>host listing_publish</td><td>prof,list,cap</td><td>status→under_review|live by moderation policy; recompute discovery eligibility</td><td>listing_submitted_for_review, listing_published</td><td>COMPLETION_GATE_NOT_MET, LISTING_CAPACITY_EXCEEDED</td></tr>
<tr><td>GET /api/discovery/seek</td><td>public→seeker</td><td>—</td><td>candidate pool→display_score order→boost interleave (≤1/4-window)</td><td>seek_results_loaded, listing_impression, boosted_listing_impression</td><td>VALIDATION_ERROR</td></tr>
<tr><td>GET /api/discovery/swipe</td><td>public→seeker</td><td>—</td><td>swipe stack; capped boosts; no repeat host</td><td>swipe_stack_loaded</td><td>VALIDATION_ERROR</td></tr>
<tr><td>GET /api/discovery/map</td><td>public→seeker</td><td>—</td><td>viewport filter; pin/drawer rank; boosted pin style</td><td>map_results_loaded, map_pin_impression</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/listings/:id/apply</td><td>seeker</td><td>auth,prof,active</td><td>create Application; store resume_snapshot; notify host</td><td>application_submitted</td><td>COMPLETION_GATE_NOT_MET, OBJECT_NOT_ACTIVE, CONFLICT</td></tr>
<tr><td>POST /api/applications/:id/withdraw</td><td>seeker owns</td><td>auth</td><td>status→withdrawn; notify host</td><td>application_withdrawn</td><td>NOT_FOUND, CONFLICT</td></tr>
<tr><td>POST /api/host/applications/:id/not-selected</td><td>host applicant_manage</td><td>auth</td><td>status→not_selected; notify seeker</td><td>application_not_selected</td><td>UNAUTHORIZED, CONFLICT</td></tr>
<tr><td>POST /api/host/listings/:id/invites</td><td>host invite_send</td><td>ent,cred,active</td><td>create Invite; debit InviteCreditLedger; store match_snapshot; notify seeker</td><td>invite_sent, invite_credit_consumed</td><td>INVITE_CREDITS_REQUIRED, PLAN_ENTITLEMENT_REQUIRED, OBJECT_EXPIRED</td></tr>
<tr><td>POST /api/invites/:id/apply</td><td>invite recipient</td><td>active</td><td>create Application; Invite.status→applied</td><td>invite_applied, application_submitted</td><td>OBJECT_EXPIRED, CONFLICT</td></tr>
<tr><td>POST /api/host/applications/:id/offers</td><td>host offer_send</td><td>auth</td><td>create Offer; Application.status→offered; notify seeker</td><td>offer_sent</td><td>UNAUTHORIZED, CONFLICT</td></tr>
<tr><td>POST /api/offers/:id/accept</td><td>offer recipient</td><td>active</td><td>Offer→accepted; Application→accepted; progress accepted_count; prompt travel plan; notify host</td><td>offer_accepted, application_accepted</td><td>OBJECT_EXPIRED, CONFLICT</td></tr>
<tr><td>POST /api/offers/:id/decline</td><td>offer recipient</td><td>active</td><td>Offer→declined; notify host</td><td>offer_declined</td><td>OBJECT_EXPIRED</td></tr>
<tr><td>GET /api/host/listings/:id/matches</td><td>host matched_bucket_view</td><td>ent</td><td>limited seeker card + match_score + confidence + reason; invite lock state</td><td>matched_bucket_viewed</td><td>PLAN_ENTITLEMENT_REQUIRED</td></tr>
<tr><td>POST /api/conversations/:id/messages</td><td>participant</td><td>active,rl</td><td>create Message; notify recipient</td><td>message_sent</td><td>RATE_LIMITED, FORBIDDEN, MODERATION_RESTRICTED</td></tr>
<tr><td>POST /api/applications/:id/scheduling-requests</td><td>host scheduling</td><td>auth</td><td>internal scheduling only (no external calendar, G9)</td><td>scheduling_request_sent</td><td>UNAUTHORIZED</td></tr>
<tr><td>POST /api/scheduling-requests/:id/select</td><td>seeker</td><td>active</td><td>status→selected; notify host</td><td>scheduling_time_selected</td><td>OBJECT_EXPIRED</td></tr>
<tr><td>POST /api/billing/checkout</td><td>host owner|billing</td><td>auth</td><td>Stripe checkout at Founder Locked Pricing (no legacy 250/500/750)</td><td>checkout_started</td><td>BILLING_REQUIRED, VALIDATION_ERROR</td></tr>
<tr><td>POST /api/webhooks/stripe</td><td>signed</td><td>—</td><td>verify sig; idempotent on event_id; update Subscription/AddOn/EntitlementSnapshot; audit sensitive transitions</td><td>stripe_webhook_processed</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/billing/refund-reviews</td><td>host owner|billing|admin</td><td>auth</td><td>create RefundReview(opened)</td><td>refund_review_opened</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/admin/refund-reviews/:id/approve</td><td>billing_admin|super_admin</td><td>auth</td><td>refund only via this workflow (G5); credits never call Stripe; audit; notify host</td><td>refund_review_approved, refund_processed|service_credit_issued</td><td>UNAUTHORIZED, CONFLICT</td></tr>
<tr><td>POST /api/host/verification-submissions</td><td>host owner|admin</td><td>auth</td><td>create IdentityVerification(submitted); queue admin review</td><td>verification_submitted</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/admin/verifications/:id/approve</td><td>verification_admin|super_admin</td><td>auth</td><td>status→approved; is_current; recompute host attestation; maybe BadgeAward; audit</td><td>verification_approved</td><td>UNAUTHORIZED</td></tr>
<tr><td>POST /api/reports</td><td>auth</td><td>auth</td><td>create ReportCase; escalate ModerationCase by threshold</td><td>report_submitted</td><td>VALIDATION_ERROR</td></tr>
<tr><td>POST /api/admin/moderation-cases/:id/action</td><td>trust_safety_admin|super_admin</td><td>auth</td><td>update case; apply action; audit; notify impacted user</td><td>moderation_action_taken</td><td>UNAUTHORIZED</td></tr>
<tr><td>/api/demo/*</td><td>demo_viewer</td><td>—</td><td>fixture/mock only; zero real side effects (G19)</td><td>demo_* only</td><td>—</td></tr>
</table>

## 2. Notification + audit obligations
- Routes whose side effect column says “notify” must call `notifications.send()`, which consults `notification_preferences` + suppression/quiet-hours (G18); critical priority always delivers in-app.
- Routes touching billing/refunds/verification/moderation write `audit_log_entries` in-transaction (G15).

## 3. Open route TODOs (escalated, not invented)
- TODO(founder?): whether `GET /api/listings` exposes `match_score` to logged-out users after a soft-auth probe, or only post-login. Registry says “authenticated seeker may receive match_score” — defaulting to **login-required** for score until ratified.
- TODO(founder?): publish moderation policy — does `publish` go `live` immediately or always `under_review` first? Defaulting to **`under_review` for first listing per host, `live` thereafter** pending ratification.
