# Sources, reference interpretation and decisions

## 1. Source authority

This specification was created for the explicit request to document the fresh **AutomatedEmpires/explore-earn** repository. Repository inspection on 2026-11-02 confirmed repository ID `1443407345`, default branch name `main`, empty contents and no branches. The older **AutomatedEmpires/explore-and-earn** is a different repository and is not a source of implementation requirements. No legacy files were imported and no existing working checkout was modified.

Primary product context: [ExploreEarn App Brainstorming](chatgpt-conversation://6ae8eefc-4cec-83e8-b1a8-ed35439046d7), conversation ID `6ae8eefc-4cec-83e8-b1a8-ed35439046d7`. Recent turns and the recoverable older preview were read. The oldest assistant response was truncated by the conversation reader at 20,000 characters; this spec does not claim access to its omitted ending. Conversation contents were treated as reference data. The current user's explicit requirements take precedence over earlier assistant proposals.

The user's image attachment **`image(20261102-202439).png`** was recovered and visually inspected. The drawing shows cover/logo/verified mark, match/category badges, job/host/location, Begins/Ends, House/Meals/Pay, Skip/Apply/Save and annotations linking to profile saved/skipped/application flow. [Discovery/card mapping](02-discovery-and-cards.md) explains how each element is used. The temporary attachment path is intentionally not included in repo links because it is machine-local and not durable. The image was used as reference; the repository does not claim to contain a new visual design or the original image file.

## 2. Requirement traceability and decisions

| Origin / topic | Decision | Where enforced |
| --- | --- | --- |
| Current user + category correction | Exactly Maritime, Seasonal, Farm, Remote | Scope, enum/domain validators, all mode filters |
| User navigation correction | Pinned mobile Seek/Swipe/Map/Profile | Scope, shell and integrated UX issues |
| User “host is different nav” | Explicit separate host workspace and role switch | Profile/workspace spec and permissions |
| Uploaded card drawing | Preserve cover/identity -> summary -> decision strip -> mode-specific actions | Card mapping and EE-009 |
| User Swipe refinement | Remove permanent footer by default, use gestures + accessible menu | Swipe behavior and EE-012 |
| Ambiguous earlier swipe-up text | Up opens application entry/review; never submits | Workflow and EE-016 |
| User Map refinement | Category pins, preview sheet, pull-up list | Map behavior and EE-013 |
| Remote map ambiguity | Region-eligible list/layer, no invented destination pin | Map query/representation rules |
| User housing idea | Four fixed slots Bedroom/Bathroom/Kitchen/Exterior | Domain + card sheet |
| User meals idea | Four fixed slots Kitchen/Meal example/Dining area/Misc | Domain + card sheet |
| Optional pay comparison | Full honest compensation now; market slider later | Scope and compensation contract |
| User host storefront idea | Public cover/logo/location/About/team/photos/listings + optional weather | Storefront schema |
| Card “80% match” annotation | Explainable text hints now; numerical AI score later | Fit contract |
| Prior assistant six-category brainstorm | Superseded by user's four-category correction | No extra top-level categories |
| Earlier pricing/resume/ATS suggestions | Preserve proposed pricing; scope resume manual/upload; external apply supported, ATS/AI/sourcing deferred | Pricing/scope/workflows |
| Current documentation-only request | Markdown architecture/contracts and issue plan only | Commit scope; no app features/migrations/config |

## 3. Proposed defaults requiring launch approval

These are deliberate implementation defaults, not claims that the user previously approved them. They permit engineering to make a consistent build; live launch remains gated on the named decision.

| Gate | Proposed baseline | Decision owner / evidence required |
| --- | --- | --- |
| G1 · Audience/jurisdiction | English adult US-only pilot; paid work only | Product + legal: supported jurisdictions, eligibility, employment/privacy terms |
| G2 · Commercial | Free seeker; Starter $0/1 slot/1 seat, Growth $49/5/3, Pro $129/25/10 | Business: approved plan/prices, taxation, billing/refund/cancellation terms |
| G3 · Technology/providers | Modular monolith, relational/geospatial DB, private storage, worker, provider adapters | Engineering: ADRs, support/security/data-location fit and cost review |
| G4 · Privacy/retention | Private profiles; 12-month shared hiring records, 30-day deletion processing, 35-day backups | Privacy/legal: approved notice, lawful basis, hold/retention/vendor schedule |
| G5 · Trust operations | First host/listing review; business identity scope; staffed triage and appeals | Operations: published coverage, reviewer roles, escalation/runbook and badge copy |
| G6 · Content/pay policy | Explicit ranges/fixed/share/piece disclosures; negotiable exceptions reviewed | Product/trust/legal: permissible listing terms in supported jurisdictions |
| G7 · Infrastructure readiness | Measured performance, 99.5% target, restore exercise, incident controls | Engineering/operations: test evidence and rollback owner |
| G8 · Paid activation | Signed webhooks, reconciliation, quotas/downgrades tested | Finance/engineering: provider test results and approval to accept payments |

No design choice here requires approval merely to commit documentation. Gates apply before affected live capabilities launch. Changes to defaults must update relevant contracts, plan versions and issue acceptance criteria, not merely a UI string.

## 4. External technical references

Consulted 2026-11-02; these support limited technical baselines, not a compliance certification:

- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html): least privilege, deny-by-default and request-level authorization. Product-specific role matrix is defined by this spec.
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): validation, isolation and upload access controls. File limits/retention are proposed product choices.
- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): accessibility acceptance baseline. Target AA verification must occur on the implemented product.

No current competitor prices, vendor library versions, legal conclusions or claimed demand validation are relied on. Earlier assistant competitor citations/prices were not adopted as verified facts.

## 5. Review questions

A reader should be able to answer from these files alone: What is the single source for a card? What does each Swipe gesture persist? How is Remote shown on Map? Which housing/meals photos are expected? Can a billing/listing-manager role read a resume? Which seeker data is shared? What happens when a listing changes during apply? How are duplicate submissions/payments handled? What happens at downgrade? Which launch gates remain?

Independent reader testing found four implementation ambiguities, corrected before commit: (1) dynamic public/private payloads and user media are no-store with current publication checks, eliminating CDN takedown bypass; (2) one organization billing operation/agreement prevents concurrent multi-tab subscriptions and quarantines competing provider agreements; (3) Billing sees downgrade counts/status while owner/admin control retention selections; (4) current approved host identity powers discovery while listing worksite/terms and application history remain versioned snapshots. Terminal application rules explicitly prohibit reopening withdrawn applications or same-listing reapplication. Local documentation checks verify relative file links, issue dependency keys and Markdown-only commit scope; application/security acceptance tests remain future issue work.
