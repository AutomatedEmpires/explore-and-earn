# UX copy deck

**Status:** draft for founder review. Designers and builders use the quoted strings as the source of copy. Nothing here is locked until the founder says so.

**Covers:** Seek, Swipe, Map, Browse by State, listing detail, apply; the listing builder; billing and `/pricing`; team and join; settings; the host page (editor and public); sign-in and onboarding; every email and push.

**Does not cover:** operator-console screens, Community posts, the hiring pipeline, or landing-page essays. Those surfaces appear only where a seeker or host meets them from a screen in scope (a sign-in prompt, a notification, a footer).

## How to use a string

- Text in quotation marks is the exact string. Fill `[brackets]` from live data. Never ship the brackets.
- A button names the outcome. "Publish listing", "Save job", "Update payment method". Not "Submit", "OK", or "Click here".
- One primary button per screen. Everything else is quieter.
- Counts use the real number. "1 job", "12 jobs", "10,000+ jobs", "No open jobs". Never a sample count, and never "0" where this deck says "No open jobs".
- Seekers see **job**. Hosts, inside the workspace, see **listing**. The public host page says **job**, because a seeker is reading it.
- Write the product name **Explore&Earn**, with the ampersand, everywhere.

## Voice

From the product design, section 21, and quality bar U3 (issue 45, comment "Quality bar v1"):

- Plain, warm, and specific. Address the reader as "you".
- Active voice. Say what happened and what to do next.
- Outdoorsy without being cute. No pile-up of exclamation marks. No emoji in the interface. Reactions in Community are the only exception, and they are out of scope here.
- Housing and meals are never implied for every job. The standing line is "some with housing and meals."
- The subscription badge is not a trust mark. Its tooltip is only "Active Explore&Earn host since [date]". Do not write "Verified", "Trusted", or "Background-checked" on that badge. Business verification uses different words, in Settings.
- Certifications on a seeker profile are "Self-reported". Nothing in the interface implies Explore&Earn checked them.

Lines that already have a home:

| Where | Line | Source |
|---|---|---|
| Seek, for a guest | Built for seekers, by seekers. | Product design §21 |
| Under that | Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever. | Product design §21 |
| Seeker sign-up and onboarding | Work worth going somewhere for. | Product design §21 |
| State, destination, and genre pages, and this deck's job-alert emails | Explore the country. Earn as you go. | Product design §5.3 and §21 |
| `/pricing` | Hire people who want to be there. | Product design §21 |

## Facts the copy is allowed to state

Prices and limits are the approved ones. Do not round them or invent a sale.

| Plan | Monthly | Annual (10× monthly) | Live listings | Seats | Invites / month | Extra listing slot |
|---|---:|---:|---:|---:|---:|---:|
| Starter | $99 | $990 | 2 | 1 | 10 | $39 / month, $390 / year |
| Professional | $299 | $2,990 | 10 | 5 | 50 | $29 / month, $290 / year |
| Enterprise | $599 | $5,990 | 30 | 15 | 150 | $19 / month, $190 / year |

Source: product design §16 and FD-6. Annual is 10× monthly. An extra slot on an annual plan is 10× its monthly price, because one subscription uses one interval (`src/modules/billing/plans.ts`).

Support, same on the three cards: Starter is "Help center and email". Professional is "Priority help". Enterprise is "Priority help and guided onboarding". Every plan includes the host page, analytics, and fit scoring. Tiers differ in listings, invites, seats, and support (product design §16).

Boost and announcement prices, for receipts only: Boost is $49 for 7 days, $79 for 14 days, $99 for 28 days. Announcements are $49, $99, or $149 for 1, 3, or 5 a month, and each runs 7 days (FD-6). Extra invite packs and extra seats have no approved price (product design §26, FD-6). Do not show a price, a stepper, or a buy button for them.

Founding hosts (FD-7, and the 10 November note on issue 45 that the discount is the plan only):

- The first 100 host organizations by signup qualify. Staff do not each qualify. Organization 101 pays the regular price.
- The shape is fixed by the first paid subscription. Monthly: 50% off the plan for the first six subscription months, starting when that subscription activates, not on the day the organization was created. A tier change inside those six months keeps 50% off the new monthly price and does not restart the six months. Annual: 50% off the first annual term. Switching interval does not open a second discount.
- The discount never applies to add-ons or extra listing slots. Those stay full price.
- There is no free period and no "30% off for life". The coupon `founding_30_forever` is retired (`src/modules/billing/plans.ts`). A founding code is retired too: signup order decides the cohort, and checkout ignores a code (`src/modules/billing/founding-codes.ts`).

Seekers pay nothing (product design §16). Seekers must be 18 or older (product design §2). One account is one role: seeker or host, chosen once, and not changed later (FD-1).

## Strings this deck retires

Do not put these on a screen, in an email, or on a push:

| Retired | Use instead | Why |
|---|---|---|
| Founding host · 30% off for life | The founding lines in Billing | FD-7 replaced the 3 November offer. The SP2 screen table still names the old line. |
| 90 days free, then 30% off | The six-month or first-year lines | Same decision. |
| Founding code, and "Enter your founding host code to subscribe before launch." | No code field | Signup order decides the cohort. Checkout ignores a code. |
| That code isn't valid. / Founding spots are all taken. | The cohort lines in Billing | Those errors belonged to the code field. |
| Your free period ends soon. / Your free period runs until [date]. | Do not send, unless Stripe actually has a trial that is not the founding offer | FD-7 has no introductory free period. |
| Verified host, Trusted host | Active Explore&Earn host since [date] | FD-4. The badge means an active subscription. |
| All 1 seats are used | Your seat is in use | The SP2 test string is ungrammatical at one seat. See Team. |
| Sample state counts, including any fixed "31 open jobs" | Live counts, or "No open jobs" | FD-8. |

## Shared states

Use these unless a screen below gives its own sentence.

| State | Copy | Recovery |
|---|---|---|
| Loading | No sentence. A skeleton in the shape of the content. Layout does not jump. | — |
| Offline page | You're offline. / Jobs load again as soon as you have signal. | Try again |
| Could not reach the server | We could not reach Explore&Earn. Check your connection and try again. | Try again |
| Our error | Something went wrong on our side. Try again in a moment. | Try again |
| Too many attempts | Too many attempts. Wait a few minutes, then try again. | — |
| Saved | Saved | Toast, then it leaves |
| Permission, seeker action by a host or operator | Saving and applying need a seeker account. | — |
| Not signed in | The sign-in sheet for that action. See Sign-in. | Sign in, or Create account |

Email frame, every message (`src/modules/notifications/email/templates/Layout.tsx`):

- Wordmark: Explore&Earn
- Footer line on account, billing, security, and hiring mail: Work worth going somewhere for.
- Footer line on job alerts, the weekly digest, and "a host you follow posted a job": Explore the country. Earn as you go.
- Optional mail: Manage notifications · Unsubscribe, then the mailing address from `business.mailing_address`. Do not invent the address in the template.
- Security and billing mail cannot be turned off (product design §14). Those messages show Manage notifications and the mailing address, and this line instead of Unsubscribe: "Security and billing email stays on."
- There is no SMS at launch (product design §14).

A single notice email uses the in-app title as the subject (`send.ts`). The button opens an app path. Opening the email never changes anything.

Push uses the same title and body as the in-app row, and opens the same path. No emoji. If a row below gives a shorter push line, use that on the lock screen and keep the longer body in the app and the email.

---

## Sign-in and onboarding

**Job:** get into the right shell without a password, then choose seeker or host once.

Sign-in is email magic link, passkey, or Google. No password field (product design §2). The frames below are the strings already set in `src/ui/clerk.ts`. The page title is "Sign in · Explore&Earn".

| | Title | Subtitle |
|---|---|---|
| Sign in | Sign in to Explore&Earn | Welcome back. Pick up where you left off. |
| Create account | Create your Explore&Earn account | Work worth going somewhere for. |

Method buttons, in this order, when Clerk's labels are set:

| Button | Notes |
|---|---|
| Continue with Google | — |
| Use a passkey | — |
| Email me a sign-in link | Label: Email. Help: We'll send a link. It expires, and you can ask for another. |
| Create account | On the sign-in screen, under the form. |
| Sign in | On the create-account screen, under the form. |

| State | Copy |
|---|---|
| Link sent | Check your email for a sign-in link. |
| Link expired | That link has expired. Email me a new one. |
| Google or passkey failed | We couldn't sign you in. Try again, or email yourself a link. |
| Loading | Skeleton of the card. No spinner sentence. |

Do not write "password", "username", or "welcome back!!!" .

### Onboarding

Already built in `src/app/onboarding/OnboardingForm.tsx`. Keep these words. The founder approved the as-built first-run screens (issue 45).

**Choose.** Title: Welcome to Explore&Earn. Body: How will you use Explore&Earn? This sets up your account, and it can't be changed later.

| Choice | Description |
|---|---|
| I'm looking for work | Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever. |
| I'm hiring | Post jobs and hire people who want to be there. |

**Seeker.** Title: Work worth going somewhere for. Body: Explore&Earn is for adults. Confirm your age to start exploring jobs, some with housing and meals.

| Field | Copy |
|---|---|
| Checkbox, required | I'm 18 or older |
| Unchecked | Confirm you are 18 or older to continue. |
| Button | Continue |

**Host.** Title: Name your organization. Body: Seekers see this name on your listings and your host page. You can invite your team once you are in.

| Field | Copy |
|---|---|
| Label | Organization name |
| Help | For example, Kettle Ridge Lodge. |
| Validation | Enter a name between 2 and 80 characters. |
| Button | Create organization |

Shared form errors, already in the form: Check the form and try again. Too many attempts. Wait a few minutes, then try again. Something went wrong on our side. Try again in a moment. We could not reach Explore&Earn. Check your connection and try again.

Back is available until the choice is saved. After it is saved, there is no control to switch role.

Owners and Admins must add a passkey or two-step sign-in before they continue (product design §2). Title: Add a passkey to protect your organization. Body: You can also use two-step sign-in. You need one of them before you manage billing, the team, or publishing. Buttons: Add a passkey. Use two-step sign-in.

---

## Seek

**Route:** `/`. **Job:** find a paid job worth traveling for, then open it.

Guest header, above the feed: Built for seekers, by seekers. Then: Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever.

| Control | Label |
|---|---|
| Search | Search jobs, places, and employers |
| Search groups | Jobs, Places, Employers |
| Category chips | Maritime, Seasonal, Farm, Remote. Pressed state is announced. |
| Quick chip | Starting soon |
| Filters | Filters, with the count when any are on: Filters, 3 |
| Sort | Sort. Options: Relevant, Newest, Distance. Relevant is the default. |
| Distance unavailable | Share your location or pick a state to sort by distance. |
| Result count | 1 job. 1,248 jobs. 10,000+ jobs. |
| Alerts | Save this search. The control is a bell. |
| More results | Load more |
| End of the list | That's every match. |

### Filters

Sheet title on a phone, rail title on a desktop: Filters. Button that applies them: Show jobs. Button that resets: Clear all.

| Filter | Label | Help |
|---|---|---|
| Pay | Pay | Unit switch: Hour, Day, Year. Hour is $0–$60. Day is $0–$500. Year is $0–$150,000. Zero means no pay filter. |
| Start | Starts | Within 1 month, Within 3 months, Within 6 months, or a season: Spring, Summer, Fall, Winter, Year-round, plus the year. |
| Housing | Housing provided | Switch: Free only |
| Meals | Meals provided | Switch: Free only |
| Category and genre | Category, Genre | Genres are the settings in product design §3, such as Ski resorts. |
| State | State | — |
| Visas | Sponsors visas | — |

Active filters sit above the feed as removable chips, using the same words: Housing provided, Free only, Sponsors visas, Starting soon, Colorado.

| State | Copy | Recovery |
|---|---|---|
| Loading | Four card skeletons | — |
| Empty | No jobs match these filters. | The chips, each removable, and Clear all. Do not quietly drop a filter. |
| Error | We couldn't load jobs. | Try again |
| Job closed between search and Save | This job just closed. | Toast |

### The job card

Same card on Seek, Map, Browse-by-State results, and the listing panel (product design §4).

| Slot | Copy |
|---|---|
| Badge | Maritime, Seasonal, Farm, or Remote. Plus Boosted when the placement is paid. |
| Title | The position. It is the link. |
| Host | Organization name, then the subscriber badge when the host is paying. |
| Badge tooltip | Active Explore&Earn host since [Nov 3, 2026]. |
| Info | Starts today. Starts tomorrow. Starts in 12 days. Begins Jun 1. Begins now. Summer 2027. Then Ends Sep 30, or Ongoing. |
| Housing chip | Label Housing. Value Housing ✓ Provided, or No housing. |
| Meals chip | Label Meals. Value Meals ✓ Provided, or No meals. |
| Pay chip | Label Pay. Value in the host's unit: $19/hr, $19–$22/hr, $150/day, $800/wk, $3,200/mo, $12,000/season, $52,000/yr. From $10,000 the card face may shorten to $52k. The pop-up and the detail page always show the full amount. Crew share: Crew share · est. $1,200–$2,000/wk, or Crew share when there is no estimate yet. |
| Buttons | Skip. Apply. Save. Apply is the primary. |

Housing ✓ Provided is the green value whenever housing is offered, free or paid. The pop-up's first line is the cost: Free, or $150/week · deducted from pay, or $150/week · paid directly. The pop-up never says the job is unpaid work.

No match percentage on a job card. Fit is host-side only.

### Saved search

First save of a search, toast: Alerts on for [Ski resorts · CO · Housing provided]. Button: Manage. Manage opens `/profile/alerts`.

Limit: You can have up to 20 job alerts. Remove one to add another.

Saved jobs limit, if they hit it from this screen: You've saved 1,000 jobs. Remove some to save more.

### Sign-in sheet

Title by the action they started:

| Action | Title |
|---|---|
| Save | Sign in to save jobs |
| Apply | Sign in to apply |
| Skip | Sign in to hide this job |
| Bell | Sign in to get job alerts |

Buttons: Sign in. Create account. Body, one line: We'll bring you back to this job.

A host who signs in instead: Saving and applying need a seeker account. After sign-in, a host who started a save gets the toast Saving jobs needs a seeker account. Signing in never submits an application.

### Install sheet

Not on the first view, and never on top of another sheet. Title: Add Explore&Earn to your Home Screen. First line alternates: Work worth going somewhere for. and Explore the country. Earn as you go. Body: Open your saved jobs and alerts in one tap.

| Platform | Buttons and steps |
|---|---|
| Android and other Chromium | Add to Home Screen. Not now. |
| iPhone and iPad | 1. Tap Share. 2. Choose Add to Home Screen. Then Got it. Not now. |

iOS, when they just saved a search: On iPhone and iPad, push alerts for your saved searches need Explore&Earn on your Home Screen. Email alerts work either way.

### Job alerts page

`/profile/alerts`. Title: Job alerts.

| Control | Label | Help |
|---|---|---|
| Each search | Its name, then a one-line summary | Switches: Push. Daily email. |
| Delete | Remove alert | Confirm: Remove this alert? You can save the search again from Seek. Buttons: Remove alert. Keep alert. |
| Weekly | Weekly digest | Help: One email on Monday with the newest matches from the past week. Off until they turn it on. |

Empty: Tap the bell on any search to get alerts for new jobs. Button: Find jobs.

On iPhone and iPad, outside the installed app, under the list: On iPhone and iPad, push alerts need Explore&Earn on your Home Screen. Link: How to add it.

---

## Swipe

**Route:** `/swipe`. **Job:** decide on one job at a time, without applying by accident.

Buttons under the card, and the same as the gestures: Skip. Apply. Save. Apply is the primary. An info button on the photo is named Open job details.

First visit, dialog title: Swipe through jobs. Body: Skip sends it left. Save sends it right. Apply opens the application, and it does not send it. You can undo a skip or a save for 10 seconds. Button: Start swiping.

Live announcement after an action: Skipped Lift operator at Kettle Ridge Lodge. Undo available for 10 seconds. The toast has Undo. Undo never touches an application.

| State | Copy | Recovery |
|---|---|---|
| Loading | One card skeleton. Gestures off. | — |
| Seen them all | You've seen every job that matches. | Change filters. Saved jobs. |
| Error | Same as Seek | Try again |
| Reduced motion | The card fades. It does not fly off. | — |

Keyboard, for the accessible names: Left arrow skips, right arrow saves, up arrow opens Apply, Enter opens details, U undoes.

---

## Map

**Route:** `/map`. **Job:** see which hosts are hiring near a place, then open that host or a job.

| Control | Label |
|---|---|
| Near me | Jobs near me |
| Filters | Same Filters control as Seek |
| Pull-up | 12 jobs in this area. The list is the alternative to the map, and it is always available. |
| Pin | Named with the host, the place, and the count: Kettle Ridge Lodge, Estes Park, 3 jobs. |
| Cluster | 8 hosts |

Host preview:

| Piece | Copy |
|---|---|
| Place | City and state, or Approximate location when the pin is rounded |
| Hiring | Hiring now, only while a listing is active |
| Count | 3 active jobs. Then, under it, 2 matching jobs for the ones that fit the filters. |
| Remote pin | Remote · host based in Estes Park, CO · work from: US. Up to five state codes, then +N more. |
| Button | View page |

| State | Copy | Recovery |
|---|---|---|
| Map loading | Map skeleton. The list stays usable. | — |
| Map failed, or no WebGL | The map couldn't load. Here's the list instead. | The list fills the screen. Filters still work. |
| Empty area | No jobs in this area. Zoom out or change filters. | Zoom out. Change filters. |
| Location denied | We can't use your location. Search a place, or browse by state. | Browse by state |

The map does not use Browse by State's artwork, and Browse by State does not use this map (FD-8).

---

## Browse by State

**Route:** `/states`. **Job:** open the jobs in one state, from real listing counts.

Title: Browse jobs by state. Page title: Browse jobs by state. Intro: Pick a state. The count is the number of open jobs there, including remote jobs you can do from that state.

That last clause is the founder's default on issue 45: remote jobs open to the whole US count in every state. If that default changes, change this sentence and the count together.

| Surface | Copy |
|---|---|
| A state link, map or list | Colorado, 12 jobs. Wyoming, no open jobs. The visible count is 12 jobs or No open jobs. The accessible name lowercases the count: Colorado, 12 jobs. Wyoming, no open jobs. |
| One job | 1 job |
| Capped | 10,000+ jobs |
| Zero | No open jobs. Not "0". |
| Nothing open anywhere | No open jobs anywhere yet. Each state still reads No open jobs. |
| Counts failed | Job counts couldn't load. Try again. No digits on the state links. The links still open Seek. |
| Phone | The alphabetical list comes first. Every row is at least 44 px. The map stays on the page as well as the list. |
| Opening a state | Seek at `/?state=CO`, with Seek's own empty state if that state has no jobs: No jobs match these filters. |

Do not ship a made-up count. Do not request a Mapbox map on this page.

Entry label, wherever the approved design puts it: Browse by state.

---

## Listing detail

**Route:** `/jobs/view/[id]/[slug]`, or the side panel from Seek, Swipe, and Map. **Job:** decide whether to apply, with housing, meals, and pay stated.

Pinned bar: Skip. Apply. Save. Same words as the card. On a saved job, Save becomes Remove. Help on Remove: Remove from saved jobs.

| Block | Heading or line |
|---|---|
| Host | Name, logo, subscriber badge with the same tooltip, link to the host page |
| About | The job |
| Lists | Responsibilities. A typical day. |
| Schedule | Schedule and dates |
| Pay | Pay. The full amount, then overtime, tips, bonuses, how often pay is issued, and deductions. |
| Housing | Housing. If not provided: No housing. If provided: the cost line, the note, the fine print, and four photos labeled Bedroom, Bathroom, Kitchen, Exterior. |
| Meals | Meals. Same pattern. Photos: Kitchen, Meal example, Dining area, Other. |
| Qualifications | Required. Preferred. Certifications. Physical demands. Minimum age [18]. |
| Perks | Perks |
| Category | The genre fields, labeled in plain words (Vessel type, Season, Harvest window, States you can live in). |
| Activity | Confirmed active today. Confirmed active 1 day ago. Confirmed active 12 days ago. If the host has not confirmed: Posted today. Posted 3 days ago. |
| Closed | Banner: This job is closed. No Apply. The host link stays. |
| Removed or unknown | The not-found page. We couldn't find that job. Button: Browse jobs. |

Additional step, when the host added one: the host's note, then Open the employer's form.

Off-site dialog: You're going to [kettle-ridge.example], which isn't part of Explore&Earn. Never pay to get a job. Buttons: Continue. Cancel. Continue opens a new tab.

Share: the system share sheet, or the toast Link copied.

Report is the SP4 sheet. Reason required. Details optional, 1,000 characters. After send: Thanks. We review every report. Button: Done.

| State | Copy |
|---|---|
| Loading | Skeleton of the header, three lines, and the pinned bar |
| Error | We couldn't load this job. Try again. |

---

## Apply

**Route:** `/apply/[listingId]`. **Job:** send one application, on purpose, after reading it.

Three steps. The stepper reads: Your profile. Questions. Review.

A gesture, a sign-in, or the Back button never submits.

### Step 1. Your profile

Title: Your profile. Body: This is what [Kettle Ridge Lodge] receives. It is your Explore&Earn profile, not an uploaded file.

Show the snapshot. Missing required fields are inline, not on a later error page.

| Field | Label | Help | Validation |
|---|---|---|---|
| First name | First name | — | Enter your first name. |
| Last name | Last name | Hosts see this after you apply. | Enter your last name. |
| City | City | — | Enter your city. |
| State | State | — | Choose a state. |
| Work authorization | Work authorization | Hosts see this on your application. Options: Authorized to work in the US. I'll need visa sponsorship. I already have a visa. | Choose one. |
| Visa type, if they have one | Visa type | Options include J-1, H-2A, H-2B, and Other. | Choose a visa type. |
| Visa end | Visa ends | — | Enter the end date. |

Button: Continue.

### Step 2. Questions

Title: Questions. One screen per question on a phone, the list on a desktop. The host wrote the prompt. Required questions say Required.

| Kind | Control | Validation |
|---|---|---|
| Short answer | Text area, 1,000 characters | Answer this question. / Shorten this to 1,000 characters. |
| Yes or no | Yes. No. | Choose yes or no. |
| One choice | Radio list of the host's choices | Choose one. |
| Several choices | Checkboxes | Choose at least one. |

Buttons: Back. Continue. If there are no questions, skip this step and do not show an empty form.

### Step 3. Review

Title: Review your application. Repeat the profile summary, the answers, and the job's title, host, place, pay, housing, and meals.

Checkbox, only when the listing has an additional step: I completed the employer's form. Help: You can still apply if you haven't. The host sees your answer.

Button: Submit application.

Sponsorship dialog, when the job does not sponsor and the seeker needs sponsorship: This host doesn't sponsor visas. Apply anyway? Buttons: Apply anyway. Go back.

Changed dialog: This listing changed while you were applying. Review the changes before you submit. Button: Review changes. That returns them to step 3 with the new snapshot. The previous answers stay.

### Receipt

Title: Application sent. Body: [Kettle Ridge Lodge] has your application for [Lift operator]. You can withdraw it any time before you're hired.

| Piece | Copy |
|---|---|
| Status | Applied |
| Additional step, if any | The host's note, Open the employer's form, and the same checkbox |
| Button | See the application |
| Secondary | Keep looking |

### Refusals

| Case | Copy | Recovery |
|---|---|---|
| Host account | Hosts can't apply. Sign in with a seeker account. | Sign in |
| Already applied | You already applied for this job. | See the application |
| Closed | This job is closed. | Browse jobs |
| They blocked the host | You blocked [Kettle Ridge Lodge]. Unblock to apply. | Unblock |
| Host blocked them | You can't apply to this host's listings. | Browse jobs |
| Resume file not ready | We can't attach that file yet. Use your Explore&Earn profile. | Use my profile |
| Over the daily limit | You can send 30 applications a day. Try again tomorrow. | — |

### Withdraw

On the application: Withdraw application. Dialog: Withdraw your application to [Kettle Ridge Lodge]? They keep the copy you sent, and the conversation stops. Reason, optional: I took another job. The dates no longer work. I applied by mistake. Other. Buttons: Withdraw application. Keep application.

Toast: Application withdrawn.

---

## Listing builder

**Job:** publish one honest listing, with housing and meals chosen on purpose.

### Start

`/host/listings/new`. Title: New listing.

| Card | Title | Body |
|---|---|---|
| Blank | Start blank | Write it section by section. |
| Copy | Copy a past listing | Dates are cleared. Photos and questions come with it. |
| Paste | Paste a job post | We'll fill the fields. You check each one before it can publish. |

Paste label: Job post. Help: Paste the text. We don't invent pay, housing, meals, or dates. Button: Fill from this post.

Paste loading: skeleton, no sentence. Failure: We couldn't read that post. Start blank instead. Button: Start blank.

AI-filled fields wear a badge until edited or confirmed: Check this.

### The rail

Sections, in order: Start, Basics, Where and when, Pay, Housing, Meals, Genre details, The job, Photos, Applying, Review. A finished section says Done.

Mobile: one section per screen. Buttons: Back. Next. Preview. Desktop: the rail, the form, and a live card.

Autosave: no button. Toast: Saved. While offline: Not saved yet · Retrying. Conflict banner: Someone else saved this section. Buttons: Use theirs. Keep mine.

### Basics

| Field | Label | Help | Validation |
|---|---|---|---|
| Title | Job title | Seekers see this first. 5 to 80 characters. | Enter a title between 5 and 80 characters. |
| Category | Category | Maritime, Seasonal, Farm, Remote | Choose a category. |
| Genre | Genre | The setting, such as Ski resorts. | Choose a genre for this category. |
| Second category | Second category | Optional. | — |
| Occupation | Occupation | The role, such as Lift operator. | Choose an occupation. |
| Openings | Openings | 1 to 999 | Enter at least 1. |
| Engagement | Employee or contractor | Paid work only. | Choose one. |
| Time | Full time or part time | — | Choose one. |

### Where and when

| Field | Label | Help | Validation |
|---|---|---|---|
| Place | Location | A saved location, or a new one. Remote: where the worker may live. | Choose one of your current locations. |
| Remote states | States the worker may live in | US only. Whole US, or the states you check. | Choose at least one state, or the whole US. |
| Dates | Dates | Fixed dates, a season and year, or ongoing. | The end date has passed. |
| Weekly hours | Weekly hours | 1 to 120 | Enter weekly hours. |
| Commitment | Minimum commitment | Optional. How long someone needs to stay. | — |

### Pay

| Field | Label | Help | Validation |
|---|---|---|---|
| Amount | Pay | A single amount or a range. | Give a clear amount, or a range where the top is at most 2.5 times the bottom. |
| Unit | Per | Hour, day, week, month, season, year, or crew share | Choose a unit. |
| Crew share | Estimated range | Required for crew share. Seekers see "est." | Same vague-pay sentence. |
| Extras | Overtime, tips, bonuses | Optional. Say how each one works. | — |
| Issued | Pay is issued | Weekly, biweekly, monthly, or at the end of the season. | Choose how often. |

Warning, not a block: This looks below the minimum wage in [WA]. Check it before you publish. For a remote job with no state: This looks below the minimum wage in the US. Check it before you publish. Checkbox to continue: I checked the pay.

### Housing and meals

Housing first. The meals section uses the same shape.

| Field | Label | Help | Validation |
|---|---|---|---|
| Offered | Housing | Provided, or not provided. There is no "unknown". | This is required. |
| Cost | Cost | Free, or an amount. | Say what housing costs, or mark it free. |
| Period | Charged | Per night, week, month, or season. | Choose one. |
| How it's paid | Paid | Deducted from pay, or paid directly. | Choose one. |
| Type | Type | Dorm, shared room, private room, cabin, RV site, or berth on board. | Choose a type. |
| Note | Card note | 80 characters. This is the pop-up seekers open from the card. | Shorten this to 80 characters. |
| Fine print | Fine print | Roommates, pets, couples, Wi-Fi, utilities. 1,000 characters. | — |
| Photos | Bedroom, Bathroom, Kitchen, Exterior | Four photos, each required when housing is provided. | Choose another photo. |

Meals: Meals provided. Meals per day. Which days. Cost, with Say what meals cost, or mark them free. Photos: Kitchen, Meal example, Dining area, Other. Fine print help: Dietary needs.

Photo mismatch warning: This doesn't look like a bathroom. (The article and the slot name change: a bedroom, an exterior, a meal example.) Buttons: Replace photo. Keep photo. Help on Keep: Keeping it sends the listing to review.

### The job

| Field | Label | Help | Validation |
|---|---|---|---|
| Description | Description | At least 50 characters. | This is required. |
| From bullets | Draft the description | Button. We use only the bullets you type. We don't add pay, housing, meals, or dates. | Writing help isn't available right now. |
| Responsibilities | Responsibilities | Up to 20. | — |
| A typical day | A typical day | Optional. 2,000 characters. | — |
| Required | Required qualifications | Up to 15. | — |
| Preferred | Preferred qualifications | Up to 15. | — |
| Skills | Skills | These feed fit. They do not show on the card face. Up to 30. | — |
| Certifications | Certifications | Up to 15. Seekers' own certifications stay self-reported. | — |
| Physical demands | Physical demands | Optional. | — |
| Minimum age | Minimum age | 18 or older. Default 18. | Enter an age from 18 to 99. |
| Perks | Perks | Checklist. | — |
| Visas | Visa sponsorship | Not available. J-1 through a sponsor organization. H-2A. H-2B. | Choose one. |

Prohibited wording, on any text field, naming the phrase they used: Remove "US citizens only". You can ask about visa sponsorship instead.

### Photos

Cover, required: Cover photo. Help: The first thing seekers see. Gallery: Gallery, up to 8. Button: Add photo. Scanning: Checking this photo. Rejected: Choose another photo.

### Applying

| Field | Label | Help | Validation |
|---|---|---|---|
| Questions | Screening questions | Up to 10. Short answer, yes/no, or multiple choice. Each can be required. | The prompt is at most 200 characters. A multiple choice needs 2 to 10 choices. |
| Additional step | Also send them to your form | Optional. Note plus an https link. | Use a secure https link to a site we can check. Link shorteners aren't allowed. |
| Deadline | Application deadline | Optional. The listing stays open after this date. People just can't apply. | The application deadline has passed. |
| Notify | Who to notify | Team members who should hear about applicants. | — |

### Review

Title: Review. Show the card, the three pop-ups, and the detail page.

Slot line, first publish: Uses 1 of your [10] listing slots. An edit of a live listing: Already uses 1 of your [10] listing slots.

Blocking issues list the check messages above, each linked to its section. Warnings need the acknowledgement checkbox.

Button: Publish listing.

Without a plan that can publish: Choose a plan before you publish. Button: See plans. Drafts do not use a slot.

After publish: Checking your listing…

| Result | Copy | Button |
|---|---|---|
| Live | [Lift operator] is live. Seekers can find it and apply now. | View listing |
| In review | We're taking a closer look. This usually takes a few hours. | View listing |
| Needs verification | We're verifying your business. This usually takes a few hours. | Verification status |
| Returned | We couldn't publish it yet. | See what to change |
| Waiting on the team | Waiting for an Owner or Admin to approve it. | View listing |

### Listing list and status

`/host/listings`. Tabs: Active. Drafts. Library.

Empty: No listings yet. Button: Create listing.

| Piece | Copy |
|---|---|
| State pill | Draft. In review. Active. Closed. Removed. |
| Unpublished edits | Unpublished changes |
| Library stats before any source | — |
| Search | Search listings |
| Location | Location |

Status page:

| Piece | Copy |
|---|---|
| Still hiring? | Still hiring? Buttons: Yes, still hiring. Edit listing. Close listing. |
| After Yes | Confirmed active today. |
| Close dialog | Close [Lift operator]? It leaves your live slots now. Applicants and messages stay. Buttons: Close listing. Keep it open. |
| Repost | Repost listing. Help: Copies it into a draft with the dates moved forward a year. |
| Removed | The reviewer's reason, then Ask for a review. |
| Not repostable | A removed listing can't be reposted. |

---

## Billing and `/pricing`

**Job:** pick a plan and know what it costs, including the founding discount if they have one.

### `/pricing`

Title: Hire people who want to be there. Subtitle: Every plan includes your host page, analytics, and fit scoring. Plans differ in listings, invites, seats, and support.

Interval control: Monthly. Annual. Annual help: 10 months' price for the year.

Three cards. The price is the Stripe price. If Stripe is down, use the table at the top of this deck. Do not show a blank price.

| Card line | Starter | Professional | Enterprise |
|---|---|---|---|
| Price, monthly | $99 / month | $299 / month | $599 / month |
| Price, annual | $990 / year | $2,990 / year | $5,990 / year |
| Listings | 2 active listings | 10 active listings | 30 active listings |
| Seats | 1 seat | 5 seats | 15 seats |
| Invites | 10 invites a month | 50 invites a month | 150 invites a month |
| Support | Help center and email | Priority help | Priority help and guided onboarding |
| Button | Choose Starter | Choose Professional | Choose Enterprise |

Under the cards: Seekers never pay. Extra listing slots are $39, $29, or $19 a month by plan, and 10× that on an annual plan. Boosts and announcements are separate. Unused invites don't roll over.

No founding-code field. No "Featured host". No price for extra seats or extra invite packs.

A signed-in host's button goes to checkout for that plan. A guest's button is Create host account, then the same checkout.

### `/host/billing`

Title: Billing.

| Piece | Copy |
|---|---|
| Current plan | Professional · Monthly |
| Renewal | Renews [June 3, 2027] |
| Slots | [4] of [10] listing slots in use |
| Seats | [2] of [5] seats in use |
| Invites | [12] of [50] invites left this month. They reset on the 1st. |
| Extra slots | Extra listing slots. Stepper 0 to 50. Help: $29 a month each on Professional. |
| Payment | Update payment method |
| Invoices | View invoices |
| Change | Change plan |
| Cancel | Cancel plan |

Past-due banner, icon plus text: Your payment didn't go through. Update your payment method to keep your listings live. Button: Update payment method. Listings stay up while the banner shows. New publishes wait.

Founding, when they qualify and have not paid yet:

> You're one of the first 100 host organizations. Start monthly and the first six months of the plan are half price. Start annual and the first year of the plan is half price. Extra slots, boosts, and announcements stay full price. Switching later doesn't start a second discount.

Founding, after they start monthly: Founding host · 50% off the plan for 6 months. Help: Through [date]. Then Professional is $299 a month.

Founding, after they start annual: Founding host · 50% off the first year. Help: This term is half the annual plan price. The next term is the regular annual price. On Professional that is $1,495 this term and $2,990 after it. Extra slots stay full price.

Founding, after the intro: Your founding discount has ended. You're on the regular Professional price.

Organization 101, no founding block at all.

Billing down: Billing is temporarily unavailable. Try again in a few minutes.

### Change plan

Title: Change plan. Show the proration in one sentence, using the preview from Stripe: You're credited $[amount] on your next invoice. or You're charged $[amount] now.

Downgrade, when too many listings are live: Choose listings to keep. Help: Your new plan has [2] live listings. Check up to [2]. The others close and move to your Library. Applicants stay. Button: Change plan. If they check too many: You can keep [2] listings on this plan.

Cancel dialog: Cancel [Professional]? Your listings close at the end of this period, on [date]. Applicants and messages stay. You can choose a plan again later. Buttons: Cancel plan. Keep my plan.

### Checkout complete

Title: Confirming your plan. Body: This usually takes a few seconds. Don't refresh. Then the billing page. If it takes too long: We're still confirming your plan. You can leave this page. We'll email you when it's active. Button: Back to billing.

---

## Team and join

**Job:** give the right person the right access, on a seat.

### `/host/team`

Title: Team.

Stat: [2] of [5] seats in use. Help: Pending invitations use a seat. Invitations expire after 7 days.

Button: Invite someone. At the limit, the button is disabled. One seat: Your seat is in use. Link: Upgrade. More than one: All [5] seats are in use. Link: Upgrade.

Invite dialog:

| Field | Label | Help | Validation |
|---|---|---|---|
| Email | Email | They'll get a link. A seeker account can't join. | Enter an email address. |
| Role | Role | Admin, Recruiter, or Billing. You can't invite an Owner. | Choose a role. |
| Recruiter scope | Access | All listings, or only these listings and locations. | Choose at least one location. |
| Button | Send invitation | — | — |

Role help, under the select:

| Role | Help |
|---|---|
| Admin | Everything except deleting the organization or transferring ownership. |
| Recruiter | Listings, applicants, messages, interviews, and invites. |
| Billing | Invoices and the payment method. No applicants or messages. |

Seeker email, after send fails: This email belongs to a seeker account. Ask for an invitation to a different email.

Member row: name, email, role select, and for a Recruiter the scope. Changing role asks: Change [Maya] from Recruiter to Admin? Buttons: Change role. Cancel.

Remove: Remove [Maya] from the team? Their messages and interviews move to you. Buttons: Remove from team. Cancel.

Leave, for anyone but the Owner: Leave [Kettle Ridge Lodge]? Buttons: Leave team. Stay.

Owner leave is not offered. Help where the control would be: Transfer ownership before you can leave.

### Activity

`/host/team/activity`. Title: Activity. Empty: No team activity yet.

Operator actions read Explore&Earn. Automatic ones read Explore&Earn (automatic).

### Transfer and delete

These live at the bottom of Team for the Owner, behind a fresh sign-in.

Transfer. Title: Transfer ownership. Body: The new Owner must already be an Admin. You become an Admin. Field: New Owner. Button: Transfer ownership. Confirm: Make [Maya] the Owner of [Kettle Ridge Lodge]? Buttons: Transfer ownership. Cancel.

Delete. Title: Delete organization. Body: This cancels your plan now, closes every listing, and removes your host page. Type the organization name to confirm. Field: Organization name. Button: Delete organization. Mismatch: Type the organization name exactly.

### `/join/[token]`

Title: Join [Kettle Ridge Lodge]. Body: [Maya Chen] invited you to join as Recruiter. The email on this invitation is shown masked.

Button: Accept invitation.

| State | Copy | Recovery |
|---|---|---|
| Expired | This invitation has expired. Ask for a new one. | — |
| Wrong email | This invitation was sent to a different email address. | Sign in with the invited email |
| Seeker account | This email belongs to a seeker account. Ask for an invitation to a different email. | — |
| Already accepted | This invitation was already accepted. | Go to the team |
| Loading | Skeleton of the logo, one line, and the button | — |

Accepting does not send them through seeker-or-host onboarding again.

---

## Settings

**Job:** keep the organization, its places, and its verification accurate.

`/host/settings`. Title: Settings.

| Field | Label | Help | Validation |
|---|---|---|---|
| Name | Organization name | Seekers see this on your jobs and your host page. | Enter a name between 2 and 80 characters. |
| Website | Website | Optional. https only. | Enter an https address. |
| Approval | Recruiters need approval before a listing goes live | Off to start. While it's on, an Owner or Admin reviews a Recruiter's publish. The listing holds a slot until then. | — |

Button: Save settings. Toast: Saved.

A Billing member who opens a page they can't use sees the shell, and the page says: You can manage invoices and the payment method. Button: Go to billing.

### Locations

Title: Locations. Empty: Add the place you hire for. Button: Add location.

| Field | Label | Help | Validation |
|---|---|---|---|
| Name | Location name | Seekers may see the city. Example: Estes Park lodge. | Enter a name. |
| Address | Street address | Used to place the pin. | Enter the street, city, and state. |
| Precision | What seekers see | City and state, or the street address. | Choose one. |
| Map | Open map | If we can't find the address: Drop a pin on the map instead. | Drop a pin. |
| Weather | The weather line, after it loads | 54°F · Partly sunny. Then: Weather: National Weather Service. Hidden when we don't have it. | — |

Archive: Archive [Estes Park lodge]? Jobs already using it keep the place. You can't pick it for a new job. Buttons: Archive location. Cancel.

### Verification

Title: Verification. This is not the subscriber badge.

| Status | Copy |
|---|---|
| Not started | We verify your business the first time you publish. |
| Running | We're verifying your business. This usually takes a few hours. |
| Verified | Your business is verified. This is separate from the host badge on your page. |
| Needs info | We need a little more information to verify your business. The reviewer's note, then the form. |
| Failed | We couldn't verify your business. Your listings can't go live for now. |

Needs-info form: the fields the reviewer asked for, each labeled. Button: Send information.

Failed: Ask for a review. Help: A person looks at it again. Button: Ask for a review.

### Host settings that are easy to confuse with seeker settings

Notification switches for the host live with the host shell's notification list, one switch per category and channel. Security and billing are on, and the switch is disabled, with the help: Security and billing email stays on.

Privacy, for the later export and delete cards, when those ship: Download your data. Delete your account. Delete asks them to type DELETE. Pending export: We're preparing your file. We'll email you when it's ready.

---

## Host page

### Editor

`/host/host-page`. **Job:** tell seekers who the organization is, without taking the live page down to do it.

Tabs: Header. About. Photos. Team. FAQ. Preview.

| Field | Label | Help | Validation |
|---|---|---|---|
| Cover | Cover | — | — |
| Logo | Logo | A rounded square. | — |
| Slug | Page address | exploreandearn.com/hosts/ | 3 to 60 characters, lowercase letters, numbers, and hyphens. Not a reserved word. |
| Story | Story | — | — |
| Perks | Perks | — | — |
| Social | Social links | — | Enter an https address. |
| Photos | Photos | Up to 24. | — |
| Team | Team on your page | Up to 12 people. Checkbox required: I have permission to show these people on our public page. | Confirm you have permission to show your team. |
| FAQ | Questions seekers ask | Optional. Question and answer. | — |

Slug errors: Use lowercase letters, numbers, and hyphens. That address is reserved. That address is taken.

Saving: Checking your changes. If review holds them: In review. Your current page stays live. If rejected: the reason, then Edit them and save again.

Preview uses the public header, with the draft filled in, and a label: Preview. Seekers don't see this yet.

### Public page

`/hosts/[slug]`. **Job:** decide whether to follow this host and open a job.

| Piece | Copy |
|---|---|
| Badge tooltip | Active Explore&Earn host since [Nov 3, 2026]. Hidden when they aren't paying. |
| Pill | Hiring now |
| Not hiring, with a pattern | Not hiring right now · Usually hires Feb–Apr |
| Not hiring, without one | Not hiring right now |
| Reply line | Usually replies within a day. Only after 10 conversations. |
| Buttons | Follow. Following. Share. Website. |
| Stats | [4] open jobs. [2] locations. Followers only once the count is 26 or more: [40] followers. |
| Tabs | Jobs. About. Photos. Locations. Team. FAQ. As described. Hide a tab with nothing in it. |
| Jobs | Grouped by location. Each group has the weather line, or nothing if weather is missing. |
| As described | Shown at 5 or more responses. Yes, Partly, and No for housing, meals, and pay. |
| Guest follows | The sign-in sheet, then the follow completes. Sheet title: Sign in to follow [Kettle Ridge Lodge]. |
| Share | Link copied, if the device has no share sheet. |
| Missing page | We couldn't find that host. Button: Browse jobs. |

Follow toast: Following [Kettle Ridge Lodge]. You'll hear when they post a job.

---

## Email and push

Subject is the title, except where a subject is given. The button label is the email button. Push is the lock-screen line when it differs; otherwise title plus body.

### Listings

Shipped in `src/modules/listings/notifications.ts`.

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| listings.live | [Lift operator] is live | Seekers can find it and apply now. | View listing | No |
| listings.in_review | We're taking a closer look | We're checking [Lift operator] before it goes live. This usually takes a few hours, and we'll let you know when it's done. | — | No |
| listings.returned | [Lift operator] needs changes | We couldn't publish it yet. [note] Open the listing to see what to change, or ask for a review. | See what to change | Yes |
| listings.removed | [Lift operator] was removed | It doesn't meet our listing rules, so seekers can no longer see it. Open it to see why, or ask for a review. | Ask for a review | No. Mandatory email. |
| listings.approval_requested | [Lift operator] is waiting for your approval | [Maya] wants to publish it. Review it to approve it or send it back. | Review listing | Yes |
| listings.approval_decided, approved | [Lift operator] was approved | Your team approved it. We're checking it before it goes live. | View listing | Yes |
| listings.approval_decided, returned | [Lift operator] was sent back | Your team sent it back. Open it to make changes and publish again. With a note: Your team sent it back with a note: [note] | Edit listing | Yes |
| listings.still_hiring | Still hiring? | Are you still hiring for [Lift operator]? Open the listing and choose Yes, Edit or Close. | Open listing | Yes |
| listings.auto_closed | [Lift operator] has closed | Its end date has passed, so it closed on its own. You can repost it from your Library. | Repost listing | No |
| listings.repost_reminder | Time to repost [Lift operator]? | It went live around this time last year. Repost it and we move its dates forward a year. | Repost listing | No |

### Team, verification, host page

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| orgs.invitation | Join [Kettle Ridge Lodge] on Explore&Earn | [Maya Chen] invited you to join [Kettle Ridge Lodge] on Explore&Earn as Recruiter. This invitation expires on [June 3, 2027]. If you weren't expecting it, you can ignore this email. | Accept invitation | No. Email only. |
| orgs.member_joined | [Maya] joined your team | They joined [Kettle Ridge Lodge] as a Recruiter. | See your team | No |
| orgs.member_changed, role | Your access at [Kettle Ridge Lodge] changed | You're now an Admin. [Maya] made the change. | Open Explore&Earn | No |
| orgs.member_changed, scope | Your access at [Kettle Ridge Lodge] changed | [Maya] changed which listings you work on. | Open Explore&Earn | No |
| orgs.ownership_transferred, new Owner | [Kettle Ridge Lodge] has a new Owner | You're now the Owner of [Kettle Ridge Lodge]. [Jordan] is an Admin now. | See your team | No. Mandatory. |
| orgs.ownership_transferred, previous | [Kettle Ridge Lodge] has a new Owner | [Maya] is now the Owner of [Kettle Ridge Lodge]. You're an Admin now. If you didn't do this, contact support right away. | See your team | No. Mandatory. |
| verification.needs_info | We need a little more information to verify your business | [note] Add it in your verification settings and we will take it from there. | Open verification settings | No. Mandatory. |
| verification.decided, verified | Your business is verified | Thanks for waiting. Any listing that was waiting on this check now carries on through its remaining checks. | Open verification settings | No |
| verification.decided, failed | We couldn't verify your business | Your listings can't go live for now. If you think we got this wrong, ask for a review in your verification settings. | Ask for a review | No |
| hostpages.content_held, question | We have a question about your host page changes | An Explore&Earn reviewer asked: "[note]" Your current page stays live. | Edit your page | No |
| hostpages.content_held, looking | We're taking a closer look at your host page changes | This usually takes a few hours. Your current page stays live until then. | Edit your page | No |
| hostpages.content_held, rejected | We couldn't publish your host page changes | Your latest changes weren't published: [reason]. Edit them and save again. | Edit your page | No |
| hosts.new_job | [Kettle Ridge Lodge] posted a new job | [Lift operator]. Take a look while it's open. | View job | Yes. Email waits up to an hour and folds several jobs into one message. |

Role phrases already in code: the Owner, an Admin, a Recruiter, a Billing member.

### Billing

| Type | Title | Body | Button |
|---|---|---|---|
| billing.subscription_started | Your Explore&Earn plan is active | You're on [Professional]. You can publish listings and invite your team. Founding monthly adds: The first six months of the plan are half price, through [date]. Extra slots stay full price. Founding annual adds: The first year of the plan is half price. This term is $[amount]. Extra slots stay full price. | Go to billing |
| billing.plan_changed | Your plan changed | You're now on [Starter]. If listings closed: To fit your new plan, these listings closed: [Lift operator]. They're in your Library, and their applicants are still there. | Go to billing |
| billing.subscription_ended | Your Explore&Earn plan has ended | Your plan has ended, so your listings are no longer live. [3] listings closed. They're in your Library, and their applicants are still there. Choose a plan whenever you want to publish again. | Choose a plan |
| billing.payment_failed | Your payment didn't go through | We couldn't charge your card for your Explore&Earn plan. Update your payment method to keep your listings live. | Update payment method |

`billing.payment_failed` is the one billing message that also pushes. All five billing types are mandatory email. Do not send `billing.trial_ending` for a founding subscription. If some other trial is really ending, the shipped body stands: Your free period ends on [date]. After that, your card is charged for [Professional]. You can review it in Billing.

The billing email wears the label Billing above the title.

### Job alerts

| Type | Subject and title | Body | Button | Push |
|---|---|---|---|---|
| discovery.alert_match | 3 new jobs for Ski resorts · CO | Open Seek to see them. When several alerts fire together: 5 new jobs for your alerts. | — | Yes. At most 5 pushes a day. The rest wait for the email. |
| discovery.alert_daily | New jobs for your alerts | One block per saved search, up to 10 jobs still open: title, host, place, pay, housing line, meals line. | See all | No |
| discovery.alert_weekly | This week on Explore&Earn | The 10 newest matches from the past 7 days, same lines. Sent only if they opted in, and only if something is still open. | See jobs | No |

Daily and weekly footers use Explore the country. Earn as you go.

### Applications and profile

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| applications.submitted | Application sent | [Kettle Ridge Lodge] has your application for [Lift operator]. | See the application | No |
| applications.new_applicant | New application for [Lift operator] | [Maya R.] applied. | Review applicant | Yes. Email batches for an hour. |
| applications.withdrawn | [Maya R.] withdrew | They withdrew their application for [Lift operator]. | Open the listing | No |
| profiles.availability_reconfirm | Confirm you're still available | You last confirmed [Dec 3, 2026]. Hosts only see you in search when the date is current. | Update availability | Yes |
| profiles.availability_hidden | Hosts can't find you right now | Confirm your availability to show up in host search again. | Update availability | No |
| profiles.import_ready | Your resume is ready to review | Nothing is saved until you accept each field. | Review fields | Yes |
| profiles.import_failed | We couldn't read this file | You can fill in your profile by hand. | Edit profile | No |
| profiles.content_removed | We removed part of your profile | Your headline, bio, and photos were taken down. The rest of your account is unchanged. | Edit profile | No |
| safety.report_received | We got your report | Thanks. We review every report. | — | No |

The availability-hidden email is the one the spec allows. The 90-day hide is an engineering proposal still marked for founder review in the seeker spec. Until the founder accepts it, send only `profiles.availability_reconfirm` at 30 days, and do not tell a seeker they were hidden.

### Hiring and messages

Message bodies never go in the push, the email, or the subject. The email button on a message batch is Reply in app. Replying by email does not work (product design §11.6).

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| messages.new | New message from [Maya] | Open the conversation to reply. | Reply in app | Yes. Email after 15 minutes unread, batched. |
| hiring.invite_received | [Kettle Ridge Lodge] invited you | [Lift operator]. You have until [date] to answer. | See the invite | Yes |
| hiring.invite_expiring | Your invite expires tomorrow | [Lift operator] at [Kettle Ridge Lodge]. | See the invite | No |
| hiring.invite_response | [Maya R.] answered your invite | Interested, or Not interested, for [Lift operator]. | Open invites | Yes. Email batches for an hour. |
| hiring.interview_invited | Interview times for [Lift operator] | [Kettle Ridge Lodge] offered times. Pick one, ask for new times, or decline. | See times | Yes |
| hiring.interview_scheduled | Interview scheduled | [Lift operator] with [Kettle Ridge Lodge], [date and time]. The email includes the calendar file. | Open the conversation | Yes |
| hiring.interview_times_requested | [Maya R.] asked for new times | Open the interview to send different times. | Send new times | Yes |
| hiring.interview_declined | [Maya R.] declined the interview | They may also have withdrawn the application. The message says so when they did. | Open the conversation | Yes |
| hiring.interview_canceled | Interview canceled | [Lift operator] on [date] was canceled. The email includes a calendar cancellation. | Open the conversation | Yes |
| hiring.interview_expired | Interview invite expired | [Maya R.] didn't choose a time for [Lift operator]. | Send new times | No |
| hiring.interview_reminder_24h | Interview tomorrow | [Lift operator], [date and time]. | Open the conversation | Yes |
| hiring.interview_reminder_1h | Interview in an hour | [Lift operator], [time]. | Open the conversation | Yes. No email. |
| hiring.interview_outcome_due | Mark the interview | Say whether [Maya R.]'s interview happened. | Mark completed | No |
| hiring.offer_received | Offer from [Kettle Ridge Lodge] | [Lift operator], starting [date], [pay]. | Review the offer | Yes |
| hiring.offer_response | [Maya R.] answered the offer | Accepted, or declined, for [Lift operator]. | Open the conversation | Yes |
| hiring.marked_hired | You're marked hired | [Kettle Ridge Lodge] marked you hired for [Lift operator]. | Open the conversation | Yes |
| hiring.as_described_prompt | How was the job? | A short check on housing, meals, and pay for [Lift operator]. It takes a minute. | Answer the check | Yes |

Default "Not selected" message, which the host can edit, from the hiring spec: Hi [first name], thank you for applying for [position] at [org name]. We've decided to move forward with other candidates for this role. We wish you the best with your search.

Scam banner inside the thread, not an email: Never pay to get a job. Buttons: Report. Block.

### Add-ons

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| addons.purchase_confirmed | [Boost] purchased | [Lift operator], 7 days, $49. Your receipt is in Billing. | View receipt | No. Billing email, mandatory. |
| addons.refunded | [Boost] refunded | $[49] is going back to your card. | View receipt | No. Mandatory. |
| boosts.started | Your boost is running | [Lift operator] is boosted through [date]. It only shows to people whose filters it already matches. | View listing | Yes |
| boosts.ended | Your boost has ended | [Lift operator]. The email includes how many times it was shown, and views before and during. | See the report | No |
| boosts.ended_early | Your boost ended early | [Lift operator] is no longer open, so the boost stopped. | View receipt | No |
| announcements.approved | Your announcement is approved | Starts [date] and runs 7 days. | View announcement | No |
| announcements.rejected | Your announcement needs changes | [reason] Your credit is kept. | Edit announcement | No |
| announcements.ended | Your announcement has ended | It ran its 7 days. | — | No. In-app only. |
| announcements.removed | We removed your announcement | It no longer shows on your page or in Community. | — | No. Mandatory email. |
| announcements.credits_expiring | Announcement credits expire in 3 days | You have [2] left. They don't carry over. | Use credits | No |

### Community

In-app and push use the title. Email only where the table says so.

| Type | Title | Body | Email |
|---|---|---|---|
| community.post_published | Your photo is live in Community | People can see it in the feed. | No |
| community.post_rejected | Your photo wasn't posted | It didn't pass the photo check. You can choose a different photo. | No |
| community.post_removed | We removed your photo from Community | If you think we got this wrong, reply from the notification and ask for a review. | Yes. Mandatory. |
| community.post_restored | Your photo is back in Community | It's in the feed again. | No |
| community.appeal_decided | We've reviewed your appeal | The decision is in the notification. | Yes |
| community.restricted | You can't post in Community right now | You can still look for jobs. We'll email you if that changes. | Yes. Mandatory. |

### Privacy, support, and account status

Direct mail that is not tied to a signed-in inbox still uses the wordmark and the mailing address. It has no Unsubscribe.

| Type | Title | Body | Button | Push |
|---|---|---|---|---|
| privacy.export_ready | Your data file is ready | The link works for a limited time. | Download your data | Yes |
| privacy.request_delayed | Your request is taking longer | We're still working on it. You don't need to send it again. | — | No |
| privacy.deletion_started | We started deleting your account | You can no longer sign in. We'll email this address when it's finished. | — | No. Security. |
| privacy.deletion_completed | Your Explore&Earn account is deleted | We erased the personal data our retention rules allow. Hiring records a host must keep are not in this letter. | — | No. Security. |
| support.reply | Explore&Earn support replied | Ticket #[number]. Open it to read the reply. The email does not paste the thread. | Read the reply | Yes |
| legal.updated | Our terms have changed | The new version is in effect. You'll need to accept it the next time you open Explore&Earn. | Read the update | No |
| account.suspended | Your account is suspended | [reason category, never an operator's private note]. You can appeal. | Appeal | No. Security. |
| account.restored | Your account is restored | You can sign in again. | Sign in | No. Security. |
| operator.daily_digest | Explore&Earn daily digest | Counts only: sign-ups, listings waiting for review, failed payments, unacknowledged alerts. No seeker or host personal data. | Open the console | No. Operators only. |

Support form confirmation, on screen rather than as its own type: Ticket #[number] received. We'll reply by email.

---

## Sources

- Product design, sections 2, 4, 5, 6, 7, 8, 10, 14, 15, 16, and 21: `docs/superpowers/specs/2026-11-03-explore-earn-product-design.md`
- Founder decisions FD-1, FD-4, FD-6, FD-7, and FD-8: `docs/decisions/2026-11-04-founder-decisions.md`
- Founding discount is the plan only, any tier, monthly or annual, never an add-on: issue 45, 10 November 2026, and `src/modules/billing/plans.ts`
- Quality bar U3: issue 45, comment beginning "Quality bar v1"
- Discovery screens, guest sheet, alerts, install prompt, and the state-count addendum: `docs/superpowers/specs/2026-11-03-sp3-discovery-design.md` and the FD-8 addendum in `docs/superpowers/plans/2026-11-03-sp3-discovery.md`
- Apply and profile notifications: `docs/superpowers/specs/2026-11-03-sp4-seeker-design.md`
- Host screens and the retired founding-code errors: `docs/superpowers/specs/2026-11-03-sp2-host-supply-billing-design.md`
- Listing check messages: `src/modules/listings/checks.ts`
- Shipped notification titles and bodies: `src/modules/listings/notifications.ts`, `src/modules/billing/notifications.ts`, `src/modules/orgs/notifications.ts`, `src/modules/verification/notifications.ts`, `src/modules/hostpages/notifications.ts`, `src/modules/notifications/email/templates/TeamInvite.tsx`
- Onboarding strings: `src/app/onboarding/OnboardingForm.tsx`
- Sign-in titles: `src/ui/clerk.ts`
- Hiring notification types and the default not-selected note: `docs/superpowers/specs/2026-11-03-sp5-host-hiring-design.md`
- Add-on, Community, and privacy notification types: the SP6, SP7, and SP8 design specs
- Market research was read and not used for a price, a wage, or a claim on a screen: `docs/research/2026-11-market-research.md`
