# Explore&Earn Search Query Bank

Last updated: 2026-07-12

Use: manual, public-source market research and employer discovery. These queries do not authorize scraping, automated result harvesting, logged-in search, copying listing content, or outreach to unverified contacts.

Replace bracketed terms before use. Keep each batch to one category × one geography × one operating type so a human can review every result.

## Safe query operators

| Operator | Purpose | Example |
| --- | --- | --- |
| `site:` | Restrict to a known official domain after identity is resolved | `site:example.com careers seasonal housing` |
| quotes | Resolve exact business identity | `"Example Ranch" official careers` |
| `intitle:` | Find public career/contact pages without crawling | `site:example.com intitle:careers` |
| `-site:` | Exclude boards during official-source resolution | `"Example Lodge" careers -site:indeed.com -site:linkedin.com` |
| `filetype:pdf` | Find public association/member directories; do not extract private data | `marina association directory [state] filetype:pdf` |

Never search for leaked data, private emails, login pages, employee personal numbers, resume files, applicant records, or technical workarounds.

## Official-source resolution

```text
"[business name]" official
"[business name]" official website [city] [state]
"[business name]" careers -site:indeed.com -site:linkedin.com -site:ziprecruiter.com
site:[official-domain] careers
site:[official-domain] employment
site:[official-domain] contact
site:[official-domain] team OR leadership OR about
site:[official-domain] seasonal
```

Identity is resolved only when the domain, branding, address/location, and business context agree. A search-engine knowledge panel or snippet alone is insufficient.

## Farm query bank

### General

```text
farm seasonal employment official [state]
farm seasonal careers official housing [region]
ranch employment official [state]
guest ranch summer jobs official careers
dude ranch employment official contact
working ranch hospitality careers official
farm stay employment official [region]
agritourism jobs official careers [state]
orchard harvest employment official [state]
vineyard seasonal employment official [state]
organic farm careers official [state]
farm resort employment official
agricultural education program employment official
farm market bakery careers official [state]
site:.gov agritourism directory [state]
site:.gov agriculture business directory [state]
site:.org guest ranch association directory
site:.org farm stay directory [state]
```

### RanchWork

```text
site:ranchwork.com [state] [role family]
site:ranchwork.com "guest ranch" [state]
site:ranchwork.com seasonal [region]
```

Record business names and terminology only. Then run the official-source resolution queries; do not retain the listing's role, dates, contact, pay, housing, meals, or application instructions.

### RanchWorldAds

```text
site:ranchworldads.com jobs [state]
site:ranchworldads.com "guest ranch" employment
site:ranchworldads.com [region] ranch jobs
```

Classified-style content receives no trust carryover. Require an independently verified business domain.

### AgCareers

```text
site:agcareers.com [state] seasonal employer
site:agcareers.com agriculture hospitality [region]
site:agcareers.com farm operations [state]
```

Use for industry vocabulary and employer-name discovery only; resolve the employer directly.

### Farm Job Search

```text
site:farmjobsearch.com [state] farm employer
site:farmjobsearch.com ranch [region]
site:farmjobsearch.com seasonal agriculture
```

Do not copy the board's summaries or contacts.

### WWOOF / Workaway / Worldpackers

```text
site:wwoofusa.org [state] farm region
site:wwoof.net [country] farm
site:workaway.info [region] farm business
site:worldpackers.com [region] farm
```

These platforms are exchange/community intelligence. A profile does not establish a paid position, employer relationship, legal work authorization, wage, or business contact. Only public business operators with independent official sites can advance.

## Maritime query bank

### General

```text
marina seasonal employment official [state]
marina careers official housing [region]
waterfront resort marina careers official
boatyard careers official [state]
shipyard careers official [region]
port authority seasonal employment official
ferry company careers official [state]
marine tour operator employment official
charter operator careers official [region]
fishing lodge careers official [state]
seafood processor employment official [state]
coastal campground marina employment official
site:.gov port marina directory [state]
site:.org marina association member directory [state]
site:.org marine trades association directory [state]
```

### MaritimeJobs

```text
site:maritimejobs.com [role family] [region]
site:maritimejobs.com marina [state]
site:maritimejobs.com shore based [region]
```

Use to learn sector terms and discover employer names. Professional license, route, pay, rotation, vessel, and contact details must come from the host.

### Sea Career

```text
site:seacareer.com [role family] [region]
site:seacareer.com shore based [country]
site:seacareer.com yacht marina [region]
```

Treat global jurisdiction, credential, and work-authorization facts as unknown until official confirmation.

### gCaptain Jobs

```text
site:jobs.gcaptain.com [role family] [region]
site:jobs.gcaptain.com shoreside [state]
site:jobs.gcaptain.com maritime operations [region]
```

Do not compete head-on for licensed professional inventory; use terminology and employer discovery to identify adjacent official operators.

### Crewseekers

```text
site:crewseekers.net [region] crew
site:crewseekers.net professional crew [region]
```

Do not collect individual-vessel contacts or private-person details. Require an official operating business and classify paid, shared-cost, and recreational arrangements separately.

### Dockwalk

```text
site:dockwalk.com jobs [region]
site:dockwalk.com careers yacht crew [role family]
```

Use as superyacht-sector intelligence only. Do not copy credential, itinerary, compensation, or recruiter content.

### WorkBoat

```text
site:workboat.com jobs [region]
site:workboat.com careers [company name]
site:workboat.com [sector] employer
```

Industry news and directories may reveal companies; the employer's official site remains the source.

## Remote query bank

### General

```text
remote seasonal customer support travel company careers
remote reservations adventure travel official careers
remote guest experience outdoor company careers
remote operations tourism official careers
remote sales outdoor recreation official careers
remote marketing farm hospitality official careers
remote customer success marine technology careers
remote mapping outdoor careers official
remote conservation program careers official
remote seasonal program coordinator official careers
remote campground reservations company careers
site:[official-domain] careers remote seasonal
site:[official-domain] careers remote [country]
```

### FlexJobs

```text
site:flexjobs.com remote travel [role family]
site:flexjobs.com remote outdoor [role family]
site:flexjobs.com remote seasonal [category]
```

FlexJobs is a membership service with its own screening proposition. Do not copy subscription-only information or imply Explore&Earn performed the same screening. Resolve any employer on its official site.

### Remote OK

```text
site:remoteok.com remote travel [role family]
site:remoteok.com remote tourism [role family]
site:remoteok.com remote outdoor [role family]
```

Use for title/filter intelligence and employer discovery, not listing inventory.

### We Work Remotely

```text
site:weworkremotely.com remote travel [role family]
site:weworkremotely.com remote customer support tourism
site:weworkremotely.com remote operations [category]
```

Resolve geography and remote eligibility on the official employer site.

### LinkedIn Jobs

```text
site:linkedin.com/jobs/view remote seasonal travel [role family]
site:linkedin.com/jobs/view remote outdoor [role family]
site:linkedin.com/jobs/view remote tourism [role family]
```

Use only public results available without login. Do not automate LinkedIn, collect profiles, or use personal contact details. Resolve the employer and relevant public business role independently.

### Indeed

```text
site:indeed.com remote seasonal travel [role family]
site:indeed.com remote outdoor company [role family]
site:indeed.com remote tourism [region]
```

Search result snippets and listings are discovery signals only. Never transfer descriptions, salaries, reviews, or contacts.

### ZipRecruiter

```text
site:ziprecruiter.com remote seasonal travel [role family]
site:ziprecruiter.com remote outdoor [role family]
site:ziprecruiter.com remote hospitality [role family]
```

Resolve the employer directly and ignore generated salary estimates or copied listings.

### Google job results

```text
remote seasonal travel jobs [region]
remote outdoor recreation jobs [country]
remote tourism careers [role family]
```

Google's job result surface aggregates sources. Use the employer name and then leave the result surface for the official domain; do not cite the result card as evidence.

### Glassdoor

```text
site:glassdoor.com/Job remote travel [role family]
site:glassdoor.com/Job remote outdoor [role family]
site:glassdoor.com/Job remote tourism [role family]
```

Do not copy reviews, salary estimates, ratings, interview reports, or job text. Public employer discovery only.

### SimplyHired

```text
site:simplyhired.com remote seasonal travel [role family]
site:simplyhired.com remote outdoor [role family]
site:simplyhired.com remote tourism [role family]
```

Use as secondary discovery intelligence and independently resolve every employer.

## Seasonal query bank

### General

```text
seasonal resort jobs housing official careers
seasonal lodge employment official housing
remote lodge seasonal careers official
summer camp employment housing meals official
campground seasonal staff official careers
ski resort seasonal employment official housing
mountain resort summer jobs official careers
park concessioner seasonal careers official
outfitter guide employment official [state]
river rafting seasonal jobs official
adventure tour operator careers official [state]
Alaska tourism seasonal employment official
seasonal hospitality employer directory [state]
site:.gov seasonal employer tourism [state]
site:.org ski area member directory [state]
site:.org camp association directory [state]
site:.org campground association directory [state]
```

### CoolWorks

```text
site:coolworks.com [state] [business type]
site:coolworks.com jobs-with-housing [region]
site:coolworks.com [park or destination] employer
```

CoolWorks has strong seasonal/adventure discovery value. Record employer names and search vocabulary only; never copy its listing, photos, job details, or Housing / Meals / Pay statements.

### Occupation Wild

```text
site:occupationwild.com jobs [state]
site:occupationwild.com [business type] [region]
site:occupationwild.com seasonal [category]
```

Use for outdoor/employer discovery, then resolve the official host.

### Backdoorjobs

```text
site:backdoorjobs.com [region] [program type]
site:backdoorjobs.com seasonal [state]
site:backdoorjobs.com outdoor employer
```

Distinguish paid jobs, internships, service programs, and volunteer experiences before qualification.

### SeasonalJobs / DOL

```text
site:seasonaljobs.dol.gov [state] [industry]
site:seasonaljobs.dol.gov [business name]
site:seasonaljobs.dol.gov [county] seasonal
```

This is labor-market intelligence and an employer-name source. Do not reuse case, wage, housing, transportation, contact, or job-order details as Explore&Earn content; re-verify the business officially and route immigration/program questions to legal review.

### SeasonWorkers

```text
site:seasonworkers.com [country] [business type]
site:seasonworkers.com ski resort employer
site:seasonworkers.com summer camp employer
```

Global and working-holiday context requires country-specific legal review. Do not carry visa, placement, housing, or pay claims into the U.S.-first pipeline.

### Alaska seasonal tourism sources

```text
Alaska tourism seasonal jobs official employer
Alaska lodge seasonal employment official
Alaska tour company careers official
site:alaskatourjobs.com [business type]
site:alaska.org jobs tourism employer
site:.gov Alaska tourism business directory
```

Use the source to identify businesses, then cite only the official operator site in CRM. Treat remote transport, housing, meals, season dates, and pay as unknown until confirmed by the host.

## Negative filters for official-source resolution

Add only as needed:

```text
-site:indeed.com -site:ziprecruiter.com -site:linkedin.com
-site:glassdoor.com -site:simplyhired.com -site:talent.com
-site:facebook.com -site:instagram.com -site:tiktok.com
-resume -salary -reviews -login
```

Negative filters reduce noise; they do not prove the remaining result is official.

## Query result log

For each search batch record:

- date, operator, category, region, and exact query;
- platforms/source types searched;
- employer names discovered, without copied listing fields;
- official domains resolved and rejected;
- rejection reasons;
- leads added or refreshed; and
- any technical block, terms concern, or legal question.

The query log is an internal audit artifact, not a list to email. Every outreach record still needs current official-source verification, suppression clearance, and channel approval.
