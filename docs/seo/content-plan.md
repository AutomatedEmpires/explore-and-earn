# SEO content plan: states, seasons, and job types

Draft for founder review. 10 November 2026. Task: Explore&Earn issue 81.

This is the copy, linking, and structured-data plan for the SP3 W8 landing surfaces. It does not change routes, schema, or the indexable rule. Those stay in the discovery spec and plan. Custom copy here is what an operator stores on `landing_pages` when a page is ready to publish.

Read against commit `5dfd5131c1a45d2f6d1b726873eebec83ea885c4` on `integrate/sp2-20261104`.

## Sources

Product and engineering, at that commit:

- Product design, sections 3, 5.1, 5.3, and 21: `docs/superpowers/specs/2026-11-03-explore-earn-product-design.md`
- Discovery spec, section 8.11: `docs/superpowers/specs/2026-11-03-sp3-discovery-design.md`
- Discovery plan, Tasks 40–42 and the 10 November FD-8 addendum: `docs/superpowers/plans/2026-11-03-sp3-discovery.md`
- FD-8: `docs/decisions/2026-11-04-founder-decisions.md`
- Taxonomy: `src/lib/taxonomy.ts`
- State slugs: `src/lib/discovery/states.ts`
- Season windows: `src/lib/discovery/dates.ts`
- Destination seed (63 national parks and resort areas): `drizzle/1110_destinations_seed.sql`
- Quality bar v1: https://github.com/AutomatedEmpires/explore-and-earn/issues/45#issuecomment-6783016464

Market facts below are only ones already cited in `docs/research/2026-11-market-research.md`. This plan adds no search-volume tool export and no new statistics. Where a number would have been useful and we do not have a source, the number is omitted.

Structured-data field lists follow the discovery spec and plan. The public references those fields are written against:

- Google Search Central, Job posting: https://developers.google.com/search/docs/appearance/structured-data/job-posting
- Google Search Central, Breadcrumb: https://developers.google.com/search/docs/appearance/structured-data/breadcrumb
- Schema.org `BreadcrumbList` and `JobPosting`: https://schema.org/BreadcrumbList and https://schema.org/JobPosting

## What the pages are

W8 serves a pre-filtered Seek feed with its own title, intro, and hero. Paths and generated titles, from discovery spec 8.11 and plan Task 40:

| Path | Key | Generated H1 on 10 November 2026 |
|---|---|---|
| `/jobs/[state]` | `state:<slug>` | "Jobs in Alaska" |
| `/jobs/[category]` | `category:<c>` | "Farm jobs" |
| `/jobs/[category]/[state]` | `category_state:<c>:<slug>` | "Farm jobs in California" |
| `/jobs/[category]/[genre]` | `category_genre:<c>:<g>` | "Seasonal jobs · Ski resorts" |
| `/seasons/[season]` | `season:<s>` | "Summer 2027 jobs", "Winter 2026–27 jobs", or "Year-round jobs" |
| `/destinations/[slug]` | `destination:<slug>` | "Jobs near Yellowstone National Park" |
| `/international` | `international` | "Working in the US from abroad" |

State slugs are lowercase names with hyphens for the 50 states and DC (`florida`, `north-carolina`, `district-of-columbia`). Territories can be filtered and have no landing page. Genre slugs turn the taxonomy code's underscores into hyphens (`ski_resorts` becomes `ski-resorts`). A genre under the wrong category does not resolve (`/jobs/farm/ski-resorts` is not a page).

Season pages pick the current occurrence if that window has not ended, otherwise next year's. Windows are Spring 1 Mar–31 May, Summer 1 Jun–31 Aug, Fall 1 Sep–30 Nov, and Winter 1 Dec through the end of February, labeled "Winter 2026–27". On 10 November 2026 the live labels are Summer 2027, Fall 2026, Winter 2026–27, and Spring 2027.

The strapline on every landing page is "Explore the country. Earn as you go." The default intro is "{scope}, some with housing and meals." The default SEO title is the H1 plus " | Explore&Earn", cut at 60 characters. The default SEO description is the intro, cut at 160 characters. A `landing_pages` row replaces the title, intro, hero, SEO title, and SEO description. Limits: title 1–80, intro ≤ 1,200, SEO title ≤ 60, SEO description ≤ 160, hero alt ≤ 150 and required when a hero is set.

A page is indexable only when at least one active listing matches. Otherwise it renders with `noindex`, stays out of the sitemap, and shows the empty state "No open jobs here right now." with a link to all jobs. Counts on Browse by State come from live listings. A state with none is an empty state. Sample counts, including the old "31 open jobs" in Wyoming, do not ship.

Remote jobs open to a state, or to the whole US, are included in that state's listings and in its Browse by State count. That is the FD-8 addendum's rule for `{ states: [code] }`.

## What this copy will not say

- Housing is not on every job. The product line is "some with housing and meals." When housing is provided, the listing states the cost. There is no Unknown value.
- These pages are paid employee or contractor jobs. They are not a work exchange.
- A subscriber badge is an active subscription and a host-since date. Copy does not say "verified host."
- Credentials a maritime listing asks for are self-reported. Copy does not say we check TWIC, MMC, or STCW.
- National Park Service jobs are hired on USAJOBS. Concession, lodge, and guiding jobs are hired by those employers. A destination page is the second kind, when a host names that destination on a listing.
- The product does not give visa advice. `/international` links only to the four official pages already in `OFFICIAL_VISA_LINKS`. Counsel reviews that page before launch.
- Remote is a real category and a bridge between seasons. It is not the first sentence of the homepage or of these seasonal pages.
- No page states a job count, a wage, or a housing price unless that figure is on a live listing or already cited in the market research. The public intros below use neither.

Voice, from product section 21 and quality bar U3: plain, warm, "you", specific, active. The name is Explore&Earn. No emoji. No stack of exclamation marks.

## Keyword and intent research

No keyword-tool volumes were pulled for this draft. Ranks use the intents below and the cited demand signals in the market research. A later pass can attach volumes. It must not invent them.

People already browse this market by place, season, and setting. CoolWorks sends seekers to national parks, lodges and resorts, ranches, summer camps, ski resorts, guiding, conservation, season, state, and housing. ([CoolWorks job-seeker FAQ](https://www.coolworks.com/faqs), as used in the market research.) Our landing types match that browse shape: state, season, destination, and genre. Genre is the setting (ski resort). Occupation is the role (lift operator). Seekers browse by genre. There is no occupation landing in the spec, so this plan does not add one.

The job to be done, before someone books a ticket, is to compare pay, start and end, housing type and cost, meals, and whether a friend can be housed. ([CoolWorks FAQ](https://www.coolworks.com/faqs).) The listing card already carries pay, dates, housing, and meals. Landing copy points at those fields. It does not restate them as a promise.

Calendar, which sets which season page matters on this date:

- Summer hiring starts in November, peaks January through March, and runs into spring. Fall and winter hiring starts around June or July. Employers keep hiring through the season because people leave. ([CoolWorks FAQ](https://www.coolworks.com/faqs).)
- Glacier's National Park Service seasonal recruitment runs from December into March. That is federal hiring, on a different site, in the same winter window. ([Glacier NPS jobs](https://www.nps.gov/glac/getinvolved/npsjobs.htm).)

So on 10 November 2026 the summer page is the season that is just opening (Summer 2027), and the winter page is the season already in its hiring window (Winter 2026–27).

Intent groups, and the URL that answers each:

| Intent | What the person is trying to do | URL we already have | What we do not add |
|---|---|---|---|
| Place | Work in a state, or live there and work remotely under the state's rule | `/jobs/[state]` | A second state URL with the postal code |
| Setting | National park, ski resort, summer camp, guest ranch, guiding | `/jobs/seasonal/[genre]` | An occupation URL such as `/jobs/lift-operator` |
| Season | Line up the next season while the hiring window is open | `/seasons/[season]` | A year in the path. The H1 carries the year |
| Named place | Yellowstone, Glacier, a ski town | `/destinations/[slug]` from the seed | A page for a place that is not in `listDestinations` |
| Farm crew | A harvest or livestock season with a wage and a known bed | `/jobs/farm` and `/jobs/farm/[state]` | An H-2A application walkthrough |
| Boat or plant | A hitch or a seafood season | `/jobs/maritime` | A claim that we validate documents |
| Housing | Know whether there is a bed, and the cost, before applying | The housing filter on the feed (`housing=provided` or `housing=free`) | A `/housing` landing. The spec has no such path |
| Visa | Read the official rules for working in the US from abroad | `/international`, after counsel | Advice, or a hint that Explore&Earn sponsors the visa |
| Remote between seasons | US remote work on the same free account | `/jobs/remote`, later | A homepage lead |

Demand signals used only to order the first 50. They are not page copy, and they are not a count of Explore&Earn jobs.

- H-2A certifications in FY 2025, top states by certified positions: Florida 56,934, Georgia 42,723, California 35,138, Washington 34,560, North Carolina 26,123. Certifications overstate filled jobs. The host we can serve is the operator who needs a few people to live on the place, not the large contractor. ([OFLC H-2A selected statistics, FY 2025 Q4](https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-2A_Selected_Statistics_FY2025_Q4.pdf), via the market research.)
- H-2B certifications in the same year, top states: Texas 22,594, Florida 21,482, Colorado fourth at 10,198. Top occupations include landscaping, housekeeping, forest and conservation workers, restaurant cooks, and amusement and recreation attendants. Meat, poultry, and fish cutters were 8,109 positions. The H-2B cap for the first half of FY 2027 was reached on 4 September 2026. ([OFLC H-2B FY 2025 Q4](https://www.dol.gov/sites/dolgov/files/ETA/oflc/pdfs/H-2B_Selected_Statistics_FY2025_Q4.pdf); [USCIS alert, 11 September 2026](https://www.uscis.gov/newsroom/alerts/uscis-reaches-h-2b-cap-for-first-half-of-fy-2027).)
- BEA's 2024 outdoor-recreation release: snow activities were the largest conventional activity in Colorado, New Hampshire, Utah, and Vermont. ([BEA outdoor recreation release for 2024](https://bea.gov/news/2026/outdoor-recreation-economic-statistics-us-and-states-2024).)
- Ski areas still had unfilled domestic jobs going into a recent winter: about 60 percent of resorts use J-1 workers, areas were on track to hire more than 8,000 J-1 students, and 3,400 ski-area jobs went unfilled the year before because local workers want year-round work. ([KUNC, 4 November 2025](https://www.kunc.org/regional-news/2025-11-04/despite-early-concerns-ski-resorts-are-optimistic-about-j-1-staffing).)
- Named summer places already in public hiring stories: Yellowstone (NPS employs around 780 people, US citizens, separate from concession hiring) and Glacier (Xanterra hiring about 750 seasonal employees for a May–September season; NPS hires about 350 summer seasonal positions). ([Yellowstone, work with us](https://home.nps.gov/yell/getinvolved/workwithus.htm); [Xanterra jobs FAQ](https://www.xanterrajobs.com/main/xanterra/faq); [Daily Inter Lake, 1 June 2025](https://dailyinterlake.com/news/2025/jun/01/j-1-student-workers-essential-for-summer-hiring/); [Glacier NPS jobs](https://www.nps.gov/glac/getinvolved/npsjobs.htm).)

Housing is an intent CoolWorks already ranks beside state and season. We answer it inside the feed. A housing-only URL would be a new page type, and this task does not add one.

## How the first 50 are ranked

Order is the order to load custom copy and to ask a founding host for the listing that makes the page indexable. A row stays `noindex` until that listing exists. Empty pages are not submitted.

Parents come before children so the breadcrumb and the in-body links have a target. Within a band, a page with a cited hiring window, a cited state concentration, or a place named in those sources comes before a page that only shares a region with one.

1. Season hubs that match the 10 November calendar, then the category and genre hubs CoolWorks-style browsing already uses.
2. Destinations the research names, then other parks and resort areas in those same states, from the seed.
3. State pages for the H-2A and H-2B concentrations, the BEA snow states we can attach to a park or resort already in the list, and the states those destinations sit in.
4. The farm-by-state and seasonal-by-state intersections for the strongest of those states, then maritime as its own category page.

New Hampshire and Vermont are BEA snow states. Stowe covers Vermont in this fifty. `/jobs/new-hampshire` and `/jobs/vermont` are the next state pages after it. `/jobs/farm/north-carolina` is the next farm intersection after it. North Carolina is already in the fifty as a state page because of the H-2A figure and Great Smoky Mountains.

## Page template and content blocks

Same order on every landing kind. Quality bar notes sit in the last column so a later UI pass can audit them. This task does not build the screen.

| Block | What the seeker sees | Rule |
|---|---|---|
| Breadcrumb | The trail in the structured-data section | U5. The last crumb is the current page. Deep link and Back both work |
| Hero | H1, the strapline, the intro, and a hero only when we have an original photo | V1: one H1. V6: no stock photo and no agency poster. No hero until a host or we supply a photo we can use. Alt is specific and ≤ 150 characters |
| Result line | The live total for this page's query, or the empty state | FD-8. Never a sample number. Above 10,000 the product already says "10,000+ jobs" |
| Feed | First page of Seek, server-rendered, `source=landing` on each card | U1: pay, dates, housing, and meals are on the card. The card title is the link to the listing |
| Mode links | "Swipe these jobs" and "See them on the map" | They keep this page's filters. `/swipe` and `/map` stay `noindex`. The landing URL is the one we index |
| Housing and meals | The feed's own filters, labeled "Housing provided", "Free housing", "Meals provided", "Free meals" | They do not create a second indexable URL |
| Related landings | The links named on that row below | Render a related landing only when that target is indexable, so an empty child is not a doorway |
| Empty | "No open jobs here right now." and a link to `/` | U2. This is the spec's empty line |
| Install prompt | Existing install rules | It does not open on the first view, and it is not part of the pitch |

Open Graph and Twitter images use the 1280 px hero when a hero exists. Quality bar P2: the image has explicit dimensions, a modern format, and loads lazily below the fold. The H1 does not wait on it.

SEO title and description for the first 50 are the custom strings below. They replace the generated default. Each title is the H1 plus " | Explore&Earn" and is within 60 characters. Each description is within 160 characters and repeats no statistic.

## Internal linking

The indexable URL is the landing path. These other URLs stay `noindex` and are how someone moves, not how Google should file the page:

- `/?state=FL` and the same query on `/swipe` and `/map`
- Any landing with a tracking parameter. Listing pages canonicalize without `source`

Recommended change, for a yes or no in the decisions at the end: Browse by State should send the state to `/jobs/[slug]`. The FD-8 addendum currently opens `/?state=<code>`. Spec 8.11 canonicalizes `/` with a query string to the bare `/`. A click from the state map would then point at the homepage, and the state landing would not be the target. The map can keep `/?state=<code>` as a seeker shortcut only if that URL's canonical is `/jobs/[slug]`.

Link rules:

- A state page links to the season hubs, to the category intersections in this fifty that match the state, and to each destination in the seed whose `states` array contains that state, once that destination is indexable.
- A category page links to its genres and to its category-plus-state pages in this fifty.
- A genre page links to the season that fits it, and to destinations of that setting. National parks link from `/jobs/seasonal/national-parks`. Resort areas that are ski towns link from `/jobs/seasonal/ski-resorts`.
- A destination page links to each of its states and to its genre page.
- A season page links to the genres that fit that season. Summer links national parks, summer camps, and guest ranches. Winter links ski resorts.
- Maritime and farm do not link to ski towns.
- `/international` is not linked from these fifty. It waits on counsel.
- `/jobs/remote` is not linked from the hero. It stays available in the category filter.
- Cards link to `/jobs/view/[id]/[slug]?source=landing`. The listing canonical drops `source`.
- Host names on cards link to `/hosts/[slug]` when that host page exists. Landing copy does not name a company as a customer.

Worked query pairs for the mode links:

| Page | Swipe and map query |
|---|---|
| `/seasons/summer` | `start=summer-2027` |
| `/seasons/winter` | `start=winter-2026` |
| `/jobs/florida` | `state=FL` |
| `/jobs/farm` | `cat=farm` |
| `/jobs/farm/california` | `cat=farm&state=CA` |
| `/jobs/seasonal/ski-resorts` | `cat=seasonal&genre=ski-resorts` |
| `/destinations/yellowstone` | `dest=yellowstone` |

## Structured data

Two types, on two different URLs. A landing page is a collection. It does not carry `JobPosting`. A listing page is one job. It carries `JobPosting` and does not carry the landing breadcrumb.

Every `<` in the JSON-LD is escaped as `\u003c`, as the discovery spec requires.

### BreadcrumbList, on each indexable landing page

Shape: `@context` `https://schema.org`, `@type` `BreadcrumbList`, `itemListElement` of `ListItem` with `position` starting at 1, `name`, and `item` as the absolute URL (`APP_URL` plus the path). The current page is the last item.

Task 40 currently says the trail is "Jobs" (`/`) and then the page. This plan uses one extra crumb when the page has a parent, so the trail matches the links in the body. That is a change to Task 40 if you approve it. Until then, W8 should keep the two-item trail and these names.

| Kind | Trail if the longer trail is approved | Names |
|---|---|---|
| State | Jobs → this page | Jobs, "Jobs in Florida" |
| Category | Jobs → this page | Jobs, "Farm jobs" |
| Category + state | Jobs → category → this page | Jobs, "Farm jobs", "Farm jobs in California" |
| Category + genre | Jobs → category → this page | Jobs, "Seasonal jobs", "Seasonal jobs · Ski resorts" |
| Season | Jobs → this page | Jobs, "Summer 2027 jobs" |
| Destination | Jobs → national-parks or ski-resorts genre, when that is the setting → this page | Jobs, "Seasonal jobs · National parks", "Jobs near Yellowstone National Park" |
| International | Jobs → this page | Jobs, "Working in the US from abroad" |

Resort-area destinations use the ski-resorts crumb when the town is in the ski list in this fifty (Vail, Breckenridge, Park City, Jackson Hole, Lake Tahoe, Aspen, Stowe, Whitefish, Big Sky). Park destinations use the national-parks crumb.

Example for `/jobs/seasonal/ski-resorts`, longer trail:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Jobs", "item": "{APP_URL}/" },
    { "@type": "ListItem", "position": 2, "name": "Seasonal jobs", "item": "{APP_URL}/jobs/seasonal" },
    { "@type": "ListItem", "position": 3, "name": "Seasonal jobs · Ski resorts", "item": "{APP_URL}/jobs/seasonal/ski-resorts" }
  ]
}
```

### JobPosting, on an active listing page only

Path: `/jobs/view/[id]/[slug]`. Closed and removed listings get no JSON-LD and `noindex`.

Fields, from discovery spec 8.11 and plan Task 41. The values in the notes are the plan's test fixture, not a live listing.

| Field | Rule |
|---|---|
| `@context`, `@type`, `title` | `https://schema.org`, `JobPosting`, the listing title |
| `description` | Plain-text paragraphs from the listing |
| `datePosted` | `publishedAt` |
| `validThrough` | The listing deadline, else the end date, else omit |
| `employmentType` | `FULL_TIME`, `PART_TIME`, or `CONTRACTOR`. Contractors use `CONTRACTOR` only. Fixed dates and season dates also include `TEMPORARY` |
| `hiringOrganization` | `Organization` with name, `sameAs` `{APP_URL}/hosts/{slug}`, and logo only when the host has one |
| `jobLocation` | On-site: `Place` / `PostalAddress` with city, state code, and `addressCountry` `US`. No street address |
| `jobLocationType` | Remote: `TELECOMMUTE`, and no `jobLocation` |
| `applicantLocationRequirements` | Remote: one `State` per allowed state, or `Country` `US` when the listing is open to the whole US |
| `baseSalary` | `MonetaryAmount` / `QuantitativeValue` in USD, min and max, `unitText` `HOUR`, `DAY`, `WEEK`, `MONTH`, or `YEAR`. Omit for season pay and crew share |
| `directApply` | `true` |
| `identifier` | `PropertyValue`, name `Explore&Earn`, value the listing id |
| `jobBenefits` | "Housing provided" and "Meals provided" only when that listing says so |

Do not add `aggregateRating`, `review`, or an estimated salary. We do not have those fields.

The listing page's visible breadcrumb, if W8 adds one later, is a separate decision. This plan puts `BreadcrumbList` on the landing page and `JobPosting` on the listing page.

## First 50 pages

Custom H1, SEO title, SEO description, and intro for the operator override. "Why" is the rank reason and is not page copy.

### 1. `/seasons/summer`

- Key: `season:summer`
- H1: Summer 2027 jobs
- SEO title: `Summer 2027 jobs | Explore&Earn`
- SEO description: Paid summer 2027 jobs. Some include housing and meals, and the listing says which and what housing costs. Compare pay and dates before you travel.
- Intro: Summer hiring is open. These are paid Summer 2027 jobs, some with housing and meals. Each listing states the pay, the start and end, and whether housing is provided and what it costs. Compare a few before you book a ticket.
- Why: CoolWorks says summer hiring starts in November and peaks January through March. This is that opening.
- Links: `/jobs/seasonal/national-parks`, `/jobs/seasonal/summer-camps`, `/jobs/seasonal/guest-ranches-and-lodges`, `/jobs/farm`.

### 2. `/seasons/winter`

- Key: `season:winter`
- H1: Winter 2026–27 jobs
- SEO title: `Winter 2026–27 jobs | Explore&Earn`
- SEO description: Paid winter 2026–27 jobs, including ski resorts. Some include housing and meals. Pay, dates, and housing cost are on the listing.
- Intro: Winter hiring is already underway. These are paid Winter 2026–27 jobs, some with housing and meals. Ski-resort listings can include staff perks such as a ski pass when the host adds that perk. The listing states the pay and whether housing is provided.
- Why: Fall and winter hiring starts around June or July, and people keep applying because crews turn over. KUNC's 4 November 2025 account of unfilled ski-area jobs is the setting.
- Links: `/jobs/seasonal/ski-resorts`, `/destinations/vail`, `/destinations/park-city`, `/destinations/stowe`.

### 3. `/jobs/seasonal`

- Key: `category:seasonal`
- H1: Seasonal jobs
- SEO title: `Seasonal jobs | Explore&Earn`
- SEO description: Paid seasonal jobs in parks, ski resorts, camps, lodges, and guiding. Some include housing and meals. Pay and housing are on each listing.
- Intro: Seasonal jobs in national parks, ski resorts, summer camps, guest ranches and lodges, festivals, and adventure guiding. Some include housing and meals. Farm work and boat work have their own pages.
- Why: Parent of the genre pages. CoolWorks already sorts this market by those settings.
- Links: the four seasonal genres in rows 5–8, plus `/seasons/summer` and `/seasons/winter`.

### 4. `/jobs/farm`

- Key: `category:farm`
- H1: Farm jobs
- SEO title: `Farm jobs | Explore&Earn`
- SEO description: Paid harvest, orchard, livestock, dairy, and greenhouse jobs. Some include housing. The listing states the wage and any housing cost.
- Intro: Paid harvest, orchard, vineyard, livestock, dairy, and greenhouse jobs. This is a wage and a stated housing cost when housing is provided. It is a job on Explore&Earn, not a visa filing and not a work exchange.
- Why: H-2A certifications show where farm hiring concentrates. The host this page is for is the operator who houses a small crew.
- Links: `/jobs/farm/florida`, `/jobs/farm/california`, `/jobs/farm/georgia`, `/jobs/farm/washington`, `/seasons/summer`.

### 5. `/jobs/seasonal/national-parks`

- Key: `category_genre:seasonal:national-parks`
- H1: Seasonal jobs · National parks
- SEO title: `Seasonal jobs · National parks | Explore&Earn`
- SEO description: Paid lodge, dining, maintenance, and guiding jobs that name a national park. Park Service jobs are hired on USAJOBS. Housing is stated on the listing.
- Intro: Paid work tied to a national park: lodges, dining, maintenance, and guiding. National Park Service jobs are hired on USAJOBS. These listings are from the employers who name that park. Some include housing and meals, with the cost on the listing.
- Why: CoolWorks' first browse is national parks, and Yellowstone and Glacier already have public seasonal hiring separate from NPS.
- Links: `/seasons/summer`, and the park destinations in rows 9–20 once each is indexable.

### 6. `/jobs/seasonal/ski-resorts`

- Key: `category_genre:seasonal:ski-resorts`
- H1: Seasonal jobs · Ski resorts
- SEO title: `Seasonal jobs · Ski resorts | Explore&Earn`
- SEO description: Paid ski-resort jobs for the winter season. Some include housing. A ski pass appears only when the host lists that perk. Pay is on the listing.
- Intro: Paid ski-resort jobs. Some include housing. A ski pass, employee discount, or end-of-season bonus appears only when the host lists that perk. Local towns often cannot staff the season alone, and the listing is how you see the wage and the bed before you apply.
- Why: KUNC, 4 November 2025, on unfilled ski-area jobs and J-1 staffing. BEA names Colorado, Utah, and Vermont for snow.
- Links: `/seasons/winter`, and the resort destinations in rows 21–29.

### 7. `/jobs/seasonal/summer-camps`

- Key: `category_genre:seasonal:summer-camps`
- H1: Seasonal jobs · Summer camps
- SEO title: `Seasonal jobs · Summer camps | Explore&Earn`
- SEO description: Paid summer-camp jobs. Some include housing and meals. The listing states pay, dates, and any housing cost before you apply.
- Intro: Paid summer-camp jobs for Summer 2027. Some include housing and meals. The listing states the pay, the dates, and the housing cost when a bed is provided.
- Why: CoolWorks lists summer camps beside parks and resorts, and the summer hiring window opens in November.
- Links: `/seasons/summer`, `/jobs/seasonal`.

### 8. `/jobs/seasonal/guest-ranches-and-lodges`

- Key: `category_genre:seasonal:guest-ranches-and-lodges`
- H1: Seasonal jobs · Guest ranches and lodges
- SEO title: `Guest ranches and lodges jobs | Explore&Earn`
- SEO description: Paid jobs at guest ranches and lodges. Some include housing and meals. Pay, dates, and housing cost are on the listing.
- Intro: Paid work at guest ranches and lodges. Some include housing and meals. This is a wage, not a stay in exchange for chores. The listing states the housing cost when a bed is provided.
- Why: CoolWorks sends seekers to lodges, resorts, and ranches. The market research names this operator as the one who can use a small number of listing slots.
- Links: `/seasons/summer`, `/jobs/seasonal`, `/jobs/farm` for livestock ranches that are farm work rather than a guest ranch.

### 9. `/destinations/yellowstone`

- Key: `destination:yellowstone`
- H1: Jobs near Yellowstone National Park
- SEO title: `Jobs near Yellowstone National Park | Explore&Earn`
- SEO description: Paid jobs that name Yellowstone National Park, in Wyoming, Montana, and Idaho. Concession hiring is separate from USAJOBS. Housing is on the listing.
- Intro: Paid jobs whose listing names Yellowstone National Park. The park sits in Wyoming, Montana, and Idaho. Concession and lodge employers hire separately from National Park Service jobs on USAJOBS. Some include housing and meals.
- Why: The market research cites Yellowstone NPS hiring and a winter season beside the summer season. The seed lists the park in WY, MT, and ID.
- Links: `/jobs/wyoming`, `/jobs/montana`, `/jobs/idaho` when that state page is indexable, `/jobs/seasonal/national-parks`, `/destinations/grand-teton`, `/destinations/jackson-hole`.

### 10. `/destinations/glacier`

- Key: `destination:glacier`
- H1: Jobs near Glacier National Park
- SEO title: `Jobs near Glacier National Park | Explore&Earn`
- SEO description: Paid jobs that name Glacier National Park in Montana. Employer listings are separate from National Park Service jobs on USAJOBS.
- Intro: Paid jobs whose listing names Glacier National Park in Montana. Lodge and concession employers hire separately from National Park Service jobs. Some include housing and meals, with the cost on the listing.
- Why: The market research cites Xanterra's Glacier season and separate NPS summer hiring.
- Links: `/jobs/montana`, `/destinations/whitefish`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 11. `/destinations/grand-canyon`

- Key: `destination:grand-canyon`
- H1: Jobs near Grand Canyon National Park
- SEO title: `Jobs near Grand Canyon National Park | Explore&Earn`
- SEO description: Paid jobs that name Grand Canyon National Park in Arizona. Housing and meals are stated on each listing, including when they are not provided.
- Intro: Paid jobs whose listing names Grand Canyon National Park in Arizona. Some include housing and meals. Jobs elsewhere in the state stay on the Arizona page.
- Why: The park is the named Arizona destination in a state we publish for H-2B-adjacent seasonal work and for the park itself.
- Links: `/jobs/arizona`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 12. `/destinations/yosemite`

- Key: `destination:yosemite`
- H1: Jobs near Yosemite National Park
- SEO title: `Jobs near Yosemite National Park | Explore&Earn`
- SEO description: Paid jobs that name Yosemite National Park in California. Housing, meals, pay, and dates are on the listing.
- Intro: Paid jobs whose listing names Yosemite National Park in California. Some include housing and meals. Other California work, including farm work, stays on the California and farm pages.
- Why: California is an H-2A concentration, and Yosemite is the park seekers name in that state.
- Links: `/jobs/california`, `/jobs/farm/california`, `/jobs/seasonal/national-parks`.

### 13. `/destinations/grand-teton`

- Key: `destination:grand-teton`
- H1: Jobs near Grand Teton National Park
- SEO title: `Jobs near Grand Teton National Park | Explore&Earn`
- SEO description: Paid jobs that name Grand Teton National Park in Wyoming. Jackson Hole and Yellowstone have their own pages.
- Intro: Paid jobs whose listing names Grand Teton National Park in Wyoming. Some include housing and meals. Jackson Hole and Yellowstone are separate pages when those listings exist.
- Why: Same Wyoming cluster as Yellowstone and Jackson Hole in the destination seed.
- Links: `/jobs/wyoming`, `/destinations/jackson-hole`, `/destinations/yellowstone`, `/jobs/seasonal/national-parks`.

### 14. `/destinations/rocky-mountain`

- Key: `destination:rocky-mountain`
- H1: Jobs near Rocky Mountain National Park
- SEO title: `Jobs near Rocky Mountain National Park | Explore&Earn`
- SEO description: Paid jobs that name Rocky Mountain National Park in Colorado. Ski towns in Colorado have their own pages.
- Intro: Paid jobs whose listing names Rocky Mountain National Park in Colorado. Some include housing and meals. Vail, Breckenridge, and Aspen are ski-town pages, not this one.
- Why: Colorado is a BEA snow state and the fourth H-2B state in the FY 2025 statistics. The park is the summer side of that state.
- Links: `/jobs/colorado`, `/jobs/seasonal/colorado`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 15. `/destinations/zion`

- Key: `destination:zion`
- H1: Jobs near Zion National Park
- SEO title: `Jobs near Zion National Park | Explore&Earn`
- SEO description: Paid jobs that name Zion National Park in Utah. Park City and the other Utah parks have their own pages.
- Intro: Paid jobs whose listing names Zion National Park in Utah. Some include housing and meals. Park City is the ski-town page for the same state.
- Why: Utah is a BEA snow state with several parks in the seed. Zion is the one to publish first beside Park City.
- Links: `/jobs/utah`, `/jobs/seasonal/utah`, `/destinations/park-city`, `/jobs/seasonal/national-parks`.

### 16. `/destinations/denali`

- Key: `destination:denali`
- H1: Jobs near Denali National Park
- SEO title: `Jobs near Denali National Park | Explore&Earn`
- SEO description: Paid jobs that name Denali National Park in Alaska. Other Alaska parks and maritime jobs have their own pages.
- Intro: Paid jobs whose listing names Denali National Park in Alaska. Some include housing and meals. The state page covers the rest of Alaska, and maritime work has its own page.
- Why: Alaska is the classic seasonal state in the product, and Denali is the park seekers name. The seed also contains several other Alaska parks for a later wave.
- Links: `/jobs/alaska`, `/jobs/maritime`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 17. `/destinations/mount-rainier`

- Key: `destination:mount-rainier`
- H1: Jobs near Mount Rainier National Park
- SEO title: `Jobs near Mount Rainier National Park | Explore&Earn`
- SEO description: Paid jobs that name Mount Rainier National Park in Washington. Olympic National Park has its own page.
- Intro: Paid jobs whose listing names Mount Rainier National Park in Washington. Some include housing and meals. Olympic National Park is a separate page.
- Why: Washington is an H-2A concentration and holds three parks in the seed. Rainier and Olympic are the two to publish first.
- Links: `/jobs/washington`, `/destinations/olympic`, `/jobs/farm/washington`, `/jobs/seasonal/national-parks`.

### 18. `/destinations/olympic`

- Key: `destination:olympic`
- H1: Jobs near Olympic National Park
- SEO title: `Jobs near Olympic National Park | Explore&Earn`
- SEO description: Paid jobs that name Olympic National Park in Washington. Mount Rainier has its own page.
- Intro: Paid jobs whose listing names Olympic National Park in Washington. Some include housing and meals. Mount Rainier is a separate page.
- Why: Pairs with Mount Rainier so Washington's park intent is not a single URL.
- Links: `/jobs/washington`, `/destinations/mount-rainier`, `/jobs/seasonal/national-parks`.

### 19. `/destinations/great-smoky-mountains`

- Key: `destination:great-smoky-mountains`
- H1: Jobs near Great Smoky Mountains National Park
- SEO title: `Jobs near Great Smoky Mountains National Park | Explore&Earn`
- SEO description: Paid jobs that name Great Smoky Mountains National Park, in North Carolina and Tennessee. Gatlinburg has its own page when listings exist.
- Intro: Paid jobs whose listing names Great Smoky Mountains National Park. The park sits in North Carolina and Tennessee. Some include housing and meals. Gatlinburg is a separate destination in the seed.
- Why: North Carolina is an H-2A concentration. The park is the named place on that state's seasonal side.
- Links: `/jobs/north-carolina`, `/jobs/tennessee` when that state page is indexable, `/jobs/seasonal/national-parks`.

### 20. `/destinations/acadia`

- Key: `destination:acadia`
- H1: Jobs near Acadia National Park
- SEO title: `Jobs near Acadia National Park | Explore&Earn`
- SEO description: Paid jobs that name Acadia National Park in Maine. Bar Harbor has its own page when listings exist.
- Intro: Paid jobs whose listing names Acadia National Park in Maine. Some include housing and meals. Bar Harbor is a separate destination in the seed.
- Why: Gives the Maine state page a park people already seek by name.
- Links: `/jobs/maine`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 21. `/destinations/vail`

- Key: `destination:vail`
- H1: Jobs near Vail
- SEO title: `Jobs near Vail | Explore&Earn`
- SEO description: Paid jobs near Vail, Colorado. This is the town, not a company career site. Housing and pay are on each listing.
- Intro: Paid jobs whose listing names Vail, Colorado. This page is the town. It is not a company's career site. Some include housing. Winter listings sit with the ski-resort jobs.
- Why: Colorado ski concentration. The seed's resort area is the place, and the market research warns against pitching a large resort company as if it were our customer.
- Links: `/jobs/colorado`, `/jobs/seasonal/colorado`, `/jobs/seasonal/ski-resorts`, `/seasons/winter`, `/destinations/breckenridge`.

### 22. `/destinations/breckenridge`

- Key: `destination:breckenridge`
- H1: Jobs near Breckenridge
- SEO title: `Jobs near Breckenridge | Explore&Earn`
- SEO description: Paid jobs near Breckenridge, Colorado. Some include housing. Pay, dates, and housing cost are on the listing.
- Intro: Paid jobs whose listing names Breckenridge, Colorado. Some include housing and meals. Vail and Aspen are separate pages.
- Why: Second Colorado ski town in the seed, same winter window.
- Links: `/jobs/colorado`, `/destinations/vail`, `/jobs/seasonal/ski-resorts`, `/seasons/winter`.

### 23. `/destinations/park-city`

- Key: `destination:park-city`
- H1: Jobs near Park City
- SEO title: `Jobs near Park City | Explore&Earn`
- SEO description: Paid jobs near Park City, Utah. Zion and the other Utah parks have their own pages. Housing is stated on the listing.
- Intro: Paid jobs whose listing names Park City, Utah. Some include housing. Zion is the national-park page for the same state.
- Why: Utah is a BEA snow state. Park City is the resort area in the seed.
- Links: `/jobs/utah`, `/jobs/seasonal/utah`, `/destinations/zion`, `/jobs/seasonal/ski-resorts`, `/seasons/winter`.

### 24. `/destinations/jackson-hole`

- Key: `destination:jackson-hole`
- H1: Jobs near Jackson Hole
- SEO title: `Jobs near Jackson Hole | Explore&Earn`
- SEO description: Paid jobs near Jackson Hole, Wyoming. Grand Teton and Yellowstone have their own pages.
- Intro: Paid jobs whose listing names Jackson Hole, Wyoming. Some include housing and meals. Grand Teton and Yellowstone are separate pages.
- Why: The Wyoming cluster in the seed is Yellowstone, Grand Teton, and Jackson Hole.
- Links: `/jobs/wyoming`, `/destinations/grand-teton`, `/destinations/yellowstone`, `/jobs/seasonal/ski-resorts`.

### 25. `/destinations/lake-tahoe`

- Key: `destination:lake-tahoe`
- H1: Jobs near Lake Tahoe
- SEO title: `Jobs near Lake Tahoe | Explore&Earn`
- SEO description: Paid jobs near Lake Tahoe, in California and Nevada. Some include housing. Farm jobs in California have their own page.
- Intro: Paid jobs whose listing names Lake Tahoe. The area sits in California and Nevada. Some include housing. California farm work stays on the farm page.
- Why: A two-state resort in the seed, tied to the California page we already rank for farm hiring.
- Links: `/jobs/california`, `/jobs/nevada` when that state page is indexable, `/jobs/seasonal/ski-resorts`, `/seasons/winter`, `/seasons/summer`.

### 26. `/destinations/aspen`

- Key: `destination:aspen`
- H1: Jobs near Aspen
- SEO title: `Jobs near Aspen | Explore&Earn`
- SEO description: Paid jobs near Aspen, Colorado. Some include housing. Vail and Breckenridge have their own pages.
- Intro: Paid jobs whose listing names Aspen, Colorado. Some include housing and meals. Vail and Breckenridge are separate pages.
- Why: Third Colorado resort area in the same winter band.
- Links: `/jobs/colorado`, `/destinations/vail`, `/jobs/seasonal/ski-resorts`, `/seasons/winter`.

### 27. `/destinations/stowe`

- Key: `destination:stowe`
- H1: Jobs near Stowe
- SEO title: `Jobs near Stowe | Explore&Earn`
- SEO description: Paid jobs near Stowe, Vermont. Some include housing. Vermont's state page comes after this first fifty.
- Intro: Paid jobs whose listing names Stowe, Vermont. Some include housing. The Vermont state page is the next state URL after this fifty, once a listing makes it indexable.
- Why: BEA names Vermont for snow. Stowe is the resort area in the seed. The state page waits so this fifty stays specific.
- Links: `/jobs/seasonal/ski-resorts`, `/seasons/winter`.

### 28. `/destinations/whitefish`

- Key: `destination:whitefish`
- H1: Jobs near Whitefish
- SEO title: `Jobs near Whitefish | Explore&Earn`
- SEO description: Paid jobs near Whitefish, Montana. Glacier National Park has its own page. Housing and pay are on the listing.
- Intro: Paid jobs whose listing names Whitefish, Montana. Some include housing. Glacier National Park is a separate page.
- Why: Montana resort next to Glacier, so winter and summer in that state both have a URL.
- Links: `/jobs/montana`, `/destinations/glacier`, `/destinations/big-sky`, `/jobs/seasonal/ski-resorts`.

### 29. `/destinations/big-sky`

- Key: `destination:big-sky`
- H1: Jobs near Big Sky
- SEO title: `Jobs near Big Sky | Explore&Earn`
- SEO description: Paid jobs near Big Sky, Montana. Whitefish and Glacier have their own pages.
- Intro: Paid jobs whose listing names Big Sky, Montana. Some include housing. Whitefish and Glacier are separate pages.
- Why: Second Montana resort in the seed, same state page.
- Links: `/jobs/montana`, `/destinations/whitefish`, `/jobs/seasonal/ski-resorts`, `/seasons/winter`.

### 30. `/jobs/florida`

- Key: `state:florida`
- H1: Jobs in Florida
- SEO title: `Jobs in Florida | Explore&Earn`
- SEO description: Paid jobs in Florida, plus remote jobs open to Florida or to the whole US. Some include housing. Farm jobs have their own page.
- Intro: Paid jobs in Florida: on-site work in the state, and remote jobs open to people who live in Florida or anywhere in the US. Some include housing and meals. Farm jobs in Florida also have their own page.
- Why: Florida is first in the FY 2025 H-2A state list and second in the H-2B state list cited in the market research.
- Links: `/jobs/farm/florida`, `/seasons/summer`, `/seasons/winter`, `/jobs/farm`.

### 31. `/jobs/california`

- Key: `state:california`
- H1: Jobs in California
- SEO title: `Jobs in California | Explore&Earn`
- SEO description: Paid jobs in California, plus remote jobs open to California or to the whole US. Yosemite, Lake Tahoe, and farm work have their own pages.
- Intro: Paid jobs in California, including remote jobs open to California or to the whole US. Some include housing and meals. Yosemite, Lake Tahoe, and farm work have their own pages.
- Why: California is third in the FY 2025 H-2A state list.
- Links: `/jobs/farm/california`, `/destinations/yosemite`, `/destinations/lake-tahoe`, `/seasons/summer`.

### 32. `/jobs/georgia`

- Key: `state:georgia`
- H1: Jobs in Georgia
- SEO title: `Jobs in Georgia | Explore&Earn`
- SEO description: Paid jobs in Georgia, plus remote jobs open to Georgia or to the whole US. Farm jobs in Georgia have their own page.
- Intro: Paid jobs in Georgia, including remote jobs open to Georgia or to the whole US. Some include housing and meals. Farm jobs in Georgia have their own page.
- Why: Georgia is second in the FY 2025 H-2A state list.
- Links: `/jobs/farm/georgia`, `/jobs/farm`, `/seasons/summer`.

### 33. `/jobs/washington`

- Key: `state:washington`
- H1: Jobs in Washington
- SEO title: `Jobs in Washington | Explore&Earn`
- SEO description: Paid jobs in Washington, plus remote jobs open to Washington or to the whole US. Mount Rainier, Olympic, and farm work have their own pages.
- Intro: Paid jobs in Washington, including remote jobs open to Washington or to the whole US. Some include housing and meals. Mount Rainier, Olympic National Park, and farm work have their own pages.
- Why: Washington is fourth in the FY 2025 H-2A state list, and the seed has Mount Rainier, Olympic, and North Cascades.
- Links: `/jobs/farm/washington`, `/destinations/mount-rainier`, `/destinations/olympic`, `/jobs/seasonal/national-parks`.

### 34. `/jobs/colorado`

- Key: `state:colorado`
- H1: Jobs in Colorado
- SEO title: `Jobs in Colorado | Explore&Earn`
- SEO description: Paid jobs in Colorado, plus remote jobs open to Colorado or to the whole US. Parks and ski towns have their own pages.
- Intro: Paid jobs in Colorado, including remote jobs open to Colorado or to the whole US. Some include housing and meals. Rocky Mountain National Park, Vail, Breckenridge, and Aspen have their own pages.
- Why: Colorado is fourth in the FY 2025 H-2B state list, and BEA names it for snow.
- Links: `/jobs/seasonal/colorado`, `/destinations/rocky-mountain`, `/destinations/vail`, `/destinations/breckenridge`, `/destinations/aspen`, `/seasons/winter`.

### 35. `/jobs/texas`

- Key: `state:texas`
- H1: Jobs in Texas
- SEO title: `Jobs in Texas | Explore&Earn`
- SEO description: Paid jobs in Texas, plus remote jobs open to Texas or to the whole US. Some include housing. Big Bend has its own page when listings exist.
- Intro: Paid jobs in Texas, including remote jobs open to Texas or to the whole US. Some include housing and meals. Big Bend National Park is a destination in the seed and gets a page when a listing names it.
- Why: Texas is first in the FY 2025 H-2B state list.
- Links: `/jobs/farm`, `/seasons/summer`, `/jobs/seasonal`.

### 36. `/jobs/north-carolina`

- Key: `state:north-carolina`
- H1: Jobs in North Carolina
- SEO title: `Jobs in North Carolina | Explore&Earn`
- SEO description: Paid jobs in North Carolina, plus remote jobs open to North Carolina or to the whole US. Great Smoky Mountains has its own page.
- Intro: Paid jobs in North Carolina, including remote jobs open to North Carolina or to the whole US. Some include housing and meals. Great Smoky Mountains National Park has its own page. The Outer Banks destination waits until a listing names it.
- Why: North Carolina is fifth in the FY 2025 H-2A state list, and the Smokies sit in NC and TN.
- Links: `/destinations/great-smoky-mountains`, `/jobs/farm`, `/seasons/summer`.

### 37. `/jobs/montana`

- Key: `state:montana`
- H1: Jobs in Montana
- SEO title: `Jobs in Montana | Explore&Earn`
- SEO description: Paid jobs in Montana, plus remote jobs open to Montana or to the whole US. Glacier, Whitefish, and Big Sky have their own pages.
- Intro: Paid jobs in Montana, including remote jobs open to Montana or to the whole US. Some include housing and meals. Glacier, Whitefish, and Big Sky have their own pages. Yellowstone listings that include Montana also appear on the Yellowstone page.
- Why: Glacier, Whitefish, and Big Sky are in the seed, and Yellowstone includes Montana.
- Links: `/jobs/seasonal/montana`, `/destinations/glacier`, `/destinations/whitefish`, `/destinations/big-sky`, `/destinations/yellowstone`.

### 38. `/jobs/wyoming`

- Key: `state:wyoming`
- H1: Jobs in Wyoming
- SEO title: `Jobs in Wyoming | Explore&Earn`
- SEO description: Paid jobs in Wyoming, plus remote jobs open to Wyoming or to the whole US. Yellowstone, Grand Teton, and Jackson Hole have their own pages.
- Intro: Paid jobs in Wyoming, including remote jobs open to Wyoming or to the whole US. Some include housing and meals. Yellowstone, Grand Teton, and Jackson Hole have their own pages. The count on this page is the live listing count. It is never a sample number.
- Why: The Yellowstone cluster. FD-8 forbids the old sample "31 open jobs" figure, so this page says that out loud.
- Links: `/destinations/yellowstone`, `/destinations/grand-teton`, `/destinations/jackson-hole`, `/jobs/seasonal`.

### 39. `/jobs/utah`

- Key: `state:utah`
- H1: Jobs in Utah
- SEO title: `Jobs in Utah | Explore&Earn`
- SEO description: Paid jobs in Utah, plus remote jobs open to Utah or to the whole US. Zion and Park City have their own pages.
- Intro: Paid jobs in Utah, including remote jobs open to Utah or to the whole US. Some include housing and meals. Zion and Park City have their own pages. Arches, Bryce Canyon, Canyonlands, and Capitol Reef stay in the destination list for a later wave.
- Why: Utah is a BEA snow state, with Zion and Park City in this fifty.
- Links: `/jobs/seasonal/utah`, `/destinations/zion`, `/destinations/park-city`, `/seasons/winter`, `/seasons/summer`.

### 40. `/jobs/alaska`

- Key: `state:alaska`
- H1: Jobs in Alaska
- SEO title: `Jobs in Alaska | Explore&Earn`
- SEO description: Paid jobs in Alaska, plus remote jobs open to Alaska or to the whole US. Denali has its own page. Maritime work does too.
- Intro: Paid jobs in Alaska, including remote jobs open to Alaska or to the whole US. Some include housing and meals. Denali has its own page. Boat and seafood work is on the maritime page. The seed has more Alaska parks for a later wave.
- Why: Denali plus the maritime category. Several other Alaska parks are in the seed and wait.
- Links: `/destinations/denali`, `/jobs/maritime`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 41. `/jobs/arizona`

- Key: `state:arizona`
- H1: Jobs in Arizona
- SEO title: `Jobs in Arizona | Explore&Earn`
- SEO description: Paid jobs in Arizona, plus remote jobs open to Arizona or to the whole US. Grand Canyon has its own page.
- Intro: Paid jobs in Arizona, including remote jobs open to Arizona or to the whole US. Some include housing and meals. Grand Canyon National Park has its own page.
- Why: The state page that sits under the Grand Canyon destination.
- Links: `/destinations/grand-canyon`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 42. `/jobs/maine`

- Key: `state:maine`
- H1: Jobs in Maine
- SEO title: `Jobs in Maine | Explore&Earn`
- SEO description: Paid jobs in Maine, plus remote jobs open to Maine or to the whole US. Acadia has its own page.
- Intro: Paid jobs in Maine, including remote jobs open to Maine or to the whole US. Some include housing and meals. Acadia National Park has its own page. Bar Harbor is a separate destination when a listing names it.
- Why: The state page under Acadia.
- Links: `/destinations/acadia`, `/jobs/seasonal/national-parks`, `/seasons/summer`.

### 43. `/jobs/farm/florida`

- Key: `category_state:farm:florida`
- H1: Farm jobs in Florida
- SEO title: `Farm jobs in Florida | Explore&Earn`
- SEO description: Paid farm jobs in Florida: harvest, orchards, livestock, dairy, and greenhouse. Housing, when provided, has a cost on the listing.
- Intro: Paid farm jobs in Florida. Harvest, orchards and vineyards, livestock, dairy, and greenhouse each have a genre under Farm. Housing, when a host provides it, has a cost on the listing.
- Why: Florida leads the FY 2025 H-2A state list. This is the intersection, not a copy of the state page.
- Links: `/jobs/florida`, `/jobs/farm`, `/seasons/summer`.

### 44. `/jobs/farm/california`

- Key: `category_state:farm:california`
- H1: Farm jobs in California
- SEO title: `Farm jobs in California | Explore&Earn`
- SEO description: Paid farm jobs in California. The listing states the wage and any housing cost. Yosemite and Lake Tahoe are seasonal pages, not this one.
- Intro: Paid farm jobs in California. The listing states the wage, the dates, and the housing cost when a bed is provided. Yosemite and Lake Tahoe are seasonal pages.
- Why: California is third in the FY 2025 H-2A state list.
- Links: `/jobs/california`, `/jobs/farm`, `/destinations/yosemite`.

### 45. `/jobs/farm/georgia`

- Key: `category_state:farm:georgia`
- H1: Farm jobs in Georgia
- SEO title: `Farm jobs in Georgia | Explore&Earn`
- SEO description: Paid farm jobs in Georgia. Some include housing. The listing states the wage and any housing cost.
- Intro: Paid farm jobs in Georgia. Some include housing and meals. This page is for a wage and a stated bed, not a visa petition.
- Why: Georgia is second in the FY 2025 H-2A state list.
- Links: `/jobs/georgia`, `/jobs/farm`.

### 46. `/jobs/farm/washington`

- Key: `category_state:farm:washington`
- H1: Farm jobs in Washington
- SEO title: `Farm jobs in Washington | Explore&Earn`
- SEO description: Paid farm jobs in Washington. Mount Rainier and Olympic National Park have their own seasonal pages.
- Intro: Paid farm jobs in Washington. Some include housing. Mount Rainier and Olympic National Park are seasonal pages.
- Why: Washington is fourth in the FY 2025 H-2A state list.
- Links: `/jobs/washington`, `/jobs/farm`, `/destinations/mount-rainier`.

### 47. `/jobs/seasonal/colorado`

- Key: `category_state:seasonal:colorado`
- H1: Seasonal jobs in Colorado
- SEO title: `Seasonal jobs in Colorado | Explore&Earn`
- SEO description: Paid seasonal jobs in Colorado: parks, ski resorts, camps, lodges, and guiding. Farm work has its own page.
- Intro: Paid seasonal jobs in Colorado: parks, ski resorts, camps, lodges, and guiding. Some include housing and meals. Farm work stays on the farm pages. Rocky Mountain National Park, Vail, Breckenridge, and Aspen have their own pages.
- Why: The seasonal intersection for the BEA snow state and H-2B state already in this fifty.
- Links: `/jobs/colorado`, `/jobs/seasonal`, `/seasons/winter`, `/destinations/vail`.

### 48. `/jobs/seasonal/montana`

- Key: `category_state:seasonal:montana`
- H1: Seasonal jobs in Montana
- SEO title: `Seasonal jobs in Montana | Explore&Earn`
- SEO description: Paid seasonal jobs in Montana. Glacier, Whitefish, Big Sky, and Yellowstone have their own pages.
- Intro: Paid seasonal jobs in Montana. Some include housing and meals. Glacier, Whitefish, Big Sky, and the Montana side of Yellowstone have their own pages.
- Why: The state has three destinations in this fifty plus a share of Yellowstone.
- Links: `/jobs/montana`, `/destinations/glacier`, `/jobs/seasonal`, `/seasons/summer`.

### 49. `/jobs/seasonal/utah`

- Key: `category_state:seasonal:utah`
- H1: Seasonal jobs in Utah
- SEO title: `Seasonal jobs in Utah | Explore&Earn`
- SEO description: Paid seasonal jobs in Utah. Zion and Park City have their own pages. Other Utah parks follow in a later wave.
- Intro: Paid seasonal jobs in Utah. Some include housing and meals. Zion and Park City have their own pages. The other Utah parks in the seed wait for a listing that names them.
- Why: Pairs the BEA snow state with its park and its resort.
- Links: `/jobs/utah`, `/destinations/zion`, `/destinations/park-city`, `/seasons/winter`.

### 50. `/jobs/maritime`

- Key: `category:maritime`
- H1: Maritime jobs
- SEO title: `Maritime jobs | Explore&Earn`
- SEO description: Paid fishing, seafood, yacht, ferry, and tug jobs. A listing can name a hitch and self-reported documents. Housing or a berth is stated on the listing.
- Intro: Paid commercial fishing, seafood processing, yacht, ferry, and tug jobs. A listing can name the rotation and the documents the employer asks you to hold. Those documents are self-reported here. Some include a berth or housing, and the listing says so. Alaska has its own state page.
- Why: Maritime is one of the four categories in the product line. The market research treats NOAA's seafood job figures as supply-chain impacts, not crew openings, so this page does not quote them. H-2B fish-cutter certifications are a demand signal for plants, not a count of listings.
- Links: `/jobs/alaska`, `/seasons/summer`, `/jobs/seasonal`.

## Pages that wait

These exist as routes. They are not in the first fifty. Publish one when it has an active listing and, for `/international`, after counsel.

| Page | Why it waits |
|---|---|
| `/international` | Spec 8.11 and the SP8 launch gate: plain visa basics, the sentence "We can't give visa advice. These official pages explain your options.", and only the four official links. No advice in the meantime |
| `/jobs/remote` and its genres | Real category, and the market research says to keep it off the homepage lead. CoolWorks treats remote as occasional. FlexJobs already sells a screened remote board |
| `/seasons/fall` | On this date the label is Fall 2026, and that window ends 30 November 2026. The hiring story in the research for fall and winter starts in June or July, so this page is late for a first push |
| `/seasons/spring` | The label is Spring 2027. Summer is the window that opens in November |
| `/seasons/year-round` | Ongoing and year-round listings. Useful, and less tied to the calendar this plan is ordered by |
| `/jobs/new-hampshire`, `/jobs/vermont` | BEA names both for snow. Stowe stands in for Vermont in this fifty |
| `/jobs/farm/north-carolina` | North Carolina is fifth in the H-2A state list. The state page is already in the fifty |
| `/jobs/idaho` | Yellowstone includes Idaho. The park page links it when the state page is indexable |
| `/jobs/tennessee`, `/jobs/nevada` | Great Smoky Mountains includes Tennessee. Lake Tahoe includes Nevada |
| Remaining seed destinations | 63 parks and resort areas are in the seed. The ones named above are the first wave. North Cascades, Arches, Bryce Canyon, Gatlinburg, Bar Harbor, and the other Alaska parks are the next wave, each only when a listing names that slug |
| Adventure guiding, festivals, and the farm genres | Real genres. They inherit links from `/jobs/seasonal` and `/jobs/farm` until a listing makes a genre page worth its own intro |
| A housing landing | Intent is real. The spec has no path for it. The feed filters are the answer |

## Founder decisions in this draft

1. Approve the fifty intros, titles, and descriptions as the operator overrides, or mark the rows to rewrite.
2. Approve the longer breadcrumb (parent included) in place of Task 40's two-item trail, or keep the two-item trail.
3. Approve Browse by State linking to `/jobs/[slug]`, or set the canonical of `/?state=<code>` to that landing. One of those should be true before the state pages are asked to rank.
4. Confirm `/international` stays out of the first fifty until counsel reviews it.
5. Confirm a page ships with no hero until the photo is one we or a host can use. No stock art.

Nothing in this plan turns indexing on in a non-production environment. Spec 8.11 already sends `Disallow: /` outside production.
