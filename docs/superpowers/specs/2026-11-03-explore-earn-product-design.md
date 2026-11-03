# Explore&Earn product design spec (V1 public launch)

- **Status:** approved in conversation on 2026-11-03. This is the source of truth for the build.
- **Owner:** founder (AutomatedEmpires).
- **Supersedes:** `docs/v1/*` wherever the two conflict (see section 27). Where `docs/v1` covers something this spec does not, it still applies.
- **Design board:** https://claude.ai/artifact/TNVygmzxNpqZG3j5RDvgfK (Direction B mockups)

## 1. Intent

Explore&Earn is a US job marketplace for paid work that is worth travelling for. It has four categories: Maritime, Seasonal, Farm and Remote. Many of the jobs include housing and meals. Seekers use it free, forever. Hosts (employers) pay a monthly subscription.

**Who it is for**

- **Seekers:** people looking for seasonal, maritime, farm or remote paid work, often away from home.
- **Hosts:** employers hiring for those jobs, from a small family farm to a national-park concessionaire with many locations.
- **Operators:** the founder today, and possibly a small team later. They run the platform through an operator console.

**What success looks like at launch**

- The product is complete; there is no "beta" feature gap.
- At least the founding hosts have live listings on day one.
- A seeker can go from discovery to hire without leaving the platform.
- The platform runs mostly by automation. Only extreme cases reach a human.

**Ground rules**

- **Paid work only**, as employee or contractor. This is not a work-exchange platform.
- **Housing and meals are never "unknown".** A listing either provides them or it doesn't.
- **Automation is the default.** Moderation, verification, support and reminders run automatically, and humans handle escalations only.
- **No timed launch phases.** The app launches publicly only once everything in this spec is built. Founding hosts onboard during a private pre-launch phase.
- **Responsive web app / PWA first.** The backend is API-first so that native apps can be added later.
- **A feature must not interfere with the core models:** listing, card, application and profile.

## 2. Accounts, roles and sign-in

| Rule | Decision |
|---|---|
| Account model | **One account, one role.** The user chooses Seeker or Host at sign-up. Someone who is both uses two accounts with different emails. |
| Seeker age | **Seekers must be 18 or older at launch.** This is an assumption made to avoid child-labor and COPPA scope; it needs founder confirmation. |
| Sign-in | Clerk: email magic link or passkey, plus Google. No passwords. |
| Host organizations | A host account can belong to several organizations, with an organization switcher. |
| Host roles | **Owner** (one per organization): everything, including deleting the organization and transferring ownership. **Admin**: everything except deleting or transferring; manages the team and buys add-ons. **Recruiter**: listings, applicants, messages, interviews and invites, with access to all listings or only assigned listings or locations. **Billing**: invoices and payment method only, with no applicant or message access. |
| Host team rules | Every member uses a seat. Optional rule, off by default: Recruiter listings need Admin approval before going live. One shared pool of invite credits. When a member leaves, their threads and interviews move to an Admin. The Owner and Admins can see the team activity log. |
| Security | The Owner and Admins must use a passkey or two-step sign-in. Operators sign in with a passkey only. |
| Seeker's view of a host | The seeker sees the organization's name and the first name of the person writing, never their role. |

## 3. Categories, genres, colors and icons

| Category | Color | Icon | Genres (filter chips and landing pages) | Extra listing fields |
|---|---|---|---|---|
| Maritime | Blue | Anchor | Commercial fishing, Seafood processing, Yachts, Ferries and tours, Expedition cruises, Tugs and barges | Vessel type, home port, rotation (e.g. 2 weeks on, 2 off), time at sea, self-reported documents (TWIC, MMC, STCW) |
| Seasonal | Amber (fall tones) | Mountain | National parks, Ski resorts, Summer camps, Guest ranches and lodges, Festivals and events, Adventure guiding | Season and year, destination (links to destination landing pages), staff perks |
| Farm | Green | Leaf | Harvest, Orchards and vineyards, Livestock and ranch, Dairy, Greenhouse and nursery, Organic | Type of operation, harvest window, equipment used, certifications |
| Remote | Red | Laptop | Customer support, Sales, Software and IT, Design and creative, Writing, Virtual assistant, Teaching | States the worker may live in (US only), time zone overlap, equipment provided, internet requirement, travel required |

- **Genre** is the setting (Ski resort). **Occupation** is the role (Lift operator). Seekers browse by genre, and the fit score uses occupation.
- **Color always comes with an icon**, so the categories work for people with red-green color blindness. Category colors appear on pins, badges and legends, not on card outlines.
- **Error states** use an icon plus text, never color alone.
- **Boosted** jobs get a "Boosted" badge on cards. On the map they get a slightly larger pin with a spark icon, not gold, so they can't be confused with Seasonal amber.

## 4. The shared card template

Seekers see jobs, and hosts see candidates, on **one card template with the same slots filled differently.**

| Slot | Job card (seeker sees) | Candidate card (host sees) |
|---|---|---|
| Cover | Listing or host cover photo | Seeker's profile cover |
| Circle or tile image | Host logo as a rounded square; opens the host page | Seeker avatar as a circle, shown only when "Show my photo to hosts" is on (initials otherwise) |
| Badge on cover | Category; "Boosted" when paid | Category interests; "Applied N days ago" |
| Title line | Position (the visible link to the detail page) · Host (subscriber badge) · Location | Name (first name and last initial on candidate pool cards) · general location |
| Info row | "Starts in N days" or "Begins [date]" · "Ends [date]" | "Applied for [position]" or "Available [real date]" |
| Three pop-up chips (two lines each: label, then value) | **Housing** (✓ Provided / No housing) · **Meals** (✓ Provided / No meals) · **Pay** ($19/hr) | **Resume** · **Fit** (score) · **Skills** (count) |
| Actions | Skip · **Apply** · Save | As an applicant: Pass · **Interview** · Shortlist. In a candidate pool: Hide · **Invite** · Save. |

**Rules**

- **"Housing ✓ Provided"** is green whenever housing is provided, whether free or paid. The cost always appears as the first line of the pop-up.
- **Tapping the card body** anywhere except a button or chip opens the full listing (section 6). In Swipe, an ⓘ button at the top right of the photo also opens it. On desktop the listing opens in a side panel.
- **No match indicator on the job card.** Fit is host-side only.
- **The Skills pop-up** lists up to 15 highlighted skills and then all other stated skills. No skills appear on the card face.
- **The Fit pop-up** is "Why a good fit": a template-based explanation of the weighted factors (section 11.2).
- **The Resume pop-up** opens the frozen application copy for applicants, or the limited pool view for candidates (section 9.4).

## 5. Discovery

### 5.1 Modes

| Mode | Behavior |
|---|---|
| **Seek** | Card feed: search box, filters, category chips, a "Starting soon" chip, result count and sort. |
| **Swipe** | One card at a time. Left skips, right saves, up opens the apply review, and a tap opens details. Undo is available for 10 seconds. Skipped jobs are hidden and can be restored under Profile → Skipped. Buttons and the keyboard do the same things as the gestures. |
| **Map** | Pins sit at **host locations**, grouped per location, in the category color with its icon. **Remote jobs are pinned at the host's location** with the laptop icon, and the preview reads "Remote · host based in X · work from: US". Pins cluster when zoomed out. Tapping a pin opens a small host preview (logo, name, location, category dots, number of active listings, View page) and that location's jobs. A pull-up list shows everything currently on the map. |

Guests can browse every mode. Save, Apply and Skip ask a guest to sign in, and the action they started is kept and completed afterwards.

### 5.2 Search, filters and sort

| Control | Decision |
|---|---|
| Search | One smart box covering jobs, places and employers |
| Pay | A slider with a unit switch: hour / day / year. Listings are converted using their weekly hours, and crew-share listings use their estimated range. |
| Start date | Within 1, 3 or 6 months; or by season (Spring / Summer / Fall / Winter / Year-round, with a year) |
| Housing | "Housing provided", with an optional "Free only" switch |
| Meals | "Meals provided", with an optional "Free only" switch |
| Other | Category, genre, state, "Sponsors visas" |
| Sort | Relevant (default), Newest (by original publish date), Distance. More sorts may come later. |
| Starting soon | A quick chip. On the card, the date line reads "Starts in N days" instead of using a separate badge. |
| Saved searches | A bell icon on any search saves it. Managed under Profile → Job alerts. New matches arrive by push and in a daily email. A weekly digest is a separate opt-in. |

### 5.3 Landing pages (public, indexed by Google)

These are pre-filtered Seek views, each with its own copy and hero image, edited in the operator console:

- `/jobs/[state]`
- `/jobs/[category]`, `/jobs/[category]/[state]` and `/jobs/[category]/[genre]`
- `/seasons/[season]`
- `/destinations/[slug]`: national parks and well-known destinations
- `/international`: visa basics, linking to official government pages and never giving visa advice

Strapline on these pages: "Explore the country. Earn as you go."

### 5.4 Boosted placement

Boosts are paid. They are always labeled "Boosted", only appear when the job matches the seeker's filters, and never affect the fit score.

| Surface | Placement |
|---|---|
| Community Feed | Included among paid items, which are capped at 1 in 5 feed items |
| Swipe | First in the deck, at most 1 in every 4 cards |
| Seek | Near the top, at most 1 in every 5 results |
| Map | The larger spark-icon pin |

## 6. Listing detail page

The listing detail page is reached from the card body, the title link or the ⓘ button in Swipe. On desktop it opens in a side panel.

**Contents**

- the cover, photos and host preview
- description, responsibilities and "a typical day"
- schedule and dates
- pay details, including deductions
- housing and meals fine print, with the four photos each
- qualifications (required and preferred), certifications and physical demands
- benefits and perks
- category-specific fields
- "Confirmed active N days ago"
- an "Additional step" note, if the host added one
- Report and Share

**Apply, Save and Skip stay pinned** at the bottom of the screen.

**Additional step**

- A host can add a note with a URL, e.g. "Also complete our application at…".
- It appears on the listing page and on the seeker's application receipt.
- The link opens in a new tab after an off-site notice, and its domain is moderated.
- The seeker can tick "I completed the employer's form", and the host sees that tick.

## 7. Listings

### 7.1 Listing builder

The builder is the form a host fills in to create a listing. It feeds the card, the pop-ups, the detail page and the application form.

**Layout**

- On desktop, sections run down a left rail with a **live preview** of the card on the right. Hosts can move freely between sections, and a checklist shows what's still required.
- On mobile it's one section per screen.
- Drafts save automatically.

| # | Section | Fields |
|---|---|---|
| 1 | Start | Blank, copy a past listing, or paste an existing job post (AI fills in the fields for the host to review) |
| 2 | Basics | Title, primary category and genre, optional second category, occupation, openings, employee or contractor, full or part time |
| 3 | Where and when | A saved location or a new one, or where a remote worker may live; fixed dates, season and year, or ongoing; weekly hours; minimum commitment |
| 4 | Pay | Amount or range; unit: hour, day, week, month, season, year, or crew share (with an estimated range); overtime, tips, bonuses; how often pay is issued |
| 5 | Housing | Provided yes/no. If yes: type (dorm, shared or private room, cabin, RV site, berth on board); **cost**, which is either "Free" or an amount, a period and how it's paid (deducted from pay or paid directly); **4 required photos** (Bedroom, Bathroom, Kitchen, Exterior); a short note for the pop-up; fine print (roommates, pets, couples, Wi-Fi, utilities) |
| 6 | Meals | Provided yes/no. If yes: meals per day, which days, **cost**, **4 required photos** (Kitchen, Meal example, Dining area, Other), short note, fine print (dietary needs) |
| 7 | Genre details | Category-specific fields (section 3) |
| 8 | The job | Description (AI drafts it from bullet points), responsibilities, a typical day, required and preferred qualifications, skills (these feed the fit score), certifications, physical demands, minimum age (18 or older for seekers on this platform), perks checklist, visa sponsorship (Not available / J-1 through a sponsor organization / H-2A / H-2B) |
| 9 | Photos | Cover (required) and a gallery of up to 8 |
| 10 | Applying | Up to 10 screening questions (short answer, yes/no, multiple choice; each can be required), the optional Additional step link, an optional deadline, which team members get notified |
| 11 | Review | Preview of the card, pop-ups and detail page; automatic checks; "Uses 1 of your N listing slots"; Publish |

**Automatic checks before publishing**

- vague pay
- pay that looks below minimum wage (a warning only, since state law and contractor status vary)
- a missing housing or meals cost
- photos that don't show what their slot says
- prohibited wording, such as "US citizens only"
- whether the Additional step link's domain is safe

**Provenance**

Every listing records how it was created: host-created, imported, or (later) sourced.

### 7.2 Moderation on publish

Publishing runs automated moderation and fraud screening. Low-risk listings go live immediately. Risky ones go to the operator review queue. A host's first listing goes through business verification first (section 19).

### 7.3 Lifecycle and slots

| Rule | Decision |
|---|---|
| Expiry | **No timer.** An active listing holds 1 slot until it is closed. Drafts don't use a slot. |
| Reminders | At 30, 60 and 90 days, then every 90 days: "Still hiring?" with Yes / Edit / Close. Answering Yes shows "Confirmed active N days ago" on the detail page. **It doesn't move the listing up in Newest**, because moving up is what Boost is for. |
| Automatic close | A listing with a fixed end date closes when that date passes. Ongoing and year-round listings never close on their own. |
| Closing | Frees the slot immediately. Applicants and message threads remain. |
| Downgrade or lapsed subscription | The host chooses which listings stay within the new limit. The rest close and move to the library. |
| States | Draft → In review → Active → Closed. A listing can also be Removed by moderation. |
| One application per seeker per listing | Yes. A reposted listing is a new listing, so a seeker can apply again. |

### 7.4 Listing library and repost

- **The library** keeps every listing the host has ever created, with its stats.
- **One-tap Repost** copies a listing into a new draft with its dates moved forward a year. Photos and screening questions are kept, and the draft opens at Review.
- **A repost reminder** arrives 8 weeks before the date the listing was posted the previous year.

## 8. Host page (public)

The host page is modeled on a Facebook business page. Its address is `/hosts/[slug]`, it is public, and Google indexes it.

| Area | Contents |
|---|---|
| Header | Cover and logo; name and subscriber badge (tooltip: "Active Explore&Earn host since [date]"); **Hiring now** pill (shown automatically while any listing is active, and also on map previews); category icons; home location; member-since date; **"Usually replies within a day"** (measured from message threads, shown after 10+ conversations); Follow, Share and Website buttons |
| Not hiring | "Not hiring right now · Usually hires Feb–Apr" (worked out from past listings), with Follow |
| Stats | Open jobs, locations, followers (the follower count shows only once it passes 25) |
| Tabs | **Jobs** (grouped by location, each with current weather) · **About** (story, perks, social links) · **Photos** (up to 24) · **Locations** (map and weather) · **Team** (optional, up to 12 people) · **FAQ** (optional) · **As described** (shown at 5+ responses) |
| Follow | Followers are notified when the host posts a new job |
| Announcements | A paid announcement pins to the top of the host page for its 7 days |

Weather comes from the US National Weather Service API, which is free and needs no key. If it fails, the weather is simply hidden.

## 9. Seeker profile and resume

### 9.1 Profile contents

| Section | Decision |
|---|---|
| Identity | Name, cover photo, avatar, headline and bio, general location |
| Experience and education | Structured entries |
| Skills | Up to 60 stored, with **up to 15 highlighted** |
| Certifications | Self-reported, with expiry dates. Nothing is verified, and the interface never implies that it is. |
| Languages, portfolio | Languages, and up to 5 portfolio links |
| Availability | Now / 1 month / 3 months / Beyond, or an exact date, **always shown as a real date**. The seeker is asked to reconfirm after 30 days. |
| Private preferences | Categories, states, minimum pay, housing and meals, willingness to relocate |
| Work authorization (self-reported, private) | "Authorized to work in the US" / "I'll need visa sponsorship" (J-1, H-2A, H-2B or other) / "I already have a visa" (type and end date). Hosts see it only on an application. |
| Contact details | Hidden until the seeker applies or answers "Interested" to an invite |
| References | Not included |

### 9.2 Resume

- **The profile is the resume.** There are two PDF templates, Classic and Compact. A seeker can upload their own PDF instead.
- **There are no multiple tailored resume versions.** Each application freezes a copy at the moment it's submitted.
- **AI import:** the seeker uploads a resume and AI fills in the profile. The seeker reviews each field before it's saved. This requires consent, and the AI provider must not train on user data.
- **AI writing help** is available on bio, headline and experience. It's free.

### 9.3 Profile tab layout

Layout matches the design board:

1. **Header:** cover, avatar and name.
2. **Missing-item line:** there is **no completeness bar**. A single line appears only while something is missing that keeps the seeker out of host searches, e.g. "Add your availability so hosts can find you".
3. **Availability card:** shows the date and "Confirmed N days ago", with an Update button.
4. **My jobs:** Saved, Applied, Interviews, Offers, Invites, Skipped.
5. **Resume:** choose a template, Download PDF, or Upload instead.
6. **Visibility:** "Visible to hosts" and "Show my photo to hosts".
7. **Links:** Job alerts, Notifications, Privacy and data, Settings, Help.

### 9.4 Discoverability and staged reveal

- **Discoverable by default.** "Visible to hosts" is a switch that can be turned off at any time, and onboarding explains it.
- **A seeker appears in candidate pools** only when all of these are true:
  - they're visible to hosts
  - they've stated their availability
  - they have at least one category or occupation
  - their work authorization fits the listing: a seeker who needs sponsorship is left out of pools for listings that don't sponsor
- **What a pool card shows before the seeker applies or answers Interested:** first name and last initial, general location, availability, skills, fit, and the photo only if they allowed it.
- **What it never shows before then:** contact details, full name, or the full resume.

## 10. Applying

- **Applications are internal only.** Any external step is the "Additional step" note from section 6.
- **The flow:**
  1. The seeker reviews the profile copy and any required fields.
  2. They answer the screening questions.
  3. They review everything once more.
  4. They submit explicitly.
  5. The platform stores **one immutable application** with a receipt.
- **Gestures never submit an application on their own**, and neither does signing in.
- **If the listing doesn't sponsor visas** and the seeker needs sponsorship, they see "This host doesn't sponsor visas. Apply anyway?" before submitting.
- **If the listing changes** while a seeker is mid-application, they have to review it again.
- **Withdrawing:** the seeker can withdraw from the application or its message thread at any time.

## 11. Host hiring

### 11.1 Applicant pipeline

| Item | Decision |
|---|---|
| States | New → Shortlisted → Interviewing → Offered → Hired. Side exits: Not selected, Withdrawn (by the seeker), Offer declined. |
| Pass | Marks the applicant Not selected after a 10-second undo. The seeker gets the host's editable "Not selected" message. |
| Views | A pipeline across all listings, filtered by listing; a card deck that can be swiped one applicant at a time; a list view |
| Pool actions | Hide / Save / Invite |

### 11.2 Fit score (host-side only)

| Item | Decision |
|---|---|
| Inputs | Only job-relevant stated fields: occupation and category, availability overlapping the listing dates, skills compared with the listing's skills, required certifications, work authorization compatibility, minimum pay compared with the listing's pay, willingness to relocate or state preference |
| Weights | Fixed platform defaults per category at launch, shown in the "Why a good fit" pop-up. Host-adjustable weights may come later. |
| Explanation | **Template-based, not AI**, e.g. "Available for your full dates", "8 of 10 listed skills" |
| Guardrails | Never uses protected traits, photo, name, age or gender. **Never rejects anyone automatically.** Used only to rank candidate pools and sort applicants. |
| Legal | Hiring-score tools are regulated in some places (NYC's automated employment decision tool law, the Colorado AI Act). **A legal check is required before launch.** |

### 11.3 Candidate pools and job invitations

| Item | Decision |
|---|---|
| Where | A Candidates tab on each listing, ranked by fit, filterable by state, availability and skills |
| Credits | One invite costs 1 credit. Credits per month by plan are in section 16. Unused credits don't roll over. Extra packs are available. |
| Invite contents | The job card plus a note of up to 300 characters |
| Seeker's options | **Interested** (opens the thread and prompts them to apply) / **Not interested** (optional reason) / **Mute host** |
| Limits | One invite per seeker per listing. Each seeker receives **at most 10 invites a week** across all hosts. Above that, the host sees "Not accepting invites right now" and no credit is used. |
| Expiry | 14 days, or sooner if the listing closes |
| Statuses the host sees | Sent / Interested / Applied / Not interested / Expired. There is no "viewed" receipt. |

### 11.4 Interview scheduling (built in)

| Item | Decision |
|---|---|
| Invite | The host proposes 1–5 time slots, a format (video, phone or in person) with a link or address, and a note |
| Seeker's options | **Pick a time** / **Request new times** (up to 3 windows plus a note) / **Decline**. Declining asks "Also withdraw your application?" |
| Expiry | **The host chooses 48 or 72 hours; the default is 72.** Slots that have passed can't be chosen, and the invite expires early once every slot has passed. |
| States | Invite sent / Scheduled / New times requested / Declined / Expired / Canceled / Completed / No-show |
| Rescheduling | Either side can reschedule |
| After the interview | Once the time has passed, the host marks it Completed or No-show. If the host marks nothing within 48 hours, it becomes Completed. |
| Where it lives | A card in the application's message thread, with system events posted there |
| Calendar | Notifications include an .ics file. Reminders go out 24 hours and 1 hour before. |
| Visibility | Host pipeline chips show the state. No-show is visible only to that host's organization. |

### 11.5 Offers

An offer card in the thread contains:

- position, start date and pay
- a note
- an optional PDF offer letter

The seeker can **Accept**, which marks them Hired, or **Decline**, which marks the offer declined.

### 11.6 Messaging

| Item | Decision |
|---|---|
| When a thread exists | Only after a seeker applies or answers Interested to an invite. There are no cold messages in either direction. |
| Who's in it | The seeker, plus the host team members assigned to that listing |
| Attachments | PDF, JPG, PNG and HEIC files, up to 10 MB each and 5 per message, each scanned for malware. Links show an off-site notice. |
| Cards in the thread | Application submitted, interview invite, offer, and the status changes the seeker is allowed to see |
| Host tools | Up to 20 saved replies per organization, with fill-ins. Bulk messages go only to one listing's applicants. There's a default "Not selected" message the host can edit. |
| Read receipts | None. Hosts get the "Usually replies within a day" figure instead. |
| Notifications | In-app and push right away. Email if still unread after 15 minutes, batched. The email has a "Reply in app" button; replying by email isn't supported. |
| Scam protection | AI flags requests for money, gift cards, bank or Social Security details before hiring, and attempts to move the conversation to another app. When it does, the seeker sees "Never pay to get a job". Report and Block are on every thread. |
| After a listing closes | The thread stays open for 90 days, then becomes read-only |
| Not included | Voice or video calls, translation, typing indicators |

## 12. "As described" check

After a job's end date, eligible workers answer **Yes / Partly / No** for housing, meals and pay.

- **Who's eligible:** anyone the host marked Hired, or a seeker who confirmed "I worked here" after accepting an offer.
- **Where it shows:** on the host page once there are at least 5 responses, and per listing in host analytics.

## 13. Community

| Item | Decision |
|---|---|
| Entry point | The Community icon in the seeker top bar. It has three tabs: **Feed** / **Photos** / **Announcements**. |
| Who can see and post | **Signed-in seekers only.** Community is not indexed by search engines, and guests see an explanation and a sign-in prompt. |
| Identity | The seeker's profile name and avatar, and nothing else |
| Posts | Photos only. **No captions, tags, place or feeling.** Alt text is AI-generated and editable by the poster. |
| Moderation | AI moderation before anything is published. Child-safety hash matching runs on every image (section 19). |
| Reactions | Working set: Fire / Wow / Like / Love (not final). One reaction per person. Press and hold to open the picker; hover on desktop; fully keyboard accessible. |
| Comments | **None, anywhere** |
| Hosts | Hosts can't post photos. They appear only through paid announcements and boosts. Hosts get no free announcements. Platform announcements are partly automated. |
| Feed mix | Seeker photos plus paid items (boosted jobs and announcements, at most 1 in 5 items), all clearly labeled |
| Safety | Block and Report everywhere |
| Later | Seeker stories may come later, as another Community content type, without changing the core models |

## 14. Notifications

| Item | Decision |
|---|---|
| Channels | In-app, email (Resend) and web push. **No SMS at launch** (SMS would require carrier registration). |
| Settings | On/off switches per category. Security and billing emails can't be turned off. |
| Email batching | Message emails are batched after 15 minutes unread. Job alerts are daily. The weekly digest is opt-in. |
| Reminders | Interviews (24 hours and 1 hour), availability reconfirmation (30 days), "Still hiring?", reposts, expiring invites |
| Email law | Every marketing email includes an unsubscribe link and the business's mailing address |

## 15. Navigation

### 15.1 Seeker

- **Mobile bottom tabs:** Seek · Swipe · Map · Profile. These are pinned and never change. Profile shows a dot when something needs attention.
- **Top bar on discovery tabs:** logo on the left; Community, Inbox (messages, job invites and interview invites, with an unread count) and Notifications on the right. Signed-out visitors see "Sign in" instead of Inbox and Notifications.
- **Desktop:** a top bar with Seek · Swipe · Map · Community on the left, and Inbox, Notifications and the avatar menu on the right.
- **Not final:** the exact top bar is decided in the design system. Two options to test are a "Seeker" or "Host" badge beside the logo, and a hamburger menu to keep the bar uncluttered.

### 15.2 Host

- **Desktop sidebar**, in this order:
  - organization switcher
  - Home: today's applicants, today's interviews, unread messages, reminders, quota
  - Listings: Active, Drafts, Library
  - Applicants
  - Candidates
  - Interviews
  - Messages
  - Promote: Boosts, Announcements, credits
  - Analytics
  - Host page
  - Team
  - Billing
  - Settings
- **Phone:** bottom tabs Home · Applicants · Messages · Listings · More.

### 15.3 Operator

The operator console has its own address and sidebar. It is never mixed into the seeker or host apps.

## 16. Pricing and entitlements

| | **Starter** | **Professional** | **Enterprise** |
|---|---|---|---|
| Monthly | $99 | $299 | $599 |
| Annual (10× monthly) | $990 | $2,990 | $5,990 |
| Active listing slots | 2 | 10 | 30 |
| Team seats | 1 | 5 | 15 |
| Invite credits / month | 10 | 50 | 150 |
| Support | Help center + email | Priority queue | Priority + guided onboarding |
| Host page, full analytics, fit scoring | ✓ | ✓ | ✓ |
| Extra listing slot (per month) | $39 | $29 | $19 |

- **Every tier gets everything that matters for hiring.** Tiers differ only in listings, invites, seats and support.

**Paid add-ons**

| Add-on | Prices | Notes |
|---|---|---|
| **Boost** | $49 / 7 days, $79 / 14 days, $99 / 28 days | Placement rules in section 5.4 |
| **Announcements** | 1, 3 or 5 per month for $49, $99 or $149 | Each runs for 7 days and pins to the host page while it runs |
| **Extra invite packs and extra seats** | Prices are open (section 26) | Sold as add-ons |

- **No "Featured host" product.**

**Verified badge**

- **The badge means an active subscription**, and its tooltip says so honestly: "Active Explore&Earn host since [date]".
- Automated fraud screening must pass before anything is published.

**Founding hosts**

- The first 100 hosts get **90 days free, then 30% off for life**.
- The free period starts at public launch. Founding hosts onboard privately before that, using invite codes.
- If a founding host cancels and returns within 6 months, they keep the founding rate.

**Seekers pay nothing, ever.**

## 17. Host analytics (same on every tier)

**Number tiles:** Views, Saves, Applications, Interviews, Hires and Followers, each with the change from the previous period.

**Bar charts:**

- hiring funnel: Views → Applications → Interviews → Hires
- applications per listing
- views and applications by week
- invites: sent → interested → applied
- views during a boost compared with before it
- As described: Yes / Partly / No

**Pie charts:**

- where applicants came from: Seek, Swipe, Map, Invites, Boost, landing pages
- applicant status

**Controls:**

- a Chart / Table switch on every card
- date range: 7 days, 30 days, 90 days, this season, all time
- filter by listing or location
- CSV export

Analytics **never shows who viewed or saved** a listing.

## 18. AI usage

| Use | Model | Notes |
|---|---|---|
| Moderation and classification: listings, photos, messages, scam signals, alt text | Claude Haiku 5.5 (`claude-haiku-5-5`) | Clear cases are decided automatically. Uncertain ones go to the operator queue. |
| Parsing: resume import, pasting a job post into the builder | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | Every field is reviewed by the user before saving |
| Writing help: seeker profile, listing description | Claude Sonnet 5.5 | Free for seekers |
| Support automation | Claude Sonnet 5.5 | Answers automatically when confident, drafts a reply for an operator otherwise |

**Not AI:**

- the "Why a good fit" explanation, which is template-based
- any seeker guide or chat assistant, which was skipped

**Data:**

- Resume processing requires the seeker's consent.
- The AI provider must not train on user data.
- What the AI does is disclosed in the privacy policy.

## 19. Trust, safety and privacy

| Area | Decision |
|---|---|
| Host verification | Business verification is automated when a host first publishes. A host whose verification is uncertain goes to the fraud queue. |
| Credentials | Self-reported only. They are never labeled "verified". |
| Images | Every upload is scanned for child-sexual-abuse material by **hash matching** (the Cloudflare CSAM Scanning Tool or PhotoDNA). A match is blocked and preserved automatically, and a report is prepared for NCMEC. The platform must be registered with NCMEC as a service provider. |
| Files | Every resume and attachment is scanned for malware before anyone can download it |
| Discrimination | Moderation flags wording such as "US citizens only". Hosts may ask about visa sponsorship. |
| Scams | Message scanning as described in section 11.6 |
| Block and Report | Available on every surface |
| Privacy rights | Data export and account deletion run automatically. Retention rules follow `docs/v1/05` and `11` unless this spec says otherwise. |
| International users | EU and UK seekers bring their privacy law (GDPR) into play. This needs a cookie consent banner for EU visitors and data-processing agreements with our vendors. **A legal check is required before launch.** |
| Work law | Paid work only, which avoids the wage-law risk of unpaid work. Listings record whether the job is for an employee or a contractor. |

## 20. Operator console

| Area | Decision |
|---|---|
| Home | Sign-ups, active listings, applications, monthly recurring revenue, cancellations, failed payments, items waiting for review, system alerts. Links out to PostHog, Stripe and Sentry. |
| Review queue | Escalations only: flagged listings, photos and messages; reports; uncertain fraud checks; appeals. Each shows the AI's reason and confidence, with Approve / Remove / Ask for info / Suspend / Ban. |
| Automation settings | Thresholds per check. Each week a random 1% of automatic decisions is sampled for an operator to audit. |
| Child-safety matches | Blocked automatically, then the NCMEC report is prepared for an operator to submit. Always an immediate alert. |
| Users and organizations | Search, full history, and actions: suspend, restore, refund, extend a trial, grant credits, change plan. "View as user" is read-only. |
| Billing and founding hosts | Refunds, coupons, free accounts, invite codes, and the count toward the 100 |
| Content | Platform announcements, the help center, landing page copy and photos |
| Support inbox | AI answers automatically or drafts a reply |
| Settings | Limits (e.g. 10 invites per seeker per week), category and genre lists, AI thresholds. Prices live in Stripe. |
| Privacy requests | Run automatically. Only exceptions reach an operator. |
| Audit log | Every operator action, permanent and searchable |
| Alerts | A daily digest, plus immediate alerts for child safety, outages, spikes in failed payments and fraud spikes |
| **Multiple operators** | **Owner** and **Operator** roles, with operators assigned to queues. Shift status On shift / Away. Items are routed to the on-shift operator with the fewest open items, and each item belongs to one operator at a time. Time limits before an item moves on: child safety 1 hour, fraud 4 hours, reports and support 24 hours. Items can be escalated to a named operator or to the Owner, with a reason. Internal notes with @mentions. An activity feed of everyone's actions. A second operator must approve bans and refunds over $500 once there are 2+ operators. Appeals go to a different operator than the one who decided. Per-operator stats. |

## 21. Brand and voice

| Where | Line |
|---|---|
| Homepage headline | **Built for seekers, by seekers.** |
| Supporting line | Seasonal, maritime, farm and remote jobs, some with housing and meals. Free for seekers, forever. |
| About page | The founder's own story of working these jobs, which backs up the headline |
| Seeker sign-up and onboarding | Work worth going somewhere for. |
| State, destination and genre landing pages | Explore the country. Earn as you go. |
| "Add to Home Screen" prompt, email footers, social posts | Mixed between the two lines above |
| Host pricing page | Hire people who want to be there. |

- **Voice:** plain and warm, addressing the reader as "you", outdoorsy without being cute. No pile-ups of exclamation marks. No emoji in the interface except reactions.
- **Name:** written **Explore&Earn** everywhere.
- **Housing:** copy never implies that every job includes housing.

## 22. Visual design

- **Direction B: clean and photo-first, with warm neutrals.** The standard is **professional, clean, easy to read and meticulously organized.**
- **Color is used only to carry meaning.** Category colors and the green "Provided" are the only colored elements. Everything else is warm neutrals and a near-black for primary buttons.
- **Shapes:** organizations get rounded-square logos and people get round avatars.
- **Chips** have two lines: a small label above a bold value.
- **Typography:** one sans-serif family. The board uses Figtree, which the design system will confirm.
- **Accessibility and themes:**
  - light and dark modes, following the device setting
  - WCAG 2.2 AA
  - touch targets of at least 44 px
  - text contrast of at least 4.5:1
  - reduced-motion support
- **The locked design system is the first Foundation deliverable**, and no screen is built before it:
  - tokens
  - type scale
  - spacing
  - the shared card
  - chips and pop-up sheets
  - buttons
  - forms
  - navigation
  - charts
  - empty states, errors and loading
  
  It is reviewed as real mockups before it's locked. Later changes go through the design system, never through one-off styling on a single screen. The rule is enforced by lint.

## 23. Platform and architecture

| Area | Decision |
|---|---|
| App | Next.js (App Router), TypeScript in strict mode, hosted on Vercel. Responsive web app and PWA with a deliberate "Add to Home Screen" prompt. |
| Structure | A modular monolith with named domain modules: identity, organizations, listings, discovery, profiles, applications, hiring, messaging, billing, community, trust, notifications, operator. Modules talk through domain services, never direct table writes from outside the module. |
| API | API-first and versioned (`/api/v1`) with a published schema, so that native apps can be added later |
| Database | Supabase Postgres with PostGIS. The database is the authority for permissions, publishing, quotas and submissions; cached search never is. Search starts with Postgres full-text and geographic indexes. |
| Identity | Clerk (users, organizations, roles, passkeys), synced to Postgres through webhooks. Authorization is enforced on the server and by row-level security. |
| Files | Supabase Storage: private buckets, signed URLs, and a scanning pipeline before anything is available |
| Background jobs | Supabase Cron and Queues, with an outbox for every side effect (email, push, reminders, moderation, webhooks) |
| Payments | Stripe Billing (subscriptions, add-ons, coupons), with webhooks feeding an entitlement ledger. The ledger never rewrites past invoices. |
| Email | Resend, with versioned templates |
| Push | Web Push with VAPID keys |
| Maps | Mapbox GL JS, loaded only when needed |
| Weather | US National Weather Service API |
| AI | Claude API (section 18) |
| Analytics and errors | PostHog and Sentry |
| UI kit | shadcn/ui, Radix and Tailwind, with design tokens enforced by lint |
| Environments | Separate Supabase projects for dev, preview and prod. Migrations reach production only through a gated release in CI. |
| Targets (from `docs/v1/00`) | Tested against 50,000 synthetic listings: search p95 ≤ 800 ms, writes p95 ≤ 1 s at 50 concurrent users, map and list changes visible within 60 s, a usable first discovery screen within 3 s on a mid-range phone, 99.5% monthly availability, restore point ≤ 24 hours and restore time ≤ 8 hours (proven by a drill) |

## 24. Integrations

| Service | Purpose | What the founder provides |
|---|---|---|
| Clerk | Identity, organizations, roles | Connector already connected. Google sign-in credentials for production. |
| Supabase | Database, storage, background jobs | Connector authorization. Approval of the Pro plan for production. |
| Vercel | Hosting, previews, domains | Connector authorization. Approval of the Pro plan (required for commercial use). |
| Stripe | Subscriptions and add-ons | Connector authorization. Account activation for live mode. |
| Resend | Email | Connector authorization. DNS records for the sending domain. |
| PostHog / Sentry | Analytics and errors | Connector authorization |
| Mapbox | Maps | API token |
| Anthropic | Claude API | API key |
| Malware scanning | Resume and attachment scanning | API key (vendor chosen in the Foundation spec) |
| Cloudflare | DNS and child-safety image scanning | Move DNS to Cloudflare and provide an API token limited to the domain (recommended), plus NCMEC registration |
| National Weather Service | Weather | None |
| GitHub | Code and CI | Already working |

## 25. Delivery plan

Eight sub-projects, built in this order. Each gets its own spec, plan and build cycle. Trust and safety hooks are part of every stage from Foundation onward.

| # | Sub-project | Scope | Done when |
|---|---|---|---|
| 1 | **Foundation** | Locked design system; app shell and navigation; Clerk identity, organizations and roles synced to Postgres; core database schema and conventions; API skeleton; file storage and scanning pipeline; moderation framework (AI checks, queues, thresholds); audit log; outbox and background jobs; notification channels; operator console skeleton with sign-in, queues and multi-operator routing; CI/CD and the three environments | The design system is approved. A signed-in seeker, host and operator each land in their own shell. An uploaded file goes through scanning. A test item flows through the moderation queue. Migrations deploy dev → preview → prod through CI. |
| 2 | **Host supply and billing** | Organizations, team and roles; host page; listing builder; the publishing lifecycle, slots, reminders, library and repost; Stripe plans, annual billing, extra slots, coupons, founding-host codes; automated business verification | A founding host can sign up with a code, build their page, publish a listing, and be billed correctly in Stripe test mode. **Private pre-launch begins.** |
| 3 | **Discovery** | Seek, Swipe, Map; search, filters and sort; listing detail; landing pages and SEO; saved searches and alerts; guest browsing | Every mode works on the real founding-host listings and meets the performance targets |
| 4 | **Seeker** | Profile and resume; AI import and writing help; availability; visibility; applying; My jobs; invites inbox | A seeker can build a profile, apply, and track the application |
| 5 | **Host hiring** | Pipeline; fit score; candidate pools and invites; interviews; offers; messaging; "As described"; analytics | The full journey runs end to end: invite → apply → interview → offer → hired |
| 6 | **Paid add-ons** | Boosts (with all placements), announcements, extra invite packs and seats | Every add-on can be bought, is labeled, respects its caps, and is reported in analytics |
| 7 | **Community** | Photos, AI alt text, reactions, the feed mix, the three tabs | A seeker can post a moderated photo and react, and paid items mix in under the 1-in-5 cap |
| 8 | **Trust, privacy and launch readiness** | The full operator console; privacy tools; the cookie banner; legal documents; accessibility and performance audits; restore drill | Every launch gate has passed |

**Launch gates** (all must pass before going public):

- legal review of the terms, privacy policy, fit-score compliance (NYC and Colorado), GDPR, wage law, and the visa wording
- NCMEC registration, with child-safety scanning live
- an accessibility audit at WCAG 2.2 AA
- performance targets met
- a restore drill passed
- Stripe in live mode
- domain cut-over planned, with the live site kept until the switch

## 26. Open items (each has an owner and a deadline)

| Item | Owner | Decide before |
|---|---|---|
| Prices for extra invite packs and extra seats | Founder | Sub-project 6 |
| Final reaction set | Founder | Sub-project 7 |
| Final top bar layout (role badge, hamburger) | Founder and design | Design system lock (sub-project 1) |
| Domain, and where DNS is managed | Founder | Sub-project 1 (staging subdomain) |
| Confirmation that seekers must be 18 or older | Founder | Sub-project 1 (schema) |
| Malware-scanning vendor | Engineering | Foundation spec |
| Default fit-score weights per category | Engineering, reviewed by the founder | Sub-project 5 |
| Legal reviews (section 25 gates) | Founder and counsel | Launch |

## 27. What changes from `docs/v1`

| Old | Now |
|---|---|
| D01: one identity with a seeker profile plus host memberships, and a switch | **One account, one role** (section 2) |
| C03 and D03: match shown on the card as factual hints; Remote with no physical pin | **No match on the seeker card.** A host-side fit score instead. **Remote is pinned at the host's location.** |
| D04: housing and meals photo slot labels were open | Confirmed: Housing has Bedroom / Bathroom / Kitchen / Exterior. Meals has Kitchen / Meal example / Dining area / Other. |
| Housing and meals could be "unknown" | **Never unknown.** A listing either provides them or not. The cost is a required structured field. |
| D05: weather was optional | Included per location from the National Weather Service. Hidden if it fails. |
| D06: local extraction first for resume import | AI import with consent and a no-training provider |
| D07 and the resume studio: versioned resumes | **The profile is the resume.** Classic and Compact templates, or an uploaded PDF. Each application freezes a copy. |
| D08: 20 highlighted skills | **15 highlighted**, up to 60 stored |
| D10: credential document pilot | Self-reported credentials only |
| D11: affiliations | Not in V1 |
| C13 and D13: tags, place, feeling, caption | **None.** Photos only, with editable AI alt text. |
| D14: a separate community handle | The seeker's profile name and avatar |
| D15: photo review during staffed hours | AI moderation before publishing, with operator escalation |
| D16: Like / Love / Inspired | Fire / Wow / Like / Love (working set). **No comments anywhere.** |
| D17–D21: ad formats and prices open; boosts limited to Community | Boost $49 / $79 / $99 shown in the Feed, Swipe, Seek and Map, with set caps. Announcements sold in packs. No free host announcements. |
| D22: English-speaking, adult, US pilot | US jobs, paid work only, international seekers welcome (with sponsorship fields), English only, seekers 18+ |
| D24: proposed tagline | Adopted, with the founder's story backing it |
| D25: map direction | Confirmed: host-location pins with a host preview |
| D26: dashboards brainstorm | Defined in sections 9.3, 15 and 17 |
| D27 / C18: tier prices, slots and analytics split open | Priced (section 16). **Analytics is the same on every tier.** |
| D28: interviews as a pipeline view only | **Built-in scheduling** (section 11.4) |
| Listings expired after a set time | **No timer.** Slots, reminders, and automatic close at a fixed end date. |
| 8 platform staff roles | Operator roles Owner and Operator, assigned to queues (section 20) |
| C17: changes to documentation only | Superseded. Implementation is authorized. |
| README, 08 and 09 call `explore-earn` the archived predecessor | **Wrong.** `explore-earn` is a rename redirect to this repo. The real predecessor is `exploreearn`. Fix those docs. |
