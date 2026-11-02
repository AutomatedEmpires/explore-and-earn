# Community, announcements and moderated campaigns

Living V1 proposal, 2026-11-02. **Confirmed:** Feed / Photos / Announcements; seeker-uploaded Photos, <=3 tags, optional location/feeling, reactions and NO photo comments; moderated platform/employer announcements and limited labeled sponsored jobs/campaigns with host/job links and frequency caps. Exact audiences, captions, reaction set, cap values, prices and delivery model remain Recommended/Open in [decisions](08-sources-and-decisions.md). Nothing is implemented.

## 1. Three views of shared content

Community helps seekers understand real work/life experiences and timely opportunities without becoming a second job database. Keep professional resumes and social identity separate.

| Tab | Eligible sources | Relationship and exclusions |
| --- | --- | --- |
| Photos | Approved single-photo seeker posts, social handle, <=3 tags, optional coarse place/feeling, reactions | Photo-only scroll feed. No employer uploads, job/announcement/ad cards, or comments. Hosts upload workplace photos to their own public pages |
| Announcements | Platform notices and moderated employer notices/campaigns, author/date/expiry, canonical CTA and paid disclosure | No automatic post for every job or renewal. Unpaid employer inclusion is D18. No independent copies of photo posts |
| Feed | Curated projections of those same photo/announcement IDs plus limited Sponsored canonical job slots | No separate duplicate post store. Organic V1 seeker content recommended as photos; freeform seeker text threads are not assumed |

A photo may appear in Photos and Feed; an announcement in Announcements and Feed. That is intentional cross-view access to **one object**, with one permalink, revision, moderation state and reaction identity. No repeat distribution within a paginated Feed snapshot/session. Employer creative points to the canonical host/job; it cannot own a second set of job terms. A job targeted by an announcement and sponsored job slot uses target/host dedup rather than stacked promotions.

Recommend chronological eligible organic content plus explicit editorial curation, with manually pinned urgent notices carrying an end time and reason. Defer opaque engagement algorithms. Critical account/safety notices also use transactional channels; they cannot depend on an ad slot or muted community tab.

## 2. Entry, social identity and roles

Recommend Seek header + Profile shortcut, preserving the four pinned seeker tabs; Community has three inner tabs. Recommended read audience is authenticated seekers, no public indexing (D14). Guests see explanation/sign-in rather than post bytes. Dual-role users act through seeker identity; host membership alone confers no Photos publishing right or resume access.

Use a chosen community handle and separately approved optional avatar. Never auto-copy legal name, phone/email, native profile photo, resume, availability or employment history. Preview audience before publication. Recommend no public author directory in V1; block/report and owner My posts remain available. A post does not prove employment, credential validity, a host review or safety. Future public profiles need a separate audience design.

Seeker owns photo drafts/posts/reactions. Platform editor drafts/publishes platform notices under audited editorial permission. Host Owner/Admin submits own notices/campaigns; Listing manager may draft, Billing approves charges without creative approval or seeker data. Trust moderators approve/restrict under case permissions; payment cannot override them. Public host team/gallery consent is separate from seeker community content rights.

## 3. Photo publishing and interactions

Recommend one image per post for pilot, not an unapproved carousel. JPEG/PNG/WebP follow existing scan/decode/size limits. Lifecycle: private draft -> upload/quarantine -> safe decode/scan/EXIF removal -> metadata/audience/rights preview -> submit -> review -> published or returned/rejected. Clean scan alone is not publication. Original GPS never reaches derivatives; no location permission prompt on upload. Optional manually chosen place is coarse city/region/landmark, not live location, residence entrance or vessel position.

Fields: image, accessible alt text, 0–3 unique curated tag IDs, optional coarse place/feeling, caption only if D13 adopted, audience and rights acknowledgement. Alt text is accessibility content, not a visible caption; never infer sensitive traits or identify strangers. Tags describe experiences, not new verticals or unmoderated solicitation hashtags. Optional fields do not affect profile readiness. Define curated tag/feeling vocabulary before implementation.

**Caption remains Open:** no caption keeps visual simplicity; brief caption gives context but adds moderation. Recommend optional <=120 plain-text characters with no links. Either policy still needs alt text. No photo comments means no composer, count, replies, threaded reaction messages or comment-write endpoint, including when projected into Feed. Recommend no comments anywhere in initial community, but announcement policy is D16 rather than confirmed user choice.

Recommend Like / Love / Inspired, one active reaction per user+content, replace/remove reversible. Aggregate counts only, no default reactor identity directory; do not expose blocked/unauthorized relationships. Rate-limit manipulation. A reaction is not a rating/credential. Announcements reactions remain D16; recommend yes for organic notices, no reactions on sponsored job cards to distinguish Save from Like.

Published edits create candidate revisions; material image/caption/place edits need review. Last approved version can remain live unless unsafe; owner can immediately withdraw. Delete/audience change removes new feed/detail/media/reaction/count access, clears publication references and schedules purge. Evidence retained separately under case policy; already downloaded bytes cannot be recalled. Appeal/retry cannot bypass a sanction.

## 4. Announcements

Platform notices include product/safety/service/editorial updates. Employer notices include hiring seasons, events or time-sensitive workplace updates under moderation. Fictional example: “A lodge is hiring its Alaska summer team. Explore current positions, housing and meals.” Link the approved host page without implying all jobs offer identical benefits.

Recommended schema: title <=100, summary <=280, body <=3,000 plain/sanitized text, optional approved image, platform/own-org author, one canonical host/job CTA, optional category/region labels, publish/expiry instants and nullable campaign reference. Recommend no arbitrary paid outbound links in pilot. **Sponsored · Host name** appears before paid creative and on detail. Editorial platform material is labeled Announcement/Editorial, never disguised as seeker content.

Review all employer notices, paid or unpaid. No automatic announcement per listing/renewal. Business verification is eligibility, not blanket approval. Benefit claims must match linked live terms; qualify host-wide claims where offerings vary. Material creative/target changes require review. Closed single-job targets stop delivery; hiring campaigns linking a host require at least one eligible live position. Non-hiring platform notices do not require jobs.

Unpaid employer eligibility is D18: recommend limited editorial inclusion with a cooldown, rather than paid plans automatically flooding organic notices. Define fair eligibility, moderation and appeals before submission is enabled. Seekers free forever does not require free guaranteed employer reach.

## 5. Proposed caps and deduplication

Frequency limits are confirmed in principle; **every numerical value here is a proposed pilot default**.

| Control | Proposed default | Enforcement |
| --- | --- | --- |
| Feed paid density | <=1 sponsored item in each rolling 10 eligible rendered cards; never first/adjacent | Paid announcements and jobs share density budget; unavailable inventory leaves organic space |
| Announcements paid density | <=1 in each rolling 5 eligible cards; never adjacent | Paid-only scarcity shows limited results, never bypasses density |
| User+campaign | <=2 viewable impressions/rolling 24h and <=1/session | Shared across Feed/Announcements; deliberate direct detail access remains possible and labeled |
| User+host | <=3 sponsored impressions/rolling 24h and <=1/session | Separate campaigns/creatives cannot bypass host cap |
| Employer editorial cooldown | <=1 published employer announcement/7 days | D18 open; paid plan cannot buy organic cooldown bypass |
| Target/creative dedup | Same canonical job/content once per Feed snapshot/session | Changed campaign ID cannot reset target/host restriction |
| Viewer controls | Hide item / Hide host promotions / Block / Report | Apply to organic and paid eligibility, not just current screen |

Recommend viewable measurement as >=50% card visible for >=1 second; this is an original measurement proposal, not an industry billing claim. Session ends after 30 minutes inactivity; account daily ledger survives sign-out/sign-in. Authenticated audience avoids anonymous ad tracking; public audience changes require new privacy/cap policy first.

Selection atomically reserves user/session/host/campaign capacity with a short TTL (recommend 2 minutes). Concurrent tabs cannot reserve the last allowance twice. Reserved/served cards conservatively consume cap/density; unique view acknowledgement finalizes measurement, unused reservations expire. Hidden/unrendered cards are not billable impressions. Cursor/page retry reuses opaque assignment IDs and the same projection snapshot. Failed cap/review/eligibility service serves organic only. Insufficient inventory causes underdelivery handling, never cap exceptions.

Cross-tab direct revisits are permitted. Dedupe prevents repeated Feed recommendation and excess paid delivery, not access to a known eligible notice. One object means shared reaction/status; counts do not expose private readers. Cap logs exclude resume/contact/exact location/private preferences/protected traits.

## 6. Moderation, abuse and privacy

Recommend premoderation of all pilot photos/employer notices (D15). Later trusted-post fast path needs explicit policy and measured evidence. Automated scan/duplicate/abuse checks prioritize, while ambiguous rights/privacy/safety decisions go to humans. Publish actual staffed hours and review expectations; inherited triage targets do not imply 24/7 coverage.

Approved policy needs examples for harassment/hate/threats, sexual exploitation/nudity, doxxing/contact solicitation, scams/spam, deceptive benefit claims, stolen/nonconsensual images, dangerous worksite/vessel disclosures and illegal solicitations. Difficult workplace criticism is not automatically prohibited. Rights/consent acknowledgement and identifiable-person/location report routes are required; minors and sensitive evidence need policy appropriate to the chosen audience/jurisdiction. Upload is **not** consent to advertising reuse; campaigns need separate rights/consent for seeker photos.

Report photo/notice/campaign/host/user -> private receipt -> triage -> investigation -> action/dismiss -> safe notice -> appeal -> decision. Urgent privacy/fraud/safety cases can restrict delivery/media immediately; preserved evidence is case-private. Actions: return/edit, reject, content removal, posting/reaction restriction, promotion pause, account/org sanction. Paid status never shields content. Reporter sees high-level outcome; subject gets policy category and appeal, not reporter/detection details. Trust can stop ads independently of Finance.

Blocking a seeker hides that relationship's posts/interactions and prevents new reactions to blocker's content; apply both relationship directions to eligibility. Host block hides organic/paid promotions and stops unsolicited contact under messaging policy; past application records and necessary system notices remain accessible. New campaigns cannot evade same-host blocks. Recommend no social DMs/follows in V1. Counts for a viewer exclude ineligible interactions without exposing blocker identity.

Privacy defaults: signed-in seeker audience, separate handle, no EXIF/exact geolocation, indexing or resume/contact links, no automatic employer tagging. User can remove place/feeling, withdraw/delete, export own content/reactions and appeal. Every feed/detail/media/reaction/count read checks audience, blocks, moderation and current publication. Existing no-store/private buckets apply; no direct public storage URLs. Restore replays deletions/sanctions. Retention: immediate withdrawal; proposed active-copy purge within 30 days subject to holds; restricted case evidence follows proposed 12 months after resolution. Raw campaign identifiers proposed 30 days, cap ledger TTL by window; aggregate nonidentifying counts may persist. Financial records follow separately approved policy.

## 7. Campaign lifecycle and monetization

Recommend host-funded fixed-duration reserved inventory (D17) with explicit quote/availability, rather than auction/CPC/CPM for pilot. Prices, placements, term length, billing model and refunds remain Open. Historical featured-job $19/featured-host $49 ideas are unapproved and do not price these campaigns. No seeker charge, paid application or seeker boost. Payment buys eligible reach, never verification, fit, guaranteed applicants or hires.

Separate state machines:

- Creative: `draft -> submitted -> needs_changes|approved|rejected`, with independent `restricted`; edits create a new revision.
- Delivery: `unreserved -> reserved -> scheduled -> active -> paused|completed|canceled`, with reservation expiry; scheduled is not proof of payment/review.
- Payment: `not_required|quoted|pending|confirmed|failed|refund_pending|refunded|disputed`, provider-confirmed and reconciled.

Activation needs current approved creative, active eligible host, valid live target, reserved inventory, confirmed payment or authorized no-charge grant, date window and clear moderation. Recheck at each delivery; failed gate stops serving. No selling unavailable inventory or automatic substitute job.

Workflow: choose own job/host -> draft creative -> choose schedule/broad contextual category/region -> preview Sponsored card/caps -> inventory hold/quote -> review -> approval -> explicit checkout/charge acceptance -> provider confirmation -> schedule -> capped delivery -> aggregate report -> complete. Approval never charges. Stable billing operation/provider keys avoid duplicate charges; network calls outside DB locks. Expired review/inventory/quote requires re-quote and consent before charging. Late payment confirmation cannot activate an expired hold; reconcile and resolve with host.

Host can pause/cancel future delivery; job closure/restriction stops its campaign, org suspension stops all. Refund/make-good is a launch gate: quote must explain duration/reservation vs measurable-delivery promise, cancellation window, underdelivery, moderation cancellation and disputes. No silent extensions, creative substitutions or extra spend. Revised quote/terms require acceptance. Financial adjustments never resurrect restricted content.

Report eligible serves, deduplicated viewable impressions, clicks, canonical opens, separately labeled internal submissions under an approved attribution window, and external exits. Attribution window is D20, not silently assumed. Clicks/exits are not hires. Aggregates only, no reader/reactor/saver identities. Broad contextual category/region targeting only; no private resume, exact location, sensitive affiliation or protected-trait targeting. Paid status cannot alter matching, verification, terms or application permissions.

## 8. Logical model and architecture

Community/Campaigns extend the modular monolith and reuse User, MediaAsset, HostOrganization, JobListing, Report, ModerationAction, Appeal, AuditEvent and outbox. No second identity/listing service or copied job data. Current visibility/payment/caps remain authoritative, not eventually consistent projection permissions.

| Entity | Fields / invariants |
| --- | --- |
| CommunityIdentity | Unique user, handle/avatar, status, audience policy; explicit social allowlist |
| CommunityContent | Stable ID, `photo|announcement`, user/platform/org author, approved revision, lifecycle/moderation; author/type constraint |
| PhotoPostRevision | One clean image, alt text, <=3 unique tag IDs, optional coarse place/feeling/caption, audience/rights policy; owner-bound |
| AnnouncementRevision | Own org/platform author, copy/image, canonical target, dates, nullable campaign; approved revision immutable |
| Reaction | Unique user+content, fixed enum, timestamps; no free text |
| ContentCuration | Content+placement, editor/reason/start/end; no duplicate content or sanction immunity |
| BlockRelationship / PromotionPreference | Viewer+subject unique, scope/time; eligibility everywhere |
| Campaign | Org, creative/target, quote/policy version, dates, delivery/payment states, approved spend and inventory grant |
| InventoryReservation | Placement/window/quantity/TTL/campaign/quote; atomic capacity protection |
| DeliveryAssignment | Opaque ID, pseudonymous viewer/session, content/target/host, placement, reservation/expiry; retry stable |
| CampaignImpression / CampaignClick | Assignment/dedup key, timestamp/viewability, minimized aggregates; no resume/PII |
| CapLedger | User/session/host/campaign windows, reserved/served/viewable counts, TTL; atomic and idempotent |
| CampaignAdjustment | Provider operation, refund/make-good amount/grant/reason, actor/reviewer; append-only history |

Index eligible feed type/moderation/publish-time/ID, reaction unique pair, case target/status, inventory window, cap subject/window, assignment retry/expiry. Cursor binds query/snapshot; newly restricted content filtered at response. Scan approval is separate from moderation/audience. Purge orphan derivatives only after references/holds rechecked. Account export excludes other users' reaction identities, reporter evidence and host private notes.

## 9. Definition of done and useful measures

EE-029–032 and A10–16 in [journeys](13-journeys-and-acceptance.md) test comments prohibition, tag cap, attribution identity, honest sponsorship, cross-surface cap races, privacy/takedown and no seeker charges. Measure queue age, reports per 1,000 views, repeated advertiser spam, eligible contributors and useful canonical clicks plus seeker satisfaction. These are proposed measures, not observed results. Unauthorized media delivery and cap bypass are release blockers; raw reactions are not a substitute for trust.
