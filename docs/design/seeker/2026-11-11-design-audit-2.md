# Explore&Earn design audit 2: pages 00, 01 and 02 (claude-code, 2026-11-11)

Issue [#113](https://github.com/AutomatedEmpires/explore-and-earn/issues/113) (EE-P0-14). Read-only. No Figma frame and no code was changed. The lead turns blockers into tasks.

**Measured against:** Quality bar v1 (#45 comment 6783016464), the strategy flows and targets (#45 comment 6784514526), founder decisions (#45 comment 6786615643, plus FD-7: plan subscription only, no add-ons), product spec `docs/superpowers/specs/2026-11-03-explore-earn-product-design.md`, and design audit 1 (#45 comment 6783750434).

**Inputs**
- Figma file `PbAWCgi2JXiyl5PmbGvr9A`: page 00 System, 01 Host (109 frames, PR #98) and 02 Seeker (99 frames, PR #95), read on 2026-11-11 with `get_screenshot` and read-only `use_figma` scans.
- Code and READMEs on `origin/integrate/sp2-20261104` at `5f231acb6ba2f99d4a005c0104bac026f4247c0f`, then rechecked at `50484f4b928ef47c63f7f4a0ec9100a515eae382`.
- #101 (JobCard whole deal) merged as PR #114 (89bb7bc) during this audit. The JobCard, the seeker cards and the host cards were re-read after the merge, and the findings below match that state. Items #101 closed are marked **fixed by #101**.
- #64 (page 03 Hiring) is still being edited. Page 03 was not audited.

**Method**
- Every screen frame on 01 and 02 was scanned for: text sizes, text without a style, text outside the frame or clipped by its parent, collapsed text, interactive instances under 44 px, Disabled variants, unbound fills, and builder or placeholder words. The copy of every frame was read in full.
- 30 key frames were screenshotted and read by eye.
- Contrast was computed from the Color collection's Light and Dark values (WCAG 2.x). Category-to-status distance was computed as CIEDE2000.
- Tap counts were walked on the frames and the prototype links, not taken from the notes.
- P1 to P3 (speed) and A1, A2, A4 (keyboard, names, axe) cannot be measured in a design file. They are not passed here.

## Verdict

| Page | Blockers | Majors | Minor | Approvable for build |
|---|---|---|---|---|
| 00 System | 0 | 9 | 4 | Not a build page. Its majors feed 01 and 02. |
| 01 Host | 3 | 15 | 8 | **No** |
| 02 Seeker | 2 | 12 | 7 | **No** |
| **Total** | **5** | **36** | **19** | |

- **Flow A (guest listing): not approvable.** SE-1: the listing detail has no photos, description or host.
- **Flow B (first application): not approvable.** SE-2: the sign-up, 18+, work-authorization and screening steps are not drawn.
- **Flow C (first listing): not approvable.** H-1 (the builder misses required fields, including all meal inputs) and H-3 (public Pricing has no way to start).
- **Flow D (answer an applicant): approvable once H-2 is fixed.** H-2 is one line of builder copy. Fix majors H-9 and H-13 before building.

## Flow tap counts against the strategy targets

| Flow | Target | Claim on the page | Path drawn | Audit count | Result |
|---|---|---|---|---|---|
| A. Guest lands on a listing | Facts in the first viewport, no login | 0 taps | [Detail · guest · 390](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496) | 0 taps. Pay, dates, housing type and cost, meals, couples and freshness end near y 500 in a 673 px frame | **Facts pass.** "With photos" fails: no photo on the detail (SE-1). The 5 s on 4G part needs a production build. |
| B. First application | Under 3 min, at most 12 taps | 6 taps | Prototype: Apply → Continue with Google → Send application (3 taps) | About 8: Apply, Continue with Google, pick the Google account, I'm 18 or older, Continue, work authorization, the screening answer, Send | **Fail: steps not drawn** (SE-2). The count fits under 12 once drawn. There is no path for a seeker without Google. |
| B. Returning seeker | Under 45 s, 3 taps | 3 taps | Detail · signed-in → Apply → Send application | 3 taps. A required screening question adds a fourth. | **Pass** if the host sets no required question. |
| C. First listing | Under 15 min on desktop, under 25 min on a phone | 27 taps on a phone, 6 on desktop, typing not counted | Phone: 11 screens. Desktop: Start → Workspace → In review | About 50 taps on a phone: field focus, 3 selects, 2 date pickers, 3 radios and 3 taps per photo (open the camera, shutter, Use this photo) for 9 photos | **Not verified.** The target is minutes, and no frame proves it. The builder also misses required fields (H-1). Adding them raises the time, so re-time it after H-1. |
| D. Host answers an applicant | 2 taps | 2 taps | Applicants → Reply → Send reply | 2 taps from the list (3 from a notification) | **Pass.** Endings are missing (H-9). |
| E. Return loop (extra) | 3 taps; repost under 2 min; "Still hiring?" 1 tap | 3, none, 1 | Alert → View job → Apply → Send. Listings → Yes, still hiring. Library → Repost → Reposted | 3 / about 4 / 1 | **Pass.** Repost lands on a confirmation, not Review (H-23). |

## The checks the lead asked for

| Check | Result |
|---|---|
| Placeholder or builder copy, "preview" lines | **Fail.** The Applicants screen says "A reply is two taps." (H-2). Paste a job post has the Textarea's default hint (H-6). Customer pages say "Plans only. No add-ons." (H-24). No "preview" line was found. |
| Disabled dead ends | No Disabled variant is used on 01 or 02. Three dead ends were found: guest Pricing (H-3), Declined (H-9), and sign-up for a seeker without Google (SE-2). |
| Clipping and off-screen content at 390 | "4 jobs" collapsed to 2 px, one letter per line (SE-3). The cover art is 384 px inside a 358 px cover, so it is cropped off-center (SE-5). At 768, Billing annual clips its buttons (H-8). |
| 768 and 1440 for key screens | **Pass on 01 and 02.** Every key screen has 390, 768 and 1440. Endings on 01 are 390 only (H-25). Page 00's first run and top bar still have no 768 (S-3, S-9). No 320 check frame exists (SE-21). |
| Endings: success, error, offline, empty | Success and offline are drawn widely. Missing: applicants empty, loading and error, reply error, publish failed, permission denied, paused listing (H-9 to H-12); detail closed, error and loading, sign-up error, submitting, already applied, every application status after Sent (SE-10). |
| Contrast, from the variable values | **Pass** for every text and mark pair in both themes. The lowest are muted on surface-2 at 4.95:1 (light) and line-strong on surface-2 at 3.14:1. `color/line` is 1.30:1 (light) and 1.37:1 (dark), but it only edges controls that are named by text or icon, so 1.4.11 does not apply. The Disabled primary is 3.31:1, and no screen uses it. No screen puts text on a category solid. Those pairs would fail (white on farm-solid is 3.53:1). |
| Targets under 44 px; body under 16 px | **Targets pass.** Every interactive instance on 01 and 02 is at least 44 px. Pill's default is 36 px, and the screens override it (S-6). **Body copy is 16 px** on both pages. Text under 16 px sits in components (Sidebar 15, BottomNav 12, Badge 13, JobCard 12–14) and in the host step labels (12). See S-1 and H-17. |
| The whole deal before the ticket | **Seek card at 390, signed out:** pay, dates, housing type, housing cost, meals, couples and a room thumbnail are all on the card (#101). Freshness sits outside the card (SE-9). The card's facts contradict the listing (SE-4). **Detail:** every fact is in the first view, but there are no photos (SE-1). |
| Category colors never confusable with status colors | Solids pass (#85 approved: at least 18 ΔE00 and 24° from every status hue). **Fail:** Seasonal is now neutral and looks exactly like the neutral status badges, such as "Not confirmed" and "Hiring now" (S-8, H-14). Five category tints are under 10 ΔE00 from a status tint (S-7, minor). |
| No add-on purchase anywhere | **Pass.** Billing and Pricing sell plans only. Promote is gone from the Sidebar (fixed by #101). There is no Boost purchase on 01 or 02. |

## Findings

One line each: id · rule · severity · where · what is wrong · **Fix**.

### Page 00 System

- **S-1** · V2 · major · [6:494](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=6-494) · Still 11 sizes (12, 13, 14, 15, 16, 17, 19, 21, 24, 28, 32) and 23 styles, with no `text-16/regular`. So host body copy is unstyled and seeker body copy is semibold. · **Fix:** collapse to 12/14/16/18/20/24/28/32, add `text-16/regular` and `text-14/regular`, and rebind 01 and 02 (audit 1 F-1). Issue #86 changes code only, so the Figma scale needs an owner.
- **S-2** · V5 · major · [21:2213](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2213), [21:2372](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2372) · First run claims to mirror the code, but the code moved inputs, Clerk text and onboarding paragraphs to 16 px (389adef, 8b6c979), while Figma still shows 15 and 13 px. · **Fix:** redraw the first-run parts at 16 px (or recapture, see S-10).
- **S-3** · R1/U3 · major · [20:2791](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=20-2791) · Section 4 still says "For the founder to choose" and shows A, B and C at phone width only. The founder chose A. There is no 320, 768 or 1440 bar and no signed-out variant in the system, so 01 and 02 each built their own. · **Fix:** mark A approved, archive B and C, and add TopBar A at 320, 768 and 1440 plus the signed-out state as variants.
- **S-4** · U2 · major · [18:1964](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1964) · ErrorState has no offline, permission-denied or partial-data variant. So 01 and 02 hand-build about 30 offline screens, and none draws permission denied. · **Fix:** add ErrorState `offline` and `denied` and an inline "Some results didn't load · Retry" notice (audit 1 C-6).
- **S-5** · V4 · minor · [16:1818](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1818) · TabsTrigger Default and Disabled strokes are raw hex. · **Fix:** bind them to `color/line` or remove them.
- **S-6** · A3 · minor · [12:57](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-57) · Pill's default height is 36 px. Screens override it to 44 px. · **Fix:** make 44 px the component height.
- **S-7** · V4 · minor · [43:2627](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-2627) · Only the solids were checked. Five badge tints are under 10 ΔE00 from a status tint: light maritime-bg/success-bg 8.4, remote-bg/danger-bg 8.3, farm-bg/success-bg 9.2; dark seasonal-bg/warning-bg 8.0, farm-bg/success-bg 8.8. The labels are 12.8 or more apart. · **Fix:** keep the icon and the word mandatory in CategoryBadge (no icon-less variant), and add the tint table to the README.
- **S-8** · V4/V5 · major · [12:106](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-106) · CategoryBadge seasonal is neutral (`color/ink-2` on surface-2), while maritime, farm and remote use their colors. A Seasonal tag now looks identical to the neutral status badges ("Not confirmed", "Hiring now", "Sent"). With #85 approved, the reason for a neutral Seasonal is gone. · **Fix:** in a follow-up to #101, restore `color/seasonal-fg`/`-bg`, and give status badges an icon (Clock, Check) so they never share a look with a category.
- **S-9** · U2/V4 · major · [23:2499](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2499) · Carried from F-4: dark mode covers sign-in and choose only, and "Check your email", the Clerk errors and onboarding submitting are not drawn. · **Fix:** as in audit 1 F-4.
- **S-10** · U1 · major · [21:2213](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2213) · Carried from F-5: sign-in shows Google and email only. Spec §2 adds passkeys, and the cards are still reconstructions. · **Fix:** as in audit 1 F-5.
- **S-11** · V6 · major · [21:2213](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2213), [21:2244](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2244) · Carried from F-6: "Secured by Clerk" and the caret on Continue remain in Figma and in `src/ui/clerk.ts`. · **Fix:** as in audit 1 F-6.
- **S-12** · U3 · minor · `docs/design/system/README.md` · The status is stale. It says it is "waiting for the founder", the top bar is open, the palette is "still open", and tokens.css keeps the old values. #101 kept gap 12's "still open" line. · **Fix:** update the status lines now, and the token notes when #86 lands.
- **S-13** · U2 · major · [14:1542](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1542) · CardSkeleton still has the old three-chip layout. The JobCard now has a thumbnail and four fact lines (#101), so loading will jump. · **Fix:** redraw CardSkeleton to the new JobCard anatomy as a follow-up to #101.

### Page 01 Host

- **H-1** · U1/U4 · **blocker** · [43:11940](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11940), [43:11643](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11643), [43:11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198), [43:14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) · The builder draws 8 of the 11 sections in spec §7.1 and drops required fields:
  - Meals has no inputs. It is a switch plus the fixed text "Two meals a day, free, on work days".
  - Housing cost is a bare "0", with no Free option, no period and no "how it's paid".
  - Housing type lacks dorm, RV site and berth.
  - Genre, weekly hours, minimum commitment and pay frequency are missing.
  - The Genre details and Applying sections are missing, so a host cannot write the "Can you start on May 15?" question that the seeker answers.
  - The meal photo slots differ from the spec (Kitchen, Meal example, Dining area, Other).

  **Fix:** add these inputs to the 390 steps and the 768/1440 workspace: meals per day, days, and Free or an amount with a period; housing Free or an amount, with per night/week/month/season and "deducted from pay" or "paid directly"; and an Applying step with up to 10 screening questions. If launch drops any of these fields, the lead records which ones.
- **H-2** · U3 · **blocker** · [45:13683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683), [45:13795](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13795), [45:13954](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13954) · The product copy is a builder note: "Reply or decline from the card. A reply is two taps." · **Fix:** "Answer within a day to keep your reply time short." (or remove it).
- **H-3** · U1 · **blocker** · [45:16377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16377), [45:16450](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16450), [45:16523](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16523) · The signed-out public Pricing page is a copy of in-app Billing. It shows "Current plan" on Professional and "Change to Starter/Enterprise", so a new host has no way to start and no primary action. · **Fix:** a guest variant with "Start with Starter/Professional/Enterprise" (Professional filled). Each goes to sign-up, keeps the plan and the monthly/annual choice, and drops "Current plan".
- **H-4** · U5 · major · [43:11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) to [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) · The phone builder steps have only Next: no Back, no section list and no Save and exit. · **Fix:** add a step row with Back (ChevronLeft IconButton), "Step 2 of 8" and "Save and exit", plus a progress bar.
- **H-5** · U4 · major · [43:11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198), [43:14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) · The radios have no legends: "Employee / Contractor" and a lone "Full time" radio, which cannot be cleared and has no Part time. · **Fix:** two RadioGroups, "Type of work" (Employee, Contractor) and "Hours" (Full time, Part time).
- **H-6** · U4/U3 · major · [43:10808](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10808) · "Paste a job post *" is marked required, although it is one of three ways to start. Its hint "A few lines hosts read first" is the Textarea default. · **Fix:** drop the asterisk, and use the hint "Paste the text of a job post you already have."
- **H-7** · V6 · major · [43:11830](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11830), [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143), [43:14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) · Room and meal photos are the place illustrations. "Bedroom" is a lake, "Bathroom" a boat, "Kitchen" a farm. · **Fix:** an empty-slot placeholder (room icon plus the slot name) for unfilled slots, and original sample room photos for filled ones.
- **H-8** · V6 · major · [49:13485](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13485) · At 768, Billing annual's "Change to Starter" label overflows to the left, and "Change to Enterprise" is clipped to "hange to Enterprise". · **Fix:** set the buttons to Fill with a centered label, as at 390 and 1440.
- **H-9** · U2/U1 · major · [45:13683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683), [45:14771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771) · Flow D has no Applicants empty, loading or error state, and no "Reply didn't send" state. Declined ends on a "Not selected" page with no next action. · **Fix:** add Applicants empty ("No applicants yet" plus Share listing), skeleton and error at 390, 768 and 1440; a Reply error that keeps the text, with Try again; and return Declined to the list with the Undo toast.
- **H-10** · U2 · major · [43:13314](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-13314) · Flow C has no publish failed, rejected or removed in review, camera permission denied, or photo upload failed state. Page 01 has no loading skeleton at all. · **Fix:** draw these at 390, with publish failed at 1440 too, and a Listings skeleton.
- **H-11** · U2 · major · [46:16825](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-16825) · Permission denied is not drawn, although Join promises "You will not see billing" (roles, spec §2). · **Fix:** a Recruiter opening Billing sees "You don't have access to Billing. Ask an Owner or Admin." at 390 and 1440 (S-4 pattern).
- **H-12** · U2 · major · [37:2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966) · Founder decision 4 (pause after two unanswered "Still hiring?" reminders) has no host frame. · **Fix:** a Paused listing state: "We paused Lodge Cook because we didn't hear back. Turn it back on." at 390 and 1440.
- **H-13** · V5 · major · [45:13683](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13683) · The applicant card is a one-off (Avatar, text and two Buttons), not the system CandidateCard ([14:1534](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1534)). Its actions (Reply, Decline) differ from spec §4 and §11.1 (Pass · Interview · Shortlist). · **Fix:** use CandidateCard `applicant`. The lead records whether Reply or Interview is the primary and whether the word is "Decline" or "Pass".
- **H-14** · V4/V5 · major · [37:2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966), [46:18691](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18691) · Listing rows use a neutral "Seasonal" Badge next to the neutral "Not confirmed" status Badge, and the host page shows "Hiring now", "Confirmed active today", "Seasonal" and "Remote" all in one neutral style. Category and status look the same. · **Fix:** CategoryBadge in its category color for the category, and status badges with an icon (Clock "Not confirmed" in the warning tone, Check "Confirmed").
- **H-15** · U1 · major · [46:18691](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18691) · The public host page lacks the spec §8 header (cover, logo, subscriber badge, category icons, member since, stats, tabs). Its remote job is a plain box with no pay or Apply, unlike the JobCard above it. · **Fix:** add a cover and logo header, a stats row and the Jobs/About/Photos tabs, and show the remote job as a JobCard without a cover.
- **H-16** · U3/V5 · major · [37:2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966), [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) · One fact, three wordings. Host rows say "Shared, free / Two a day / Can share", the JobCard says "No cost / Two meals a day", and seeker pages say "Cabin, $12 a night / Meals included / Couples can share a cabin". · **Fix:** one fact grammar everywhere: "[type], [Free | $X a night/week/month]" · "[N] meals a day, [free | $X]" · "Couples housed | No couples".
- **H-17** · V2 · major · [37:2966](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=37-2966), [43:11198](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-11198) · The listing card uses five sizes (12/13/14/16/24), against a limit of three per section. The builder header stacks the org name, "Saved at 6:14 PM" and a 12 px "Step 2 of 8 · The job" above the heading. · **Fix:** after S-1, cap cards at three sizes (14 labels, 16 values, 24 title), and use one 14 px row "Step 2 of 8 · Saved 6:14 PM" without the org name.
- **H-18** · V6 · minor · [49:13485](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=49-13485), [43:14603](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-14603) · The Sidebar background stops at 853 px on taller frames. The account row shows "Y" for Jordan Hale on every 768 and 1440 frame. · **Fix:** Sidebar height Fill, and initials "JH".
- **H-19** · V6 · minor · [45:13796](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-13796) and 19 more · 20 stray page-level TopBar instances are stacked at (0, 0) on top of 390 · Listings · Empty. · **Fix:** delete them.
- **H-20** · U1 · minor · [43:10803](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-10803) · The Flow C note undercounts taps (see the flow table) and gives no time, though the target is in minutes. · **Fix:** recount (about 50 taps) and add a timed estimate.
- **H-21** · U3 · minor · [45:14771](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-14771) · The toast says "Undo stays for 10 seconds.", which describes the mechanism. · **Fix:** "Maya won't be told for 10 seconds."
- **H-22** · V5 · minor · [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143) · The pay chip reads "$18-$22/hr" (hyphen), while the listing row reads "$18–$22/hr". · **Fix:** an en dash everywhere (formatPay).
- **H-23** · U1 · minor · [46:19491](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-19491) · Repost lands on a confirmation. Spec §7.4 opens the new draft at Review. · **Fix:** open Review directly with a "Dates moved to 2027" notice.
- **H-24** · U3 · minor · [45:16377](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16377), [45:15095](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15095), [45:15853](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15853) · Customer copy uses decision wording ("Plans only. No add-ons.", "There are no add-ons."). Every plan repeats "Host page, hiring tools, and a reply time." · **Fix:** "Every plan includes every hiring tool. Seekers never pay.", and list only what differs (open jobs, seats).
- **H-25** · R1 · minor · [45:15000](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-15000), [45:16289](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-16289), [46:17476](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-17476) · Eleven endings exist at 390 only. Desktop hosts will see them at 1440. · **Fix:** add 1440 versions of applicants offline, billing offline and settings error at least.
- **H-26** · U3/V6 · major · [43:12143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-12143), [46:18691](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-18691) · On "What guests see" (Flow C review) and the public host page, the JobCard's couples line holds the old note ("Shared room, free. Couples can share that room. Two meals a day, free, on work days"). It repeats the three lines above it and wraps to four lines. This is still so after #101 merged. · **Fix:** set the Couples slot to "Couples can share the room".
- **Fixed by #101:** Promote is gone from the Sidebar. The JobCard's Applied state is a secondary button with a check, not a disabled button.

### Page 02 Seeker

- **SE-1** · U1 · **blocker** · [45:7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496), [45:7566](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7566), [45:7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615), [45:7665](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7665), [45:9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) · The listing detail is ten one-line facts. It omits the spec §6 contents: no cover or photos, although the wedge is housing "with photos"; no host preview or link; no description, although the builder tells hosts "Guests read this before they apply"; no schedule, qualifications or perks; no Report or Share. At 1440 it is a full page, not the spec's side panel. · **Fix:**
  - First viewport: cover, then a host row, then a fact block (pay, dates, housing with its 4-photo strip, meals with photos, couples, freshness, reply time).
  - Below: description, schedule, qualifications, perks and fine print, then Report and Share.
  - Keep Skip · Apply · Save pinned.
  - At 1440, draw it as a side panel over Seek.
- **SE-2** · U1/U4 · **blocker** · [45:7834](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7834), [45:8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067), [46:20592](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20592) · The first application is not drawn:
  - The account step offers Google only. Spec §2 adds a magic link or passkey, so a seeker without Google has no path.
  - There is no 18+ confirmation (spec §2; Note B counts it).
  - There is no work-authorization question (spec §9.1: "Hosts see it only on an application").
  - "Can you start on May 15? Yes." is static text, not an input, and there is no review step (spec §10).
  - The prototype jumps from the account step straight to Apply · ready.

  **Fix:** draw at 390, 768 and 1440:
  - an account step with Google, email (with its "Check your email" state) and passkey;
  - one "Confirm you're 18 or older" plus work-authorization screen;
  - Apply · ready with an editable screening answer (RadioGroup Yes/No) and a profile summary with Edit.
- **SE-3** · V6 · major · [42:2685](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2685) · The result count "4 jobs" is 2 px wide, one letter per line, on Seek · results · 390. · **Fix:** set the text to Hug width on one row with Sort and Save this search.
- **SE-4** · U3/V5 · major · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631), [45:6079](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6079) · The Seek and Swipe cards contradict their own listings:
  - Lodge housekeeper: "Private cabin · $140 a week · Breakfast and dinner" against "Cabin, $12 a night · Meals included" on Detail, Map and Alert.
  - Deckhand: "Shared bunk · $90 a week" against "Bunk on the boat, included".
  - Ranch hand: "Bunkhouse bed · $60 a week" against "Bunkhouse, free".

  #101 merged (PR #114) with these values, and its "per week or month" cost cannot say "$12 a night". · **Fix:** set every instance's new slots to that listing's facts (the page 02 README table), and allow a nightly cost in the Housing cost slot.
- **SE-5** · V6 · major · [42:3032](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3032), [42:3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412), [45:6205](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6205), [45:6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310) · The 384 px cover art sits in a 720–736 px cover, so the right half is grey. At 390 it overflows the 358 px cover and is cropped off-center. Every card uses the lake, including the Sitka deckhand. This is still so after #101 merged. · **Fix:** cover media Fill with Fill scaling, and the harbor and farm samples for maritime and farm.
- **SE-6** · R1/V1 · major · [42:3412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-3412), [45:6310](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6310), [45:7615](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7615) · At 1440, Seek, Swipe and Detail are a single 720 px column with about half the canvas empty, and there is no filter rail. · **Fix:** at 1440, a 280 px filter rail, a two-column card grid and a detail side panel. At 768, two columns.
- **SE-7** · U1 · major · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) · Seek has no Filters. Spec §5.2 lists pay with a unit, start date, housing and meals (with Free only), state and sponsors visas, and the wedge says the whole deal is "all filterable". · **Fix:** a Filters IconButton (SlidersHorizontal, as in the gallery's SeekScreen) with an applied count, a Filters sheet at 390 and a rail at 1440.
- **SE-8** · Founder decision 2 · major · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) · Seek is `/` (`src/app/(seeker)/page.tsx`). Its default guest feed shows a Remote chip and the remote Bookkeeper card. Decision 2: "Remote stays off the homepage." · **Fix:** drop Remote from the homepage chips and default feed, and keep it in Filters, `/jobs/remote` and the state pages. Otherwise the lead rules that the feed is not "the homepage".
- **SE-9** · V3/U1 · major · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631), [45:6079](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-6079) · "Confirmed active 2 days ago" and "Work from the US" float between cards as orphan lines. P0-11 puts the dates on the card. · **Fix:** a freshness line slot inside JobCard under the date row (a follow-up to #101).
- **SE-10** · U2 · major · [45:7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496), [45:7834](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7834), [45:8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067), [45:8587](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8587) · Missing endings:
  - Detail: closed or expired (guests arrive from Google), not found, loading, error and offline.
  - Account: sign-in error and cancel.
  - Apply: submitting; "You applied on Nov 10 · View application" (one application per listing, spec §7.3); "This host doesn't sponsor visas. Apply anyway?" (spec §10).
  - Application: every status after Sent (wedge 2).

  **Fix:** draw these at 390 and 1440.
- **SE-11** · U1 · major · [45:7043](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7043) · Map has no map. It is four town buttons and a preview card. Spec §5.1 has pins, clusters and a pull-up list. · **Fix:** a map canvas with 44 px category pins, a cluster, the preview sheet and a pull-up list. Keep the town list as the accessible alternative.
- **SE-12** · FD-8 · major · [46:8604](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-8604) · Browse by State is a button list in no clear order (Alaska, Washington, Montana, Oregon…). FD-8 and spec §5.1 call for an original US state map. · **Fix:** a state map at 768 and 1440 with the search and list below it, and an alphabetical list at 390. If the list stays at 390 only, the lead records that.
- **SE-13** · V2/V5 · major · [45:7496](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-7496), [45:8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067) · All seeker body copy is `text-16/semibold`, so every line weighs the same, and it differs from host body copy (Regular). · **Fix:** add `text-16/regular` (S-1), rebind the seeker body, and keep semibold for fact labels.
- **SE-14** · U2 · major · [42:4429](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-4429) · The Seek loading skeleton is the old three-chip card, but the cards now have a thumbnail and four lines, so loading will jump. · **Fix:** redraw it with the new CardSkeleton (S-13).
- **SE-15** · U3 · minor · [45:8067](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8067) · A first-time seeker reads "Welcome back. This is the job you started." "Saved on this phone." is unclear. · **Fix:** "You're signed in. Finish applying to Lodge housekeeper.", and drop the saved line or say what is saved.
- **SE-16** · U3 · minor · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) · The sort reads "Best match" where the spec says "Relevant". The homepage heading is "Find work", not the spec §21 line "Built for seekers, by seekers." · **Fix:** use the spec terms.
- **SE-17** · V1 · minor · [45:8200](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8200), [45:8587](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-8587) · Apply sent and Application status are stacks of equal 16 px lines, so the status and reply time don't stand out. · **Fix:** a status Badge with an icon at the top, and the facts as a two-column list.
- **SE-18** · U5 · minor · [46:21279](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-21279), [46:20914](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=46-20914) · The desktop TopBar link has no current state (README gap 6). In the prototype, Apply on Alaska, Wyoming and Idaho and "Message the host" go nowhere. · **Fix:** expose Current on TopBar link, and wire these links.
- **SE-19** · V6 · minor · [42:2631](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=42-2631) · Host logos show initials (KR, HC, RR, NO), although the system has `kettle-ridge-logo`. The Remote card keeps an empty grey 188 px cover. · **Fix:** use the logo sample, and collapse the cover when a job has none.
- **SE-20** · V4 · minor · [45:9597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=45-9597) · Only one seeker frame is in Dark. The token pairs pass (computed), but dark covers and badges are unreviewed. · **Fix:** add Dark for Seek, Apply · ready and Application status at 390.
- **SE-21** · R1 · minor · pages 01 and 02 · There is no 320 px frame. By estimate the top bars fit (about 281 to 287 px), but the 384 px cover instance and the chip rows need a check. · **Fix:** add 320 frames for Seek, Detail and Builder · Basics.

## Audit 1 recheck

| Id | Status now | Evidence |
|---|---|---|
| F-1 type scale | Open | Still 11 sizes and 23 styles (S-1) |
| F-2 category vs status | **Fixed** (solids) | #85 approved 2026-11-11; Figma variables changed; code in #86. New neutral-Seasonal issue: S-8 |
| F-3 top bar widths | Partly fixed | 01 and 02 draw signed-out and desktop bars; page 00 unchanged (S-3) |
| F-4 dark and missing first-run states | Open | S-9 |
| F-5 passkey, live capture | Open | S-10 |
| F-6 Clerk look | Open | S-11; `src/ui/clerk.ts` has no `buttonArrowIcon` rule |
| F-7 half-step spacing | Open | `space/0_5`, `1_5`, `2_5`, `3_5` still in Spacing |
| F-8 radius md vs lg | Open | `radius/lg` is still 14 |
| F-9 icon sizes | Open | No change in `src/ui` icons |
| F-10 badge tones | Closed by decision | Top bar A has no role badge |
| F-11 widows | Open | First run unchanged |
| F-12 footer orphan | Open | `AuthFrame.tsx:18` still `flex-1` |
| F-13 footer copy | Open | `onboarding/page.tsx:56` and `sign-up page.tsx:21` still differ |
| F-14 desktop split layout | Open | First run unchanged |
| C-1 guest action lost | **Fixed** | #82 (6784631) |
| C-2 15 px text | **Fixed in code** | 389adef, 8b6c979; Figma lags (S-2) |
| C-3 steps in URL | **Fixed** | `OnboardingForm.tsx:10` (`?step=`) |
| C-4 Clerk loading skeleton | Open | No `ClerkLoading` in `src/app` |
| C-5 axe excludes Clerk | Open | `shells.spec.ts:175` |
| C-6 offline/denied patterns | Open in code | Pages 01 and 02 draw offline screens; no system pattern (S-4) |
| C-7 Applied disabled | **Fixed in design**, open in code | #101: Applied is a secondary button with a check; `JobCard.tsx:226` still disables it |
| C-8 competing Apply primaries | **Fixed in design** | 01 and 02 feeds use the secondary Apply; the reference screen is unchanged |
| C-9 Starting soon, save search | **Fixed in design** | Seek has both; the reference screen is unchanged |
| C-10 Saved state | Open | `IconButton.tsx:19` unchanged |
| C-11 age step heading | Open | The heading is still the tagline ([21:2372](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2372)) |
| C-12 role can't change | Open | `OnboardingForm.tsx:284` |
| C-13 button icons | Open | Clerk caret unchanged |
| C-14 field errors, request id | Open | No `requestId` in `OnboardingForm.tsx` |
| C-15 checkbox description | Not re-verified | `Checkbox.tsx:29` still sets `aria-describedby` |
| C-16 meta description, theme color | Open | `layout.tsx:14` |
| C-17 gallery line length | Open | `design-system/page.tsx:104` |
| C-18 reference top bar | Open | `shells.tsx` unchanged |
| K-1 retried PUT/DELETE 409 | **Fixed** | 2e75d81 (#84) |
| K-2 bbox index | **Fixed** | `drizzle/2030_discovery.sql` |
| K-3 occurred_at index | **Fixed** | `drizzle/2030_discovery.sql` |
| K-4 one bad listing stops sync | **Fixed** | 2e75d81, 92353bb |
| K-5 export gaps | **Fixed** | 2e75d81 |
| K-6 view inflation | **Fixed** | 2e75d81: keyed by address, boost claim refused, address limit |
| K-7 quota race test | **Fixed** | `dispositions.int.test.ts:34` |
| K-8 tombstone on clear | Not re-verified | `dispositions.ts` changed in 2e75d81 |
| K-9 late events | Open | `events.ts` unchanged |
| K-10 keyset and count | Not re-verified | `search.ts` changed in d418389 |
| K-11 suggest scan | Open | No pg_trgm index |
| K-12 viewer hash erase | Not re-verified | `viewer.ts` changed in 2e75d81 |
| K-13 unsigned cursor | Partly fixed | d418389 binds cursors to the query; still unsigned |
| K-14 founding backfill | Open | `1060_orgs_founding_cohort.sql` unchanged |

## Scorecard

A rule fails when a blocker or major sits under it; minor findings alone pass. A1, A2, A4 and P1 to P3 cannot be measured in a design file, so they are not scored.

| Page | Pass | Fail | Rules |
|---|---|---|---|
| 00 System | 6 (V1, V3, U3, U4, U5, A3) | 7 (V2, V4, V5, V6, U1, U2, R1) | 13 scored |
| 01 Host | 4 (V1, V3, A3, R1) | 9 (V2, V4, V5, V6, U1, U2, U3, U4, U5) | 13 scored |
| 02 Seeker | 3 (V1, U5, A3) | 10 (V2, V3, V4, V5, V6, U1, U2, U3, U4, R1) | 13 scored |
| Founder decisions | 4 (top bar A; plans only, no add-ons; Browse by State includes remote; palette #85) | 2 (Remote off the homepage, SE-8; state map, SE-12) | |

**Findings:** 5 blockers, 36 majors, 19 minor (page 00: 0 / 9 / 4; page 01: 3 / 15 / 8; page 02: 2 / 12 / 7).

## The three changes that would most raise quality

1. **Finish the two screens every seeker touches.** Draw the listing detail to spec §6, with photos, the description and the host (SE-1), and the real first application: email or passkey plus Google, 18+, work authorization and editable screening answers (SE-2). Flows A and B are the product's front door.
2. **Make the builder collect the whole deal it promises.** Add meal inputs, the housing cost period and the screening questions, or have the lead cut fields explicitly (H-1). Then re-time Flow C against 15 and 25 minutes.
3. **Draw the endings and separate category from status.** Applicant, publish, detail and apply endings, permission denied and the paused listing (H-9 to H-12, SE-10). A colored Seasonal badge, and status badges with icons (S-8, H-14).

Next in line: remove builder copy and fix the guest Pricing actions (H-2, H-3, H-24), and the 1440 layouts (SE-6).
