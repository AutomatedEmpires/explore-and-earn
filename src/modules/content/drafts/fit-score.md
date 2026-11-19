---
title: Fit score notice
counselQuestions: |
  - Colorado SB 26-189 (Automated Decision-Making Technology; checked at https://leg.colorado.gov/bills/sb26-189 on 2026-11-17): what does it require of a ranking tool that never rejects, and from when (SP8 spec 8.5; legal review §2.8)?
  - Illinois HB 3773: what notice is required when this score is shown to a host, and does it reach a tool that only ranks (not re-checked on 2026-11-17)?
  - California's automated-decision regulations (Civil Rights Council and the privacy agency): what do they require of this score (not re-checked on 2026-11-17)?
  - NYC Local Law 144: is a bias audit required before launch, and is this notice enough for the notice requirement (not re-checked on 2026-11-17)?
  - Any other state law counsel identifies, and whether to turn the score off in any state through `hiring.fit_disabled_states`, by the listing's state, the seeker's home state, or both (SP5 open item 2).
  - May the score use the seeker's state on a Remote listing as work-location eligibility (section 3)? The founder and counsel keep or drop that use (SP5 open item 2).
---

Draft for counsel review, not legal advice. This draft stays a draft until a lawyer signs it. It is not published. Citations are to the November 2026 legal review unless a spec is named.

## 1. What the fit score is

When you apply for a job or choose to be found by hosts, Explore&Earn may show the host a fit score: a number that says how closely what you told us matches what the listing asks for. Hosts use it to rank the candidate pool and to sort applicants. It ranks pools and sorts applicants only.

The fit score never automatically rejects anyone, and it does not decide who is interviewed, offered a job or hired. A person at the host makes every hiring decision. The host can always see every applicant, whatever their score (product design section 11.2; legal review §2.8).

## 2. What it uses

The score uses only job-relevant facts you gave us (product design section 11.2; SP5 spec 8.3):

- your occupations and job categories, compared with the listing's;
- your availability, compared with the listing's dates;
- your skills, compared with the skills the listing names;
- the certifications the listing requires, and whether yours are current;
- your work-authorization answer, "authorized" or "needs sponsorship", compared with whether the listing sponsors;
- your minimum pay, compared with the listing's pay;
- whether you are willing to relocate, and the states you prefer.

Each factor has a fixed weight per job category, the same for every host. The "Why a good fit" explanation the host sees is written from templates, such as "Available for your full dates" or "8 of 10 listed skills". It is not written by AI. Your minimum pay and the states you prefer stay off that explanation, except a matching state.

## 3. Remote jobs

For a Remote listing, and only there, the score also checks the state you live in against the states the listing says its workers may live in. This is work-location eligibility: whether the employer can hire someone who lives where you live. For a job on site, the state you live in is never read; only your willingness to relocate and the states you prefer count (SP5 spec 8.3).

## 4. What it never uses

It never uses protected traits, photo, name, age or gender. It also never uses your date of birth, national origin, visa type, disability, race, religion, or any other protected characteristic, and hosts cannot filter or sort candidates by any of them (legal review §2.2 item 3).

## 5. Your choices

You can ask for a person to review your score through the Help center. You can correct the facts the score uses in your profile at any time, and the score follows. If you don't want to be found by hosts at all, turn off candidate-pool visibility; your applications are still sorted by the score.

Where a law requires it, the score is turned off for listings in that state or for seekers who live there, and hosts see applicants in the order they applied.

## 6. Records

We keep each score with its explanation, so it can be explained to you and reviewed. Your data download includes your fit scores and their explanations (SP8 spec 8.1). Whether every score's inputs must also be kept for an audit is with counsel (legal review §2.8).
