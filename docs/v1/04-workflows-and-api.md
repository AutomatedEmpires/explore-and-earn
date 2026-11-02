# Workflows, state machines and API contracts

These are proposed application contracts, not implemented endpoints. All writes authenticate, authorize at object/organization scope, validate input, apply version checks and append relevant audit/outbox events in the same transaction. Public schemas are allowlists. Never trust organization IDs, seeker IDs, status, price, verification or asset ownership supplied by a browser.

## 1. End-to-end seeker workflow

1. Browse Seek/Swipe/Map as guest with common filters. View host/storefront and listing details without signup.
2. Save/skip/apply requests sign-in if needed. Restore the exact intended listing/mode; revalidate its availability. Email verification is required for account writes involving host contact or application submission.
3. Create private profile or enter minimum contact and upload/build a resume. Optional fields do not block applying. A blocked/unscanned resume cannot be selected.
4. For internal apply, fetch current published revision and questions, select one resume version and credential metadata, answer questions, optionally write cover letter, and review exact shared contents.
5. Explicit Submit transacts one application, immutable snapshots, initial status and outbox event. Show server-confirmed receipt/application ID; analytics/email failure cannot roll it back.
6. Track status and application-linked messages under Profile. Withdraw is an explicit action; withdrawing does not unsend already viewed material. Application remains in private history subject to retention.
7. External apply instead displays employer destination/domain and leaves after explicit Continue. Record only an external exit/activity event. Returning does not imply submission or create an internal conversation.

## 2. Listing lifecycle and revision rules

| Transition | Actor / prerequisites | Effect |
| --- | --- | --- |
| new -> draft | Listing manager or above | Create draft; no slot consumed |
| draft -> pending_review | Authorized publisher; valid full content, storefront, active org and grant availability | Reserve slot transactionally, freeze submitted candidate revision |
| pending_review -> published | Moderator approval (first publication or risk flag); remaining validation passes | Set published revision, publish/expiry timestamps; convert reservation to live slot |
| pending_review -> draft | Host withdraw or reviewer returns with reasons | Release reservation; preserve draft and review feedback |
| draft -> published | Authorized publisher when host/listing qualifies for routine auto-approval | Same validation and atomic slot consumption; audit policy version |
| published -> paused | Publisher, owner/admin, or operational restriction | Immediately remove discovery and disable new apply; release subscription slot |
| paused -> published | Publisher; unexpired valid revision, clear moderation and available slot | Reacquire slot; expiry unchanged |
| published/paused -> closed | Publisher | Disable new apply; release slot; existing applications/messages remain |
| published/paused -> expired | Worker or authoritative time check | Disable new apply; release live slot idempotently |
| closed/expired -> draft | Publisher chooses Renew | New publication cycle subject to validation/review; existing applications stay attached |
| draft/closed/expired -> archived | Publisher | Hide from normal management; retain records for audit/retention |

Archived is terminal in V1; duplicate creates a new draft with new ID. Pending review reservations expire after 7 days unless reviewer extends with reason, returning the draft and releasing capacity. Review must not silently consume a paid publication window. When renewing a closed/expired listing, a new snapshot/revision is created even if content is unchanged.

Editing a published job creates a separate draft based on its live revision. Routine valid changes publish by atomic pointer swap, preserving expiry and slot; material changes (pay reduction, dates/location, requirements, housing costs, application method) require review and a seeker-facing change summary. The current published revision remains live while an edit is pending unless operations restrict it. Track pending edit review on the draft, not by changing live lifecycle to pending_review. Returning a pending edit leaves existing live content intact. Applicants retain original terms; notify existing internal applicants of material approved changes with a link to compare. Publication and promotion cannot imply all applicants accepted revised terms.

Moderation is orthogonal: `restricted` blocks visibility/new submissions and messaging initiation; only a moderator may clear it. Closing/editing/renewing cannot clear a sanction. Host suspension blocks all publication even if billing is paid. Time/deadline/visibility checks occur synchronously at every submission and public detail read, regardless of worker progress.

## 3. Applications and hiring states

| From | To | Authorized actor / rule |
| --- | --- | --- |
| none | `submitted` | Seeker explicit submit; live internal listing, verified account, current revision, clean chosen resume and valid answers |
| `submitted` | `reviewing` | Recruiter+; host opened review action, not merely an analytics read |
| `submitted`/`reviewing` | `shortlisted` | Recruiter+ with manual action |
| `reviewing`/`shortlisted` | `interview` | Recruiter+; scheduling notes optional, no calendar integration |
| `shortlisted`/`interview` | `offered` | Recruiter+; host-reported outcome, not a signed employment contract |
| `offered` | `hired` | Recruiter+ after outcome confirmation; label host-reported |
| any nonterminal state | `rejected` | Recruiter+; reason code internal, optional approved applicant-facing message |
| any nonterminal state | `withdrawn` | Owning seeker; explicit confirmation |

Nonterminal: submitted, reviewing, shortlisted, interview, offered. Terminal: hired, rejected, withdrawn. No automatic rejection based on fit. Correction of a mistaken terminal outcome requires owner/admin with an audited reason and returns to reviewing; cannot revive a withdrawn application without seeker consent. To avoid a second consent system in V1, withdrawn applications cannot reopen; applicant can contact support but cannot reapply to the same listing. Other duplicate submissions return the existing application. Any policy to allow future season reapplication requires a new listing ID or separately designed application cycles.

Every transition uses expected version, appends history and updates current state transactionally. Concurrent seeker withdrawal and host action: first valid commit wins; second gets conflict/current state and cannot overwrite terminal withdrawal. A status event does not fabricate offer acceptance by seeker. Closing a vacancy never deletes applications or auto-rejects everyone; host may batch disposition with individual outcomes. Listing application mode changes affect future submissions only, not prior internal records.

Messaging is internal-application linked, text-only, rate limited and participant scoped. Recruiter+ from owning organization and applicant can communicate after submission. Save/skip does not create a thread. Block/report stops new messages from the blocked sender; organization suspension stops host messaging. Terminal threads are read-only after 30 days; withdrawn applicants can disable incoming messages immediately. Moderators may access evidence only under scoped case permissions. Notifications contain minimal metadata and an authenticated link, not resume content or full private messages.

## 4. Host onboarding and team workflow

Create user -> verify email -> create organization and owner membership atomically -> enter legal/public details -> verify representative/business as applicable -> draft/preview storefront -> moderation review -> publish -> select entitlements -> draft/validate listing -> review/publish -> review applicants -> communicate -> close and disposition.

Invitations: owner/admin selects email and allowed role -> one-time token (7-day expiry) -> recipient signs in with matching verified email -> membership activates within seat cap. Store only token hash; resend revokes previous token. Recruiters/listing managers cannot invite or alter roles. Only owner transfers ownership after recipient accepts and owner reauthenticates; transaction prevents a zero-owner organization. Ownership does not transfer by editing a representative name. Removing a member revokes access immediately without deleting authored content/history. Active owner cannot be removed by a host admin.

## 5. API route inventory

Version prefix `/api/v1`; JSON request/response envelopes, UTC timestamps, request ID. Table lists minimum capabilities; endpoint presence never grants permission. Path `orgId` must match all contained objects.

| Endpoint / method | Capability / contract |
| --- | --- |
| `GET /discovery/jobs` | Public projection; query contract, cursor, counts; no-store, current visibility rechecked |
| `GET /discovery/map` | Same filtered visibility; bounds/clusters, capped markers, separate remote results |
| `GET /jobs/:id` | Current approved public revision + availability; restricted generic response |
| `GET /hosts/:slug` | Public storefront projection + active listings cursor |
| `GET /me/discovery-state` | Private saved/skipped/applied overlays for bounded listing IDs |
| `PUT/DELETE /me/jobs/:id/disposition` | Own save/skip/clear; expected version, reversible; never apply |
| `GET/PATCH /me/profile` | Own private schema; PATCH allowlisted fields and expected version |
| `GET/POST /me/resumes`; `POST /me/resumes/:id/versions` | Own resume labels/versions; immutable existing versions |
| `POST /me/resumes/:id/export` | Own queued PDF render; poll job, authorized download on completion |
| `POST /uploads`; `POST /uploads/:id/complete` | Purpose/owner/quota-checked signed upload then scan; no direct public asset |
| `GET /assets/:id/download` | Reauthorize purpose/context and issue short-lived link; no generic object-store listing |
| `GET /media/:id/:derivative` | Stream approved public image only with current active publication reference; no-store; no public bucket bypass |
| `POST /jobs/:id/applications` | Seeker; current revision, resume_version, answers, consent version; idempotency required |
| `GET /me/applications[/:id]` | Own application list/snapshot/status, never host notes |
| `POST /me/applications/:id/withdraw` | Owner of application, expected state/version |
| `POST /jobs/:id/external-exits` | Optional authenticated activity; public redirect works without tracking consent; never submits |
| `GET/POST /applications/:id/messages` | Participant/own org recruiter capability; paginated messages and send |
| `POST /reports`; `GET /me/reports/:id` | Authenticated report; own receipt/status, no private case notes |
| `GET/POST /organizations/:orgId/listings` | Membership scope; read/manage per role |
| `PATCH /organizations/:orgId/listings/:id/draft` | Listing manager+; draft version; published content immutable |
| `POST /organizations/:orgId/listings/:id/{submit,publish,pause,renew,close,archive}` | Publisher role, lifecycle/entitlement/review rules |
| `GET /organizations/:orgId/applications[/:id]` | Recruiter+; only received snapshots, no unrestricted seeker profile fetch |
| `POST /organizations/:orgId/applications/:id/transitions` | Recruiter+; allowed transition and expected version |
| `GET/POST /organizations/:orgId/applications/:id/notes` | Recruiter+; organization-private notes |
| `GET/PATCH /organizations/:orgId/storefront/draft`; `POST .../publish` | Listing manager+ content; owner/admin publication policy |
| `GET/POST/PATCH /organizations/:orgId/locations[/:id]` | Own location validation; material changes review |
| `GET/POST/DELETE /organizations/:orgId/members[/:id]` | Owner/admin role hierarchy, seats and invitation rules |
| `GET /organizations/:orgId/analytics` | Owner/admin/recruiter; aggregates, no saver identities |
| `GET /organizations/:orgId/entitlements`; `POST .../billing/{checkout,portal}` | Membership read as needed; billing/owner write; server plan IDs and destination allowlist |
| `POST /organizations/:orgId/billing/retention-selection` | Owner/admin only; versioned job/member selection for scheduled downgrade; Billing sees counts/status only |
| `POST /billing/webhooks/:provider` | Signature-verified raw body, replay/deduplication; no browser auth substitute |
| `POST /me/export`; `POST /me/deletion-request` | Reauthenticated account owner; queued job/receipt |
| `GET /admin/cases`; `POST /admin/cases/:id/actions` | Explicit scoped admin capability, reason, audited action |
| `POST /admin/hosts/:id/verification`; `POST /admin/appeals/:id/decision` | Trust role; evidence/decision history, conflict-of-interest guard |
| `GET /admin/audit`; `POST /admin/entitlement-adjustments` | Auditor read / finance adjustment distinct; no arbitrary DB editing |

Response errors: `400` invalid syntax, `401` unauthenticated, `403` known resource with insufficient permitted capability, `404` unknown/private cross-tenant object, `409` stale version/duplicate conflict/quota/state conflict, `422` field-level publish/answer validation, `429` retry-after, `503` dependency unavailable. Stable machine code, human-safe message, request ID and field errors; never stack traces/private evidence. Cross-tenant and public restricted-object responses avoid existence disclosure.

## 6. Critical transaction boundaries

**Publication:** lock organization entitlement usage/grant and listing -> recheck active memberships/status/time/moderation -> validate candidate revision/media -> reserve/consume only one slot -> immutable revision/pointer/lifecycle -> audit/outbox -> commit. Two simultaneous publish requests cannot exceed cap. Different idempotency keys still cannot create multiple live slots for one listing. A rollback leaves no orphaned live revision.

**Submission:** authorize seeker -> lock/recheck listing identity and published revision, availability/deadline, resume ownership/scan/version -> ensure unique `(seeker,listing)` -> write application, snapshot, status event and outbox -> commit. If revision differs from review screen, return `409 LISTING_CHANGED` with safe diff; require a new explicit review and idempotency key. Do not silently submit revised questions or compensation. A deleted/revoked resume cannot be attached after the review screen.

**Checkout/change operation:** lock unique organization billing account -> reuse the one pending same-plan operation or reject a conflicting change until the previous operation is canceled/expired/reconciled -> create stable operation/provider idempotency key -> outbox/provider call -> persist returned session/agreement -> reconcile confirmed result. Do not hold a database transaction open across a network call. Retries with different browser keys must converge on the same organization operation. At most one current non-ended provider agreement may be adopted per org; changes update that agreement instead of creating another subscription. Provider requests dedupe using the stable operation key.

**Billing event:** verify signature/time tolerance -> unique provider event ID -> reconcile authoritative provider subscription/version and its organization billing operation/agreement -> entitlement ledger adjustment -> audit/outbox -> commit. Duplicate/out-of-order events do not regress entitlement state. Unknown/duplicate competing agreements are quarantined without extra grants and alert Finance for duplicate-charge resolution; never silently select the last webhook. Never grant from a browser success URL. Provider uncertainty preserves current paid-through access while reconciliation alerts operations; it does not grant indefinite free upgrades.

**Disposition:** unique user/listing upsert, expected version, previous state returned for Undo; save->skip explicitly replaces saved state. A failed optimistic update restores local state and offers retry. Applications and dispositions are independent.

## 7. Async work, notifications and reliability

Outbox event fields: event_id, event_type/version, aggregate_id/version, occurred_at, minimal payload and correlation_id. Worker delivery is at least once; handlers dedupe by event/side-effect key. Backoff 1m, 5m, 30m, 2h, 6h; then dead-letter with alert. Manual replay is authorized and audited. No entire resume or private message in an event bus/email log.

Events: `listing.published/changed/unavailable`, `application.submitted/status_changed/withdrawn`, `message.created`, `membership.invited/revoked`, `asset.scan_completed`, `subscription.changed`, `report.created/decided`, `privacy.export_requested/deletion_requested`. Application receipt/status and security/billing notices are transactional; optional digests/marketing are separately opt-in and later unless implemented in scope. Email failure never changes application outcome; in-app state is authoritative.

Every minute run idempotent expiry/deadline visibility maintenance, every 5 minutes repair failed projections and reconcile reservations, daily reconcile billing usage and orphan assets. Authorization remains synchronous. Public search results require an authoritative visibility filter at response time so stale internal candidate caches cannot expose takedowns. All dynamic public/private responses and user-uploaded media use no-store in V1, including unavailable/tombstone responses. No CDN/service-worker path may bypass visibility checks. Revalidation occurs on page focus/navigation and at least every 60 seconds on an open discovery screen; restricted content already downloaded cannot be recalled, but every new detail/media/apply request is denied immediately.

A resume scanner or renderer outage leaves assets pending and explains why submission is blocked; no bypass to unscanned files. Billing outage blocks new paid checkout, not existing applications. Map/weather outage preserves text discovery. Browser/network timeout after submission uses same idempotency key to retrieve outcome rather than submitting again. Store idempotency keys per actor/endpoint plus request hash for 24 hours; same key/different payload is conflict. Application uniqueness protects beyond key expiry. Frontend local application draft storage excludes file bytes and is cleared on sign-out, submission and account switch.
