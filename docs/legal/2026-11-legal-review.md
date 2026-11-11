# Explore&Earn legal review, November 2026

- **Issue:** [#89](https://github.com/AutomatedEmpires/explore-and-earn/issues/89) (EE-LEGAL1)
- **Written:** 2026-11-10 by the `claude-code` research agent
- **Status:** agent analysis for the founder and for licensed counsel. **This is not legal advice.** No lawyer has reviewed it. It is a map of the risks, the product changes that reduce them, and the questions a lawyer must answer. Nothing here changes a founder decision or a launch gate.
- **Product state reviewed:** the specs and plans on `integrate/sp2-20261104` (product design of 2026-11-03, founder decisions FD-1 to FD-9, SP2 and SP8 designs) and the ten decisions the founder accepted on 2026-11-11 ([#45 comment](https://github.com/AutomatedEmpires/explore-and-earn/issues/45#issuecomment-6786615643)).

## How to read this

**Severity** describes the harm if the risk is left as it is at public launch.

| Severity | Meaning |
|---|---|
| Critical | Criminal exposure, a fixed statutory penalty, or serious harm to a user. Blocks launch. |
| High | Likely regulator or private claims, or real harm to seekers. Fix before launch. |
| Medium | A plausible claim or a reputational problem. Fix before launch if cheap, otherwise soon after. |
| Low | Good practice. Schedule it. |

**Counsel** says whether a licensed lawyer must confirm the point before launch: **Yes**, **Short check** (a one-hour question), or **No**.

**How sources were checked.** Section 13 lists every source and says how each was checked on 2026-11-10: read at the primary source, confirmed only through law-firm summaries, or stated from the agent's own knowledge without a fresh check. Treat the last two groups as leads for counsel, not as settled law. State law in this area changed several times in 2026, and some of it may have changed again.

## Facts this review relies on

These come from the specs. If one is wrong, the analysis that depends on it is wrong.

1. Explore&Earn is a marketplace. Hosts (employers) pay a subscription and post listings. Seekers use it free and apply. Explore&Earn is not the employer and takes no fee from seekers.
2. Seekers must be 18 or older (product design section 2). A listing's minimum age cannot be below 18.
3. Paid work only. A listing with pay of zero cannot be published (SP2 blocking check "vague pay").
4. Every listing must state pay, and whether housing and meals are provided and at what cost (FD-3). Pay, housing and meals are readable signed out.
5. Listings cover US jobs. Seekers may be anywhere, including the EU and UK.
6. Every uploaded image is hash-matched with Microsoft PhotoDNA. A match is blocked and kept, and an operator files the NCMEC report by hand (product section 19, SP8 section 8.7).
7. Channels are in-app, email and web push. SMS is capped at 0.
8. Launch is SP2–SP5 plus the SP8 gates. Community photos (SP7) and paid add-ons (SP6) come later. The fit score (SP5) is in the launch.
9. Operators may build a listing for a founding host with the host's consent. Nothing is scraped.

## 1. Risk register

| ID | Risk | Severity | Counsel | Section |
|---|---|---|---|---|
| L-01 | Pay transparency: a listing or one of its renderings omits pay, benefits or a closing date a state requires; the platform is directly liable in Illinois and California | High | Yes | 2.1 |
| L-02 | Discriminatory wording or structured fields in listings, screening questions and candidate filters | High | Yes | 2.2 |
| L-03 | The work-authorization field shows hosts a visa type and end date before any offer | High | Yes | 2.2 |
| L-04 | H-2B and H-2A hosts use a listing as recruitment that does not meet 20 CFR part 655, or the product claims it does | Medium | Yes | 2.3 |
| L-05 | Housing deductions that push pay below the minimum wage, or that the state does not allow | High | Yes | 2.4 |
| L-06 | Farm listings: Migrant and Seasonal Agricultural Worker Protection Act disclosure, and whether the platform is a "farm labor contractor" | Medium | Yes | 2.5 |
| L-07 | A minor uses the product despite the 18+ rule | Medium | Short check | 2.6 |
| L-08 | Explore&Earn is treated as an "employment agency" (Title VII, state licensing) | Medium | Yes | 2.7 |
| L-09 | Fit score: the launch gate cites a Colorado law that was repealed and replaced in 2026 | High | Yes | 2.8 |
| L-10 | Child sexual abuse material: no NCMEC registration, a late report, or evidence not preserved as 18 U.S.C. 2258A requires | Critical | Yes | 3 |
| L-11 | Nobody is named to cover the child-safety queue | Critical | Short check | 3, 10 |
| L-12 | Non-consensual intimate images: no 48-hour removal process (TAKE IT DOWN Act) | Medium at launch, High once Community ships | Yes | 3.4 |
| L-13 | State privacy laws: sensitive data (immigration status, precise location) handled without opt-in consent | High | Yes | 4 |
| L-14 | The candidate pool is a "sale" of personal data unless the seeker chooses to be in it | High | Yes | 4.3 |
| L-15 | Session replay and analytics trigger wiretap claims | Medium | Short check | 4.5 |
| L-16 | GDPR and UK GDPR for EU and UK seekers | High | Yes (already a gate) | 4.6 |
| L-17 | "As described", reply-time and freshness labels that mislead, or reviews that can be gamed or suppressed | High | Short check | 5 |
| L-18 | Testimonials from discounted founding hosts without disclosure | Medium | No | 5 |
| L-19 | Email: commercial mail without a working opt-out; cold outreach to hosts from harvested addresses | Medium | No | 6 |
| L-20 | SMS turned on before consent and registration exist | High if enabled | Yes, before enabling | 6.3 |
| L-21 | Fake hosts harvest applicant data or lure seekers into fraud or forced labor | Critical | Yes | 7 |
| L-22 | Operator-built listings make the platform the author of a false or non-compliant ad | High | Short check | 8.1 |
| L-23 | Founding 100 rule change and freshness pauses applied without notice; subscription cancellation | Medium | Short check | 8.2, 8.3 |
| L-24 | Take-home pay estimate misleads | High if built wrong | Short check | 9 |
| L-25 | No DMCA agent, no breach-response plan | Medium | No | 11 |

## 2. Job-posting law

### 2.1 Pay transparency (L-01)

**The rule.** Fourteen states and the District of Columbia now require a pay range in a job posting, Delaware follows in 2027, and several also require benefits. The duty sits on the employer, but two states put a duty on the platform as well:

- **Illinois.** An employer that uses a third party to post must give it the pay scale and benefits, and "the third party is liable for failure to include the pay scale and benefits in the job posting, unless the third party can show that the employer did not provide the necessary information" (820 ILCS 112/10(b-25)). The Illinois Department of Labor says a third party "may be held" responsible when it publishes a posting for Illinois work that lacks the information.
- **California.** An employer that engages a third party to post "shall provide the pay scale to the third party. The third party shall include the pay scale in the job posting" (Lab. Code § 432.3(c)).
- **New York** applies its rule to an "employer, employment agency, employee, or agent thereof" (Labor Law § 194-b). See 2.7 on whether the platform is an agency.
- **Maine** covers a posting "whether made directly or through a third party".

| Jurisdiction | Source | Employer size | The posting must show | In force |
|---|---|---|---|---|
| Colorado | C.R.S. § 8-5-201(2) | any, with one Colorado employee | pay or range; general description of benefits and other compensation; the date the application window is expected to close | 2021; closing date since 2024 |
| California | Lab. Code § 432.3 | 15+ | pay scale: a good-faith estimate of what the employer expects to pay on hire (narrowed by SB 642 from 2026-01-01) | 2023 |
| Washington | RCW 49.58.110 | 15+ | wage scale or salary range, or the single fixed wage if only one is offered; general description of benefits and other compensation | 2023; amended 2025 |
| New York | Labor Law § 194-b | 4+ | pay or range; job description if one exists | 2023 |
| Illinois | 820 ILCS 112/10 | 15+ | pay scale and benefits, or a link to them | 2025-01-01 |
| Hawaii | HRS § 378-2.8 | 50+ | hourly rate or salary range | 2024-01-01 |
| District of Columbia | D.C. Code § 32-1453.01 | 1+ | minimum and maximum pay; healthcare benefits before the first interview | 2024-06-30 |
| Maryland | Lab. & Empl. § 3-304.2 | any | wage range; general description of benefits and other compensation | 2024-10-01 |
| Minnesota | Minn. Stat. § 181.173 | 30+ | starting salary range; general description of benefits and other compensation | 2025-01-01 |
| New Jersey | N.J.S.A. 34:6B-23 | 10+ | wage or range; general description of benefits and other compensation | 2025-06-01 |
| Vermont | 21 V.S.A. § 495o | 5+ | compensation or range | 2025-07-01 |
| Massachusetts | G.L. c. 149, § 105F | 25+ | pay range | 2025-10-29 |
| Virginia | Va. Code § 40.1-28.7:12 (SB 215 / HB 636) | any | wage, salary or range in every public and internal posting | 2026-07-01 |
| Maine | 132nd Legislature, HP 18 | 10+ | prospective range of pay; a commission-only job says so | 2026-07-29 |
| Connecticut | Public Act 26-12 (HB 5003) | any | wage or range and a general description of benefits | 2026-10-01 |
| Delaware | HS 2 for HB 105 | more than 25 | pay or range; general description of benefits; tipped and commission jobs say so | 2027-09-26 |

Nevada and Rhode Island require the range on request or at interview, not in the posting. Local rules also exist, including New York City, Jersey City, and Cleveland, Ohio (from 2025-10-27). Washington claims are the most active: a private right of action carries statutory damages of $100 to $5,000 per applicant, with a five-business-day cure period after written notice that the 2025 amendment provides through 2027-07-27.

**What the product already does.** Pay is mandatory on every listing in every state, a range wider than 2.5 times its minimum is blocked, and crew-share pay needs an estimated range. That is stricter than any single state on pay. The gaps are benefits, the closing date, and making sure every rendering carries the pay.

**Required product changes**

1. **Add "Benefits and other compensation" to builder section 4 (Pay).** A short text field plus a checklist (health insurance, paid time off, retirement, bonuses, tips, none). Required for every listing, with "None" as a valid answer, so the same form satisfies Colorado, Washington, Illinois, Maryland, Minnesota, New Jersey, Connecticut and, later, Delaware. Show it on the detail page beside pay.
2. **Closing date.** When the listing's state is Colorado, require `applying.deadline` or an explicit "Hiring continues until filled" choice. Counsel confirms whether the second choice satisfies C.R.S. § 8-5-201(2)(c).
3. **Pay in every rendering of a listing.** The card, the detail page, the share-card image, job-alert emails, push text that names a listing, the sitemap's `JobPosting` structured data, and any feed sent to another site. Add a test that fails when a rendering of a published listing has no pay. This is the Illinois and California third-party duty.
4. **Publish-time attestation.** The host confirms: "The pay shown is the range we expect, in good faith, to pay for this job." Store it with the listing revision. Listing revisions already keep what the host supplied, which is the platform's Illinois defense.
5. **AI and operator drafts never fill in pay, benefits, housing or meal facts.** They leave the field empty for the host. This extends FD-3.
6. **A fast correction path.** A host who gets a Washington notice has five business days. Editing pay on an active listing must not send it back through a slow review.

**Counsel: Yes.** Confirm the platform's own exposure in Illinois, California and New York; the Colorado closing-date wording; and whether the 2.5× range cap is a sensible "good faith" guard.

### 2.2 Discriminatory wording, fields and filters (L-02, L-03)

**The rule.** Federal law bars an employer or employment agency from publishing a job notice that states a preference or limit based on race, color, religion, sex or national origin (42 U.S.C. § 2000e-3(b)), age 40 and over (29 U.S.C. § 623(e); 29 CFR 1625.4, which names "recent college graduate" and "young" as problem terms), or disability. 8 U.S.C. § 1324b bars citizenship-status and national-origin discrimination in hiring and recruitment for a fee, which is why "US citizens only" is unlawful unless a law requires it. State law adds grounds such as marital status, sexual orientation, gender identity and criminal history.

Section 230 of the Communications Decency Act (47 U.S.C. § 230) protects a platform from liability for what its users write. It does not protect what the platform itself builds. In *Fair Housing Council v. Roommates.com*, 521 F.3d 1157 (9th Cir. 2008) (en banc), a site lost that protection for the questions and filters it required users to complete. So the free-text description is the host's speech, but every structured field, screening-question template and candidate filter is the platform's.

**What the product already does.** A blocking check on six phrases ("US citizens only", "native English speaker" and similar). The fit score never uses protected traits, photo, name, age or gender.

**Required product changes**

1. **Widen the wording check and split it in two.** Keep the short **block** list for phrases with no lawful use. Add a **flag-for-review** list, checked on the description, qualifications and screening questions: age ("young", "recent graduate", "under 30", "digital native", any maximum age), sex ("male only", "female only", "waitress", "girls", "guys"), national origin and language ("native speaker", a named nationality), disability ("able-bodied", "no disabilities"), religion, marital and family status ("single", "no children", "couples only"), criminal history ("no felons", "clean record"), and appearance. A flagged listing shows the host why, and offers neutral wording. Some uses are lawful (a religious camp, a job that houses only couples, a 21+ bartending rule), so a flagged listing goes to the review queue; it is not rejected automatically.
2. **Screening questions** run the same check. A host cannot ask about age beyond "Are you at least 18 (or 21)?", marital status, pregnancy, disability, religion, national origin, or arrest record.
3. **No candidate filter on a protected trait.** Hosts may not filter or sort the candidate pool or applicants by age, date of birth, sex, photo, name, national origin or visa type. Document this as a rule in SP5.
4. **Work authorization (L-03).** The profile stores "I already have a visa (type and end date)" and shows it to hosts on an application. The Department of Justice's Immigrant and Employee Rights Section treats pre-offer questions about a specific status as a discrimination risk. Change what hosts see to two answers only: "Authorized to work in the US: yes / no" and "Will need visa sponsorship: yes / no". Keep the visa type and end date private to the seeker, or drop them.
5. **Seeker photo.** "Show my photo to hosts" stays off by default, and the photo never appears on candidate-pool cards before the seeker applies or accepts an invite.
6. **Host Terms** make the host responsible for lawful listings and hiring, and let Explore&Earn remove a listing.

**Counsel: Yes.** Confirm the flag list, the couples-housing wording, and the two-question work-authorization design.

### 2.3 H-2B, H-2A and J-1 (L-04)

**The rule.** An employer seeking H-2B workers must first recruit US workers. The required steps are a job order with the State Workforce Agency, posting on SeasonalJobs.dol.gov by the Department of Labor, contact with former US employees, contact with a bargaining representative or a worksite posting, and any extra recruitment the certifying officer orders (20 CFR 655.40 to 655.46). **A listing on Explore&Earn is not one of the required steps and does not replace any of them.**

When an H-2B employer does advertise the same job elsewhere, the advertisement must offer terms no less favorable than those offered to the H-2B workers (20 CFR 655.18(a)(1), 655.41(a)). An advertisement under the rule must contain fourteen items (20 CFR 655.41(b)), among them: the employer's name and contact details; the area of work; duties, requirements, hours and start and end dates; a statement that the job is temporary and full time, with the number of openings; overtime pay if any; the wage offer; any board, lodging or other facilities; every deduction not required by law, including for board and lodging; that inbound and return transportation and subsistence are provided; that tools are free; a summary of the three-fourths guarantee; and a direction to apply through the nearest State Workforce Agency office, with the job order number.

The employer may not collect any fee from a worker for recruitment or certification (20 CFR 655.20(o)), must bar its recruiters from doing so (655.20(p)), and must keep accepting US applicants until 21 days before the date of need (655.20(t)). An H-2A employer must provide housing at no cost to H-2A workers and to workers in corresponding employment who cannot reasonably return home each day (20 CFR 655.122(d)(1)). J-1 Summer Work Travel students come only through a State Department sponsor, which vets the host employer (22 CFR 62.32).

**Why it matters here.** The strategy leans on H-2B employers needing domestic hires from January to March. Those employers are the ones bound by these rules. The risk to Explore&Earn is mainly deception (claiming a listing "counts" as H-2B recruitment) and hosting a listing whose terms are worse than the employer's certified job order.

**Required product changes**

1. **Copy rule.** No page, email or sales message says or implies that a listing satisfies H-2B or H-2A recruitment. Add one line to the host help article: "A listing here does not replace the recruitment steps the Department of Labor requires."
2. **H-2A housing check.** When `visaSponsorship` is `h2a` and housing cost is not free, block publishing with the reason and a link to 20 CFR 655.122(d).
3. **H-2B consistency prompt.** When `visaSponsorship` is `h2b`, show a checklist of the 655.41(b) items the listing form does not already capture (transportation, tools, three-fourths guarantee, State Workforce Agency contact and job order number) as optional fields, and an attestation that the listing's pay and terms match the job order.
4. **No fees from seekers, ever.** Already the product's position. State it in the Seeker Terms and in the Host Terms, including recruitment and visa fees and any deposit requested before an offer.
5. **P1: applicant log export.** A per-listing export of applicants, dates and the host's recorded outcome and reason. H-2B employers must keep a recruitment report (20 CFR 655.48). This is a selling point as well as a safeguard.
6. `/international` keeps linking to government pages and gives no visa advice, as specified.

**Counsel: Yes.** This is the "wage law and visa wording" gate (`legal.wage_visa`). The Department of Labor has changed H-2 rules often; counsel confirms the current text before the help article is published.

### 2.4 Housing as compensation, deductions and lodging disclosure (L-05)

**The rule.** Under the Fair Labor Standards Act an employer may count the reasonable cost of board and lodging toward the minimum wage (29 U.S.C. § 203(m)). "Reasonable cost" is no more than the employer's actual cost and includes no profit (29 CFR 531.3). The lodging must be regularly provided, accepted voluntarily, lawful to occupy, primarily for the employee's benefit, and backed by records (29 CFR 531.30 to 531.32; Wage and Hour Division Field Assistance Bulletin 2015-1). Housing the employee must live in for the employer's convenience generally cannot be charged against the minimum wage.

States are stricter. California, New York, Colorado, Washington and others cap the weekly lodging credit, require a written agreement, or bar the deduction outright for some housing; the dollar caps change yearly. Separately, some seasonal employers are exempt from the federal minimum wage and overtime: seasonal amusement and recreational establishments (29 U.S.C. § 213(a)(3)), fishing (§ 213(a)(5)) and much agriculture (§ 213(a)(6), (b)(12)). State minimum wages often still apply.

**What the product already does.** Housing and meal cost are mandatory, with amount, period and whether it is deducted from pay. A minimum-wage warning compares pay with the state minimum, as a warning only. Four housing photos are required.

**Required product changes**

1. **Make the minimum-wage warning count deductions.** Today it compares gross pay with the state minimum. Compute `(weekly pay − weekly deducted housing − weekly deducted meals) ÷ weekly hours`. If that is below the state minimum, show the host a specific warning ("After housing and meals, this works out to $X an hour, below the $Y minimum in [state]. Deductions for housing and meals are limited by law.") and send the listing to the review queue. Keep it a warning, because a lawful credit or an exemption may apply.
2. **Add three housing facts to builder section 5**, all shown on the detail page: "Do workers have to live in this housing? yes / no"; "Deposit: none / amount, and when it is returned"; "If the job ends early, housing ends: same day / after N days". These are the terms seasonal workers are most often surprised by, and the first one decides whether a deduction is lawful at all.
3. **Structured deductions.** Replace the free-text `pay.deductions` with a list of `{ what, amount, period }` plus a note. The take-home estimate (section 9) depends on it.
4. **Employee or contractor.** When a host picks "contractor", show: "Most seasonal staff are employees under federal and state law. Calling an employee a contractor does not change that." Do not block.
5. **Host Terms**: the host states that housing is lawful to occupy and that any deduction complies with federal and state law.

**Counsel: Yes.** Confirm the state lodging-credit rules for the 3–5 launch destinations, and the wording of the warning.

### 2.5 Farm work (L-06)

**The rule.** The Migrant and Seasonal Agricultural Worker Protection Act requires a farm labor contractor, agricultural employer or association that recruits a migrant agricultural worker to disclose in writing, at recruitment: the place of work, wage rates, crops and work, the period of employment, transportation, housing and other benefits and their cost, any strike, and any commission arrangement (29 U.S.C. § 1821(a)). Housing must meet safety and health standards (29 U.S.C. § 1823). A "farm labor contractor" is a person other than an agricultural employer who, for money, recruits, solicits, hires, employs, furnishes or transports such workers (29 U.S.C. § 1802(6), (7)), and must register with the Department of Labor.

**Analysis.** The listing form already collects most of the § 1821(a) items, so a complete farm listing helps the host meet its own duty. The open question is whether a subscription-funded platform that invites candidates and ranks them is itself "recruiting for money". A passive job board is not usually treated that way, but invites and a fit score move the product closer to it.

**Required product changes.** For category `farm`: make the harvest window or period of employment required; add "Transportation to the job: provided / not provided"; and keep the listing as a printable PDF so the host can hand it over as the written disclosure. No registration step is proposed until counsel answers the question.

**Counsel: Yes.** One question: is Explore&Earn a farm labor contractor under 29 U.S.C. § 1802(7)?

### 2.6 Minors (L-07)

**The rule.** Federal child-labor rules limit hours and occupations for workers under 16 and bar hazardous work under 18 (29 U.S.C. § 212; 29 CFR part 570), and states add permits and stricter limits. The Children's Online Privacy Protection Rule (16 CFR part 312) applies to services directed to children under 13 or with actual knowledge of one. Several state privacy laws add duties for known users aged 13 to 17.

**Analysis.** The 18+ rule removes nearly all of this, as the founder intended. What remains: seasonal work is exactly where 16- and 17-year-olds look (camps, ski areas, parks), so some will try to sign up; and once the product knows a user is a minor, the privacy and child-safety duties apply to that account.

**Required product changes**

1. **Ask for date of birth at seeker sign-up**, as a neutral question, and refuse under-18s without hinting at the cut-off. Store only "18 or older: yes" and the year, not the full date. A bare "I am 18+" checkbox is weaker evidence.
2. **Under-age reports.** A report reason "This person is under 18" on profiles and threads, routed to the `child_safety` queue. A confirmed minor's account is closed and its data deleted, except anything under a legal hold.
3. **Listings** keep the minimum age at 18 or above (already enforced) and the wording check flags "teens welcome", "high school students" and similar.
4. **Photos of children.** Camp and family-ranch hosts will upload photos with children in them. Community Guidelines and the upload hint say: no identifiable children in listing or host-page photos. Moderation flags them for review.
5. **If the founder later admits 16- and 17-year-olds**, that is a new legal review: work permits by state, hazardous-occupation rules, parental consent, and adult–minor messaging controls.

**Counsel: Short check** on the age screen and the retention of the birth year.

### 2.7 Is the platform an "employment agency"? (L-08)

Title VII defines an employment agency as "any person regularly undertaking with or without compensation to procure employees for an employer" (42 U.S.C. § 2000e(c)), and bars such an agency from discriminatory referrals and notices (§ 2000e-2(b), § 2000e-3(b)). Many states license employment agencies or "job listing services" (for example California Civil Code § 1812.500 and following, New York General Business Law article 11); those laws mostly reach businesses that charge the job seeker.

A plain job board is usually outside these definitions. Three features move Explore&Earn toward them: the fit score ranks applicants, hosts buy invite credits to approach candidates, and operators build listings for hosts. Charging seekers nothing keeps the product out of most state licensing laws, which is one more reason never to add a seeker fee.

**Required product changes.** Keep seekers free in every plan and add-on. Describe the product in the Terms as a venue: Explore&Earn does not interview, select, refer or place anyone, and hosts make every hiring decision. Make the fit score sort and explain only, never reject (already the design).

**Counsel: Yes.** Confirm agency status under Title VII and under the licensing laws of the launch states.

### 2.8 Fit score (L-09)

This is already a launch gate (`legal.fit_score`), so only the changes since the spec was written are noted.

- **Colorado.** The SP8 gate and its counsel question cite the Colorado AI Act, SB 24-205. Law-firm summaries report that it was first delayed to 2026-06-30 and then repealed and re-enacted in narrower form by SB 26-189, signed 2026-05-14, effective 2027-01-01. **The gate text is out of date.** This was not confirmed at the Colorado General Assembly's site.
- **Illinois.** An amendment to the Human Rights Act (HB 3773, effective 2026-01-01) requires notice when AI is used in hiring decisions and bars discriminatory effect.
- **California.** Civil Rights Council regulations on automated-decision systems in employment took effect 2025-10-01, and the privacy agency's automated-decision rules begin to bind in 2027.
- **New York City** Local Law 144 requires a bias audit and notice for a tool that substantially assists a hiring decision.

**Required product change.** Rename the gate to "automated hiring tools compliance", replace the SB 24-205 reference in the SP8 spec and the counsel packet with the current list, and show seekers and hosts the fit-score notice wherever a score appears. Keep a record of each score's inputs so an audit is possible.

**Counsel: Yes** (existing gate).

## 3. Child safety (L-10, L-11, L-12)

### 3.1 What 18 U.S.C. § 2258A requires

Read at the current US Code on 2026-11-10, including the REPORT Act (Pub. L. 118-59, 2024-05-07) and a December 2025 amendment (Pub. L. 119-60).

| Duty | Text | Where |
|---|---|---|
| Report | A provider "shall, as soon as reasonably possible after obtaining actual knowledge" of an apparent violation, report to NCMEC's CyberTipline | (a)(1) |
| What triggers it | Apparent child sexual abuse material offenses (18 U.S.C. §§ 2251, 2251A, 2252, 2252A, 2252B, 2260) and, since the REPORT Act, child sex trafficking (§ 1591) and online enticement of a minor (§ 2422(b)) | (a)(2)(A) |
| May also report | Planned or imminent violations | (a)(1)(A)(ii), (a)(2)(B) |
| Contents | At the provider's discretion: identifying information about the person, history of the upload, geographic information (IP address), the images, and the complete communication | (b) |
| No duty to search | The law does not require a provider to monitor users or to scan | (f) |
| Preserve | A completed report is a request to preserve its contents **for 1 year** (it was 90 days before the REPORT Act) | (h)(1) |
| Preserve related content | Also keep "any visual depictions, data, or other digital files that are reasonably accessible and may provide context" | (h)(2) |
| Protect it | Keep it "in a secure location" and limit staff access to what the duty needs | (h)(3) |
| Security standard | Preserve "in a manner that is consistent with the most recent version of the Cybersecurity Framework" of NIST | (h)(6) |
| May keep longer | Voluntarily, to reduce online child sexual exploitation | (h)(5) |
| Penalty | A knowing and willful failure to report: up to $600,000 for a first failure and $850,000 for a later one, for a provider with fewer than 100 million monthly users | (e) |

Section 2258B limits a provider's liability for reporting and preserving in good faith, and requires it to minimize the number of employees with access. Possessing or sending this material for any other purpose is a crime, so matched images must never be emailed, pasted into a ticket, shown to an AI model, or copied to a backup.

Explore&Earn chose to scan, which the law does not require. Having chosen it, every PhotoDNA match gives the company actual knowledge, and the clock starts at the match, not when someone opens the queue.

### 3.2 Registration

NCMEC registers providers as "electronic service providers" through an online form (secondary sources give `esp.ncmec.org/registration`; NCMEC's site links it), followed by vetting and, on approval, CyberTipline credentials. Reports can be filed through the web form or an API. Microsoft approves PhotoDNA Cloud Service use separately. Both are founder items in SP8 section 13 and gates `ncmec.registered` and `child_safety.live`. Neither has a published turnaround, so they should be started now.

### 3.3 Gaps in the current design

1. **Retention is right, the storage rule is not.** SP8 keeps child-safety evidence for 1 year after submission, which matches (h)(1). It also says the evidence "is never copied" to backups. A single copy that is lost breaks the preservation duty. Use one restricted bucket with object versioning and deletion lock for the retention period.
2. **Related content is not preserved.** The prepared report holds the uploader's id, email, upload time, hash and PhotoDNA reference. (h)(2) also expects reasonably accessible context: the account record, sign-in IP addresses and times, the listing or profile the image was attached to, and the uploader's other uploads.
3. **A deletion request must not erase it.** The eraser must treat a `child_safety` item as a legal hold on that user for the retention period.
4. **Enticement and trafficking of a minor are now reportable.** A message report or scam flag that shows an adult soliciting a minor must reach the `child_safety` queue. Today that queue takes only image matches.
5. **Access.** (h)(3) and § 2258B need the bucket and the queue limited to named people, with every view logged. The `child_safety` queue permission exists; the storage policy and the view log must match it.
6. **Do not tell the user.** The uploader sees a generic upload failure. The account is suspended after the report is filed, with a generic reason.
7. **Nobody is named.** See section 10.

**Required product changes**

- P0: versioned, locked evidence bucket outside normal backups, with access limited to the two named reporters and every access audited.
- P0: on a match, snapshot the related account data into `ncmec_reports.prepared` and place an automatic legal hold (scope `all`) on the user until one year after submission.
- P0: route "minor at risk" reports from messaging and profiles to `child_safety`.
- P0: an alert that pages the primary reporter at once, re-alerts the backup after 4 hours without acknowledgement, and re-alerts both every 4 hours until a report id is recorded.
- P0: a written runbook (section 10) and a quarterly drill with the benign probe image.
- P1: file through the CyberTipline API instead of the web form once volume or audit needs justify it.

**Counsel: Yes.** Confirm the reporting timeline the company commits to, the preservation design against the NIST framework requirement, and what the operator may and may not view.

### 3.4 Non-consensual intimate images (L-12)

The TAKE IT DOWN Act (Pub. L. 119-12, 2025-05-19) requires a "covered platform" to offer a notice-and-removal process for intimate images posted without consent, to remove a reported image "as soon as possible, but not later than 48 hours" after a valid request, and to make reasonable efforts to remove known identical copies. The process had to exist by 2026-05-19, and the Federal Trade Commission enforces it as a rule violation. A covered platform is a public site or app that primarily provides a forum for user-generated content; email and services with mostly provider-selected content are excluded. Good-faith removal is protected from liability.

A job marketplace is arguably not "primarily" a user-content forum at launch. Once Community photos ship it is much closer, and messaging already carries user images. The process is cheap.

**Required product change.** Add the report reason "Intimate image of me shared without consent" to Report on every photo and message, with a signed-request form (name, the content, a good-faith statement, contact details), a `/help` page that explains it in plain language, a 48-hour deadline on the queue item, and removal of identical copies by hash. P1 for launch, P0 for SP7.

**Counsel: Yes**, on whether the platform is covered at launch.

## 4. Privacy (L-13 to L-16)

### 4.1 Which laws apply

- **California (CCPA as amended by the CPRA, Civ. Code § 1798.100 and following).** Applies to a business with revenue above about $26.6 million, or that buys, sells or shares the personal information of 100,000 or more Californians, or earns half its revenue from selling or sharing it. Explore&Earn is probably under all three at launch. Job applicants and employees have had full rights since 2023. New regulations took effect 2026-01-01 (risk assessments; automated-decision notices from 2027).
- **Other states.** Nineteen or twenty states have a comprehensive privacy law in force, including Indiana, Kentucky and Rhode Island from 2026-01-01. Most apply at 100,000 residents; several apply at 35,000 or fewer; Texas and Nebraska have no number and instead exempt small businesses while still requiring consent before selling sensitive data. Nearly all require **opt-in consent to process sensitive data**, and nearly all list **citizenship or immigration status** and **precise geolocation** (within about 1,750 feet; 1,850 feet in California) as sensitive.
- **Every state** has a breach-notification law with no size threshold.
- **GDPR and UK GDPR** apply to EU and UK seekers the product accepts (existing gate).

**Recommendation.** Build to the California and Colorado standard for everyone, as SP8 already largely does (automatic export and deletion, retention sweep, consent records, Global Privacy Control in tests). That is cheaper than tracking thresholds, and vendors' contracts will expect it.

### 4.2 Sensitive data (L-13)

| Data | Where | Change |
|---|---|---|
| Work authorization and visa details | seeker profile, shown on applications | Collect on a separate step with its own consent line: "We show hosts whether you can work in the US and whether you need sponsorship, only when you apply." Reduce what hosts see (section 2.2). Never use it for ranking, analytics or marketing. |
| Precise location | "Near me" on the map | Use the browser position in the page only. Send the server a map viewport or a position rounded to about 1 km, and store nothing. If a stored or precise position is ever wanted, add opt-in consent first. |
| Message contents | messaging, scanned for scams | Say so in the privacy policy and at the top of the first thread. |
| Resume file | AI import | Already consent-gated and not sent to hosts (FD-2). Delete the file after import or within the stated retention period. |
| Birth year | sign-up (section 2.6) | Keep the year only. |

Host location pins are business information. A listing's housing photos and "exact" pin can reveal where workers sleep; default `publicPrecision` to `city` when the location's kind is not a public business site.

### 4.3 The candidate pool (L-14)

Hosts pay for plans that include invite credits and access to a candidate pool. Giving a paying third party access to personal information is a "sale" under California law unless the consumer directs the disclosure (Civ. Code § 1798.140(ad)). A business that sells data of people it has no direct relationship with is also a "data broker" with registration duties in California, Vermont, Texas and Oregon.

**Required product change.** Being discoverable in the candidate pool is **off by default** and turned on by a clear choice: "Let hosts find me and invite me to apply. They see your first name, last initial, headline, skills and availability." Record the choice with a timestamp, let it be turned off at any time with effect within a day, and state in the privacy policy that Explore&Earn does not sell personal information. Applying to a listing is itself a disclosure the seeker directs.

**Counsel: Yes.**

### 4.4 Hosts as recipients of applicant data

Once a seeker applies, the host holds the application as its own business record. The Host Terms must limit the host to using it for that hiring decision, forbid resale or marketing, require reasonable security, and require deletion on request or when the host leaves. The product already limits what is shown before an application and freezes the applied copy. Keep the SP8 rule that a deleted seeker's shared applications are redacted, pending counsel.

### 4.5 Analytics and session replay (L-15)

SP8 loads PostHog for US visitors without asking and honors a rejection. Plaintiffs' firms have filed many claims under the California Invasion of Privacy Act (Penal Code §§ 631, 638.51) against sites that run session replay or third-party trackers before consent.

**Required product change.** Session replay off in production at launch, or on only with all inputs and message text masked and after consent. Analytics events carry no message text, resume text or work-authorization values. Treat a Global Privacy Control signal as a rejection everywhere, not only in the EU. A contract with each vendor that makes it a service provider.

**Counsel: Short check.**

### 4.6 GDPR and UK GDPR (L-16)

Already a gate (`legal.privacy`, with the `international` document). The points counsel must close: lawful basis for each purpose; a transfer mechanism for each US vendor; whether an EU and a UK representative are needed (GDPR article 27); the cookie banner; and the response time for rights requests (one month). Two product notes: web push to an EU user is consent-based and must be as easy to withdraw as to give; and the fit score must stay a ranking aid with a human decision, to stay outside article 22.

### 4.7 Breach response

**Required product change.** A one-page incident runbook: who decides, how affected users are identified, the notice template, and the regulator list. A fake host who obtains applications under false pretenses (section 7) may count as unauthorized acquisition under some state laws; counsel decides case by case.

## 5. Federal Trade Commission: endorsements, reviews and honest labels (L-17, L-18)

**The rules**

- **Rule on the Use of Consumer Reviews and Testimonials, 16 CFR part 465** (in force since 2024-10-21). It bans fake reviews and testimonials (§ 465.2), paying for reviews of a particular sentiment (§ 465.4), undisclosed insider reviews (§ 465.5), company-controlled sites posing as independent (§ 465.6), suppressing reviews by threat or presenting a filtered set as all reviews (§ 465.7), and buying or selling fake indicators of social-media influence (§ 465.8). Civil penalties are about $53,000 per violation.
- **Endorsement Guides, 16 CFR part 255.** A material connection between an endorser and the business, such as a discount, must be disclosed (§ 255.5).
- **Consumer Review Fairness Act, 15 U.S.C. § 45b.** A form contract cannot bar or penalize honest reviews.
- **FTC Act section 5, 15 U.S.C. § 45.** Any misleading claim or label is a deceptive practice.

**How they apply**

| Feature | Risk | Required product change |
|---|---|---|
| "As described" (Yes / Partly / No on housing, meals, pay) | A host marks its own test account "Hired" and answers; a host pressures workers; negative answers are hidden | Only a seeker with a real application and an accepted offer on that listing may answer. One answer per person per job. Exclude any account that shares an email domain, device or payment detail with the host. Show all answers once there are five; never let a host hide or remove one; remove only for neutral, written reasons (fraud, abuse, wrong employer) and log each removal. Hosts may reply but not edit. Hosts may not offer anything for an answer. |
| "Confirmed active N days ago", "Usually replies in X" | A label that is stale or computed generously | Compute from logged events only, show the date basis in a tooltip, and hide the label when there is too little data. Never set by an operator by hand. |
| Subscriber badge | Read as verification | Already fixed by FD-4. Keep the tooltip to "Active Explore&Earn host since [date]". |
| View, save and applicant counts | Inflated numbers (strategy risk 4) | Count unique signed-in people or de-duplicated guests, exclude bots, the host's own team and operators. Never seed or round up. |
| Sample or seeded listings | Shown as live jobs | Already barred by `AGENTS.md`. Keep a test that no seeded listing is public in production. |
| Founding-host testimonials on the site or in outreach | A 50% discount is a material connection | Each testimonial carries "Founding host; receives a discounted plan". Use only real quotes with written permission. No testimonial from staff or relatives without saying so. |
| Boosts and announcements (SP6) | Paid placement that looks organic | Already labeled in the spec. Keep the label on every surface, including the share card. |
| "Never pay to get a job" | A promise the product must keep | No seeker fee anywhere; hosts barred from charging seekers (section 2.3). |

**Seeker and Host Terms** contain no clause that restricts honest reviews.

**Counsel: Short check** on whether "As described" answers are "consumer reviews" under part 465, and on the removal reasons.

## 6. Email, web push and SMS (L-19, L-20)

### 6.1 CAN-SPAM

The CAN-SPAM Act (15 U.S.C. §§ 7701–7713; 16 CFR part 316) applies to commercial email, including business-to-business mail. A commercial message needs accurate headers and subject, a clear opt-out that works for 30 days and is honored within 10 business days, and a valid postal address (15 U.S.C. § 7704(a)). Sending to addresses harvested from websites is an aggravated violation (§ 7704(b)(1)). Transactional or relationship messages are exempt from the opt-out rule but not from the ban on false headers. Penalties are about $53,000 per message.

| Message | Class | Required |
|---|---|---|
| Application status, interview reminders, security, billing, legal updates, "Still hiring?" | Transactional | Accurate sender and subject. No promotion mixed in. |
| Job alerts, weekly digest, re-engagement, host invites to seekers, product news | Treat as commercial | One-click unsubscribe by category, postal address, opt-out honored at once. |
| Cold outreach to prospective founding hosts | Commercial | Addresses from the business's own published contact or a real referral, never a scraped or bought list. Identify Explore&Earn, give the postal address, and include an opt-out that feeds a permanent suppression list shared with product email. |

**What the product already does.** Unsubscribe and address on marketing mail, per-category switches, a test that every template renders List-Unsubscribe where required.

**Required product changes.** A single suppression list that outreach tools and the product both check. Host invites to seekers count as commercial: a seeker can turn invites off, and the invite email names the host and Explore&Earn. An operator sending outreach uses the warmed domain and the suppression list, not a personal mailbox.

**Counsel: No.**

### 6.2 Web push

No US statute is specific to web push. The browser's permission prompt is the consent; section 5 of the FTC Act bars tricking users into it; EU and UK law require consent that can be withdrawn.

**Required product changes.** Ask only after an action that explains why ("Get notified when this host replies?"), never on first page load. Follow the same category switches as email. No promotional push unless the user turned that category on. Delete the subscription on the server when the user turns push off or the browser reports it expired. Keep lock-screen text free of sensitive detail: "You have a new message", not the message.

**Counsel: No.**

### 6.3 SMS

Capped at 0, which is the right setting. Before raising it: the Telephone Consumer Protection Act (47 U.S.C. § 227; 47 CFR 64.1200) requires prior express consent for informational texts and written consent for marketing; opt-out by any reasonable means must be honored within 10 business days; quiet hours apply; several states have stricter laws with private claims of $500 to $1,500 per text; and carriers require 10DLC brand and campaign registration.

**Required product change.** None now. A raise above 0 needs its own task: a consent screen that names the message types, a consent log, STOP and HELP handling, quiet hours by the recipient's time zone, and registration.

**Counsel: Yes, before enabling.**

## 7. Scams and fake jobs (L-21)

**The risk.** The Federal Trade Commission's data show reported losses to job and employment-agency scams of about $501 million in 2024, roughly triple the 2020 level in reports. A job with housing far from home, offered to someone who will travel to take it, also fits the pattern of a labor-trafficking lure; that is the agent's judgment, not a cited finding. The patterns to expect:

1. A fake host posts to collect resumes, contact details and identity documents.
2. A "host" asks for money: a housing deposit, a uniform or training fee, a visa or recruitment fee, or a cashed check.
3. A host moves the seeker off the platform, then does either of the above.
4. A real-looking job turns into unpaid work, confiscated documents, or housing debt the worker cannot leave.
5. Someone impersonates a well-known park concessionaire or lodge.

**The law.** Section 230 shields the platform from most claims over a host's content, but not from federal criminal law, and not for the platform's own statements. The Trafficking Victims Protection Act lets a victim sue anyone who "knowingly benefits" from taking part in a venture it knew or should have known involved forced labor (18 U.S.C. §§ 1589, 1595). 18 U.S.C. § 1351 makes fraud in foreign labor recruiting a crime. Section 5 of the FTC Act covers the platform's own safety claims: if the site says hosts are verified, they must be. The FTC's impersonation rule (16 CFR part 461) targets the impersonators.

**What the product already does.** Automated business verification before a host's first listing goes live; contact details hidden until the seeker applies; message scanning with a "Never pay to get a job" warning; a safety check on the Additional step link; Report and Block everywhere; the subscriber badge no longer implies trust.

**Required product changes**

1. **No applicant data to an unverified host.** A host whose business verification is `running`, `needs_review`, `needs_info` or `failed` cannot receive applications, view the candidate pool or send invites. Verify before the listing is visible, not after.
2. **Verification signals to check:** the sign-up email domain matches the business website; the website and business registration predate the account; the payment card's country and name fit the business; the same card, device or phone has not been banned. Free-mail hosts are allowed but always go to manual review. A host claiming a well-known brand is checked against that brand's own careers contact.
3. **Rate limits for new hosts.** For the first 30 days, cap invites and profile views per day, and alert on a host that opens many applications but never replies.
4. **Payment requests.** The message scanner already flags requests for money. Add: any request for a deposit, fee, bank detail, Social Security number or ID photo before an accepted offer pauses the thread and queues it for review. A real deposit must be stated in the listing's housing section (section 2.4); one that appears only in messages is a red flag.
5. **A time limit on reports.** A report of fraud or of danger to a person is reviewed within 4 hours in staffed hours and 24 hours otherwise. A listing with two independent fraud reports is hidden until reviewed.
6. **When a fake host is confirmed:** ban the organization and its payment and device fingerprints, hide its listings, and notify every seeker who applied or messaged, telling them what was exposed and what to do, with links to ReportFraud.ftc.gov and IdentityTheft.gov. Counsel decides whether state breach laws also apply.
7. **A trafficking path.** A report reason "I'm being forced to work or can't leave" that shows the National Human Trafficking Hotline (1-888-373-7888, text 233733) at once and pages the on-call operator. The operator runbook says when to call law enforcement.
8. **A plain "Staying safe" page**, linked from every listing and the first message in a thread: never pay to get a job; a real employer will not ask for bank details before hiring; check the employer's own website; tell someone where you are going.
9. **Honest wording.** The product never calls a host "verified", "trusted" or "safe". It may say what was checked and when.

**Counsel: Yes.** Confirm the notification duty when a fake host is found, and the wording of safety claims.

## 8. Founder decisions with a legal side

### 8.1 Operator-built listings (L-22)

When an operator writes a listing, Explore&Earn is its author. Section 230 does not cover the platform's own content, and the pay-transparency and discrimination duties attach to whoever published.

**Required product changes (P0; this is planned task P0-13)**

1. **Written consent before work starts**, stored on the organization: who agreed, when, and what the operator may use (the host's own job description, facts and photos).
2. **The operator saves a draft only.** The host reviews every section and presses Publish personally, with the same attestations as any host. An operator account cannot publish for a host.
3. **No invented facts.** A field the host did not supply stays empty and blocks publishing (FD-3 extended to pay, benefits, dates and deductions).
4. **Photos only from the host**, with the host's confirmation that it owns them or may use them. Nothing copied from another site.
5. **Provenance** records `operator_assisted` and the operator's id, visible to operators, with a full revision history.

**Counsel: Short check** on the consent wording.

### 8.2 Founding 100 and the 30-day publish rule (L-23)

The new condition is lawful if a host is told before it relies on the offer. Hosts who signed up under the earlier FD-7 wording were promised a place by signing up, with no publishing deadline.

**Required product change.** Show the condition on the founding offer page and the sign-up confirmation. For hosts who joined before the change, either keep the old terms or email them the new condition with 30 days from that email. Record which terms each organization accepted.

### 8.3 Freshness pauses and subscription billing (L-23)

Pausing a listing a host has paid for is fine if the Host Terms say so and the host is warned. Subscriptions that renew are governed by the Restore Online Shoppers' Confidence Act (15 U.S.C. § 8403) and state automatic-renewal laws, which mostly protect consumers but are sometimes applied to small businesses. The FTC's 2024 "click-to-cancel" rule was vacated by the Eighth Circuit in July 2025; the Commission reopened the rulemaking in 2026, and still brings cases under the older statutes.

**Required product changes.** State the pause rule in the Host Terms and in each "Still hiring?" reminder ("We'll pause this listing on [date] if we don't hear from you"); one-tap resume. For billing: show the price, renewal date and cancellation method before the card is taken; cancel online in as few steps as sign-up; email a reminder before an annual renewal; make the season pass or pause option (decision 5) clear about what is and is not charged while paused.

**Counsel: Short check.**

## 9. Decision item 1: is a take-home pay estimate allowed, and how should it be worded?

**Answer: yes, with conditions.** No federal or state law was found that bars a marketplace from showing an estimate of pay after stated deductions. Three bodies of law set the conditions:

1. **Deception law** (FTC Act section 5 and state equivalents). An estimate a reasonable seeker would read as a promise, or that leaves out a cost the product knows about, is deceptive. The product computes the number, so the platform, not the host, owns the claim, and Section 230 does not cover it.
2. **Pay transparency law.** The host's gross pay range must still appear, unchanged, with equal or greater prominence. The estimate adds to it and never replaces it.
3. **Wage law.** The estimate must not make an unlawful deduction look normal (section 2.4).

**What to build**

- **Estimate pay after housing and meals, before taxes. Do not estimate tax at launch.** Withholding depends on facts the product does not have: the worker's W-4, state of residence, other income, and status (J-1 students are generally exempt from Social Security and Medicare tax; contractors have no withholding). A tax estimate would be wrong for many users in a direction that cannot be predicted.
- **Do not call it "take-home pay".** That phrase means after tax. Use the label below.
- **Inputs: only what the host entered.** Pay rate or range, weekly hours, and housing, meal and other deductions marked "deducted from pay". No tips, overtime, bonuses or assumed extra hours.
- **Show it as a range** when pay is a range, per week, with the arithmetic one tap away.
- **Do not show it** when weekly hours are missing; when pay is crew share, per trip or per season with no weekly figure; when a deduction has no amount; or when the job is marked contractor.
- **When housing is paid directly to the host or a third party** and not deducted, show it as a separate line ("Housing: $120 a week, paid separately") and leave it out of the subtraction, so the display matches the pay slip.
- **Guard.** If the result is below the state minimum wage for the stated hours, do not show the estimate, and apply the review flag from section 2.4.
- **Host attestation at publish:** "These hours and deductions are what we expect for this job."
- **Keep the inputs and the formula version** with each listing revision, so any displayed number can be reproduced.

**Wording**

On the card and detail page, under the host's pay line:

> **About $560–$640 a week after housing and meals**
> Before taxes. Based on 40 hours a week at $18–$20 an hour, less $160 a week for housing and meals. [How we work this out]

In the "How we work this out" panel:

> This is an estimate from details the employer gave us. It is not an offer or a guarantee of hours or pay.
> - Pay: $18–$20 an hour × 40 hours = $720–$800 a week
> - Housing, deducted from pay: −$110 a week
> - Meals, deducted from pay: −$50 a week
> - **About $560–$640 a week before taxes**
>
> Taxes and any other deductions will lower what you receive. Tips, overtime and bonuses are not included. Ask the employer to confirm hours and deductions in writing before you accept.

Words to avoid: "take-home", "net pay", "you'll earn", "you'll save", "guaranteed", and any comparison with rent elsewhere.

**Severity if built as above:** Low. **Counsel: Short check** on the label and disclaimer, and on the launch states' rules for stating deductions in advertisements.

The earlier V1 note that there is "no take-home estimate in V1" (`docs/v1/01-domain-model.md`) is superseded by founder decision 8, subject to this review. A later tax estimate would need its own review.

## 10. Decision item 2: who should cover the child-safety queue?

**Answer: the founder as the primary reporter, with one named human backup appointed before launch. Never an AI agent, and never an unnamed "operator on duty".**

Reasons: the duty and the penalty sit on the company; § 2258B requires access to be kept to as few people as possible; the report commits the company to statements of fact to law enforcement; and no model or agent may be given apparent child sexual abuse material.

**Operating proposal**

| Item | Proposal |
|---|---|
| Primary reporter | The founder (organization Owner). Holds the CyberTipline login. |
| Backup reporter | One named adult the founder trusts and has under a confidentiality agreement: a co-owner, an employee, or a retained trust-and-safety contractor. Has their own CyberTipline login and the `child_safety` queue permission. **This person must be named before the `ncmec.registered` gate is attested.** If nobody suitable exists, retain a trust-and-safety firm that offers CyberTipline reporting; it is the only acceptable substitute. |
| Who is excluded | Every AI agent, the support AI, other operators, and vendors' support staff. The queue item is invisible to them. |
| Alerting | A match pages the primary by push and email immediately. No acknowledgement in 4 hours pages the backup. Both are re-paged every 4 hours until a CyberTipline report id is recorded. The daily digest lists any open item first. |
| Time commitment | Acknowledge within 4 hours. **File within 24 hours of the match.** The statute says "as soon as reasonably possible"; 24 hours is this proposal's commitment for counsel to confirm. |
| Absence | Before the primary is unreachable for more than 12 hours (a flight, a holiday), they hand the pager to the backup in the console, and the handover is logged. Both may not be away at once. |
| What happens automatically | The upload is blocked. The file moves to the locked evidence bucket. The uploader sees a generic failure. The account's uploads are frozen. Related account data is snapshotted and a legal hold is set (section 3.3). |
| What the human does | Opens the item; confirms the prefilled report (uploader id and email, IP address and time of upload, file hash, PhotoDNA result, where it was uploaded); submits it on the CyberTipline; records the report id and time. Then bans the account with a generic reason. |
| Viewing the image | Not needed for a hash match, and the default is not to. The report form asks whether the company viewed the file; answer truthfully. If a report comes from a user and not from a hash match, the reporter views only as much as is needed to decide whether it is apparent child sexual abuse material, then reports. |
| Never | Email, message, screenshot, download or describe the image outside the CyberTipline. Tell the uploader. Delete the evidence early. Ask an AI to look. |
| Preservation | One year from submission in the locked bucket, then automatic deletion unless law enforcement has asked for more time. Access is logged, and the log is reviewed quarterly. |
| Other reportable conduct | Apparent enticement or sex trafficking of a minor in messages follows the same path (section 3.3). |
| Law-enforcement requests | Go to the founder and counsel. Nothing is released without legal process, apart from the CyberTipline report. |
| Training and care | Both reporters read NCMEC's provider guidance and this runbook before launch and yearly. Either may ask the other to take an item. |
| Drill | Quarterly: the benign probe image goes through the whole path short of submission, timed, with the result attached to the `child_safety.live` gate. |
| Records | For each match: detection time, acknowledgement time, submission time, report id, who acted. Kept 5 years without the image. |

**Product changes this needs:** two named reporter slots on the `child_safety` queue with the gate refusing to pass while the backup slot is empty; the escalating alert; the pager handover; the locked bucket and snapshot; and the runbook page in the operator console. All P0.

**Counsel: Short check** on the 24-hour commitment and the viewing rule.

## 11. Outlines

### 11.1 Terms of Service

SP8 plans five documents: Terms (seekers and everyone), Host Terms, Privacy Policy, Cookies, and Community Guidelines. Outline for the first two:

**Terms (all users)**

1. Who we are; these terms form a contract; how we change them (30 days' notice for material changes, as SP8 specifies).
2. What Explore&Earn is: a venue where employers post and people apply. We are not an employer, recruiter, agent or party to any job. We do not guarantee a job, an employer, a listing's accuracy, housing, or a hire.
3. Eligibility: 18 or older; one account, one role (FD-1); accurate information; no account for someone else.
4. Free for seekers. Nobody may charge a seeker to apply, interview, be hired or be housed before an offer.
5. Your content: you keep ownership and license us to host and show it; you confirm you have the right to post it; no children identifiable in photos.
6. Rules of use: no fraud, no discrimination, no harassment, no scraping, no off-platform payment requests, no unlawful content. Community Guidelines are part of the terms.
7. Safety: what we check and what we do not; "As described" answers are workers' own opinions; how to report; we may remove content or accounts.
8. Child safety: uploads are scanned; apparent child sexual abuse material is reported to NCMEC and kept as the law requires.
9. Non-consensual intimate images: how to ask for removal.
10. Pay estimates: how the after-housing estimate is made and that it is not an offer.
11. The fit score: what it uses, what it never uses, and that it does not decide.
12. Messages are scanned for scams and safety.
13. Reviews: honest answers are welcome; nothing in these terms limits them.
14. Copyright complaints and our designated agent.
15. Ending your account; what we keep and why (points to the Privacy Policy).
16. Disclaimers and the limit of our liability, to the extent the law allows.
17. Disputes: governing law, venue, informal resolution first. Counsel decides whether to use arbitration and a class waiver.
18. Contact and postal address.

**Host Terms (in addition)**

1. Authority to bind the organization; roles and seats.
2. Plans, prices, renewal, cancellation, refunds, pause or season pass; taxes; the founding offer and its 30-day publish condition.
3. Listings: accurate and current; pay is the good-faith range; housing, meals, deposits and deductions are stated truthfully and lawfully; one real job per listing; we may pause a listing after two unanswered "Still hiring?" reminders, or remove it.
4. Compliance is the host's: wage and hour law, pay transparency, anti-discrimination, immigration and visa-program rules, child labor, housing standards, and worker classification.
5. No fees or deposits from seekers before an offer; no recruitment or visa fees at all.
6. Applicant data: use only to consider that person for that job; no resale or marketing; keep it secure; delete on request or on leaving; tell us of any breach within 72 hours.
7. Candidate pool and invites: fair use limits; no bulk messaging; no contact off-platform before the seeker shares details.
8. "As described": hosts may reply, may not retaliate, pressure or reward answers.
9. Operator-assisted listings: the host's consent, the host's review and publish, the host's responsibility for the facts.
10. Verification: what we check; the subscriber badge means a paid plan only.
11. Suspension and termination; what happens to listings and data.
12. Indemnity for the host's listings and hiring practices; liability cap.

### 11.2 Privacy Policy

1. Who we are and how to reach us; date and version.
2. What we collect, by source: from you (account, profile, work authorization, availability, applications, messages, photos, resume file), automatically (device, log and coarse location data, cookies), and from others (sign-in provider, payment processor, verification services).
3. Sensitive information: work authorization and precise location; that we ask first; what we use each for; that we use neither for ranking or marketing.
4. Why we use it, by purpose, with the legal basis for EU and UK users.
5. Who sees what: the staged reveal to hosts (pool card, then application, then contact details); that an uploaded resume file is never sent to hosts; what stays private.
6. Automated tools: the fit score, scam scanning of messages, image hash-matching, AI resume import and writing help; that our AI provider does not train on your data; how to get a human review.
7. Who we share with: hosts you apply to or choose to be found by; service providers (the subprocessor list); NCMEC and law enforcement as the law requires; a successor business. **We do not sell personal information or share it for cross-context advertising.**
8. Your choices: candidate-pool visibility, photo visibility, notification categories, cookies and Global Privacy Control.
9. Your rights by place (California, other US states, EU and UK): access, correction, deletion, portability, limiting sensitive-data use, appeal; how to use them in the app; response times; no penalty for using them.
10. How long we keep things: the retention table generated from the code (SP8), including what survives deletion and why (shared application records, safety records, billing records, legal holds, child-safety evidence for one year).
11. Security, and what we do if there is a breach.
12. International transfers.
13. Children: the service is for adults; what we do if we learn a user is under 18.
14. Changes to this policy.

## 12. Product changes, in priority order

Each item is sized to open as one task. "Gate" names the SP8 launch gate it supports.

### P0: before public launch

| # | Change | From | Gate |
|---|---|---|---|
| 1 | Name the primary and backup child-safety reporters; the queue refuses to pass its gate while the backup slot is empty; escalating alert and pager handover | 10 | `ncmec.registered` |
| 2 | Submit the NCMEC provider registration and the PhotoDNA production application now | 3.2 | `ncmec.registered`, `child_safety.live` |
| 3 | Locked, versioned evidence bucket with logged access; snapshot of related account data on a match; automatic one-year legal hold that the eraser honors | 3.3 | `child_safety.live` |
| 4 | Route "minor at risk" and under-18 reports from messages and profiles to `child_safety`; written runbook; quarterly drill | 3.3, 2.6 | `child_safety.live` |
| 5 | No applications, pool access or invites for a host until business verification passes; stronger verification signals; new-host rate limits | 7 | new: fraud readiness |
| 6 | Pause a thread on any pre-offer request for money, bank details or ID; 4-hour and 24-hour report deadlines; hide a listing after two fraud reports | 7 | new: fraud readiness |
| 7 | Confirmed-fake-host procedure: ban by fingerprint, notify affected seekers; trafficking report path with hotline | 7 | new: fraud readiness |
| 8 | "Benefits and other compensation" field, required with "None" allowed; Colorado closing-date rule | 2.1 | `legal.wage_visa` |
| 9 | Pay present in every rendering of a listing (card, detail, share image, email, push, structured data), enforced by a test | 2.1 | `legal.wage_visa` |
| 10 | Publish-time host attestations (pay is the good-faith range; hours and deductions are as expected), stored per revision | 2.1, 9 | `legal.wage_visa` |
| 11 | Wording check: wider block list, new flag-for-review list, applied to descriptions, qualifications and screening questions | 2.2 | `legal.terms` |
| 12 | Hosts see only "authorized to work: yes/no" and "needs sponsorship: yes/no"; separate consent step for work authorization | 2.2, 4.2 | `legal.privacy` |
| 13 | Candidate-pool visibility off by default with a recorded opt-in; no candidate filter on protected traits | 4.3, 2.2 | `legal.privacy` |
| 14 | Minimum-wage warning counts deducted housing and meals; flagged listings go to review | 2.4 | `legal.wage_visa` |
| 15 | Structured deductions; housing facts: required to live there, deposit, what happens if the job ends | 2.4 | `legal.wage_visa` |
| 16 | Operator-assisted listings: stored consent, draft-only operator, host publishes, no invented facts, provenance | 8.1 | `legal.terms` |
| 17 | Date-of-birth age screen at seeker sign-up, storing the year only | 2.6 | `legal.privacy` |
| 18 | "Near me" uses a rounded position and stores nothing; session replay off or fully masked; Global Privacy Control honored everywhere | 4.2, 4.5 | `legal.privacy` |
| 19 | "As described" eligibility and anti-gaming rules; logged, neutral removal reasons; honest computation of freshness, reply-time and count labels | 5 | `legal.terms` |
| 20 | Update the fit-score gate and counsel packet: Colorado SB 24-205 is replaced; add Illinois and California | 2.8 | `legal.fit_score` |
| 21 | H-2A free-housing block; H-2B copy rule and consistency prompt; "no fees from seekers" in both Terms | 2.3 | `legal.wage_visa` |
| 22 | One suppression list shared by outreach and product email; invites treated as commercial mail | 6.1 | `legal.terms` |
| 23 | Founding-offer page and confirmation show the 30-day condition; earlier sign-ups keep old terms or get 30 days' notice | 8.2 | `legal.terms` |
| 24 | Subscription disclosures before payment, online cancellation, renewal reminder, pause wording in reminders | 8.3 | `legal.terms` |
| 25 | Take-home estimate built to section 9, or left out of launch | 9 | `legal.wage_visa` |
| 26 | Register a DMCA agent with the Copyright Office; one-page breach runbook; "Staying safe" page | 11, 4.7, 7 | `legal.terms` |
| 27 | Draft Terms, Host Terms and Privacy Policy from the outlines in section 11 for counsel | 11 | `legal.terms`, `legal.privacy` |

### P1: after launch

| # | Change | From |
|---|---|---|
| 1 | Non-consensual intimate image removal flow with a 48-hour deadline (becomes P0 before Community ships) | 3.4 |
| 2 | CyberTipline API filing | 3.3 |
| 3 | H-2B applicant log export for recruitment reports | 2.3 |
| 4 | Farm listings: transportation field and printable written disclosure | 2.5 |
| 5 | SMS consent, logging, STOP handling and registration, as a precondition for raising the cap | 6.3 |
| 6 | Fit-score input log and audit export | 2.8 |
| 7 | Tax-aware pay estimate, only after a separate review | 9 |
| 8 | A review of admitting 16- and 17-year-olds, only if the founder wants it | 2.6 |
| 9 | State-by-state lodging-credit table feeding the minimum-wage check | 2.4 |

## 13. Questions for counsel

1. **Platform liability for pay transparency.** Is Explore&Earn a "third party" under 820 ILCS 112/10(b-25) and Cal. Lab. Code § 432.3(c), and an "employment agency" under N.Y. Labor Law § 194-b? Do the changes in 2.1 cover it?
2. **Employment agency and farm labor contractor status.** Given the fit score, paid invites and operator-built listings, is Explore&Earn an employment agency under Title VII or any launch state's licensing law, or a farm labor contractor under 29 U.S.C. § 1802(7)?
3. **Child-safety reporting.** Is a 24-hour filing commitment sound under 18 U.S.C. § 2258A(a)? Does the preservation design meet (h)(2), (h)(3) and (h)(6)? What may the reporter view?
4. **Take-home estimate.** Is the label and disclaimer in section 9 adequate under section 5 of the FTC Act and the launch states' laws, and should housing paid directly be shown the way proposed?
5. **Housing deductions.** For the launch destinations' states, what are the lodging and meal credit limits and consent rules, and is the warning wording right?
6. **Candidate pool.** With visibility as an opt-in, is pool access a "sale" under the CCPA or any other state law, and does any data-broker registration apply?
7. **Work authorization.** Is the two-question display the right line under 8 U.S.C. § 1324b, and may the product store visa type at all?
8. **Fake-host incidents.** When a fraudulent host obtains applications, which state breach-notification laws apply, and what must the notice say?
9. **Fit score.** What do Colorado SB 26-189, Illinois HB 3773, the California regulations and New York City Local Law 144 each require of a ranking tool that never rejects?
10. **TAKE IT DOWN Act.** Is Explore&Earn a covered platform at launch, and after Community ships?
11. **GDPR and UK GDPR.** Lawful bases, transfer mechanism, representatives, and whether to accept EU and UK seekers at launch at all.
12. **Terms.** Arbitration and class waiver: yes or no? Is the liability cap enforceable in the launch states? Do automatic-renewal laws apply to host subscriptions?
13. **"As described".** Are these answers "consumer reviews" under 16 CFR part 465, and are the removal reasons neutral enough?

## 14. Sources

Checked on 2026-11-10. **Primary** means the agent read the law at an official or standard primary source that day. **Secondary** means it was confirmed only through law-firm or agency summaries. **Not re-checked** means it is stated from the agent's own knowledge and must be verified before anyone relies on it.

### Primary

- 18 U.S.C. § 2258A, reporting requirements of providers (text including Pub. L. 118-59 and Pub. L. 119-60): https://www.law.cornell.edu/uscode/text/18/2258A and https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title18-section2258A
- REPORT Act, Pub. L. 118-59: https://www.congress.gov/118/plaws/publ59/PLAW-118publ59.pdf
- TAKE IT DOWN Act, Pub. L. 119-12, sections 3 and 4: https://www.congress.gov/119/plaws/publ12/PLAW-119publ12.htm (read through a page summary; the "primarily provides a forum for user-generated content" wording of the covered-platform definition is from the agent's knowledge and should be read in the original)
- 20 CFR 655.41, H-2B advertising requirements (eCFR current to 2026-11-09): https://www.ecfr.gov/current/title-20/section-655.41
- 20 CFR 655.18 and 655.20 (search result headings and snippets read; full text not re-read): https://www.ecfr.gov/current/title-20/section-655.18 and https://www.ecfr.gov/current/title-20/section-655.20
- 820 ILCS 112/10 (Illinois Equal Pay Act, third-party liability): https://www.ilga.gov/documents/legislation/ilcs/documents/082001120K10.htm ; Illinois Department of Labor guidance: https://labor.illinois.gov/laws-rules/conmed/equal-pay-act-salary-transparency.html
- Va. Code § 40.1-28.7:12: https://law.lis.virginia.gov/vacode/40.1-28.7:12/
- Maine HP 18 (132nd Legislature), chaptered text: https://legislature.maine.gov/legis/bills/getPDF.asp?paper=HP0018&item=7&snum=132
- N.Y. Labor Law § 194-b: https://www.nysenate.gov/legislation/laws/LAB/194-B
- Colorado Equal Pay for Equal Work Act, C.R.S. § 8-5-201 (Colorado Department of Labor and Employment copy): https://cdle.colorado.gov/sites/cdle/files/co_equal_pay_for_equal_work_act_%E2%80%9Cepewa%E2%80%9D%29%2C_c.r.s_%C2%A7_8-5-101%2C_et_seq.pdf
- RCW 49.58.110: https://app.leg.wa.gov/RCW/default.aspx?cite=49.58.110
- 29 CFR 531.3 and part 531 subpart C: https://www.ecfr.gov/current/title-29/part-531
- 29 U.S.C. §§ 1802, 1821: https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title29-section1821
- 16 CFR part 465: https://www.ecfr.gov/current/title-16/part-465 ; final rule, 89 Fed. Reg. 68034: https://www.federalregister.gov/documents/2024/08/22/2024-18519/trade-regulation-rule-on-the-use-of-consumer-reviews-and-testimonials

For the search-result items above (Illinois, Virginia, Maine, New York, Colorado, Washington, 29 CFR 531, 29 U.S.C. 1802 and 1821, 16 CFR 465), the agent read the official page's title and the matching passage returned by a government-source search, not the whole section.

### Secondary

- Virginia, Maine, Connecticut and Delaware pay-transparency details (thresholds, dates, penalties): Cooley, 2026-07-06, https://www.cooley.com/news/insight/2026/2026-07-06-show-me-the-money-or-the-wage-range-new-state-pay-transparency-laws
- Washington 2025 cure period, California SB 642, New Jersey and Massachusetts dates: law-firm trackers returned by search; not read at the statutes.
- Colorado SB 24-205 delayed, then repealed and replaced by SB 26-189: https://www.jdsupra.com/legalnews/colorado-repeals-and-replaces-ai-act-1665581/ and related summaries. Not confirmed at leg.colorado.gov.
- State privacy laws in force in 2026, and the 2026 California regulations: law-firm summaries. The $26.6 million threshold and the 1,850-foot and 1,750-foot definitions were **not** confirmed by the search.
- FTC enforcement of the TAKE IT DOWN Act from 2026-05-19 and the $53,088 penalty figure: https://www.ftc.gov/business-guidance/resources/complying-take-it-down-act and https://www.ftc.gov/news-events/news/press-releases/2026/05/ftc-begins-enforcing-take-it-down-act (titles and summaries read through search).
- FTC negative-option rule vacated in July 2025 and reopened in 2026: law-firm summaries.
- FTC job-scam figures ($501 million in 2024): reported by secondary sites citing the FTC's March 2025 release, https://www.ftc.gov/news-events/news/press-releases/2025/03/new-ftc-data-show-big-jump-reported-losses-fraud-125-billion-2024 . The figure was not read in the FTC's own table.
- NCMEC registration route: third-party integration guides and NCMEC's site link; no turnaround time is published.

### Not re-checked on 2026-11-10

Stated from the agent's knowledge. Citations are believed right but were not opened:

- Title VII, 42 U.S.C. §§ 2000e(c), 2000e-2(b), 2000e-3(b); ADEA, 29 U.S.C. § 623(e) and 29 CFR 1625.4; 8 U.S.C. § 1324b and the Justice Department's guidance on pre-offer questions.
- 47 U.S.C. § 230 and *Fair Housing Council v. Roommates.com*, 521 F.3d 1157 (9th Cir. 2008).
- FLSA, 29 U.S.C. §§ 203(m), 212, 213(a)(3), (a)(5), (a)(6), (b)(12); 29 CFR part 570; Field Assistance Bulletin 2015-1; all state lodging-credit rules.
- 20 CFR 655.40 to 655.48 other than 655.41; 20 CFR 655.122(d); 22 CFR 62.32; 29 U.S.C. § 1823.
- Cal. Lab. Code § 432.3(c); the Hawaii, District of Columbia, Maryland, Minnesota, New Jersey, Vermont and Massachusetts citations and thresholds in the table in 2.1; local ordinances.
- 18 U.S.C. §§ 2258B, 1351, 1589, 1595.
- CCPA sections cited; the state privacy laws' sensitive-data lists; California Penal Code §§ 631, 638.51; GDPR articles 22 and 27.
- 16 CFR part 255; 15 U.S.C. § 45b; 16 CFR part 461.
- CAN-SPAM, 15 U.S.C. § 7704 and 16 CFR part 316, and its penalty figure; 47 U.S.C. § 227 and 47 CFR 64.1200; 15 U.S.C. § 8403.
- Illinois HB 3773, the California Civil Rights Council regulations, and New York City Local Law 144.
- California Civil Code § 1812.500 and New York General Business Law article 11.
- 16 CFR part 312 (COPPA).

### Not covered

Tax and payroll law beyond the note in section 9; securities, insurance and corporate matters; accessibility law (a separate SP8 gate); intellectual property beyond the DMCA agent; non-US law other than the GDPR pointers; and any state's law on a point this review does not name.
