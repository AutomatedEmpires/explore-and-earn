# Explore&Earn Host Onboarding Form Specification

Last updated: 2026-07-12
Artifact type: product and operations specification; no production schema change is authorized by this document

## Purpose

Convert an opted-in business into a host-owned profile and first original opportunity without importing content from another marketplace. The form must make Housing, Meals, and Pay explicit, preserve uncertainty instead of converting it into claims, collect media-rights attestations, and create an auditable review packet.

## Entry conditions

The form may be sent only after:

- an authorized business representative opts in or creates an account;
- the operator records the consent source and timestamp;
- the recipient is not on the suppression list; and
- the invitation states that no public profile or partnership exists until submission and approval.

A prospect CSV record must never be used to pre-populate a public profile. Safe prefill is limited to private convenience fields such as company name, public website, and inviter, and the host must confirm or edit each value.

## Form architecture

| Step | Purpose | Save behavior |
| --- | --- | --- |
| 0. Invitation and authority | Confirm who is completing the form and their authority | Private draft; no public data |
| 1. Business identity | Create the host's canonical business record | Autosave; verify required fields before continuing |
| 2. Public host profile | Collect host-written profile content and owned media | Draft preview; never publish automatically |
| 3. Opportunity basics | Define one role/opportunity, place, dates, and capacity | Draft opportunity |
| 4. Housing | Answer “Where will I sleep?” with evidence and uncertainty | Required triad state |
| 5. Meals | Answer “What will I eat?” with evidence and uncertainty | Required triad state |
| 6. Pay | Answer “What will I earn?” with structured terms and variability | Required triad state |
| 7. Application and screening | Define applicant questions and actual screening scope | No unsupported “vetted” label |
| 8. Safety, rights, and attestations | Confirm accuracy, media rights, and legal responsibility | Timestamped attestations |
| 9. Review and submit | Show exactly what may become public and what remains private | Explicit submit action; status `submitted_for_review` |

The form must support save-and-return, a plain-language progress indicator, and a text alternative for every visual control. A host can select “not provided” and still complete the triad; hiding a negative answer is not allowed.

## Step 0 — invitation and authority

Fields:

| Field | Type | Required | Notes |
| --- | --- | ---: | --- |
| `invite_token` | server-issued token | yes | Single-use or account-bound; never place contact data in the URL |
| `completer_name` | text | yes | Private operational contact |
| `completer_role` | text | yes | Owner, operator, HR, manager, authorized agent, other |
| `business_email` | email | yes | Verify through the normal account flow |
| `business_phone` | telephone | no | Private by default; separate public-display choice later |
| `authority_attestation` | checkbox | yes | “I am authorized to submit and maintain information for this business.” |
| `outreach_consent_source` | system metadata | yes | Self-sign-up, email reply, call, referral; operator cannot edit after capture |

Do not ask for government ID, SSN, bank information, payment card information, applicant records, or employee rosters in this form. Any future KYC or background-check flow is trust/safety gated and must be separately approved.

## Step 1 — business identity

Fields:

- legal business name (private unless host chooses to display it);
- public display name;
- business type and Explore&Earn category (`farm`, `maritime`, `remote`, `seasonal`, or `mix`);
- official website;
- public business email, phone, and contact page, each with an explicit display toggle;
- physical operating address; exact public display choices: full address, city/state only, approximate map point, or hidden until application stage;
- mailing address for billing, private and separately stored;
- state/country of operation;
- year established (optional, host-confirmed); and
- authorized primary account owner.

Validation:

- normalize URLs to HTTPS where supported and block `javascript:`, `data:`, URL shorteners, and job-board URLs as the canonical website;
- do not infer or generate an email from a domain;
- warn when display name and website domain materially differ; and
- require the host to confirm any prefilled value.

## Step 2 — public host profile

Fields:

- 120-character one-line description;
- 1,000-character “about the operation” written or approved by the host;
- operating settings / tags, selected from controlled values;
- logo or profile photo;
- up to six workplace/place photos;
- accessibility and transportation overview;
- response-time expectation; and
- public contact preference.

Content rules:

- No “paste a listing URL” importer and no instruction to reuse a third-party description.
- A host may use its own website as a reference, but the submitted text must be host-authored or explicitly approved for reuse by the rights holder.
- Photos require `rights_basis`: `owned_by_business`, `licensed_to_business`, or `submitted_by_authorized_creator`. Screenshots and images downloaded from search, social media, a job board, or a directory are rejected.
- Preserve original evidence images. Generate display derivatives without filters that could change material conditions. Strip sensitive EXIF location metadata unless exact location is intentionally public.
- Alt text is required and must describe what the image actually shows.

## Step 3 — opportunity basics

Fields:

| Field | Required | Rule |
| --- | ---: | --- |
| Opportunity title | yes | Plain role title; no clickbait or unsupported superlatives |
| Category | yes | One locked category; optional setting tags |
| Work location | yes | City/state plus host-controlled precision |
| Start and end | yes | Exact dates, date ranges, ongoing, or “dates being finalized” |
| Application window | yes | Open/close dates or rolling |
| Number of openings | no | Must be a current host estimate, never a scarcity device |
| Schedule | yes | Expected days/hours, variability, and on-call requirements |
| Core responsibilities | yes | Original host-authored bullets |
| Required qualifications | yes | Separate legally required qualifications from preferences |
| Transportation | yes | How to reach the site and whether a vehicle is required |
| Employment arrangement | yes | Employee, contractor, volunteer, work-exchange, internship, other; triggers review warnings |

The form must warn that labeling an arrangement does not determine its legal classification. Work-exchange, volunteer, unpaid internship, and contractor selections route to manual policy review before publication.

## Step 4 — Housing

The top-level provision is required: `provided`, `partial`, or `not_provided`.

When `provided` or `partial`, collect:

- housing type: private room, shared room, cabin, bunkhouse, apartment, RV site, tent site, off-site unit, stipend, other;
- whether housing is guaranteed, capacity-limited, waitlisted, or subject to availability;
- cost and deduction cadence, including deposit and refund terms;
- distance from work and transportation provided;
- roommates / occupancy range and gender configuration where lawfully appropriate;
- utilities, internet, laundry, kitchen, bathroom, linens, pets, accessibility, and quiet-hours details;
- arrival/departure dates and what happens if employment ends;
- rules or agreement the seeker must review;
- at least one recent exterior/context image and one interior image, or an explicit `evidence_not_available` reason; and
- `last_confirmed_at` plus the confirming host user.

When `not_provided`, require a short honest explanation and optionally collect local housing resources. Do not allow “housing available” as a summary when availability is not guaranteed.

Evidence state:

- `host_attested`: host supplied structured details;
- `photo_supported`: current host-owned photo(s) supplied;
- `document_supported`: host supplied a relevant agreement or policy, private unless intentionally shared;
- `needs_confirmation`: variable or not recently confirmed.

These states describe evidence present; they do not certify habitability or legal compliance.

## Step 5 — Meals

Top-level provision is required: `provided`, `partial`, or `not_provided`.

Collect:

- meals per workday and days per week;
- meal schedule and whether it changes on days off;
- employee dining, family meal, groceries, kitchen access, stipend, discount, or other arrangement;
- cost or payroll deduction;
- dietary accommodations the host can actually support, with “ask before accepting” where uncertain;
- kitchen/storage access and distance to groceries;
- current image of employee dining/kitchen or `evidence_not_available` reason;
- variability by role, location, or season; and
- `last_confirmed_at` and confirmer.

Do not convert “food available,” guest dining, or a restaurant on property into a worker meal promise. Images are context, not proof of nutrition, availability, or accommodation.

## Step 6 — Pay

Fields:

- compensation type: hourly, salary, day rate, piece rate, stipend, commission, work-exchange, unpaid/volunteer, other;
- currency;
- exact rate or honest minimum/maximum range;
- cadence;
- expected paid hours or range per week;
- overtime eligibility and rate, if applicable;
- tips/service charges and whether any amount is estimated;
- bonuses and conditions;
- housing/meal deductions itemized separately;
- other required deductions or fees;
- reimbursement and travel support;
- pay variability explanation and effective season/date;
- collective-bargaining or prevailing-wage context, if applicable; and
- `last_confirmed_at` and confirming authorized user.

Display both gross stated compensation and host-entered deductions. A future “pay comparison” may calculate scenarios only from structured host inputs with visible assumptions; it must never infer missing wages or present an estimate as guaranteed take-home pay.

Validation:

- range minimum cannot exceed maximum;
- money is stored in integer minor units with currency;
- no negative rates;
- `unpaid`, `volunteer`, `work-exchange`, unusually low rates, required fees, or deductions exceeding pay trigger manual review;
- changing pay after applications exist creates a version record and a notification workflow; and
- the host must confirm that the published terms reflect the intended opportunity and applicable obligations.

## Step 7 — application and screening

Fields:

- application deadline and intended response window;
- host-written application questions, with protected-class and sensitive-data guardrails;
- resume required, optional, or not requested;
- interview stages;
- licenses/certifications and how they are checked;
- screening actually performed by the host: reference check, driving-record check, background check, drug test, work authorization, none, other;
- who performs each check, when consent is obtained, and who pays; and
- accommodation contact and alternative application route.

The public copy must describe only the checks the host confirms. Explore&Earn must not use “pre-vetted applicants,” “verified applicants,” or similar wording unless an approved product flow supports the exact claim. Host screening remains the host's responsibility.

## Step 8 — safety, rights, and attestations

Required attestations:

1. information is accurate to the submitter's current knowledge and material changes will be updated;
2. the business is authorized to offer the opportunity;
3. the submitter owns or controls rights to all submitted text and media;
4. Housing, Meals, Pay, deductions, and variability are not intentionally omitted or misleading;
5. the host will follow applicable employment, wage, housing, safety, nondiscrimination, accessibility, and privacy obligations;
6. the host understands that Founding Host status or a paid-plan badge is not independent verification of identity, property, employment practices, or claims;
7. the host accepts reporting, moderation, correction, suspension, and removal processes; and
8. the host authorizes publication only after final review and explicit submission.

Store attestation version, timestamp, user ID, and a cryptographic hash or immutable reference to the submitted version. Any policy-language change requires renewed acceptance at the appropriate point.

## Step 9 — review and submit

The review screen must:

- render the exact seeker-facing preview;
- show Housing, Meals, and Pay first and highlight `needs_confirmation` states;
- distinguish public fields from private account, billing, screening, or evidence documents;
- show media-rights basis and evidence age;
- list validation errors, policy review flags, and non-blocking completeness suggestions separately;
- require a final “Submit for review” action; and
- generate a host-visible submission receipt with version and timestamp.

Submission never means automatic publication. Statuses: `draft`, `submitted_for_review`, `changes_requested`, `approved`, `published`, `paused`, `expired`, `removed`. Only an opted-in host or authorized team member may edit the draft.

## Review rubric

An operator checks:

- business identity has a coherent public footprint;
- opportunity text is original and not copied from a job board;
- Housing / Meals / Pay are complete, internally consistent, and explicit about variability;
- uploaded media appears rights-cleared and relevant;
- dates, location, work arrangement, pay, deductions, and housing do not conflict;
- unsupported verification, safety, earnings, or scarcity claims are removed;
- manual-review triggers are resolved or escalated; and
- the host—not the prospect researcher—approved the publishable version.

Review is a completeness and policy check, not legal advice or certification. Trust/safety, badge, KYC, and enforcement-rule changes require founder approval.

## Data minimization and retention

- Separate public profile data, private operational contact data, billing data, moderation evidence, and applicant data by purpose and access scope.
- Collect no sensitive personal data unless a separately approved workflow requires it.
- Document retention periods per class; do not retain abandoned draft PII indefinitely.
- Support correction, export, account closure, and lawful preservation holds.
- Log access to private evidence documents.
- Never expose the original prospect-research notes on the public host profile.

## Completion and quality metrics

Track form start, step completion, field validation, save-and-return, changes requested, time to submission, time to approval, and abandonment reason. Never include free-text opportunity content, contact details, applicant data, or uploaded evidence in analytics events.

Success for the pilot:

- three authorized hosts start onboarding;
- at least two submit an original opportunity;
- every submitted opportunity answers all three triad states;
- no copied text or unauthorized photo enters the review queue;
- evidence/unknown labels survive from form to seeker preview; and
- operator feedback is captured through the feedback loop below.
