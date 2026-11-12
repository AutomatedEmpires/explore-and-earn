# Legal fields

Issue [#128](https://github.com/AutomatedEmpires/explore-and-earn/issues/128) (EE-F4). Figma only. No UI code.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A
- **01 Host, section "Legal fields":** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=96-14106
- **02 Seeker, section "Legal fields":** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-10306
- **Frames:** 35 screens (18 host, 17 seeker), plus one note on each page. Page 03 Hiring is not touched.
- **Status:** not approved. The lead audits these first, then asks the founder.

The source is `docs/legal/2026-11-legal-review.md` on `integrate/sp2-20261104`: sections 2.1, 2.4, 2.6 and 9, and P0 items 8, 10, 14, 15, 17 and 25.

## How the frames are built

- New frames copy the approved frames on the same page, then add the fields. The approved frames themselves are unchanged.
- Components come from page 00 System: Input, Select, Checkbox, RadioGroup, Textarea, Button, Sheet, ErrorState, CategoryBadge, TopBar, BottomNav, Sidebar and the icons. The cards are the #101 JobCard.
- Every paint outside a component instance is bound to the Color collection. A read-back of both sections found 0 unbound paints, and every text layer uses Figtree.
- Body copy is Figtree Regular 16/24, bound to `text/16`, as on #62. Field labels and legends use `text-14/semibold`, the same style as the Input label.
- Buttons are `lg` (48px) or `md` (44px). No button uses the Disabled state.
- Host frames are named `<width> · Legal fields · …`. Seeker frames are named `Legal fields · … · <width>`. Each follows its page's existing naming.

## What each legal item became

| Review item | Where | Frames |
|---|---|---|
| 2.1.1 Benefits and other compensation, required, None allowed (P0-8) | Builder Pay step: a checklist (Health insurance, Paid time off, Retirement plan, Bonuses, Tips, None) and "Tell guests more". Seeker detail: a "Benefits" line beside pay | Host Pay, Workspace. Seeker Detail |
| 2.1.2 Colorado closing date (P0-8) | Builder Where step, shown only for a Colorado location: "On a date" with a date, or "Hiring continues until filled" | Host Where · Colorado, its error, Workspace · Colorado closing date |
| 2.1.4 and 9 publish attestations (P0-10) | Last step, "Before you publish": two required checkboxes. The text is word for word | Host Review, Confirm error, Workspace |
| 2.4.1 Minimum wage warning counts deductions (P0-14) | Review and Workspace. It is a warning, not a block, and the listing goes to review | Host Minimum wage warning, Sent for review |
| 2.4.2 Three housing facts (P0-15) | Builder Housing step. On the seeker detail they are two lines under the housing line | Host Housing, Workspace. Seeker Detail |
| 2.4.3 Structured deductions (P0-15) | The housing and meal cost become amount + period + "Taken from pay / Paid to us separately". "Other deductions from pay" has an "Add a deduction" row on the Pay step. Review lists "Hours and deductions" | Host Pay, Housing, Meals, Review, Workspace |
| 9 Pay after housing and meals (P0-25) | Under the pay line on the card and the detail, with "How we work this out" | Host Review, Workspace. Seeker Seek, Detail, How we work this out |
| 2.6.1 Date-of-birth age screen (P0-17) | Replaces the "I'm 18 or older" checkbox after Continue with Google | Seeker Account · date of birth, with error, refused and offline |

## The pay line (section 9)

Section 9's example is used unchanged on the host side. The sample job is $18–$20 an hour for 40 hours a week, less a shared room at $110 a week and meals at $50 a week, both taken from pay.

On the card and the detail page, under the host's pay line:

> **About $560–$640 a week after housing and meals**
> Before taxes. Based on 40 hours a week at $18–$20 an hour, less $160 a week for housing and meals.
> How we work this out

The seeker side uses the seeker page's own listing, Lodge housekeeper at Kettle Ridge Lodge. It pays $22 an hour for 40 hours, less the cabin at $12 a night ($84 a week). Meals are included at no cost.

> **About $796 a week after housing and meals**
> Before taxes. Based on 40 hours a week at $22 an hour, less $84 a week for housing and meals.

The "How we work this out" panel is a bottom sheet at 390 and a side panel at 768 and 1440:

> This is an estimate from details the employer gave us. It is not an offer or a guarantee of hours or pay.
> - Pay: $22 an hour × 40 hours = $880 a week
> - Housing, deducted from pay: −$84 a week ($12 a night)
> - Meals: included, nothing deducted
> - **About $796 a week before taxes**
>
> Taxes and any other deductions will lower what you receive. Tips, overtime and bonuses are not included. Ask the employer to confirm hours and deductions in writing before you accept.

None of these words appear anywhere: "take-home", "net pay", "you'll earn", "you'll save", "guaranteed", or any comparison with rent.

**When the line is hidden:**

- There are no weekly hours.
- Pay is by the day, the trip or the season, with no weekly figure. The Deckhand frame says "No weekly estimate. This job pays by the day. Ask Harbor and Co how many days a week you will work."
- A deduction has no amount.
- The job is a contractor job.
- The result is under the state minimum. The host sees the warning, and guests see no estimate.
- Nothing is taken from pay. This rule is a design choice; see Gaps.

When housing is paid separately, section 9's line "Housing: $120 a week, paid separately" applies, and that amount is not subtracted. No sample listing has this case, so it is not drawn.

**Minimum wage warning**, word for word from 2.4. The frames use 20 hours a week, so the math is ($360 − $160) ÷ 20 = $10.00 an hour. Montana's minimum from January 1, 2027 is $11.20 (Montana Department of Labor and Industry, checked 2026-11-11).

> **Pay may be below the minimum wage**
> After housing and meals, this works out to $10.00 an hour, below the $11.20 minimum in Montana. Deductions for housing and meals are limited by law.
> You can still publish. We will check this listing before it goes live.
> [Change hours or costs]

The page's main button becomes "Publish for review". The ending is "Housekeeper is in review".

## Samples

- **Host:** a second Pinecrest Lodge job, Housekeeper, in West Yellowstone, MT, from May 18 to Sep 12, 2027.
  - Pay: $18 to $20 an hour, 40 hours a week.
  - Benefits: Paid time off and Bonuses ("One paid day off a month. A $500 bonus if you stay to Sep 12.").
  - Housing: a shared room at $110 a week, taken from pay. Living there is the worker's choice. There is a $100 deposit, given back within 14 days of move-out. If the job ends early, housing ends after 7 days.
  - Meals: $50 a week, taken from pay.
  - The Colorado frames move the location to Estes Park, CO and close applications on Apr 15, 2027.
- **Seeker:** the four listings from #63. Only Lodge housekeeper shows a pay line.
  - Lodge housekeeper: benefits are tips and a $500 bonus to Oct 2. Living in the cabin is the worker's choice, there is no deposit, and housing lasts 7 days if the job ends early.
  - Deckhand: no benefits. Living on the boat is part of the job, there is no deposit, and housing ends the same day.
  - The Seek copies correct the card housing lines to match the detail page and the #63 table. Lodge housekeeper shows Cabin, $12 a night, Meals included. Deckhand shows Bunk on the boat, Included. Ranch hand shows Bunkhouse, Free.

## Frames

Prefix every node with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

### 01 Host

| Frame | Node |
|---|---|
| Legal fields note | [108-17591](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=108-17591) |
| 390 · Legal fields · Where · Colorado | [97-14580](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=97-14580) |
| 390 · Legal fields · Where · Colorado · Error | [97-14672](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=97-14672) |
| 390 · Legal fields · Pay | [96-14107](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=96-14107) |
| 390 · Legal fields · Housing | [97-14226](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=97-14226) |
| 390 · Legal fields · Meals | [97-14483](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=97-14483) |
| 390 · Legal fields · Review | [98-14695](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=98-14695) |
| 390 · Legal fields · Review · Confirm error | [98-14899](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=98-14899) |
| 390 · Legal fields · Minimum wage warning | [98-14976](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=98-14976) |
| 390 · Legal fields · Sent for review | [98-15133](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=98-15133) |
| 390 · Legal fields · Review · Dark | [107-17389](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=107-17389) |
| 768 · Legal fields · Workspace | [103-15223](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=103-15223) |
| 1440 · Legal fields · Workspace | [103-16022](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=103-16022) |
| 768 · Legal fields · Workspace · Colorado closing date | [104-16465](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-16465) |
| 1440 · Legal fields · Workspace · Colorado closing date | [104-17061](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-17061) |
| 768 · Legal fields · Workspace · Minimum wage warning | [104-16647](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-16647) |
| 1440 · Legal fields · Workspace · Minimum wage warning | [104-17242](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-17242) |
| 768 · Legal fields · Workspace · Confirm error | [104-16915](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-16915) |
| 1440 · Legal fields · Workspace · Confirm error | [104-17508](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=104-17508) |

The 768 and 1440 workspaces carry every new field in one form, with the card and pay line in "What guests see". The other 768 and 1440 frames show one section of that workspace in a given state. Offline and autosave reuse the approved builder frames: Offline at [43-13650](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13650) and the "Saved at 6:14 PM" line. When the warning does not apply, the success ending is the approved In review frame, [43-13314](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314).

### 02 Seeker

| Frame | Node |
|---|---|
| Legal fields note | [117-12030](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=117-12030) |
| Legal fields · Seek · results · 390 | [112-10307](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-10307) |
| Legal fields · Seek · results · 768 | [112-10823](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-10823) |
| Legal fields · Seek · results · 1440 | [112-11289](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-11289) |
| Legal fields · Detail · guest · 390 | [112-11755](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-11755) |
| Legal fields · Detail · guest · 768 | [112-11809](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-11809) |
| Legal fields · Detail · guest · 1440 | [112-11870](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-11870) |
| Legal fields · Detail · guest · 390 · dark | [113-11638](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11638) |
| Legal fields · Detail · no estimate · 390 | [113-11668](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11668) |
| Legal fields · How we work this out · 390 | [113-11452](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11452) |
| Legal fields · How we work this out · 768 | [113-11517](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11517) |
| Legal fields · How we work this out · 1440 | [113-11578](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11578) |
| Legal fields · Account · date of birth · 390 | [114-11730](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-11730) |
| Legal fields · Account · date of birth · 768 | [114-11791](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-11791) |
| Legal fields · Account · date of birth · 1440 | [114-11857](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-11857) |
| Legal fields · Account · date of birth · error · 390 | [114-11923](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-11923) |
| Legal fields · Account · date of birth · refused · 390 | [114-11988](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-11988) |
| Legal fields · Account · date of birth · offline · 390 | [114-12023](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=114-12023) |

**The date of birth step** asks "What is your date of birth?", with Month, Day and Year fields. The hint is "We ask everyone who makes an account. We keep only the year." It does not mention an age, and neither does the refusal: "We can’t make you an account. You can still look at jobs without an account." That screen has two ways out, Back to jobs and Read the Terms. A good date continues to the approved Apply · ready frame, [45-8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067). During sign-up the top bar shows only the wordmark and Community.

## Tap counts

Typing is not counted.

| Flow | Before | After | Why |
|---|---|---|---|
| C. Publish a first listing, phone | 27 | 35 | 1 benefits pick, 4 housing answers, 1 meals answer and 2 publish checks. Colorado adds 1 more |
| C. Publish a first listing, desktop | 6 | 14 | The same 8 answers |
| B. First application | 6 | 9 | The month takes 2 taps and the day and year 1 each, in place of the 1-tap checkbox. The target is 12 |

No answer is picked in advance, because each one is the host's own statement. The frames show them answered.

## Gaps

1. **JobCard has no slot for the pay line.** The lines sit directly under the card, the way #63 placed couples and freshness. The code needs a `payEstimate` prop on `JobCard`, and the Figma component needs the matching slot. That is a page 00 change, so it is not made here.
2. **Other deductions and the label.** Section 9 subtracts every deduction marked "deducted from pay", but the label says "after housing and meals". If a listing also takes a uniform fee, the label is incomplete. The samples have no other deduction. This needs a wording decision with counsel.
3. **No line when nothing is taken from pay.** Section 9 does not cover this case. These frames hide the line, because "less $0" adds nothing. The lead or counsel should confirm.
4. **No notice component on page 00.** The minimum wage notice is built from tokens: `color/warning-bg`, `color/ink` text and TriangleAlert in `color/warning`, on the 4px grid. It should become a system `Notice`, together with the warning-tone decision in audit 1 (F-2).
5. **Instance overrides that belong in components.** The Checkbox component keeps its label on one line, so the two attestation checkboxes wrap only through overrides (row Hug, label Fill). The date-of-birth year error wraps the same way. Both components should wrap by default.
6. **Line-break helpers that code does differently.**
   - `$18–$20` has a word joiner (U+2060) after the dash, and `($12 a night)` uses no-break spaces, so they do not split across lines.
   - The 390 host Review headline uses a soft line break to fake balanced wrapping.
   - In code: `white-space: nowrap` on money, and `text-wrap: balance` on the pay headline.
7. **The seeker detail at 390 grows from 673 to 973 px.** Pay, the pay line, benefits, dates, housing and meals all stay in the first 844 px. Apply now sits at the fold, behind the bottom tabs. A sticky action bar would fix this, but it is a new pattern that needs approval.
8. **Colorado.** The sample moves the job to Estes Park, CO, as a second Pinecrest Lodge location. The seeker pages have no Colorado listing, so the guest line "Applications close Apr 15, 2027" is not drawn there. Counsel still has to confirm that "Hiring continues until filled" meets C.R.S. § 8-5-201(2)(c).
9. **Minimum wage figures.** $11.20 is Montana's rate from 2027-01-01. The product needs a state minimum-wage table, which is P1 item 9.
10. **Counsel short checks** still open:
    - the label and disclaimer in section 9;
    - the birth-year retention in 2.6;
    - the wording of the minimum-wage warning in 2.4.

    The refusal screen should also be backed by code that does not invite another try with a different year in the same session.
11. **Endings drawn at 390 only:** Colorado error, Sent for review, No estimate, and the date-of-birth error, refused and offline screens. Each key screen has 390, 768 and 1440 frames. Dark mode is drawn for the host Review and the seeker Detail at 390. The other frames use the same bound variables.
12. **Copies differ from the approved frames.**
    - **Seek feeds:**
      - The approved Seek frames show default housing costs ($140, $90 and $60 a week) that do not match the detail page.
      - Their "4 jobs" count wraps one letter per line at 390.
      - The deckhand and ranch covers there are the lake image.
      - The copies fix all three.
    - **Card width:** at 768 and 1440 the copies fix cards at 384px, so the cover fills the card. This leaves the 1440 feed as one 384px column. A grid is not part of this task.
    - **Builder sidebar:** it now runs the full height of the 768 and 1440 builder copies.
    - The approved frames are not edited.
13. **"Benefits and other pay"** is the host-facing label for the statutory "benefits and other compensation".
14. **Not in scope here:** the H-2A and H-2B prompts, the contractor note, the wider wording check, work authorization and the candidate pool. They are other P0 items.
15. **Leftover layers on 01 Host.** Twenty stray TopBar instances sit at (0,0), outside any section, from earlier work (for example 45:13796 and 46:19355). They were not touched.
