# Host Hiring (Sub-project 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A host takes a listing from candidate pool to hire (pipeline, fit score, invites, interviews, offers, messaging, the As-described check and analytics), and a seeker answers invites, interviews and offers from one Inbox.

**Architecture:** Three new modules inside the Foundation modular monolith, `hiring`, `messaging` and `analytics`, import one way: analytics → hiring → messaging. Phase A (W0) lands every SP5 table, every cross-workstream contract as a typed stub, the Foundation and SP2 touchpoints, every route file and the test fakes. It also builds for real the few pieces every workstream calls: the pipeline transition core, listing scope and team resolution, and the note-scan dispatch. Five domain workstreams then build in parallel worktrees, two screen workstreams follow, and an integration phase proves the spec section 1 exit criteria across real modules.

**Tech Stack:** The Foundation stack (Next.js 16.4, React 19, TypeScript 6.0, Drizzle 0.45 on postgres.js and PGlite, zod 4, Vitest 5, Playwright 1.64 with `@axe-core/playwright` and `@clerk/testing`, Clerk 7, Resend with React Email, `@anthropic-ai/sdk`). SP5 adds no dependency: `.ics` files are written by hand to RFC 5545, and time zones use `Intl`.

**Spec:** `docs/superpowers/specs/2026-11-03-sp5-host-hiring-design.md` (the "spec" below). Its parents are `2026-11-03-explore-earn-product-design.md` (sections 4, 11, 12, 14, 15.2, 17) and `2026-11-03-foundation-design.md`. Read the spec before your task; the plan cites spec sections rather than copying their tables, and wherever it says "as spec 8.4", the spec's values are binding.

**Binding upstream contracts.** The SP2, SP3 and SP4 plans of the same date fix the names this plan calls: `docs/superpowers/plans/2026-11-03-sp2-host-supply-billing.md`, `...-sp3-discovery.md` and `...-sp4-seeker.md`. Where the SP5 spec and an upstream plan disagree, the upstream plan wins and the difference is listed under Plan decisions.

**Prerequisites and "code wins".** Foundation is merged (B1, B2 and B3, with the design gate approved before Phase B2). SP2 is merged, because Task 3 adds functions to its `listings` and `hostpages` modules. SP3 W0 and SP4 W0 are merged at least, so `src/lib/{discovery,applications,profiles,taxonomy}`, `src/server/event-subscribers.ts`, `src/server/module-registrations.ts`, `tests/helpers/sp2.ts` and `tests/helpers/sp4.ts` exist. SP4 is fully merged before Phase B2 (its `_features` components) and Phase C. Known differences from the Foundation plan, which the code wins: `createTestDb()` is in `tests/helpers/db.ts`; raw SQL goes through `queryRows(db, sql)`; integration tests open Postgres with `createDb(url)`; `OrgRole` and `CurrentUser` come from `@/modules/identity`; `HostContext` and the guards come from `src/server/guards.ts`; `apiRoute({ auth: 'host' })` calls `requireHost()` with no roles, so routes check roles with SP2's `orgs.requireCapability`; route tests mock `@/lib/db` and `@/server/guards` with SP4's `tests/helpers/sp4.ts` (`useRouteDb`, `mockDbModule`, `guardMocks`, `request`, `call`, `asHost`, `asSeeker`, `asUser`). If merged upstream code names something differently from its plan, use the code's name and keep this plan's behavior.

## Global Constraints

- **Package manager and platform:** pnpm on Windows with no Docker. Unit and domain tests run on PGlite (`pnpm test <path>`). `*.int.test.ts` files run only in CI's `integration` job against Postgres; locally, run `pnpm typecheck` on them. E2E tests run on `pnpm db:local` with every provider set to `stub` and `STORAGE_PROVIDER=local`.
- **Secrets:** SP5 adds no environment variables and no secrets (spec section 9). Real values live only in Doppler project `explore-and-earn`, config `prd`. No SP5 test needs a real key; never copy one into a file, a test or a commit.
- **Domain and mail:** `exploreandearn.com`. Resend is verified for `send.exploreandearn.com`; `EMAIL_FROM` is an address on that domain, and `.ics` files name it as `ORGANIZER`.
- **Seekers are 18 or older** (Foundation onboarding). SP5 never asks for or stores an age.
- **Tables:** every table lives in `app`, has RLS enabled with no policies, uses a UUIDv7 `id` from `newId()` unless the spec gives another key, and has `created_at` and `updated_at` with `app.set_updated_at()`. Money is integer cents with `currency text not null default 'USD'`. Enumerations are CHECK constraints. Foreign keys point only to `app.users`, `app.organizations`, `app.media` and tables of the same module (spec section 4); listing, application and location references are indexed `uuid` columns.
- **Migrations:** files are `drizzle/NNNN_<name>.sql`. W0 writes all SP5 DDL in `4000_hiring.sql` and `4050_messaging.sql` (Plan decision 2). Follow-up ranges: W1 4100–4199, W2 4200–4399, W3 4400–4499, W4 4500–4599, W5 4600–4699, W8 4900–4999.
- **Imports:** `analytics` → `hiring` → `messaging`. `messaging` never imports `hiring` or `analytics`; `hiring` never imports `analytics` (an architecture test in Task 6 enforces both). Each may import Foundation modules and SP2, SP3 and SP4 modules. A route file may compose any modules. Foundation's rules hold: a module is imported only through `@/modules/<name>`; `src/ui/**` imports no module, not even types; `drizzle-orm` only in `src/modules/**`, `src/lib/db.ts`, `src/lib/migrate.ts` and tests. Client-safe code in `src/lib/{hiring,messaging,host-analytics}` never value-imports `@/modules/*`, `@/lib/db` or `drizzle-orm` (`import type` is allowed). `@/lib/analytics` is Foundation's server-side PostHog file (`track`, `flushAnalytics`, `POSTHOG_HOST`), so SP5's client-safe analytics contracts live in `src/lib/host-analytics/` and are imported as `@/lib/host-analytics` (Plan decision 24).
- **Fit isolation:** no file under `src/modules/hiring/fit/` mentions `Tx`, `DbOrTx`, `withTx`, `.transaction(`, `.insert(`, `.update(` or `.delete(`, and no file under `src/modules/hiring/` declares a `FitInputs` type (Task 6 architecture test). `FitInputs`, `PoolListing`, `PoolCard` and `CandidateCard` come from SP4 (`@/modules/profiles` in modules, `@/lib/profiles` in client-safe code).
- **Ownership:** each workstream owns its files, its migration range and its route handlers, and touches shared files only through W0's touchpoints. W0 already wires every SP5 topic, schedule, subscriber, schema export, registration import, notification type and route file, so B1 and B2 workstreams never edit `src/server/{job-handlers,schedules,counts,event-subscribers,module-registrations,sp2-wiring}.ts`, `src/db/schema.ts`, the openapi.json route, `package.json` or a module `index.ts`.
- **Authorization** (spec section 5):
  - **H** (every `/api/v1/host/**` route): `auth: 'host'`, then `requireHiringCapability(ctx, cap)`: `applicants.access` for pipeline, pools, interviews, offers and analytics; `invites.send` for invites; `messages.access` for threads, saved replies, the Not selected message and bulk messages. Billing gets 403 `role_not_allowed`. Every listing, application, candidate, invite, interview and offer ID is checked against `ctx.orgId` and the member's listing scope; anything outside gives 404 `not_found`. `PUT /host/not-selected-message` also requires role `owner` or `admin`.
  - **S** (`/api/v1/me/**`): `auth: 'seeker'`; anything not owned by the seeker gives 404.
  - **P** (`/api/v1/threads/**`, `/interviews/:id/ics`, `/offers/:id/letter`): `auth: 'user'`, then `threadViewer(user)` (Task 7) and a participation check; a non-participant gets 404.
- **Errors:** the Foundation envelope. Conflicts are 409 `conflict` with the machine reason in `details.reason` (`stale_status`, `undo_expired`, `interview_active`, `offer_open`, `letter_not_ready`, `seeker_unavailable`, `no_credits`, `already_invited`, `listing_inactive`, `expired`, `already_responded`, `slot_passed`, `round_changed`, `not_yet_passed`, `offer_closed`, `read_only`, `attachment_not_ready`, `too_many_recipients`, `limit_reached`, `closed`). Validation failures are 400 `bad_request`, with `details.reason` where a task names one.
- **Transactions and conflicts:** a service that hits a stale compare-and-set refreshes the mirror inside its transaction, commits, and only then throws `conflict(..., { reason: 'stale_status', current })`, so the refresh persists (spec section 8 failure handling). Callers run `kickWorker()` after any commit that enqueued a job.
- **AI:** `claude-haiku-5-5` through `runCheck` with kind `message_scam`, only. Host text is data inside `<submitted_text>` tags. A classifier failure is `warn`, never `clear`. Implementers who touch a prompt load the `claude-api` skill first.
- **What never leaves the database:** message bodies, notes, names and contact details never go into logs, audit `data`, PostHog events, push payloads or email subjects and bodies. Notification `data` holds only IDs, `orgName`, `position`, `firstName`, `audience`, `url` and the ICS fields `sequence` and `icsMethod` (spec section 6). PostHog events are exactly `hiring.invite_sent`, `hiring.interview_scheduled`, `hiring.offer_sent`, `hiring.hired` and `messaging.thread_opened`, with IDs only.
- **Text limits count code points** (`[...s].length`), matching Postgres `char_length` (Review Focus 4). Strings are trimmed; control characters other than `\n` and `\t` are rejected.
- **Registrations at module load:** trust subject handlers, report subjects, host page providers, the listing stats provider and `defineType` calls run when a module's `index.ts` is imported. `src/server/module-registrations.ts` (SP4's touchpoint) imports all three SP5 modules, and every page or route that calls an SP5 module imports `@/server/module-registrations` first.
- **Time:** instants are stored and sent as UTC ISO strings. An interview's slots are shown in its own `timezone`; "today" for host Home is the local day in the `tz` the client sends. Cron expressions run in UTC.
- **Copy:** the name is written exactly **Explore&Earn**. No emoji in the interface. Strings in quotes in the spec and in this plan are exact; other labels are plain and warm and address the reader as "you". Certifications are "self-reported" or "lists", never "verified".
- **Accessibility:** text contrast ≥ 4.5:1, UI elements ≥ 3:1, touch targets ≥ 44 px, `prefers-reduced-motion` respected, real `<button>` and `<a>` elements, an `aria-label` on every icon-only control. Every list screen has an `EmptyState`, a `Skeleton` while loading and an `ErrorState` with Retry. Each e2e file runs `AxeBuilder` with 0 serious or critical violations at 390 px and 1280 px.
- **Commits:** end every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **A host in Alaska or Hawaii opens Home late in their evening.** At 23:30 in Anchorage it is already the next day in UTC. Expected: "today's applicants" and "today's interviews" use the host's local day from `tz`, so an application at 01:00 local yesterday is not counted and one at 01:00 local today is. Pinned in Task 5 (`localDayRange`) and Task 11 (Home).
2. **A message or note containing `javascript:alert(1)`, a `data:` URL, a trailing-punctuation URL or a look-alike Unicode domain.** Expected: only explicit `http://` and `https://` URLs become links, trailing punctuation is not part of the link, and the off-site dialog shows the punycode host (`xn--bcher-kva.example`), never the display text. Pinned in Task 5 (`findLinks`, `displayHost`) and Task 33 (`MessageBubble`, `OffsiteLinkDialog`).
3. **An attachment or offer letter whose media ID belongs to someone else.** A user who guesses another person's approved `attachment` media ID must not be able to attach it and then read it through the thread's signed-URL route. Expected: 409 `attachment_not_ready` (messages) or 409 `letter_not_ready` (offers) unless the sender owns the media (the seeker as `owner_user_id`, the host's org as `owner_org_id`). Pinned in Task 22 and Task 19.
4. **Text full of emoji or other characters outside the Basic Multilingual Plane.** JavaScript's `.length` counts UTF-16 units and Postgres `char_length` counts code points, so a mismatch turns a valid 4,000-character message into a 400 or a CHECK violation into a 500. Expected: every limit counts code points in zod and in SQL: 4,000 emoji are accepted, 4,001 are refused with 400. Pinned in Task 4 (CHECK) and Task 5 (schemas).
5. **A listing title or location name that starts with `=`, `+`, `-` or `@` in the analytics CSV.** Spreadsheet apps run such cells as formulas. Expected: those cells are prefixed with `'`, and any field with a comma, quote or line break is quoted per RFC 4180. Pinned in Task 28.

## Plan decisions

The spec leaves these choices open, or an upstream plan differs from it. Each task applies the decision; reviewers check it here.

1. **Workstream names.** Phases and workstreams follow the SP2 plan: Phase A is W0, Phase B1 holds W1–W5, Phase B2 holds W6–W7, Phase C is W8. They map to spec section 12 as: W1 = spec W1 (pipeline, plus host Home and hiring privacy); W2 = spec W2 + W3 (fit, pools, invites), merged because invites start from pool entries and the build machine runs at most five worktrees; W3 = spec W4; W4 = spec W5 (messaging); W5 = spec W6; W6 + W7 = spec W7; W8 = spec W8.
2. **W0 writes every SP5 table** (`4000_hiring.sql`, `4050_messaging.sql`), not each workstream. Every hiring area writes `pipeline_entries` and `pipeline_events`, and several read another area's table (Home reads interviews; the pending Inbox count reads invites, interviews and offers), so a worktree must have them all. SP3's and SP4's plans made the same call. The spec's per-area ranges remain for follow-up migrations.
3. **SP4 events arrive through SP2's `emit`.** SP4's plan emits `application.submitted`, `application.withdrawn` and `application.additional_step_changed` through `src/server/event-subscribers.ts`; SP5 appends `hiring.application_submitted`, `hiring.application_withdrawn` and `hiring.additional_step_changed`. Handlers read the payload with `readEnvelope`, and dedupe keys are `<eventId>:<topic>` (from `emit`), not the spec's `happ:` and `hwd:` keys. SP5 also appends `hiring.member_removed` to SP2's `org.member_removed` ("SP5 moves threads and interviews", SP2 section 3).
4. **Offer cancel returns the application to `interviewing`.** SP4's binding `TRANSITIONS` (its spec 8.5) let a host move `offered` only to `interviewing`, `hired` or `not_selected`. The spec's "back to `prior_status`" would be refused by `setStatus`, so cancel always goes to `interviewing`; `offers.prior_status` is still stored and shown in history. If the founder wants `prior_status`, SP4's table gains `offered → new, shortlisted`.
5. **SP5 owns the `/host` Home route.** SP2's spec (section 2 and the section 7 Home row) and plan (its sibling-request list) leave the screen to SP5. SP5 replaces Foundation's placeholder `src/app/host/page.tsx` and renders SP2's `getHomeSummary` (reminders, quota, setup checklist) beside SP5's three tiles. There is no `slots.ts` touchpoint, because no other sub-project fills it.
6. **SP2 additions SP5 makes itself** (SP2's plan lists them as requests it doesn't provide): `listings.getHiringInfoMany`, `listings.listForOrg` and `hostpages.countFollowersAt` (Task 3). `src/server/sp2-wiring.ts` gains `import '@/server/module-registrations'`, so SP2's `/hosts/[slug]` page has SP5's `reply_time` and `as_described` providers on a cold server.
7. **Listing scope resolves to listing IDs.** `listingScope(db, ctx)` turns SP2's `getListingAccess` into one list of listing IDs, adding every listing whose live `locationId` is in the member's `locationIds` (from `listForOrg`). Tables with no `location_id` (invites, interviews, offers, threads) filter the same way, and a listing that moved is scoped by where it is now.
8. **Dynamic segment names follow SP2.** SP2 serves `src/app/api/v1/host/listings/[id]/…`, and Next.js forbids two names at one level, so SP5's candidates and bulk-message routes live under `host/listings/[id]/` and read `id` as the listing ID. Public paths are unchanged.
9. **`scanHostText` takes `orgId`.** The repeated-scam rule ("three held texts from one org within 24 h") needs the org, and notes live in hiring tables messaging can't read. Each held text records audit `messaging.text_held` with `orgId`, and the rule counts those through `searchAudit({ orgId, action, from })`. A held text also opens a `moderation` item (reason `message_scam_held`), so an operator can release a false positive through `approve`.
10. **Email attachments are built at send time.** F2's `attachments` is `(d, db) => Promise<EmailAttachment[]>`, so the `.ics` reads the interview when the email goes out. A notification whose `data.sequence` no longer matches the interview sends without an attachment. A reschedule's `CANCEL` rides on the notification to the other side; the side that made the change gets a fresh file from the interview card's "Add to calendar" link (`GET /interviews/:id/ics`).
11. **Blocks are detected when messaging touches a thread.** SP4 emits no block event, so messaging calls `safety.getRelationships` when it loads, lists or sends to a thread, and stamps `read_only_reason = 'blocked'` the first time it sees a block. The stamp stays after an unblock. "Sends" includes every host path (spec section 10, "checked on every … thread send"): `sendMessage`, `sendHostMessage` (which carries Pass's Not selected message and every bulk recipient) and `createBulkMessage`. `sendHostMessage` therefore returns `Promise<string | null>` rather than spec 3's `Promise<string>`: null, with nothing inserted and nothing notified, when the thread is read-only or the seeker and the org are blocked either way.
12. **Thread cards are hydrated by the route.** `messaging.getThread` returns card references; `GET /api/v1/threads/:id` adds `cards: Record<refId, CardPayload>` from `hiring.getCardPayloads`, because messaging can't import hiring.
13. **`FitListing` adds `occupationLabel`** (for "Interested in Lift operator"); the fit text templates are fixed in Task 12. Remote listings count as "located in" every state they hire from: fit is off when `remoteStates` is `'all_us'` or contains a state in `hiring.fit_disabled_states`.
14. **Only `sent` invites expire.** An Interested invite has been answered and its thread is open.
15. **`interviews.outcome_nudged_at`** (added to the 4000 DDL) makes the outcome-due nudge go out once.
16. **Additions beyond spec section 5:** `GET /api/v1/offers/:id/letter` (P), because spec 10 serves letters only after a participant check and the attachment route only covers message attachments; `GET /api/v1/host/invites/:id/candidate` (H), the only consumer of SP4's `interested` stage (spec 8.4 "lets the host see the seeker at stage `interested`", spec 8.2 "Every `getCandidateCards` call in SP5 (pool and `interested`)"), rendered with SP4's `CandidateProfileView`; `hiring.getNoteForReview`, the console preview for held invite, interview and offer notes (spec section 10 operator row).
17. **Hiring areas call each other through named files.** W0's core and job handlers import area functions by name (`closeOpenItems`, `openAsDescribed`, the sweep steps, the note loaders and releasers, `interviewIcsAttachments`); their W0 stubs are no-ops or return neutral values, so a worktree never fails on a sibling's stub. Tests that need a sibling's behavior mock its file path, for example `vi.mock('@/modules/hiring/interviews/close')`.
18. **A held invite keeps its credit spent.** The credit was consumed in the send transaction; an operator's `approve` delivers the invite without a second charge.
19. **As-described with "All listings" selected** shows the org-wide summary at the host page threshold of 5; one selected listing uses the threshold of 3 (spec 8.8).
20. **`pendingInboxCount`** counts the seeker's delivered `sent` invites that haven't expired, delivered interviews in `invited`, and delivered offers in `sent`. "Delivered" means `scan_state` is `clear` or `warn`, for all three. A `pending` or `held` invite, interview or offer is hidden from the seeker everywhere (spec section 6 trust row, spec 8.7 "invisible to the seeker"): seeker lists and detail reads, thread card payloads, this count, the offer letter, and seeker actions, which answer 404.
21. **Answering an invite twice:** repeating the recorded answer returns it unchanged; a different answer is 409 `already_responded`.
22. **`additional_step_done`** is kept current by `hiring.additional_step_changed`, so pipeline lists need no SP4 call.
23. **Hires per listing** are registered with SP2's `registerListingStatsProvider('hiring', …)` as `{ hires }`, so SP2's listing rows show them.
24. **The client-safe analytics folder is `src/lib/host-analytics/`.** Foundation already has `src/lib/analytics.ts` (server PostHog) and `src/lib/analytics-client.tsx`. TypeScript and the Next bundler resolve `@/lib/analytics` to that file before a folder's `index.ts`, so a `src/lib/analytics/` barrel could never be reached. `@/modules/analytics` re-exports `@/lib/host-analytics`.
25. **Route params go through the input schema.** Foundation's `ApiContext` has no `params`: `apiRoute` merges dynamic segments into the raw input and validates them with the route's `input` schema, and zod's default strip drops any key the schema doesn't name. Each route under a dynamic segment therefore validates `body.safeExtend(param.shape)` (zod 4's `safeExtend` is the documented way to extend a refined object and keeps its refinements, such as `sendMessageSchema`'s "body or attachments" and `offerInputSchema`'s `maxCents` rule; `param.extend(body.shape)` would silently drop them), or the param schema alone when there is no body or query. Service input types stay `z.infer` of the body-only schemas, and the handler passes the ID as its own argument.
26. **A bulk template is its own trust subject, `bulk_message`.** Its ID is a `bulk_messages` ID, so a `message` subject would point at nothing and an operator could never release a falsely held bulk send. `scanHostText`'s `subjectType` adds `'bulk_message'`; messaging registers trust handlers for it (`approve` on a held bulk delivers it through `runBulkSend`; `remove` keeps it held), and `getMessageForReview` takes `o?: { subjectType?: 'message' | 'bulk_message' }` for the console preview. `bulk_messages` gains `thread_ids` (added to the 4050 DDL), because messaging can't recompute recipients from hiring's pipeline when an operator releases a bulk.
27. **Media metadata comes from `getMediaMeta`** (Task 2). Hiring and messaging never read `app.media`, and neither SP4's `getMedia` nor SP2's `getMediaInfo` returns a MIME type. `app.media` stores no file name, so `MessageView.attachments` carries `{ mediaId, mime }` and screens label each file "PDF" or "Photo" (`ATTACHMENT_LABELS`).
28. **"Propose new times" in a thread links to the Interviews screen.** W6 and W7 run in parallel, and the proposal sheet and `SlotPicker` are W6's. W7's host thread card links to `/host/interviews?propose=<interviewId>`, and W6's Interviews page opens its new-round proposal sheet for that interview, so W7 imports no W6 file.

## File Structure

| Workstream | Creates (owns) | Modifies (touchpoints) |
|---|---|---|
| **W0** contracts | `drizzle/4000_hiring.sql`, `drizzle/4050_messaging.sql`; `src/lib/hiring/{types,schemas,constants,copy,time,index}.ts`; `src/lib/messaging/{types,schemas,constants,copy,template,links,index}.ts`; `src/lib/host-analytics/{types,schemas,index}.ts`; `src/modules/hiring/{index,schema,notification-types,access,core,notes,jobs}.ts`, `src/modules/hiring/fit/weights.ts`; `src/modules/messaging/{index,schema,notification-types,access,jobs}.ts`; `src/modules/analytics/{index,boost,privacy}.ts`; every other module file in the Task 6 stub map (as stubs); `src/modules/listings/hiring-info.ts`; `src/modules/hostpages/followers-at.ts`; `src/modules/trust/prompts/message_scam.ts`; `src/modules/media/{authorized-url,meta}.ts`; `src/modules/notifications/email/templates/HiringUpdate.tsx`; `src/server/thread-viewer.ts`; every route file in Task 7 (as stubs); `tests/fakes/sp5/*`, `tests/helpers/sp5.ts`, `tests/sp5/*` | `src/modules/notifications/{index,types,notify}.ts`, `email/send.ts`, `email/templates/Digest.tsx`; `src/modules/trust/{types,checks}.ts`; `src/modules/settings/registry.ts`; `src/modules/media/{scan,index}.ts`; `src/modules/listings/index.ts` and `src/modules/hostpages/index.ts` (one export line each); `src/server/{job-handlers,schedules,counts,event-subscribers,module-registrations,sp2-wiring}.ts`; `src/server/privacy-registry.ts` (if present); `src/db/schema.ts`; `src/app/api/v1/openapi.json/route.ts` |
| **W1** pipeline | `src/modules/hiring/pipeline/*`, `src/modules/hiring/privacy.ts`, `drizzle/41xx`; handlers of `host/home`, `host/applicants`, `host/applicants/[applicationId]` and its `shortlist`, `pass`, `pass/undo`, `hire` routes | — |
| **W2** fit, pools, invites | `src/modules/hiring/fit/{compute,lines,listing,score}.ts`, `src/modules/hiring/fit-store.ts`, `src/modules/hiring/pools/*`, `src/modules/hiring/invites/*`, `drizzle/42xx–43xx`; handlers of `host/listings/[id]/candidates`, `host/candidates/**`, `host/invites`, `host/invites/[id]/candidate`, `me/invites/**` | — |
| **W3** interviews, offers | `src/modules/hiring/interviews/*`, `src/modules/hiring/offers/*`, `src/modules/hiring/{cards,inbox}.ts`, `drizzle/44xx`; handlers of `host/applicants/[applicationId]/{interviews,offers}`, `host/interviews/**`, `host/offers/**`, `me/interviews/**`, `me/offers/**`, `interviews/**`, `offers/**` | — |
| **W4** messaging | `src/modules/messaging/*` except W0's files, `drizzle/45xx`; handlers of `host/threads`, `host/listings/[id]/bulk-messages`, `host/saved-replies/**`, `host/not-selected-message`, `me/threads`, `threads/**` | — |
| **W5** As described, analytics | `src/modules/hiring/as-described/*`, `src/modules/analytics/{ranges,host,csv}.ts`, `drizzle/46xx`; handlers of `host/analytics/**`, `me/as-described/**` | — |
| **W6** host screens | `src/ui/patterns/{PipelineBoard,CandidateDeck,FitSheet,SlotPicker,AnalyticsCard}.tsx` and tests; `src/app/design-system/patterns/{pipeline-board,candidate-deck,fit-sheet,slot-picker,analytics-card}/page.tsx`; `src/app/host/page.tsx` (replaces the placeholder), `src/app/host/{applicants,candidates,interviews,analytics}/**`; `tests/e2e/sp5-host-screens.spec.ts` | `src/ui/components/CandidateCard.tsx` and its test (`fit` may be null); `src/app/host/layout.tsx` (Billing hides SP5 nav items) |
| **W7** messaging and seeker screens | `src/ui/patterns/{ThreadList,MessageBubble,ThreadCard,Composer,ScamBanner,OffsiteLinkDialog}.tsx` and tests; their gallery pages; `src/app/host/messages/**`; `src/app/(seeker)/inbox/**` (replaces the placeholder), `src/app/(seeker)/as-described/**`; `tests/e2e/sp5-messaging-screens.spec.ts` | — |
| **W8** integration | `tests/sp5/{authz.int,races.int,cross-module,wiring}.test.ts`, `tests/e2e/{sp5-journey,sp5-a11y}.spec.ts`, `tests/e2e/helpers/sp5.ts`, fixes in `drizzle/49xx` | any file, for integration fixes only |

**W6–W7 contract (Plan decision 28).** W6 owns `SlotPicker` and `src/app/host/interviews/_components/InterviewProposalSheet.tsx`; W7 imports neither. W7's host thread card links "Propose new times" to `/host/interviews?propose=<interviewId>`, and W6's `/host/interviews` page opens the new-round proposal sheet for that interview when `propose` is set. Both screens render the Interested candidate with SP4's `CandidateProfileView` from `GET /api/v1/host/invites/:id/candidate`, so neither needs the other's files.

## Phases

**Sequencing update, 10 November 2026.** The founder approved these changes. They are recorded on [explore-and-earn#45](https://github.com/AutomatedEmpires/explore-and-earn/issues/45).

- **SP3–SP8 may overlap SP2**, this sub-project included, where the lead (claude-code) judges it reasonable ([#45, comment 6776883039](https://github.com/AutomatedEmpires/explore-and-earn/issues/45#issuecomment-6776883039)). This replaces FD-9's strict build order for development. Public launch still needs the full product (FD-9).
  - The lead may start a phase before the sub-projects named in its prerequisites are fully merged, as long as the pieces it calls are merged or this plan's stubs and fakes stand in for them.
  - The lead decides which workstreams start early.
- **UI waits for design approval.** Phase B2 screens are built only after the founder approves their key screens in Figma (same comment). "The design gate approved" below means that approval.
- **FD-7 founding offer** is approved to build in Stripe test mode only ([#45, comment 6777814785](https://github.com/AutomatedEmpires/explore-and-earn/issues/45#issuecomment-6777814785)). SP5 has no billing work.

| Phase | Tasks | Runs | Depends on |
|---|---|---|---|
| **A: Contracts and touchpoints** (W0) | 1–8 | One agent, in order | Prerequisites above |
| **B1: Domain workstreams** | W1: 9–11 · W2: 12–15 · W3: 16–20 · W4: 21–25 · W5: 26–28 | Five worktrees in parallel; tasks within a workstream run in order | Phase A |
| **B2: Screens** | W6: 29–32 · W7: 33–35 | Two worktrees in parallel | B1 merged; SP4 merged; Foundation B3 merged and the design gate approved |
| **C: Integration** (W8) | 36–37 | One agent | Everything above |

---

## Phase A: Contracts and touchpoints (W0, one agent, sequential)

### Task 1 (W0): Notification touchpoints (F1, F2)

**Files:**
- Create: `src/modules/notifications/email/templates/HiringUpdate.tsx`, `src/modules/notifications/sp5-touchpoints.test.ts`
- Modify: `src/modules/notifications/{index.ts,types.ts,notify.ts}`, `src/modules/notifications/email/send.ts`, `src/modules/notifications/email/templates/Digest.tsx`, `src/modules/notifications/email/email.test.ts`

**Interfaces:**
- Produces:
  - `markReadByData(db: DbOrTx, userId: string, m: { types: string[]; key: string; value: string }): Promise<number>`: marks the user's unread rows where `type = any(types)` and `data->>key = value`, and returns how many.
  - `type EmailAttachment = { filename: string; contentType: string; content: string }` (`content` is the file's text).
  - `NotificationTypeDef.email` gains `attachments?: (d: NotificationData, db: DbOrTx) => Promise<EmailAttachment[]>` and `digestAction?: string` (the per-item button label inside a `Digest`).
  - `Message` gains `attachments?: EmailAttachment[]`. The email job calls `attachments` for single (non-batched) sends; a throw fails the job so the outbox retries. The stub provider keeps attachments on the stored message; when SP2's on-disk stub writer is active it also writes `attachments: [{ filename, contentType }]`. The Resend adapter passes `attachments: [{ filename, content: <base64 of content>, contentType }]` (check the SDK's field names with Context7).
  - `EmailTemplateName` adds `'HiringUpdate'`, with props `{ title: string; body: string; url: string | null; footer: FooterProps }` and the button "Open Explore&Earn".
  - `DigestItem` gains `actionLabel?: string`, rendered as a link button under the item when it has a URL.
- [ ] **Step 1: Write the failing tests** (`sp5-touchpoints.test.ts`, plus cases in `email.test.ts`).
  - `markReadByData(db, u, { types: ['messages.new'], key: 'threadId', value: 't1' })` marks the user's two unread `messages.new` rows with `threadId: 't1'` and returns 2. It leaves their `messages.new` row with `'t2'`, their `hiring.offer_received` row with `'t1'`, and another user's matching row unread.
  - A test type `test.ics` defined with `email: { template: 'HiringUpdate', attachments: async () => [{ filename: 'interview.ics', contentType: 'text/calendar; method=REQUEST', content: 'BEGIN:VCALENDAR' }] }`: after `notify` and one worker run, the stub outbox message has `attachments[0].filename === 'interview.ics'`.
  - The same type with `attachments` that throws: the email job throws and the stub outbox is unchanged.
  - Resend adapter with a mocked client: `emails.send` receives `attachments[0].content === Buffer.from('BEGIN:VCALENDAR').toString('base64')`.
  - A digest of one notification whose type has `digestAction: 'Reply in app'` renders HTML with a link labeled `Reply in app` to that notification's URL.
  - `HiringUpdate` with `{ title: 'T', body: 'B', url: 'https://x.test/a' }` renders `T`, `B` and a link to `https://x.test/a`.
- [ ] **Step 2:** Run `pnpm test src/modules/notifications`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test src/modules/notifications`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(notifications): read by data, email attachments, HiringUpdate template, digest actions`.

### Task 2 (W0): Trust, settings and media touchpoints (F3, F4, F5, F6)

**Files:**
- Create: `src/modules/trust/prompts/message_scam.ts`, `src/modules/trust/message-scam.test.ts`, `src/modules/media/authorized-url.ts`, `src/modules/media/meta.ts`, `src/modules/media/sp5-touchpoints.test.ts`
- Modify: `src/modules/trust/{types.ts,checks.ts}`, `src/modules/settings/registry.ts`, `src/modules/settings/settings.test.ts`, `src/modules/media/{scan.ts,index.ts}`

**Interfaces:**
- Produces:
  - `CheckKind` adds `'message_scam'` (beside SP2's kinds), with prompt `{ version: 'message_scam@1', system }` and the Foundation output schema. Labels are kept only when they are one of `payment_request`, `gift_card`, `bank_details`, `ssn_request`, `off_platform`, `other_scam`.
  - Settings: `trust.thresholds.message_scam = { approveBelow: 0.3, rejectAtOrAbove: 0.95 }`; `hiring.fit_enabled: boolean` = `true`; `hiring.fit_disabled_states: string[]` = `[]`, unique codes from SP2's `US_STATE_CODES`.
  - Media: an `attachment` image also runs `malware.scanFile(original, '<id>.<ext>')` before re-encoding; a hit is `rejected` with reason `malware`. Approved attachment images stay in `media-private`.
  - `getAuthorizedMediaUrl(db: DbOrTx, storage: Storage, mediaId: string, variant?: VariantWidth): Promise<string>`: `approved` media only (otherwise `notFound`); a 300-second signed URL for `media-private`, the public URL for `media-public`. Its doc comment says the caller must have checked the viewer.
  - `getPublicMediaUrls(db: DbOrTx, storage: Storage, ids: string[], variant: VariantWidth): Promise<Map<string, string>>`: approved `media-public` files only; others are omitted.
  - `getMediaMeta(db: DbOrTx, ids: string[]): Promise<Map<string, { ownerUserId: string; ownerOrgId: string | null; kind: MediaKind; status: MediaStatus; mime: string; sizeBytes: number }>>` in `meta.ts` (Plan decision 27): `mime` is `detected_mime ?? declared_mime`; unknown IDs are omitted. Hiring and messaging read media through it, never `app.media` directly.
- [ ] **Step 1: Write the failing tests.**
  - `runCheck({ kind: 'message_scam', subjectType: 'message', subjectId, text: 'Pay a deposit __flag__' })` → `needs_review` and one `moderation` item. `'__block__'` → `rejected`. `'See you Monday'` → `approved`. With `classify` mocked to throw → `needs_review`, reason `classifier_error`.
  - A classifier answer with labels `['gift_card', 'spam']` stores `['gift_card']`.
  - The prompt's `version` is `message_scam@1`, and `system` names all six labels.
  - Settings: the three defaults above; `hiring.fit_disabled_states: ['ZZ']` and `['NY', 'NY']` are `bad_request`; `['NY', 'CO']` is accepted.
  - Media: an `attachment` PNG while the stub malware scanner flags it → `rejected` with reason `malware`. A clean one → `approved`, bucket `media-private`, variants set.
  - `getAuthorizedMediaUrl` on that approved attachment returns a signed URL from `memoryStorage()`; on a `scanning` row it throws `not_found`.
  - `getPublicMediaUrls` returns an entry for an approved `avatar` and omits an approved `attachment` and a `scanning` avatar.
  - `getMediaMeta` for an approved PDF `attachment` with `declared_mime 'application/pdf'` and `detected_mime 'application/pdf'` gives `{ kind: 'attachment', status: 'approved', mime: 'application/pdf', ownerOrgId }` with its size; a row with `declared_mime 'image/jpeg'` and `detected_mime 'image/png'` gives `mime: 'image/png'`; a row with null `detected_mime` falls back to `declared_mime`; an unknown ID is absent from the map.
- [ ] **Step 2:** Run `pnpm test src/modules/trust src/modules/settings src/modules/media`. Expected: FAIL.
- [ ] **Step 3:** Implement. Load the `claude-api` skill before writing the prompt; it treats the text as data and scores requests for money, gift cards, bank or Social Security details before hiring, and moves to another app.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(foundation): message_scam check, fit settings, attachment malware scan, authorized media URLs, media metadata`.

### Task 3 (W0): SP2 touchpoints: hiring info, org listings and followers at a date

**Files:**
- Create: `src/modules/listings/hiring-info.ts`, `src/modules/listings/hiring-info.test.ts`, `src/modules/hostpages/followers-at.ts`, `src/modules/hostpages/followers-at.test.ts`
- Modify: `src/modules/listings/index.ts`, `src/modules/hostpages/index.ts` (one export line each), `src/server/sp2-wiring.ts` (one line: `import '@/server/module-registrations';`)

**Interfaces:**
- Consumes: SP2's `listings` and `listing_revisions` tables and `host_follows`; `effectiveStart` and `effectiveEnd` from `@/lib/discovery`
- Produces:
  ```ts
  export type ListingHiringInfo = { id: string; orgId: string; locationId: string | null; title: string; status: ListingState;
    category: Category; secondCategory: Category | null; occupation: string; startDate: string | null; endDate: string | null;
    when: ListingContent['when']; skills: string[]; requiredCertifications: string[]; sponsorship: 'none' | 'j1' | 'h2a' | 'h2b';
    state: string | null; remoteStates: string[] | 'all_us' | null; timezone: string; pay: ListingContent['pay'];
    housingProvided: boolean; mealsProvided: boolean; publishedRevisionId: string | null; closedAt: Date | null;
    notifyMemberIds: string[]; openings: number };
  export function getHiringInfoMany(db: DbOrTx, ids: string[]): Promise<ListingHiringInfo[]>;
  export function listForOrg(db: DbOrTx, orgId: string, o?: { status?: ListingState[] }): Promise<{ id: string; title: string;
    state: ListingState; locationId: string | null; publishedRevisionId: string | null; firstPublishedAt: Date | null; closedAt: Date | null }[]>;
  export function countFollowersAt(db: DbOrTx, orgId: string, at: Date): Promise<number>;
  ```
- Rules:
  - `getHiringInfoMany` reads each listing's published revision; never-published listings and unknown IDs are omitted, and results keep input order. `startDate`/`endDate` are `effectiveStart(when)`/`effectiveEnd(when)`; `state` is the revision's `state_code` on-site and null for remote; `remoteStates` is `'all_us'`, the revision's `remote_states`, or null on-site; `timezone` is the revision's `timezone`; `skills`, `requiredCertifications` and `notifyMemberIds` come from `content.job.skills`, `content.job.certifications` and `content.applying.notifyMemberIds`; `status` and `closedAt` come from `listings`.
  - `listForOrg` returns every listing of the org that was ever published, newest `first_published_at` first; `status` filters `state = any(status)`.
  - `countFollowersAt` counts `host_follows` rows of the org with `created_at <= at`.
- [ ] **Step 1: Write the failing tests.** Each test inserts listings and approved revisions with SQL through a local `insertPublishedListing(db, i)` helper.
  - A fixed-dates on-site listing gives `{ startDate: '2027-06-01', endDate: '2027-08-31', state: 'CO', remoteStates: null, timezone: 'America/Denver', sponsorship: 'none', openings: 2 }` with its skills and certifications.
  - Season `summer` 2027 gives `'2027-06-01'` to `'2027-08-31'`; ongoing with a null start gives both null.
  - Remote `all_us` gives `state: null, remoteStates: 'all_us'`; scope `states` with `['CO', 'UT']` gives `['CO', 'UT']`.
  - A draft-only listing and an unknown ID are omitted; three IDs come back in input order. A closed listing has `status: 'closed'` and `closedAt` set.
  - `listForOrg` omits another org's listings; `{ status: ['active'] }` omits the closed one.
  - `countFollowersAt` with follows at T − 2 days and T + 1 day returns 1 at T.
  - The source of `src/server/sp2-wiring.ts` contains `import '@/server/module-registrations'`.
- [ ] **Step 2:** Run `pnpm test src/modules/listings/hiring-info.test.ts src/modules/hostpages/followers-at.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp2): hiring info, org listing list and followers-at for SP5`.

### Task 4 (W0): SP5 tables

**Files:**
- Create: `drizzle/4000_hiring.sql`, `drizzle/4050_messaging.sql`, `src/modules/hiring/schema.ts`, `src/modules/messaging/schema.ts`, `tests/sp5/migrations.test.ts`
- Modify: `src/db/schema.ts` (re-exports both schema files)

**Interfaces:**
- Produces: exactly the spec section 4 tables, columns, CHECKs, unique and partial indexes, with these additions:
  - `interviews.outcome_nudged_at timestamptz null` (Plan decision 15).
  - `bulk_messages.thread_ids uuid[] not null default '{}'`: the recipient threads fixed at create, so an operator's release sends to the same threads (Plan decision 26).
  - Trigger `app.pipeline_events_insert_only()` rejects UPDATE and DELETE on `pipeline_events`.
  - Foreign keys as the spec's column notes say, plus `interview_slots.interview_id … on delete cascade`, `messages.thread_id … on delete cascade`, `thread_reads.thread_id … on delete cascade` and `as_described_responses.seeker_user_id … on delete set null`.
  - Drizzle names: `pipelineEntries`, `pipelineEvents`, `pendingPasses`, `candidatePoolRuns`, `candidatePoolEntries`, `invites`, `interviews`, `interviewSlots`, `offers`, `asDescribedResponses` (hiring); `threads`, `messages`, `threadReads`, `savedReplies`, `bulkMessages`, `orgReplyStats` (messaging).
- [ ] **Step 1: Write the failing tests** (`tests/sp5/migrations.test.ts`).
  - All 16 tables exist in schema `app` with `relrowsecurity = true`.
  - `pipeline_entries.status = 'pending'` and `fit_score = 101` each violate a check; updating or deleting a `pipeline_events` row raises.
  - A second `invites` row for the same `(listing_id, seeker_user_id)` violates the unique index; a 301-character note violates its check.
  - For one application, an `invited` and a `scheduled` interview violate the partial unique index; `invited` plus `completed` is accepted. `duration_minutes = 20` and `expiry_hours = 24` violate.
  - Two `sent` offers for one application violate; `sent` plus `declined` is accepted.
  - `messages`: 6 attachment IDs violate; a body of 4,001 characters violates; a body of `'\u{1F600}'.repeat(4000)` is accepted (Review Focus 4). A repeated `(thread_id, sender_user_id, client_id)` violates.
  - A second `saved_replies` row with `kind = 'not_selected'` for one org violates; two `reply` rows are accepted. A second thread for one `(listing_id, seeker_user_id)` violates.
- [ ] **Step 2:** Run `pnpm test tests/sp5/migrations.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the SQL and the Drizzle tables.
- [ ] **Step 4:** Run the test and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp5): hiring and messaging tables`.

### Task 5 (W0): Client-safe contracts

**Files:**
- Create: `src/lib/hiring/{types,schemas,constants,copy,time,index}.ts`, `src/lib/messaging/{types,schemas,constants,copy,template,links,index}.ts`, `src/lib/host-analytics/{types,schemas,index}.ts` (not `src/lib/analytics/`, Plan decision 24)
- Test: `src/lib/hiring/{schemas,time}.test.ts`, `src/lib/messaging/{template,links}.test.ts`

**Interfaces:**
- Produces, `src/lib/hiring/types.ts` (type-only imports from `@/lib/applications`, `@/lib/profiles` and `@/lib/taxonomy`):
  ```ts
  export type { ApplicationStatus, Category };
  export type Page<T> = { items: T[]; nextCursor: string | null };
  export type FitFactor = 'occupation' | 'availability' | 'skills' | 'certifications' | 'work_authorization' | 'pay' | 'location';
  export type FitWeights = Record<Category, Record<FitFactor, number>>;
  export type FitListing = { category: Category; secondCategory: Category | null; occupation: string; occupationLabel: string;
    startDate: string; endDate: string | null; weeklyHours: number; skillKeys: string[]; requiredCertificationKeys: string[];
    sponsorship: 'none' | 'j1' | 'h2a' | 'h2b'; state: string | null; remoteStates: string[] | 'all_us' | null; maxPayHourlyCents: number | null };
  export type FitLine = { factor: FitFactor; weight: number; value: number; text: string };
  export type FitResult = { score: number; weightsVersion: string; lines: FitLine[] };
  export type PipelineEventKind = 'applied' | 'shortlisted' | 'unshortlisted' | 'interview_invited' | 'interview_scheduled' | 'interview_completed'
    | 'interview_no_show' | 'offered' | 'offer_canceled' | 'hired' | 'not_selected' | 'withdrawn' | 'offer_declined'
    | 'invite_sent' | 'invite_interested' | 'invite_not_interested' | 'invite_applied' | 'invite_expired';
  export type ScanState = 'pending' | 'clear' | 'warn' | 'held';
  export type InviteStatus = 'sent' | 'interested' | 'applied' | 'not_interested' | 'expired';
  export type HostInviteStatus = InviteStatus | 'not_delivered';
  export type InviteDeclineReason = 'dates' | 'location' | 'pay' | 'role' | 'not_looking' | 'other';
  export type InterviewStatus = 'invited' | 'scheduled' | 'reschedule_requested' | 'declined' | 'expired' | 'canceled' | 'completed' | 'no_show';
  export type InterviewFormat = 'video' | 'phone' | 'in_person';
  export type InterviewWhere = { kind: 'video'; url: string } | { kind: 'phone'; note: string | null } | { kind: 'in_person'; address: string };
  export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'canceled';
  export type PayUnit = 'hour' | 'day' | 'week' | 'month' | 'season' | 'year' | 'crew_share';
  export type OfferPay = { amountCents: number; maxCents: number | null; unit: PayUnit; currency: string };
  export type ApplicantSort = 'newest' | 'oldest' | 'fit' | 'activity';
  export type ApplicantCardData = { applicationId: string; listingId: string; listingTitle: string; status: ApplicationStatus;
    source: ApplicationSource; appliedAt: string; lastStatusAt: string; card: HostApplicationCard; avatarUrl: string | null;
    coverUrl: string | null; fitScore: number | null; interviewState: InterviewStatus | null; offerState: OfferStatus | null;
    undoUntil: string | null; threadId: string | null };
  export type InterviewSlotView = { id: string; round: number; startsAt: string; endsAt: string; passed: boolean };
  export type HostInterviewView = { id: string; applicationId: string; status: InterviewStatus; format: InterviewFormat; where: InterviewWhere;
    round: number; slots: InterviewSlotView[]; durationMinutes: number; timezone: string; expiresAt: string | null;
    scheduledStart: string | null; scheduledEnd: string | null; requestedWindows: { start: string; end: string }[] | null;
    requestNote: string | null; note: string | null; noteState: ScanState; organizerUserId: string };
  export type SeekerInterviewItem = Omit<HostInterviewView, 'status' | 'noteState' | 'organizerUserId'> & {
    status: Exclude<InterviewStatus, 'completed' | 'no_show'> | 'past'; orgName: string; title: string; threadId: string };
  export type InterviewItem = { interviewId: string; applicationId: string; listingId: string; listingTitle: string; firstName: string;
    lastName: string; status: InterviewStatus; format: InterviewFormat; round: number; scheduledStart: string | null;
    scheduledEnd: string | null; expiresAt: string | null; timezone: string; needsAction: boolean; threadId: string };
  export type HostOfferView = { id: string; applicationId: string; status: OfferStatus; position: string; startDate: string; pay: OfferPay;
    note: string | null; noteState: ScanState; hasLetter: boolean; priorStatus: ApplicationStatus; sentAt: string; respondedAt: string | null };
  export type SeekerOfferItem = Omit<HostOfferView, 'noteState' | 'priorStatus'> & { orgName: string; title: string; threadId: string };
  export type PipelineHistoryItem = { kind: PipelineEventKind; actorType: 'host' | 'seeker' | 'system'; at: string };
  export type ApplicantDetail = { card: ApplicantCardData; snapshot: ApplicationSnapshotV1; fit: FitResult | null; history: PipelineHistoryItem[];
    interview: HostInterviewView | null; offer: HostOfferView | null; threadId: string | null; additionalStepDone: boolean };
  export type PoolCardData = { candidateId: string; card: PoolCard; avatarUrl: string | null; coverUrl: string | null; fit: FitResult | null;
    invite: { inviteId: string; status: HostInviteStatus } | null; saved: boolean; hidden: boolean };
  export type HostInviteItem = { inviteId: string; listingId: string; listingTitle: string; candidateId: string; firstName: string;
    lastInitial: string; status: HostInviteStatus; declineReason: InviteDeclineReason | null; sentAt: string; expiresAt: string;
    respondedAt: string | null; threadId: string | null };
  export type SeekerInviteItem = { inviteId: string; listingId: string; orgId: string; orgName: string; orgLogoUrl: string | null;
    title: string; note: string | null; warn: boolean; status: InviteStatus; sentAt: string; expiresAt: string; threadId: string | null;
    applyHref: string };
  export type InterviewProposal = { slots: { start: string }[]; durationMinutes: 15 | 30 | 45 | 60 | 90; timezone?: string;
    format: InterviewFormat; videoUrl?: string; phoneNote?: string; address?: string; note?: string; expiryHours: 48 | 72 };
  export type OfferInput = { position?: string; startDate: string; pay: { amountCents: number; maxCents?: number; unit: PayUnit };
    note?: string; letterMediaId?: string };
  export type HostHome = { todayApplicants: number; todayInterviews: InterviewItem[]; unreadThreads: number;
    openingsFilled: { listingId: string; title: string }[] };
  export type CardPayload =
    | { type: 'application'; applicationId: string; title: string; submittedAt: string; status: ApplicationStatus | SeekerStatus }
    | { type: 'invite'; invite: SeekerInviteItem | HostInviteItem }
    | { type: 'interview'; interview: SeekerInterviewItem | HostInterviewView }
    | { type: 'offer'; offer: SeekerOfferItem | HostOfferView };
  export type AsDescribedAnswer = 'yes' | 'partly' | 'no';
  export type Tally = { yes: number; partly: number; no: number };
  export type AsDescribedSummary = { responses: number; visible: boolean; housing: Tally; meals: Tally; pay: Tally };
  export type AsDescribedPrompt = { id: string; orgName: string; title: string; asksWorkedHere: boolean; asksHousing: boolean;
    asksMeals: boolean; state: 'open' | 'submitted' | 'closed'; closesAt: string | null };
  ```
- Produces, `src/lib/messaging/types.ts`:
  ```ts
  export type ThreadCard = { type: 'application' | 'invite' | 'interview' | 'offer'; refId: string };
  export type ThreadEventCode = 'invite_interested' | 'application_submitted' | 'interview_scheduled' | 'interview_canceled'
    | 'interview_completed' | 'interview_no_show' | 'offer_accepted' | 'offer_declined' | 'offer_canceled' | 'hired' | 'withdrawn';
  export type ReadOnlyReason = 'withdrawn' | 'blocked' | 'removed' | 'listing_closed';
  export type MessageState = 'sending' | 'sent' | 'not_delivered' | 'removed';
  export type MessageView = { id: string; clientId: string | null; kind: 'text' | 'card' | 'event'; mine: boolean;
    senderType: 'seeker' | 'host' | 'system'; senderFirstName: string | null; body: string | null;
    attachments: { mediaId: string; mime: string }[]; card: ThreadCard | null; event: ThreadEventCode | null;
    warn: boolean; state: MessageState | null; createdAt: string };
  export type ThreadSummary = { threadId: string; listingId: string; listingTitle: string; counterpartName: string;
    counterpartAvatarUrl: string | null; lastMessage: { preview: string | null; at: string } | null; unread: boolean; readOnly: boolean };
  export type ThreadView = { thread: { id: string; listingId: string; listingTitle: string; orgId: string; orgName: string;
    seekerFirstName: string; applicationId: string | null; inviteId: string | null; hired: boolean };
    messages: MessageView[]; nextBefore: string | null; readOnly: ReadOnlyReason | null; canSend: boolean };
  export type SavedReply = { id: string; title: string; body: string; updatedAt: string };
  export type ReplyStats = { conversations: number; medianFirstReplyMinutes: number | null; usuallyRepliesWithinDay: boolean };
  export type TemplateVars = { first_name: string; position: string; org_name: string; my_first_name: string };
  ```
  `state` is set only on the viewer's own host messages; `warn` is true for a released `warn` message (the seeker sees `ScamBanner`). `attachments` has no file name, because `app.media` stores none (Plan decision 27).
- Produces, `src/lib/host-analytics/types.ts`: `AnalyticsRange`, `Metric`, `Slice` and `HostAnalytics` exactly as spec section 3.
- Produces, param schemas (Plan decision 25; each field is `z.uuid()`): `idParamSchema` (`{ id }`, in `src/lib/messaging/schemas.ts`, re-exported by `src/lib/hiring/schemas.ts`), `applicationParamSchema` (`{ applicationId }`), `candidateParamSchema` (`{ candidateId }`) and, in messaging, `attachmentParamSchema` (`{ id, mediaId }`). The body and query schemas below never name a path segment.
- Produces, schemas (zod 4, `textMax(n)` counts code points): `homeQuerySchema` (`tz`), `applicantsQuerySchema` (`listingId?`, `status?` array, `sort` default `newest`, `cursor?`, `limit` 1–50 default 25), `shortlistSchema`, `interviewProposalSchema` (spec 8.5 limits; `durationMinutes` default 30, `expiryHours` default 72; `videoUrl` https and required for `video`, `address` 1–300 required for `in_person`, `phoneNote` ≤ 200, `note` ≤ 500), `newRoundSchema`, `cancelInterviewSchema` (`reason` ≤ 300), `outcomeSchema`, `offerInputSchema` (spec 8.6; `maxCents >= amountCents`), `candidatesQuerySchema` (`state?`, `availableBy?` date, `skills?` ≤ 5, `view` default `all`, `cursor?`), `sendInviteSchema` (`candidateId`, `note?` ≤ 300), `hostInvitesQuerySchema`, `hostInterviewsQuerySchema` (`from`, `to`, `listingId?`, `needsAction?`), `inviteResponseSchema` (`response`, `reason?` only with `not_interested`), `pickSlotSchema`, `requestTimesSchema` (1–3 windows, each ≥ 30 minutes, `note?` ≤ 300), `declineInterviewSchema`, `asDescribedSubmitSchema` (`workedHere?`, `housing?`, `meals?`, `pay` required), `cursorQuerySchema`; messaging `sendMessageSchema` (`clientId` 1–64, `body?` ≤ 4,000, `attachmentMediaIds?` ≤ 5, at least one of body or attachments), `threadQuerySchema` (`before?`), `hostThreadsQuerySchema`, `bulkMessageSchema` (`statuses` 1–8, `body` ≤ 4,000), `savedReplySchema` (`title` ≤ 60, `body` ≤ 2,000), `savedReplyPatchSchema`, `notSelectedSchema` (`body` ≤ 2,000), `attachmentQuerySchema`; analytics `analyticsQuerySchema` (`range`, `listingId?`, `locationId?`, `tz`).
- Produces, constants:
  - hiring: `PASS_UNDO_MS = 10_000`; `APPLICANTS = { defaultLimit: 25, maxLimit: 50 }`; `POOL = { queryLimit: 500, refreshAfterHours: 6, pageSize: 24, maxSkillFilters: 5 }`; `INVITES = { noteMax: 300, expiryDays: 14, reminderHoursBefore: 48 }`; `INTERVIEWS = { minLeadMinutes: 60, maxAheadDays: 90, durations: [15, 30, 45, 60, 90], defaultDuration: 30, expiryHours: [48, 72], defaultExpiryHours: 72, noteMax: 500, phoneNoteMax: 200, addressMax: 300, cancelReasonMax: 300, maxWindows: 3, minWindowMinutes: 30, windowsMaxAheadDays: 60, requestNoteMax: 300, autoCompleteHours: 48 }`; `OFFERS = { positionMax: 120, noteMax: 1000 }`; `AS_DESCRIBED = { openDays: 60, ongoingDueDays: 90, hostPageMinResponses: 5, analyticsMinResponses: 3 }`; `RATE_LIMITS = { invites: { limit: 100, windowSec: 3600 }, interviews: { limit: 30, windowSec: 3600 }, export: { limit: 20, windowSec: 3600 } }`.
  - messaging: `MESSAGES = { bodyMax: 4000, maxAttachments: 5, previewMax: 140, readOnlyAfterCloseDays: 90, emailDelayMinutes: 15 }`; `SAVED_REPLIES = { max: 20, titleMax: 60, bodyMax: 2000 }`; `BULK = { maxRecipients: 200 }`; `REPLY_STATS = { windowDays: 180, capDays: 7, minAgeHours: 24, minConversations: 10, withinDayMinutes: 1440 }`; `RATE_LIMITS = { messages: { limit: 60, windowSec: 600 }, bulk: { limit: 5, windowSec: 3600 } }`.
- Produces, copy (exact):
  - hiring: `EMPTY = { applicants: 'No applicants yet. Share your listing or invite candidates.', applicantsToday: 'No new applicants today', candidates: 'No candidates match these filters', interviews: 'No interviews scheduled', analytics: 'No data for this period', seekerInvites: 'No invites yet', seekerInterviews: 'No interviews yet' }`; `APPLICATION_UNAVAILABLE = "This application isn't available"`; `INVITE_EXPIRED = 'This invite expired'`; `AS_DESCRIBED_CLOSED = 'This check has closed'`; `SEEKER_UNAVAILABLE = 'Not accepting invites right now'`; `NO_CREDITS = "You're out of invite credits"`; `FIT_UNAVAILABLE = "Fit scores aren't available for this listing"`; `FIT_NONE = '—'`; `ALL_OPENINGS_FILLED = 'All openings filled'`; `ALSO_WITHDRAW = 'Also withdraw your application?'`; `AS_DESCRIBED_THRESHOLD = "Shown after 3 responses, to protect workers' privacy"`; `NO_BOOSTS = 'No boosts in this period'`; `INVITE_STATUS_LABELS` (Sent, Interested, Applied, Not interested, Expired, Not delivered); `DECLINE_REASON_LABELS` (`dates` "Dates don't work", `location` "Location doesn't work", `pay` "Pay is too low", `role` "Not the right role", `not_looking` "Not looking right now", `other` "Other"); `SOURCE_LABELS` (Seek, Swipe, Map, Invites, Boost, Landing pages, Other); `RANGE_LABELS` (7 days, 30 days, 90 days, This season, All time); `FACTOR_LABELS` (Occupation, Availability, Skills, Certifications, Work authorization, Pay, Location).
  - messaging: `NOT_SELECTED_DEFAULT = "Hi {first_name}, thank you for applying for {position} at {org_name}. We've decided to move forward with other candidates for this role. We wish you the best with your search."`; `SCAM_BANNER = { title: 'Never pay to get a job', body: 'Explore&Earn employers never ask for money, gift cards, or bank or Social Security details before hiring.' }`; `EMPTY = { hostThreads: 'No conversations yet. Threads start when someone applies or answers Interested.', seekerThreads: 'No messages yet', savedReplies: 'No saved replies yet' }`; `READ_ONLY = 'This conversation is read-only'`; `MESSAGE_STATE_LABELS = { sending: 'Sending…', sent: 'Sent', not_delivered: 'Not delivered' }`; `SCANNING = 'Scanning…'`; `DELETED_BODY = '[deleted]'`; `DELETED_USER = 'Deleted user'`; `REPLY_IN_APP = 'Reply in app'`; `USUALLY_REPLIES = 'Usually replies within a day'`; `ATTACHMENT_LABELS = { pdf: 'PDF', image: 'Photo' }` (by `mime`: `application/pdf` is `pdf`, any `image/*` is `image`).
- Produces, helpers:
  - `fillTemplate(body: string, v: TemplateVars): string`: replaces the four fill-ins; anything else in braces stays as typed.
  - `findLinks(text: string): { text: string; href: string | null }[]`: segments; only `http://` and `https://` URLs link; trailing `.,;:!?)` is excluded; `href` is `new URL(...).toString()`.
  - `displayHost(href: string): string`: the URL's lowercased punycode `hostname`.
  - `zonedLocalToUtc(local: string /* 'YYYY-MM-DDTHH:mm' */, tz: string): string`: a time in a spring-forward gap moves forward by the gap; an ambiguous fall-back time takes the earlier offset.
  - `localDayRange(tz: string, now: Date): { from: Date; to: Date }`; `todayInZone(tz: string, now: Date): string`; `formatInZone(iso: string, tz: string, style: 'date' | 'time' | 'datetime'): string` (en-US, `'Jun 12'`, `'10:00 AM'`, `'Jun 12, 10:00 AM MDT'`).
- [ ] **Step 1: Write the failing tests.**
  - `zonedLocalToUtc('2027-03-13T10:00', 'America/Denver') === '2027-03-13T17:00:00.000Z'`; `'2027-03-14T10:00'` → `'2027-03-14T16:00:00.000Z'`; gap `'2027-03-14T02:30'` → `'2027-03-14T09:30:00.000Z'`; fall-back `'2027-11-07T01:30'` → `'2027-11-07T07:30:00.000Z'`.
  - *(Review Focus 1)* `localDayRange('America/Anchorage', new Date('2027-01-15T08:30:00Z'))` → `{ from: 2027-01-14T09:00:00.000Z, to: 2027-01-15T09:00:00.000Z }`; `localDayRange('Pacific/Honolulu', new Date('2027-06-02T09:59:00Z'))` → from `2027-06-01T10:00:00.000Z` to `2027-06-02T10:00:00.000Z`.
  - *(Review Focus 4)* `sendMessageSchema` accepts a body of `'\u{1F600}'.repeat(4000)` and rejects 4,001; `sendInviteSchema` accepts a 300-code-point note and rejects 301; a body containing `\u0007` is rejected.
  - `interviewProposalSchema` rejects 0 and 6 slots, `durationMinutes: 20`, `format: 'video'` without `videoUrl`, `videoUrl: 'http://x.test'`, and `in_person` without `address`; it fills `durationMinutes: 30` and `expiryHours: 72`. `requestTimesSchema` rejects 4 windows and a 20-minute window. `offerInputSchema` rejects a 121-character position and `maxCents < amountCents`. `candidatesQuerySchema` rejects 6 skills. `applicantsQuerySchema` defaults to `sort: 'newest', limit: 25` and rejects `limit: 51`.
  - `fillTemplate('Hi {first_name}, {position} at {org_name}. {my_first_name} {unknown}', { first_name: 'Maya', position: 'Deckhand', org_name: 'Kettle Ridge Lodge', my_first_name: 'Sam' })` → `'Hi Maya, Deckhand at Kettle Ridge Lodge. Sam {unknown}'`.
  - *(Review Focus 2)* `findLinks('see https://Example.COM/a, and javascript:alert(1) or data:text/html,x')` has exactly one non-null `href`, `'https://example.com/a'`, and its segment text excludes the comma. `displayHost('https://bücher.example/x') === 'xn--bcher-kva.example'`; `displayHost('https://user@evil.test/') === 'evil.test'`.
  - Every file under `src/lib/{hiring,messaging,host-analytics}` has no line matching `/^import (?!type).*from '(@\/modules\/|@\/lib\/db|drizzle-orm)/`. No folder `src/lib/analytics/` exists (it would be shadowed by Foundation's `src/lib/analytics.ts`), and `import { analyticsQuerySchema } from '@/lib/host-analytics'` resolves.
  - *(Plan decision 25)* `shortlistSchema.safeExtend(applicationParamSchema.shape).parse({ on: true, applicationId: <uuid> })` keeps `applicationId`; `sendMessageSchema.safeExtend(idParamSchema.shape)` still rejects a message with neither body nor attachments; `idParamSchema` rejects `'abc'`.
- [ ] **Step 2:** Run `pnpm test src/lib/hiring src/lib/messaging`. Expected: FAIL.
- [ ] **Step 3:** Implement. `zonedLocalToUtc` guesses UTC, reads the zone's offset at the guess with `Intl.DateTimeFormat(…, { timeZone, timeZoneName: 'longOffset' })`, and corrects once or twice.
- [ ] **Step 4:** Run the same tests and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp5): client-safe hiring, messaging and host-analytics contracts`.

### Task 6 (W0): Module skeletons, notification types and shared touchpoints

**Files:**
- Create: the three module indexes, `src/modules/{hiring,messaging}/notification-types.ts`, `src/modules/{hiring,messaging}/jobs.ts`, `src/modules/hiring/fit/weights.ts`, `src/modules/analytics/{boost.ts,privacy.ts}`, every stub file in the map below, `tests/sp5/{registry,exports,architecture}.test.ts`
- Modify: `src/server/{job-handlers,schedules,counts,event-subscribers,module-registrations}.ts`, `src/server/privacy-registry.ts` (if present)

**Interfaces:**
- **Each index** re-exports its client-safe barrel (`@/lib/hiring`, `@/lib/messaging`, and for analytics `@/lib/host-analytics`, never `@/lib/analytics`) and every stub file, side-effect-imports `./notification-types` and its registration files, and exports `jobHandlers`, `privacyHandler` and `retentionRules`.
- **Stub map.** Owners replace these bodies and keep the signatures. Unless the last column says otherwise, a stub throws `new Error('not implemented: <name> (W<n>)')`.

  | File (under `src/modules/`) | Names | Owner | Stub |
  |---|---|---|---|
  | `hiring/pipeline/handlers.ts` | `onApplicationSubmitted(db: Db, payload: unknown): Promise<void>`, `onApplicationWithdrawn`, `onAdditionalStepChanged` (same shape) | W1 | no-op |
  | `hiring/pipeline/actions.ts` | `shortlist(db: Db, ctx: HostContext, applicationId: string, on: boolean): Promise<{ status: ApplicationStatus }>`, `markHired(db, ctx, applicationId): Promise<{ status: 'hired' }>` | W1 | throws |
  | `hiring/pipeline/pass.ts` | `pass(db: Db, ctx, applicationId, now?: Date): Promise<{ undoUntil: string }>`, `undoPass(...): Promise<{ status: ApplicationStatus }>`, `commitPass(db: Db, payload: unknown, now: Date): Promise<void>` | W1 | `commitPass` no-op |
  | `hiring/pipeline/applicants.ts` | `listApplicants(db: DbOrTx, ctx, q: ApplicantsQuery): Promise<{ items: ApplicantCardData[]; counts: Record<ApplicationStatus, number>; nextCursor: string \| null }>`, `getApplicantDetail(db, ctx, applicationId): Promise<ApplicantDetail>`, `listApplicationIdsByStatus(db, i: { orgId: string; listingId: string; statuses: ApplicationStatus[] }): Promise<string[]>` | W1 | throws |
  | `hiring/pipeline/home.ts` | `getHostHome(db: DbOrTx, ctx, i: { tz: string; now?: Date }): Promise<HostHome>`, `getOrgHiringSummary` (spec 3) | W1 | throws |
  | `hiring/pipeline/register.ts` | the `hiring` listing stats provider | W1 | empty |
  | `hiring/privacy.ts` | `privacyHandler`, `retentionRules` (key `hiring.notes_12m`) | W1 | final `module` and `tables`; `exportData`/`erase` throw; the rule's `run` returns `{ deleted: 0 }` |
  | `hiring/fit/{compute,lines,listing,score}.ts` | `computeFit` (spec 3), `toFitListing(h: ListingHiringInfo, x: { occupationLabel: string; maxPayHourlyCents: number \| null; today: string }): FitListing`, `certKey(label: string): string`, `toPoolListing` (spec 3), `fitAvailable(db: Db, h: ListingHiringInfo): Promise<boolean>`, `scoreSeekers(db: Db, h: ListingHiringInfo, seekerUserIds: string[], today?: string): Promise<Map<string, FitResult> \| null>` | W2 | throws |
  | `hiring/fit-store.ts` | `scoreApplications(db: Db, i: { listingId: string; applicationIds?: string[] }): Promise<number>`, `refreshFit(db: Db, now: Date): Promise<number>` | W2 | `refreshFit` no-op |
  | `hiring/pools/{refresh,candidates}.ts` | `refreshPool(db: Db, h: ListingHiringInfo, now: Date): Promise<'refreshed' \| 'busy'>`, `listCandidates(db: Db, ctx, i: CandidatesQuery & { listingId: string }, now?: Date): Promise<{ items: PoolCardData[]; nextCursor: string \| null; creditsRemaining: number; fitAvailable: boolean }>`, `setCandidateFlag(db, ctx, candidateId, flag: 'saved' \| 'hidden', on: boolean): Promise<void>` | W2 | throws |
  | `hiring/invites/{send,respond,reads,sweep,notes,register}.ts` | `sendInvite(db: Db, ctx, i: { candidateId: string; note?: string }, now?: Date): Promise<{ invite: HostInviteItem }>`, `respondToInvite(db: Db, seekerUserId, inviteId, i: InviteResponse, now?): Promise<{ invite: SeekerInviteItem; threadId: string \| null }>`, `muteInviteHost(db, seekerUserId, inviteId): Promise<{ invite: SeekerInviteItem }>`, `listHostInvites(db, ctx, q): Promise<Page<HostInviteItem>>`, `getInterestedCandidate(db: DbOrTx, ctx: HostContext, inviteId: string): Promise<{ invite: HostInviteItem; candidate: CandidateCard }>`, `listSeekerInvites` (spec 3), `getSeekerInvite(db, seekerUserId, inviteId, now?): Promise<{ invite: SeekerInviteItem; jobCard: JobCardData \| null }>`, `sweepInvites(db: Db, now: Date): Promise<void>`, `seekerInviteItems(db: DbOrTx, seekerUserId: string, inviteIds: string[], now?: Date): Promise<Map<string, SeekerInviteItem>>`, `hostInviteItems(db: DbOrTx, orgId: string, inviteIds: string[], now?: Date): Promise<Map<string, HostInviteItem>>`, `loadInviteNote(db, id): Promise<NoteToScan \| null>`, `releaseInviteNote(tx: Tx, id, outcome: ScanOutcome): Promise<void>` | W2 | `sweepInvites` no-op; `listSeekerInvites` returns an empty page; `seekerInviteItems` and `hostInviteItems` an empty Map; `register.ts` empty |
  | `hiring/interviews/{ics,propose,respond,host,reads,reminders,sweep,close,notes,register}.ts` | `buildIcs(e: IcsEvent): string`, `interviewIcsAttachments(d: NotificationData, db: DbOrTx): Promise<EmailAttachment[]>`, `getInterviewIcs(db, viewer: ThreadViewer, interviewId): Promise<string>`, `proposeInterview(db: Db, ctx, applicationId, p: InterviewProposal, now?): Promise<{ interview: HostInterviewView }>`, `proposeNewRound(db, ctx, interviewId, p: NewRound, now?)`, `cancelInterview(db, ctx, interviewId, reason?: string)`, `recordInterviewOutcome(db, ctx, interviewId, outcome: 'completed' \| 'no_show', now?)` (each `{ interview: HostInterviewView }`), `pickSlot(db, seekerUserId, interviewId, i: { slotId: string; round: number }, now?)`, `requestNewTimes(db, seekerUserId, interviewId, i: RequestTimes, now?)` (each `{ interview: SeekerInterviewItem }`), `declineInterview(db, seekerUserId, interviewId, i: { alsoWithdraw: boolean }): Promise<{ interview: SeekerInterviewItem; withdrawn: boolean }>`, `listHostInterviews(db, ctx, q: HostInterviewsQuery, now?): Promise<{ items: InterviewItem[] }>`, `listSeekerInterviews` (spec 3), `hostInterviewViews(db, applicationIds: string[]): Promise<Map<string, HostInterviewView>>`, `sendInterviewReminder(db: Db, payload: unknown, now: Date): Promise<void>`, `sweepInterviews(db: Db, now: Date): Promise<void>`, `onMemberRemoved(db: Db, payload: unknown): Promise<void>`, `closeOpenItems(tx: Tx, i: { applicationId: string; reason: 'not_selected' \| 'withdrawn'; actor: Actor }): Promise<void>`, `loadInterviewNote`, `releaseInterviewNote` | W3 | `interviewIcsAttachments` returns `[]`; `hostInterviewViews` an empty Map; `listSeekerInterviews` an empty page; `sendInterviewReminder`, `sweepInterviews`, `onMemberRemoved` and `closeOpenItems` no-op; `register.ts` empty |
  | `hiring/offers/{offers,notes}.ts` | `sendOffer(db: Db, ctx, applicationId, i: OfferInput, now?): Promise<{ offer: HostOfferView }>`, `cancelOffer(db, ctx, offerId)`, `acceptOffer(db, seekerUserId, offerId): Promise<{ offer: SeekerOfferItem; applicationStatus: 'hired' }>`, `declineOffer(db, seekerUserId, offerId): Promise<{ offer: SeekerOfferItem }>`, `listSeekerOffers` (spec 3), `hostOfferViews(db, applicationIds): Promise<Map<string, HostOfferView>>`, `getOfferLetterUrl(db, viewer: ThreadViewer, offerId): Promise<string>`, `loadOfferNote`, `releaseOfferNote` | W3 | `hostOfferViews` an empty Map; `listSeekerOffers` an empty page |
  | `hiring/cards.ts`, `hiring/inbox.ts` | `getCardPayloads(db, i: { viewer: ThreadViewer; cards: ThreadCard[] }): Promise<Record<string, CardPayload>>`; `pendingInboxCount` (spec 3) | W3 | `pendingInboxCount` returns 0 |
  | `hiring/as-described/{open,due,form,summary,register}.ts` | `openAsDescribed(tx: Tx, i: { applicationId: string; hiredSource: 'host' \| 'offer_accepted'; at: Date }): Promise<void>`, `asDescribedDue(db: Db, now: Date): Promise<void>`, `getAsDescribedPrompt(db, seekerUserId, id, now?): Promise<AsDescribedPrompt>`, `submitAsDescribed(db, seekerUserId, id, i: AsDescribedSubmit, now?): Promise<{ ok: true }>`, `getAsDescribedSummary` (spec 3) | W5 | `openAsDescribed` and `asDescribedDue` no-op; `getAsDescribedSummary` returns 0 responses, `visible: false`, zero tallies; `register.ts` empty |
  | `messaging/{threads,send,scan,reads,attachments,replies,bulk,stats,review,register,privacy}.ts` | spec 3's `ensureThread`, `postCard`, `postEvent`, `sendHostMessage` (returning `Promise<string \| null>`, Plan decision 11), `setThreadReadOnly`, `markThreadHired`, `scanHostText` (with Plan decision 9's `orgId` in its input and `'bulk_message'` added to `subjectType`, Plan decision 26), `unreadThreadCount` (with an optional third argument `o?: { orgId?: string }`), `getReplyStats`, `getMessageForReview` (with an optional third argument `o?: { subjectType?: 'message' \| 'bulk_message' }`); plus `threadIdsForApplications(db: DbOrTx, applicationIds: string[]): Promise<Map<string, string>>`, `getThread(db: DbOrTx, viewer: ThreadViewer, threadId: string, o?: { before?: string }): Promise<ThreadView>`, `sendMessage(db: Db, viewer, threadId, i: SendMessageInput): Promise<{ message: MessageView }>`, `markThreadRead(db, viewer, threadId): Promise<void>`, `listThreads(db, viewer, q: { listingId?: string; unread?: boolean; cursor?: string }): Promise<Page<ThreadSummary>>`, `getAttachmentUrl(db, viewer, threadId, mediaId, variant?): Promise<string>`, `runMessageScan(db: Db, payload: unknown): Promise<void>`, `listSavedReplies(db, ctx): Promise<SavedReply[]>`, `createSavedReply(db, ctx, i): Promise<SavedReply>`, `updateSavedReply(db, ctx, id, i): Promise<SavedReply>`, `deleteSavedReply(db, ctx, id): Promise<void>`, `getNotSelectedMessage(db: DbOrTx, orgId: string): Promise<{ body: string; isDefault: boolean }>`, `setNotSelectedMessage(db, ctx, body): Promise<{ body: string; isDefault: false }>`, `createBulkMessage(db: Db, ctx, i: { listingId: string; statuses: ApplicationStatus[]; body: string; applicationIds: string[] }): Promise<{ bulkId: string; recipients: number }>`, `runBulkSend(db: Db, payload: unknown): Promise<void>`, `runMessagingDaily(db: Db, now: Date): Promise<void>`, `privacyHandler`, `retentionRules` (key `messaging.messages_12m`) | W4 | `unreadThreadCount` returns 0; `threadIdsForApplications` an empty Map; `getReplyStats` `{ conversations: 0, medianFirstReplyMinutes: null, usuallyRepliesWithinDay: false }`; `runMessageScan`, `runBulkSend` and `runMessagingDaily` no-op; `register.ts` empty; privacy as hiring's |
  | `hiring/{core,access,notes}.ts`, `messaging/access.ts` | the Task 8 functions (`transitionStatus`, `mirrorStatus`, `recordPipelineEvent`, `staleStatus`, `requireListing`, `requireEntry`, `enqueueNoteScan`, `runNoteScan`, `getNoteForReview`, `listingScope`, `inScope`, `listingTeam`, `requireHiringCapability`) | W0 (Task 8) | `runNoteScan` no-op |
  | `analytics/{ranges,host,csv}.ts` | `resolveRange(range: AnalyticsRange, tz: string, now: Date): { from: Date; to: Date; previous: { from: Date; to: Date } \| null }`, `getHostAnalytics` (spec 3), `toAnalyticsCsv(a: HostAnalytics): string` | W5 | throws |

- **Final in W0:**
  - Types the stub signatures use, declared here so Task 6 typechecks (Task 8 fills the functions beside them): `ListingScope` and `ThreadViewer` in `messaging/access.ts`; `PipelineEntryRow` (the `pipelineEntries` row type) and `TransitionInput` in `hiring/core.ts`; `NoteToScan` and `ScanOutcome` in `hiring/notes.ts`. Input types (`ApplicantsQuery`, `CandidatesQuery`, `HostInterviewsQuery`, `InviteResponse`, `NewRound`, `RequestTimes`, `AsDescribedSubmit`, `SendMessageInput`) are `z.infer` of the Task 5 body or query schemas, without the path params (Plan decision 25), and are exported from `src/lib/{hiring,messaging}/schemas.ts`. `CandidateCard` is SP4's type from `@/modules/profiles`. `Actor` is SP4's type from `@/modules/applications`; `HostContext` comes from `@/server/guards`.
  - `hiring/fit/weights.ts`: `FIT_WEIGHTS` with the spec 8.3 table (categories in the order maritime, seasonal, farm, remote; factors in `FitFactor` order) and `FIT_WEIGHTS_VERSION = 'fit_weights@' + sha256(JSON.stringify(FIT_WEIGHTS)).slice(0, 8)`.
  - `analytics/boost.ts`: `registerBoostWindowsSource(fn: BoostWindowsSource): void` (a second call replaces the first) and `getBoostWindows(db, q): Promise<BoostWindow[]>` (the default source returns `[]`).
  - `analytics/privacy.ts`: `{ module: 'analytics', tables: [], exportData: async () => ({ records: {}, files: [] }), erase: async () => ({ erased: 0, retained: [] }) }`; `retentionRules = []`.
  - Privacy `tables`: hiring `pipeline_entries, pipeline_events, pending_passes, candidate_pool_runs, candidate_pool_entries, invites, interviews, interview_slots, offers, as_described_responses` with `mediaColumns: [{ table: 'offers', column: 'letter_media_id', array: false }]`; messaging `threads, messages, thread_reads, saved_replies, bulk_messages, org_reply_stats` with `mediaColumns: [{ table: 'messages', column: 'attachment_media_ids', array: true }]`.
- **`jobs.ts`.** Each topic delegates to one named function:
  - hiring: `hiring.application_submitted` → `onApplicationSubmitted`, `hiring.application_withdrawn` → `onApplicationWithdrawn`, `hiring.additional_step_changed` → `onAdditionalStepChanged`, `hiring.member_removed` → `onMemberRemoved`, `hiring.commit_pass` → `commitPass`, `hiring.interview_reminder` → `sendInterviewReminder`, `hiring.scan_note` → `runNoteScan` (Task 8), `hiring.sweep` → `sweepInvites` then `sweepInterviews`, `hiring.fit_refresh` → `refreshFit`, `hiring.as_described_due` → `asDescribedDue`
  - messaging: `messaging.scan` → `runMessageScan`, `messaging.bulk_send` → `runBulkSend`, `messaging.daily` → `runMessagingDaily`
- **Shared touchpoints:**
  - `job-handlers.ts` merges `hiring`, `messaging` and `analytics` (`analytics.jobHandlers = {}`).
  - `schedules.ts` appends `hiring.sweep` `*/5 * * * *`, `hiring.fit_refresh` `0 8 * * *`, `hiring.as_described_due` `0 15 * * *` and `messaging.daily` `30 8 * * *`.
  - `event-subscribers.ts` appends `hiring.application_submitted` to `application.submitted`, `hiring.application_withdrawn` to `application.withdrawn`, `hiring.additional_step_changed` to `application.additional_step_changed`, and `hiring.member_removed` to `org.member_removed`.
  - `counts.ts`: `inbox = (await unreadThreadCount(db, userId)) + (await pendingInboxCount(db, userId))`, keeping SP4's `profileDot`.
  - `module-registrations.ts` appends `import '@/modules/hiring'`, `'@/modules/messaging'` and `'@/modules/analytics'`. `privacy-registry.ts`, when present, adds the three handlers and rule lists.
- **Notification types.** None is mandatory. Single emails use `HiringUpdate`; `messages.new` and `hiring.invite_response` batch into `Digest`. `data.url` is set by the sender; titles never contain bodies or notes.

  | Type | Category | Push | Email | Title |
  |---|---|---|---|---|
  | `messages.new` (messaging) | messages | yes | batch `{ key: 'messages', delayMinutes: 15 }`, `digestAction: 'Reply in app'` | `New message from <orgName>` to a seeker, `New message from <firstName>` to a host |
  | `hiring.invite_received` | applications | yes | yes | `<orgName> invited you to apply` |
  | `hiring.invite_expiring` | applications | no | yes | `Your invite from <orgName> expires in 2 days` |
  | `hiring.invite_response` | applications | yes | batch `{ key: 'invites', delayMinutes: 60 }` | `<firstName> is interested` or `<firstName> isn't interested` |
  | `hiring.interview_invited` | applications | yes | yes, `.ics` CANCEL when `icsMethod` is `CANCEL` | `<orgName> invited you to an interview` |
  | `hiring.interview_scheduled` | applications | yes | yes, `.ics` REQUEST | `Interview scheduled: <position>` |
  | `hiring.interview_times_requested` | applications | yes | yes, `.ics` CANCEL when `icsMethod` is `CANCEL` | `<firstName> asked for new interview times` |
  | `hiring.interview_declined` | applications | yes | yes, `.ics` CANCEL when `icsMethod` is `CANCEL` | `<firstName> declined the interview` |
  | `hiring.interview_canceled` | applications | yes | yes, `.ics` CANCEL | `Interview canceled: <position>` |
  | `hiring.interview_expired` | applications | no | no | `Interview invite expired: <position>` |
  | `hiring.interview_reminder_24h` | applications | yes | yes, `.ics` REQUEST | `Interview tomorrow: <position>` |
  | `hiring.interview_reminder_1h` | applications | yes | no | `Interview in 1 hour: <position>` |
  | `hiring.interview_outcome_due` | applications | no | no | `How did the interview with <firstName> go?` |
  | `hiring.offer_received` | applications | yes | yes | `<orgName> sent you an offer` |
  | `hiring.offer_response` | applications | yes | yes | `<firstName> accepted your offer` or `<firstName> declined your offer` |
  | `hiring.marked_hired` | applications | yes | yes | `<orgName> marked you as hired` |
  | `hiring.as_described_prompt` | applications | yes | yes | `Was <position> as described?` |

  Every `.ics` type's `attachments` is `interviewIcsAttachments`. Bodies are one plain line that never repeats user text, for example "Open the conversation to read it."
- [ ] **Step 1: Write the failing tests.**
  - **Registry** (`tests/sp5/registry.test.ts`): every SP5 topic in `schedules` and in the four subscriber lists above has a handler in `handlers`; SP5 topics start with `hiring.` or `messaging.`; `handlers` builds without a duplicate-topic error; running each SP5 handler with `{}` (stubs) doesn't throw.
  - **Exports** (`tests/sp5/exports.test.ts`): every spec section 3 function, and every stub-map name that a route, a page or another module calls, is a function on its module index; the hiring-internal names (`transitionStatus`, `mirrorStatus`, `recordPipelineEvent`, `requireListing`, `requireEntry`, `enqueueNoteScan`, `runNoteScan`, `closeOpenItems`, `openAsDescribed`, the sweep steps and the note loaders and releasers) are functions on their own files and absent from the index. `FIT_WEIGHTS` sums to 100 per category and matches the spec 8.3 table; `FIT_WEIGHTS_VERSION === 'fit_weights@' + createHash('sha256').update(JSON.stringify(FIT_WEIGHTS)).digest('hex').slice(0, 8)`. The 17 notification types exist with the categories and channels above; `messages.new` with `{ audience: 'seeker', threadId: 't' }` has URL path `/inbox/t`, and with `audience: 'host'`, `/host/messages/t`. `privacyHandler.module` is `hiring`, `messaging` and `analytics`, with exactly the table lists above and no table in two lists. `getCounts` for a new seeker gives `inbox: 0`. After `registerBoostWindowsSource(fn)`, `getBoostWindows` calls `fn`.
  - **Architecture** (`tests/sp5/architecture.test.ts`, enforced from now on): the Global Constraints' fit-isolation rules; no file under `src/modules/messaging/` matches `@/modules/(hiring|analytics)`; no file under `src/modules/hiring/` matches `@/modules/analytics`.
- [ ] **Step 2:** Run `pnpm test tests/sp5`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp5): module skeletons, notification types, schedules and subscribers`.

### Task 7 (W0): Route contracts, fakes and test helpers

**Files:**
- Create: every route file below (stubs), `src/server/thread-viewer.ts`, `src/server/thread-viewer.test.ts`, `tests/fakes/sp5/{sp2,sp3,sp4,messaging}.ts`, `tests/fakes/sp5/fakes.test.ts`, `tests/helpers/sp5.ts`, `tests/sp5/routes.test.ts`
- Modify: `src/app/api/v1/openapi.json/route.ts` (one sorted import per new file)

**Interfaces:**
- **Route files** (under `src/app/api/v1/`). Each declares its final `apiRoute` options (auth, input schema from Task 5, `rateLimit`, `openapi` with the public `{param}` path) and a handler that throws `new Error('not implemented')`. The owner writes the handler. Rate-limit keys use `ctx.host.orgId` or `ctx.user.id`.
- **Inputs carry the path params** (Plan decision 25). `apiRoute` merges dynamic segments into the input and `ApiContext` has no `params`, so in the Input column `X + P` means the route validates `X.safeExtend(P.shape)`, and a param schema alone means the route has no body or query. The handler reads the ID from `input` and passes the rest to the service, whose input type is `z.infer<typeof X>`.

  | File | Methods | auth | Input | Rate limit | Owner |
  |---|---|---|---|---|---|
  | `host/home/route.ts` | GET | host | `homeQuerySchema` | – | W1 |
  | `host/applicants/route.ts` | GET | host | `applicantsQuerySchema` | – | W1 |
  | `host/applicants/[applicationId]/route.ts` | GET | host | `applicationParamSchema` | – | W1 |
  | `host/applicants/[applicationId]/{shortlist,pass,pass/undo,hire}/route.ts` | POST | host | `shortlistSchema + applicationParamSchema` (shortlist), `applicationParamSchema` (others) | – | W1 |
  | `host/applicants/[applicationId]/interviews/route.ts` | POST | host | `interviewProposalSchema + applicationParamSchema` | `interviews:<userId>` 30/3600 | W3 |
  | `host/applicants/[applicationId]/offers/route.ts` | POST | host | `offerInputSchema + applicationParamSchema` | – | W3 |
  | `host/listings/[id]/candidates/route.ts` | GET | host | `candidatesQuerySchema + idParamSchema` | – | W2 |
  | `host/candidates/[candidateId]/{save,hide}/route.ts` | PUT, DELETE | host | `candidateParamSchema` | – | W2 |
  | `host/invites/route.ts` | GET, POST | host | `hostInvitesQuerySchema`, `sendInviteSchema` | POST `invites:<orgId>` 100/3600 | W2 |
  | `host/invites/[id]/candidate/route.ts` | GET | host | `idParamSchema` | – | W2 |
  | `host/interviews/route.ts` | GET | host | `hostInterviewsQuerySchema` | – | W3 |
  | `host/interviews/[id]/{propose,cancel,outcome}/route.ts` | POST | host | `newRoundSchema`, `cancelInterviewSchema`, `outcomeSchema`, each `+ idParamSchema` | propose: `interviews:<userId>` | W3 |
  | `host/offers/[id]/cancel/route.ts` | POST | host | `idParamSchema` | – | W3 |
  | `host/threads/route.ts` | GET | host | `hostThreadsQuerySchema` | – | W4 |
  | `host/listings/[id]/bulk-messages/route.ts` | POST | host | `bulkMessageSchema + idParamSchema` | `bulk:<orgId>` 5/3600 | W4 |
  | `host/saved-replies/route.ts` | GET, POST | host | –, `savedReplySchema` | – | W4 |
  | `host/saved-replies/[id]/route.ts` | PATCH, DELETE | host | `savedReplyPatchSchema + idParamSchema`, `idParamSchema` | – | W4 |
  | `host/not-selected-message/route.ts` | GET, PUT | host | –, `notSelectedSchema` | – | W4 |
  | `host/analytics/route.ts`, `host/analytics/export.csv/route.ts` | GET | host | `analyticsQuerySchema` (from `@/lib/host-analytics`) | export: `export:<userId>` 20/3600 | W5 |
  | `me/invites/route.ts`, `me/invites/[id]/route.ts` | GET | seeker | `cursorQuerySchema`, `idParamSchema` | – | W2 |
  | `me/invites/[id]/{respond,mute}/route.ts` | POST | seeker | `inviteResponseSchema + idParamSchema`, `idParamSchema` | – | W2 |
  | `me/interviews/route.ts` | GET | seeker | `cursorQuerySchema` | – | W3 |
  | `me/interviews/[id]/{pick,request-times,decline}/route.ts` | POST | seeker | `pickSlotSchema`, `requestTimesSchema`, `declineInterviewSchema`, each `+ idParamSchema` | pick and request-times: `interviews:<userId>` | W3 |
  | `me/offers/route.ts`, `me/offers/[id]/{accept,decline}/route.ts` | GET, POST | seeker | `cursorQuerySchema`, `idParamSchema` | – | W3 |
  | `me/threads/route.ts` | GET | seeker | `cursorQuerySchema` | – | W4 |
  | `me/as-described/[id]/route.ts` | GET, POST | seeker | `idParamSchema`, `asDescribedSubmitSchema + idParamSchema` | – | W5 |
  | `threads/[id]/route.ts` | GET | user | `threadQuerySchema + idParamSchema` | – | W4 |
  | `threads/[id]/messages/route.ts` | POST | user | `sendMessageSchema + idParamSchema` | `messages:<userId>` 60/600 | W4 |
  | `threads/[id]/read/route.ts` | POST | user | `idParamSchema` | – | W4 |
  | `threads/[id]/attachments/[mediaId]/route.ts` | GET | user | `attachmentQuerySchema + attachmentParamSchema` | – | W4 |
  | `interviews/[id]/ics/route.ts` | GET | user | `idParamSchema` | – | W3 |
  | `offers/[id]/letter/route.ts` | GET | user | `idParamSchema` | – | W3 |

  `host/listings/[id]/…` routes map `id` to `listingId` (Plan decision 8).
- `threadViewer(user: CurrentUser): Promise<ThreadViewer>` in `src/server/thread-viewer.ts`: a seeker gives `{ kind: 'seeker', userId }`; a host gives `{ kind: 'host', ctx: await requireHost() }`; anyone else gets `forbidden`.
- **Fakes** (`tests/fakes/sp5/`), each typed `satisfies Partial<typeof import('@/modules/<m>')>` and used as `vi.mock('@/modules/<m>', async (orig) => ({ ...(await orig()), ...<m>Fake }))`, each with `reset*()` and a `calls` log:
  - `sp2.ts`: `listingsFake` (`getHiringInfoMany`, `listForOrg`, `getListingSummaries`, `listOccupations`; setter `setListing(i: Partial<ListingHiringInfo> & { id: string; orgId: string })`, defaulting to an active Seasonal "Lift Operator" listing in CO); `orgsFake` (`listMembers`, `getListingAccess`, `canAccessListing`, `getOrgSummaries`; setters `setMembers(orgId, members)` and `setAccess(userId, access)`); `entitlementsFake` (`consume`, `getBalance`, `reverse` with the real semantics over an in-memory balance; `setCredits(orgId, n)`); `hostpagesFake` (`countFollowersAt`, `getHostIdentities`, capturing `registerHostPageProvider`).
  - `sp3.ts`: `discoveryFake` (`getListingEventCounts` from `setEventCounts(rows)`, `getJobCards` from `setJobCard(listingId, card)`, `toHourlyCents` returning `{ minCents, maxCents }` for `unit: 'hour'` and null otherwise).
  - `sp4.ts`: `applicationsFake` (`setStatus` enforcing `TRANSITIONS` from `@/lib/applications` and returning `{ ok: false, current }` on a stale `from`; `withdraw`; `getHostCards`; `getSnapshot`; setter `seedApplication(i)`); `profilesFake` (`getFitInputs`, `queryPoolCandidates`, `getCandidateCards`, `grantReveal`, `getCommunityIdentities`; setters `setPoolSeeker(card, inputs)` and `setRevealed(orgId, userId)`); `safetyFake` (`getRelationships`, `isBlockedBetween`, `mute`, capturing `registerReportSubject`; setters `setBlocked(orgId, userId)` and `setMuted(orgId, userId)`).
  - `messaging.ts`: `messagingFake` for hiring tests: `ensureThread`, `postCard`, `postEvent`, `sendHostMessage` (returns a new ID, or null for a thread passed to the setter `setUndeliverable(threadId)`), `setThreadReadOnly`, `markThreadHired`, `threadIdsForApplications`, `getNotSelectedMessage`, `unreadThreadCount`, and `scanHostText` by marker (`__block__` → `held`, `__flag__` → `warn`, otherwise `clear`). The real `listingScope`, `listingTeam` and `requireHiringCapability` stay.
- **`tests/helpers/sp5.ts`:** `seedEntry(db, i: { orgId: string; listingId: string; seekerUserId: string; locationId?: string | null; status?: ApplicationStatus; source?: string; appliedAt?: Date; fitScore?: number | null }): Promise<string>` (also seeds `applicationsFake`); `seedInvite`, `seedInterview` (with slots), `seedOffer` and `seedThread` (each `(db, i): Promise<string>`); `envelope(event, data, eventId?)` (an `EventEnvelope` as `emit` writes it); and re-exports of SP2's `seedHostOrg`, `seedMember`, `seedSeeker`, `seedMedia` and `FIXED_NOW`.
- [ ] **Step 1: Write the failing tests.**
  - `tests/sp5/routes.test.ts`: after importing the openapi.json route, `buildOpenApi().paths` has every one of the 52 method and path pairs above (written out as a constant array); each `/api/v1/host/` operation is documented with auth `host`, each `/api/v1/me/` operation with `seeker`, the rest with `user`.
  - *(Plan decision 25)* In the same test, every path parameter of every SP5 operation has `schema.format === 'uuid'`, which proves it comes from the route's input schema and not from `buildOpenApi`'s `{ type: 'string' }` fallback; no `requestBody` schema lists a path parameter; and `/api/v1/host/applicants/{applicationId}/shortlist` has the body property `on`. With `@/server/api` mocked so `apiRoute` records each route's options, the shortlist route's options rebuilt with `handler: async ({ input }) => input` and called with `POST { on: true }` and params `{ applicationId }` (guards mocked with SP4's helpers) answer `{ on: true, applicationId }`: the ID reaches the handler. Task 10's route test repeats this through the real handler.
  - `threadViewer`: a host user with `requireHost` mocked → `{ kind: 'host', ctx }`; an operator → `forbidden`.
  - `fakes.test.ts`: no fake function throws `not implemented`. `applicationsFake.setStatus` with a seeker actor from `new` to `shortlisted` throws `forbidden`, and with a stale `from` returns `{ ok: false, current }`. `entitlementsFake.consume` at balance 0 returns `{ ok: false, reason: 'insufficient', remaining: 0 }`. `messagingFake.scanHostText` maps the markers.
- [ ] **Step 2:** Run `pnpm test tests/sp5/routes.test.ts tests/fakes/sp5 src/server/thread-viewer.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp5): route contracts, thread viewer, sibling fakes and test helpers`.

### Task 8 (W0): Pipeline core, listing scope and note dispatch

**Files:**
- Modify: `src/modules/messaging/access.ts`, `src/modules/hiring/access.ts`, `src/modules/hiring/core.ts`, `src/modules/hiring/notes.ts` (Task 6 created them with their types and stub functions)
- Test: `src/modules/messaging/access.test.ts`, `src/modules/hiring/core.test.ts`, `src/modules/hiring/notes.test.ts`

**Interfaces:**
- Consumes: SP2 `orgs.getListingAccess`, `canAccessListing`, `listMembers`, `requireCapability`, `getOrgSummaries`; `listings.getHiringInfoMany`, `listForOrg` (Task 3); SP4 `applications.setStatus`, type `Actor`; messaging stubs (mocked with the Task 7 fakes); the types declared in Task 6
- Produces, `@/modules/messaging` (real):
  - `type ListingScope = { all: true } | { all: false; listingIds: string[] }`; `listingScope(db: DbOrTx, ctx: HostContext): Promise<ListingScope>` (Plan decision 7; `listingIds` sorted); `inScope(scope: ListingScope, listingId: string): boolean`.
  - `listingTeam(db: DbOrTx, i: { orgId: string; listingId: string }): Promise<string[]>`: user IDs of the listing's `notifyMemberIds` (matched by `membershipId` in `listMembers`) with role owner, admin or recruiter who pass `canAccessListing`; if none remain, the Owner and Admins who pass it (SP4's rule).
  - `requireHiringCapability(ctx: HostContext, cap: 'applicants.access' | 'messages.access' | 'invites.send'): void`, a wrapper over `orgs.requireCapability`.
  - `type ThreadViewer = { kind: 'seeker'; userId: string } | { kind: 'host'; ctx: HostContext }`.
- Produces, `@/modules/hiring` internals (real):
  - `requireListing(db: DbOrTx, ctx: HostContext, listingId: string): Promise<ListingHiringInfo>`: `notFound('Listing not found')` unless the listing is the org's and `canAccessListing` passes.
  - `requireEntry(db: DbOrTx, ctx: HostContext, applicationId: string, o?: { forUpdate?: boolean }): Promise<PipelineEntryRow>`: `notFound(APPLICATION_UNAVAILABLE)` unless the entry is the org's and its listing is in scope.
  - `type TransitionInput = { applicationId: string; from: ApplicationStatus[]; to: ApplicationStatus; actor: Actor; eventKind: PipelineEventKind; hiredSource?: 'host' | 'offer_accepted' }`.
  - `transitionStatus(tx: Tx, i: TransitionInput, now?: Date): Promise<{ ok: true; from: ApplicationStatus } | { ok: false; current: ApplicationStatus }>`: locks the entry, calls `applications.setStatus(tx, { applicationId, from, to, actor })`; on `ok: false` sets the entry's status to `current` and returns it. On `ok`: updates `status` and `last_status_at` (plus `hired_source` and `hired_at` for `hired`), writes the pipeline event, records audit `hiring.status_changed` with `orgId` and `{ from, to }`, then runs the hooks: `closeOpenItems` (W3) when `to` is `not_selected` or `withdrawn`; for `hired`, `openAsDescribed` (W5), `messaging.markThreadHired` and `messaging.postEvent(…, { code: 'hired', visibleTo: 'all' })` on the application's thread.
  - `mirrorStatus(tx: Tx, i: { applicationId: string; to: ApplicationStatus; actor: Actor; eventKind: PipelineEventKind; at: Date }): Promise<boolean>`: the same mirror update, event, audit and hooks without calling SP4 (SP4 already changed it); false when the entry already has that status.
  - `recordPipelineEvent(tx: Tx, e: { orgId: string; listingId: string; locationId: string | null; applicationId?: string; inviteId?: string; kind: PipelineEventKind; source?: string; actor: Actor; at?: Date }): Promise<void>`.
  - `staleStatus(current: ApplicationStatus): AppError`: `conflict('This applicant was updated. Refresh to see the latest.', { reason: 'stale_status', current })`.
  - `type NoteToScan = { orgId: string; text: string; createdAt: Date }`; `type ScanOutcome = { state: 'clear' | 'warn' | 'held'; checkId: string; labels: string[] }`.
  - `enqueueNoteScan(tx: Tx, subjectType: 'invite' | 'interview' | 'offer', subjectId: string): Promise<void>` (topic `hiring.scan_note`, dedupe `note:<type>:<id>`).
  - `runNoteScan(db: Db, payload: unknown): Promise<void>`: loads with the area's `load*Note` (null means already released, so it stops), calls `messaging.scanHostText(db, { subjectType, subjectId, text, orgId })`, then runs the area's `release*Note(tx, id, outcome)` in one transaction.
  - `getNoteForReview(db: DbOrTx, i: { subjectType: 'invite' | 'interview' | 'offer'; subjectId: string }): Promise<{ text: string; orgName: string; sentAt: Date } | null>` (exported from the index).
- [ ] **Step 1: Write the failing tests** (with the Task 7 fakes).
  - **Scope:** a Recruiter assigned `{ listingIds: [C], locationIds: [L1] }` with listings A (L1), B (L2), C (L2) → `listingScope` = `{ all: false, listingIds: [A, C] }` (sorted). `requireListing` on B throws `not_found`; on A it returns A's info. An Owner gets `{ all: true }`.
  - **Team:** notify list `[recruiter scoped out, admin]` → `[admin]`; an empty notify list → the Owner and the Admin; a Billing member is never included.
  - **Core:** `transitionStatus({ from: ['new'], to: 'shortlisted', actor: host, eventKind: 'shortlisted' })` → ok; the entry is `shortlisted`; one `pipeline_events` row with kind `shortlisted` and `actor_type = 'host'`; one `hiring.status_changed` audit row with `orgId` and `{ from: 'new', to: 'shortlisted' }`.
  - When SP4's fake returns `{ ok: false, current: 'withdrawn' }` → `{ ok: false, current: 'withdrawn' }`, the entry's status is `withdrawn`, and no event is written.
  - `to: 'hired'` with `hiredSource: 'host'` sets `hired_source` and `hired_at`, calls `markThreadHired` and `postEvent` with `{ code: 'hired', visibleTo: 'all' }`, and calls the mocked `openAsDescribed` once. `to: 'not_selected'` calls the mocked `closeOpenItems` with `{ reason: 'not_selected' }`.
  - `mirrorStatus` to `withdrawn` twice → true then false, with one event row.
  - **Notes:** with `loadInviteNote` mocked to return text `'__block__'` and the messaging fake, `runNoteScan` calls `releaseInviteNote` with `state: 'held'`; with the loader returning null, `scanHostText` isn't called. `getNoteForReview` returns the loader's text and the org's name.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging/access.test.ts src/modules/hiring/core.test.ts src/modules/hiring/notes.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(sp5): pipeline transition core, listing scope, listing team and note dispatch`.

---

## Phase B1: Domain workstreams (in parallel; one worktree per workstream, based on Phase A)

Each workstream replaces its own stubs and keeps every Task 6 signature. Tests mock SP2, SP3 and SP4 with `tests/fakes/sp5/*`; hiring workstreams also mock `@/modules/messaging` with `messagingFake`, and mock a sibling hiring area at its file path (Plan decision 17). Foundation modules are real. Every route is thin: the W0 options, `requireHiringCapability` for host routes, one service call, and `kickWorker()` when the service enqueued a job. The service functions carry the tests; route tests (with SP4's route helpers) cover authorization and status codes.

### Task 9 (W1): SP4 event handlers and the hires stats provider

**Files:**
- Modify: `src/modules/hiring/pipeline/{handlers.ts,register.ts}`
- Test: `src/modules/hiring/pipeline/handlers.test.ts`

**Interfaces:**
- Consumes: `readEnvelope` (`@/modules/jobs`); `getHiringInfoMany` (fake); `mirrorStatus`, `recordPipelineEvent` (Task 8); `ensureThread`, `postCard`, `postEvent`, `setThreadReadOnly`, `threadIdsForApplications` (fake); `scoreApplications` (W2, mocked at `@/modules/hiring/fit-store`); `registerListingStatsProvider` (SP2)
- Produces:
  - `onApplicationSubmitted`: reads `application.submitted`. In one transaction: inserts the entry (`status 'new'`, `source`, `applied_at = submittedAt`, `location_id` from hiring info) `on conflict do nothing`, and stops if nothing was inserted. Then writes event `applied` with `source`; sets any `sent` or `interested` invite for that listing and seeker to `applied` (`responded_at` kept if set) and writes `invite_applied` for it; calls `ensureThread({ orgId, listingId, seekerUserId, applicationId })` and `postCard(threadId, { type: 'application', refId: applicationId }, seekerUserId)`. After the commit it calls `scoreApplications(db, { listingId, applicationIds: [applicationId] })`. It notifies no one (SP4 sends `applications.new_applicant`).
  - `onApplicationWithdrawn`: reads `application.withdrawn`. With no entry yet it throws `Error('pipeline entry not ready')`, so the outbox retries. Otherwise, in one transaction: `mirrorStatus(to 'withdrawn', actor seeker, eventKind 'withdrawn')` (whose hook closes the interview and offer), deletes any pending pass, `postEvent(thread, { code: 'withdrawn', visibleTo: 'all' })` and `setThreadReadOnly(thread, 'withdrawn')`. A second delivery changes nothing.
  - `onAdditionalStepChanged`: sets `additional_step_done = completed`.
  - `register.ts`: `registerListingStatsProvider('hiring', …)` returning `{ hires }` per listing (entries with status `hired`).
- [ ] **Step 1: Write the failing tests.**
  - The same `application.submitted` envelope handled twice → one entry, one `applied` event, `ensureThread` and `postCard` once each, the card `{ type: 'application', refId }`. `source: 'swipe'` is stored, with `location_id` from the listing.
  - A `sent` invite for that listing and seeker becomes `applied` with one `invite_applied` event; an `expired` one stays `expired`.
  - `scoreApplications` was called with `{ listingId, applicationIds: [id] }`. `notify` (spied) was never called.
  - `application.withdrawn` before any entry throws `pipeline entry not ready`. After the entry exists: status `withdrawn`, the pending pass row gone, `postEvent` with `withdrawn`, `setThreadReadOnly` with `'withdrawn'`; a second delivery adds no event.
  - `application.additional_step_changed` with `completed: true` sets the column true.
  - The stats provider returns `{ hires: 2 }` for a listing with 2 hired entries and 1 new one.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/pipeline/handlers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): SP4 application events and the hires stats provider`.

### Task 10 (W1): Shortlist, Pass with Undo, and Mark hired

**Files:**
- Modify: `src/modules/hiring/pipeline/{actions.ts,pass.ts}`; the handlers of `host/applicants/[applicationId]/{shortlist,pass,pass/undo,hire}/route.ts`
- Test: `src/modules/hiring/pipeline/pass.test.ts` (E2), `src/modules/hiring/pipeline/actions.test.ts`, `src/app/api/v1/host/applicants/[applicationId]/pass/route.test.ts`

**Interfaces:**
- Consumes: `requireEntry`, `transitionStatus`, `staleStatus` (Task 8); `getNotSelectedMessage`, `fillTemplate`, `sendHostMessage`, `threadIdsForApplications` (fake); `applications.getHostCards`, `orgs.getOrgSummaries`, `orgs.listMembers` (fakes); `notify`, `record`, `enqueue`, `track`
- Produces:
  - `shortlist`: `on` moves `new → shortlisted`, off moves `shortlisted → new` (events `shortlisted`, `unshortlisted`); stale gives 409 `stale_status`.
  - `pass`: the entry must be `new`, `shortlisted`, `interviewing` or `offered`, else 409 `stale_status`. It writes `pending_passes` with `commit_at = now + PASS_UNDO_MS` (a second pass while one is pending returns the same `undoUntil`), enqueues `hiring.commit_pass` with payload `{ applicationId, commitAt }`, `availableAt: commit_at` and dedupe `pass:<applicationId>:<commitAtMs>`, and records `hiring.pass_scheduled`.
  - `undoPass`: deletes the pending pass only while `now < commit_at`, else 409 `undo_expired`; records `hiring.pass_undone`; returns the current status.
  - `commitPass`: in one transaction, deletes the pending pass matching `commitAt`; if none, stops. Otherwise `transitionStatus(from new/shortlisted/interviewing/offered, to 'not_selected', actor host = the passer, eventKind 'not_selected')`. On success it sends the org's Not selected text (`getNotSelectedMessage`, filled with the seeker's first name, the listing title, the org name and the passer's first name) through `sendHostMessage` with the passer as sender, and records `hiring.pass_committed`. A null from `sendHostMessage` (a read-only thread, or a block either way; Plan decision 11) is not an error: the status change stands and no message exists.
  - `markHired`: `transitionStatus(from new/shortlisted/interviewing, to 'hired', hiredSource 'host', eventKind 'hired')`; notifies the seeker `hiring.marked_hired`; records `hiring.marked_hired`; `track('hiring.hired', { applicationId, listingId })`.
- [ ] **Step 1: Write the failing tests** (time passed as `now`; the worker run with `runWorker(db, { handlers, now })`).
  - **E2, undo:** pass at `FIXED_NOW` → `undoUntil` = `FIXED_NOW` + 10 s. Undo at + 9,999 ms → `{ status: 'new' }` and no pending row. A worker run at + 11 s sends nothing (`messagingFake.calls.sendHostMessage` is empty) and the status stays `new`.
  - **E2, no undo:** a worker run at + 5 s does nothing; at + 11 s the SP4 status is `not_selected` and `sendHostMessage` was called exactly once with body "Hi Maya, thank you for applying for Lift Operator at Kettle Ridge Lodge. We've decided to move forward with other candidates for this role. We wish you the best with your search." A second run adds nothing.
  - Undo at exactly + 10 s → 409 `undo_expired`, and the commit still happens.
  - With `getNotSelectedMessage` returning `{ body: 'Thanks {first_name}', isDefault: false }`, the message is "Thanks Maya".
  - **Withdraw during the window** (spec failure mode 2): the fake reports `withdrawn` at commit → no message, and the entry mirror reads `withdrawn`.
  - **Actions:** shortlist on and off; shortlist on a withdrawn application → 409 `stale_status` with `details.current: 'withdrawn'`, and the mirror reads `withdrawn` after the call. `markHired` from `interviewing` → `hired`, one `hiring.marked_hired` notification for the seeker, one audit row; from `offered` → 409 `stale_status`.
  - After `messagingFake.setUndeliverable(threadId)`, `commitPass` doesn't throw, the status is `not_selected`, and `hiring.pass_committed` is recorded.
  - **Route:** a Billing member gets 403; a Recruiter outside the listing's scope gets 404. *(Plan decision 25)* `POST /host/applicants/<id>/shortlist` with `{ on: true }` calls `shortlist` with that `applicationId` and `on: true`, and `POST …/pass` with an empty body calls `pass` with it.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/pipeline src/app/api/v1/host/applicants`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): shortlist, pass with 10-second undo, mark hired`.

### Task 11 (W1): Applicants API, applicant detail, host Home and hiring privacy

**Files:**
- Modify: `src/modules/hiring/pipeline/{applicants.ts,home.ts}`, `src/modules/hiring/privacy.ts`; the handlers of `host/home`, `host/applicants`, `host/applicants/[applicationId]`
- Test: `src/modules/hiring/pipeline/{applicants,home}.test.ts`, `src/modules/hiring/privacy.test.ts`

**Interfaces:**
- Consumes: `listingScope`, `inScope`, `requireEntry` (Task 8); `getHostCards`, `getSnapshot` (fake); `getPublicMediaUrls` and `getStorage` (media); `hostInterviewViews`, `hostOfferViews`, `listHostInterviews` (W3, mocked); `unreadThreadCount`, `threadIdsForApplications` (fake); `localDayRange` (Task 5); `getHiringInfoMany`, `listForOrg` (fake)
- Produces:
  - `listApplicants`: scoped entries; `listingId` outside scope is 404; `status` filters; sorts `newest` (`applied_at desc, application_id desc`), `oldest`, `fit` (`fit_score desc nulls last`, then `applied_at desc`), `activity` (`last_status_at desc`); keyset cursor (base64url of the sort key and ID); `counts` per status over the same filters except `status`. Items carry SP4's card, 640 px `avatarUrl` and `coverUrl`, `undoUntil` from a pending pass, `threadId`, and `fitScore` (null when fit was off).
  - `getApplicantDetail`: `requireEntry`; `getSnapshot` null gives 404 `APPLICATION_UNAVAILABLE`; `fit` from the stored columns or null; `history` ascending; the latest interview and offer from `hostInterviewViews` and `hostOfferViews`.
  - `listApplicationIdsByStatus`: application IDs of one listing in the given statuses, never `withdrawn`.
  - `getHostHome`: `todayApplicants` (scoped entries with `applied_at` in `localDayRange(tz, now)`), `todayInterviews` (`listHostInterviews` over the same range), `unreadThreads` (`unreadThreadCount(db, ctx.user.id, { orgId: ctx.orgId })`), `openingsFilled` (scoped active listings whose hired count ≥ `openings`).
  - `getOrgHiringSummary` (spec 3): `invitesSent` excludes held invites; `activeInterviews` counts `invited`, `scheduled` and `reschedule_requested`.
  - **Privacy:** `exportData` for a user gives records `invites` (title, org, note, status, dates), `interviews` (status, slots, scheduled times, format, the host's note), `offers` (position, start date, pay, note, status), `as_described` (their answers) and `fit` (each of their applications' `fit_score` and `fit_lines`), plus their offer letters as files. `erase` for a user deletes their invites and pool entries, sets `as_described_responses.seeker_user_id` to null, keeps pipeline rows, and returns `retained: [{ table: 'pipeline_entries', reason: 'shared_record', until: <latest last_status_at + 12 months> }]`. With `holds` containing `applications` or `all`, it changes nothing and returns the `legal_hold` entry. `erase` for an org deletes its pool runs, pool entries and pending passes. `retentionRules['hiring.notes_12m']` nulls `invites.note`, `interviews.note`, `interviews.request_note` and `offers.note` once the entry is terminal and `last_status_at` is over 12 months old (invites: `coalesce(responded_at, expires_at)` over 12 months old).
- [ ] **Step 1: Write the failing tests.**
  - A Recruiter scoped to location L1 sees applicants on listing A (L1) only; `listingId: B` → 404. A Billing member gets 403 at the route.
  - Sort `fit` over scores 80, null and 95 gives 95, 80, null. `limit: 2` over 3 gives 2 items and a cursor, then 1 item and `nextCursor: null`.
  - With `status: ['new']`, `counts` still reports `shortlisted: 1`.
  - `avatarUrl` is null when the card's `avatarMediaId` is null.
  - Detail: history in order; `fit: null` when `fit_score` is null; `getSnapshot` returning null → 404 with message "This application isn't available".
  - *(Review Focus 1)* Home with `tz: 'America/Anchorage'` at `2027-01-15T08:30:00Z`: an application at `2027-01-14T10:00:00Z` counts and one at `2027-01-14T08:59:00Z` doesn't, so `todayApplicants === 1`.
  - `openingsFilled` lists an active listing with `openings: 1` and one hire, and not a closed one.
  - Privacy: erasing a seeker deletes their invites and pool entries, nulls `seeker_user_id` on their As-described row with its answers kept, keeps the entries; a second run returns `erased: 0` with the same `retained`. `holds: ['applications']` deletes nothing. `exportData` includes their application's `fit_score` and no other seeker's ID. The retention rule nulls an invite note from 13 months ago and keeps one from 11 months ago.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/pipeline src/modules/hiring/privacy.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): applicants API, applicant detail, host Home data, privacy and retention`.

### Task 12 (W2): Fit engine (E3)

**Files:**
- Modify: `src/modules/hiring/fit/{compute.ts,lines.ts,listing.ts}`
- Test: `src/modules/hiring/fit/fit.test.ts`

**Interfaces:**
- Consumes: `FIT_WEIGHTS`, `FIT_WEIGHTS_VERSION` (Task 6); `normalizeSkill` (SP2); `stateByCode` (`@/lib/discovery`)
- Produces:
  - `computeFit(i, l, w, version)` (pure): spec 8.3 values. A factor whose data is missing on either side is left out (no `occupationCodes` and no `categories`; null `availabilityDate`; no listing skills; no required certifications; null `workAuthorization`; null `minPay` or null `maxPayHourlyCents`; Remote with null `remoteStates`). Score = `Math.round(100 × Σ(weight × value) / Σ weight)` over the factors left, using the listing's primary category's weights; with no factor left, `score: 0, lines: []`. Lines follow `FitFactor` order; `weight` is the category weight.
    - Availability: with an end date, 1 when `availabilityDate ≤ startDate`, 0 when after `endDate`, else `days(availabilityDate → endDate) / days(startDate → endDate)`. With no end date, `max(0, 1 − daysLate / 90)`.
    - Work authorization `has_visa`: 1 when `endsOn ≥ endDate` (or ≥ `startDate` with no end date), else 0.5. `needs_sponsorship`: 1 when the listing's `sponsorship` is in `visaTypes`, else 0.
    - Pay: the seeker's minimum per hour is `cents` (hour), `cents / 8` (day) or `cents / 52 / weeklyHours` (year); 1 when `maxPayHourlyCents ≥` it, 0.5 when `≥ 0.9 ×` it, else 0.
    - Location: on-site 1 when `willingToRelocate` or the listing's `state` is in `preferredStates`, else 0.3 (`region` is never read). Remote 1 when `countryCode === 'US'` and `region` is in `remoteStates` (any state for `'all_us'`), else 0.
  - **Template lines** (exact; `<Mon D>` is `formatInZone`'s `'date'` style for the date):

    | Factor | Value | Text |
    |---|---|---|
    | occupation | 1 · 0.6 · 0 | `Interested in <occupationLabel>` · `Interested in <Maritime\|Seasonal\|Farm\|Remote> jobs` · `Hasn't listed this occupation` |
    | availability | 1 | `Available for your full dates` (end date) · `Available by your start date` (no end date) |
    | availability | late · after end | `Available from <Mon D>, <n> day(s) after your start` · `Available from <Mon D>, after your end date` |
    | skills | k/n | `<k> of <n> listed skills` |
    | certifications | k/n | `Lists <k> of <n> required certifications` |
    | work_authorization | authorized · visa ok · visa early | `Authorized to work in the US (self-reported)` · `Has a work visa covering your dates (self-reported)` · `Work visa ends before your end date (self-reported)` (`start date` with no end date) |
    | work_authorization | sponsorship offered · not offered | `Needs <J-1\|H-2A\|H-2B> sponsorship, which you offer` · `Needs visa sponsorship you don't offer` |
    | pay | 1 · 0.5 · 0 | `Pay meets their expectations` · `Pay is just below their stated minimum` · `Pay is below their stated minimum` |
    | location (on-site) | relocate · preferred · neither | `Willing to relocate` · `Prefers jobs in <State name>` · `Hasn't said they'd relocate to <State name>` |
    | location (Remote) | in · out | `Lives in a state you hire from` · `Lives outside the states you hire from` |

    Lines never contain amounts, the seeker's other preferred states, or their own state.
  - `certKey(label)`: NFKC, trim, collapse spaces, lowercase (SP4's `cert_key`). `toFitListing(h, x)`: `skillKeys` = unique `normalizeSkill(s).key`; `requiredCertificationKeys` = unique `certKey`; `startDate` = `h.startDate ?? x.today`; `weeklyHours` = `h.when.weeklyHours`. `toPoolListing(h)` (spec 8.2).
- [ ] **Step 1: Write the failing tests** (`fit.test.ts`). Four fixtures, all `countryCode: 'US'`:
  - **Seasonal** (listing: occupation `lift_operator` "Lift operator", 2027-06-01 to 2027-08-31, 40 h/week, 10 skills, no certifications, sponsorship `none`, state CO, `maxPayHourlyCents` 2200; seeker: occupation `lift_operator`, available 2027-06-01, 8 of the 10 skills, `authorized`, `minPay` 2000/hour, prefers CO) → score **97**; lines occupation "Interested in Lift operator", availability "Available for your full dates", skills "8 of 10 listed skills", work_authorization "Authorized to work in the US (self-reported)", pay "Pay meets their expectations", location "Prefers jobs in Colorado"; no certifications line.
  - **Maritime** (listing `deckhand` "Deckhand", 2027-05-01 to 2027-09-30, 60 h/week, 4 skills, certifications TWIC and STCW, state AK, max 2500/hour; seeker: category `maritime` only, available 2027-05-01, 3 of 4 skills, TWIC with no expiry and STCW expiring 2027-04-01, `has_visa` ending 2027-08-01, `minPay` 20000/day, willing to relocate) → score **73**; lines include "Interested in Maritime jobs", "3 of 4 listed skills", "Lists 1 of 2 required certifications", "Work visa ends before your end date (self-reported)", "Willing to relocate".
  - **Farm** (listing `farmhand` "Farmhand", 2027-07-01 to 2027-10-31, 40 h/week, 5 skills, sponsorship `h2a`, state CA, max 1800/hour; seeker: occupation `farmhand`, no availability, 5 of 5 skills, `needs_sponsorship` `['h2a']`, `minPay` 3600000/year, prefers OR, `region: 'CA'`) → score **89**; lines include "Needs H-2A sponsorship, which you offer" and "Hasn't said they'd relocate to California", and no availability line.
  - **Remote** (listing `support_agent` "Support agent", start 2027-01-04, no end, 40 h/week, 4 skills, remote states CO and UT, max 2000/hour; seeker: category `remote`, occupation `line_cook`, available 2027-01-22, 1 of 4 skills, `authorized`, `minPay` 2400/hour, `region: 'UT'`) → score **56**; lines include "Interested in Remote jobs", "Available from Jan 22, 18 days after your start", "Pay is below their stated minimum", "Lives in a state you hire from".
  - **On-site ignores the seeker's state** (E3): the Farm fixture with `region: 'CA'`, `'TX'` or null gives the same location value, 0.3.
  - **Values:** fixed dates 2027-06-01 to 2027-08-30 with availability 2027-06-10 → availability value `0.9`, text "Available from Jun 10, 9 days after your start". `minPay` 2400/hour with max 2200 → pay value `0.5`. A Remote seeker with `countryCode: 'CA'` → location value 0.
  - **Allowlist** (E3): `expectTypeOf<keyof FitInputs>().toEqualTypeOf<'seekerUserId' | 'categories' | 'occupationCodes' | 'availabilityDate' | 'skillKeys' | 'certifications' | 'workAuthorization' | 'minPay' | 'willingToRelocate' | 'preferredStates' | 'region' | 'countryCode'>()`.
  - `weightsVersion` equals `FIT_WEIGHTS_VERSION`. `certKey('  First   Aid ') === 'first aid'`. `toPoolListing` of a listing with `secondCategory: null` gives `categories: ['seasonal']` and `sponsorsVisa: false`; with `h2a`, `true`.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/fit/fit.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test and `pnpm test tests/sp5/architecture.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): template-based fit score with fixed category weights`.

### Task 13 (W2): Fit scoring service, legal switches and candidate pools

**Files:**
- Modify: `src/modules/hiring/fit/score.ts`, `src/modules/hiring/fit-store.ts`, `src/modules/hiring/pools/{refresh.ts,candidates.ts}`; the handlers of `host/listings/[id]/candidates` and `host/candidates/[candidateId]/{save,hide}`
- Test: `src/modules/hiring/fit/score.test.ts`, `src/modules/hiring/pools/pools.test.ts`, `src/app/api/v1/host/listings/[id]/candidates/route.test.ts`

**Interfaces:**
- Consumes: Task 12; `getSetting`; `profiles.getFitInputs`, `queryPoolCandidates`, `getCandidateCards` (fake); `safety.getRelationships` (fake); `listings.listOccupations` (fake); `discovery.toHourlyCents` (fake); `entitlements.getBalance` (fake); `requireListing` (Task 8); `getPublicMediaUrls`
- Produces:
  - `fitAvailable`: false when `hiring.fit_enabled` is false, when an on-site listing's `state` is in `hiring.fit_disabled_states`, or when a Remote listing's `remoteStates` is `'all_us'` or shares a state with that list (Plan decision 13).
  - `scoreSeekers`: null when `fitAvailable` is false; otherwise a map from `computeFit(inputs, toFitListing(h, { occupationLabel, maxPayHourlyCents: toHourlyCents({ pay: h.pay, when: h.when }).maxCents, today }), FIT_WEIGHTS, FIT_WEIGHTS_VERSION)`.
  - `scoreApplications` writes `fit_score`, `fit_lines`, `fit_weights_version` and `fit_computed_at` for the given (or every non-terminal) entry of the listing, and nulls them when fit is unavailable. `refreshFit` runs it for every listing that has non-terminal entries and is `active`.
  - `refreshPool`: under `pg_try_advisory_xact_lock(hashtextextended('pool:' || listingId, 0))` (returns `'busy'` when another refresh holds it). One `queryPoolCandidates({ listing: toPoolListing(h), limit: 500 })`; drops applicants to the listing and seekers `getRelationships` reports blocked or muted; scores the rest; upserts entries by `(listing_id, seeker_user_id)` with `eligible = true`, `state` (the card's `region` when `countryCode` is US), `available_from` and `skills_norm`, keeping `hidden_at` and `saved_at`; sets `eligible = false` and clears `state`, `available_from` and `skills_norm` on everyone else; upserts the run row.
  - `listCandidates`: `requireListing`; refreshes first only on a request without `cursor` when the run is missing, older than 6 hours, or on another `listing_revision_id`. Views: `all` (eligible, not hidden), `saved`, `hidden`. Filters: `state`, `availableBy` (`available_from ≤`), `skills` (`skills_norm @> keys`). Order: `fit_score desc nulls last, available_from asc, id`, or `available_from, id` when fit is unavailable; 24 per page. Each page goes through `getCandidateCards({ orgId: ctx.orgId, seekerUserIds, stage: 'pool' })`, and anyone missing or now an applicant is dropped. `invite` comes from the listing's invites (a held one reads `not_delivered`; a `sent` one past `expires_at` reads `expired`). `creditsRemaining` is `getBalance(db, orgId, 'invite_credit').balance`.
  - `setCandidateFlag`: 404 unless the entry's listing passes `requireListing`.
- [ ] **Step 1: Write the failing tests.**
  - **E3:** with the listing's state in `hiring.fit_disabled_states`, `scoreSeekers` returns null, `scoreApplications` leaves `fit_score` null, and `listCandidates` returns `fitAvailable: false` with every `fit: null`. `hiring.fit_enabled: false` does the same for every listing. A Remote listing hiring from `['CO', 'NY']` is off when NY is disabled.
  - Order by fit, then availability, then ID; with fit unavailable, by availability.
  - A refresh keeps `saved_at` and `hidden_at`; a seeker the fake no longer returns becomes `eligible: false` with `state` and `skills_norm` cleared.
  - Applicants, blocked seekers and muted seekers are left out; an invited seeker stays, with `invite.status: 'sent'`.
  - A refresh runs on a first page when the run is 7 hours old or on another revision, and never on a request with a `cursor` (the fake's `queryPoolCandidates` call count is unchanged).
  - **Spec failure mode 5:** the serialized response has none of the keys `fullName`, `lastName`, `email`, `phone`, `resumeUrl` at any depth; `avatarUrl` is null when the card's `avatarMediaId` is null; a seeker the fake drops from `getCandidateCards` (visibility off) is missing from the next page load.
  - Filters `state: 'CO'`, `availableBy: '2027-06-01'` and `skills: ['customer-service']` each narrow the list. `creditsRemaining` equals the fake's balance.
  - Route: Billing gets 403; a Recruiter outside scope gets 404; `PUT …/save` then `view: 'saved'` lists the candidate.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/fit/score.test.ts src/modules/hiring/pools src/app/api/v1/host/listings`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): fit scoring with legal switches, candidate pools and the candidates API`.

### Task 14 (W2): Sending invites (E4)

**Files:**
- Modify: `src/modules/hiring/invites/{send.ts,notes.ts,register.ts}`; the POST handler of `host/invites/route.ts`
- Test: `src/modules/hiring/invites/send.test.ts`, `src/modules/hiring/invites/invites.int.test.ts`

**Interfaces:**
- Consumes: `entitlements.consume` (fake in unit tests, real in the integration test); `profiles.getCandidateCards`, `safety.getRelationships` (fakes); `getSetting('limits.invites_per_seeker_per_week')`; `requireListing`, `recordPipelineEvent`, `enqueueNoteScan` (Task 8); `registerSubjectHandlers` (trust); `notify`, `record`, `track`
- Produces:
  - `sendInvite`, in one transaction and in the spec 8.4 order: `pg_advisory_xact_lock(hashtextextended('invite_seeker:' || seekerUserId, 0))`; an existing invite for `(listing, seeker)` → 409 `already_invited`; the weekly cap (invites to the seeker with `sent_at > now − 7 days` and `scan_state <> 'held'`, ≥ the setting) → 409 `seeker_unavailable`; live eligibility (`getCandidateCards` stage `pool` empty) or a block or mute → 409 `seeker_unavailable`; the listing not `active` → 409 `listing_inactive`; then `consume(tx, { orgId, kind: 'invite_credit', quantity: 1, subjectType: 'invite', subjectId: inviteId, idempotencyKey: 'invite:' + inviteId, actor: { type: 'user', id: senderUserId } })` with `inviteId = newId()` beforehand, `{ ok: false }` → 409 `no_credits`; then the insert (`expires_at = sent_at + 14 days`). The `seeker_unavailable` message is "Not accepting invites right now"; `no_credits` is "You're out of invite credits".
  - After the insert: event `invite_sent`, audit `hiring.invite_sent`, `track('hiring.invite_sent', { inviteId, listingId })`. With a note, `scan_state = 'pending'` and `enqueueNoteScan`; without one, `scan_state = 'clear'` and the seeker gets `hiring.invite_received` at once.
  - `loadInviteNote` / `releaseInviteNote`: release sets `scan_state` and `check_id`; `clear` and `warn` notify `hiring.invite_received`; `held` notifies no one.
  - `register.ts`: trust subject `invite`: `approve` sets `clear` and, if it was `held`, notifies the seeker; `remove` sets `held`.
- [ ] **Step 1: Write the failing tests.**
  - Success: the fake balance goes from 10 to 9; `consume` was called with exactly the object above; the invite is `sent` with `expires_at` = `FIXED_NOW` + 14 days; the seeker has one `hiring.invite_received` notification.
  - With a note: `scan_state 'pending'`, one `hiring.scan_note` outbox row, no notification. `releaseInviteNote` with `warn` → notified; with `held` → not notified, and `scan_state` reads `held`.
  - A second call for the same candidate → 409 `already_invited`, and `consume` was called once.
  - Ten invites to the seeker from other orgs in the last 7 days → 409 `seeker_unavailable` with message "Not accepting invites right now", and `consume` was not called. With one of the ten `held`, the invite is sent. Invites 8 days old don't count.
  - Blocked, muted or ineligible seeker → 409 `seeker_unavailable`. Closed listing → 409 `listing_inactive`. Balance 0 → 409 `no_credits` and no invite row. `consume` throwing → the call rejects and no invite row exists.
  - Trust `decide(…, 'approve')` on a held invite's item → `clear` and one notification.
  - **Integration** (`invites.int.test.ts`, CI, real `@/modules/entitlements` with `grant`, SP4 fakes):
    - *(E4)* an 11th invite to one seeker within 7 days → 409 `seeker_unavailable`, and `getBalance` is unchanged.
    - *(Spec failure mode 1)* the seeker at 9 of 10; two orgs invite them concurrently on two listings → exactly one succeeds, the other gets `seeker_unavailable`, and exactly one consumption row exists across both orgs.
    - Two concurrent calls by one host for one candidate → one invite, one `already_invited`, one consumption.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/invites/send.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the unit test (PASS) and `pnpm typecheck` (PASS); the integration test runs in CI.
- [ ] **Step 5:** Commit: `feat(hiring): invites with credits, weekly cap and live eligibility`.

### Task 15 (W2): Invite answers, invite lists and the invite sweep

**Files:**
- Modify: `src/modules/hiring/invites/{respond.ts,reads.ts,sweep.ts}`; the handlers of `host/invites` (GET), `host/invites/[id]/candidate` and `me/invites/**`
- Test: `src/modules/hiring/invites/{respond,sweep,candidate}.test.ts`

**Interfaces:**
- Consumes: `ensureThread`, `postCard`, `postEvent` (fake); `profiles.grantReveal`, `profiles.getCandidateCards`, `safety.mute` (fakes); `discovery.getJobCards` (fake); `getHiringInfoMany` (fake); `recordPipelineEvent`, `listingScope`, `inScope`
- Produces:
  - `respondToInvite`, from `sent` only: past `expires_at` → 409 `expired`. Repeating the recorded answer returns it unchanged; a different one → 409 `already_responded` (Plan decision 21).
    - `interested`: `ensureThread({ orgId, listingId, seekerUserId, inviteId })`, stores `thread_id`, `postCard(thread, { type: 'invite', refId }, null)`, `postEvent(thread, { code: 'invite_interested', visibleTo: 'all' })`, `grantReveal({ seekerUserId, orgId, reason: 'invite_interested', sourceId: inviteId })`, event `invite_interested`, audit `hiring.invite_responded`, and notifies the sender `hiring.invite_response`. Returns `threadId`.
    - `not_interested` with an optional `reason`: event `invite_not_interested`, audit, notification.
  - `muteInviteHost`: `safety.mute({ userId, orgId })`, then the invite is `not_interested` with no reason.
  - `applyHref` = `/apply/<listingId>?source=invite&invite=<inviteId>` (SP4's sibling contract).
  - `listSeekerInvites` and `getSeekerInvite` show only `clear` and `warn` invites (`warn: true` for the banner); a `sent` invite past `expires_at` reads `expired`. `getSeekerInvite` adds the job card, or null when the listing is no longer active. Another seeker's invite, or a pending or held one, is 404.
  - `listHostInvites`: scoped; a held invite reads `not_delivered`; newest first, keyset paged.
  - `getInterestedCandidate` (Plan decision 16; route `GET /host/invites/:id/candidate`, capability `invites.send`): the invite must be the org's and its listing in scope, and its status `interested` or `applied`, else 404 `not_found`. It calls `getCandidateCards(db, { orgId: ctx.orgId, seekerUserIds: [invite.seekerUserId], stage: 'interested' })` and answers 404 when that returns nothing (no reveal, or a block either way). The response is `{ invite: HostInviteItem, candidate }`, with SP4's `interested` card (full name and contacts, no work authorization) for SP4's `CandidateProfileView`.
  - `seekerInviteItems` and `hostInviteItems`: the mappers the lists above use, by ID, with the same visibility rules (the seeker's own delivered invites; the org's invites). W3's card payloads call them.
  - `sweepInvites`: `sent` invites past `expires_at`, or on a listing whose status isn't `active`, become `expired` with event `invite_expired`; `sent` invites within 48 hours of expiry with `expiring_reminded_at` null get `hiring.invite_expiring` once.
- [ ] **Step 1: Write the failing tests.**
  - Interested → `ensureThread` with `inviteId`, `grantReveal` with `{ reason: 'invite_interested', sourceId: inviteId }`, one `invite_interested` event, the sender notified with `hiring.invite_response`; the result has `threadId` and `applyHref` `/apply/<listingId>?source=invite&invite=<inviteId>`.
  - Not interested with reason `pay` → the host list shows `declineReason: 'pay'`. Mute → `safety.mute` called with `{ userId, orgId }`, status `not_interested`.
  - Answering after `expires_at` with no sweep → 409 `expired`, and the seeker list already shows `expired`. Interested twice → unchanged; Not interested after Interested → 409 `already_responded`. Another seeker → 404.
  - A pending invite is absent from the seeker's list and 404 on GET; the host list shows a held one as `not_delivered`.
  - **Interested profile** (`candidate.test.ts`): `getInterestedCandidate` on a `sent` invite → 404, and `getCandidateCards` wasn't called. After `respondToInvite(…, 'interested')` and `profilesFake.setRevealed(orgId, seekerUserId)`, it returns the candidate with `profile.lastName` and `profile.email`, and `getCandidateCards` was called with exactly `{ orgId: ctx.orgId, seekerUserIds: [seekerUserId], stage: 'interested' }`. A `not_interested` invite → 404; `getCandidateCards` returning no card (SP4 drops a blocked seeker) → 404; a Recruiter outside the listing's scope → 404; another org's invite → 404. At the route, a Billing member gets 403.
  - Sweep: 14 days after sending → `expired`; a closed listing → `expired` at the next sweep; the reminder goes out once, at 48 hours before expiry, not at 49.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/invites`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): invite answers, invite lists, the Interested profile and the expiry sweep`.

### Task 16 (W3): Calendar files

**Files:**
- Modify: `src/modules/hiring/interviews/ics.ts`; the handler of `interviews/[id]/ics/route.ts`
- Create: `src/modules/hiring/interviews/__golden__/interview-request.ics`
- Test: `src/modules/hiring/interviews/ics.test.ts`

**Interfaces:**
- Consumes: `getEnv` (`APP_URL`, `EMAIL_FROM`); `zonedLocalToUtc` (Task 5); `getHiringInfoMany`, `getOrgSummaries` (fakes)
- Produces:
  - `type IcsEvent = { method: 'REQUEST' | 'CANCEL'; uid: string; sequence: number; start: Date; end: Date; stamp: Date; summary: string; location: string; description: string; organizerEmail: string }`.
  - `buildIcs(e)`: RFC 5545 `VCALENDAR` (`PRODID:-//Explore&Earn//Interviews//EN`, `VERSION:2.0`, `METHOD`) with one `VEVENT`: `UID`, `SEQUENCE`, `DTSTAMP`, UTC `DTSTART` and `DTEND` (`YYYYMMDDTHHmmssZ`), `SUMMARY`, `LOCATION`, `DESCRIPTION`, `ORGANIZER:mailto:<organizerEmail>`, `STATUS:CONFIRMED` or `STATUS:CANCELLED`. CRLF line endings; text escaping of `\`, `;`, `,` and newlines; lines folded at 75 octets. No attendees.
  - `interviewUid(id)` = `interview-<id>@<new URL(APP_URL).host>`; `organizerEmail` is the address inside `EMAIL_FROM`.
  - `interviewIcsAttachments(d, db)`: loads `d.interviewId`; returns `[]` when `d.sequence` differs from the interview's `sequence` (Plan decision 10), or when `REQUEST` has no scheduled time. Otherwise one attachment `interview.ics` with content type `text/calendar; method=<METHOD>; charset=utf-8`, summary `Interview: <position> at <org>`, location (address, video link or `Phone`) and the thread URL for `d.audience` (`/inbox/<threadId>` or `/host/messages/<threadId>`) in the description.
  - `getInterviewIcs`: participants only (the application's seeker, or a host with listing scope), else 404; a scheduled interview gives `REQUEST`, a canceled one `CANCEL`, anything else 404. The route answers `text/calendar; charset=utf-8` with `Content-Disposition: attachment; filename="interview.ics"`.
- [ ] **Step 1: Write the failing tests.**
  - `buildIcs` for a fixed event equals the golden file byte for byte; every line ends in `\r\n`, and no line is over 75 octets.
  - A summary `Interview: Deckhand, crew; night` is written `Interview: Deckhand\, crew\; night`.
  - *(Spec failure mode 4, DST)* a slot from `zonedLocalToUtc('2027-03-14T10:00', 'America/Denver')` gives `DTSTART:20270314T160000Z`; one from `'2027-03-13T10:00'` gives `DTSTART:20270313T170000Z`.
  - `CANCEL` has `METHOD:CANCEL`, `STATUS:CANCELLED`, the same `UID` and the given `SEQUENCE`.
  - With `EMAIL_FROM='Explore&Earn <hello@send.exploreandearn.com>'`, the file has `ORGANIZER:mailto:hello@send.exploreandearn.com`; with `APP_URL='https://exploreandearn.com'`, the UID ends `@exploreandearn.com`.
  - `interviewIcsAttachments` with a stale `sequence` returns `[]`.
  - Route: the seeker gets 200 `text/calendar`; another seeker and an out-of-scope Recruiter get 404.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/interviews/ics.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): RFC 5545 interview calendar files`.

### Task 17 (W3): Interview proposals, host actions and seeker answers

**Files:**
- Modify: `src/modules/hiring/interviews/{propose.ts,respond.ts,host.ts,reads.ts,notes.ts,register.ts}`; the handlers of `host/applicants/[applicationId]/interviews`, `host/interviews/**`, `me/interviews/**`
- Test: `src/modules/hiring/interviews/{propose,respond,host}.test.ts`

**Interfaces:**
- Consumes: `requireEntry`, `requireListing`, `transitionStatus`, `recordPipelineEvent`, `enqueueNoteScan` (Task 8); `ensureThread`, `postCard`, `postEvent`, `threadIdsForApplications` (fake); `applications.withdraw` (fake); `notify`, `record`, `enqueue`, `track`
- Produces:
  - `proposeInterview`: the entry must be `new`, `shortlisted` or `interviewing`, else 409 `stale_status`; an active interview gives 409 `interview_active`. Each slot is at least 60 minutes and at most 90 days ahead, else 400 with `details.reason` `slot_too_soon` or `slot_too_far`; overlapping slots give 400 `slots_overlap`. `timezone` defaults to the listing's. It inserts the interview (`round 1`, `sequence 0`, `organizer_user_id` = the caller, `expires_at = least(now + expiryHours, latest slot start)`) and its slots, moves `new`/`shortlisted` to `interviewing` with `transitionStatus` (event `interview_invited`), and sets `interview_state = 'invited'`. With a note, `scan_state 'pending'` and `enqueueNoteScan`; otherwise `scan_state 'clear'`. Without a note, or on release as `clear` or `warn`, it posts the interview card (sender = organizer) and notifies the seeker `hiring.interview_invited`. Audit `hiring.interview_proposed`.
  - `proposeNewRound`: from `invited`, `scheduled`, `reschedule_requested` or `expired`; `round + 1`, `sequence + 1`, new slots, status `invited`, a new `expires_at`; notifies the seeker `hiring.interview_invited` with `icsMethod: 'CANCEL'` when it was `scheduled`.
  - **Seeker reach (Plan decision 20):** `pickSlot`, `requestNewTimes` and `declineInterview` first load the interview as the seeker's own with `scan_state in ('clear', 'warn')`; another seeker's interview, or a `pending` or `held` one, is 404 `not_found`.
  - `pickSlot`: status must be `invited` and `round` current, else 409 `round_changed`; past `expires_at` → 409 `expired`; the slot must belong to the round and start after `now`, else 409 `slot_passed`. Sets `scheduled`, the slot, `scheduled_start`/`scheduled_end` (start + duration) and `sequence + 1`; event `interview_scheduled`; `postEvent('interview_scheduled', 'all')`; `interview_state = 'scheduled'`; notifies the seeker and the organizer `hiring.interview_scheduled` (with `sequence`); enqueues `hiring.interview_reminder` with payload `{ interviewId, sequence, which }` at start − 24 h (skipped when booked less than 24 hours ahead) and start − 1 h, dedupe `ivr:<id>:<sequence>:24h` and `:1h`; audit `hiring.interview_scheduled`; `track('hiring.interview_scheduled', { interviewId })`.
  - `requestNewTimes`: from `invited` or `scheduled`; sets `reschedule_requested`, the windows and note, `expires_at = null` and `sequence + 1`; notifies the organizer `hiring.interview_times_requested` (with `icsMethod: 'CANCEL'` when it was `scheduled`).
  - `declineInterview`: from `invited`, `scheduled` or `reschedule_requested` → `declined`; notifies the organizer `hiring.interview_declined` (`CANCEL` when scheduled); with `alsoWithdraw`, calls `applications.withdraw(tx, { applicationId, seekerUserId })` and returns `withdrawn: true`.
  - `cancelInterview` (host): from the three active states → `canceled`, `sequence + 1`; `postEvent('interview_canceled', 'all')`; notifies the seeker `hiring.interview_canceled`; audit `hiring.interview_canceled`.
  - `recordInterviewOutcome`: only `scheduled` with `now ≥ scheduled_end`, else 409 `not_yet_passed`; sets the status, `outcome_by` and `outcome_at`; event `interview_completed` or `interview_no_show`; `postEvent` with `visibleTo: 'all'` for completed and `'host'` for no-show; audit `hiring.interview_outcome`.
  - Every change updates `pipeline_entries.interview_state`.
  - `listHostInterviews`: scoped; `from`/`to` filter `scheduled_start` (or `expires_at` for unscheduled ones); `needsAction` = `reschedule_requested`, or `scheduled` and ended with no outcome. `listSeekerInterviews` and the seeker views (the mappers W3's card payloads use) include only interviews whose `scan_state` is `clear` or `warn`, so a `pending` or `held` interview is absent rather than shown with its note stripped (spec section 6 trust row, spec 8.7), and show `completed` and `no_show` as `past` (spec 8.5 Visibility).
  - `loadInterviewNote`, `releaseInterviewNote`; trust subject `interview` (`approve` releases, `remove` holds) in `register.ts`.
- [ ] **Step 1: Write the failing tests.**
  - Validation: a slot 59 minutes ahead → 400 `slot_too_soon`; 91 days → `slot_too_far`; two overlapping 30-minute slots → `slots_overlap`. A second proposal while one is active → 409 `interview_active`.
  - A proposal on a `new` application makes the SP4 status `interviewing`. Slots at now + 2 h and now + 30 h give `expires_at` = now + 30 h; slots at now + 5 days give now + 72 h; `expiryHours: 48` gives now + 48 h.
  - Pick a slot that has passed → 409 `slot_passed`. After `proposeNewRound`, picking with the old round → 409 `round_changed`.
  - Pick → `scheduled`, `sequence` + 1, outbox rows with dedupe `ivr:<id>:<seq>:24h` at start − 24 h and `ivr:<id>:<seq>:1h` at start − 1 h; booked 20 hours ahead → only the `1h` row. Both participants get `hiring.interview_scheduled`.
  - Request times with 4 windows → 400; a 20-minute window → 400; valid → `reschedule_requested`, `expires_at` null, `needsAction: true` in the host list, and the organizer notified with `icsMethod: 'CANCEL'` when it had been scheduled.
  - Decline with `alsoWithdraw: true` → `withdraw` called with `{ applicationId, seekerUserId }` and `withdrawn: true`.
  - Outcome before `scheduled_end` → 409 `not_yet_passed`; after → `completed` with one `interview_completed` event. `no_show` posts its event with `visibleTo: 'host'`, and the seeker list shows the interview as `past`.
  - A proposal with a `__block__` note, after `releaseInterviewNote` with `held`: absent from `listSeekerInterviews`; `pickSlot`, `requestNewTimes` and `declineInterview` on it → 404; no interview card was posted and no `hiring.interview_invited` was sent. The same proposal while still `pending` is absent too. Released as `warn`, it is listed with its note.
  - Route: the 31st proposal in an hour → 429.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/interviews`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): interview proposals, slot picks, rescheduling and outcomes`.

### Task 18 (W3): Reminders, the interview sweep, reassignment and closing on pass or withdraw

**Files:**
- Modify: `src/modules/hiring/interviews/{reminders.ts,sweep.ts,close.ts}`
- Test: `src/modules/hiring/interviews/{reminders,sweep,close}.test.ts`

**Interfaces:**
- Consumes: `orgs.listMembers` (fake); `readEnvelope`; `postEvent` (fake); `notify`
- Produces:
  - `sendInterviewReminder`: sends only when the interview is still `scheduled` and `sequence` matches the payload; `24h` notifies both participants `hiring.interview_reminder_24h`, `1h` sends `hiring.interview_reminder_1h`.
  - `sweepInterviews`: `invited` past `expires_at` → `expired` and the organizer gets `hiring.interview_expired`; `scheduled` with `scheduled_end + 48 h ≤ now` → `completed` (system actor, event `interview_completed`); `scheduled`, ended, no outcome and `outcome_nudged_at` null → the organizer gets `hiring.interview_outcome_due` and the column is stamped; an active interview whose organizer is no longer in `listMembers` moves to the longest-standing Admin (earliest `joinedAt`), else the Owner.
  - `onMemberRemoved` (`org.member_removed`): moves that member's active interviews in the org to `reassignToUserId` when it is still a member, else by the sweep's rule.
  - `closeOpenItems` (the core hook): the application's active interview → `canceled`, `sequence + 1`, `postEvent('interview_canceled', 'all')`, and `hiring.interview_canceled` with `icsMethod: 'CANCEL'` to the organizer (reason `withdrawn`) or the seeker (reason `not_selected`); a `sent` offer → `canceled` with `postEvent('offer_canceled', 'all')`; `interview_state` and `offer_state` updated.
- [ ] **Step 1: Write the failing tests.**
  - *(Spec failure mode 4)* a reminder queued at sequence 1, then a new round (sequence 2), sends nothing. A reminder for a canceled interview sends nothing. The `24h` reminder gives each participant one `hiring.interview_reminder_24h`; the `1h` reminder one `hiring.interview_reminder_1h`.
  - Sweep: an `invited` interview past expiry → `expired` with one organizer notification; `scheduled_end` 49 hours ago → `completed`; the outcome nudge goes out once across two sweeps. A scheduled interview and a sent offer on a listing that closed stay as they are (spec 8.6).
  - Organizer missing from `listMembers` → reassigned to the Admin who joined first; with no Admin, the Owner. `org.member_removed` with `reassignToUserId` set to a current Admin → that Admin.
  - `closeOpenItems` with `withdrawn` on a scheduled interview and a sent offer → interview `canceled` with `sequence` + 1 and the organizer notified `hiring.interview_canceled` with `icsMethod: 'CANCEL'`; offer `canceled`. With `not_selected`, the seeker is notified instead.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/interviews`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): interview reminders, sweep, reassignment and close-on-exit`.

### Task 19 (W3): Offers

**Files:**
- Modify: `src/modules/hiring/offers/{offers.ts,notes.ts}`; the handlers of `host/applicants/[applicationId]/offers`, `host/offers/[id]/cancel`, `me/offers/**`, `offers/[id]/letter`
- Test: `src/modules/hiring/offers/offers.test.ts`, `src/app/api/v1/offers/[id]/letter/route.test.ts`

**Interfaces:**
- Consumes: `transitionStatus`, `requireEntry`, `enqueueNoteScan` (Task 8); `getMediaMeta` (Task 2; SP4's `getMedia` has no MIME type); `getAuthorizedMediaUrl`, `getStorage` (media); `listingTeam` (Task 8); `todayInZone` (Task 5); `postCard`, `postEvent` (fake); `notify`, `record`, `track`
- Produces:
  - `sendOffer`: the entry must be `new`, `shortlisted` or `interviewing` (else 409 `stale_status`); one `sent` offer per application (409 `offer_open`); `startDate` before today in the listing's time zone → 400 `start_in_past`; `position` defaults to the listing title; a `letterMediaId` must be, by `getMediaMeta`, of kind `attachment` with `mime === 'application/pdf'`, `approved`, and `ownerOrgId === ctx.orgId`, else 409 `letter_not_ready` (an unknown ID too). It inserts the offer with `prior_status`, moves the application to `offered` (event `offered`), sets `offer_state = 'sent'`, scans the note like interviews (`scan_state 'clear'` without one), posts the offer card and notifies the seeker `hiring.offer_received` on release, records `hiring.offer_sent` and tracks `hiring.offer_sent`.
  - `cancelOffer` (host), `acceptOffer` and `declineOffer` (seeker) are compare-and-set on `status = 'sent'`; the loser gets 409 `offer_closed`. Accept → `transitionStatus(from offered, to hired, hiredSource 'offer_accepted')`. Decline → `offer_declined`. Cancel → `interviewing` (Plan decision 4). Each posts its event (`offer_accepted`, `offer_declined`, `offer_canceled`), updates `offer_state`, and records `hiring.offer_canceled` or `hiring.offer_responded`. Accept and decline notify the creator and `listingTeam` with `hiring.offer_response`; accept tracks `hiring.hired`.
  - **Seeker reach (Plan decision 20):** `acceptOffer`, `declineOffer`, `listSeekerOffers`, the seeker offer view (the mapper W3's card payloads use) and the seeker side of `getOfferLetterUrl` see only offers whose `scan_state` is `clear` or `warn`; a `pending` or `held` offer is absent from lists and 404 everywhere else.
  - `getOfferLetterUrl`: participants only (else 404), then `getAuthorizedMediaUrl`; the route answers 302 to it.
  - `listSeekerOffers`, `hostOfferViews`; trust subject `offer` handlers.
- [ ] **Step 1: Write the failing tests.**
  - From `interviewing` → SP4 `offered`, `prior_status: 'interviewing'`, `offer_state: 'sent'`. A second offer → 409 `offer_open`.
  - Letter still `scanning` → 409 `letter_not_ready`. *(Review Focus 3)* an approved PDF owned by another org → 409 `letter_not_ready`; an approved `resume` PDF → 409 `letter_not_ready`; an approved `attachment` whose `getMediaMeta` mime is `image/png` → 409 `letter_not_ready`.
  - An offer with a `__block__` note, after `releaseOfferNote` with `held`: absent from `listSeekerOffers` (Task 20 checks the card payload and the count); `acceptOffer`, `declineOffer` and the seeker's letter route on it → 404; no offer card was posted and no `hiring.offer_received` was sent. While `pending`, the same. Released as `warn`, it is listed and can be accepted.
  - Yesterday in `America/Denver` as `startDate` → 400 `start_in_past`. No `position` → the listing title.
  - Accept → SP4 `hired`, the entry's `hired_source: 'offer_accepted'`, offer `accepted`, `{ applicationStatus: 'hired' }`, `hiring.offer_response` to the creator and the listing team.
  - Host cancel then seeker accept → 409 `offer_closed`. Cancel → SP4 `interviewing`, and the offer keeps `prior_status`.
  - Letter route: the seeker gets 302 with a signed `location`; another seeker and an out-of-scope Recruiter get 404.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/offers src/app/api/v1/offers`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): offers with letters, accept, decline and cancel`.

### Task 20 (W3): Thread card payloads and the pending Inbox count

**Files:**
- Modify: `src/modules/hiring/{cards.ts,inbox.ts}`
- Test: `src/modules/hiring/{cards,inbox}.test.ts`

**Interfaces:**
- Consumes: `hostInterviewViews`, `hostOfferViews` and the seeker interview and offer views (Tasks 17 and 19); `seekerInviteItems` and `hostInviteItems` (W2, mocked at `@/modules/hiring/invites/reads`); `applications.getHostCards` (fake); `seekerStatus` (`@/lib/applications`); `listingScope`
- Produces:
  - `getCardPayloads`: one payload per card the viewer may see, keyed by `refId`. A seeker gets the seeker views (`SeekerInviteItem`, `SeekerInterviewItem`, `SeekerOfferItem`, and for an application `status: seekerStatus(...)`); a host in scope gets the host views. Cards of another seeker or org, or outside the host's scope, are omitted. For a seeker, an invite, interview or offer whose `scan_state` is `pending` or `held` is omitted too (Plan decision 20); the host still gets it, with `noteState` or `not_delivered`.
  - `pendingInboxCount` (Plan decision 20): `sent` invites not past `expires_at`, `invited` interviews and `sent` offers of the seeker, each with `scan_state in ('clear', 'warn')`.
- [ ] **Step 1: Write the failing tests.**
  - For one thread with all four card types: a host gets host views (interview `noteState` present); the seeker gets seeker views and an application `status: 'applied'` for `shortlisted`. A card from another org is absent.
  - A held interview and a held offer in that thread: the host's payloads include both (`noteState: 'held'`); the seeker's payloads have no entry for either `refId`. A `warn` interview is present for the seeker with its note.
  - `pendingInboxCount` with a delivered `sent` invite, a delivered `invited` interview and a delivered `sent` offer → 3. Adding a `sent` invite past `expires_at`, a pending invite, a held invite, a held `invited` interview, a pending `invited` interview and a held `sent` offer → still 3. Adding a `warn` `invited` interview on another application → 4.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/cards.test.ts src/modules/hiring/inbox.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): thread card payloads and the pending Inbox count`.

### Task 21 (W4): Threads, participation and reading

**Files:**
- Modify: `src/modules/messaging/{threads.ts,reads.ts}`; the handlers of `threads/[id]/route.ts`, `threads/[id]/read/route.ts`, `host/threads/route.ts`, `me/threads/route.ts`
- Test: `src/modules/messaging/{threads,reads}.test.ts`, `src/app/api/v1/threads/[id]/route.test.ts`

**Interfaces:**
- Consumes: `listingScope`, `inScope` (Task 8); `safety.getRelationships` (fake); `profiles.getCommunityIdentities` (fake); `hostpages.getHostIdentities`, `getOrgSummaries`, `listings.getHiringInfoMany`, `listMembers` (fakes); `markReadByData` (Task 1); `getMediaMeta` (Task 2); `hiring.getCardPayloads` (mocked in the route test); `track`
- Produces:
  - `ensureThread` (spec 3): upsert by `(listing_id, seeker_user_id)`; an existing thread gains a missing `application_id` or `invite_id`.
  - `postCard`: sender type `seeker` when `senderUserId` is the thread's seeker, `system` when null, else `host`; updates `last_to_seeker_at` or `last_to_host_at`; a host-sent card sets `first_host_reply_at` when null. `postEvent`: kind `event`, sender `system`, the given `visible_to`; changes no unread time. `setThreadReadOnly` sets the reason when none is set, or always for `removed`. `markThreadHired` sets `hired_at` once. `threadIdsForApplications`.
  - Participation: a seeker owns the thread; a host's role is owner, admin or recruiter and the listing is in scope. Anyone else gets 404.
  - `getThread`: newest first, 30 per page, `before` cursor. A seeker sees only `visible_to = 'all'` messages whose `scan_state` is `clear` or `warn` (`warn: true` on the latter) or that they sent; a host sees everything except a seeker's removed messages, with `state` on their org's messages (`pending` → `sending`, `clear`/`warn` → `sent`, `held` → `not_delivered`, `removed` → `removed`). Sender names are first names only; a seeker never sees a host's role. Each attachment is `{ mediaId, mime }`, with `mime` from one `getMediaMeta` call per page (Plan decision 27). `readOnly`: the stored reason; else `listing_closed` when `listing_closed_at` is more than 90 days ago; else `blocked` when `getRelationships` reports a block (stamped then, Plan decision 11). `canSend` = not read-only. Opening a thread records `track('messaging.thread_opened', { threadId })`.
  - `markThreadRead`: upserts `thread_reads.last_read_at = now` and calls `markReadByData(db, userId, { types: ['messages.new'], key: 'threadId', value: threadId })`.
  - `listThreads`: a seeker's threads, or a host's scoped threads with optional `listingId` and `unread`; ordered by the viewer's side's last time; `unread` per spec 8.7; `preview` the newest visible text cut to 140 code points.
  - Route `GET /threads/:id` returns `{ ...getThread(...), cards: await getCardPayloads(db, { viewer, cards }) }` (Plan decision 12).
- [ ] **Step 1: Write the failing tests.**
  - `ensureThread` twice → `created: true` then `false`; a thread created from an invite gains `application_id` on the second call.
  - Participation: the owning seeker reads; another seeker, a Billing member and an out-of-scope Recruiter get 404; a Recruiter scoped by the listing's location reads.
  - A seeker never sees a `pending` or `held` message, or a `visible_to: 'host'` event; they see a `warn` message with `warn: true`. A host sees their pending message as `sending` and a held one as `not_delivered`.
  - `listing_closed_at` 91 days ago → `readOnly: 'listing_closed'`, `canSend: false`; 89 days → open. A block reported by the fake → `readOnly: 'blocked'` and `read_only_reason` stored.
  - `markThreadRead` upserts the read row and calls `markReadByData` with `{ types: ['messages.new'], key: 'threadId', value: <threadId> }`; the thread's `unread` becomes false.
  - Host `listThreads` returns only scoped threads; `unread: true` filters.
  - Route: the response includes `cards` from the mocked `getCardPayloads`.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging src/app/api/v1/threads`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(messaging): threads, participation, reading and thread lists`.

### Task 22 (W4): Sending, attachments and the scam scan (E5)

**Files:**
- Modify: `src/modules/messaging/{send.ts,scan.ts,attachments.ts,review.ts,register.ts}`; the handlers of `threads/[id]/messages/route.ts` and `threads/[id]/attachments/[mediaId]/route.ts`
- Test: `src/modules/messaging/scan.test.ts` (E5), `src/modules/messaging/send.test.ts`, `src/app/api/v1/threads/[id]/attachments/[mediaId]/route.test.ts`

**Interfaces:**
- Consumes: `runCheck` (kind `message_scam`); `openReviewItem`, `listOpenReviewItems`, `registerSubjectHandlers` (trust); `searchAudit`, `record`; `getMediaMeta` (Task 2), `getAuthorizedMediaUrl`, `getStorage`; `safety.registerReportSubject`, `safety.getRelationships` (fakes); `listingTeam`; `notify`, `enqueue`
- Produces:
  - `scanHostText(db, { subjectType, subjectId, text, orgId })`: `runCheck` → `approved` is `clear`, `needs_review` is `warn` (including `classifier_error`), `rejected` is `held`. On `held`: audit `messaging.text_held` with `orgId` and `{ subjectType, subjectId, labels }`; a `moderation` item with reason `message_scam_held`; and when `searchAudit({ orgId, action: 'messaging.text_held', from: now − 24 h })` finds 3 or more and `listOpenReviewItems(db, 'organization', orgId)` has no item with reason `repeated_scam_text`, one `fraud` item `{ subjectType: 'organization', subjectId: orgId, reason: 'repeated_scam_text' }`.
  - `sendHostMessage(tx, { threadId, senderUserId, body, bulkId? }): Promise<string | null>` (Plan decision 11): it first calls `safety.getRelationships(tx, { orgId, seekerUserIds: [seekerUserId] })` for the thread; a block either way stamps `read_only_reason = 'blocked'` (when none is set) and returns null. A read-only thread (as `getThread` computes it) also returns null. Either way nothing is inserted and nothing is notified. Otherwise: in a hired thread, `clear` and delivered at once; with `bulkId`, the bulk's stored outcome (`clear` or `warn`) and delivered at once, with no second scan; else `scan_state 'pending'` and `messaging.scan` with dedupe `mscan:<messageId>`. It returns the message ID.
  - `sendMessage(db, viewer, threadId, i)`: participation; read-only (including a block found now) → 409 `read_only`; a repeated `clientId` returns the stored message. Each attachment must be, by `getMediaMeta`, of kind `attachment`, `approved`, and owned by the sender (`ownerUserId` = the seeker, or `ownerOrgId` = the host's org), else 409 `attachment_not_ready` (an unknown ID too). A seeker's message is `clear`, delivered, and notifies `listingTeam` with `messages.new` (`audience: 'host'`); a host's message goes through `sendHostMessage`.
  - Delivery (at send for clear text, or in `runMessageScan` on `clear` or `warn`) stamps `last_to_seeker_at` or `last_to_host_at`, sets `first_host_reply_at` for a host message when null, and notifies the other side `messages.new` with `{ threadId, audience, orgName, firstName }` only. `held` delivers nothing.
  - `getAttachmentUrl`: participation, and the media ID must be on a message of this thread that the viewer may see, else 404; then `getAuthorizedMediaUrl` (the route answers 302).
  - `register.ts`: trust subjects `message` (`approve` → `clear` and delivered if it was held; `remove` → `removed`, hidden from the seeker) and `thread` (`approve` changes nothing; `remove` → `setThreadReadOnly(tx, id, 'removed')`); report subjects `message` and `thread` (spec section 6, `exists` per spec).
  - `getMessageForReview(db, id, o?)`: for `subjectType` `message` (the default), `{ body, orgName, sentAt }` or null. Task 24 adds the `bulk_message` branch.
- [ ] **Step 1: Write the failing tests** (`scan.test.ts` uses the real trust and notifications modules with the stub classifier).
  - *(E5)* A host message `Send a deposit __flag__` → after the scan job, the seeker's `getThread` shows it with `warn: true`, and one open `moderation` item has subject `message`. A message `__block__` → never in the seeker's `getThread`, and the seeker has no `messages.new` row.
  - Before the scan job runs, the seeker's `getThread` doesn't contain the pending message.
  - *(Spec failure mode 3)* with `classify` throwing, the message is delivered with `warn: true`, never as clear.
  - Three held texts from one org within 24 hours open exactly one `fraud` item with reason `repeated_scam_text`; a fourth opens no second one. Each held text has a `messaging.text_held` audit row with `orgId` and a `moderation` item with reason `message_scam_held`.
  - A seeker's message is delivered at once and notifies the listing team; a host message in a hired thread is never scanned.
  - *(Spec section 10, Plan decision 11)* With `safetyFake.setBlocked(orgId, seekerUserId)` on a thread nobody has opened since, `sendHostMessage` returns null, inserts no message, enqueues no `messaging.scan`, gives the seeker no `messages.new` row, and leaves `read_only_reason = 'blocked'` stored. On a thread with `read_only_reason = 'withdrawn'` it also returns null.
  - `read_only` thread → 409 `read_only`. Attachment `scanning` → 409 `attachment_not_ready`. *(Review Focus 3)* an approved attachment owned by another user → 409 `attachment_not_ready`. An approved PDF attachment the sender owns is sent, and the seeker's `getThread` shows it as `{ mediaId, mime: 'application/pdf' }`. A repeated `clientId` → the same message ID and one row. The 61st message in 10 minutes → 429 at the route.
  - Attachment route: a participant gets 302 to a signed URL; a media ID not attached in this thread → 404.
  - Trust: `decide(…, 'approve')` on a held message's item → delivered and the seeker notified; `remove` → hidden from the seeker. `remove` on a `thread` item → `readOnly: 'removed'`. The safety fake captured `registerReportSubject` for `message` and `thread` with matching `trustSubjectType`, and `exists` is false for a removed message.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging src/app/api/v1/threads`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(messaging): sending, attachments, scam scanning, trust handlers and report subjects`.

### Task 23 (W4): Message notifications, unread counts and the 15-minute email (E6)

**Files:**
- Modify: `src/modules/messaging/reads.ts` (`unreadThreadCount`)
- Test: `src/modules/messaging/messaging-notify.test.ts` (E6), `src/server/counts.test.ts`

**Interfaces:**
- Consumes: the real notifications module (`notify`, `flushBatches`, `sendEmailJob`, `stubOutbox`); `findHostMembership` (Foundation orgs); `listingScope`
- Produces:
  - `unreadThreadCount(db, userId, o?)`: a seeker's unread threads; for a host, unread threads in `o.orgId` or else the org from `findHostMembership(db, userId, null)`, within the member's listing scope.
- [ ] **Step 1: Write the failing tests.**
  - *(E6)* A host message released at T gives the seeker one `messages.new` row and a batch due at T + 15 min. `flushBatches(db, T + 15 min)` and the email job put exactly one message in `stubOutbox`, whose HTML contains `Reply in app`. In a second thread, `markThreadRead` at T + 5 min, then the flush at T + 15 min → nothing sent (`skipped: 1`).
  - The `messages.new` row's `data` doesn't contain the message body, and the email's HTML and text don't either.
  - `unreadThreadCount` for the seeker is 1, then 0 after `markThreadRead`. A Recruiter out of scope counts 0 for a thread their Admin counts 1.
  - `getCounts` with `pendingInboxCount` mocked to 2 and one unread thread gives `inbox: 3`.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging/messaging-notify.test.ts src/server/counts.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(messaging): unread counts and the batched message email`.

### Task 24 (W4): Saved replies, the Not selected message and bulk messages

**Files:**
- Modify: `src/modules/messaging/{replies.ts,bulk.ts,review.ts,register.ts}`; the handlers of `host/saved-replies/**`, `host/not-selected-message`, `host/listings/[id]/bulk-messages`
- Test: `src/modules/messaging/{replies,bulk}.test.ts`, `src/app/api/v1/host/listings/[id]/bulk-messages/route.test.ts`

**Interfaces:**
- Consumes: `scanHostText`, `sendHostMessage` (Task 22); `safety.getRelationships` (fake); `registerSubjectHandlers` (trust); in the bulk route, `listings.getHiringInfoMany` and `orgs.canAccessListing` (404 outside scope) and then `hiring.listApplicationIdsByStatus` (mocked in tests); `record`, `enqueue`
- Produces:
  - Saved replies: at most 20 `reply` rows per org (the 21st → 409 `limit_reached`); title ≤ 60, body ≤ 2,000; audit `messaging.saved_reply_changed` on create, update and delete; any Owner, Admin or Recruiter may edit.
  - `getNotSelectedMessage`: the org's `not_selected` row, else `{ body: NOT_SELECTED_DEFAULT, isDefault: true }`. `setNotSelectedMessage`: owner or admin only (else 403 `role_not_allowed`), upserts the row, audit `messaging.not_selected_changed`.
  - `createBulkMessage`: maps application IDs to their threads, calls `safety.getRelationships` once for those threads' seekers and stamps `read_only_reason = 'blocked'` on every blocked one (Plan decision 11), skips read-only threads (withdrawn and blocked included), and with more than 200 left → 409 `too_many_recipients`. It stores `bulk_messages` (`recipient_count`, `thread_ids`, `scan_state 'pending'`) and enqueues `messaging.bulk_send` with payload `{ bulkId }` and dedupe `bulk:<bulkId>`.
  - `runBulkSend`: while the bulk is `pending`, one `scanHostText` on the template with `subjectType: 'bulk_message'` and `subjectId` = the bulk ID (Plan decision 26), storing the outcome and `check_id`. `held` sends nothing. `clear` or `warn`: one `sendHostMessage` per thread in `thread_ids` with `bulk_id`, skipping threads that already hold a message with this `bulk_id` (so a retry or a release sends once); `sent_count` counts the non-null results, so a block made after the create lowers it; audit `messaging.bulk_sent` with the counts.
  - `register.ts` adds trust subject `bulk_message`: `approve` on a `held` bulk sets `clear` and enqueues `messaging.bulk_send` (dedupe `bulk:<bulkId>:released`), whose run sends without a second scan; `approve` on a `warn` bulk sets the bulk and its messages to `clear`; `remove` keeps or sets the bulk `held` and sets any message it delivered to `removed`.
  - `getMessageForReview(db, id, { subjectType: 'bulk_message' })`: `{ body: <the template>, orgName, sentAt: <created_at> }`, or null for an unknown ID.
- [ ] **Step 1: Write the failing tests.**
  - The 21st saved reply → 409 `limit_reached`. A Recruiter's `PUT /host/not-selected-message` → 403; an Admin's → 200 and `isDefault: false`. With no row, `GET` returns the default with `isDefault: true`.
  - Bulk to 3 applicants where one thread is read-only → `recipients: 2`; after the job, 2 messages share the `bulk_id` and `scanHostText` was called once, with `subjectType: 'bulk_message'`. 201 recipients → 409 `too_many_recipients`. The 6th bulk send in an hour → 429.
  - *(Spec section 10)* Bulk to 3 applicants where one seeker blocked the org (`safetyFake.setBlocked`) and nobody opened that thread since → `recipients: 2`, that thread's `read_only_reason` is `blocked`, and after the job it holds no bulk message. A block made between the create and the job → that thread gets nothing and `sent_count` is `recipient_count − 1`.
  - A `__block__` template → 0 messages, `bulk_messages.scan_state = 'held'`, and one open `moderation` item with subject `bulk_message` and the bulk ID; `getMessageForReview(db, bulkId, { subjectType: 'bulk_message' })` returns the template. `decide(…, 'approve')` on that item, then a worker run → exactly one `clear` message per recipient thread with the `bulk_id`, `scanHostText` still called once in all, and each seeker one `messages.new`; a second worker run adds nothing. `decide(…, 'remove')` on another held bulk → still `held`, 0 messages.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging src/app/api/v1/host`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(messaging): saved replies, the Not selected message, bulk messages and bulk review`.

### Task 25 (W4): Reply stats, the daily job, the host page provider and messaging privacy

**Files:**
- Modify: `src/modules/messaging/{stats.ts,register.ts,privacy.ts}`
- Test: `src/modules/messaging/{stats,privacy}.test.ts`

**Interfaces:**
- Consumes: `hostpages.registerHostPageProvider` (fake); `listings.getHiringInfoMany` (fake); `removeMedia` and `getStorage` (media)
- Produces:
  - `getReplyStats(db, orgId)`: over threads with an `application_id` created in the last 180 days. A thread's reply time is `first_host_reply_at − created_at` in minutes; an unanswered one counts as `min(age, 7 days)` and is left out while younger than 24 hours. `medianFirstReplyMinutes` is the median (the mean of the middle two for an even count, rounded), `usuallyRepliesWithinDay` is median ≤ 1,440. It reads `org_reply_stats` when computed today, else computes.
  - `runMessagingDaily`: sets `listing_closed_at` from `getHiringInfoMany(...).closedAt` on threads still null, then recomputes `org_reply_stats` for every org with conversations.
  - `register.ts` adds the host page provider `reply_time`: null below 10 conversations, else `{ conversations, withinADay: usuallyRepliesWithinDay }`.
  - **Privacy:** `exportData` for a user gives their threads (listing title, org name) with their own messages only. `erase` for a user sets the body of every message they sent to `DELETED_BODY`, removes their attachments' media and empties the arrays, deletes their `thread_reads`, and returns `retained: [{ table: 'messages', reason: 'shared_record', until: <latest message + 12 months> }]`; with `holds` containing `messages` or `all`, it changes nothing and returns `legal_hold`. For an org it deletes `saved_replies` and `org_reply_stats`. `retentionRules['messaging.messages_12m']` deletes threads (messages cascade) whose `listing_closed_at` and newest message are both over 12 months old, at most `limit` per run.
- [ ] **Step 1: Write the failing tests.**
  - Reply times 60, 120 and 2,000 minutes → median 120, within a day. An unanswered 10-day-old thread counts as 10,080 minutes; an unanswered 2-hour-old thread is left out.
  - With 9 conversations the provider returns null; with 10 it returns `{ conversations: 10, withinADay: true }`.
  - The daily job sets `listing_closed_at` for a thread on a listing the fake reports closed.
  - Erasing a seeker turns their message bodies into `[deleted]`, calls `removeMedia` for each attachment, and leaves the host's messages; a second run returns `erased: 0`. `holds: ['messages']` changes nothing. The retention rule deletes a thread closed 13 months ago and keeps one closed 11 months ago.
- [ ] **Step 2:** Run `pnpm test src/modules/messaging/stats.test.ts src/modules/messaging/privacy.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(messaging): reply stats, daily job, host page provider and privacy`.

### Task 26 (W5): As described (E7)

**Files:**
- Modify: `src/modules/hiring/as-described/{open.ts,due.ts,form.ts,summary.ts,register.ts}`; the handlers of `me/as-described/[id]/route.ts`
- Test: `src/modules/hiring/as-described/as-described.test.ts`

**Interfaces:**
- Consumes: `getHiringInfoMany` (fake); `hostpages.registerHostPageProvider` (fake); `notify`
- Produces:
  - `openAsDescribed` (the hire hook): inserts one row per application (`on conflict (application_id) do nothing`) with `eligible_via` (`host_marked` for `host`, `offer_accepted` otherwise), `asks_housing` and `asks_meals` from the listing.
  - `asDescribedDue`: the due date is the day after the listing's `endDate`; with no end date, the accepted offer's `start_date` (or the hire date) plus 90 days. Rows not yet prompted whose due date is today or earlier get `hiring.as_described_prompt`, `prompted_at = now` and `expires_at = now + 60 days`.
  - `getAsDescribedPrompt`: owner only (404 otherwise); `asksWorkedHere` for `offer_accepted`; `state` is `closed` past `expires_at`, `submitted` once answered. `submitAsDescribed`: open rows only, else 409 `closed` (answers are final); housing and meals are stored only when asked.
  - `getAsDescribedSummary(db, { orgId, listingId? })`: counts submitted rows that are `host_marked`, or `offer_accepted` with `worked_here = true`; `visible` is `responses ≥ 5` for the org, or `≥ 3` with `listingId`; housing and meals tallies count only rows that asked.
  - `register.ts`: host page provider `as_described` returning the org summary, or null unless `visible`.
- [ ] **Step 1: Write the failing tests.**
  - *(E7)* A host-marked hire on a listing ending 2027-08-31: the job on 2027-08-31T15:00Z prompts no one; on 2027-09-01T15:00Z the seeker gets exactly one `hiring.as_described_prompt`; a second run sends nothing.
  - An ongoing listing hired on 2027-01-10 is due on 2027-04-10.
  - *(E7)* The org summary with 4 responses → `visible: false`; with 5 → `visible: true`. A listing summary with 3 → `visible: true`. The host page provider returns null at 4.
  - An `offer_accepted` row answered with `workedHere: false` isn't counted. A listing without housing has no housing answer stored.
  - A second submit → 409 `closed`; 61 days after the prompt → 409 `closed`. Another seeker → 404.
  - After the seeker's `seeker_user_id` is set to null, the counts are unchanged.
- [ ] **Step 2:** Run `pnpm test src/modules/hiring/as-described`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(hiring): As-described check with privacy thresholds`.

### Task 27 (W5): Host analytics (E8)

**Files:**
- Modify: `src/modules/analytics/{ranges.ts,host.ts}`
- Test: `src/modules/analytics/{ranges,analytics}.test.ts`

**Interfaces:**
- Consumes: `AnalyticsRange`, `Metric`, `Slice` and `HostAnalytics` from `@/lib/host-analytics` (Task 5; `@/lib/analytics` is Foundation's PostHog file, Plan decision 24); read-only `queryRows` over `app.pipeline_events`, `app.pipeline_entries` and `app.invites` (spec section 3: analytics reads hiring's facts and owns no tables); `hiring.getAsDescribedSummary`; `listings.listForOrg` (fake); `discovery.getListingEventCounts` (fake); `hostpages.countFollowersAt` (fake); `getBoostWindows` (Task 6)
- Produces:
  - `resolveRange`: `7d`, `30d`, `90d` end at `now`, with a previous period of equal length; `season` is the current meteorological season in `tz` (Mar–May, Jun–Aug, Sep–Nov, Dec–Feb) against the one before; `all` starts at the org's first pipeline event and has `previous: null`.
  - `getHostAnalytics` (spec 3's signature): the listings are `listingIds` (or every listing of the org for `'all'`), narrowed to those at `locationId` from `listForOrg`. The route, not this function, applies the member's scope (Task 28). Tiles: `views` and `saves` from SP3; `applications`, `interviews` (`interview_scheduled`) and `hires` from `pipeline_events`; `followers` = `countFollowersAt(to)` with previous `countFollowersAt(from)`. `funnel` = Views, Applications, Interviews, Hires. `perListing` = applications per listing. `weekly` = SP3's `week` buckets joined with applications per ISO week. `invites` = `invite_sent`, `invite_interested`, `invite_applied`. `boost` = for each window from `getBoostWindows`, views during it and in the same number of days before it. `asDescribed` per Plan decision 19. `sources` = applications by source with `SOURCE_LABELS`. `statuses` = current entry statuses. No response field holds a seeker, viewer or saver identity.
- [ ] **Step 1: Write the failing tests.**
  - *(E8)* pipeline events matching the E1 journey (one each of `applied`, `interview_scheduled`, `hired`, `invite_sent`, `invite_interested`, `invite_applied`) → tiles `applications.value 1`, `interviews.value 1`, `hires.value 1`, and `invites` = `[{ key: 'invite_sent', value: 1 }, { key: 'invite_interested', value: 1 }, { key: 'invite_applied', value: 1 }]`.
  - `7d` with 2 applications this week and 1 the week before → `{ value: 2, previous: 1 }`; `all` → `previous: null`.
  - `resolveRange('season', 'America/Denver', 2027-07-10)` → from 2027-06-01 to 2027-09-01 local, previous 2027-03-01 to 2027-06-01.
  - Views and saves come from the SP3 fake; followers call `countFollowersAt` at `to` and at `from`.
  - With no boost source, `boost: []`; with one window of 3 days, `before` counts the views in the 3 days before it.
  - `sources` labels are Seek, Swipe, Map, Invites, Boost, Landing pages, Other.
  - `listingIds: [A]` counts only A's events; `locationId` narrows `'all'` to that location's listings.
  - *(E8)* the serialized response contains none of the seeded seeker IDs and no key named `seekerUserId`, `userId`, `viewerKey` or `email`.
- [ ] **Step 2:** Run `pnpm test src/modules/analytics`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(analytics): host analytics with period comparison, invites funnel and boost windows`.

### Task 28 (W5): Analytics routes and the CSV export

**Files:**
- Modify: `src/modules/analytics/csv.ts`; the handlers of `host/analytics/route.ts` and `host/analytics/export.csv/route.ts`
- Test: `src/modules/analytics/csv.test.ts`, `src/app/api/v1/host/analytics/export.csv/route.test.ts`

**Interfaces:**
- Consumes: `analyticsQuerySchema` and `HostAnalytics` from `@/lib/host-analytics` (Plan decision 24); `listingScope` (Task 8); `getHostAnalytics` (Task 27); `record`
- Produces:
  - `toAnalyticsCsv(a)`: header `card,label,value,previous_value`, then one row per tile, slice and boost entry (`previous_value` empty when null). Fields with a comma, quote, CR or LF are quoted with doubled quotes; a field starting with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` before quoting.
  - Both routes turn the member's scope into `listingIds`: `listingScope(db, ctx)` from `@/modules/messaging`, intersected with the `listingId` filter when given (a `listingId` outside scope is 404); `'all'` only for an unscoped member with no filter.
  - The export route answers `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="analytics-<range>.csv"` and records `analytics.exported` with `orgId` and `{ range }`.
- [ ] **Step 1: Write the failing tests.**
  - The header line is `card,label,value,previous_value`; the tile `views` with 120 and previous 98 gives `tiles,Views,120,98`; `all` gives `tiles,Views,120,`.
  - *(Review Focus 5)* a listing titled `=HYPERLINK("x")` gives the field `"'=HYPERLINK(""x"")"`; `-5 cabins` gives `'-5 cabins`; `Bend, OR` gives `"Bend, OR"`.
  - Route: content type and file name as above; one audit row; Billing → 403; the 21st export in an hour → 429. A Recruiter scoped to listing A gets numbers for A only, and `listingId: B` → 404.
- [ ] **Step 2:** Run `pnpm test src/modules/analytics/csv.test.ts src/app/api/v1/host/analytics`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(analytics): analytics API and safe CSV export`.

---

## Phase B2: Screens (W6 and W7 in parallel; based on B1 merged, after Foundation B3, SP4 and the design gate)

Pages are server components that call `requireHost()` or `requireSeekerPage(...)` (SP3) and the modules directly, starting with `import '@/server/module-registrations';`. Client components change state only through `/api/v1` with SP4's `apiFetch`. Each pattern lives in `src/ui/patterns`, takes plain props (no module imports, not even types; copy comes in as props), and gets a gallery page. Every screen follows its spec section 7 row for components, empty and error copy and mobile/desktop layout, using the Task 5 copy constants. E2E tests use SP3's `signInAsHost`/`signInAsSeeker`, SP2's `entitleHost` and `drainJobs`, and SP3's `publishListing` fixtures.

### Task 29 (W6): Host hiring patterns

**Files:**
- Create: `src/ui/patterns/{PipelineBoard,CandidateDeck,FitSheet,SlotPicker,AnalyticsCard}.tsx`, `src/ui/patterns/hiring-patterns.test.tsx`, gallery pages `src/app/design-system/patterns/{pipeline-board,candidate-deck,fit-sheet,slot-picker,analytics-card}/page.tsx`
- Modify: `src/ui/components/CandidateCard.tsx` and `CandidateCard.test.tsx` (`fit` may be `null`, rendered as `—` with the chip still opening the sheet)

**Interfaces:**
- Produces:
  - `PipelineBoard<T>({ columns: { key: string; label: string; count: number; items: T[] }[]; renderItem(item: T): ReactNode; closed: { count: number; active: boolean; onToggle(): void }; emptyText: string })`: columns from 768 px up, status `Tabs` below.
  - `CandidateDeck<T>({ items: T[]; renderItem(item: T): ReactNode; onPass(item: T): void; onShortlist(item: T): void; onInterview(item: T): void })`: drag left Pass, right Shortlist, up Interview (opens only), with SP3's `swipe-gesture`; the ←, → and ↑ keys and three labeled buttons do the same.
  - `FitSheet({ open: boolean; onOpenChange(o: boolean): void; fit: { score: number; lines: { label: string; weight: number; text: string }[] } | null; unavailableText: string })`: each line reads `<label> · <weight>%` and its text.
  - `SlotPicker({ timezone: string; timezones: { value: string; label: string }[]; onTimezoneChange(tz: string): void; value: { date: string; time: string }[]; onChange(v: { date: string; time: string }[]): void; errors?: Record<number, string> })`, 1–5 rows. The same file exports `toSlotStarts(rows: { date: string; time: string }[], tz: string, toUtc: (local: string, tz: string) => string): { start: string }[]`; pages pass `zonedLocalToUtc` from `@/lib/hiring` as `toUtc`, so the pattern imports no domain code.
  - `AnalyticsCard({ title: string; view: ChartView; onViewChange(v: ChartView): void; chart: ReactNode; table: { columns: TableColumn[]; rows: Record<string, string | number>[] }; empty: boolean; emptyText: string; note?: string })`.
- [ ] **Step 1: Write the failing tests.**
  - `PipelineBoard` renders 5 column headings with counts and a status tab list with 5 tabs.
  - `CandidateDeck`: ← calls `onPass`, → `onShortlist`, ↑ `onInterview`; each button has an accessible name.
  - `FitSheet` renders "Availability · 30%"; with `fit: null` it shows `unavailableText`.
  - `toSlotStarts([{ date: '2027-03-14', time: '10:00' }], 'America/Denver', zonedLocalToUtc)` gives `[{ start: '2027-03-14T16:00:00.000Z' }]`, whatever the test machine's own time zone; the add button is disabled at 5 rows and remove is disabled at 1.
  - `AnalyticsCard` switches to a table with the given rows; with `empty`, it shows `emptyText`.
  - `CandidateCard` with `fit: null` shows `—`.
- [ ] **Step 2:** Run `pnpm test src/ui`. Expected: FAIL.
- [ ] **Step 3:** Implement with design-system components and token classes only.
- [ ] **Step 4:** Run `pnpm test src/ui` and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): pipeline board, candidate deck, fit sheet, slot picker and analytics card`.

### Task 30 (W6): Host Home and Applicants

**Files:**
- Create: `src/app/host/page.tsx` (replacing the placeholder), `src/app/host/_components/HiringTiles.tsx`, `src/app/host/applicants/{page.tsx,[applicationId]/page.tsx,_components/*}`, the Home and Applicants parts of `tests/e2e/sp5-host-screens.spec.ts`
- Modify: `src/app/host/layout.tsx` (Billing hides Applicants, Candidates, Interviews, Messages and Analytics)

**Interfaces:**
- Consumes: `listings.getHomeSummary` (SP2), `getHostHome`, `listApplicants`, `getApplicantDetail`; the routes of Tasks 10, 17 and 19; SP4's `ApplicationSnapshotView`
- Produces:
  - **Home** (Plan decision 5): SP2's reminders, quota tiles and setup checklist, plus three `StatTile`s from `getHostHome`: today's applicants ("No new applicants today" at 0, plus "All openings filled" with a Close link to `/host/listings/<id>` per `openingsFilled` item), today's interviews and unread messages. The client sends its `Intl` time zone.
  - **Applicants:** the spec section 7 rows. Tabs Pipeline, Deck and List; listing `Select`; status `Chip`s; sort `Select` (Newest default, Fit optional); `CandidateCard`s with Pass, Shortlist and Interview; Pass shows a `Toast` with Undo for 10 seconds; Mark hired in the card menu. The detail opens in a `Sheet` (full screen on a phone) with the Resume pop-up (`ApplicationSnapshotView`), `FitSheet`, screening answers, the Additional step tick, history, and buttons to propose an interview (the proposal sheet from Task 31) or send an offer (`Sheet` with position, start date, pay, note and a PDF letter upload through Foundation's media upload).
- [ ] **Step 1: Write the failing e2e tests** (`sp5-host-screens.spec.ts`, Home and Applicants parts).
  - Home shows the three tiles and SP2's reminders; with no applicants today, "No new applicants today".
  - On Applicants, Pass shows a toast with Undo; Undo restores the card; a Billing member sees no Applicants nav item and gets the 403 error state on `/host/applicants`.
  - The Deck view: the → key shortlists the top card.
  - The detail sheet's Fit chip opens the sheet with weighted lines.
  - `AxeBuilder` finds 0 serious or critical violations at 390 px and 1280 px.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp5-host-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): Home tiles and the Applicants pipeline, deck and detail`.

### Task 31 (W6): Candidates and Interviews screens

**Files:**
- Create: `src/app/host/candidates/{page.tsx,_components/*}`, `src/app/host/interviews/{page.tsx,_components/*}` (including `InterviewProposalSheet.tsx`, reused by Task 30), the Candidates and Interviews parts of `tests/e2e/sp5-host-screens.spec.ts`

**Interfaces:**
- Consumes: the Task 13–15 and 17 routes, including `GET /api/v1/host/invites/:id/candidate`; SP4's `CandidateProfileView`; `SlotPicker` and `toSlotStarts` (Task 29)
- Produces: the spec section 7 rows. **Candidates:** listing `Select`, filters (state `Select`, available-by `Input`, skills `Combobox` up to 5), pool `CandidateCard`s with Save, Hide and Invite, views All, Saved and Hidden, and the invite `Sheet` (`JobCard` preview, note `Textarea` with a 300 counter, credits left). With 0 credits Invite is disabled with "You're out of invite credits" and a link to `/host/promote`; a 409 `seeker_unavailable` shows "Not accepting invites right now". A card whose invite reads Interested or Applied has a View profile button that opens a `Sheet` with SP4's `CandidateProfileView`, fed by `GET /api/v1/host/invites/:id/candidate` (Plan decision 16). **Interviews:** Tabs Upcoming, Needs action, Past; rows with Cancel, Propose new times and Completed / No-show. With `?propose=<interviewId>` the page opens the new-round proposal sheet for that interview (Plan decision 28: W7's thread card links here; an unknown or inactive ID shows the list with no sheet). The proposal sheet has `SlotPicker`, duration `Select` (default 30), format `SegmentedControl`, link or address `Input`, note `Textarea`, expiry `SegmentedControl` 48 / 72 (default 72) and time zone `Select` (default the listing's).
- [ ] **Step 1: Write the failing e2e tests.**
  - Inviting a pool candidate lowers "credits left" by 1 and shows Sent on the card; with 0 credits the Invite button is disabled with "You're out of invite credits".
  - Filters with no match show "No candidates match these filters".
  - Proposing 3 slots creates an interview listed under Upcoming; a request for new times appears under Needs action.
  - Opening `/host/interviews?propose=<interviewId>` shows the proposal sheet; submitting 2 slots creates round 2 of that interview.
  - After the seeker answers Interested, View profile on that candidate's card shows their full name; before, the card has no View profile button.
  - Axe finds 0 serious or critical violations at both widths.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp5-host-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): candidate pools with invites and the Interested profile, and the interviews screen`.

### Task 32 (W6): Analytics screen

**Files:**
- Create: `src/app/host/analytics/{page.tsx,_components/*}`, the Analytics part of `tests/e2e/sp5-host-screens.spec.ts`

**Interfaces:**
- Consumes: `getHostAnalytics`; the Task 28 routes; types from `@/lib/host-analytics` (Plan decision 24)
- Produces: the spec section 7 row: range `SegmentedControl` (7 days, 30 days, 90 days, This season, All time), listing and location `Select`s, a CSV `Button` (a link to the export route), six `StatTile`s with the change from the previous period ("+12% vs previous period"; none for All time), and `AnalyticsCard`s: funnel, applications per listing and views and applications by week (`BarChart`), invites (`StackedBar`), boost ("No boosts in this period" when empty), As described (with "Shown after 3 responses, to protect workers' privacy" for one listing), sources and statuses (`DonutChart`). Each card has the Chart / Table switch and "No data for this period" when empty.
- [ ] **Step 1: Write the failing e2e test.** Switching to 30 days updates the tiles; the Table view of the sources card lists Seek; the CSV link downloads a file whose first line is `card,label,value,previous_value`; axe passes at both widths.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp5-host-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): analytics screen with chart and table views and CSV export`.

### Task 33 (W7): Messaging patterns

**Files:**
- Create: `src/ui/patterns/{ThreadList,MessageBubble,ThreadCard,Composer,ScamBanner,OffsiteLinkDialog}.tsx`, `src/ui/patterns/messaging-patterns.test.tsx`, gallery pages `src/app/design-system/patterns/{thread-list,message-bubble,thread-card,composer,scam-banner,offsite-link-dialog}/page.tsx`

**Interfaces:**
- Produces:
  - `ThreadList({ items: { id: string; title: string; subtitle: string; preview: string | null; at: string; unread: boolean; readOnly: boolean; avatar: { src: string | null; name: string } }[]; selectedId?: string; hrefFor(id: string): string; emptyText: string })`.
  - `MessageBubble({ side: 'mine' | 'theirs' | 'system'; segments: { text: string; href: string | null }[]; senderName?: string; at: string; stateLabel?: string; attachments?: { label: string; href: string; mime: string }[]; onLinkClick(href: string): void })` (the page passes `ATTACHMENT_LABELS` text as `label`, Plan decision 27): a link segment renders a `<button>` styled as a link that calls `onLinkClick`, never an `<a href>` to the outside.
  - `ThreadCard({ variant: 'application' | 'invite' | 'interview' | 'offer' | 'event'; title: string; lines: string[]; status?: { label: string; tone: ChipTone }; actions?: { label: string; onClick(): void; variant?: 'primary' | 'secondary' }[]; children?: ReactNode })`.
  - `Composer({ value: string; onChange(v: string): void; onSend(): void; sending: boolean; maxLength: number; attachments: { id: string; name: string; state: 'uploading' | 'scanning' | 'ready' | 'error'; label: string }[]; onAttach(files: File[]): void; onRemove(id: string): void; savedReplies?: { id: string; title: string; body: string }[]; onInsertReply?(body: string): void; disabled?: boolean; disabledText?: string })`: Send is disabled while any attachment isn't `ready`, when empty, or past `maxLength` (code points).
  - `ScamBanner({ title: string; body: string; onReport(): void; onBlock(): void })` (`role="alert"`).
  - `OffsiteLinkDialog({ href: string | null; host: string; onOpenChange(o: boolean): void })`: shows the host and opens the link in a new tab with `rel="noopener noreferrer"` on Continue.
- [ ] **Step 1: Write the failing tests.**
  - *(Review Focus 2)* `MessageBubble` with segments from `findLinks('go to https://bücher.example/a and javascript:alert(1)')` renders exactly one link control; clicking it calls `onLinkClick('https://xn--bcher-kva.example/a')`; the text `javascript:alert(1)` is plain text. `OffsiteLinkDialog` shows `xn--bcher-kva.example`, and Continue calls `window.open` with `'_blank'` and `'noopener,noreferrer'`.
  - `Composer` disables Send while an attachment is `scanning` (its label "Scanning…" visible), enables it when all are `ready`, and counts `'\u{1F600}'.repeat(4000)` as 4,000.
  - `ScamBanner` renders the given title and body and two buttons named Report and Block.
  - `ThreadList` marks an unread row and shows `emptyText` with no items.
- [ ] **Step 2:** Run `pnpm test src/ui/patterns/messaging-patterns.test.tsx`. Expected: FAIL.
- [ ] **Step 3:** Implement with design-system components and token classes only.
- [ ] **Step 4:** Run the test and `pnpm check:tokens`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(ui): thread list, message bubble, thread cards, composer, scam banner and off-site dialog`.

### Task 34 (W7): Host Messages and saved replies

**Files:**
- Create: `src/app/host/messages/{page.tsx,[threadId]/page.tsx,replies/page.tsx,_components/*}` (including `ThreadView.tsx`, shared with Task 35), the host part of `tests/e2e/sp5-messaging-screens.spec.ts`

**Interfaces:**
- Consumes: the Task 21–24 routes and `GET /api/v1/host/invites/:id/candidate` (Task 15); SP4's `ReportSheet` (subjects `message` and `thread`), `BlockDialog` (`by: 'host'`, shown only when the thread has an application) and `CandidateProfileView`; `findLinks`, `displayHost`, `fillTemplate`, `ATTACHMENT_LABELS`. No W6 file (Plan decision 28).
- Produces: the spec section 7 rows. `ThreadView` renders messages (with "Sending…", "Sent", "Not delivered"), cards from `cards` (interview actions for the host: Cancel, Completed / No-show, and Propose new times as a link to `/host/interviews?propose=<interviewId>`, Plan decision 28; the host's invite card, once the invite reads Interested or Applied, has View profile, which opens a `Sheet` with `CandidateProfileView` from `GET /api/v1/host/invites/:id/candidate`; a scheduled or canceled interview on either side has an "Add to calendar" link to `/api/v1/interviews/:id/ics`, Plan decision 10; offer: Cancel), message links that open `OffsiteLinkDialog`, attachments labeled "PDF" or "Photo" from `ATTACHMENT_LABELS` by `mime` (Plan decision 27), the composer with attachments (Foundation upload, kind `attachment`, polling until approved) and a saved-reply picker that fills `{first_name}`, `{position}`, `{org_name}` and `{my_first_name}`; the overflow menu with Report and Block; "This conversation is read-only" instead of the composer when read-only. It calls `POST /threads/:id/read` on open. `/host/messages/replies` lists up to 20 saved replies with create, edit and delete, and the Not selected editor (shown to Owner and Admin) with fill-in `Chip`s.
- [ ] **Step 1: Write the failing e2e tests.** A host sends a message and sees "Sending…" then "Sent" after `drainJobs`; a `__block__` message ends as "Not delivered"; inserting a saved reply fills the seeker's first name; a Recruiter doesn't see the Not selected editor; on an invite-started thread after Interested, View profile shows the seeker's full name; the interview card's Propose new times link points to `/host/interviews?propose=<interviewId>`; a PDF attachment reads "PDF"; axe passes at both widths.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp5-messaging-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(host): messages, threads and saved replies`.

### Task 35 (W7): Seeker Inbox, invite sheet, thread and the As-described form

**Files:**
- Create: `src/app/(seeker)/inbox/{page.tsx,[threadId]/page.tsx,invites/[inviteId]/page.tsx,_components/*}` (replacing the Inbox placeholder), `src/app/(seeker)/as-described/[id]/page.tsx`, the seeker part of `tests/e2e/sp5-messaging-screens.spec.ts`

**Interfaces:**
- Consumes: Task 34's `ThreadView`; the Task 15, 17, 19, 21 and 26 routes; SP4's `ReportSheet`, `BlockDialog` (`by: 'seeker'`, `offerWithdraw: true`), `MuteToggle`; `useCounts().refresh()` after reading
- Produces: the spec section 7 rows. `/inbox` has Tabs Messages, Invites and Interviews (`?tab=invites` opens Invites, SP4's sibling contract), each with its empty copy. The invite sheet shows the `JobCard`, the note (with `ScamBanner` when `warn`), Interested (then "Apply now" linking to `applyHref`), Not interested with reason `Chip`s, and Mute host; an expired invite shows "This invite expired". The thread page shows `ScamBanner` above each `warn` message; the interview card offers Pick a time (slots in the interview's time zone, passed ones disabled), Request new times (1–3 windows and a note) and Decline, which opens a `Dialog` "Also withdraw your application?"; the offer card offers Accept and Decline (with a confirm `Dialog`) and a letter link to `/api/v1/offers/:id/letter`. `/as-described/[id]` shows "I worked here" only when asked, Yes / Partly / No `Radio` groups for housing and meals when asked and for pay always, and "This check has closed" when closed.
- [ ] **Step 1: Write the failing e2e tests.** Interested from the invite sheet shows "Apply now" with `source=invite`; a `__flag__` note shows "Never pay to get a job" with Report and Block; picking a slot changes the interview card to scheduled; Decline asks "Also withdraw your application?"; the As-described form submits once and then reads as submitted; axe passes at both widths.
- [ ] **Step 2:** Run `pnpm e2e tests/e2e/sp5-messaging-screens.spec.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(seeker): Inbox with messages, invites and interviews, and the As-described form`.

---

## Phase C: Integration (W8)

### Task 36 (W8): Cross-module proofs, the authorization matrix and wiring

**Files:**
- Create: `tests/sp5/authz.int.test.ts` (E9), `tests/sp5/races.int.test.ts`, `tests/sp5/cross-module.test.ts`, `tests/sp5/wiring.test.ts`
- Modify: any module, for integration fixes only (migrations in 4900–4999)

**Interfaces:**
- Consumes: every real SP2, SP3, SP4 and SP5 module (no `tests/fakes/sp5` mocks); SP2's and SP4's seed helpers; `runWorker` with the real `handlers`

- [ ] **Step 1: Write the failing tests.**
  - **`authz.int.test.ts` (E9):** for every SP5 `/api/v1/host/**` route, a Billing member gets 403. A Recruiter assigned to another listing gets 404 on this listing's applicant, candidates, invite, Interested profile (`/host/invites/:id/candidate`), interview, offer, thread and analytics `listingId`. A Recruiter scoped only by location L1 gets 200 on a listing at L1. A seeker gets 404 on another seeker's thread, invite, interview, offer, As-described prompt, `.ics` and offer letter, and on their own interview and offer while its note is `pending` or `held`.
  - **`races.int.test.ts` (spec failure mode 2):** concurrent `withdraw` (SP4) and `markHired` on one application, 20 times: each run ends `withdrawn` or `hired`, never both in SP4 and the mirror. When withdrawn wins with a scheduled interview, a sent offer and a pending pass: the interview is `canceled` and the organizer has a `hiring.interview_canceled` notification whose email carries an `.ics` with `METHOD:CANCEL`, the offer is `canceled`, the pending pass is gone and no Not selected message exists, and the thread is read-only.
  - **`cross-module.test.ts`:** a real SP4 submit gives one pipeline entry, one thread with an application card, and a fit score (or null with fit off), and handling the outbox twice changes nothing. A report on a `message` and on a `thread` through SP4's `report` is accepted, and `decide(…, 'remove')` on the thread's item makes it read-only. *(E8 on real modules)* after the E1 sequence driven through services, `getHostAnalytics` reads Applications 1, Interviews 1, Hires 1, invites 1 → 1 → 1, and `toAnalyticsCsv` has those rows. One submitted application gives each notify member exactly one `applications.new_applicant` (SP4's) and no SP5 duplicate. *(Spec section 10, Plan decision 11)* a seeker who blocks the org through SP4's `block` after applying, with the thread never opened afterwards: a Pass committed by the worker leaves the status `not_selected` but adds no message to the thread and no `messages.new` for the seeker, and a bulk send to that listing's applicants reports `recipients` one lower and skips that thread. *(Plan decision 16)* the Interested profile route returns 404 before the seeker answers Interested and the seeker's full name and email after, through SP4's real `getCandidateCards`.
  - **`wiring.test.ts`:** importing only `src/app/api/v1/host/applicants/route.ts` (guards mocked) and calling `GET` works with SP5's registrations present (trust subject handlers for `message`, `bulk_message`, `thread`, `invite`, `interview` and `offer` exist through `findSubjectHandler`). Importing only `@/server/sp2-wiring` registers SP5's `reply_time` and `as_described` host page providers.
- [ ] **Step 2:** Run `pnpm test tests/sp5/cross-module.test.ts tests/sp5/wiring.test.ts` (PASS required) and `pnpm typecheck`; the `int` files run in CI. Expected: FAIL until wired.
- [ ] **Step 3:** Fix the integration gaps in the owning files.
- [ ] **Step 4:** Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. Expected: PASS. CI's integration job runs the `int` files.
- [ ] **Step 5:** Commit: `test(sp5): authorization matrix, withdraw races, cross-module proofs and wiring`.

### Task 37 (W8): The E1 journey end to end, and accessibility

**Files:**
- Create: `tests/e2e/helpers/sp5.ts`, `tests/e2e/sp5-journey.spec.ts` (E1), `tests/e2e/sp5-a11y.spec.ts`

**Interfaces:**
- Consumes: SP2's `tests/e2e/helpers/sp2.ts` (`entitleHost`, `drainJobs`, `dbRows`, `readEmail`); SP3's `tests/e2e/fixtures/{sp2-writes,auth}.ts` (`seedHost`, `publishListing`, `signInAsHost`, `signInAsSeeker`); SP4's seeker profile flow
- Produces, `tests/e2e/helpers/sp5.ts`: `inviteCreditBalance(page): Promise<number>` (reads `GET /api/v1/host/entitlements`), `shiftInterviewIntoPast(interviewId: string, hours: number)` (test-only SQL that moves `scheduled_start` and `scheduled_end` back), `readEmailAttachments(to: string, subject: RegExp): Promise<{ filename: string; contentType: string }[]>`.
- [ ] **Step 1: Write the failing e2e test** (`sp5-journey.spec.ts`, E1, against `pnpm db:local` with stub providers).
  1. An entitled host with a published Seasonal listing; a seeker with a pool-ready profile matching it.
  2. The host opens the listing's Candidates tab and invites the seeker; `inviteCreditBalance` drops by exactly 1.
  3. The seeker sees the invite in Inbox › Invites and taps Interested; a thread exists (`dbRows`).
  4. The seeker applies through "Apply now" (SP4 flow); after `drainJobs`, the host's invite list reads Applied.
  5. The host proposes 3 slots; the seeker picks one; after `drainJobs`, the stub emails to both carry an attachment with content type starting `text/calendar`.
  6. `shiftInterviewIntoPast(id, 3)`; the host marks it Completed.
  7. The host sends an offer with a PDF letter (uploaded, scanned by the stub, approved); the seeker accepts.
  8. SP4's `GET /api/v1/me/applications?view=applied` shows the application as Hired, and the host's pipeline shows it in the Hired column.
- [ ] **Step 2:** `sp5-a11y.spec.ts`: every SP5 route (`/host`, `/host/applicants`, an applicant detail, `/host/candidates`, `/host/interviews`, `/host/messages`, a thread, `/host/messages/replies`, `/host/analytics`, `/inbox` and its three tabs, an invite, a seeker thread, `/as-described/<id>`) has 0 serious or critical `AxeBuilder` violations at 390 px and 1280 px.
- [ ] **Step 3:** Run `pnpm e2e tests/e2e/sp5-journey.spec.ts tests/e2e/sp5-a11y.spec.ts`. Expected: FAIL until wired; fix the gaps in the owning files.
- [ ] **Step 4:** Run the full suite: `pnpm lint && pnpm check:tokens && pnpm typecheck && pnpm test && pnpm e2e`. Expected: all pass. CI runs the integration files.
- [ ] **Step 5:** Commit: `test(sp5): E1 journey end to end and accessibility`.

When Tasks 36 and 37 pass, every row of spec section 1 is proven: E1 Task 37; E2 Task 10; E3 Tasks 12 and 13; E4 Task 14; E5 Task 22; E6 Task 23; E7 Task 26; E8 Tasks 27, 28 and 36; E9 Task 36. Launch still waits on spec section 13's open items 1 (fit weights), 2 (legal check on fit) and 7 (final copy).
