# Phased GitHub issue backlog and acceptance gates

This is the authoritative issue-body source for the V1 implementation backlog. [The issue index](09-github-issues.md) links the 25 created GitHub issues. Stable IDs `EE-001` etc. are dependency keys, not GitHub issue numbers. Phases describe order, not calendar promises. Each issue requires a documentation/spec update if implementation changes a contract. No app work is included in the documentation commit.

Suggested labels: `phase:0` through `phase:5`, `area:platform`, `area:domain`, `area:discovery`, `area:hiring`, `area:trust`, `area:billing`, `area:quality`, `type:feature`, `type:decision`. Labels are suggestions, not assumed to exist. Until labels/milestones are configured, phase and stable ID in the title are sufficient. Dependencies below are mandatory gates even if GitHub does not enforce them.

## Phase 0 — foundation decisions and isolation

### EE-001 · Record launch decisions and architecture ADRs

**Dependencies:** none. **Spec:** [scope](00-product-and-scope.md), [decisions](08-sources-and-decisions.md).

Choose frontend/server/auth/storage/maps/email/payment/deployment providers; document supported launch jurisdictions/currencies, adult policy, staffing hours, privacy/retention and commercial approvals. Preserve vendor adapters and modular-monolith boundary. Deliver ADRs, environment map, approved plan version and legal/operations decision register; do not provision paid products without authorization.

**Acceptance:** every launch gate has an owner/status; unresolved gates block live activation explicitly; no provider secrets in repo; four categories and pinned navigation remain unchanged. **Validation:** product/engineering/operations review the ADRs against V1 scope.

### EE-002 · Establish app shell, environments and delivery checks

**Dependencies:** EE-001 (technical selections; live business gates can remain pending). **Spec:** [architecture](00-product-and-scope.md).

Create implementation foundation in a later feature change: separate dev/test/production resources, typed server/client boundaries, migrations, CI/build/lint, secret handling, preview environment and rollback path. Build seeker and host shells with explicit workspace switching.

**Acceptance:** mobile seeker tabs exactly Seek/Swipe/Map/Profile in order; host shell separate; no production data in previews; health checks and correlation IDs; documented local setup. **Validation:** clean setup/build, keyboard navigation and environment isolation checks.

### EE-003 · Implement identity, memberships and permission policy

**Dependencies:** EE-002. **Spec:** [permissions](05-security-permissions-admin.md), [team workflow](04-workflows-and-api.md).

Implement one user/many memberships, verified email, recovery/session revocation, role capabilities, owner transfer, invitations and scoped platform roles. Deny by default and check object ownership per request.

**Acceptance:** seeker+host account works; org-A cannot read org-B; listing manager/billing cannot read applicants; last owner protected; revoked invitation/token/membership immediately ineffective; admin MFA. **Validation:** permission matrix integration tests including guessed IDs and stale sessions.

### EE-004 · Implement private/public media and scan pipeline

**Dependencies:** EE-002, EE-003. **Spec:** [uploads](05-security-permissions-admin.md).

Purpose-bound uploads, quotas, quarantine/scanning, safe conversions, stripped EXIF and authorized downloads; publish only approved image derivatives.

**Acceptance:** malicious/mislabeled/oversized files cannot become attachable; resume URLs private; cross-owner asset references rejected; outage remains pending; clean alt-text image slots work. **Validation:** adversarial upload fixtures, scan failure/retry, access revocation and orphan-cleanup checks.

**Phase gate:** identity isolation and media boundary proven before real applicant documents enter any environment.

## Phase 1 — canonical supply and trust foundation

### EE-005 · Build canonical listing schema and validators

**Dependencies:** EE-003, EE-004. **Spec:** [domain model](01-domain-model.md).

Implement identity/draft/immutable published revisions, common fields, four-category modules, compensation, timing, housing/meals and stable photo slots. Add indexes/constraints and public/private projection types.

**Acceptance:** valid representative listing for every category; multi-category Farm/Seasonal role keeps one primary; variable pay/unknown data renders honestly; cross-org location/media refs fail; invalid date/pay combinations fail with field errors. **Validation:** validator/constraint tests using real edge conditions, not copied UI snapshots.

### EE-006 · Build host organizations, locations and storefront

**Dependencies:** EE-003, EE-004. **Spec:** [host profile](03-profiles-and-host-workspace.md).

Implement private legal/verification data, public versioned storefront, cover/logo/About/team/gallery/FAQs, multi-location records and public preview. Weather is optional and independent.

**Acceptance:** logo/name deep link works; no private evidence/representative contact in public payload; no-jobs state; team consent and image alt text; precise private coordinates excluded; failed/stale weather hidden. **Validation:** public projection and privacy tests; mobile/desktop review.

### EE-007 · Build moderation, verification and report operations

**Dependencies:** EE-003, EE-004, EE-006. **Spec:** [admin controls](05-security-permissions-admin.md).

Implement first-host review, scoped business verification badge, reports/evidence, sanctions, appeals and append-only audit. Provide actual staffed escalation/runbook controls before public supply.

**Acceptance:** purchase never grants verification; takedown immediately blocks visibility/application; reporter private; support has no broad resume access; appeal requires recorded decision; admin sensitive actions audited. **Validation:** end-to-end fraudulent-host/takedown/appeal exercise and permission checks.

### EE-008 · Build host listing wizard and publication lifecycle

**Dependencies:** EE-005, EE-006, EE-007; EE-020 provides confirmed paid limits later. **Spec:** [publication workflow](04-workflows-and-api.md), [quota semantics](06-pricing-and-entitlements.md).

Implement stepwise drafts/preview, review routing, publish/edit/pause/renew/close/archive, expiry/reservations and Starter entitlement usage; use the same entitlement interface later needed for subscriptions.

**Acceptance:** autosave conflict visible; pending edit retains live content; material change review; no quota race; expiry/deadline enforced synchronously; closure preserves applications. **Validation:** concurrent publication and revision tests, clock-driven expiry and pending-reservation release.

**Phase gate:** a host can safely publish each category with honest work/life terms, and operations can remove it immediately.

## Phase 2 — equal discovery modes and canonical cards

### EE-009 · Build canonical card/detail and housing/meals sheets

**Dependencies:** EE-005, EE-006, EE-008. **Spec:** [wireframe and card contract](02-discovery-and-cards.md).

Implement shared data adapter/variants, hierarchy from uploaded drawing, title vs host navigation, dates/pay/housing/meals strips, full detail and unavailable states.

**Acceptance:** four photo slots per sheet with labeled missing state; no invented match percentage; no color-only status; all key data at large text; host/name link behavior identical across modes. **Validation:** component and manual keyboard/screen-reader checks; compare all variants to source mapping.

### EE-010 · Build shared discovery query and Seek feed

**Dependencies:** EE-008, EE-009. **Spec:** [search contract](02-discovery-and-cards.md).

Implement validated filters/sorts/cursors, full-text/geographic querying and public projection visibility overlay. Seek is a feed with explicit Save/Apply/Skip and URL-safe state.

**Acceptance:** four categories/secondary matches; no silent filter broadening; pay sorted only on comparable basis/currency; stable pagination/deduplication; moderation not leaked through stale cache. **Validation:** query semantics and load tests on specified dataset, cache invalidation race.

### EE-011 · Build saved/skipped state and Profile shortcuts

**Dependencies:** EE-003, EE-010. **Spec:** [shared state](02-discovery-and-cards.md), [profile hub](03-profiles-and-host-workspace.md).

Implement unique dispositions, replace/clear/restore, private Saved/Skipped lists, guest auth continuation, cross-mode overlays and safe optimistic updates.

**Acceptance:** saves/skips private; skip not both saved; applied history independent; closed saved cards labeled; sign-in returns to intended listing; conflicting tabs do not lose newer state. **Validation:** cross-user access and cross-tab concurrency tests.

### EE-012 · Build Swipe deck and accessible gesture equivalents

**Dependencies:** EE-009, EE-010, EE-011. **Spec:** [Swipe](02-discovery-and-cards.md).

Gesture-first card deck, help, left skip/right save/up application-entry, tap details, 10-second Undo and accessible Actions menu.

**Acceptance:** no gesture submits; no permanent action footer by default; nested sheet/scroll gestures safe; successful Undo restores prior disposition; saved/applied excluded; deck state restores after host detail. **Validation:** touch devices, keyboard, reduced motion, offline/error rollback. Up entry can use a disabled integration boundary until EE-016, but launch gate requires working review.

### EE-013 · Build Map clusters, selected card and pull-up list

**Dependencies:** EE-009, EE-010, EE-011. **Spec:** [Map](02-discovery-and-cards.md).

Category icon/color markers, bounds query/clusters, Search this area, draggable/list-button sheet states, synchronized selection and separate Remote-eligible section.

**Acceptance:** no fake Remote pins; maritime home port labeled; list usable on map failure; stale bounds discarded; capped counts labeled; private coordinates absent; map state restored after details. **Validation:** coincident pins, date-line bounds, low zoom, keyboard/list access and denied geolocation.

**Phase gate:** Seek/Swipe/Map operate over the same IDs/revisions/filters, with independent mode presentation and preserved pinned nav.

## Phase 3 — seeker identity and intentional hiring

### EE-014 · Build private structured seeker profile

**Dependencies:** EE-003, EE-004. **Spec:** [seeker profile](03-profiles-and-host-workspace.md).

Manual history/skills/education/credentials/preferences, privacy settings and host-view preview. No public directory or sensitive identity-document collection.

**Acceptance:** all optional preferences optional; stable entry IDs; date validation; private fields absent from host/public schemas; no employability/completion score to host. **Validation:** owner/nonowner access, field-level sharing tests and form accessibility.

### EE-015 · Build versioned resume studio and exports

**Dependencies:** EE-004, EE-014. **Spec:** [resume studio](03-profiles-and-host-workspace.md).

Multiple labeled uploads/structured variants, explicit profile refresh, immutable versions, preview and one accessible PDF template; no AI parsing.

**Acceptance:** edits never rewrite old versions; pending/blocked files not selectable; PDF export not blank/clipped; failed DOCX conversion safely handled; selected data only in host preview. **Validation:** render representative multi-page resumes, download ownership and version-isolation tests.

### EE-016 · Build internal application review and submission

**Dependencies:** EE-008, EE-009, EE-014, EE-015. **Spec:** [application workflow/transaction](04-workflows-and-api.md).

Contact/resume/credential-metadata selection, questions, optional cover letter, review/disclosure and explicit idempotent Submit; immutable listing/applicant snapshots and receipt.

**Acceptance:** double click/network retry creates one app; stale revision requires review again; closed/deadline/sanction stops submission; resume ownership rechecked; no private preferences/references leaked. **Validation:** race tests for close/edit/revoked asset and snapshot immutability.

### EE-017 · Build external application exits and activity

**Dependencies:** EE-007, EE-009, EE-014. **Spec:** [external workflow](04-workflows-and-api.md).

Validated employer URL/domain review, explicit redirect notice, optional own activity and self-reported outcomes.

**Acceptance:** external click never becomes internal submitted app/hire; no seeker PII in URL; hostile/scheme/private-network redirects rejected by policy; clear return path. **Validation:** URL/redirect fixtures, guest/tracking-declined flow, status-label review.

### EE-018 · Build seeker tracking and host applicant pipeline/messages

**Dependencies:** EE-003, EE-016. **Spec:** [states/messages](04-workflows-and-api.md), [dashboard](03-profiles-and-host-workspace.md).

Application lists/detail, allowed status transitions, host notes, participant text messaging, unread counts, withdraw/block/report and actor-labeled outcomes.

**Acceptance:** seeker cannot see host notes; listing manager/billing cannot see applicants; no cross-org inbox leakage; withdrawal race safe; terminal threads follow retention rules; no automatic score rejection. **Validation:** matrix and transition/concurrency tests, notification privacy checks, mobile host navigation.

### EE-019 · Add transparent private fit hints

**Dependencies:** EE-010, EE-014. **Spec:** [fit](02-discovery-and-cards.md).

Opt-in deterministic met/not-met/unknown checks, preference reasons and rule versions; seeker-only overlays.

**Acceptance:** unknown not treated as met; expired credential flagged; no percentages/protected-trait inputs/host score; opt-out leaves discovery usable; cannot block apply. **Validation:** rule examples for four categories and missing data; inspect privacy boundaries.

**Phase gate:** every discovery Apply entry reaches the same intentional review/redirect behavior; internal submission/history/messages work end to end.

## Phase 4 — commercial and operational readiness

### EE-020 · Implement versioned plans, checkout and entitlement ledger

**Dependencies:** EE-001 (commercial approval), EE-003, EE-008. **Spec:** [pricing](06-pricing-and-entitlements.md).

Starter/Growth/Pro plan versions, provider checkout/portal, verified webhook processing, usage/seat limits, reconciliation and invoices. Deferred offers remain disabled.

**Acceptance:** 1/5/25 slots and 1/3/10 seats (or newly approved documented limits); no browser-granted paid access; duplicate/out-of-order webhooks safe; two tabs with different checkout keys converge on one org operation/agreement; duplicate provider agreement quarantined for Finance; invitation/publication races bounded; no card data stored. **Validation:** provider test lifecycle and usage reconciliation under concurrency.

### EE-021 · Implement upgrades, cancellation, dunning and downgrades

**Dependencies:** EE-020. **Spec:** [billing lifecycle](06-pricing-and-entitlements.md).

Proration preview/explicit acceptance, paid-through cancellation, 7-day proposed grace, host choice of retained jobs/members, deterministic fallback, support adjustments and audit.

**Acceptance:** no applicant/history deletion on downgrade; owner retained; excess jobs paused/members suspended; no automatic republish after upgrade; billing uncertainty reconciled; Billing-only plan request reveals counts/status, owner/admin make retention selections or deterministic fallback applies. **Validation:** period boundaries, failure/recovery, downgrade races and finance audit exercise.

### EE-022 · Build outbox workers, notifications, metrics and runbooks

**Dependencies:** EE-007, EE-008, EE-016, EE-018, EE-020. **Spec:** [reliability](04-workflows-and-api.md), [quality targets](00-product-and-scope.md).

Idempotent events/workers, minimized transactional notices, expiry/projection repair/reconciliation, dead-letter replay, metrics/alerts, backup/restore and incident runbooks.

**Acceptance:** email failure never loses submission; retry no duplicate side effect; no private message/resume in logs; projection lag/takedown alerts; observed load and restore results recorded. **Validation:** dependency outages, worker replay, restore drill and host-compromise tabletop.

### EE-023 · Build export, retention, deletion and operational access controls

**Dependencies:** EE-003, EE-004, EE-007, EE-015, EE-018, EE-020. **Spec:** [privacy/retention](05-security-permissions-admin.md).

Versioned policies, exports with redaction, reauthenticated deletion, ownership handoff, legal holds, asset/cache purge and restore deletion ledger; scoped case access/review.

**Acceptance:** export excludes other candidates/host notes; owner cannot abandon org; private profile purge within approved schedule; shared records handled explicitly; backup restore replays deletions; reviewer access expires. **Validation:** full seeded account export/deletion/hold/restore exercise across database and storage.

**Phase gate:** live payments stay disabled until EE-020/021 approved; public pilot stays disabled until EE-022/023 and trust operations are ready.

## Phase 5 — integrated launch verification

### EE-024 · Verify cross-mode UX, accessibility and performance

**Dependencies:** EE-009 through EE-019, EE-022. **Spec:** [acceptance examples](02-discovery-and-cards.md), [targets](00-product-and-scope.md).

Test real touch/keyboard/screen-reader journeys, all four category examples, shared card state, nested sheets/Back, large text/reduced motion, map/provider failures and target dataset/load.

**Acceptance:** no discovery mode missing; pinned tabs intact; no accidental application; representative housing/meals/pay/date combinations readable; documented performance meets targets or scoped release exception with owner. **Validation:** recorded device/browser matrix and measured results, not a claim based on build success.

### EE-025 · Complete security, business and pilot release gate

**Dependencies:** EE-001 through EE-024. **Spec:** [security verification](05-security-permissions-admin.md), [open gates](08-sources-and-decisions.md).

Review object/tenant access, session revocation, uploads, webhooks, private caches, admin audit, deletion, scams, support staffing and commercial/legal readiness. Rehearse full host/seeker journey and rollback; enable a limited pilot only after sign-off.

**Acceptance:** no unresolved critical/high access/data risks; all launch gates resolved with owners/evidence; public claims match built features/prices; moderation/appeal channels staffed; no production sample applicants; pilot cohort and rollback owner named. **Validation:** end-to-end evidence register with pass/fail/exception and an explicit go/no-go decision.

## Deferred backlog boundary

New issues are required for AI resume import/editing, numerical fit, reverse sourcing/opt-in public profiles, pay-market comparisons, reviews, ATS integrations, native apps, companion linking, unpaid opportunities, promotion inventory, standalone listing grants, add-ons and enterprise provisioning. They must not be bundled into V1 under the label “polish”. No issue in this backlog authorizes copying the legacy application wholesale.
