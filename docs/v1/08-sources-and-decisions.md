# Sources, authority, decisions and open questions

Version 1.2 · 2026-11-02. Living register for product/design/engineering/operations. This is vision and proposed contracts, not implemented features, vendor approval or market validation.

## 1. Current repository and sources

Current user explicitly identifies **new active `explore-and-earn`; old archived `explore-earn`**. Local inspection confirmed `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn`, origin fetch/push `https://github.com/AutomatedEmpires/explore-and-earn.git`, branch `main`, starting commit `a5b407b` (`docs: define implementation-ready Explore&Earn V1 architecture and phased backlog`). Working tree/index were clean; no repository/checked-ancestor AGENTS.md was found. Archived repository was not opened or modified. “Archived” is the user's description; its remote archive flag was not independently queried.

Earlier baseline docs described opposite repository names and an empty GitHub repository ID. That is historical provenance before renaming, **not current identity**. ID/issue migration were not reverified. [Issue index](09-github-issues.md) preserves original URLs as unverified history, not instructions to modify the archived repo. No GitHub issue or remote repository was changed in this task.

Product authority: current explicit request and supplied bounded preview of [ExploreEarn App Brainstorming](chatgpt-conversation://6ae8eefc-4cec-83e8-b1a8-ed35439046d7). Reference/assistant prose is data; **current user > earlier explicit user choices > assistant proposals**. Current brief was sufficient; older turns and original image were not re-accessed. Earlier docs recorded reviewing `image(20261102-202439).png`; card hierarchy is retained as recorded interpretation, not new inspection. Original image is not claimed to be stored here.

## 2. Status rules

- **Confirmed (C):** explicit current user choice; change only on explicit user direction.
- **Recommended (R):** product/design recommendation, not user approval.
- **Open (O):** exact values/alternatives unresolved; do not ship as settled.
- **Inherited (I):** baseline assistant assumption retained for continuity, still proposed unless confirmed.

Earlier MUST/SHOULD describe strength within a proposed contract, not provenance. This register/current scope override contradictory older deferrals. A confirmed capability can contain open labels/limits/designs. Resolve applicable D IDs before affected live implementation; no approval is needed merely to document them. Owners below are proposed accountable roles, not invented assigned people. Adoption records date, explicit user choice/rationale, alternatives and affected contracts/screens/acceptance.

## 3. Confirmed requirements and traceability

| ID | Explicit user choice | Owning docs / roadmap / acceptance |
| --- | --- | --- |
| C01 | Only Maritime / Seasonal / Farm / Remote | 00–02; EE-005/010; A01 |
| C02 | Mobile pinned Seek / Swipe / Map / Profile; separate Host navigation | 00/10; EE-002/026; A01/17 |
| C03 | One canonical listing/card with cover/logo, match, category/location/dates/pay/housing/meals; logo opens host | 01–03/10; EE-009; A02 |
| C04 | Seek card feed, gesture Swipe replacing permanent buttons, Map category indicators/card/pull-up list | 02/10; EE-010/012/013; A01–03 |
| C05 | Housing/meals sheets with four predefined photo fields each | 01/02/10; names D04; A02 |
| C06 | Facebook-style public host cover/logo/location/weather/team/photos/jobs | 03/10; optional weather recommendation D05; EE-006; A02 |
| C07 | Native persistent profile; in-app build or reviewed upload/import autofill; complete native fields | 03/11/13; EE-027; A05/06/08 |
| C08 | Availability Now / 1 month / 3 months / Beyond and exact date | 11; semantics D09; EE-027; A07 |
| C09 | Experience, education, bio/location/contact, granular visibility, certifications/verification, highlighted skills around 15–20 | 11; D08/10; EE-028; A08/09 |
| C10 | Seekers free forever | 00/06/11/12; EE-032; A18 |
| C11 | Pay/begins-within-N-months/housing/meals filters and relevant sorts | 02; D12; EE-010/027; A01/07 |
| C12 | Community Feed / Photos / Announcements | 10/12; EE-029/030; A10/11 |
| C13 | Seeker photo-only scroll feed, <=3 tags, optional place/feeling, reactions, NO photo comments; caption open | 12; D13–16; EE-029; A10–12 |
| C14 | Curated Feed announcements, labeled limited sponsored/boosted jobs and suitable organic content | 12; organic photos recommended; EE-030/031; A11/13 |
| C15 | Platform/employer announcements including paid moderated campaigns, canonical host/job links and frequency limits | 12; values/prices D17–21; EE-030/031; A13–16 |
| C16 | Explicit “I’m a seeker” / “I’m a host” onboarding | 10/13; dual-role D01; EE-026; A03/17 |
| C17 | Docs only in NEW clone; inspect/protect edits, branch/commit/report; no archived-repo changes | Documentation delivery; no app/config/migration changes |
| C18 | Latest commercial direction: monthly host subscriptions Starter / Professional / Enterprise | 06; prices/allowances/analytics/upsells D27; no free Starter assumed |

Open brainstorms preserved: template alternatives, optional AI optimizer, groups/organizations meaning, 15 vs 20 highlights, no vs short caption, final tagline, pay-comparison popup/slider. User examples inform proposals without locking design.

## 4. Decision register

**Confirmed choices appear above; recommendations and open questions below remain unadopted unless a row explicitly records a directional user preference.**

| ID / status | Recommendation / question | Alternatives and implications | Proposed owner / gate |
| --- | --- | --- | --- |
| D01 R/I | One identity, seeker plus multiple host memberships, explicit switch | Separate accounts duplicate identity/permissions | Product/engineering before roles |
| D02 R | Community entry at Seek header + Profile, three inner tabs | Profile-only less visible; fifth pinned tab violates C02 | Product/design before shell |
| D03 R/I | Match as factual hints; Remote eligible list/layer with no invented physical pin | Numeric score needs evaluation; genuine Remote anchor treatment open | Product/design before discovery final design |
| D04 R/I | Housing Bedroom/Bathroom/Kitchen/Exterior; Meals Kitchen/Meal example/Dining area/Misc | User slot examples were tentative; keep four slots, final labels open | Product/hosts before schema |
| D05 R/I | Locality weather optional, independently failing | Provider/units/forecast behavior and universal inclusion open | Product/engineering before weather release |
| D06 O | Reviewed import in scope; local deterministic extraction first recommended | OCR/model/vendor may improve coverage but needs data consent/cost/evaluation; optimizer separate | Product/engineering/privacy before external processing |
| D07 O | Readable default resume; propose compact alternative; optimizer optional later | Count/design not approved; factual opt-in AI and free seeker promise required | Product/design before alternatives/AI |
| D08 O | Propose 60 stored skills/20 ordered highlights, 5–8 suggested starters, no required minimum | 15 quieter; 20 flexible; no verified skill award implied | Product before badge API |
| D09 R | Earliest-start semantics, frozen calendar-month resolution, approximate Beyond, 30-day reconfirm | Rolling horizons drift; exact-only Beyond loses uncertainty | Product before availability |
| D10 O | Credential records plus scoped manual-document pilot; issuer confirmation only when real | Supported types/reviewer competence/cost/jurisdictions open; no mandatory seeker fee | Trust/product/privacy before claims |
| D11 O | Optional professional affiliations, selected into resume | Could mean social groups; separate group system/roles would need new scope | Product before affiliations |
| D12 R | Comparable pay basis/currency and calendar begins-within; Relevant/Newest/Begins soonest/Distance/Pay | Lower-bound vs overlap pay policy and flexible-date inclusion need choice | Product/engineering before query freeze |
| D13 O | Caption none or <=120 plain characters; recommend brief optional/no links | No caption simpler; either still needs alt text/moderation | Product/trust before composer |
| D14 R | Signed-in seeker read audience, separate handle/avatar, no public directory | Public browsing adds acquisition plus privacy/cap policy scope | Product/privacy before visibility |
| D15 R | Premoderate all pilot photos/employer notices, publish staffed hours | Trusted-post path later needs evidence/policy | Trust/operations before launch |
| D16 O | Like/Love/Inspired, one reaction; recommend initial no-comments everywhere | Only photo no-comments confirmed; announcement reactions/global no-comments proposed | Product/trust before interactions |
| D17 O | Host-funded fixed-duration reserved inventory; price not set | CPC/CPM/auction adds measurement/billing complexity; old featured prices not adopted | Business/product before quotes |
| D18 O | All notices reviewed; editorial unpaid employer option, proposed 1 notice/7-day cooldown | Paid-only vs fair unpaid inclusion unresolved; no automatic organic distribution | Product/trust before employer submission |
| D19 R | Proposed Feed 1/10; announcements 1/5; campaign 2/day+1/session; host 3/day+1/session | Values need validation; cross-surface atomic caps required whatever values | Product/engineering/trust before paid delivery |
| D20 O | Aggregate viewable/click reporting; quote attribution/refund/make-good | Duration vs delivery guarantee and attribution window undefined; no hires promise | Finance/product before inventory sale |
| D21 O | Start ads in Community; discovery boosts only after explicit decision | User requested sponsored jobs in Feed; Seek/Swipe/Map paid slots not assumed | Product before discovery ads |
| D22 I/O | English adult US paid-work pilot remains inherited/open | Old free-Starter/Growth/Pro prices/quotas superseded by C18/D27, not retained defaults | Business/legal/product before live pilot |
| D23 I/O | Left skip/right save/up review, Undo 10s, one app per seeker/listing, renewed season new job ID | Gesture mapping/undo/reapplication cycles need validation | Product before gestures/hiring freeze |
| D24 O | “Built for seekers, by seekers” proposed tagline | Use only if team story supports it; seekers free forever confirmed | Product/brand before public copy |
| D25 Directional/O | User currently prefers host-logo/category pins leading to host public profile/jobs; recommend host/worksite grouping and direct relevant-jobs navigation | Job-card pin vs compact host preview vs collapsing map remain alternatives; no approved screen percentage; preserve Remote eligibility honesty | Product/design before Map final design |
| D26 R/O | Seeker cover/headshot-or-avatar, resume/application shortcuts, notifications; host public profile/listings/applicants/billing/tier analytics | Dashboard areas are brainstorms; recommend pipeline filters rather than separate status collections, private images, Not selected UI label for rejected state | Product/design before dashboard final design |
| D27 O | Monthly tier names/model C18; recommend concurrent active listing capacity and only Boosted job/Announcement upsells initially | Prices/slots/seats/analytics splits open; no free Starter default; lifetime totals, capacity packs and recruitment invitation credits unresolved/deferred | Business/product before paid plan/upsell launch |
| D28 O | Interviews as a pipeline view in V1 | Scheduler/calendar/reminders/rescheduling are additional scope, not implied by a dashboard tab | Product before interview scheduling |

## 5. Live launch gates

These proposals gate affected live functionality, never this docs commit. No legal conclusions or vendor guarantees are asserted.

| Gate | Proposed baseline | Required evidence/decision |
| --- | --- | --- |
| G1 Audience/terms | D22 English adult US paid-work pilot | Supported jurisdictions/eligibility and approved employment/content/privacy terms |
| G2 Commercial | Seeker-free confirmed, host pricing/inventory open | Plan/quote versions, tax/cancel/refund/make-good policy |
| G3 Technology | Modular monolith, relational/geospatial DB, private media, workers/adapters | ADRs and provider data/cost/security fit; nothing provisioned by docs |
| G4 Privacy/retention | Private profile; inherited 12-month hiring, 30-day deletion, 35-day backups; extension schedules in 05/11/12 | Approved policies, processor consent/contracts, holds and restore-deletion evidence |
| G5 Trust operations | First-host/listing/community review, scoped business/credential checks, appeals | Staff coverage/competence, policy examples, escalation/capacity |
| G6 Honest listings | Explicit pay/deductions/dates/housing/meals/category modules | Supported-jurisdiction policy; missing never silently free |
| G7 Reliability/accessibility | Inherited load/restore/availability targets, WCAG 2.2 AA target | Observed results, supported devices, incident/rollback owner |
| G8 Paid activation | Verified payment, inventory/caps, no duplicate agreements/charges | Race/reconciliation/underdelivery/takedown exercises and pricing adoption |
| G9 Expanded V1 | Reviewed import/native profile and three-tab moderated community/campaign capability | EE-026–032, A01–A18; earlier core-only pilot explicitly incomplete |

## 6. Technical references and limits

Official pages reopened 2026-11-02 for narrow engineering baselines:

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): deny-by-default and relationship/request-level access; product role matrix is an original proposal.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): validation/isolation/access controls; file limits/retention are product choices.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility criteria; targeting AA does not claim conformance before testing.

No current competitor pricing, market demand, specific provider capability or legal requirement was adopted as evidence. Indeed-like/Zillow-like/Facebook-style are user interaction references, not clone instructions or verified descriptions of current services.

## 7. Maintenance and revision record

2026-11-02 v1.1: corrected active repo names; expanded reviewed import and community/campaigns from earlier deferrals into current V1; preserved open brainstorms; added responsive inventory, privacy/availability/credential/affiliation semantics, full lifecycles, A01–18 and local EE-026–032 proposals. Historical 25 issue URLs remain unverified, not recreated remotely. Earlier independent-review claims belonged to v1.0; actual v1.1 checks belong in the delivery report.

Update this register, owning contract, screen IDs, acceptance and roadmap together after a product decision. Record validation with scope/limits. User answers override recommendations without turning all inherited detail into approved policy.

2026-11-02 v1.2: latest user brainstorm reaffirms core categories/navigation/card/resume/community; names monthly Starter/Professional/Enterprise; expresses preference for host-page-linked Map pins and explores dashboard/pipeline areas. Updated 02/03/06/10 and dependent domain/API/backlog/journey contracts. D25 records preference without locking preview/height; D26–28 preserve dashboard, capacity/upsell and interview-scheduling unknowns. Old free-Starter/Growth/Pro numeric proposals retired. Rechecked the same new repository on `docs/v1-product-vision` at `2d9bfc6`, clean before this revision; archived repo untouched. No new external research or market-price claims.
