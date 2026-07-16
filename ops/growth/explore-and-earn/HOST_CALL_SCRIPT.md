# Explore&Earn Host Call and Permissioned-SMS Script

Last updated: 2026-07-12

## Channel rules

- Call only a public business number, manually, during reasonable local business hours.
- Do not use prerecorded messages, autodialers, spoofed caller ID, or call-list automation.
- State your name, company, and purpose promptly.
- Ask for the person responsible for seasonal recruiting or operations; do not pressure front-desk staff to disclose private details.
- A public number is not permission to text. Ask before sending any SMS and log the affirmative response.
- Honor any “do not call,” “do not text,” or general opt-out immediately and add it to the suppression table.

## Pre-call card

Operator must have:

- company name, local time, public number, website, and source URL;
- the public contact's role, if any;
- one neutral fact from the source and one fit hypothesis;
- two discovery questions that do not assume the company is hiring;
- exact current Founding Host pricing; and
- CRM outcome buttons ready before dialing.

## Gatekeeper opener

> Hi, this is [Name] with Explore&Earn by Automated Empires. This is a brief business-development call. We’re speaking with Farm, Maritime, Remote, and Seasonal hosts about a host-controlled marketplace for place-based work. Who is the right person to ask about recruiting or operations?

If asked for details:

> Hosts create their own opportunities and answer Housing, Meals, and Pay before someone applies. I found [Company] through [public source]. I’m not calling about a copied job listing, and I’m not saying there is a partnership. I’d like to see whether a 15-minute research conversation would be relevant.

If the right person is unavailable, ask for the public business email or best callback time. Do not request a private mobile number.

## Decision-maker opener

> Hi [Name], I’m [Name] with Explore&Earn by Automated Empires. Did I catch you with 60 seconds for why I called?

If yes:

> We’re building a seeker-first marketplace for farms, ranches, maritime operators, lodges, camps, resorts, and other place-based employers. A host publishes its own opportunity and makes Housing, Meals, and Pay clear before an application. I found [Company] through [source] and thought [neutral reason] might make your perspective useful. Are seasonal or recurring hires part of your operation, or is that an incorrect assumption?

If no, request a better public-business callback time or close the record.

## Discovery questions

Use four or five, not the whole list.

1. When does your team normally decide whether it needs seasonal or recurring hires?
2. Which roles are hardest to explain or fill, if any?
3. What questions do candidates repeatedly ask before applying?
4. How variable are Housing, Meals, and Pay by role or season?
5. If housing exists, what would you need to show before feeling comfortable publishing it?
6. Where do current recruiting channels work well, and where do they create extra work?
7. Who owns the accuracy of opportunity details and updates?
8. What screening does your team perform, and what should a platform never imply it performs?
9. Would an applicant profile and on-platform message thread be useful, or do you need candidates routed into an existing ATS?
10. What would make a first listing too burdensome to complete?
11. Do candidates choose opportunities through search, map/location, quick mobile browsing, referrals, or another path?
12. Which parts of a company profile could be reused safely across roles and seasons?

Never ask for confidential applicant data, current employee personal data, unpublished wages, or details the recipient is not authorized to share.

## Fit summary and CTA

> What I heard is [two-point recap]. Explore&Earn may be useful because [fit], but we would need to represent [variable/unknown detail] explicitly rather than make a blanket claim. The next step would be a 15-minute walkthrough of the host-created profile and the Founding Host terms. Would you prefer [time A] or [time B]?

If they ask for a link:

> I can send the official host page by email. Would you also like a text, or email only?

Record their exact channel preference. Do not text unless they affirmatively choose it.

## Permissioned SMS

After verbal or written permission:

> Hi [Name], it’s [Name] from Explore&Earn, following up by text as requested. Host overview: [official URL]. I have [time A] or [time B] for a 15-minute walkthrough. Reply STOP and I won’t text again.

## Objections

### “We already hire elsewhere.”

> That is not a problem. We’re testing whether a host-controlled Discovery Card can reduce repeated Housing / Meals / Pay questions or expectation gaps for people who choose by place. We are not asking for exclusivity. Where does your current channel work well, and what would a complementary channel need to prove to earn a small test?

### “Why should we maintain another listing?”

> It should not be another copy. We would guide one original host profile and one opportunity, reuse company-level details, and preserve variable or unknown fields. What would need to carry forward or connect to your current process for the test to be manageable?

### “Are you better than [platform]?”

> I would not make that blanket claim. A broad board may be stronger on volume; a category board may be stronger on specialized inventory or credentials. Explore&Earn is testing whether place, Housing, Meals, Pay, evidence, and a focused discovery flow can be clearer for this kind of seeker. Is that a gap you see today?

### “Housing varies.”

> Then the honest answer is “varies.” We can capture the options, cost, availability, dates, and what still needs confirmation instead of flattening it into a promise. Would role-level or season-level variation match how you operate?

### “We are not ready.”

> Understood. I will not create a placeholder listing. Is there a month when planning starts, or would you prefer no further contact?

### “What does this cost?”

> Founding pricing is Starter $149 monthly or $1,490 annually, Professional $299 or $2,990, and Enterprise $599 or $5,990. Annual is two months free. The locked rate lasts while the qualifying subscription stays active and is forfeited on cancellation. I can walk through the exact entitlements, but I can’t invent a custom discount, trial, or refund term.

### “How are applicants vetted?”

> We should be precise: Explore&Earn does not currently promise that every applicant is background-checked or independently verified. The platform gives you profiles, applications, messaging, reporting, and your own review workflow. Your team remains responsible for lawful screening and hiring. If you require a specific check, I’ll record that as product feedback rather than promise it exists.

## Call outcomes

Log exactly one primary outcome:

- `wrong_contact` — public alternative route supplied or no route;
- `no_answer` — next attempt date, maximum two attempts in the wave;
- `not_now` — recipient-specified month, then stop;
- `not_a_fit` — reason, no additional sequence unless invited;
- `suppressed` — channel(s), exact request, and effective timestamp;
- `send_information` — permitted channel and content requested;
- `fit_call_booked` — date, attendees, needs summary;
- `pilot_candidate` — only after explicit interest and qualification.

## Voicemail

> Hi [Name], this is [Name] with Explore&Earn by Automated Empires at [callback number]. I’m reaching out about a host-controlled marketplace for place-based seasonal opportunities. I found [Company] through [source]. This is not a claim of partnership and I have not copied a job listing. I’ll send one short email if a public address is available. If you would rather not hear from us, tell me at [callback/email] and I’ll suppress future outreach. Again, [Name] at [number].

Do not leave more than one voicemail in the first-wave sequence.

## Category-specific follow-up

- **Farm:** “Is this paid employment, education/internship, volunteer service, exchange, or something else—and which terms vary by season?”
- **Maritime:** “Is the opportunity licensed vessel work, unlicensed crew, fisheries, shore-side marina/trade work, or waterfront hospitality?”
- **Remote:** “What geography, timezone, travel, schedule, equipment, and work-authorization limits make `remote` accurate?”
- **Seasonal:** “Which season dates, access/transport, Housing, Meals, and Pay details must be understood before an application is useful?”

These are qualification questions. Do not infer the answer from a competitor listing or search result.
