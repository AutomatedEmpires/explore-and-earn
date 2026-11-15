# Host screens

Figma page: [01 Host](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2627)

File `PbAWCgi2JXiyl5PmbGvr9A`, page `01 Host` only. Issues [#62](https://github.com/AutomatedEmpires/explore-and-earn/issues/62) and [#152](https://github.com/AutomatedEmpires/explore-and-earn/issues/152) (revision for design audit 2). These frames are the host listing builder, listings, applicants, billing, public pricing, team, join, settings, verification, host-page editor and public host page.

158 frames, including the 19 #128 legal-field frames kept as that task's record. Colors are bound to the `Color` collection (Light `5:0`, Dark `5:1`). Text uses the 8-step scale; body copy is `text-16/regular`. Buttons are the system Button at `lg` (48px) or `md` (44px). No button uses the Disabled state.

**Status:** not approved. The lead re-audits (audit 3), then asks the founder.

Samples: host Pinecrest Lodge, owner Jordan Hale (JH), recruiter Sam Ortiz. Live job: Lodge Cook in West Yellowstone, MT, May 18 to Sep 12, 2027, $18–$22 an hour, shared room, free, 2 meals a day, free, couples housed. The builder creates a second job, Housekeeper, $18–$20 an hour for 40 hours, shared room at $110 a week taken from pay, 3 meals a day at $50 a week taken from pay (the #128 sample). Applicant: Maya Chen, Bend, OR.

Prefix every node with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

## What #152 changed, by audit 2 finding

| Id | Fix | Where |
|---|---|---|
| H-1 blocker | The phone builder is 10 steps after Start, one section per screen, and carries every spec §7.1 field: Basics (title, category, **genre**, optional second category, occupation, openings, type of work, hours); Where and when (location, fixed dates / season / ongoing, first and last day, **weekly hours**, **minimum commitment**); Pay (amount, per hour/day/week/month/season/year/crew share, **how often you pay**, overtime, the #128 benefits checklist and other deductions); Housing (provided, **type: dorm bed, shared room, private room, cabin, RV site, berth on a boat**, **cost Free or an amount, per night/week/month/season, taken from pay or paid separately**, the #128 live-here, deposit and early-end answers, couples, note, fine print, 4 photos); Meals (**meals a day, which days, cost Free or an amount with a period, how it is paid**, note, fine print, the spec's 4 slots: Kitchen, Meal example, Dining area, Other); **Seasonal details** (season and year, destination, staff perks); The job (description, a typical day, qualifications, skills, certifications, physical demands, minimum age, visa sponsorship); **Photos** (cover and gallery); **Applying** (up to 10 screening questions with type and Required, additional step link, deadline, who gets notified); Review (card with the pay estimate slot, photos, hours and deductions, checks, applying summary, the two #128 publish checks). The 768 and 1440 workspaces carry the same 10 sections with a section rail and the live card | Phone steps below; workspaces [43-13984](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13984), [43-14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) |
| H-2 blocker | "Answer within a day to keep your reply time short." | Applicants 390/768/1440 and dark |
| H-3 blocker | Public Pricing is a guest page: "Start with Starter", "Start with Professional" (primary, "Most hosts pick this"), "Start with Enterprise". "Current plan" is gone. A line says the plan and the monthly or annual choice are kept through sign-up | [45-16377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16377), [45-16450](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16450), [45-16523](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16523) |
| H-4 | Every phone step starts with the new BuilderStepHeader: Back, "Step N of 10 · Saved 6:14 PM", Save and exit, and a progress bar | All phone steps |
| H-5 | Two RadioGroups with legends: "Type of work" (Employee, Contractor) and "Hours" (Full time, Part time) | Basics |
| H-6 | "Paste a job post" is optional, with the hint "Paste the text of a job post you already have." | Start 390/768/1440 |
| H-7 | Photo slots are the new PhotoSlot component: an empty dashed tile with the slot icon and name, or an original sample room or meal illustration (6 new media components on page 00). No place illustration stands in for a room | Housing, Meals, Photos, Review |
| H-8 | Billing annual 768 buttons fill with centred labels | [49-13485](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13485) |
| H-9 | Applicants: no applicants yet (with Share listing), loading, couldn’t load at 390/768/1440, offline at 1440; Reply didn’t send (keeps the text, Try again) at 390/768/1440; Passed returns to the list with "Maya Chen passed · Maya won’t be told for 10 seconds · Undo" | Section D2 and the Passed frames |
| H-10 | Publish failed (390 and 1440), needs a change (rejected in review), removed, camera blocked, photo didn’t upload, and a Listings loading skeleton (390 and 1440) | Sections C2 and A2 |
| H-11 | A Recruiter opening Billing sees "You don’t have access to Billing" with who to ask and Go to Listings, at 390/768/1440 | Section D2 |
| H-12 | Paused listing: "We paused Lodge Cook" warning Notice with Turn it back on, a Paused badge and the row's buttons, at 390/768/1440 | Section A2 |
| H-13 | The applicant card is the system CandidateCard `applicant`: Pass (X), Reply (primary) and Shortlist. See decisions | Applicants frames |
| H-14 | Categories use CategoryBadge (11 swapped). Status badges carry an icon and the right tone: Not confirmed (warning, Clock), Confirmed (success, Check), Hiring now (success), Paused (warning), Current plan (Check), roles (User), 25 badges in all | Whole page |
| H-15 | The public host page has the spec §8 header: cover, logo, subscriber check, Hiring now, category badges, host since, reply time, stats, Follow / Share / Website, the Jobs / About / Photos / Locations tabs, and jobs grouped by location. The remote Reservation agent is a JobCard without a cover. Not hiring has its own state | Host page and Not hiring frames |
| H-16 | One fact grammar: "$18–$22 an hour" · "Shared room, free" · "2 meals a day, free" · "Couples housed". Listing rows use icon fact lines in place of the clipped chips | Listings, host page, builder card |
| H-17 | Cards use three sizes (14 labels, 16 values, 24 title); the builder header is one 14px row without the org name | Listings, builder |
| H-18 | Sidebar runs full height; the account row is "JH · Jordan Hale" (71 instances) | 768 and 1440 frames |
| H-19 | The 20 stray TopBar instances at (0,0) are deleted | Page |
| H-20 | Flow C re-counted and timed (below and in the Flow C note) | [43-10803](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10803) |
| H-21 | "Maya won’t be told for 10 seconds." | Passed toast |
| H-22 | En dash in every pay amount | Cards and chips |
| H-23 | Repost opens Review with a "Dates moved to 2027" Notice | [46-19491](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19491) |
| H-24 | "Every plan includes every hiring tool. Seekers never pay." Plans list only what differs; "Pay monthly, or pay for a year and get two months free." | Pricing and Billing |
| H-25 | 1440 applicants offline, billing offline, settings error | Section D2 |
| H-26 | The Couples slot on every host JobCard reads "Couples housed" (the H-16 grammar) | Builder card, host page |
| #128 gaps | Pay estimate in the JobCard slot (gap 1); estimate subtracts housing and meals only, other deductions listed in Review's "Hours and deductions" (gap 2); line hidden when nothing is taken from pay, as for Lodge Cook (gap 3); Notice component (gap 4); Checkbox and field errors wrap in the components (gap 5); 768 and 1440 endings added (gap 11); stray TopBars removed (gap 15) | |

## Tap counts

**Flow C, publish a first listing (phone, 10 steps).** About 127 taps, counting every field focus, every select (open and pick), and 3 taps per photo for 11 required photos plus 2 gallery photos: Start 2, Basics 11, Where and when 11, Pay 10, Housing 29, Meals 23, Seasonal details 8, The job 10, Photos 10, Applying 10, Review 3. **Timed estimate, not measured:** about 18 minutes on a phone (taps 4, typing about 120 words 4, photos 4, reading and choices 6), under the 25-minute target. **Desktop:** about 90 clicks with batch photo upload, about 11 minutes, under 15. Copy a listing or Paste a job post fills most fields. Re-time on a production build.

Phone prototype: [Start](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10808) → [Basics](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) → [Where and when](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11384) → [Pay](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11521) → [Housing](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11643) (an empty slot opens [Camera](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11830)) → [Meals](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11940) → [Seasonal details](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18098) → [The job](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12041) → [Photos](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18301) → [Applying](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18601) → [Review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) → [In review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314).

Desktop prototype: [Start](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11060) → [Workspace](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) → [In review](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13530).

**Flow D, answer an applicant.** 2 taps from the list: Reply, then Send reply (3 from a notification). Pass is 1 tap and shows Undo for 10 seconds. [Applicants](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683) → [Reply](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14113) → [Reply sent](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14510); Pass → [Passed](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771).

**Still hiring.** 1 tap. [Still hiring](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966) → [Confirmed](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3551). After two unanswered reminders: [Paused](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-22655).

**Repost.** Library, Repost opens [Review with "Dates moved to 2027"](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19491), then Publish: about 3 taps.

## How the widths are used

Phone frames are 390 wide with top bar A (icons, no role badge) and the host bottom nav. 768 and 1440 use the Sidebar. Signed-out pages (`/pricing`, `/join`, `/hosts/pinecrest-lodge`) use the top bar with Sign in and no sidebar. The phone builder is one section per screen; the 768 and 1440 builder is one long form with a section rail and "What guests see".

## Frames

### Listings (section `37:2628`) and A2 · Listings endings (`171:22654`)

| Frame | Node |
| --- | --- |
| 390 / 768 / 1440 · Listings · Empty | [37-2629](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2629), [37-2726](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2726), [37-2846](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2846) |
| 390 / 768 / 1440 · Listings · Still hiring | [37-2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966), [37-3147](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3147), [37-3349](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3349) |
| 390 / 768 / 1440 · Listings · Confirmed | [37-3551](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3551), [37-3715](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3715), [37-3903](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-3903) |
| 390 / 768 / 1440 · Listings · Paused | [171-22655](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-22655), [171-22784](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-22784), [171-22951](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-22951) |
| 390 / 1440 · Listings · Loading | [171-23118](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23118), [171-23199](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23199) |
| 390 / 768 / 1440 · Library | [46-19263](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19263), [49-14054](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14054), [46-19354](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19354) |
| 390 · Reposted · Review | [46-19491](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19491) |

### Listing builder (section C `43:10802`, C · Desktop builder `162:20281`, C2 · Builder endings `171:23322`)

| Frame | Node |
| --- | --- |
| Flow C note | [43-10803](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10803) |
| 390 / 768 / 1440 · Builder · Start | [43-10808](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10808), [43-10922](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10922), [43-11060](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11060) |
| 390 · Step 1 Basics | [43-11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) |
| 390 · Step 2 Where and when | [43-11384](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11384) |
| 390 · Step 3 Pay | [43-11521](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11521) |
| 390 · Step 4 Housing | [43-11643](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11643) |
| 390 · Camera | [43-11830](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11830) |
| 390 · Step 5 Meals | [43-11940](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11940) |
| 390 · Step 6 Seasonal details | [156-18098](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18098) |
| 390 · Step 7 The job | [43-12041](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12041) |
| 390 · Step 8 Photos | [156-18301](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18301) |
| 390 · Step 9 Applying | [156-18601](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=156-18601) |
| 390 · Step 10 Review | [43-12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) |
| 768 / 1440 · Builder · Workspace (all 10 sections) | [43-13984](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13984), [43-14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) |
| 390 / 768 / 1440 · Builder · Pay error | [43-12923](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12923), [43-13038](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13038), [43-13176](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13176) |
| 390 / 768 / 1440 · Builder · Published (in review) | [43-13314](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314), [43-13410](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13410), [43-13530](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13530) |
| 390 / 768 / 1440 · Builder · Offline | [43-13650](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13650), [43-13746](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13746), [43-13865](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13865) |
| 390 / 1440 · Builder · Publish failed | [171-23323](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23323), [171-23403](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23403) |
| 390 · Builder · Needs a change | [171-23522](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23522) |
| 390 · Builder · Removed | [171-23600](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23600) |
| 390 · Builder · Camera blocked | [171-23678](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23678) |
| 390 · Builder · Photo didn’t upload | [171-23757](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=171-23757) |

The old 768 and 1440 "Builder · Review" copies are removed; the desktop review is section 10 of the workspace.

### Applicants, billing, pricing (section D `45:13678`, D2 · Flow D and billing endings `164:20553`)

| Frame | Node |
| --- | --- |
| Flow D note | [45-13679](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13679) |
| 390 / 768 / 1440 · Applicants | [45-13683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683), [45-13795](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13795), [45-13954](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13954) |
| 390 / 768 / 1440 · Applicants · No applicants yet | [164-20554](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-20554), [164-20699](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-20699), [164-20885](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-20885) |
| 390 / 768 / 1440 · Applicants · Loading | [164-21071](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21071), [164-21226](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21226), [164-21422](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21422) |
| 390 / 768 / 1440 · Applicants · Couldn’t load | [164-21639](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21639), [164-21785](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21785), [164-21970](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-21970) |
| 390 / 1440 · Applicants · Offline | [45-15000](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15000), [164-22155](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22155) |
| 390 / 768 / 1440 · Reply | [45-14113](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14113), [45-14214](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14214), [45-14362](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14362) |
| 390 / 768 / 1440 · Reply · Didn’t send | [164-22339](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22339), [164-22418](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22418), [164-22536](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22536) |
| 390 / 768 / 1440 · Reply sent | [45-14510](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14510), [49-13472](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13472), [45-14617](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14617) |
| 390 / 768 / 1440 · Passed (was Declined) | [45-14771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771), [49-13479](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13479), [45-14862](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14862) |
| 390 / 768 / 1440 · Billing | [45-15095](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15095), [45-15215](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15215), [45-15385](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15385) |
| 390 / 768 / 1440 · Billing annual | [45-15555](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15555), [49-13485](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13485), [45-15679](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15679) |
| 390 / 768 / 1440 · Billing paid | [45-15853](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15853), [49-13513](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13513), [45-15937](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15937) |
| 390 / 768 / 1440 · Billing error | [45-16071](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16071), [49-13519](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13519), [45-16155](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16155) |
| 390 / 1440 · Billing offline | [45-16289](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16289), [164-23013](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-23013) |
| 390 / 768 / 1440 · Billing · No access (Recruiter) | [164-22654](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22654), [164-22747](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22747), [164-22880](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-22880) |
| 390 / 768 / 1440 · Pricing (guest) | [45-16377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16377), [45-16450](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16450), [45-16523](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16523) |

Plans are Starter ($99 a month or $990 a year, 2 open jobs, 1 seat), Professional ($299 or $2,990, 10 open jobs, 5 seats) and Enterprise ($599 or $5,990, 30 open jobs, 15 seats). A plan subscription only. Seekers never pay.

### Team, settings, verification, host page (section E `46:16273`)

| Frame | Node |
| --- | --- |
| 390 / 768 / 1440 · Team | [46-16274](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16274), [46-16367](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16367), [46-16510](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16510) |
| 390 · Invite sent / Team offline | [46-16653](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16653), [46-16737](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16737) |
| 390 / 768 / 1440 · Join | [46-16825](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16825), [46-16860](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16860), [46-16895](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16895) |
| 390 · Joined / Invite expired | [46-16930](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16930), [46-16965](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16965) |
| 390 / 768 / 1440 · Settings | [46-16994](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16994), [46-17122](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17122), [46-17299](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17299) |
| 390 / 1440 · Settings error | [46-17476](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17476), [164-23145](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=164-23145) |
| 390 / 768 / 1440 · Verification | [46-17582](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17582), [49-14033](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14033), [46-17682](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17682) |
| 390 / 768 / 1440 · Verified | [46-17832](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17832), [49-14040](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14040), [46-17910](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17910) |
| 390 · Needs a document / Verification offline | [46-18038](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18038), [46-18122](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18122) |
| 390 / 768 / 1440 · Host editor | [46-18210](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18210), [46-18337](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18337), [46-18514](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18514) |
| 390 / 768 / 1440 · Host page | [46-18691](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18691), [46-18842](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18842), [46-18990](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18990) |
| 390 / 768 / 1440 · Host not hiring | [46-19138](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19138), [49-14045](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-14045), [46-19181](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19181) |
| 390 · Host page offline | [46-19224](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19224) |

### Dark mode (section `46:19619`)

| Frame | Node |
| --- | --- |
| 390 · Listings · Still hiring · Dark | [46-19620](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19620) |
| 390 · Builder · Review · Dark (synced to the new Review) | [46-19656](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19656) |
| 390 · Builder · Camera · Dark | [46-19683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19683) |
| 390 · Applicants · Dark | [46-19695](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19695) |
| 390 · Billing · Dark | [46-19713](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19713) |
| 390 · Host page · Dark | [46-19743](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19743) |
| 390 · Settings · Dark | [46-19760](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19760) |
| 390 · Team · Dark | [46-19771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19771) |
| 390 · Verification · Dark | [46-19788](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19788) |

### #128 legal fields (record)

Section [96-14106](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=96-14106), described in `docs/design/legal-fields/README.md`. Its note now points to the 10-step builder, which carries every legal field.

## Decisions for the lead, and gaps

1. **Applicant actions (H-13).** The card is CandidateCard with spec §11.1's Pass and Shortlist. The primary reads **Reply**, not Interview, because Flow D is "answer an applicant" in 2 taps; Interview stays one tap away inside the reply. The lead records Reply or Interview, and confirms "Pass" (spec) over "Decline".
2. **Flow C is about 127 taps** on a phone when every focus and photo is counted. The time estimate is inside both targets, but it is an estimate; re-time on a production build.
3. **Endings at 390 only:** invite sent, joined, invite expired, needs a document, verification offline, host page offline, team offline, needs a change, removed, camera blocked and photo didn’t upload. The key screen of each flow has 390, 768 and 1440.
4. **Room and meal photos are original illustrations**, not photographs. Real sample photos need a shoot or licensed originals.
5. **Code follow-ups** (not in this task): BuilderStepHeader and PhotoSlot, the 10-step builder routes, Notice, ErrorState kinds, JobCard `payEstimate`, `freshness` and `cover`, and `text-16/regular` (#86).
