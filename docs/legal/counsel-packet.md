# Counsel packet

Draft for counsel review, not legal advice. These questions stay open until a lawyer signs an answer. Drafts of the eight legal documents (Terms of Service, Host Terms, Privacy Policy, Cookie Policy, Community Guidelines, Fit score notice, Working in the US from abroad, Subprocessors) and of the Staying safe page are in `src/modules/content/drafts/` and are not published. The founder delegated the pending legal calls to the lead (explore-and-earn#45 comment 6836991077): the drafts stay marked as drafts until a lawyer signs them, and work authorization keeps the two-answer rule. Hosts see only "authorized" or "needs sponsorship", never a visa type or an end date.

Sources in parentheses are the November 2026 legal review unless a spec is named.

## How the drafts reach counsel and readers

`pnpm content:seed-legal` saves each of the eight legal drafts as version 1 with status `draft`, with the questions from its front matter. Nothing in the code sends a draft to counsel, approves it or publishes it. The Owner submits a version for counsel review, records counsel's approval with a note (a console action that requires reverification), and schedules it; only then does `/legal/<slug>` show it. Until a version is published, `/legal/<slug>` says the document is still being finalized and shows the support address. The launch gates `legal.terms`, `legal.privacy`, `legal.gdpr`, `legal.wage_visa` and `legal.fit_score` stay with the founder (SP8 spec 8.9).

## Questions per draft

Spec 8.5's questions, verbatim, then the ones each draft adds.

### Terms of Service (`terms.md`)

- Spec 8.5: governing law and venue; arbitration.
- The draft adds: whether the limit of liability is enforceable in the launch states; whether "As described" answers are consumer reviews; the 24-hour child-safety filing commitment.

### Host Terms (`host-terms.md`)

- Spec 8.5: refund policy; auto-renewal notice rules by state.
- The draft adds: which founding-offer text the terms publish. Spec 8.5 still names the offer of 90 days free from public launch, then 30% off for life. Founder decision FD-7 (2026-11-04) withdrew it: 50% off for six monthly terms, or 50% off the first annual term, for the first 100 host organizations to sign up. The draft states both and chooses neither. Also whether automatic-renewal laws apply, and the two-answer work-authorization display.

### Privacy Policy (`privacy.md`)

- Spec 8.5: GDPR lawful bases and transfer mechanism; whether fit scores and host notes belong in access responses.
- The draft adds: whether pool access is a sale under the CCPA; whether the product may store a visa type; which breach-notification laws apply.

### Cookie Policy (`cookies.md`)

- Spec 8.5: none. The draft states spec 8.4 in full, banner copy included.
- The draft adds: whether the banner meets the ePrivacy rules and UK PECR; whether loading analytics outside the EU without asking, while honoring a refusal and Global Privacy Control, is enough given the California Invasion of Privacy Act claims in legal review §4.5.

### Community Guidelines (`community.md`)

- Spec 8.5: none.
- The draft adds: whether the TAKE IT DOWN Act covers Explore&Earn at launch and after Community ships; the child-safety reporting commitment.

### Fit score notice (`fit-score.md`)

- Spec 8.5: Colorado SB 26-189; Illinois HB 3773; California's automated-decision regulations; NYC Local Law 144 (bias audit, notice); any other state law counsel identifies.
- The draft adds: whether to turn the score off in a state through `hiring.fit_disabled_states`, by the listing's state, the seeker's home state or both; and the Remote-only use of the seeker's state (SP5 open item 2, below).

### Working in the US from abroad (`international.md`)

- Spec 8.5: wording review.
- The draft adds: confirm each linked official page is current before publishing. The links were written from the agent's knowledge and not re-opened.

### Subprocessors (`subprocessors.md`)

- Spec 8.5: SCCs per vendor.
- The draft adds: whether each vendor is a service provider or processor on its current terms. Regions and DPA status marked "To confirm" are founder items for the `legal.gdpr` gate.

## Section 13 questions

### §13 question 1

Is Explore&Earn a "third party" under 820 ILCS 112/10(b-25) and Cal. Lab. Code § 432.3(c), and an "employment agency" under N.Y. Labor Law § 194-b? Do the changes in 2.1 cover it?

### §13 question 2

Given the fit score, paid invites, and operator-built listings, is Explore&Earn an employment agency under Title VII or any launch state's licensing law, or a farm labor contractor under 29 U.S.C. § 1802(7)?

### §13 question 3

Is a 24-hour filing commitment sound under 18 U.S.C. § 2258A(a)? Does the preservation design meet (h)(2), (h)(3) and (h)(6)? What may the reporter view?

### §13 question 4

Is the label and disclaimer in section 9 adequate under section 5 of the FTC Act and the launch states' laws, and should housing paid directly be shown the way proposed?

### §13 question 5

For the launch destinations' states, what are the lodging and meal credit limits and consent rules, and is the warning wording right?

### §13 question 6

With visibility as an opt-in, is pool access a "sale" under the CCPA or any other state law, and does any data-broker registration apply?

### §13 question 7

Is the two-question display the right line under 8 U.S.C. § 1324b, and may the product store visa type at all? The product line the founder set on 2026-11-12 is that hosts see only "authorized" or "needs sponsorship".

### §13 question 8

When a fraudulent host obtains applications, which state breach-notification laws apply, and what must the notice say?

### §13 question 9

What do Colorado SB 26-189, Illinois HB 3773, the California regulations and New York City Local Law 144 each require of a ranking tool that never rejects? Colorado was checked at https://leg.colorado.gov/bills/sb26-189 on 2026-11-17 (Signed Act dated 2026-05-14, chapter 131). Illinois, California, and New York City were not re-checked that day. The launch gate is automated hiring tools compliance, replacing SB 24-205 (SP8 spec 8.9).

### §13 question 10

Is Explore&Earn a covered platform at launch, and after Community ships? (TAKE IT DOWN Act.)

### §13 question 11

Lawful bases, transfer mechanism, representatives, and whether to accept EU and UK seekers at launch at all. (GDPR and UK GDPR.)

### §13 question 12

Arbitration and class waiver: yes or no? Is the liability cap enforceable in the launch states? Do automatic-renewal laws apply to host subscriptions?

### §13 question 13

Are these answers "consumer reviews" under 16 CFR part 465, and are the removal reasons neutral enough? ("As described".)

## Questions the specs add

These are the items SP8 plan Task 25 puts in this packet besides the section 13 list.

- **SP8 spec 8.5, per draft.** Terms: governing law and venue; arbitration. Host Terms: refund policy; auto-renewal notice rules by state. Privacy Policy: GDPR lawful bases and transfer mechanism; whether fit scores and host notes belong in access responses. Fit-score notice: Colorado SB 26-189, Illinois HB 3773, California's automated-decision regulations, and NYC Local Law 144.
- **SP5 open item 2.** The fit score's Remote use of the seeker's state is work-location eligibility against the listing's "States the worker may live in" field. Counsel keeps or drops that use. The input allowlist is SP5 spec 8.3.
- **SP6 open item O4.** Boost and pack refund wording: non-refundable once started; refunded in full if it cannot start.
- **SP8 spec section 13.** 7-year billing retention; redaction of shared applications on deletion; fit scores in access responses; whether NYC Local Law 144, Colorado SB 26-189, Illinois HB 3773, or California's automated-decision regulations requires a bias audit before launch.
