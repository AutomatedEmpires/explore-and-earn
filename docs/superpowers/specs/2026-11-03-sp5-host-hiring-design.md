# Sub-project 5: Host hiring technical design

- **Status:** design decided by engineering under the founder's end-to-end delegation (2026-11-03).
- **Parent:** [Product design spec](2026-11-03-explore-earn-product-design.md) sections 4 (candidate card), 11, 12, 14, 15.2, 17 and row 5 of section 25. Built on the [Foundation spec](2026-11-03-foundation-design.md) and its plan, using their exact names.
- **Goal:** everything a host needs to hire, from candidate pool to hire, plus the seeker-side responses to invites, interviews and offers.
- **Labels:** where the product spec is silent, a choice is marked **Engineering decision**. Everything else copies the product spec.

## 1. Goal and done-when

Done when the full journey runs end to end: invite → apply → interview → offer → hired. Each exit criterion is a test.

| # | Exit criterion | Proven by |
|---|---|---|
| E1 | A host opens a listing's Candidates tab and invites a pool candidate, and the org's `invite_credit` balance (`entitlements.getBalance`) drops by exactly 1. The seeker sees the invite in Inbox and taps Interested, and a thread exists. The seeker applies (SP4 flow) and the invite reads Applied. The host proposes 3 interview slots, the seeker picks one, and both stub emails carry a `text/calendar` attachment. The host marks it Completed, then sends an offer with a scanned PDF letter. The seeker accepts: the SP4 application status is `hired` and the pipeline shows Hired. | `tests/e2e/sp5-journey.spec.ts` |
| E2 | Pass followed by Undo within 10 s sends nothing to the seeker. Pass without Undo sends exactly one "Not selected" message. | `pass.test.ts` |
| E3 | `computeFit` returns the documented score and template lines for a fixture per category. The keys of SP4's `FitInputs` equal the allowlist in section 8.3. An on-site fixture scores the same location value whatever the seeker's `region`. With the listing's state in `hiring.fit_disabled_states`, no score is computed or returned. | `fit.test.ts` |
| E4 | An 11th invite to one seeker within 7 days returns 409 `seeker_unavailable` with "Not accepting invites right now", and the credit balance is unchanged. | `invites.int.test.ts` |
| E5 | A host message containing `__flag__` reaches the seeker with the "Never pay to get a job" banner and opens a `moderation` item. One containing `__block__` is never visible or notified to the seeker. | `scan.test.ts` |
| E6 | A message unread for 15 minutes produces one Digest email. A message read within 15 minutes produces none. | `messaging-notify.test.ts` |
| E7 | After the job's end date (clock advanced), the hired seeker gets the As-described prompt. The host page summary is `visible: false` at 4 responses and `true` at 5. | `as-described.test.ts` |
| E8 | After E1, analytics for the listing reads Applications 1, Interviews 1, Hires 1, invites sent 1 → interested 1 → applied 1. The CSV contains those rows. No analytics response schema contains a seeker identifier. | `analytics.test.ts` |
| E9 | Authorization matrix: Billing gets 403 on every SP5 host endpoint. A Recruiter outside the listing's scope gets 404. A Recruiter scoped only by location gets 200 on a listing at that location. A seeker gets 404 on another seeker's thread, invite, interview or offer. | `authz.int.test.ts` |

## 2. Scope

**In:** host pipeline transitions (Shortlist, Pass with undo, Mark hired); the fit score and its template explanations; candidate pools (rank, filter, hide, save); job invites with credits, caps and expiry, including the seeker-side invite UI; interview scheduling with seeker responses, `.ics` files and reminders; offers; messaging (threads, attachments, scam scanning, saved replies, the "Not selected" message, bulk to one listing); the As-described check; host analytics; the three SP5 slots on SP2's host Home (today's applicants, today's interviews, unread messages); the host Applicants, Candidates, Interviews, Messages and Analytics screens; the seeker Inbox (Messages, Invites, Interviews).

| Out of scope | Goes to |
|---|---|
| Application create, snapshot, screening answers, withdraw, the status enum, My jobs, staged reveal rules | SP4 |
| Report, block and mute storage and their review | SP4 (safety). SP5 calls it from every thread and invite |
| Listing data, recruiter scopes, listing notify list, entitlement ledger and monthly credit grants, host page rendering (it shows SP5's reply stats and As-described summary), host follows, the `/host` Home page (reminders, quota, setup checklist) | SP2 |
| The new-applicant notification to the listing's notify members (`applications.new_applicant`) | SP4 |
| `listing_events` recording, apply-source capture, pay normalization, job card data | SP3 |
| Buying extra invite packs; boost windows for the boost chart | SP6 (packs grant credits through SP2's ledger; boosts register with `analytics.registerBoostWindowsSource`) |
| Privacy export and erase registry, operator views of orgs and threads, retention enforcement | SP8 (SP5 registers its exporter and eraser) |
| Host-adjustable fit weights | Later (product 11.2) |
| Calendar sync, calls, translation, typing indicators, read receipts, reply by email | Not in V1 (product 11.4, 11.6) |
| Bulk status changes or bulk Pass | Not in V1. **Engineering decision:** dispositions stay one applicant at a time |

## 3. Modules and contracts

Three modules: `src/modules/hiring`, `src/modules/messaging` and `src/modules/analytics`. Dependencies run one way: analytics → hiring → messaging. Messaging never imports hiring. `src/server/counts.ts` composes both. **Engineering decision:** analytics is its own module so its read-only queries can't write hiring state.

```ts
// @/modules/hiring
import type { FitInputs, PoolListing } from '@/modules/profiles'; // SP4 owns both; SP5 never redeclares them.
// FitInputs is the ONLY seeker data fit may read (allowlist in 8.3)
export type ApplicationStatus = 'new'|'shortlisted'|'interviewing'|'offered'|'hired'
  |'not_selected'|'withdrawn'|'offer_declined';            // re-exported from @/modules/applications (SP4)
export type Category = 'maritime'|'seasonal'|'farm'|'remote';
export type FitFactor = 'occupation'|'availability'|'skills'|'certifications'
  |'work_authorization'|'pay'|'location';
export type FitWeights = Record<Category, Record<FitFactor, number>>;   // each category sums to 100
export const FIT_WEIGHTS: FitWeights;                         // code constant, the defaults in 8.3; no setting overrides it
export type FitListing = {
  category: Category; secondCategory: Category | null; occupation: string;   // SP2 basics.occupationCode (required)
  startDate: string; endDate: string | null; weeklyHours: number;            // weeklyHours from SP2 when.weeklyHours
  skillKeys: string[];                                                       // SP2 normalizeSkill().key of job.skills
  requiredCertificationKeys: string[];                                       // job.certifications, normalized like SP4 cert_key
  sponsorship: 'none'|'j1'|'h2a'|'h2b'; state: string | null;                // state: on-site location's state, else null
  remoteStates: string[] | 'all_us' | null;                                  // null for on-site listings
  maxPayHourlyCents: number | null;                                          // SP3 toHourlyCents({ pay, when }).maxCents
};
export type FitLine = { factor: FitFactor; weight: number; value: number; text: string };
export type FitResult = { score: number; weightsVersion: string; lines: FitLine[] };
export function computeFit(i: FitInputs, l: FitListing, w: FitWeights, version: string): FitResult; // pure; callers pass FIT_WEIGHTS
export function toPoolListing(h: ListingHiringInfo): PoolListing; // 8.2; ListingHiringInfo = one item of SP2 getHiringInfoMany (section 12)
export type Tally = { yes: number; partly: number; no: number };
export type AsDescribedSummary = { responses: number; visible: boolean; housing: Tally; meals: Tally; pay: Tally };
export function getAsDescribedSummary(db: DbOrTx, q: { orgId: string; listingId?: string }): Promise<AsDescribedSummary>;
export type Page<T> = { items: T[]; nextCursor: string | null };
export function listSeekerInvites(db: DbOrTx, seekerUserId: string, o?: { cursor?: string }): Promise<Page<SeekerInviteItem>>;
export function listSeekerInterviews(db: DbOrTx, seekerUserId: string, o?: { cursor?: string }): Promise<Page<SeekerInterviewItem>>;
export function listSeekerOffers(db: DbOrTx, seekerUserId: string, o?: { cursor?: string }): Promise<Page<SeekerOfferItem>>;
export function pendingInboxCount(db: DbOrTx, seekerUserId: string): Promise<number>; // open invites + interview invites + offers
export function getOrgHiringSummary(db: DbOrTx, orgId: string): Promise<{ applicants: number; hires: number; invitesSent: number; activeInterviews: number }>;
export const jobHandlers: HandlerMap;

// @/modules/messaging
export type ThreadCard = { type: 'application'|'invite'|'interview'|'offer'; refId: string };
export type ThreadEventCode = 'invite_interested'|'application_submitted'|'interview_scheduled'
  |'interview_canceled'|'interview_completed'|'interview_no_show'|'offer_accepted'|'offer_declined'
  |'offer_canceled'|'hired'|'withdrawn';
export function ensureThread(tx: Tx, i: { orgId: string; listingId: string; seekerUserId: string;
  applicationId?: string; inviteId?: string }): Promise<{ threadId: string; created: boolean }>;
export function postCard(tx: Tx, threadId: string, card: ThreadCard, senderUserId: string | null): Promise<string>;
export function postEvent(tx: Tx, threadId: string, e: { code: ThreadEventCode; visibleTo: 'all'|'host' }): Promise<string>;
export function sendHostMessage(tx: Tx, i: { threadId: string; senderUserId: string; body: string; bulkId?: string }): Promise<string>;
export function setThreadReadOnly(tx: Tx, threadId: string, reason: 'withdrawn'|'blocked'|'removed'): Promise<void>;
export function markThreadHired(tx: Tx, threadId: string): Promise<void>;
export function scanHostText(db: Db, i: { subjectType: 'message'|'invite'|'interview'|'offer';
  subjectId: string; text: string }): Promise<{ state: 'clear'|'warn'|'held'; checkId: string; labels: string[] }>;
export function unreadThreadCount(db: DbOrTx, userId: string): Promise<number>;
export type ReplyStats = { conversations: number; medianFirstReplyMinutes: number | null; usuallyRepliesWithinDay: boolean };
export function getReplyStats(db: DbOrTx, orgId: string): Promise<ReplyStats>;           // SP2 host page
export function getMessageForReview(db: DbOrTx, messageId: string): Promise<{ body: string; orgName: string; sentAt: Date } | null>;
export const jobHandlers: HandlerMap;

// @/modules/analytics
export type BoostWindow = { listingId: string; startsAt: Date; endsAt: Date };
export type BoostWindowsSource = (db: DbOrTx, q: { orgId: string; from: Date; to: Date; listingIds?: string[] }) => Promise<BoostWindow[]>;
export function registerBoostWindowsSource(fn: BoostWindowsSource): void;  // default source returns []; SP6 registers
export type AnalyticsRange = '7d'|'30d'|'90d'|'season'|'all';
export type Metric = { value: number; previous: number | null };
export type Slice = { key: string; label: string; value: number };
export type HostAnalytics = {
  tiles: Record<'views'|'saves'|'applications'|'interviews'|'hires'|'followers', Metric>;
  funnel: Slice[]; perListing: Slice[]; weekly: { week: string; views: number; applications: number }[];
  invites: Slice[]; boost: { listingId: string; before: number; during: number }[];
  asDescribed: AsDescribedSummary; sources: Slice[]; statuses: Slice[];
};
export function getHostAnalytics(db: DbOrTx, q: { orgId: string; range: AnalyticsRange;
  listingIds: string[] | 'all'; locationId?: string; tz: string; now?: Date }): Promise<HostAnalytics>;
```

**Foundation extensions SP5 makes.** All are additive and done by the Phase A agent (section 12).

| # | Module | Change |
|---|---|---|
| F1 | notifications | `markReadByData(db, userId, m: { types: string[]; key: string; value: string })`: marks matching in-app rows read, so batched emails skip messages already read in the app |
| F2 | notifications | `defineType` gains `email.attachments?: (d) => { filename: string; contentType: string; content: string }[]`. `EmailProvider.send` passes `attachments` to Resend and the stub. `EmailTemplateName` adds `'HiringUpdate'` |
| F3 | trust, settings | `RunCheckInput.kind` adds `'message_scam'`, with prompt `src/modules/trust/prompts/message_scam.ts` (`message_scam@1`, labels `payment_request`, `gift_card`, `bank_details`, `ssn_request`, `off_platform`, `other_scam`). `trust.thresholds` adds `message_scam: { approveBelow: 0.3, rejectAtOrAbove: 0.95 }` |
| F4 | media | Kind `attachment`: every file (image or PDF) also runs `MalwareScanner.scanFile`, and approved images go to `media-private`, never `media-public` |
| F5 | media | `getAuthorizedMediaUrl(db, storage, mediaId, variant?)`: a 300 s signed URL with no viewer check. Only the messaging attachment route and offer letters call it, after checking that the viewer is a participant |
| F6 | settings | New keys: `hiring.fit_enabled` (`true`), `hiring.fit_disabled_states` (`[]`). The weights are not a setting: they are the `FIT_WEIGHTS` code constant (product 11.2, "fixed platform defaults per category at launch") |
| F7 | src/server | `counts.ts` sets `inbox = messaging.unreadThreadCount + hiring.pendingInboxCount`. `job-handlers.ts` merges the three new modules. `schedules.ts` gets the lines in section 6 |

## 4. Data model

Foundation conventions apply: `app` schema, RLS on with no policies, UUIDv7 from `newId()`, integer cents plus `currency`, CHECK enums, `created_at`/`updated_at` with `app.set_updated_at()`. **Engineering decision:** foreign keys point only to Foundation tables (`app.users`, `app.organizations`, `app.media`) and to tables in the same module. References to SP2 listings, SP4 applications and other modules are indexed `uuid` columns, so each workstream's migration applies on its own. Files are `drizzle/4NNN_<module>.sql` (ranges in section 12).

**hiring**

| Table | Columns | Constraints and indexes |
|---|---|---|
| `pipeline_entries` (host read model of SP4 applications) | `application_id uuid pk`, `org_id`, `listing_id`, `location_id`, `seeker_user_id`, `status text`, `source text`, `applied_at`, `last_status_at`, `fit_score smallint null`, `fit_lines jsonb null`, `fit_weights_version text null`, `fit_computed_at`, `interview_state text null`, `offer_state text null`, `hired_source text null`, `hired_at`, `additional_step_done bool default false` | status CHECK = the 8 `ApplicationStatus` values; source CHECK in (`seek`,`swipe`,`map`,`invite`,`boost`,`landing`,`other`); hired_source CHECK in (`host`,`offer_accepted`); fit_score 0–100; idx `(org_id, listing_id, status)`, `(org_id, applied_at desc)`, `(org_id, fit_score desc nulls last)` |
| `pipeline_events` (history and analytics fact; insert only) | `id`, `org_id`, `listing_id`, `location_id`, `application_id null`, `invite_id null`, `kind text`, `source text null`, `actor_type text`, `actor_user_id null`, `occurred_at` | kind CHECK in (`applied`,`shortlisted`,`unshortlisted`,`interview_invited`,`interview_scheduled`,`interview_completed`,`interview_no_show`,`offered`,`offer_canceled`,`hired`,`not_selected`,`withdrawn`,`offer_declined`,`invite_sent`,`invite_interested`,`invite_not_interested`,`invite_applied`,`invite_expired`); actor_type CHECK in (`host`,`seeker`,`system`); idx `(org_id, occurred_at)`, `(listing_id, kind, occurred_at)`, `(application_id, occurred_at)` |
| `pending_passes` | `application_id uuid pk`, `org_id`, `actor_user_id fk users`, `commit_at timestamptz` | idx `(commit_at)` |
| `candidate_pool_runs` | `listing_id uuid pk`, `org_id`, `listing_revision_id`, `weights_version`, `candidate_count int`, `computed_at` | none |
| `candidate_pool_entries` | `id uuid pk` (the opaque `candidateId`), `listing_id`, `org_id`, `seeker_user_id`, `eligible bool`, `fit_score smallint null`, `fit_lines jsonb null`, `state char(2) null`, `available_from date null`, `skills_norm text[]`, `hidden_at`, `saved_at`, `computed_at` | unique `(listing_id, seeker_user_id)`; idx `(listing_id, eligible, fit_score desc nulls last)` |
| `invites` | `id`, `org_id`, `listing_id`, `seeker_user_id fk users`, `candidate_id`, `sent_by fk users`, `note text null`, `status text`, `decline_reason text null`, `scan_state text`, `check_id null`, `sent_at`, `expires_at`, `responded_at`, `expiring_reminded_at`, `thread_id null` | status CHECK in (`sent`,`interested`,`applied`,`not_interested`,`expired`); decline_reason CHECK in (`dates`,`location`,`pay`,`role`,`not_looking`,`other`); scan_state CHECK in (`pending`,`clear`,`warn`,`held`); `char_length(note) <= 300`; unique `(listing_id, seeker_user_id)`; idx `(seeker_user_id, sent_at)`, `(status, expires_at)` |
| `interviews` | `id`, `org_id`, `listing_id`, `application_id`, `thread_id`, `organizer_user_id fk users`, `status text`, `format text`, `video_url null`, `address null`, `phone_note null`, `note null`, `timezone text`, `duration_minutes smallint`, `expiry_hours smallint`, `round int default 1`, `sequence int default 0`, `expires_at`, `scheduled_slot_id null`, `scheduled_start null`, `scheduled_end null`, `requested_windows jsonb null`, `request_note null`, `outcome_by null`, `outcome_at null`, `scan_state text`, `check_id null` | status CHECK in (`invited`,`scheduled`,`reschedule_requested`,`declined`,`expired`,`canceled`,`completed`,`no_show`); format CHECK in (`video`,`phone`,`in_person`); duration CHECK in (15,30,45,60,90); expiry_hours CHECK in (48,72); scan_state as invites; unique partial `(application_id) where status in ('invited','scheduled','reschedule_requested')`; idx `(org_id, scheduled_start)`, `(status, expires_at)` |
| `interview_slots` | `id`, `interview_id fk interviews`, `round int`, `starts_at`, `ends_at` | unique `(interview_id, round, starts_at)` |
| `offers` | `id`, `org_id`, `listing_id`, `application_id`, `thread_id`, `created_by fk users`, `status text`, `position text`, `start_date date`, `pay_amount_cents int`, `pay_max_cents int null`, `pay_unit text`, `currency text default 'USD'`, `note null`, `letter_media_id fk media null`, `prior_status text`, `responded_at`, `scan_state text`, `check_id null` | status CHECK in (`sent`,`accepted`,`declined`,`canceled`); pay_unit CHECK in (`hour`,`day`,`week`,`month`,`season`,`year`,`crew_share`); `char_length(position) <= 120`; `char_length(note) <= 1000`; unique partial `(application_id) where status = 'sent'` |
| `as_described_responses` | `id`, `application_id unique`, `org_id`, `listing_id`, `seeker_user_id fk users null`, `eligible_via text`, `asks_housing bool`, `asks_meals bool`, `prompted_at null`, `expires_at null`, `worked_here bool null`, `housing text null`, `meals text null`, `pay text null`, `submitted_at null` | eligible_via CHECK in (`host_marked`,`offer_accepted`); answers CHECK in (`yes`,`partly`,`no`); idx `(org_id, submitted_at)`, `(listing_id, submitted_at)`, `(prompted_at) where prompted_at is null` |

**messaging**

| Table | Columns | Constraints and indexes |
|---|---|---|
| `threads` | `id`, `org_id fk organizations`, `listing_id`, `seeker_user_id fk users`, `application_id null`, `invite_id null`, `read_only_reason text null`, `listing_closed_at null`, `hired_at null`, `last_to_seeker_at null`, `last_to_host_at null`, `first_host_reply_at null` | read_only_reason CHECK in (`withdrawn`,`blocked`,`removed`); unique `(listing_id, seeker_user_id)`; unique partial `(application_id) where application_id is not null`; idx `(org_id, last_to_host_at desc)`, `(seeker_user_id, last_to_seeker_at desc)` |
| `messages` | `id`, `thread_id fk threads`, `sender_type text`, `sender_user_id fk users null`, `kind text`, `body text null`, `card_type text null`, `card_ref_id null`, `event_code text null`, `attachment_media_ids uuid[] default '{}'`, `visible_to text default 'all'`, `scan_state text default 'clear'`, `scan_labels text[] default '{}'`, `check_id null`, `client_id text null`, `bulk_id null` | sender_type CHECK in (`seeker`,`host`,`system`); kind CHECK in (`text`,`card`,`event`); visible_to CHECK in (`all`,`host`); scan_state CHECK in (`pending`,`clear`,`warn`,`held`,`removed`); `cardinality(attachment_media_ids) <= 5`; `char_length(body) <= 4000`; unique `(thread_id, sender_user_id, client_id)`; idx `(thread_id, created_at desc)`, `(scan_state) where scan_state = 'pending'` |
| `thread_reads` | `thread_id fk threads`, `user_id fk users`, `last_read_at` | pk `(thread_id, user_id)` |
| `saved_replies` | `id`, `org_id fk organizations`, `kind text`, `title text`, `body text`, `created_by`, `updated_by` | kind CHECK in (`reply`,`not_selected`); title ≤ 60, body ≤ 2000; unique partial `(org_id) where kind = 'not_selected'` |
| `bulk_messages` | `id`, `org_id`, `listing_id`, `created_by fk users`, `body`, `statuses text[]`, `recipient_count int`, `sent_count int default 0`, `scan_state text`, `check_id null` | idx `(org_id, created_at)` |
| `org_reply_stats` | `org_id pk fk organizations`, `conversations int`, `median_first_reply_minutes int null`, `computed_at` | none |

**analytics** owns no tables (migration range reserved for indexes only).

## 5. API

Everything uses `apiRoute`, zod v4 input, the Foundation error envelope and the Origin check. **H** = `requireHost({ roles: ['owner','admin','recruiter'] })` plus SP2's listing scope for every listing the request touches (out of scope gives 404). A request on one listing calls `orgs.canAccessListing(db, ctx, { id, locationId })`. A list query calls `orgs.getListingAccess(db, ctx)` once: `{ all: true }` adds no filter, and `{ all: false, listingIds, locationIds }` filters to `listing_id = any(listingIds) or location_id = any(locationIds)`, so a Recruiter scoped by location sees every listing at that location. `ctx` is the `HostContext` from `requireHost`. **S** = `requireSeeker()` plus ownership (not owned gives 404). **P** = `requireUser()` plus thread participation. Conflicts return 409 `conflict` with `details.reason`.

| Method | Path | Auth | Input | Output |
|---|---|---|---|---|
| GET | `/api/v1/host/home` | H | `tz` | `{ todayApplicants, todayInterviews: InterviewItem[], unreadThreads, openingsFilled: { listingId, title }[] }`, the data for SP5's three Home slots (section 7). Reminders and quota are SP2's and not in this response |
| GET | `/api/v1/host/applicants` | H | `listingId?`, `status?[]`, `sort: newest\|oldest\|fit\|activity` (default `newest`), `cursor?`, `limit ≤ 50` | `{ items: ApplicantCardData[], counts: Record<ApplicationStatus, number>, nextCursor }` |
| GET | `/api/v1/host/applicants/:applicationId` | H | none | `{ card, snapshot, fit: FitResult \| null, history, interview, offer, threadId, additionalStepDone }` |
| POST | `/api/v1/host/applicants/:applicationId/shortlist` | H | `{ on: boolean }` | `{ status }`; 409 `stale_status` |
| POST | `/api/v1/host/applicants/:applicationId/pass` | H | none | `{ undoUntil }` |
| POST | `/api/v1/host/applicants/:applicationId/pass/undo` | H | none | `{ status }`; 409 `undo_expired` |
| POST | `/api/v1/host/applicants/:applicationId/hire` | H | none | `{ status: 'hired' }` |
| POST | `/api/v1/host/applicants/:applicationId/interviews` | H | `InterviewProposal` (8.5) | `{ interview }`; 409 `interview_active` |
| POST | `/api/v1/host/applicants/:applicationId/offers` | H | `OfferInput` (8.6) | `{ offer }`; 409 `offer_open`, `letter_not_ready` |
| GET | `/api/v1/host/listings/:listingId/candidates` | H | `state?`, `availableBy?`, `skills?[] ≤ 5`, `view: all\|saved\|hidden`, `cursor?` | `{ items: PoolCardData[], nextCursor, creditsRemaining, fitAvailable }` |
| PUT / DELETE | `/api/v1/host/candidates/:candidateId/save` and `/hide` | H | none | `{ ok: true }` |
| POST | `/api/v1/host/invites` | H | `{ candidateId, note? ≤ 300 }` | `{ invite }`; 409 `seeker_unavailable`, `no_credits`, `already_invited`, `listing_inactive` |
| GET | `/api/v1/host/invites` | H | `listingId?`, `status?`, `cursor?` | `Page<HostInviteItem>` |
| GET | `/api/v1/host/interviews` | H | `from`, `to`, `listingId?`, `needsAction?` | `{ items: InterviewItem[] }` |
| POST | `/api/v1/host/interviews/:id/propose` | H | `{ slots, durationMinutes, timezone, expiryHours }` | `{ interview }` (new round) |
| POST | `/api/v1/host/interviews/:id/cancel` | H | `{ reason? ≤ 300 }` | `{ interview }` |
| POST | `/api/v1/host/interviews/:id/outcome` | H | `{ outcome: 'completed' \| 'no_show' }` | `{ interview }`; 409 `not_yet_passed` |
| POST | `/api/v1/host/offers/:id/cancel` | H | none | `{ offer }` |
| GET | `/api/v1/host/threads` | H | `listingId?`, `unread?`, `cursor?` | `Page<ThreadSummary>` |
| POST | `/api/v1/host/listings/:listingId/bulk-messages` | H | `{ statuses: ApplicationStatus[], body ≤ 4000 }` | `{ bulkId, recipients }`; 409 `too_many_recipients` |
| GET / POST | `/api/v1/host/saved-replies` | H | `{ title, body }` | `{ items }` / `{ reply }`; 409 `limit_reached` |
| PATCH / DELETE | `/api/v1/host/saved-replies/:id` | H | `{ title?, body? }` | `{ reply }` |
| GET / PUT | `/api/v1/host/not-selected-message` | H (PUT: owner, admin) | `{ body ≤ 2000 }` | `{ body, isDefault }` |
| GET | `/api/v1/host/analytics` | H | `range`, `listingId?`, `locationId?`, `tz` | `HostAnalytics` |
| GET | `/api/v1/host/analytics/export.csv` | H | same | `text/csv`: `card,label,value,previous_value` |
| GET | `/api/v1/me/invites` | S | `cursor?` | `Page<SeekerInviteItem>` |
| GET | `/api/v1/me/invites/:id` | S | none | `{ invite, jobCard }` |
| POST | `/api/v1/me/invites/:id/respond` | S | `{ response: 'interested' \| 'not_interested', reason? }` | `{ invite, threadId? }`; 409 `expired` |
| POST | `/api/v1/me/invites/:id/mute` | S | none | `{ invite }` |
| GET | `/api/v1/me/interviews` | S | `cursor?` | `Page<SeekerInterviewItem>` |
| POST | `/api/v1/me/interviews/:id/pick` | S | `{ slotId, round }` | `{ interview }`; 409 `slot_passed`, `round_changed` |
| POST | `/api/v1/me/interviews/:id/request-times` | S | `{ windows: { start, end }[] 1–3, note? ≤ 300 }` | `{ interview }` |
| POST | `/api/v1/me/interviews/:id/decline` | S | `{ alsoWithdraw: boolean }` | `{ interview, withdrawn }` |
| GET | `/api/v1/me/offers` | S | `cursor?` | `Page<SeekerOfferItem>` |
| POST | `/api/v1/me/offers/:id/accept` | S | none | `{ offer, applicationStatus: 'hired' }`; 409 `offer_closed` |
| POST | `/api/v1/me/offers/:id/decline` | S | none | `{ offer }` |
| GET | `/api/v1/me/threads` | S | `cursor?` | `Page<ThreadSummary>` |
| GET / POST | `/api/v1/me/as-described/:id` | S | `{ workedHere?, housing?, meals?, pay }` | prompt / `{ ok: true }`; 409 `closed` |
| GET | `/api/v1/threads/:id` | P | `before?` | `{ thread, messages: MessageView[], nextBefore, readOnly, canSend }` |
| POST | `/api/v1/threads/:id/messages` | P | `{ clientId, body? ≤ 4000, attachmentMediaIds? ≤ 5 }` | `{ message }`; 409 `read_only`, `attachment_not_ready` |
| POST | `/api/v1/threads/:id/read` | P | none | `{ ok: true }` |
| GET | `/api/v1/threads/:id/attachments/:mediaId` | P | `variant?` | 302 to a 300 s signed URL (F5) |
| GET | `/api/v1/interviews/:id/ics` | P | none | `text/calendar` |

Rate limits (Foundation `consume`): `messages:<userId>` 60 per 10 min; `bulk:<orgId>` 5 per hour; `invites:<orgId>` 100 per hour; `interviews:<userId>` 30 per hour; `export:<userId>` 20 per hour. **Engineering decision.**

## 6. Jobs, notifications, trust and audit

**Outbox topics** (registered in each module's `jobHandlers`)

| Topic | Enqueued by | What it does |
|---|---|---|
| `hiring.application_submitted` | SP4, in the submit transaction, dedupe `happ:<applicationId>` | Payload `{ applicationId, listingId, orgId, seekerUserId, submittedAt, source }`. Inserts `pipeline_entries`, writes `pipeline_events.applied`, computes fit, marks any invite `applied`, and calls `ensureThread` and `postCard('application')`. It sends no host notification: SP4 already sends `applications.new_applicant` to the listing's notify members in the submit transaction (SP4 E4) |
| `hiring.application_withdrawn` | SP4, in the withdraw transaction, dedupe `hwd:<applicationId>` | Mirrors the status, cancels the active interview (`.ics` CANCEL) and any `sent` offer, deletes a pending pass, posts event `withdrawn`, and calls `setThreadReadOnly('withdrawn')` |
| `hiring.commit_pass` | Pass, `availableAt = commit_at`, dedupe `pass:<applicationId>:<commitAtMs>` | If the pending pass still exists: `applications.setStatus(... 'not_selected')`, cancels the active interview and offer, and sends the org's "Not selected" message through `sendHostMessage` |
| `hiring.interview_reminder` | On scheduling, at start − 24 h and start − 1 h, dedupe `ivr:<id>:<sequence>:<24h\|1h>` | Sends only if the status is still `scheduled` and `sequence` matches |
| `hiring.scan_note` | Invite, interview or offer with a note | `scanHostText`, then releases the item (posts the card and notifies) or holds it |
| `messaging.scan` | Host text message in a thread not yet hired | `scanHostText`, then releases: `warn` shows the banner, `held` is never shown |
| `messaging.bulk_send` | Bulk message | One `scanHostText` on the template, then one message per recipient thread |

**Schedules** (appended to `src/server/schedules.ts`, UTC)

| Topic | Cron | What it does |
|---|---|---|
| `hiring.sweep` | `*/5 * * * *` | Expires invites past `expires_at` or on a listing whose status isn't `active`; sends invite expiring reminders; expires interviews past `expires_at`; auto-completes interviews 48 h after `scheduled_end`; sends outcome-due nudges; reassigns interviews whose organizer has left the org |
| `hiring.fit_refresh` | `0 8 * * *` | Recomputes fit for non-terminal pipeline entries on active listings |
| `hiring.as_described_due` | `0 15 * * *` | Prompts eligible hires whose due date has passed; closes prompts open for 60 days |
| `messaging.daily` | `30 8 * * *` | Stamps `listing_closed_at` from SP2 and recomputes `org_reply_stats` |

**Notification types** (`defineType`). None is mandatory. Immediate emails use the `HiringUpdate` template; batched ones use Foundation's `Digest`, whose items link with a "Reply in app" button.

| Type | Category | Recipient | Channels | Batching |
|---|---|---|---|---|
| `messages.new` | messages | the other side | in-app, push, email | email key `messages`, 15 min |
| `hiring.invite_received` | applications | seeker | in-app, push, email | none |
| `hiring.invite_expiring` | applications | seeker | in-app, email | none |
| `hiring.invite_response` | applications | sender | in-app, push, email | email key `invites`, 60 min |
| `hiring.interview_invited` | applications | seeker | in-app, push, email | none |
| `hiring.interview_scheduled` | applications | seeker, organizer | in-app, push, email + `.ics` REQUEST | none |
| `hiring.interview_times_requested` | applications | organizer | in-app, push, email | none |
| `hiring.interview_declined` | applications | organizer | in-app, push, email | none |
| `hiring.interview_canceled` | applications | the other side | in-app, push, email + `.ics` CANCEL | none |
| `hiring.interview_expired` | applications | organizer | in-app | none |
| `hiring.interview_reminder_24h` | applications | seeker, organizer | in-app, push, email + `.ics` | none |
| `hiring.interview_reminder_1h` | applications | seeker, organizer | in-app, push | none |
| `hiring.interview_outcome_due` | applications | organizer | in-app | none |
| `hiring.offer_received` | applications | seeker | in-app, push, email | none |
| `hiring.offer_response` | applications | creator and notify list | in-app, push, email | none |
| `hiring.marked_hired` | applications | seeker | in-app, push, email | none |
| `hiring.as_described_prompt` | applications | seeker | in-app, push, email | none |

The host recipients are the listing's notify list (from SP2) who are still members (`orgs.listMembers`). If that list is empty, the Owner and Admins. **Engineering decision**, the same rule SP4 uses for `applications.new_applicant`. SP5 defines no new-applicant type; that one notification is SP4's. Notification data is IDs plus the org name, position and first name only; message bodies never go into push, email or logs.

**Trust.** Kind `message_scam` (F3) runs through `runCheck`. `needs_review` opens a `moderation` item through Foundation and the text is shown with the banner. `rejected` holds it. Three held texts from one org within 24 h open a `fraud` item with `subjectType: 'organization'` and reason `repeated_scam_text`. SP5 calls `registerSubjectHandlers` for `message`, `thread`, `invite`, `interview` and `offer`. For `message`, `invite`, `interview` and `offer`, `approve` sets `scan_state = 'clear'` and releases a held item, and `remove` sets `removed` (messages) or `held` and hides it from the seeker. For `thread`, `approve` leaves the thread as it is, and `remove` calls `setThreadReadOnly(tx, threadId, 'removed')`.

**Report subjects.** SP4's `registerReportSubject` returns `bad_request` for any type not registered, so SP5's module init calls `safety.registerReportSubject('message', { trustSubjectType: 'message', exists })` and `safety.registerReportSubject('thread', { trustSubjectType: 'thread', exists })`. `exists(db, id)` is true when the thread exists, or when the message exists and isn't `removed`. A report then reaches the trust handlers above. The Report buttons on threads, messages and the `ScamBanner` post to SP4's Report endpoint with these types.

**Audit actions** (`audit.record`, in the domain transaction): `hiring.status_changed`, `hiring.pass_scheduled`, `hiring.pass_undone`, `hiring.pass_committed`, `hiring.marked_hired`, `hiring.invite_sent`, `hiring.invite_responded`, `hiring.interview_proposed`, `hiring.interview_scheduled`, `hiring.interview_canceled`, `hiring.interview_outcome`, `hiring.offer_sent`, `hiring.offer_canceled`, `hiring.offer_responded`, `messaging.bulk_sent`, `messaging.saved_reply_changed`, `messaging.not_selected_changed`, `messaging.text_held`, `analytics.exported`. Individual messages are not audited (they are their own record).

## 7. Screens

Every screen uses only `src/ui` components. New shared pieces go in `src/ui/patterns/`, take plain props and are added to the `/design-system` gallery: `PipelineBoard`, `CandidateDeck`, `ThreadList`, `MessageBubble`, `ThreadCard` (application, invite, interview, offer and event variants), `Composer`, `ScamBanner`, `SlotPicker`, `OffsiteLinkDialog`, `FitSheet`, `AnalyticsCard`. Loading uses `Skeleton`; errors use `ErrorState` (icon plus text, with Retry); empty uses `EmptyState`.

**Host Home.** SP2 owns the `/host` route file and its page (slot, seat and credit tiles, reminders, the setup checklist). SP2 defines the named slot touchpoint `src/app/host/(home)/slots.ts` with the slots `applicantsToday`, `interviewsToday` and `unreadMessages`. SP5 only fills those three slots, each with a `StatTile` from one `GET /api/v1/host/home` call: today's applicants (empty copy "No new applicants today", plus "All openings filled" with a link to Close for each listing in `openingsFilled`), today's interviews, and unread messages. SP5 adds no route, tile or data to the rest of that page.

| Route | Components | Empty / error copy | Mobile / desktop |
|---|---|---|---|
| `/host/applicants` | `Tabs` (Pipeline, Deck, List), listing `Select`, status `Chip`s, `CandidateCard`, `PipelineBoard`, `CandidateDeck`, `Toast` with Undo | "No applicants yet. Share your listing or invite candidates." | Pipeline becomes status `Tabs` on a phone; desktop shows columns New, Shortlisted, Interviewing, Offered, Hired plus a Closed filter |
| `/host/applicants/[applicationId]` | `Sheet` (side panel on desktop), Resume pop-up (frozen application copy), `FitSheet`, screening answers, Additional step tick, history | ErrorState "This application isn't available" | Full screen / side panel |
| `/host/candidates?listingId=` | listing `Select`, filters (state `Select`, available-by `Input`, skills `Combobox`), `CandidateCard` (pool mode), invite `Sheet` (`JobCard` preview, `Textarea` with a 300 counter, credits left) | "No candidates match these filters"; with 0 credits, Invite is disabled with "You're out of invite credits" and a link to Promote | Grid of 1 / 3 columns |
| `/host/interviews` | `Tabs` (Upcoming, Needs action, Past), `Card` rows, proposal `Sheet` with `SlotPicker` (1–5 rows), duration `Select`, format `SegmentedControl`, link or address `Input`, note `Textarea`, expiry `SegmentedControl` 48 / 72 (default 72), timezone `Select` | "No interviews scheduled" | List / list with a detail panel |
| `/host/messages`, `/host/messages/[threadId]` | `ThreadList`, `MessageBubble`, `ThreadCard`, `Composer` (attachments, saved-reply picker), overflow menu with Report, Block and (seeker side) Withdraw | "No conversations yet. Threads start when someone applies or answers Interested." | List then thread / two panes |
| `/host/messages/replies` | saved replies list (20 max), the "Not selected" message editor, fill-in `Chip`s | "No saved replies yet" | Same |
| `/host/analytics` | range `SegmentedControl` (7 days, 30 days, 90 days, This season, All time), listing and location `Select`, CSV `Button`, `StatTile` ×6, `AnalyticsCard` with `BarChart`, `StackedBar` or `DonutChart` and a Chart / Table switch | "No data for this period" per card | Cards stack / two-column grid |
| `/inbox` (seeker) | `Tabs` Messages, Invites, Interviews; `ThreadList`; invite rows with `OrgLogo` | "No messages yet", "No invites yet", "No interviews yet" | Top bar Inbox / desktop top bar |
| `/inbox/invites/[inviteId]` | `Sheet` with `JobCard`, the note, `Button`s Interested, Not interested (reason `Chip`s), Mute host | "This invite expired" | Bottom sheet / side panel |
| `/inbox/[threadId]` | thread as above, `ScamBanner`, interview card (Pick a time, Request new times, Decline then a `Dialog` "Also withdraw your application?"), offer card (Accept, Decline with a confirm `Dialog`) | "This conversation is read-only" when closed | Full screen / two panes |
| `/as-described/[id]` | "I worked here" `Checkbox` (offer-accepted hires only), `Radio` groups Yes / Partly / No for housing, meals and pay | "This check has closed" | One column |

Host navigation follows product 15.2. Phone tabs are Home, Applicants, Messages, Listings and More, with Candidates, Interviews and Analytics under More. The Deck view maps gestures the same way as Swipe: left Pass, right Shortlist, up opens the interview sheet (never sends). The ←, → and ↑ keys and the buttons do the same. Drag-and-drop between pipeline columns is not built; card buttons move applicants. **Engineering decision.** Links in messages open `OffsiteLinkDialog` (shows the domain, then opens a new tab with `rel="noopener noreferrer"`).

## 8. Business rules

### 8.1 Pipeline (SP4 owns the status values; SP5 owns the host transitions)

| From | To | Trigger | Notes |
|---|---|---|---|
| new | shortlisted | Shortlist | Never shown to the seeker as its own status. **Engineering decision** (SP4's My jobs shows it as Applied) |
| shortlisted | new | Remove from shortlist | **Engineering decision** |
| new, shortlisted | interviewing | Interview invite sent | |
| new, shortlisted, interviewing | offered | Offer sent | Stores `prior_status` |
| offered | `prior_status` | Host cancels the offer | **Engineering decision** |
| offered | hired | Seeker accepts | `hired_source = 'offer_accepted'` |
| offered | offer_declined | Seeker declines | Terminal |
| new, shortlisted, interviewing | hired | Mark hired | `hired_source = 'host'`. **Engineering decision**, for offline hires |
| new, shortlisted, interviewing, offered | not_selected | Pass | Commits after the 10 s undo. Cancels the active interview and open offer |
| any non-terminal | withdrawn | Seeker (SP4) | Handled by `hiring.application_withdrawn` |

- Terminal: hired, not_selected, withdrawn, offer_declined. Every transition calls SP4's `applications.setStatus(tx, { from, to })` (compare-and-set) and updates `pipeline_entries` and `pipeline_events` in the same transaction. A stale `from` returns 409 `stale_status`; the first commit wins, and withdrawn is never overwritten.
- **Pass:** writes `pending_passes` with `commit_at = now + 10 s` and returns `undoUntil`. Undo is accepted while `now < commit_at`. The commit runs at the first worker run after `commit_at`. The message is the org's `not_selected` saved reply, or the default: "Hi {first_name}, thank you for applying for {position} at {org_name}. We've decided to move forward with other candidates for this role. We wish you the best with your search." (**Engineering decision**, draft copy; open item 7)
- Fit never changes a status. No code path in `hiring/fit/` takes a `Tx` (enforced by an architecture test).
- No automatic close when hires reach the listing's openings. SP5's `applicantsToday` Home slot shows "All openings filled" with a link to Close. **Engineering decision.**

### 8.2 Candidate pools

- **Who appears:** SP4's `profiles.queryPoolCandidates(db, { listing, limit: 500 })` applies product 9.4 (visible, availability stated, a category or occupation, work authorization fits) and SP4's block rule for the org. SP5 passes SP4's `PoolListing`, built by `toPoolListing` from SP2's hiring info: `{ listingId: id, orgId, categories: [category, secondCategory]` without nulls, `occupationCode: occupation, sponsorsVisa: sponsorship !== 'none' }`. `FitListing` is never passed to SP4. SP5 also leaves out applicants to this listing and seekers who blocked or muted the org. Seekers already invited stay in the pool with their invite status in place of the Invite button.
- **Refresh (Engineering decision):** opening the tab refreshes the pool synchronously when `candidate_pool_runs` is older than 6 hours or the listing's published revision changed. The refresh takes up to 500 candidates from SP4, scores them, and upserts entries by `(listing_id, seeker_user_id)`, keeping `hidden_at` and `saved_at`. Seekers no longer returned get `eligible = false` and their cached `state`, `available_from` and `skills_norm` cleared. An advisory lock per listing stops double refreshes.
- **Live privacy check:** each page of results is rendered through SP4's `profiles.getCandidateCards(db, { orgId: ctx.orgId, seekerUserIds, stage: 'pool' })`, which drops anyone no longer eligible or blocked either way with that org. Every `getCandidateCards` call in SP5 (pool and `interested`) passes `orgId: ctx.orgId`. Turning off "Visible to hosts" removes a seeker from the next page load.
- **Sort:** fit descending, then `available_from` ascending, then `id`. With fit unavailable: `available_from`, then `id`.
- **Pool cards** show the seeker's profile cover (product 4, Cover slot "Seeker's profile cover"; SP4 `PoolCard.coverMediaId`), the first name and last initial, general location, availability as a real date, skills, fit, and the photo only if the seeker allowed it. With no cover, the card shows the neutral placeholder.

### 8.3 Fit score

Score = `round(100 × Σ(weight × value) / Σ weight)` over the factors that apply. A factor whose data is missing on either side is left out and the remaining weights are rescaled. **Engineering decision.** Each value is between 0 and 1. The weight used is the listing's primary category. `weightsVersion` = `fit_weights@` plus the first 8 hex digits of the SHA-256 of the `FIT_WEIGHTS` JSON.

**Inputs.** `computeFit` reads only SP4's `FitInputs` (from `profiles.getFitInputs`, imported from `@/modules/profiles`). Any unit conversion happens inside `computeFit`. The allowlist, which E3 pins to the type's keys, is `seekerUserId`, `categories`, `occupationCodes`, `availabilityDate`, `skillKeys`, `certifications` (`key`, `expiresOn`), `workAuthorization`, `minPay`, `willingToRelocate`, `preferredStates`, `region` and `countryCode`. `seekerUserId` only joins inputs to candidates; no factor reads it. `region` and `countryCode` are read only by the Remote location rule below. This allowlist is what goes to counsel for open item 2.

| Factor | Value | Template line (examples) |
|---|---|---|
| occupation | 1 if the listing's `occupation` is in `occupationCodes`; 0.6 if the listing's category or second category is in `categories`; else 0 | "Interested in Lift operator" / "Interested in Seasonal jobs" / "Hasn't listed this occupation" |
| availability | `availabilityDate` against the listing dates. Fixed dates: 1 if available by the start, else the share of the dates left. Ongoing: `max(0, 1 − daysLate / 90)`. A null `availabilityDate` leaves the factor out | "Available for your full dates" / "Available from Jun 12, 9 days after your start" |
| skills | the listing's `skillKeys` found in the seeker's `skillKeys` ÷ the listing's `skillKeys` (both SP2 `normalizeSkill().key`) | "8 of 10 listed skills" |
| certifications | the listing's `requiredCertificationKeys` found in `certifications[].key` with `expiresOn` null or on or after the start ÷ required | "Lists 2 of 3 required certifications" (always "lists", never "has" or "verified") |
| work_authorization | By `workAuthorization.status`: `authorized` 1; `has_visa` with `endsOn` on or after the end date 1, earlier 0.5; `needs_sponsorship` 1 when the listing's `sponsorship` is in `visaTypes`, else 0 | "Authorized to work in the US (self-reported)" / "Needs H-2A sponsorship, which you offer" |
| pay | The seeker's `minPay` is converted to cents per hour with SP3's `normalizePay` rules and the listing's `weeklyHours` W: `hour` ×1, `day` ÷8, `year` ÷52÷W. The value is 1 if the listing's `maxPayHourlyCents` meets it, 0.5 within 10% below, else 0 | "Pay meets their expectations" / "Pay is below their stated minimum" (amounts are never shown) |
| location | On-site: 1 if `willingToRelocate` or the listing's `state` is in `preferredStates`, else 0.3. The seeker's own state is never read for on-site listings. Remote: 1 if the seeker's state (`region`, read only when `countryCode = 'US'`) is among the listing's states the worker may live in (any US state for `all_us`), else 0 | "Willing to relocate" / "Prefers jobs in Montana" / "Lives in a state you hire from" (Remote only) |

- **The seeker's state on Remote listings (Engineering decision, pending open item 2):** product 11.2's input list names only "willingness to relocate or state preference". The Remote rule reads `region` solely as work-location eligibility against the listing's "States the worker may live in" field (product 3). On-site scoring uses only willingness to relocate and preferred states. SP8 lists this Remote use in the fit-score notice and the counsel packet. If counsel or the founder drops it, the Remote rule switches to the on-site rule and E3 changes with it.

**Default weights** (percent). These are fixed platform defaults per category at launch (product 11.2). They live in the `FIT_WEIGHTS` code constant, with no setting and no operator editing. Changing them is a code change after founder approval, which also changes `weightsVersion`. Founder review is open item 1.

| Factor | Maritime | Seasonal | Farm | Remote |
|---|---|---|---|---|
| occupation | 20 | 20 | 20 | 25 |
| availability | 20 | 30 | 30 | 15 |
| skills | 15 | 15 | 20 | 25 |
| certifications | 20 | 5 | 5 | 5 |
| work_authorization | 10 | 10 | 10 | 10 |
| pay | 5 | 10 | 5 | 10 |
| location | 10 | 10 | 10 | 10 |

- The "Why a good fit" pop-up lists each line with its weight ("Availability · 30%"). Inputs are only SP4's `FitInputs`; protected traits, photo, name, age and gender aren't in the type and can't be read. An architecture test fails if `hiring/` declares its own `FitInputs` type.
- **Legal switches (Engineering decision, for the product 11.2 legal check):** `hiring.fit_enabled = false` turns fit off everywhere; `hiring.fit_disabled_states` turns it off for listings located in those states. When off, no score is computed or stored, the Fit chip reads "—", and the pop-up says "Fit scores aren't available for this listing".
- Applicants sort by Newest by default; Fit is an optional sort. Pools rank by fit (product 11.3). **Engineering decision**, to keep fit a ranking aid rather than the default lens on applicants.

### 8.4 Invites

| Rule | Value |
|---|---|
| Cost | 1 credit from the org's shared pool, in the invite transaction: `entitlements.consume(tx, { orgId, kind: 'invite_credit', quantity: 1, subjectType: 'invite', subjectId: inviteId, idempotencyKey: 'invite:' + inviteId, actor: { type: 'user', id: senderUserId } })`, with `inviteId` from `newId()` before the call. `{ ok: false, reason: 'insufficient' }` maps to 409 `no_credits`. `creditsRemaining` (candidates API, invite `Sheet`) reads `entitlements.getBalance(db, orgId, 'invite_credit').balance` |
| Note | Optional, up to 300 characters |
| Per listing | One invite per seeker per listing (unique index) |
| Weekly cap | `limits.invites_per_seeker_per_week` (10), counted over a rolling 7 days across all hosts. Held invites don't count. **Engineering decision:** rolling window |
| Over the cap, ineligible, blocked or muted | 409 `seeker_unavailable`: "Not accepting invites right now". No credit is used |
| Order in the transaction | Advisory lock on the seeker → cap → live eligibility (SP4) and relationship (SP4 safety) → listing active → consume credit (409 `no_credits` "You're out of invite credits") → insert |
| Expiry | 14 days after sending, or sooner if the listing stops being active. Reads treat `expires_at < now` as Expired before the sweep runs |
| Expiring reminder | 48 hours before expiry. **Engineering decision** |
| Seeker responses | Interested: opens the thread (`ensureThread`), lets the host see the seeker at stage `interested` (SP4), and prompts "Apply now" (link with `source=invite`). Not interested: optional reason chip, which the host sees. Mute host: calls SP4 `safety.mute`, and the host sees Not interested |
| Applied | Any later application by that seeker to that listing sets the invite to `applied` |
| Host-visible statuses | Sent / Interested / Applied / Not interested / Expired, plus "Not delivered" for a held note. No "viewed" receipt |

### 8.5 Interviews

| Rule | Value |
|---|---|
| Proposal (`InterviewProposal`) | 1–5 slots, each at least 1 hour ahead and at most 90 days ahead, not overlapping; `durationMinutes` 15/30/45/60/90 (default 30); `timezone` (default the listing location's); format `video` (https `videoUrl` required), `phone` (`phoneNote` up to 200; by default the host calls the number on the application) or `in_person` (`address` up to 300 required); `note` up to 500; `expiryHours` 48 or 72, default 72. **Engineering decision:** the limits other than slots and expiry |
| Expiry | `expires_at = least(sent + expiryHours, latest slot start)`. A passed slot can't be picked (409 `slot_passed`) |
| Seeker | Pick a time → `scheduled`. Request new times: 1–3 windows, each at least 30 minutes and within 60 days, plus a note up to 300 → `reschedule_requested` (no expiry; shown under Needs action). Decline → `declined`, with "Also withdraw your application?", where Yes calls SP4 `applications.withdraw` |
| Rescheduling | The host proposes a new round (`round + 1`, status `invited`); the seeker requests new times. Either one sends a `.ics` CANCEL for the old time, and `sequence` goes up on every change |
| After the time | The host marks Completed or No-show once `now ≥ scheduled_end`. Unmarked after 48 hours, it becomes Completed |
| One active | At most one interview per application in `invited`, `scheduled` or `reschedule_requested`; later rounds are allowed |
| `.ics` | RFC 5545 with `UID:interview-<id>@<APP_URL host>`, `SEQUENCE`, UTC `DTSTART`/`DTEND`, `SUMMARY: Interview: <position> at <org>`, `LOCATION` (address, link or "Phone"), `DESCRIPTION` with the thread URL, `ORGANIZER` set to `EMAIL_FROM`. No attendee emails |
| Reminders | 24 h and 1 h before. The 24 h one is skipped when the interview is booked less than 24 h ahead |
| Visibility | Pipeline chips show the state. No-show events are posted with `visible_to = 'host'`; the seeker API shows both Completed and No-show as "Past" |
| Member leaves | The sweep moves interviews to the org's longest-standing Admin, or the Owner (product 2) |

### 8.6 Offers

`OfferInput = { position ≤ 120 (default: listing title), startDate (today or later), pay: { amountCents, maxCents?, unit }, note? ≤ 1000, letterMediaId? }`. **Engineering decision:** the note limit. The letter is a PDF of media kind `attachment` that must be `approved` when sent (409 `letter_not_ready`). One `sent` offer per application. No expiry. Accept, decline and host cancel are compare-and-set on `status = 'sent'`, so the first one wins and the other gets 409 `offer_closed`. Closing the listing doesn't affect interviews or offers.

### 8.7 Messaging

| Rule | Value |
|---|---|
| Thread | One per `(listing, seeker)`. Created only by an application (`hiring.application_submitted`) or an Interested response. No cold messages |
| Host access | Owner, Admin and Recruiters whose scope includes the listing. Billing never. The seeker sees the org name and the sender's first name, never their role |
| Body | Up to 4,000 characters. **Engineering decision** |
| Attachments | PDF, JPG, PNG, HEIC; up to 10 MB each and 5 per message; media kind `attachment`. Every file must be `approved` before Send (409 `attachment_not_ready`); the composer shows "Scanning…" per file |
| Scam scan | Host-authored texts in a thread that isn't hired (messages, invite notes, interview and offer notes, bulk templates, the Not selected message) start as `pending`, invisible to the seeker. `scanHostText` releases them as `clear`, or as `warn` with `ScamBanner`, or keeps them `held`. A classifier error gives `warn`, never `clear`. The host sees "Sending…", then Sent or "Not delivered". Seeker messages and post-hire messages aren't scanned. **Engineering decision:** scanning only host-authored, pre-hire text |
| Banner | Title "Never pay to get a job", body "Explore&Earn employers never ask for money, gift cards, or bank or Social Security details before hiring." (body is an **Engineering decision**), with Report and Block buttons |
| Saved replies | Up to 20 per org (`kind = 'reply'`), title up to 60 and body up to 2,000 characters; fill-ins `{first_name}`, `{position}`, `{org_name}`, `{my_first_name}` |
| Bulk | One listing's applicants, filtered by status; withdrawn and read-only threads are always skipped; up to 200 recipients per send. **Engineering decision:** the 200 cap |
| Read-only | 90 days after the listing closes; immediately when the application is withdrawn, either side blocks, or an operator decides `remove` on a reported thread (`removed`). **Engineering decision:** withdrawal, block and removal make it read-only |
| Unread | A thread is unread for the seeker while `last_to_seeker_at > last_read_at`, and for each host member while `last_to_host_at > last_read_at`. Opening a thread calls F1 so the 15-minute email skips it |
| Reply stats | Conversations are threads created by an application in the last 180 days. A reply is the first host message, interview, offer or Not selected message. Unanswered threads older than 7 days count as 7 days; ones younger than 24 h are left out. Shown after 10+ conversations. "Usually replies within a day" when the median is 24 hours or less. **Engineering decision:** the window and the median |

### 8.8 As described and analytics

- **Eligible:** a hire with `hired_source = 'host'`, or `'offer_accepted'` plus a "Yes, I worked here" on the form. A row is created at hire. **Due:** the day after the listing's end date; with no end date, the offer start date (or hire date) plus 90 days. The prompt stays open for 60 days. **Engineering decision:** due date for ongoing jobs and the 60-day window. Housing and meals are asked only when the listing provided them. Answers are final and never shown individually to the host.
- **Shown:** on the host page when org responses ≥ 5. In analytics per listing when that listing has ≥ 3 responses ("Shown after 3 responses, to protect workers' privacy"). **Engineering decision:** the analytics threshold.
- **Analytics:** tiles compare with the previous period of equal length; "This season" is the current meteorological season (Mar–May, Jun–Aug, Sep–Nov, Dec–Feb) against the previous one; "All time" has no comparison. Views and saves come from SP3, followers from SP2 (`hostpages.countFollowersAt`), everything else from `pipeline_events` and `pipeline_entries`. Applicant sources are Seek, Swipe, Map, Invites, Boost, Landing pages, plus Other (host page or direct link; **Engineering decision**). The boost chart compares views during each boost window with the same number of days before it, and shows "No boosts in this period" until SP6 registers a source. Responses never contain viewer, saver or seeker identities.

**Failure handling**

| Failure | What happens |
|---|---|
| AI down or invalid JSON | `runCheck` returns `needs_review` (`classifier_error`); the text goes out with the banner and a review item opens. Nothing is silently cleared |
| Worker stalled | Pending texts stay "Sending…"; reads still treat expired invites and interviews as expired; reminders run late, and the sequence check drops stale ones |
| Email or push failure | Retried by the outbox; the in-app row and the thread are what count |
| SP4 event arrives twice | Dedupe keys plus upserts keyed by `application_id` make the handlers idempotent |
| Host acts on an application the seeker just withdrew | `setStatus` compare-and-set fails, SP5 returns 409 `stale_status` and refreshes the mirror |
| Credit ledger unavailable | The invite transaction fails as a whole (500); no invite and no charge |

## 9. Integrations and environment variables

| Service | Use in SP5 |
|---|---|
| Anthropic (`claude-haiku-5-5`) | `message_scam` checks, through Foundation `classify` and `runCheck` |
| Resend | `HiringUpdate` and `Digest` emails, `.ics` attachments (F2) |
| Web Push | All push types above |
| Supabase Storage, Cloudmersive, PhotoDNA | Attachments and offer letters through the Foundation media pipeline (F4, F5) |
| PostHog | `track` events with IDs only: `hiring.invite_sent`, `hiring.interview_scheduled`, `hiring.offer_sent`, `hiring.hired`, `messaging.thread_opened` |

**SP5 adds no new environment variables or secrets.** It uses these existing Foundation variables, all kept in Doppler project `explore-and-earn` (configs `dev`, `stg`, `prd`, mapping to `APP_ENV` `dev`, `preview`, `prod`) and synced to Vercel and GitHub Actions: `APP_ENV`, `APP_URL`, `ADMIN_HOST`, `DATABASE_URL`, `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_WEBHOOK_SECRET`, `STORAGE_PROVIDER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER`, `ANTHROPIC_API_KEY`, `CHILD_SAFETY_PROVIDER`, `PHOTODNA_KEY`, `MALWARE_PROVIDER`, `CLOUDMERSIVE_API_KEY`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `JOBS_SECRET`, `UNSUBSCRIBE_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`. Tests use the stub providers and `CHILD_SAFETY_STUB_HASHES`.

## 10. Security and privacy

| Actor | Can | Cannot |
|---|---|---|
| Owner, Admin | All SP5 host features for the active org; edit the "Not selected" message | See any seeker who isn't an applicant, pool candidate or Interested invitee |
| Recruiter | Pipeline, pools, invites, interviews, offers, threads, saved replies and analytics for listings in scope | Anything on other listings (404, so existence isn't disclosed) |
| Billing | Nothing in SP5 (403; nav items hidden) | Applicants, candidates, messages, analytics |
| Seeker | Their own invites, interviews, offers, threads and As-described prompts | Other seekers' data; host-only events (no-show) |
| Operator | A message, invite, interview or offer under review, through the review item preview (`getMessageForReview`) | Browse threads |

- **Staged reveal:** pool cards come only from SP4 stage `pool`; full name, contact details and the full resume only after an application (the frozen snapshot) or Interested (stage `interested`, for that org). The `candidateId` is the per-listing pool entry ID, not the seeker's user ID.
- **Private preferences:** the fit explanation never shows the seeker's minimum pay or preferred states beyond the matching state.
- **Attachments and letters:** private bucket; served only through `/api/v1/threads/:id/attachments/:mediaId` after a participant check, as a 300 s signed URL.
- **Logs and analytics:** never message bodies, notes, names or contact details. Analytics is aggregate-only, and the As-described thresholds stop single answers being singled out.
- **Blocks and mutes** (SP4 safety) are checked on every invite, thread send and pool load.
- **Privacy hooks (SP8):** SP5 registers an exporter (the seeker's invites, interviews, offers, threads with their own messages, As-described answers) and an eraser. On seeker deletion the eraser deletes invites and pool entries; replaces the seeker's message bodies with "[deleted]" and removes their attachments; sets `as_described_responses.seeker_user_id` to null (the counts stay); and keeps the host's pipeline rows with the name shown as "Deleted user", under the retention policy.
- **CSRF and abuse:** Foundation Origin check, the rate limits in section 5, and idempotency through `clientId` and unique indexes.

## 11. Testing

Unit and domain tests run on PGlite (`createTestDb`) with stub providers. Concurrency tests run as `*.int.test.ts` against the CI Postgres container. The e2e test runs against `pnpm db:local` with SP2, SP3 and SP4 fixtures.

**The 5 failure modes most likely to hurt real users**

| # | Failure | Test |
|---|---|---|
| 1 | **Credit double-spend or cap bypass:** two hosts invite one seeker at 9 of 10 at the same moment, or one host double-clicks | Integration: concurrent invites. Exactly one succeeds; the other gets `seeker_unavailable`; exactly one credit is used. A double-click gives `already_invited` and one credit |
| 2 | **The seeker withdraws while the host acts** (pass, offer, hire) | Integration: concurrent withdraw and `hire`. Withdrawn wins or hired wins, never both; on withdraw the interview is canceled with a `.ics` CANCEL, the offer is canceled, the pending pass is dropped (no message) and the thread is read-only |
| 3 | **A scam text reaches a seeker unwarned** | `classify` throws → `warn` with banner, never `clear`; `__block__` → never in the seeker's thread API, no notification row; a pending text is invisible to the seeker until released |
| 4 | **Wrong or stale interview time:** a passed slot, a re-proposed round, DST, a stale reminder | Picking a passed slot → `slot_passed`; an old round → `round_changed`; a slot across the March DST change round-trips in `.ics` as the right UTC; a reminder queued before a reschedule sends nothing |
| 5 | **Pool privacy leak** | The pool API response schema has no `fullName`, `email`, `phone` or `resumeUrl`; the photo is null when not allowed; a seeker who turns visibility off is missing on the next request; blocked and muted seekers are left out; Billing gets 403 |

**Other key tests:** pass undo timing (E2); the batched message email skipped after an in-app read (E6); fit fixtures per category and the `FitInputs` allowlist (E3); a recruiter outside scope gets 404 and a location-scoped recruiter reaches that location's listings (E9); one submitted application gives each notify member exactly one new-applicant notification (SP4's); reports on a `message` and a `thread` are accepted, and a `remove` decision on a thread makes it read-only; the `.ics` golden file; the 15-minute batch and a 1 h reminder with a fake clock; the 21st saved reply gives `limit_reached`; bulk to 201 recipients gives `too_many_recipients`; As-described thresholds 4 → hidden, 5 → shown (E7); analytics period comparison and CSV columns (E8); member removal reassigns interviews; reading SP4 events twice applies once.

## 12. Parallel workstreams

| Range | Owner |
|---|---|
| 4000–4099 | Phase A |
| 4100–4199 | W1 pipeline (`pipeline_entries`, `pipeline_events`, `pending_passes`) |
| 4200–4299 | W2 fit and pools |
| 4300–4399 | W3 invites |
| 4400–4499 | W4 interviews and offers |
| 4500–4599 | W5 messaging |
| 4600–4699 | W6 As described and analytics indexes |

| Phase | Workstreams | Depends on |
|---|---|---|
| **A** (one agent) | The three module skeletons with typed stubs for every contract in section 3; Foundation extensions F1–F7; notification type and settings registrations; SP2, SP3 and SP4 test fakes for every consumed interface | Foundation merged; SP2 and SP4 merged, or their interfaces stubbed |
| **B1** (parallel) | **W1** pipeline core: SP4 event handlers, transitions, pass and undo, mark hired, applicants API · **W2** fit engine (pure), weights, pool refresh, candidates API · **W5** messaging: threads, messages, attachments, `scanHostText`, reads, saved replies, bulk, reply stats, counts | A |
| **B2** (parallel) | **W3** invites: credits, cap, expiry, seeker invite API · **W4** interviews and offers: state machines, `.ics`, reminders, cards · **W6** As described and analytics, CSV, the boost hook | W3: W2 and W5. W4: W1 and W5. W6: W1 |
| **B3** | **W7** screens and `src/ui/patterns` (patterns and the gallery can start in B1 against the Phase A stubs) | the APIs it renders |
| **C** | **W8** integration: the E1 journey, the authz matrix, the design-gallery update | everything above |

**Ownership rule:** each workstream owns its module folder files and its migration range. Shared touchpoints (`schedules.ts`, `job-handlers.ts`, `counts.ts`, the settings registry, notification types) are created in Phase A and only appended to afterwards.

**Interfaces SP5 consumes from other sub-projects.** Phase A builds a fake for each one. Open item 3 confirms the names.

| From | Interface |
|---|---|
| SP2 (exported today) | `orgs.getListingAccess(db, ctx: HostContext)` → `{ all: true } \| { all: false; listingIds; locationIds }` and `orgs.canAccessListing(db, ctx, { id, locationId })` (section 5, **H**); `orgs.listMembers(db, orgId)` (notify recipients, Owner and Admin fallback, interview reassignment); `entitlements.consume(tx, { orgId, kind: 'invite_credit', quantity: 1, subjectType: 'invite', subjectId, idempotencyKey, actor })` → `{ ok: true; consumptionId; remaining } \| { ok: false; reason: 'insufficient'; remaining }` and `entitlements.getBalance(db, orgId, 'invite_credit')` → `{ balance, resetsAt }` (8.4); `listings.normalizeSkill`; trust subject handlers for `organization` |
| SP2 (requested; not yet in SP2 §3, open item 3) | `listings.getHiringInfoMany(db, ids)` → `ListingHiringInfo[]`, built from each listing's live revision's typed columns: `{ id, orgId, locationId, title, status, category, secondCategory, occupation, startDate, endDate, when, skills, requiredCertifications, sponsorship, state, remoteStates, timezone, pay, housingProvided, mealsProvided, publishedRevisionId, closedAt, notifyMemberIds, openings }`, where `when` is the `ListingContent['when']` block (dates and `weeklyHours`); `listings.listForOrg(db, orgId, { status })`; `hostpages.countFollowersAt(db, orgId, at)` (the followers tile); the `/host` Home slot touchpoint `src/app/host/(home)/slots.ts` with `applicantsToday`, `interviewsToday` and `unreadMessages` (section 7). SP5 reads no reminders or quota, so it needs no `getHomeSummary` |
| SP3 | `discovery.getListingEventCounts(db, { orgId, listingIds, from, to, types: ('view'\|'save')[], bucket: 'day'\|'week'\|'none' })`; `discovery.toHourlyCents({ pay, when })` (SP3 takes `Pick<ListingContent, 'pay' \| 'when'>` because it needs the weekly hours), fed from `getHiringInfoMany`; SP3's `normalizePay` unit rules for the seeker's `minPay` (8.3); `discovery.getJobCards(db, listingIds)` → `JobCard` props; the apply-source values in 4 |
| SP4 | Topics `hiring.application_submitted` and `hiring.application_withdrawn` with the payloads in section 6; `applications.new_applicant`, which SP4 sends and SP5 doesn't duplicate; `applications.setStatus(tx, { applicationId, from: ApplicationStatus[], to, actor })` → `{ ok: true } \| { ok: false; current }`; `applications.withdraw(tx, { applicationId, seekerUserId })`; `applications.getHostCards(db, { orgId, applicationIds })`; `applications.getSnapshot(db, { orgId, applicationId })`; the types `FitInputs` and `PoolListing` from `@/modules/profiles` (SP4 owns them; SP5 doesn't redeclare them); `profiles.getFitInputs(db, seekerUserIds)` → `FitInputs[]`; `profiles.queryPoolCandidates(db, { listing: PoolListing, limit: 500, after? })` → `{ items: PoolCard[]; next }`; `profiles.getCandidateCards(db, { orgId, seekerUserIds, stage: 'pool' \| 'interested' })`; `profiles.grantReveal` on Interested; `safety.getRelationships(db, { orgId, seekerUserIds })` → `{ blocked, muted }[]`; `safety.mute(db, { userId, orgId })`; `safety.registerReportSubject` (section 6, SP5 registers `message` and `thread`); the Report and Block endpoints |
| SP6 | `analytics.registerBoostWindowsSource(fn)` (SP6 calls SP5's hook); invite packs granted through SP2's ledger |
| SP8 | The exporter and eraser registry SP5 registers with |

## 13. Open items

| # | Item | Owner | Decide before |
|---|---|---|---|
| 1 | Approve the default fit weights in 8.3 (product open item). They ship as the fixed `FIT_WEIGHTS` constant; any later change is a code change the founder approves | Founder (engineering proposes) | W2 merges |
| 2 | Legal check on the fit score (NYC automated employment decision tool law, Colorado AI Act): whether to disable it in any state through `hiring.fit_disabled_states`, and the notice wording. The counsel packet SP8 writes carries the input allowlist in 8.3, including the Remote-only use of the seeker's state as work-location eligibility; the founder and counsel keep or drop that use | Founder and counsel | Launch gate |
| 3 | Confirm the exact SP2, SP3 and SP4 interface names and payloads in section 12, including SP4 enqueuing the two `hiring.*` topics and exposing `setStatus`. SP2 adds the requested `getHiringInfoMany` (with `when`), `listForOrg`, `hostpages.countFollowersAt` and the Home slot touchpoint to its section 3 | SP2, SP3 and SP4 spec owners | SP5 Phase A |
| 4 | Foundation extensions F1–F7 accepted by the Foundation owner (all additive) | Engineering | SP5 Phase A |
| 5 | SP4's My jobs shows `shortlisted` as Applied, and No-show as "Past" | SP4 spec owner | SP4 build |
| 6 | Host Home composition. **Closed:** SP2 owns the `/host` route file and defines the slot touchpoint `src/app/host/(home)/slots.ts` (`applicantsToday`, `interviewsToday`, `unreadMessages`). SP5 only fills those slots, from `GET /api/v1/host/home` (section 7) | SP2 and SP5 | Closed |
| 7 | Final "Not selected" default copy and the scam banner body (drafts in 8.1 and 8.7) | Founder | W7 ships |
| 8 | Retention period for threads and messages after a seeker deletes their account | Founder and counsel (through SP8) | SP8 |
