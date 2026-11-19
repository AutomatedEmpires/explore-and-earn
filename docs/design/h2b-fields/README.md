# H-2B fields

Issue [#201](https://github.com/AutomatedEmpires/explore-and-earn/issues/201) (EE-F5), from the PR 190 review (should-fix 4). Figma only. No UI code.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A
- **01 Host, section "H-2B fields":** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=215-23546
- **02 Seeker, section "H-2B fields":** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20362
- **Status:** not approved. Posted on #201 for the founder's one-line approval.

The source is 20 CFR 655.41(b) (eCFR, current to 2026-11-17), `docs/legal/2026-11-legal-review.md` section 2.3 item 3, and `job.h2b` in `src/modules/listings/content.ts` on `integrate/sp2-20261104`.

## How the frames are built

- New frames copy the approved Job step ([43-12041](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12041)), the 768 and 1440 workspaces ([43-13984](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13984), [43-14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603)) and the guest detail ([176-13308](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=176-13308), [45-7566](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7566), [45-7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615)). The approved frames are unchanged.
- Components come from page 00 System: Textarea, Input, Select, Notice, Button and the icons Compass, Briefcase, Clock and FileText.
- Read-back of both sections: 0 unbound paints outside instances, Figtree only, no text under 14 px, no image fills.
- Host frames are named `<width> · H-2B fields · …`. Seeker frames are named `H-2B fields · … · <width>`.

## Frames

Prefix every node with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

| Page | Frame | Node |
|---|---|---|
| 01 Host | H-2B fields note | [220-24877](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=220-24877) |
| 01 Host | H-2B fields · 655.41(b) field map | [220-24886](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=220-24886) |
| 01 Host | 390 · H-2B fields · The job | [215-23547](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=215-23547) |
| 01 Host | 390 · H-2B fields · The job · Empty | [215-23710](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=215-23710) |
| 01 Host | 390 · H-2B fields · The job · Error | [215-23897](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=215-23897) |
| 01 Host | 768 · H-2B fields · Workspace · The job | [217-24023](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=217-24023) |
| 01 Host | 1440 · H-2B fields · Workspace · The job | [217-24484](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=217-24484) |
| 01 Host | 1440 · H-2B fields · Workspace · The job · Error | [217-25079](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=217-25079) |
| 02 Seeker | H-2B fields note | [224-22118](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=224-22118) |
| 02 Seeker | H-2B fields · Detail · guest · 390 | [223-20363](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20363) |
| 02 Seeker | H-2B fields · Detail · no terms added · 390 | [223-20530](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20530) |
| 02 Seeker | H-2B fields · Detail · guest · 390 · dark | [223-20667](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20667) |
| 02 Seeker | H-2B fields · Detail · guest · 768 | [223-20796](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20796) |
| 02 Seeker | H-2B fields · Detail · guest · 1440 · side panel · scrolled to H-2B job terms | [223-20970](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=223-20970) |

When Visa sponsorship is not H-2B, the Job step is the approved frame 43-12041 and the detail is the approved 176-13308. Nothing H-2B shows.

## Field map

| Builder field | Guests see | 655.41(b) item | Schema field | Limit |
|---|---|---|---|---|
| Travel to the job and home | Travel to the job and home | (b)(10) transportation and subsistence to the job and back home, per 655.20(j)(1) | `job.h2b.transportation` | 1,000 |
| Tools and equipment | Tools and equipment | (b)(11) tools, supplies and equipment at no charge, if applicable | `job.h2b.tools` | 1,000 |
| Three-fourths hours guarantee | Hours guarantee | (b)(13) a summary of the three-fourths guarantee in 655.20(f) | `job.h2b.threeFourthsGuarantee` | 1,000 |
| State Workforce Agency office | Apply through the state | (b)(14) apply at the nearest SWA office, with its contact information | `job.h2b.swaContact` | 500 |
| Job order number | Apply through the state | (b)(14) the job order number, if applicable | `job.h2b.jobOrderNumber` | 60 |
| Attestation: the Review warning "Check your H-2B job order" (from #121) | Nothing | 655.41(a) terms no less favorable than those offered to H-2B workers | `acknowledged_warnings`: `h2b_job_order` | None |

**Already on the form:** (1) employer name and contact, (2) area of work (`where`), (3) duties, requirements, hours and dates (`job.description`, `job.responsibilities`, `job.requiredQualifications`, `when.dates`, `when.weeklyHours`), (4) full time and openings (`basics.schedule`, `basics.openings`), (5) overtime yes or no (`pay.overtime`), (7) wage (`pay.*`), (8) board and lodging (`housing`, `meals`), (9) deductions (`pay.deductions` and costs taken from pay).

**Not on the form:** (5) the overtime rate, (6) on-the-job training and (12) daily transport to the worksite. All three are "if applicable" items, and the legal review list leaves them out. The lead or counsel decides.

## Words

**Builder, Job step.** Shown only when Visa sponsorship is H-2B, as one bordered group under the visa choice.

- Visa sponsorship hint: "A listing here does not replace the recruiting steps the Department of Labor requires." (the code's text).
- Heading: "Your H-2B job order". Intro: "Copy these from your job order. Guests see them in an H-2B section on your listing. Each one is optional."
- Notice (info): "Match your job order" / "Pay and terms here must be at least as good as your H-2B job order. You confirm this when you publish." Button: "Read the rule" (20 CFR 655.41 on eCFR).
- Hints, in order: "Optional. How you provide or pay for the trip here and the trip home, with meals on the way." / "Optional. The tools, supplies and equipment you give workers at no charge." / "Optional. A short summary of the guarantee in your job order." / "Optional. The office where workers can also apply, with its phone number or website." / "Optional. As it appears on your job order."
- Error, over the limit: "Use 60 characters or fewer. This has 74. Enter just the number, like MT 4417260." Above Next: "Fix the job order number before you publish."

**Guest detail.** A section "H-2B job terms" after Perks.

- Intro: "[Host] also hires through the H-2B visa program. It gave us these terms from its job order."
- One row per filled field: icon, label, the host's own words. The state row reads "You can also apply at the state job office: [office]. Job order [number]."
- Last line: "These are the employer’s words. Ask [Host] to confirm them in writing before you accept."
- No terms filled in: "[Host] also hires through the H-2B visa program. It hasn’t added terms from its job order. Ask it about travel, tools and guaranteed hours before you accept."

No page says or implies that a listing counts as H-2B recruitment (legal review 2.3 item 1).

## Accessibility

- Every field has a visible label. Optional fields have no star, and each hint starts with "Optional."
- The error has CircleAlert, a red border and words, never colour alone. Each guest row has an icon and a text label.
- Inputs are 48 px high; "Read the rule" is a 44 px button.
- Contrast, light and dark: text 5.39:1 or more (`color/muted` on `color/bg` is the lowest), input borders 3.42:1 or more. The group border (`color/line`) is decoration; the heading carries the grouping.

## Decisions and gaps for the lead

1. **Textarea error variant.** Page 00 Textarea `State=Error` has a zero-width value layer in the main component, so an error textarea cannot show its text. The error example uses Job order number (Input). The page 00 fix is not made here.
2. **Over the limit.** These fields keep a whole paste and show an error, rather than `maxLength` cutting it, so a job order term is never shortened without the host seeing it.
3. **Switching away from H-2B** hides the group and keeps the answers. Guests see them only while the listing is H-2B.
4. **Placement.** The guest section sits after Perks so the approved order is unchanged. It could move up under Dates and hours.
5. **Wording check.** `listings.flagged_phrases` does not read `job.h2b` today. The ui task should add the five fields to the prose it checks.
6. **Samples.** Kettle Ridge Lodge is drawn as an H-2B employer; the approved detail frames do not say so. Its job runs 141 days, so its guarantee is per 12-week period; the host's 118-day job uses 6-week periods (655.20(f)). Office names are generic and the phone numbers are fictional 555-01xx numbers.
7. **Dark** is drawn for the guest detail at 390. The host frames use the same bound variables.
8. **Taps.** Nothing new is required, so Flow C is unchanged. Each filled field adds one focus tap, up to 5.
9. **Counsel.** All host and guest words here are the agent's own and fall under the `legal.wage_visa` gate.
