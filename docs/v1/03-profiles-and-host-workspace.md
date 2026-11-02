# Profiles, resumes and host workspace

## 1. Public host storefront

The storefront is a destination page comparable in richness to a public organization page: cover, logo, location, optional weather, active listings, About Us, team and featured photos. It is distinct from the private host dashboard. Discovery card logo/name navigates here; each active job returns to its canonical detail page.

`HostOrganization` private fields: legal name, authorized representative, verification evidence references, billing contact/provider IDs, ownership history and operational status. Public storefront content is versioned separately and never serialized from the full organization row.

| Storefront field | Contract and visibility |
| --- | --- |
| `display_name`, `slug` | Required, 2–100 / 3–80 chars; slug unique and moderated |
| `tagline` | Optional <=160 chars |
| `cover_asset_id`, `logo_asset_id` | Approved host-owned images; neutral placeholders permitted |
| `primary_location_id`, `public_locations[]` | Own locations only; city/region/country visible, exact address opt-in for business sites |
| `category_focus[]` | Nonempty subset of the four exact categories; does not create extra categories |
| `about`, `mission?` | Sanitized rich text <=8,000 / <=1,000 chars |
| `team_members[]` | Max 12 `{display_name, role, bio<=500, photo_asset_id?, consent_record_id}`; no private user links/email by default |
| `featured_photos[]` | Max 12 `{asset_id, caption<=200, alt_text, location_id?}` |
| `life_on_site`, `amenities[]` | Narrative <=4,000 chars, max 20 named amenities with notes; host claims clearly attributed |
| `housing_overview`, `meals_overview` | Optional <=2,000 chars each; active listing's terms are authoritative |
| `faqs[]` | Max 12 question/answer pairs, <=200 / <=1,000 chars |
| `website_url`, `public_contact?` | Approved HTTPS website; intentionally public business email/phone optional; distinguish from private rep contact |
| `application_expectations` | <=1,000 chars; response expectations self-described, no fabricated metrics |
| `weather_enabled`, `weather_location_id` | Optional; location coarse business locality, never seeker location |
| `verification_summary` | System-managed scope/status/date; host cannot edit |
| `active_listings` | Derived query, never a manually maintained ID list |

Layout: hero identity -> active listings -> About -> Locations -> Life on site/Housing/Meals -> Team -> Featured photos -> FAQ. Responsive anchors may switch ordering, but listings remain easy to find. Team/photo sections hide when empty; never show template people or invented reviews. If no live jobs, show “No active listings” and a link back to discovery; host page can remain public while verified/active. Suspended organization becomes unavailable with a generic message.

Multi-location hosts maintain one organization and storefront, with location-specific cards/sections. A location record holds name, type `business_site|port|headquarters|approximate_area`, country/region/city, timezone, public precision `exact_business|locality`, public coordinate, and private street/coordinate. Only approved public coordinates enter discovery. At listing publication, worksite display/coordinates/timezone are copied into the immutable revision; subsequent location edits prompt updates to affected listing drafts but do not move existing published jobs. Current approved host name/logo/slug update discovery identity independently; application snapshots preserve historical identity. Housing does not imply the public worksite is the accommodation address.

Weather displays locality, provider attribution, units and observation/forecast timestamp. It is supplemental, not safety or voyage guidance. Cache by coarse location for 30 minutes; hide on provider failure or data older than 2 hours. No weather data for a location-independent Remote role unless the viewer intentionally opens an actual host location. Missing weather never blocks a storefront or application.

Host publish workflow: edit draft -> preview public-only projection -> validate assets/consent/URLs -> publish approved revision. First public storefront requires moderation approval and identity/contact checks, but may display “Unverified”; the separate business-verification badge requires completed evidence review. Material legal/name/ownership changes suspend verification and require re-review. Listing benefits are copied into listing drafts only through an explicit host action, never live-inherited after submission.

## 2. Private seeker profile

V1 seeker profiles are private by default and have no public directory or indexable URL. A seeker has a private “view as host” preview that shows the selected application snapshot. Future public professional pages/reverse sourcing require explicit opt-in and a separate access design. A host cannot browse all seeker profiles simply by paying.

| Section / field | Type / limit | Default visibility |
| --- | --- | --- |
| Identity | Legal/preferred name, display name, optional photo, pronouns optional (not used in matching) | Owner; selected name/photo only in application |
| Contact | Verified email; optional phone; coarse city/region/country | Owner; explicit chosen email/phone in application |
| Summary | Headline <=120, biography <=2,000 | Owner; resume-selected text only |
| Experience[] | Max 30 employer, title, start/end month, current boolean, location optional, achievements <=2,000 | Owner; selected resume entries |
| Education/training[] | Max 20 school/provider, program, level, start/end month optional | Owner; selected resume entries |
| Skills[] | Max 60 curated code/label, self-rated proficiency optional, experience notes | Owner; selected resume entries |
| Languages[] | Max 15 language code, proficiency self-reported | Owner; selected resume entries |
| Credentials[] | Max 30 type, issuer, jurisdiction, issue/expiry date, self-reported status, private evidence asset optional | Owner; explicitly selected metadata, evidence never automatic |
| Portfolio links[] | Max 10 safe HTTPS URLs + labels | Owner; selected resume links |
| References[] | Max 5 name/relationship/contact, permission confirmation | Owner only in V1; not automatically included or requested |
| Availability | ASAP/date window, desired duration, ongoing availability, timezone | Owner/private matching; optionally explicit application answer |
| Job preferences | Four category interests, occupations, work arrangements, chosen regions, relocation/travel preference | Owner/private matching only |
| Pay preference | Currency, basis, preferred minimum minor units | Owner/private matching only; not a negotiation floor sent to host |
| Work authorization | Self-reported authorized jurisdictions, sponsorship needed `yes|no|unknown` | Owner; explicit job-relevant selected declarations only |
| Lifestyle needs | Housing need, desired room type, pet/partner/transport notes optional | Owner only; seekers may ask host separately, never automatic hiring filters |
| Notification/privacy settings | Transactional/optional messaging controls, fit opt-in, blocked users | Owner only |

Do not collect date of birth, national ID/passport, immigration documents, medical history, banking information or precise home address in V1. Age is an adult-eligibility attestation, not a public birthday. Optional preferences are not mandatory profile completion tasks. Profile completeness is a checklist, not an employability score and not exposed to hosts.

Use stable IDs for history/skill/credential entries. Validate chronological month ranges, nonexpired date formats, and duplicate IDs. Current experience cannot also have an end date. Unverified credential text must not acquire a verified icon from an unrelated host badge. Uploading a credential neither proves validity nor authorizes platform sharing.

## 3. Resume structure and studio

The canonical profile is editable structured data. A resume is a **selected, versioned presentation** of that data, with its own headline/summary/order and optional overrides; no change to one resume mutates another resume or past application.

`Resume` identity: user_id, label <=80, kind `structured|uploaded`, current_version_id, archived_at. Proposed V1 limit: 10 current resumes, with previous versions retained according to privacy policy. `ResumeVersion`: resume_id, version_number, template_key (V1 simple accessible single-column template), selected profile-entry IDs plus copied content, section order, contact selection, render status, PDF asset ref, content hash, created_at. Uploaded resumes store clean PDF/DOCX source and a clean PDF viewing derivative where conversion is supported; if safe conversion fails, allow private clean original download and show no unverified preview. Structured resumes must generate a clean PDF before submission.

Workflow: create label -> select/edit sections -> preview as host -> save immutable version -> render PDF -> use selected version in application. Editing creates another version. Source profile changes show “Updates available”; the user chooses whether to refresh fields. An uploaded resume is a separate artifact; V1 does not parse it or silently merge it into the structured profile. Manual entry remains fully usable. Cover letter is an optional application text field <=5,000 chars, not a separate document system in V1.

Resume import with AI/OCR, AI writing, multiple design templates and credential validation are later. Basic structured entry, upload, PDF export and multiple tailored versions are V1. Do not infer or invent credentials, employers or dates from a file name or sparse profile. Blank PDF exports fail visibly instead of becoming attachable.

An internal application requires selected clean resume version, verified email, name/contact confirmation, required answers and explicit sharing confirmation. The review screen lists exactly which fields/documents will be shared. Hosts receive that snapshot only, never the live private profile, other resumes, preferences or private references. Credential evidence can be deliberately attached in a future expansion; V1 shares selected credential metadata only.

## 4. Profile hub and seeker pages

Profile hub: profile/resume readiness, Saved, Skipped, Applications, Messages, Resume studio, Edit profile, Privacy/settings and workspace switch. Saved lists have remove/apply links and closed-listing labels. Skipped lists allow restore-to-discovery or save. Applied listings remain in application history even if saved state changes.

Applications list distinguishes internal status from external activity. Internal detail shows submitted snapshot, status history, conversation and withdraw. External activity is “Opened employer application site” with timestamp; a seeker may add private “Applied externally” or outcome notes, labeled self-reported. Never make a host-visible internal application from external activity. Messages list groups internal applications and unread counts, with clear organization/job context.

Settings cover email, sessions, optional notifications, fit hints, blocked senders, export and deletion. An account with an organization owner role must transfer ownership or close the organization before final deletion. Export includes user-owned profile/resume data, applications and participant messages subject to required third-party redaction; no host internal notes or other candidates' data.

## 5. Host dashboard and pages

| Destination | Required contents / actions |
| --- | --- |
| Overview | Publication status, live/remaining slot count, applicants needing review, unread messages, verification/billing actions; no vanity-only dashboard |
| Listings | Draft/live/paused/closed/expired tabs, create wizard, duplicate-to-draft, preview, submit/publish, edit, pause, renew, close/archive |
| Applicants | List/pipeline by listing and status; search only owned received applicants; detail with immutable snapshot, notes, status, messages |
| Messages | Application-linked inbox; no unsolicited directory outreach in V1 |
| Storefront | Cover/logo, About, team, photos, FAQs, housing/meals overview; public preview and publication history |
| Locations | Own workplaces/ports/HQ, public precision controls and location-specific preview |
| Team | Invite/revoke members and roles; ownership transfer safeguards; seat usage |
| Analytics | Views, saves aggregated, internal submissions, external exits, response times; no identity of private savers/skippers |
| Billing | Current plan/limit, price/renewal date, invoices/provider portal, upgrade/cancel/downgrade; billing role only |
| Settings | Organization details, verification, contact/notifications and ownership/closure |

Listing wizard sections: Basics/category -> Worksite/remote eligibility -> Timing/schedule -> Pay -> Housing -> Meals -> Requirements/category module -> Application method/questions -> Media/preview -> Validation/publish. Save drafts at every step using version checks. Publish validation returns section/field errors. Nothing is lost because a plan limit or moderation gate blocks publication.

Applicant pipeline uses explicit transitions in [workflows](04-workflows-and-api.md). Internal notes belong to the hiring team and must be visually separated from applicant messages. Bulk actions show selection count, action confirmation and per-application failures; no bulk rejection by fit score. Permission changes immediately remove access even if a browser tab remains open.

Multiple memberships require an organization switcher displaying the active organization on every private page. URLs/request scope include organization ID, and server derives authorization from membership. Never reuse an applicant cache across organizations. Host mobile navigation is Overview / Listings / Applicants / More; it does not replace seeker's pinned navigation globally. Switching back restores the previous seeker tab.
