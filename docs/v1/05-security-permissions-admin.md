# Security, privacy, permissions and administration

## 1. Permission model

Deny access unless an explicit capability and object relationship allow it. A role label alone is insufficient: verify active account, organization membership, resource ownership, assignment where applicable and current sanction state on every request and download. The [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) supports deny-by-default and per-request enforcement; the product-specific access rules below are V1 design decisions.

Host roles: **Owner**, **Admin**, **Recruiter**, **Listing manager**, **Billing**. One role per membership in V1; owner/admin contain operational capabilities as shown. Roles cannot be edited from profile payloads. Seeker and host permissions are independent memberships on one identity.

| Capability | Guest | Seeker (own) | Owner | Admin | Recruiter | Listing manager | Billing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browse public approved content | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Private profile/resumes/save/skip/apply | No | Own only | Own seeker identity only | Same | Same | Same | Same |
| Read organization drafts/listings | No | No | Own org | Own org | Own org | Own org | Slot/plan summary only |
| Edit/submit/publish/pause/close listings | No | No | Yes | Yes | No | Yes, routine approved-host policy | No |
| Edit storefront/locations | No | No | Yes | Yes | No | Yes | No |
| First storefront publication / material organization changes | No | No | Yes + review | Yes + review | No | Submit draft for review only | No |
| Read applicant snapshots, notes, message/status | No | Own application, no notes | Own org | Own org | Own org | No | No |
| Team invites/role changes | No | No | Yes | Non-owner roles only | No | No | No |
| Ownership transfer/org closure | No | No | Reauth + safeguards | No | No | No | No |
| Analytics | No | Own activity only | Aggregates | Aggregates | Aggregates | Listing counts only | Billing metrics only |
| Plan changes/invoices | No | No | Yes | No | No | No | Yes |
| Downgrade job/member retention selection | No | No | Yes | Yes | No | No | No (counts only) |
| Report abusive content/user | Sign-in path | Yes | Yes | Yes | Yes | Yes | Yes |

Listing manager publication applies only after owner/admin approved initial storefront and moderator-approved publication eligibility. No host role can grant verification, clear moderation, inspect other organizations, export all seekers or override billing limits. Paid plan access never creates new privacy permissions. Recruiter access to own-organization applications is broad in V1; fine-grained per-listing assignments are later, so disclose this to organization owners.

Platform roles are separate scoped capabilities: Support (account metadata/receipts), Trust moderator (case-linked content/evidence and sanctions), Verification reviewer (host evidence/verification), Finance (billing metadata/adjustments), Taxonomy editor (non-category controlled terms), Security operator (sessions/incidents), Auditor (minimized audit read), Platform owner (role assignment/config governance). A support agent cannot open resumes by default. Case-based sensitive-data access requires explicit grant, reason and expiry; platform owner is not an unlogged content bypass. MFA and recent reauthentication are mandatory for admin access and host ownership/billing security changes.

## 2. Data classification and privacy defaults

| Class | Examples | Access / handling |
| --- | --- | --- |
| Public approved | Live job/storefront, intentionally public logo/photos/locality | Explicit projection and current visibility check, no-store in V1; withdraw on sanctions/unpublish |
| Private seeker | Profile, preferences, uploads, saves/skips | Owner only; no directory, search index, analytics payload or host reveal |
| Application shared | Chosen resume/contact/answers/snapshot/messages | Applicant + authorized owning-host recruiters/admins/owner; scoped trust access |
| Organization private | Drafts, hiring notes, team metadata | Own-org capabilities; never public/seeker serialization |
| Restricted operational | Verification evidence, sanctions, security events, billing refs | Named platform roles with reason/audit, no general host access |

Privacy interface must disclose sharing before submission, default profiles private, make optional fields clear, and offer export/deletion controls. Public discoverability is not a consent mechanism for private data use. Blocked senders cannot contact the seeker through another thread without policy enforcement. Contact information cannot be exported in bulk merely because a host has a subscription. V1 omits CSV candidate export to reduce uncontrolled dissemination; per-application authorized resume download is supported and audited.

Do not place applicant names/emails, precise coordinates, message bodies, resume text, signed URLs or private query preferences in analytics, error logs or payment metadata. Collect coarse aggregate product events with an anonymous/session or pseudonymous ID and configured consent policy. Separate operational/security logs from analytics. Hosting country, supported jurisdictions, lawful bases, privacy notices, vendor agreements and hiring regulations must be approved before the live pilot. This document chooses engineering defaults; it does not assert jurisdictional legal compliance.

Proposed retention schedule (policy versioned; jurisdiction review may override):

| Data | Default |
| --- | --- |
| Unsubmitted application drafts | Device/session only, delete after 7 days inactivity or logout |
| Pending/quarantined uploads | Purge after 7 days; blocked malicious objects isolated only as required for investigation |
| Orphan clean files | Purge after 30 days with no references |
| Active seeker profile/current resumes | While account active; deletion request handling below |
| Superseded unshared resume versions | 90 days after replacement; version used in application follows application retention |
| Application snapshots/messages/hiring notes | 12 months after terminal outcome or listing closure, whichever is later; nonterminal records flagged for disposition at 12 months |
| Save/skip state | While account active, or until user clears; purge on account deletion |
| Reports/appeals and sensitive evidence | 12 months after final case resolution, with access restricted throughout |
| Security/audit metadata | 12 months; minimize personal content; required longer periods must be documented |
| Raw analytics | 90 days; aggregate counts can persist without reidentifiable data |
| Billing records | Provider/legal retention schedule established at launch; no invented universal period |
| Backups | Rolling 35 days; access limited to restore procedures |

Deletion: reauthenticate -> verify no unresolved organization ownership -> immediate account deactivation/public removal/session revocation -> delete private unshared data within 30 days -> redact/purge shared application data according to approved retention or documented legal hold -> purge derivatives/search/cache/object references -> expire backups within 35 days. Explain any retained classes, reason and expected expiry to the requester. A minimal deletion ledger must reapply deletions after restore. Legal hold requires authorized scope, reason, review date and restricted access; never indefinite silent retention. Previous host downloads cannot be technically recalled; disclose this before submission and in deletion confirmation.

## 3. Authentication and application security

Use a maintained auth implementation with verified email, secure recovery, session rotation and revocation. Prefer secure HttpOnly SameSite cookies, TLS, CSRF protection for cookie-authenticated writes, strict origin checks and a restrictive content security policy. Reauthentication for ownership transfer, account deletion, email changes and admin role grants. Session expiry/revocation is server enforced; removing membership invalidates authorization on the next request. Avoid exposing whether a particular email has an account in recovery/login errors.

All database queries parameterized; validate input lengths/enums/IDs; sanitize allowed rich text on write and escape on rendering. No host-authored scripts/iframes or arbitrary HTML. Server-only secrets with least privilege, environment separation, rotation and masked diagnostics. Do not store payment-card data. Payment/redirect URLs must use approved schemes/hosts and safe redirect destinations. Preview/screenshot/URL-fetch workers block private, loopback, link-local and metadata endpoints including after DNS resolution/redirects, or avoid server URL fetching entirely. Public external application links receive phishing/domain review and a clear destination notice.

Starting rate limits (tune from observations): auth attempts 10 per 15 minutes per IP/account with abuse controls; internal submissions 20/hour/user; messages 30/minute/user plus 300/day; reports 10/day/user; uploads 20/hour/user and 200 MB/day; public query 120/minute/IP with bot protection. Responses give Retry-After without disclosing other users. Hard account/organization limits supplement IP limits, which must not permanently block shared networks. Alert on credential stuffing, cross-tenant attempts, bulk downloads and suspicious host messaging.

## 4. Upload and media pipeline

The [OWASP file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) informs the checks for file type, size, ownership and isolation. V1 choices: resume PDF/DOCX max 10 MB; credential evidence PDF/JPEG/PNG max 10 MB; cover/logo/gallery/housing/meals JPEG/PNG/WebP max 8 MB and 20 megapixels decoded. No SVG, HTML, ZIP, macro documents or video uploads. Extension, MIME and signature must agree; filenames are display metadata, never storage paths.

Authorize purpose/quota -> allocate unpredictable private key and signed upload <=10 minutes -> verify byte/type/pixel limits -> quarantine -> malware scan/safe decode or conversion -> strip image EXIF/GPS and generate derivatives -> mark clean -> allow attachment -> publish only approved host-image derivatives. Originals remain private where needed and are never served executable inline. Converters run with bounded CPU/memory/time and no network. A scanner failure remains pending, not clean. Private downloads use short-lived (<=60 seconds) scoped authorization and attachment disposition; authorization checked before link issuance (a link already issued can remain usable until its short expiry). All buckets stay private. Public image delivery goes through a server route checking at least one current approved active publication reference, with no-store headers and no direct public bucket/CDN URL. Removed/restricted publication references immediately deny new media-route requests; already downloaded copies cannot be recalled. Static application assets alone may use CDN caches.

Credential evidence is private and not automatically shared in V1. A host must never reference a seeker's file or another org's asset in a listing, even if the UUID is known. Referenced application files cannot be deleted as orphan assets; privacy deletion/redaction follows an explicit audited process instead.

## 5. Admin control surfaces and workflow

| Queue/control | Allowed actions and safeguards |
| --- | --- |
| Host verification | Review business/representative evidence, request corrections, approve/revoke scoped badge with date and reason; evidence private |
| Listing moderation | Review pending first/risk/material revisions; approve/return/restrict; compare prior revision; no silent rewrite of pay |
| Reports | Fraud, unsafe terms, discrimination, misleading housing/meals, spam, privacy or phishing; preserve evidence snapshot privately |
| Sanctions | Content takedown, listing pause, account/organization suspension, messaging restriction; explicit scope/reason/duration |
| Appeals | Separate reviewer where feasible; decision history, explanation, possible reinstatement; review does not itself restore unsafe content |
| Account support | Lookup minimized status, trigger recovery flow, revoke sessions through security capability; no password access or impersonation in V1 |
| Billing support | Read provider status, controlled entitlement credit/refund request with audit/provider reference; no applicant access |
| Taxonomy | Occupations, skill/credential codes, subtypes and synonyms; four primary categories are locked in V1 |
| Configuration | Versioned expiry/review policies, limits and feature flags; validate effective time and audit changes |
| Audit/security | Filter actor/target/request; incident timeline and unusual-access review; no editable audit entries |

Report lifecycle: open -> triaged -> investigating -> actioned or dismissed -> appeal (separate record) -> resolved. Proposed operational SLA: urgent safety/fraud triage within 4 staffed hours, routine reports within 2 business days; publish actual staffed hours before pilot. Immediate technical takedown is available to Trust staff without waiting for billing state. Notify affected users with safe reasons; never reveal reporter identity or private evidence. Reporters see receipt and high-level outcome only. Appeals are accepted for 30 days after action, acknowledging within 2 business days; staffed review target 5 business days.

Verification status: unverified -> pending -> verified / needs_information / declined; verified -> revoked on risk/ownership change. Badge label must say “Business identity checked” with scope/date; it does not verify pay, housing quality, legal compliance or credential validity. Approval and verification are distinct concepts. A verified business may still have a restricted listing.

Admin role grants, billing adjustments above a configured threshold, destructive organization closure and broad privacy exports require a second authorized reviewer before execution. No secret “superadmin” toggle in a browser. All sensitive actions record actor, capability, reason, target, before/after IDs, time and correlation ID. Audit payloads do not embed full resumes/evidence. Audit storage is append-only with restricted export and independently monitored access.

## 6. Required security verification before launch

Test anonymous/seeker/org-A/org-B/billing/listing-manager/recruiter/support boundaries at API, storage and worker levels, including guessed IDs and stale tokens. Test revoked memberships, unsafe external URLs, malicious/mislabeled uploads, scanner outages, report privacy, cache leakage, duplicate webhooks and billing quota races. Verify export/delete through object storage, derivatives, search, backups restore procedure and legal holds. Conduct a restore drill and an incident exercise: restrict compromised host -> revoke sessions -> remove search visibility -> notify/trace affected applicants -> reinstate only after review. See [delivery issues](07-delivery-plan.md) for launch acceptance.
