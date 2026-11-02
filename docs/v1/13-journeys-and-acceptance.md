# Complete journeys, extension APIs and acceptance

Recommended implementation contracts under [confirmed scope and open decisions](08-sources-and-decisions.md). [Screens](10-screen-inventory.md), [resume/privacy](11-resume-availability-privacy.md), [community](12-community-and-campaigns.md) and original [transactions/API](04-workflows-and-api.md) own details. These journeys and checks are planned, **not implemented or passed tests**.

## 1. Guest to seeker to next position

Browse any category in Seek/Swipe/Map as guest -> compare canonical job terms and housing/meals -> open host logo/page -> return to previous mode state. Save/skip/apply requests sign-in with retained intent. Explicit “I’m a seeker” setup confirms native minimum name/contact and optional resumable build/import/availability; profile completion cannot gate browsing. Import requires clean source, processor consent if applicable, review and explicit merge.

Internal apply: choose clean resume version and individually shared fields -> confirm native minimums -> answer questions -> review actual document/contact/answers/current listing revision -> explicit Submit -> one immutable application/receipt. Changed job revision requires new review. External apply shows domain/exit and records only an exit; private “applied externally” note is self-reported. Sign-in or gestures never auto-submit.

Track status/application-linked messages -> manually interview/offer/hire or withdraw/report/block -> maintain private history. Save/skip independent of application. Update availability for next position and selectively refresh a new resume version; submitted snapshots stay unchanged. One app per seeker/listing, terminal correction and renewed-season IDs are inherited D23 policies requiring validation, not confirmed immutable choices.

## 2. Host through a complete season

Choose “I’m a host” -> create/join organization with explicit membership -> private legal/representative details + public cover/logo/About/locations/team consent/photos/weather -> public-only preview -> initial moderation. Business verification badge has its own scope/date and is unrelated to payment. Dual-role switching recommended D01; no duplicate account required if adopted.

Draft listing category/module, timing, compensation, housing/meals/photo slots, requirements/apply method -> autosave/validate/preview across modes -> entitlement/review gate -> publish. Recruiter/owner/admin receives only intentionally submitted snapshots, communicates and advances manual status. Billing/Listing manager do not see resumes. Org switch reauthorizes and clears private caches.

Optional notice/campaign references canonical job/host -> quote/review/explicit payment -> approved schedule/capped labeled delivery. Organic inclusion D18; no per-job automated spam. Live job edits create reviewed revisions, with material-change notices while original applicants retain terms. Pause/close/expiry stops new discovery/apply/job campaign. Close season, disposition applicants, reconcile underdelivery separately from hiring.

Cancel host subscription without deleting applications; enforce approved downgrade capacities; organization closure is separate owner action. Final account deletion resolves ownership and retention obligations. Prior staff authorship remains auditable after removal without retaining their access.

## 3. Community and trust lifecycle

Seeker selects social handle -> uploads private photo -> scan/EXIF removal -> <=3 tags/optional coarse place/feeling -> audience/rights preview -> review -> canonical published photo -> Photos/Feed projections and reactions, no comments -> edit/review, withdraw/delete or report/appeal. Host workplace photos use public host tools instead.

Platform editor/host drafts announcement -> canonical CTA -> review/feedback -> approved schedule -> same content ID in Announcements and curated Feed -> expire/withdraw/restrict. Paid path additionally checks quote/inventory/explicit payment/caps; payment and moderation independent. Cross-view direct access is intentional; repeated Feed distribution is deduplicated.

Report -> private receipt -> staffed triage -> urgent restriction if warranted -> scoped evidence/investigation -> action/dismiss -> safe notifications -> appeal -> recorded decision -> only eligible approved reinstatement. Delete/block/takedown applies to feed/detail/media/counts/reactions and paid delivery; evidence separately restricted. Host cannot pay or rotate creative to evade sanctions.

## 4. Professional privacy, verification and deletion lifecycle

Change field visibility -> preview future sharing -> find resume artifacts containing now-hidden data -> create compliant version or explicit one-application override -> disclose exact snapshot. Original uploads cannot be redacted by a native toggle; show actual document and allow replace/knowingly share. Private profile never becomes a host directory.

Self-reported certification -> optional supported verification request/consent/evidence -> scoped reviewer/method -> correction/verified/declined -> expiration/revocation/material-edit re-review -> safe notice/appeal. Unsupported cases remain honestly self-reported, not blocked from all seeking. Evidence private; only selected scoped metadata shared. Old application records show verification-at-submission; revocation notification is separate from rewriting history.

Export -> reauthenticate -> collect own professional/import/social/application/messages -> third-party redaction -> expiring authorized download. Delete -> reauthenticate and resolve ownership -> deactivate/revoke sessions -> remove public/social serving -> purge private unshared data, pending imports and derivatives -> retain/redact hiring/case/billing under approved policy -> replay deletion ledger after restore. Explain retained classes/reason/expiry and previous downloads limitation; source-file deletion alone cannot erase an application snapshot.

## 5. Proposed extension API inventory

All under `/api/v1`; original object/tenant authorization, expected versions, idempotency, rate limits, errors and no-store apply. No endpoint is implemented. Public/user schemas are allowlists, not raw rows. Existing generic report/upload/export endpoints are reused.

| Method / endpoint | Capability / boundary |
| --- | --- |
| `GET/PATCH /me/onboarding`; `POST /me/roles` | Own resumable role setup; cannot self-grant org/admin membership |
| `GET/PATCH /me/availability`; `POST .../confirm` | Own preset/date/timezone/version; explicit confirmation |
| `GET/PATCH /me/profile/field-policies` | Own per-field audience; rejects unsupported public audience |
| `PUT /me/skills/highlights`; `GET/POST/PATCH/DELETE /me/affiliations[/:id]` | Own IDs/cap/order; affiliations conditional D11 |
| `POST /me/imports`; `GET/DELETE /me/imports/:id` | Clean own source, consent/version, queued state/poll/cancel/purge |
| `PATCH /me/imports/:id/proposals/:proposalId` | Own explicit review decision; never direct native mutation |
| `POST /me/imports/:id/merge`; `POST .../undo` | Reviewed-only version-checked atomic merge/compensation, retry stable |
| `GET/POST/PATCH /me/credentials[/:id]`; `POST .../verification-requests` | Own record/consent/evidence; sensitive edit invalidates old verified scope |
| `GET /resume-templates` | Approved supported templates only; optimizer endpoints conditional on scope/consent |
| `GET/PATCH /me/community-identity` | Own handle/avatar; no native contact/resume serialization |
| `GET /community/{feed,photos,announcements}`; `GET /community/content/:id` | Authenticated seeker under D14; current audience/block/moderation/caps; canonical revision |
| `POST/PATCH /me/community/photos[/:id]`; `POST .../:id/submit`; `DELETE .../:id` | Owner draft/version/clean image/tag cap/review/delete; cannot set org author |
| `PUT/DELETE /community/content/:id/reaction` | Own fixed reaction, current visibility/block, unique pair; no comments endpoint |
| `PUT/DELETE /me/blocks/:subjectType/:id`; `PATCH /me/promotion-preferences` | Owner; immediate eligibility effect |
| `POST /reports`; `POST /me/reports/:id/appeals` | Own receipt, private reporter, target-type validation |
| `GET/POST/PATCH /organizations/:orgId/announcements[/:id]`; `POST .../:id/submit` | Scoped own org drafts/submissions; no auto-publish/charge |
| `GET/POST /organizations/:orgId/campaigns`; `POST .../:id/{quote,submit,checkout,pause,cancel}` | Owner/Admin content, Listing manager draft; Owner/Billing payment; Trust independent |
| `POST /community/delivery/:assignmentId/{view,click}` | Authenticated assigned recipient, current eligibility, dedup; cannot invent billed volume |
| `GET /organizations/:orgId/campaigns/:id/report` | Own-org aggregates, no viewer/reactor identities |
| `POST /admin/community/:id/actions`; `POST /admin/campaigns/:id/actions` | Scoped editorial/Trust, reason/version/audit |
| `POST /admin/credentials/:id/decisions` | Scoped credential reviewer; host-review capability insufficient |

Critical atomic writes: import version-checks selected native targets then merge/audit/outbox; publication validates owned clean media+current approved revision+audience; reaction checks visibility/block then unique pair; campaign activation validates revision/inventory/payment/target; per-delivery atomic cap reservation spans user/session/host/campaign. Acknowledgement is unique per assignment; retry cannot double-count/charge. Network parser/payment work runs outside DB locks. Outbox delays cannot bypass current takedown, privacy or cap checks. Late payment reconciles expired holds rather than activates them.

## 6. Release scenarios

Record owner, date, device/browser/assistive mode, fixtures, observed pass/fail/exception and evidence. Consumer flows need desktop/mobile/touch/keyboard/screen-reader review; access/concurrency need API/storage/worker verification. These scenarios are future implementation acceptance, **not tests claimed passed by a docs commit**.

| ID | Scenario | Required outcome |
| --- | --- | --- |
| A01 | All four categories through Seek/Swipe/Map, change filters and modes | Same IDs/terms, four pinned tabs, honest Remote representation; provider failure leaves list |
| A02 | Open logo/housing/meals in each mode then Back | Same host/revision/four slots/costs/unknowns; mode state restored |
| A03 | Guest gesture/apply, sign in, cancel | No application; accessible review/exit, retained job, explicit role setup |
| A04 | Duplicate submit/retry, edit/close/deadline/resume revocation race | One receipt or safe conflict; no stale or unauthorized snapshot/lost draft |
| A05 | Sparse/malicious import; unreviewed proposals | Instructions inert, missing stays unknown, no auto-merge; native minimum confirmed |
| A06 | Concurrent profile edit, import retry/cancel/undo | No lost newer edits/duplicate merge, conflict re-review, staging deletion honored |
| A07 | Jan-31 preset, approximate Beyond, revisit past date | Month clamp/frozen date, no invented day/date drift, stale reconfirm prompt |
| A08 | Hide phone present in old generated/uploaded PDF | New compliant version or explicit disclosure; actual host preview matches; social no contact leak |
| A09 | Expire/revoke/edit credential; exceed highlight cap; add affiliation | Honest scope/date, private evidence; validity-at-start correct; no role/endorsement from affiliation |
| A10 | Host uploads Photos; fourth tag/comments/embedded GPS | Seeker-only author, cap enforced, no comment flow, EXIF stripped/coarse manual place; pending media denied |
| A11 | Same photo/notice across tabs/pagination/retries | One identity/reaction state, no repeat Feed distribution or duplicate post |
| A12 | Block/delete/restrict then deep link/media/count/reaction | New unauthorized access denied on all organic/paid surfaces, evidence private |
| A13 | Concurrent ad selection across tabs/formats, creative rotation | Shared host/campaign/day/session caps and density; acknowledgements dedup; no bypass |
| A14 | Late/duplicate payment, expired review/hold, cap/ad outage | No double charge/expired activation; re-quote if needed; organic works, ads fail closed |
| A15 | Target closure, paid creative change, misleading benefit claim | Delivery stops/re-review; canonical terms and labels authoritative; approved refund/make-good path |
| A16 | Report paid host, urgent privacy issue, appeal | Trust can stop despite payment; reporter private, audited review and safe reinstatement |
| A17 | Switch seeker/host/org-A/org-B/Billing/Listing manager; cancel plan | No tenant/private cache leak; role boundaries, hiring history retained/capacity reconciled |
| A18 | Export/delete with imports/photos/evidence/apps; restore backup | Redacted export, ownership resolved, serving withdrawn, purge/holds transparent, deletion replay; no seeker charge |

## 7. Creative recommendations for discussion

- **“Ready for my next season” private panel:** availability, resume freshness and expiring certifications together, without a public readiness score.
- **“Life there” host sequence:** team, real housing/meals, place/weather and jobs; a factual “What should someone know before arriving?” prompt rather than unverified reviews.
- **Factual discovery explanations:** availability overlap, housing available, credential information missing; preserve uncertainty and control.
- **One profile, readable alternatives:** clean default and compact resume presentation; emphasize credentials for maritime or portfolio links for remote without creating four incompatible schemas.
- **Low-pressure community:** photos and optional feeling without follower scores or required career performance; reactions stay lightweight.

Suggested decision order: D01/02 roles/entry; D13–16 captions/audience/moderation/reactions; D06/07 import/optimizer/templates; D08–11 highlights/availability/credentials/affiliations; D17–21 commercial inventory/caps. Record explicit user choices in 08 and update affected contracts/screens/acceptance before implementation. Open questions do not block this documentation commit.
