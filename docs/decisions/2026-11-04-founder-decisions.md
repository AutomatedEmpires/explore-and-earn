# Founder decisions — 4 November 2026

**Status:** approved by the founder on 4 November 2026, in response to the repository integrity review.

**Authority:** these decisions override `docs/v1/*` and the 3 November 2026 product design wherever those documents disagree with this file. Where this file is silent, the product design remains the build spec, and `docs/v1` still applies only where the product design is also silent.

**This file does not mean the features are implemented.** It records product rules. Implementation status is in the sections below and in GitHub issues.

## Decisions

### FD-1 · One account, one role

A person registers as a seeker or a host. That choice is the account's only primary type. Seekers use the seeker experience. Hosts use the host workspace. Host staff can have different permissions inside that workspace. Those permissions are not extra primary account types. Operator access is a separate privileged authorization, not a second role on a seeker or host account.

The earlier V1 rule that one account can be both seeker and host is withdrawn.

The foundation code already refuses a second account type after the first is set. That behavior matches FD-1. No dual-role switch should be added.

### FD-2 · Resume

The structured Explore&Earn profile is the canonical resume. Seekers can upload a resume so the product can suggest profile fields. They review and correct every extracted field before it is saved. They can also build and edit the profile by hand, including experience, education, skills, certifications, and the other qualifications in the product design.

Presentation stays with the product design where it still fits: Classic and Compact generated PDFs. There are no multiple tailored resume versions. An application freezes the generated representation that was current at submit time.

**The uploaded file is an import source only.** It is not sent to employers. Employers receive the Explore&Earn-generated applicant profile or resume, limited by the seeker's application and privacy controls.

This replaces the product-design sentence that a seeker can upload their own PDF *instead of* a generated resume, if that sentence meant the original file is the employer attachment.

### FD-3 · Housing and meals

A published listing cannot leave housing or meals unknown, blank, or implied. The host chooses the arrangement explicitly, including whether it is offered and the cost or included terms the product design already requires. Incomplete sections stay on the draft (or another unpublished state). The product must not invent housing or meal facts.

### FD-4 · Subscription badge versus business verification

The host badge that follows an active paid subscription means only that: an active Explore&Earn subscription, with the honest "host since" date. It is not proof of legitimacy, safety, credentials, or trust.

Business identity verification, if kept, needs different words and a different visual treatment. Paying does not skip fraud checks and does not create trust by itself.

### FD-5 · Interviews

Built-in interview scheduling is in the approved product. It is part of the hiring pipeline, notifications, and applicant workflow. It is not an optional future integration. It is not implemented yet. It belongs to the host-hiring work (SP5).

### FD-6 · Monthly prices

Approved monthly prices:

| Tier | Monthly price |
|---|---:|
| Starter | $99 |
| Professional | $299 |
| Enterprise | $599 |

These replace every earlier V1 price proposal, including any free Starter allowance.

Entitlements that the 3 November product design already states, and that this decision does not change, stay in force:

- Annual price is 10× the monthly price ($990 / $2,990 / $5,990).
- Active listing slots 2 / 10 / 30.
- Team seats 1 / 5 / 15.
- Invite credits per month 10 / 50 / 150.
- Extra listing slot per month $39 / $29 / $19.
- Analytics is the same on every tier.
- Boost $49 / 7 days, $79 / 14 days, $99 / 28 days.
- Announcement packs $49 / $99 / $149 for 1 / 3 / 5 per month.

Extra invite packs and extra seats still have no approved price. The product design left those for a later decision. They are not approved by FD-6.

`src/modules/billing/plans.ts` on the SP2 integration branch already stores the monthly prices and the entitlements above. That code is not permission to charge cards. Live billing stays off.

### FD-7 · Founding hosts

Clarified by the founder on 4 November 2026, after the first writing of this file.

The customer we charge is the host organization: the organization that posts jobs. Staff seats are not separate customers and do not each qualify.

The cohort is the first 100 host organizations to **sign up**, in signup order. It is not the first 100 to pay. Organization number 101 never receives the discount, even if an earlier organization has not subscribed yet. An organization inside the first 100 still receives it when that organization later starts a paid subscription. Signup means creating that host organization, not a staff member joining one that already exists.

One organization gets one discount. The interval chosen on the first paid subscription fixes the shape:

- **Start on monthly:** 50% off the monthly price for the first six subscription months, then the regular monthly price. A move to a higher or lower monthly tier inside those six months keeps the 50% on the new tier's monthly price. The six months do not start over.
- **Start on monthly, then switch to annual:** the annual discount does not apply. There is no fresh 50% off an annual term in month six, or at any later switch.
- **Start on annual:** 50% off the first annual term (the documented annual price, 10× monthly), then the regular annual price. Switching from annual to monthly does not grant a new six-month monthly discount.

The discount is available on Starter, Professional, and Enterprise. Annual Starter follows the same founding rules as annual Professional and annual Enterprise. There is no tier-specific exception.

The six-month clock begins when the first qualifying paid subscription activates. It does not begin on the host registration date. Registration only decides whether the organization is inside the first 100. The annual term likewise begins at that first paid activation.

After the introductory period, the regular rate for the current tier and interval applies.

The server decides cohort membership from signup order and stores one discount shape per organization. It must refuse organization 101, a second introductory period after an interval change, and a price that does not match the rule above.

**Superseded and disabled:** the 3 November offer of 90 days free, then 30% off for life. The coupon id `founding_30_forever` in the SP2 billing code is that withdrawn offer. It must not be seeded, shown, or applied to a new subscription. It stays in the code only so the old tests remain identifiable until a later billing change replaces it. That replacement is approved as a future implementation and is not authorized by this document. Do not collect payments until the ordinary billing, security, and testing gates are met.

### FD-8 · Browse by State

Browse by State is its own discovery surface. It does not replace Map.

Map stays host-location pins, with the category icon, remote jobs pinned at the host's location, clustering only as a zoom behavior, and a host preview.

Browse by State is an original Explore&Earn map of the United States. Choosing a state opens that state's listings from the canonical listing data. Counts come from those listings. A state with none shows an empty state, not a made-up number. It must work with a keyboard and on a phone.

The uncommitted Jobs by State experiment on `integrate/foundation-20261104` uses sample counts, including a sample "31 open jobs" in Wyoming. That experiment must not ship those numbers on a seeker-facing page. It can be reused only as interaction structure, with live counts.

### FD-9 · Launch

Public launch requires the full approved product design, as amended by this file. A smaller public release is not authorized.

Building Foundation, then SP2 through SP8, in order, is still the way the work is done. Previews and internal testing are allowed. Phased development is not a public launch.

Nothing in FD-9 adds scope beyond the product design plus this file.

## AgentOps handoff

Agents start here, then the product design, then `docs/v1` only for topics this file and the product design do not cover.

Do not merge pull requests #26, #27, or #32 unless the founder says so. Do not start SP3–SP8. Do not turn on live billing. Do not show sample Browse-by-State counts as live jobs. Do not treat `founding_30_forever` as the current founding offer. The six-month clock starts at the first paid subscription activation, not at host registration. Annual Starter uses the same founding rules as the other annual tiers. Public launch requires the full approved scope. `main` has no application until an integration pull request is merged.

## What these decisions do not do

- They do not merge pull requests #26 or #27.
- They do not start SP3–SP8 implementation.
- They do not turn on live Stripe, or change Clerk, Supabase, Vercel, or DNS.
- They do not delete branches, worktrees, or the 4 November recovery archive.

## Implementation compatibility

| Decision | Code today | Change required before the feature is real |
|---|---|---|
| FD-1 | Account type is set once and a second type is rejected | None for the primary type. Do not add a seeker/host switch. |
| FD-2 | Resume studio is not built (SP4 not started) | Import pipeline must not attach the original file to an application. |
| FD-3 | Listing content uses an explicit provided / not-provided housing and meals choice. Publish checks belong to SP2. | Confirm publish stays blocked while either section is incomplete. Do not add an Unknown value. |
| FD-4 | SP2 has both a subscriber "host since" badge and a separate business-verification flow | UI copy must not call the subscription badge "verified" in the trust sense. |
| FD-5 | Not built | SP5. Not a third-party calendar placeholder. |
| FD-6 | Prices and slot/seat/credit numbers match §16 in `plans.ts` | Do not present them as a live checkout until billing review. |
| FD-7 | `FOUNDING_COUPON_ID` is `founding_30_forever` (30% off, not 50% for a limited term, and not tied to signup order) | Replace the coupon, reserve the first 100 host organizations at signup, lock one discount shape, let a monthly tier change keep the discount, and refuse a monthly-to-annual discount restart. Update the tests before founding checkout. |
| FD-8 | Sample choropleth, uncommitted, not on GitHub | Rebuild against listing counts during discovery. Do not merge the sample data. |
| FD-9 | `main` has no application. Integration PRs are open. | Public launch stays blocked until SP2–SP8 and the launch gates are actually done. |
