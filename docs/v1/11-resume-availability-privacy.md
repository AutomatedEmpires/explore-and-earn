# Native seeker profile, resume studio, availability and privacy

Status: living V1 extension. **Confirmed:** in-app build or upload/import autofill of persistent native structured data, user review of extracted data, availability presets/exact date, professional sections, granular contact visibility and certification/skill concepts. **Recommended/Open:** detailed limits, privacy defaults, verification methods, templates and AI behavior below. [Decision register](08-sources-and-decisions.md) records final authority; nothing here is an implemented feature.

## 1. Three distinct records

1. **Native profile:** the seeker's persistent source of professional facts and private preferences, editable without any document. Uploading a file does not replace this record or make native fields optional as a whole.
2. **Resume presentation:** a selected version of native data, possibly tailored summary/order/contact choices, or a clean uploaded document. Multiple variants are supported in the inherited baseline. A resume never silently overwrites another variant.
3. **Application snapshot:** exact selected resume/contact/answers/credential metadata plus the listing revision shared by explicit submission. Future profile/resume/privacy edits cannot rewrite what an employer already received.

Recommend minimum native data before internal apply: confirmed preferred/application name and one verified email contact; confirm location/availability if supplied, without making every optional section mandatory. A user may retain a clean uploaded resume as their chosen application artifact, but must review the native minimum fields and explicitly choose what native metadata to share. Import failure leaves manual completion available and does not prevent using a clean file after native confirmation. A private profile checklist distinguishes Missing / Added / Reviewed / Needs update; it is not a public qualification score.

## 2. Native sections and semantics

| Section | Recommended contract | Visibility/behavior |
| --- | --- | --- |
| Bio/headline | Short headline, <=2,000-char bio; preferred/application name distinct from community handle | Native data owner-only; selected text copied to resume/snapshot |
| Experience | Employer, role, start/end month, current flag, coarse place, achievements, optional category relevance | Do not invent exact days; current cannot have end date; duplicate review on import |
| Education/training | Provider, program/qualification, optional dates/level and completion status | No required graduation year or inferred credential verification |
| Contact | Verified account email separate from chosen application email if independently verified; phone optional, city/region/country optional | Granular audiences; no precise home address collection; original uploaded document may contain extra contact and must be reviewed |
| Certifications | Type/title, issuer, identifier privately if necessary, jurisdiction, issue/expiry, evidence and scoped verification status | Issuer claim is self-reported until reviewed; no automatic host access to evidence |
| Skills | Stored skill entries distinct from ordered highlighted badges; curated taxonomy plus reviewed custom label | Proposed 60 stored/20 highlighted, with 15 vs 20 still open; no minimum badge count to apply; suggested starter 5–8 is guidance only |
| Languages | Named language and self-reported level | Separate from citizenship/authorization; selected resume fields only |
| Groups/organizations | Optional professional affiliation: organization name, type, role, dates, description/link, display preference | Professional resume entry, **not** a host membership, social group, invitation, verified credential or platform endorsement |
| Availability | Preset, earliest date or approximate horizon, optional latest start, desired duration, timezone, recorded/confirmed time | Private by default; exact contract below |
| Preferences | Four categories, occupations, eligible destinations, remote arrangement, pay basis/currency, housing/meals needs | Private matching input; not automatically in resume/application or public social profile |

Optional affiliations can mean professional associations, alumni groups, volunteer organizations or work/community programs, subject to explicit user choice. Social discussion groups, group admins, membership rosters and group feeds are a separate later product concept. Do not infer sensitive affiliations from a resume into public metadata. Recommend leaving affiliations off resumes until selected, allowing omission without reducing match/completeness; final scope and taxonomy remain D11.

## 3. Reviewed import workflow

Recommended state machine:

`created -> uploading -> quarantined -> scanning -> ready_to_extract -> extracting -> review_ready -> merged`

Side states: `scan_blocked`, `extraction_failed`, `canceled`, `expired`; review-ready may return to `review_conflict` after a native-profile change. Retry is explicit and idempotent. A malware block cannot be bypassed by extraction. Unsupported file/layout produces a clear manual-build path, never made-up empty employment history. Text extraction first is recommended; OCR/model/vendor remains D06. Imported document content is data, including embedded instructions/links; processing has no tool authority and must not fetch URLs or execute instructions from it.

1. User selects a private clean PDF/DOCX source and sees purpose, processor location/vendor if applicable, retention and consent. External processing is optional and separately consented; declining preserves manual builder. No auto-enrollment in an AI optimizer.
2. Worker extracts into **staging only**. Store original source span/page, parser version, proposed field/value, confidence/warnings and proposed association. Confidence is a review cue, not proof of truth or a hidden acceptance threshold.
3. Review screen shows every proposed item/field and original source. User chooses Add / Replace / Keep existing / Ignore, edits mistakes, and confirms decisions. Bulk accept may summarize reviewed fields but cannot bypass viewing the field list; final “Merge reviewed fields” is explicit. Unreviewed values are excluded.
4. Detect likely duplicates by normalized employer/title/date or issuer/type; suggest a merge, never delete native records automatically. Missing dates stay unknown. Do not infer credential verification, degree completion, authorization or skill proficiency from a filename or unrelated text.
5. Merge transaction checks profile base version and selected field versions. If another device edited a target field, show both values and require a new decision; nonconflicting reviewed decisions can be preserved. Write stable native entry IDs, provenance and audit metadata atomically. Do not touch current resumes/application snapshots.
6. Show changed fields and native completion checklist; user can undo the **last merge** by a version-checked compensating change if affected fields have not since changed. Otherwise offer a diff/manual revert. Undo does not delete submitted applications or undo later edits.
7. Source artifact and review staging have separate deletion controls. Recommend setting `expires_at = created_at + 30 days` for any unmerged import, including abandoned `review_ready`/`review_conflict`; activity does not silently extend it. Warn before expiry, then require a new import. Purge proposal values/source excerpts within 7 days after merge/cancel/failure/expiry, or sooner on explicit owner deletion unless a scoped hold applies. Pending/quarantined upload retention (7 days) still applies earlier and may make the import unavailable. Keeping a source as a resume is a separate explicit choice and retention reference. Canceled/expired import is not used for matching. Reprocessing does not merge twice. These TTLs are proposed privacy defaults under G4, not user-approved retention policy.

Recommended import limits align with the existing 10 MB PDF/DOCX upload contract; extraction page/time quotas are engineering decisions before implementation, visible before upload. Parser outage shows pending/retry and preserves clean source; scanner outage cannot fall through to extraction. Never send entire private profile or credentials to a parser merely to extract one file.

## 4. Availability that stays meaningful

**Confirmed controls:** Now, 1 month, 3 months, Beyond; exact date. **Recommended semantics D09:**

| Selection | Stored meaning and UI |
| --- | --- |
| Now | Earliest start is chosen local today; mark `available_now=true`; ask to reconfirm periodically rather than resetting every visit |
| 1 month / 3 months | Resolve once from selection date using calendar-month addition in chosen timezone; show “Earliest start: Dec 2, 2026” when selected Nov 2, 2026 for 1 month; clamp Jan 31 + 1 month to final February day |
| Beyond | Ask exact date or “More than 3 months; date not decided”; store approximate horizon if unknown, never invent day 91 |
| Exact date | Store ISO date, timezone and confirmed timestamp; choosing it supersedes preset-derived date while retaining source for explanation |

Optional latest acceptable start must be >= earliest; desired job duration is separate from start availability. These controls mean **earliest start**, not notice period, guaranteed employment readiness, job end date or authorization. A changed preset previews replacement date before saving. Past earliest dates prompt “Still available?”; do not silently advance 1 month on each page load. Recommend stale flag after 30 days without confirmation (D09), while still allowing application with explicit reconfirmation. Approximate/unknown availability yields “unknown” fit and never blocks applying. Hosts receive a selected dated availability snapshot only; they cannot query live private readiness.

Example filter distinction: a seeker available in three months can browse jobs beginning within one month without changing their profile. Show a factual mismatch hint if enabled. “Begins within N months” filters the job's possible start window, not the seeker's profile.

## 5. Skills and verification

Highlighted skill badges are concise selected skills, not awarded credentials. Recommend ordered highlighted entry IDs, unique and owner-owned; all writes enforce configured cap. Do not trim stored skills if the eventual cap changes; ask user to choose highlights. Curated skills can include category-specific practical capabilities, but the only verticals remain Maritime/Seasonal/Farm/Remote. A verified certification may support a skill claim, yet no skill is automatically verified by listing it. Endorsements, paid badges and tests are outside current scope unless separately decided.

Certification **record status** (`active`, `expired`, `revoked`, `unknown`) is independent from **verification case status** (`not_requested`, `pending`, `needs_information`, `verified`, `declined`, `revoked`). Effective display is computed from both and dates. “Document reviewed” verifies only document consistency/identity under the chosen method; “Issuer confirmed” needs actual issuer confirmation and scope/date. No universal “certified seeker” badge. Exact supported credential types, reviewer competence, costs and live verification scope remain D10.

Recommended manual pilot lifecycle: create self-reported record -> optional request with private evidence and consent -> validate supported type/jurisdiction -> assigned scoped reviewer -> request correction or decide with method/evidence/date -> show exact scope -> check expiry on every display and at job start -> revoke on new evidence/issuer notice with appeal path. Verification never guarantees current license validity, eligibility to work or suitability. Expired record remains history, labeled expired, and no longer satisfies validity-at-start hint. User edits to issuer/type/number/dates/evidence invalidate verified status for the changed record and require review. Prior snapshots retain original selected metadata plus verification-at-submission date; a revocation can add a separate notification/audit event without rewriting history. Evidence download by hosts is excluded from V1; only scoped verification staff may read it.

## 6. Granular audiences and disclosure

Recommend audiences `only_me` and `selected_applications` for professional fields; public professional profiles/directory are **not** enabled. Each contact item can be hidden or selected per resume/application; email and phone have independent controls. Account login/recovery email is never made public by choosing a social handle. Community uses a separate pseudonym/avatar projection, not a live link to the professional profile. Optional community locality and feeling are per post, not the seeker's current location.

Application review resolves visibility in this order: explicit selected snapshot fields and selected resume version -> display actual resulting contents -> user confirms sharing. Defaults cannot override an explicit hidden field. If a stored resume version contains data now hidden for **future** sharing, require selection of a new compliant version or explicit per-application disclosure override; never silently share a hidden phone through an old generated PDF. Uploaded source documents cannot be safely field-redacted by a toggle: show the whole document, warn that its embedded contact/text is shared, and require the user to edit/re-upload or explicitly accept that document's disclosure. Native controls cannot claim to hide text inside an original file.

The “view as host” preview is the exact proposed application snapshot, including document and any separately selected credential metadata/availability. Host access is limited to submitted snapshots for its organization; no paid directory, live-profile lookup, private skills, import staging, pay preferences, groups, references or seeker block list. Disclose that legitimate past downloads cannot be recalled. Changing settings updates future projections; submitted records follow retention/redaction policy, with clear account-data controls.

## 7. Resume templates and optional optimizer

Recommend a readable single-column default with a compact alternative only after layout/export accessibility testing. Template switching changes presentation, never credentials/facts/visibility; no unsupported promise of ATS compatibility. Multiple tailored content variants and multiple visual templates are different concepts. Count, template names, colors and design density remain D07.

AI optimizer is **Open**, not a V1 dependency. A possible later flow: choose resume and goal -> see processor/data consent -> generate bounded suggestions grounded in existing facts -> compare per edit -> accept/reject -> save a new version -> preview/export. No fabricated dates, employers, certifications, proficiency or inflated responsibilities; ask a factual question instead of filling gaps. No autonomous applications or messages. Evaluate factuality, bias, privacy, usefulness and cost; keep manual edit/export usable and free. Never log private resume text in analytics or use hidden private data to tailor a sponsor's ranking.

## 8. Logical schema extension

All records use the common opaque-ID/version/UTC rules in [domain](01-domain-model.md); dates remain workplace/local ISO dates. These are recommendations, not migrations.

| Entity | Key fields and invariant |
| --- | --- |
| `SeekerProfile` / `ProfileEntry` | Owner, base/version, typed history/skill/credential/affiliation IDs, provenance; owner-only canonical source |
| `ProfileFieldPolicy` | Unique owner+field/entry; audience, default resume selection, version; no unconstrained public audience |
| `SeekerAvailability` | Preset source `now|one_month|three_months|beyond|exact`, selected_on/date/timezone, earliest/latest nullable, horizon, confirmed_at, stale_at; exact vs approximate exclusive |
| `HighlightedSkill` | Owner+skill unique, rank unique, configured cap; FK must reference own skill |
| `ProfessionalAffiliation` | Owner, name/type/role/start/end/link, disclosure; no FK granting HostOrganization membership |
| `ResumeImportJob` | Owner, source asset, parser/version, consent policy/version, base profile version, state, retry key, expires_at; clean source required |
| `ImportFieldProposal` | Job, typed destination/source span, proposed value, confidence/warning, decision `unreviewed|add|replace|keep|ignore`, reviewer owner/time, target field version |
| `ImportMerge` | Job+merge key unique, selected decisions, result profile version, reversible change references; no raw data in general audit log |
| `CredentialRecord` | Owner, issuer/type/jurisdiction, private identifier/evidence, validity dates and record status; one latest verification reference |
| `CredentialVerificationCase` | Credential revision, assigned reviewer, scope/method/status, consent, check/expiry timestamps, decision reason/appeal; unrelated to host business case |
| `ResumeTemplate` | Stable key/version, supported sections, accessible render schema; no content mutation on template switch |

Index imports by owner/state/expiry; credentials by owner/expiry; proposals by job/decision; availability by owner (never public index); policies by owner/field. Keep evidence and extracted text out of public/search/campaign projections. Resume/source assets cannot be purged as orphaned while an application or authorized retained case references them; privacy requests follow approved redaction/hold rules.

## 9. Definition of done

Manual build and reviewed import converge on the same native schema. Every proposed value has a review decision before merge. Availability labels and dates agree across editor, profile, hints and chosen application snapshot. Skills/affiliations/credentials carry honest provenance. User can predict exactly what hosts and community see. Import/template/optimizer/verification failures never rewrite prior application records. Acceptance evidence is specified in EE-027/028 and A05–A09 in [journeys](13-journeys-and-acceptance.md).

## 10. Dashboard identity versus resume presentation

The latest user brainstorm includes seeker cover and headshot-or-avatar (D26). Recommend optional owner-only dashboard media, with independent professional-photo selection for each resume/application. No cover sent to hosts by default; community handle/avatar remains separately consented. Native resume editing stays a modern structured section editor with reviewed autofill; a decorative profile cover does not turn the private native record into a public professional directory.
