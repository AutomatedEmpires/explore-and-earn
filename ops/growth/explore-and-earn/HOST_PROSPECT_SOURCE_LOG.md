# Explore&Earn Host Prospect Source Log

Research date: 2026-07-12

Dataset: `data/growth/explore-and-earn/host_prospects.csv`

Scope: public United States business prospects for individualized founding-host outreach

## Final dataset coverage

| Measure | Result |
| --- | ---: |
| Unique prospects | 100 |
| Unique business website domains | 100 |
| States | 29 |
| Region labels | 39 |
| Normalized categories | 10 |
| Official-site-verified records | 100 |
| Records with a public email or phone | 100 |
| Priority outreach records | 30 |
| Call-ready records | 10 |
| Pilot recommendations | 3 |
| Confidence-score range | 62–90 |
| Housing unknown / host confirmation required | 99 |
| Housing statement supported by the business's official site, availability still unconfirmed | 1 |

The CSV is the complete row-level provenance ledger. Every row carries the business website, the exact `source_url`, a public `contact_page`, a verification state, notes, and `last_checked_at`. This log explains the collection lanes, selection decisions, and limitations; it does not duplicate all 100 URLs.

## Research lanes

| Lane | Initial rows | Included | Geographic scope | Primary categories |
| --- | ---: | ---: | --- | --- |
| East and South | 35 | 34 | ME, NH, VT, NY, MA, PA, VA, NC, SC, GA, FL, TN, LA | Resorts/lodges, camps, outdoor operators, farms, marinas, campgrounds, seasonal programs |
| Mountain West and Upper Midwest | 35 | 34 | MT, WY, CO, UT, AZ, NM, MN, WI, MI, ND, SD | Ranches, resorts, lodges, camps, marinas, outdoor operators, farms |
| Pacific Northwest, Alaska, Hawaii | 35 | 32 | AK, WA, OR, ID, HI | Lodges/resorts, ranches, camps, fisheries, marinas, farms, outdoor operators |
| **Total** | **105** | **100** | **29 states** | **10 normalized categories** |

## Source types used

1. **Official business websites:** contact, employment, staff, about, location, directions, operations, program, marina, and resort pages. These are the row-level sources for all 100 final records.
2. **Public government and tourism directories:** used to discover or corroborate businesses, especially remote Alaska and state-park operators. A directory was not used to turn a business into a partner or to copy an opportunity.
3. **Public chambers and trade associations:** used for discovery or role corroboration where useful, including marina, outfitter, tourism, and camp ecosystems. No directory-only record remains in the final 100.
4. **No-login public pages only:** no logged-in profiles, restricted pages, technical bypasses, or robots workarounds were used.

No third-party job-board listing, description, housing/pay/meal claim, photo, applicant data, review-site content, or social-profile scrape was collected. Public employment pages on a prospect's own website were used only to validate seasonal fit or a hiring route; their job text was not copied.

## Category distribution

| Category | Prospects |
| --- | ---: |
| Seasonal resorts | 27 |
| Ranches | 21 |
| Outdoor tourism operators | 13 |
| Lodges | 12 |
| Camps | 11 |
| Farms | 6 |
| Marinas | 4 |
| Fisheries | 3 |
| Campgrounds | 2 |
| Seasonal work programs | 1 |

Original source categories were normalized only after research. For example, `guest_ranch` and `ranch_resort` became `ranches`; `seafood processor` became `fisheries`; and resort/lodge variants were assigned to either `seasonal resorts` or `lodges`. The original fit rationale and source URL were preserved.

## Verification labels

- `official_site_verified`: the cited official site supports the business identity plus its location, operating model, or public contact route. It does **not** mean Explore&Earn verified employment practices, housing, pay, safety, or present hiring.
- `directory_verified_contact_pending`: permitted for research, but none of these records survived the final contact-readiness cut.

Contact names and roles are included only where a public page stated them. Blank name/role fields are intentional. Every retained row has at least one public business email or phone; a general address may still require internal routing.

## Confidence-score rubric

`confidence_score` is a research-confidence and fit index, not a probability or verification claim. The scoring model is also defined in `HOST_ACQUISITION_PLAN.md`:

- seasonal/workforce fit: 15 points for a labeled operating-model inference or 25 for an explicit official seasonal/hiring/date signal;
- in-scope category and place fit: 20 points;
- Housing / Meals discovery value: 8 for a place-based target, 10 for a remote/on-site operation, or 15 only when an official employee-housing statement exists;
- public contactability: email +7, phone +4, named contact +3, public role +1, capped at 15;
- official-site trust footprint: 10 points;
- portfolio diversity: +5 when the final-wave category has six or fewer records and +5 when the state has two or fewer; and
- timing: 5 for an official schedule/date signal or 3 for a labeled inference.

Scores are capped at 95 until host confirmation. The final 100 range from 62 to 90. `outreach_priority` is separately curated for category/geography balance and contact readiness; it is not a score sort.

## Interpretation rules

- `why_fit` is original internal analysis, not copied marketing or job language.
- `likely_season` is a planning hypothesis unless notes identify explicit official dates. Every inferred season must be confirmed with the host.
- `likely_housing` is `Unknown — confirm with host` for 99 prospects. Guest rooms, cabins, campsites, or remote geography were never treated as employee housing.
- Three Rivers Resort is the only stronger housing record. Its official site states that it owns units used for employee and long-term housing, but current availability, eligibility, cost, and role assignment remain unknown: [official housing page](https://3riversresort.com/lodging/long-term-housing/).
- A prospect is not a host, pilot, partner, or verified company. The three pilot labels are internal recommendations and explicitly say “not contacted and not partnered.”
- Re-open the exact source and check the suppression list immediately before outreach. Public details can change after the research date.

## Call-ready top 10

These are internal recommendations only. None has been contacted, accepted as a host, partnered with Explore&Earn, or independently verified by Explore&Earn.

| Rank | Prospect | Category / state | Public route | Source-supported reason to call |
| ---: | --- | --- | --- | --- |
| 1 | [Three Rivers Resort](https://3riversresort.com/our-story/) | Outdoor tourism / CO | `email@3riversresort.com`, 970-641-1303 | Official page states a broad resort/outfitter operation and more than 120 seasonal employees; separate official housing statement requires availability confirmation |
| 2 | [Basin Harbor](https://www.basinharbor.com/contact-us/) | Seasonal resort / VT | `stay@basinharbor.com`, 802-475-2311 | Official contact page explicitly links to Vermont summer work; housing and current openings are not assumed |
| 3 | [Chautauqua Institution](https://www.chq.org/employment/) | Seasonal work program / NY | `employment@chq.org` | Official page states career and seasonal opportunities and gives the 2026 Summer Assembly dates |
| 4 | [Farm & Wilderness Foundation](https://www.farmandwilderness.org/contact-us) | Camp / VT | `hiring@farmandwilderness.org`, 802-422-3761 | Official site exposes a dedicated hiring route for a multi-program residential camp |
| 5 | [Gunstock Mountain Resort](https://www.gunstock.com/contact/) | Seasonal resort / NH | `work@gunstock.com`, 603-293-4341 | Official page lists a dedicated employment address and winter, summer, and campground operations |
| 6 | [Snowbird](https://www.snowbird.com/contact/) | Seasonal resort / UT | `employment@snowbird.com`, 801-947-8240 | Official contact route reaches recruiting for a large winter/summer resort operation |
| 7 | [Angel Fire Resort](https://www.angelfireresort.com/contact-us/) | Seasonal resort / NM | `hr@angelfireresort.com`, 575-377-4227 | Official page exposes Human Resources for a four-season resort |
| 8 | [Redfish Lake Lodge](https://redfishlake.com/contact-us/) | Lodge / ID | Jeff Clegg, General Manager; `jeff@redfishlake.com`, 208-774-3536 | Official page provides named management and HR routes for a remote lodge/marina operation |
| 9 | [Roche Harbor Resort](https://www.rocheharbor.com/marina/) | Marina / WA | Kevin Carlton, Harbormaster; `marina@rocheharbor.com`, 800-586-3590 | Official marina page provides a named operator route in a seasonal destination setting |
| 10 | [Hana Farms](https://www.hanafarms.com/) | Farm / HI | `customerservice@hanafarms.com`, 808-248-7371 | Official site supports a remote farm, bakery, market, and restaurant model; any staffing need is a question, not a claim |

The direct routes above are reproduced for operator convenience from public pages. They are not a license for bulk outreach. Recheck before use and suppress immediately on request.

## Thirty priority outreach records

The CSV marks exactly 30 rows `outreach_priority=high`.

### East and South

- Basin Harbor
- Chautauqua Institution
- Farm & Wilderness Foundation
- Gunstock Mountain Resort
- Smoky Mountain River Rat
- Cajun Encounters Tour Company
- Wildwater Chattooga
- Mohonk Mountain House
- The Mast Farm Inn
- Camp Friendship

### Mountain West and Upper Midwest

- Three Rivers Resort
- Snowbird
- Angel Fire Resort
- Colorado Mountain Ranch
- Custer State Park Resort
- Flathead Lake Lodge
- CM Ranch
- Los Poblanos Historic Inn & Organic Farm
- Gordon Lodge
- Grand Canyon Railway & Hotel

### Pacific Northwest, Alaska, Hawaii

- Redfish Lake Lodge
- Roche Harbor Resort
- Hana Farms
- Tordrillo Mountain Lodge
- Alaska Wildland Adventures
- Gunstock Ranch
- Schweitzer
- Westport Marina
- Alaska Seafood Company
- Camp Namanu

## Three pilot recommendations

These are outreach-first recommendations, not accepted pilots:

1. **Three Rivers Resort, Colorado** — strongest operational evidence: official source reports 120+ seasonal employees and a separate official employee-housing use statement. Tests housing evidence, multiple role families, and a remote resort/outfitter workflow.
2. **Farm & Wilderness Foundation, Vermont** — dedicated hiring address and a residential camp model. Tests camp staffing, meals/housing variability, safeguarding questions, and structured application needs.
3. **Hana Farms, Hawaii** — farm, food production, retail, and hospitality in a remote setting. Tests the farm lane and whether a year-round mixed operation values place-first recruiting. Current hiring and housing are wholly unconfirmed.

## Records excluded from the 105-row research pool

| Prospect | Reason for exclusion from final 100 |
| --- | --- |
| Nauset Marine | Chamber-directory-only record with direct official contact still pending |
| Salmon Falls Resort | Government tourism-directory verification; direct official contact needed |
| The Suttle Lodge & Boathouse | Official identity verified but no reliable public email or phone surfaced in this pass |
| Devil's Thumb Ranch Resort & Spa | Official identity verified but weaker direct-contact readiness than retained Mountain West records |
| Camp Sealth | Valid official prospect; removed at the 100-row cap after higher-scoring, direct-email camp records were retained |

Exclusion does not mean ineligible. These records can be re-researched in a later wave; they must not be contacted from a guessed address.

## Refresh and audit procedure

Before a record is approved to contact:

1. open `website`, `source_url`, and `contact_page`;
2. confirm the business still operates and the public route still belongs to it;
3. confirm no opt-out or do-not-contact record exists for the email, phone, company, or domain;
4. update `last_checked_at` and lower confidence if a source has disappeared;
5. personalize from one neutral fact on the official page;
6. ask about season, hiring, and Housing / Meals / Pay rather than asserting them; and
7. store the sent message, source, operator, and timestamp in the CRM.

Refresh priority and call-ready rows before every wave; refresh all other records after 90 days. A removed source, business closure, complaint, or opt-out triggers immediate review or suppression.
