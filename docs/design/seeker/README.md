# Seeker screens

Issues [#63](https://github.com/AutomatedEmpires/explore-and-earn/issues/63), [#152](https://github.com/AutomatedEmpires/explore-and-earn/issues/152) (revision for design audit 2) and [#155](https://github.com/AutomatedEmpires/explore-and-earn/issues/155) (fixes for design audit 3). Figma only. No UI code.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A
- **Page 02 Seeker:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=39-2627
- **Frames:** 168. That is 151 screens, 17 prototype copies, and the 18 #128 legal-field frames (kept as that task's record). Each link below opens the frame.
- **Built from:** page 00 System components and variables. Colors are bound to the Color collection. Text uses the scale from 14 to 32 (14, 16, 18, 20, 24, 28, 32); since #155 no text on this page is under 14 px. Body copy is `text-16/regular`; fact lines and labels keep `text-16/semibold` (SE-13).
- **Status:** design audit 3 found 0 blockers. The lead approved flows B (first application), C and D for build under the founder's delegation ([#45](https://github.com/AutomatedEmpires/explore-and-earn/issues/45#issuecomment-6810708880)). Flow A (guest listing) waited on SE3-1, which #155 fixes below. The lead checks the fix before approving flow A.

Prefix every node with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

## What #155 changed, by audit 3 finding

Issue [#155](https://github.com/AutomatedEmpires/explore-and-earn/issues/155). Most fixes are made in page 00 components and reach this page through instances (see D3-1 to D3-8 in the system README). The audit 3 report is not posted, so each row names the check and the known example.

| Id | Check | Fix | Where |
|---|---|---|---|
| SE3-1 | Cover media versus cover size (blocks flow A) | The JobCard cover photo now fills the cover at every card width (D3-3). It was 384x288 inside 520x188, 736x188, 720x188 and 420x188 covers, which left grey bands. Now it is 520x390, 736x552, 720x540 and 420x315, centred and cropped. No screen needed an edit | Seek · results · 1440 [42-3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412), Swipe · card 768 [45-6205](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6205) and 1440 [45-6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310), Swipe · undo 768 [45-6551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6551) and 1440 [45-6665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6665), Detail · guest · 1440 · side panel [45-7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615) and the other 1440 frames that show Seek behind a panel |
| Badge without an icon | The "Sent" status badge (Tone=neutral) | "Apply · sent" and "Application · status" each had two Sent badges: the #152 status badge with its Send icon, and an older one without an icon. The older one is removed, so each frame starts with one Sent badge that has its icon. Badge's `Show icon` now defaults to on (D3-1) | Apply · sent [45-8200](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8200), [45-8256](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8256), [45-8291](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8291); Application · status [45-8587](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8587), [45-8644](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8644), [45-8680](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8680); Prototype · Apply · sent [46-20708](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20708) |
| Text under 14 px | 437 layers: the Chip "Pay" label, BottomNav labels, IconLink counts and the state tile counts | The first three are fixed in their components (D3-4). The six state tile counts ("1", "2") on the tile map use `text-14/bold` | Browse · states · 768 [46-8697](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8697) and 1440 [46-8769](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8769) |
| Target under 44 px | "How we work this out" on every JobCard was 139x36. The Clerk footer links "Sign up" and "Use another email" were 20 px high | Both are now 44 px high (D3-5) | All JobCards; Account · sign in, sign-in error, cancelled and check your email |
| Text clipped | At 320 the search placeholder wrapped to three lines in a 137 px input beside "Filters · 1", and the input cut it off | At 320 the search row stacks: the input is full width (288) and "Filters · 1" sits under it. 390 and wider are unchanged | Seek · results · 320 [185-18816](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18816) |
| Text overflowing its box | The Filters checkbox description ("Jobs paid by the day or year are converted with their weekly hours.") ran out of its 20 px box | Checkbox, Radio and field hints now wrap (D3-6) | Seek · filters · 390 [175-14419](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=175-14419), the 1440 filter rail |
| Text outside its frame | In the #128 record frame, the detail page's BottomNav sat below the 844 px viewport, behind the sheet | Hidden, because the sheet covers that part of the page | Legal fields · How we work this out · 390 [113-11452](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=113-11452) |

**Re-run of the checks, 2026-11-12, visible layers only:** 4,247 text layers, 4,456 instances, 37 Badges and 255 media layers. The result is 0 for each check: text under 14 px, targets under 44 px, text clipped, overflowing or truncated, disabled controls, placeholder, "preview" or builder copy, icon-less badges and media that doesn't cover its frame. The board notes ("Flow note", "Flow A", "Legal fields note") sit outside the screens and are not screen copy.

## What #152 changed, by audit 2 finding

| Id | Fix | Where |
|---|---|---|
| SE-1 blocker | The listing detail follows spec §6. The first 390 viewport holds the cover, the host preview (opens the host page) and the whole deal: pay, dates, housing type and cost, meals, couples, freshness and reply time. Below: pay with the estimate and "How we work this out", housing and meals each with a 4-photo strip and their fine print, dates and hours, description, a typical day, qualifications, perks, the trust line, Report and Share. Skip · Apply · Save are pinned in a sticky bar at 390 (lead decision). At 1440 the detail is a side panel over Seek | [45-7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496) (390, scrolls, fixed bar), [176-13308](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=176-13308) (390 full page), [45-7566](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7566) (768), [45-7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615) (1440 side panel), signed-in [45-7665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7665), [45-7735](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7735), [45-7784](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7784), dark [45-9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) |
| SE-2 blocker | The first application is drawn end to end at 390, 768 and 1440: sign in with Google, a passkey or an email link (with "Check your email"); one "Before you apply" screen with the date of birth (#128) and "Can you work in the US?"; the answers step with an editable screening answer (RadioGroup Yes/No), an optional short answer and a profile summary with Edit; a separate review step; Send | Sign in [45-7834](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7834), [45-7886](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7886), [45-7917](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7917); check your email [179-16237](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16237), [179-16321](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16321); details [179-16392](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16392), [179-16493](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16493), [179-16580](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16580); answers [45-8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067), [45-8125](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8125), [45-8162](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8162); review [179-16846](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16846), [179-16968](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16968), [179-17077](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-17077) |
| SE-3 | "3 jobs" hugs on one row with Sort and Save this search | Seek frames below |
| SE-4 | Every card on the page carries its listing's facts in one grammar: Cabin · $12 a night, taken from pay · 3 meals a day, free · Couples housed; Bunk on the boat · Free · No couples; Bunkhouse · Free · No meals · Couples housed | All JobCards (33) |
| SE-5 | Cover photos fill and centre at any card width (JobCard cover is now a centred auto-layout frame). Deckhand uses the harbor, Ranch hand the farm | All JobCards |
| SE-6 | 1440 Seek has a 280 px filter rail and a two-column grid; 768 has two columns; 1440 detail is a side panel; 1440 Swipe shows the card beside its detail panel | [42-3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412), [42-3032](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3032), [45-6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310) |
| SE-7 | "Filters · 1" button at 390 and 768, a Filters bottom sheet with a scrolling body and a pinned "Show 3 jobs", and the rail at 1440: pay range with unit, start date, housing and meals with Free only, category, genre, state, sponsors visas | Sheet [175-14419](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=175-14419) |
| SE-8 | Remote is off the homepage: no Remote chip and no remote card in the default feed (3 jobs). Remote stays in Filters, Map, Browse by State and the Montana page | Seek frames |
| SE-9 | Freshness sits inside the card under the dates (new JobCard slot). The 21 orphan lines between cards are gone | All feeds |
| SE-10 | Detail closed, not found, loading, couldn’t load and offline; sign-in error and cancelled; sending; already applied; "This host doesn’t sponsor visas. Apply anyway?"; every application status after Sent (viewed, shortlisted, interviewing, offered, hired, not selected, withdrawn) at 390, and a 1440 list showing all of them | Section [178-16020](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16020) |
| SE-11 | Map has a map canvas (original base map), 44 px MapPin pins in the category solid with the icon, a cluster, the host preview sheet, a pull-up list, "Search this area", "Near me" and a List view as the accessible alternative. 1440 has a list panel beside the map | [45-7043](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7043), [182-18128](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=182-18128), [45-7120](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7120), [45-7176](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7176) |
| SE-12 (FD-8) | Browse by State is an original US tile map (every state and DC as a 52 or 72 px tile, dark when it has jobs, with the count) at 768 and 1440, with search, a legend and the A–Z list below. 390 is an alphabetical list with "States with jobs" first. Zero states say "No jobs yet", never a sample number | [46-8604](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8604), [46-8697](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8697), [46-8769](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8769) |
| SE-13 | 161 sentences moved to `text-16/regular`; fact lines stay semibold | Whole page |
| SE-14 | Seek loading uses the redrawn CardSkeleton (JobCard anatomy) at 390, 768 and 1440 | [42-4429](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4429), [42-4517](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4517), [42-4584](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4584) |
| SE-15 | "You’re signed in. Finish applying to Lodge housekeeper." The "Saved on this phone" line is gone | Answers frames |
| SE-16 | Heading "Built for seekers, by seekers." Sort reads "Relevant" | Seek frames |
| SE-17 | Apply sent and Application status start with a status Badge with an icon; statuses use a two-column fact list | Sent and status frames |
| SE-18 | Desktop TopBar links show Current (Seek). The new flow is wired in the prototype | Prototype below |
| SE-19 | Kettle Ridge uses its logo (14 cards). A job with no cover collapses the cover (new JobCard Cover property) | All JobCards |
| SE-20 | Dark at 390 for Seek, Answers and Application sent, plus the detail | [185-18740](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18740), [185-18764](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18764), [185-18793](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18793), [45-9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) |
| SE-21 | 320 checks for Seek and the detail | [185-18816](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18816), [185-19166](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-19166) |
| S-8 | Category badges are full pills in the category tint with icon and word (Seasonal is gold again). Status badges have 8 px corners and always an icon | Whole page |
| #128 gaps | JobCard `Pay estimate` slot replaces the lines under the card (gap 1). The estimate subtracts housing and meals only; the detail lists "Other deductions from pay: none." (gap 2, lead decision). No line when nothing is taken from pay: Deckhand and Ranch hand show none (gap 3). The sticky bar fixes the fold (gap 7). Feeds no longer contradict the detail (gap 12) | Cards and detail |

## Listings

The same four listings are used everywhere. Counts come only from them.

| Job | Where | Pay | Housing | Meals | Couples | Freshness |
|---|---|---|---|---|---|---|
| Lodge housekeeper, Kettle Ridge Lodge | Whitefish, MT | $22 an hour; about $796 a week after housing and meals | Cabin, $12 a night, taken from pay | 3 meals a day, free | Couples housed | Confirmed active 2 days ago |
| Deckhand, Harbor and Co | Sitka, AK | $280 a day (no weekly estimate) | Bunk on the boat, free | 3 meals a day, free | No couples | Confirmed active 6 days ago |
| Ranch hand, Red Creek Ranch | Sheridan, WY | $18 an hour (nothing taken from pay, so no estimate) | Bunkhouse, free | No meals | Couples housed | Confirmed active 1 day ago |
| Bookkeeper, Northline Outfitters | Remote, host in Bozeman, MT | $28 an hour | No housing | No meals | (not shown) | Confirmed active 4 days ago |

The homepage feed shows the first three. Montana has 2 open jobs (one is the remote job), Alaska 1, Wyoming 1. Remote work counts in the host's state.

## Tap counts

Re-walked on the frames for #152. Typing is not counted; each field focus is.

| Flow | Taps | Path | Target |
|---|---|---|---|
| A. A guest lands on a listing | 0 after the link | The whole deal is in the first 390 viewport (673 px of 844 before the sticky bar) | Facts in the first viewport: **pass**. Photos are one short scroll below; the cover is in view |
| B. First application, Google | 12 | Apply, Continue with Google, pick the account, Month (2), Day, Year, work authorization, Continue, Yes, Review application, Send application | At most 12: **pass, at the limit** |
| B. First application, email link | about 14 | As above, with: focus the email, Continue, open the email app, tap the link in place of the Google two | Over 12 by 2. See gaps |
| B. Returning seeker, no question | 3 | Open the job, Apply (goes straight to review), Send | **Pass** |
| B. Returning seeker, one required question | 5 | Open the job, Apply, Yes, Review application, Send | Over 3. See gaps |
| E. Alert to application | 3 (no question) | View job, Apply, Send | **Pass** |

## Prototype

Figma only links top-level frames, so the 390 flow is copied to `Prototype · …` frames. Starting points: Detail guest (Flow A and B), Alert match (Flow E), Detail signed-in (returning).

| From | Control | To |
|---|---|---|
| Prototype · Detail · guest · 390 [46-20525](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20525) | Apply (sticky bar) | Prototype · Account · sign in · 390 [46-20592](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20592) |
| Prototype · Account · sign in · 390 | Continue with Google (the sign-in card) | Prototype · Apply · details · 390 [186-20528](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=186-20528) |
| Prototype · Apply · details · 390 | Continue | Prototype · Apply · answers · 390 [46-20641](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20641) |
| Prototype · Apply · answers · 390 | Review application | Prototype · Apply · review · 390 [186-20547](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=186-20547) |
| Prototype · Apply · review · 390 | Send application | Prototype · Apply · sent · 390 [46-20708](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20708) |
| Prototype · Apply · sent · 390 | View application | Prototype · Application · status · 390 [46-20914](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20914) |
| Prototype · Detail · signed-in · 390 [46-20835](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20835) | Apply | Prototype · Apply · answers · 390 |
| Prototype · Alert · match · 390 [46-20773](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20773) | View job | Prototype · Detail · signed-in · 390 |
| Prototype · Browse · states · 390 [46-21112](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21112) | a state | that state's Jobs page (unchanged links) |

The email path's [Prototype · Account · check your email · 390](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=186-20576) is a copy for review; the email link itself is outside Figma.

## Frames

### Seek (Board · Seek)

| Frame | Node |
|---|---|
| Seek · results · 390 | [42-2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) |
| Seek · results · 320 | [185-18816](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18816) |
| Seek · results · 390 · dark | [185-18740](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18740) |
| Seek · filters · 390 | [175-14419](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=175-14419) |
| Seek · results · 768 | [42-3032](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3032) |
| Seek · results · 1440 | [42-3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412) |
| Seek · empty · 390 / 768 / 1440 | [42-3793](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3793), [42-3878](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3878), [42-3942](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3942) |
| Seek · error · 390 / 768 / 1440 | [42-4007](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4007), [42-4091](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4091), [42-4154](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4154) |
| Seek · offline · 390 / 768 / 1440 | [42-4218](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4218), [42-4302](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4302), [42-4365](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4365) |
| Seek · loading · 390 / 768 / 1440 | [42-4429](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4429), [42-4517](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4517), [42-4584](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4584) |

### Swipe and Map (Board · Flows)

| Frame | Node |
|---|---|
| Swipe · card · 390 / 768 / 1440 | [45-6079](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6079), [45-6205](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6205), [45-6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310) |
| Swipe · undo · 390 / 768 / 1440 | [45-6416](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6416), [45-6551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6551), [45-6665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6665) |
| Swipe · empty · 390 / 768 / 1440 | [45-6780](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6780), [45-6838](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6838), [45-6875](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6875) |
| Swipe · offline · 390 / 768 / 1440 | [45-6913](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6913), [45-6970](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6970), [45-7006](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7006) |
| Map · preview · 390 | [45-7043](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7043) |
| Map · pull-up list · 390 | [182-18128](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=182-18128) |
| Map · preview · 768 / 1440 | [45-7120](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7120), [45-7176](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7176) |
| Map · empty · 390 / 768 / 1440 | [45-7233](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7233), [45-7291](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7291), [45-7328](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7328) |
| Map · offline · 390 / 768 / 1440 | [45-7366](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7366), [45-7423](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7423), [45-7459](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7459) |

### Listing and apply (Board · Flows)

| Frame | Node |
|---|---|
| Detail · guest · 390 (viewport, sticky bar) | [45-7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496) |
| Detail · guest · 390 · full page | [176-13308](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=176-13308) |
| Detail · guest · 320 · full page | [185-19166](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-19166) |
| Detail · guest · 768 | [45-7566](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7566) |
| Detail · guest · 1440 · side panel | [45-7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615) |
| Detail · guest · 390 · dark | [45-9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) |
| Detail · signed-in · 390 / 768 / 1440 · side panel | [45-7665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7665), [45-7735](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7735), [45-7784](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7784) |
| Account · sign in · 390 / 768 / 1440 | [45-7834](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7834), [45-7886](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7886), [45-7917](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7917) |
| Alert · match · 390 / 768 / 1440 | [45-7949](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7949), [45-8002](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8002), [45-8034](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8034) |
| Apply · answers · 390 / 768 / 1440 | [45-8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067), [45-8125](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8125), [45-8162](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8162) |
| Apply · answers · 390 · dark | [185-18764](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18764) |
| Apply · sent · 390 / 768 / 1440 | [45-8200](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8200), [45-8256](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8256), [45-8291](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8291) |
| Apply · error · 390 / 768 / 1440 | [45-8327](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8327), [45-8384](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8384), [45-8420](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8420) |
| Apply · offline · 390 / 768 / 1440 | [45-8457](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8457), [45-8514](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8514), [45-8550](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8550) |
| Application · status · 390 / 768 / 1440 | [45-8587](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8587), [45-8644](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8644), [45-8680](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8680) |

### Flow B · first application (section [179-16236](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16236))

| Frame | Node |
|---|---|
| Account · check your email · 390 / 1440 | [179-16237](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16237), [179-16321](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16321) |
| Apply · your details · 390 / 768 / 1440 | [179-16392](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16392), [179-16493](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16493), [179-16580](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16580) |
| Apply · review · 390 / 768 / 1440 | [179-16846](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16846), [179-16968](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-16968), [179-17077](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=179-17077) |

### Detail and apply endings (section [178-16020](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16020))

| Frame | 390 | 1440 |
|---|---|---|
| Detail · closed | [178-16021](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16021) | [178-16103](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16103) |
| Detail · not found | [178-16169](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16169) | [178-16237](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16237) |
| Detail · loading | [178-16292](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16292) | [178-16360](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16360) |
| Detail · couldn’t load | [178-16415](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16415) | [178-16484](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16484) |
| Detail · offline | [178-16539](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16539) | [178-16606](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=178-16606) |
| Account · sign-in error | [180-16828](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-16828) | [180-16948](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-16948) |
| Account · cancelled | [180-17055](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17055) | [180-17185](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17185) |
| Apply · sending | [180-17300](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17300) | [180-17377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17377) |
| Apply · already applied | [180-17460](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17460) | [180-17555](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17555) |
| Apply · visa check | [180-17637](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17637) | [180-17741](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17741) |
| Application · sent, viewed, shortlisted, interviewing | [180-17830](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17830), [180-17940](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-17940), [180-18048](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18048), [180-18154](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18154) | [180-18688](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18688) (all statuses) |
| Application · offered, hired, not selected, withdrawn | [180-18262](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18262), [180-18370](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18370), [180-18478](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18478), [180-18583](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=180-18583) | same |
| Application · sent · 390 · dark | [185-18793](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=185-18793) | |

### Browse by State and /jobs/[state] (Board · States)

| Frame | Node |
|---|---|
| Browse · states · 390 (A–Z list) | [46-8604](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8604) |
| Browse · states · 768 / 1440 (tile map) | [46-8697](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8697), [46-8769](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8769) |
| Browse · offline · 390 / 768 / 1440 | [46-8842](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8842), [46-8899](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8899), [46-8935](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8935) |
| Jobs · montana · 390 / 768 / 1440 | [46-8972](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8972), [46-9051](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9051), [46-9109](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9109) |
| Jobs · alaska · 390 / 768 / 1440 | [46-9168](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9168), [46-9232](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9232), [46-9275](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9275) |
| Jobs · wyoming · 390 / 768 / 1440 | [46-9319](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9319), [46-9383](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9383), [46-9426](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9426) |
| Jobs · idaho · 390 / 768 / 1440 | [46-9470](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9470), [46-9529](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9529), [46-9567](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9567) |
| Jobs · offline · 390 / 768 / 1440 | [46-9606](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9606), [46-9663](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9663), [46-9699](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-9699) |

### #128 legal fields (record)

Section [112-10306](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=112-10306), described in `docs/design/legal-fields/README.md`. Their content now lives in the detail and apply frames above; the record is unchanged.

## Gaps and decisions for the lead

1. **Email-link first application is about 14 taps**, over the 12-tap target. Google is 12. Shortening it means asking the date of birth and work authorization once on the review step instead of a separate screen, which the legal review (2.6) placed before the account exists. The lead decides.
2. **Returning seeker with a required question is 5 taps** (target 3). Without a question it is 3. Spec §10 requires the review step, so the answers step cannot be skipped when the host asks a required question.
3. **Swipe at 768** keeps one centred card. Only 1440 adds the detail panel.
4. **Seek empty, error and offline at 1440** keep their centred single column. Only results and loading use the rail and grid.
5. **Map and tile map are drawings.** The base map is an original illustration, not geography. The code uses the live map provider; the tile map is a layout to build in code.
6. **Detail endings use the guest bar**, because a closed or missing listing is usually opened from Google. Signed-in people see the same content with their bar.
7. **Code follow-ups** (not in this task): JobCard `payEstimate`, `freshness` and `cover` props; Notice; ErrorState `kind`; MapPin; the five new icons; `text-16/regular` and the 8-step scale in `src/ui/tokens.css` (#86).
