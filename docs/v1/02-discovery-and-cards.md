# Discovery modes and canonical card behavior

## 1. Wireframe mapping

The earlier baseline records a visual review of `image(20261102-202439).png`. This revision uses that recorded interpretation and the current user brief; the original image was not re-accessed in this session. Its central card has a company cover, overlapping circular logo with verification mark, match/category badges, job title, host name, location, Begins/Ends row, House/Meals/Pay strip, and Skip/Apply/Save footer. Labels outside the card are annotations, not additional UI. Preserve this hierarchy, adapting the footer by mode and responsive size. The sketch's date and pay units are examples, not fixed product values.

| Wireframe element | V1 treatment |
| --- | --- |
| Company background | Listing cover override, then host cover, then neutral placeholder; informative alt text when needed |
| Logo + verified check | Logo/name link to `/hosts/:slug`; badge tooltip says what was verified and when |
| “80% match” | Reserved fit position; replace with explainable text hints when profile evidence exists; no invented numeric score |
| Maritime category badge | Exact primary category badge; all four category variants supported |
| Job title / host / location | Always readable text; title/body opens job detail, host identity opens storefront |
| Begins / Ends | Fixed dates in readable local date format; ASAP/Rolling/Flexible/Ongoing labels when applicable |
| House / Meals / Pay | Housing and meals buttons open detail sheets; pay is readable text plus inline detail link |
| Green / red indicators | Text + icon support state; unknown neutral; never color alone |
| Skip / Apply / Save | Explicit in Seek and Map expanded card; replaced by gestures with accessible equivalents in Swipe |
| Footer arrows to Profile | Saved and Skipped lists under Profile; Apply opens review flow |

The full reference provenance and intentional deviations are in [sources and decisions](08-sources-and-decisions.md). The source drawing is not claimed to be a pixel-perfect design system.

## 2. Card variants and interaction contract

| Variant | Visible information | Actions |
| --- | --- | --- |
| Seek feed card | Cover/logo, verification, category, optional fit, title, host, location, timing, housing/meals/pay | Skip, Apply, Save; title/body detail; logo/name storefront |
| Swipe deck card | Same core information with shorter description and safe scrolling for overflow | Left skip, right save, up open application review, tap body details; explicit footer absent by default |
| Map host preview (optional D25) | Host logo/name/verification, location, matching category indicators and matching live job count | View host / View matching jobs; no host-level Apply/Save/Skip; job cards on destination retain their actions |
| Map expanded list card | Same data and actions as Seek card | Highlight pin on selection; keep list and map selection synchronized |
| Job detail | Full canonical revision, description, requirements, schedule, benefits, category module, housing/meals/pay, host preview | Explicit Apply/Applied, Save, Skip, Report, Share; link to storefront |

Use one card data adapter with presentation variants. Host display name/logo/slug and verification come from the current approved storefront/verification state; the immutable host snapshot exists for audit and application history, not discovery identity. Job worksite/location/coordinates, terms and any listing-specific cover remain from the published listing revision; editing a host location never silently moves live jobs. If no listing-specific cover exists, current approved host cover is the fallback. Stale snapshots cannot imply revoked verification. Job title, host, location, time, pay and housing/meals remain visible or immediately accessible without an extra click on all job-card variants. A derived host-summary card is a navigation aid, not a substitute job card or separate job schema. Long titles wrap up to three lines before a clearly labeled detail expansion; large text may grow card height. No inaccessible fixed-height clipping. Cover/logo clicks never start applications or accidentally swipe. The decorative cover itself does not navigate; title/body opens job, logo/name opens host.

Housing sheet shows cost/deposit/basis, room type/occupancy, utilities, pets/couples/transport policies, distance, description and Bedroom/Bathroom/Kitchen/Exterior slots. Meals sheet shows arrangement, costs, frequency, kitchen access, dietary notes, grocery notes and Kitchen/Meal example/Dining area/Misc slots. Do not nest sheets: photo viewer replaces current sheet content and Back returns to it; Escape/backdrop closes with focus restored. Missing assets have labeled placeholders. Swipe detection is disabled while a sheet, viewer, text selection or form is active.

## 3. Seek — deliberate search

Persistent search and filter controls lead to a vertically scrolling, cursor-paginated feed. Page size defaults to 20, maximum 50. Filters: keywords/occupation, four categories (match primary or secondary), city/region/radius, onsite/hybrid/remote, remote eligible regions, earliest/latest start or date overlap, employment type, commitment, housing availability/cost status, meals availability, and currency/basis-specific minimum pay. Advanced requirement filters may reference curated skills/credentials. Never expose protected-trait filters.

Sorts: Relevant (default), Newest, Start date; Distance only with a chosen location; Pay only with a comparable currency/basis. Relevant V1 is deterministic: keyword match, selected categories/location/timing, then published time, then ID as tie-breaker. Limited labeled sponsored listings are in expanded V1 scope. Recommend activating community placements first; whether to add discovery placements remains D21. Until approved, Seek/Swipe/Map organic ranking stays unboosted. Any later discovery placements must use the same cap/label/safety contract as community and cannot alter fit. Filter changes reset pagination, preserve scroll only on Back, and show applied-filter chips/result count. Search queries and safe filters are URL-addressable; private profile evidence and exact geolocation are not put in URLs or analytics.

Empty results show which filters are active and offer explicit removal. Never silently broaden geography, eligibility or pay. Loading, retry, offline and no-more-results states are distinct. A saved or applied badge follows the listing across modes. Skip removes from default discovery, not from direct URLs or the user's Skipped list. “Include skipped” is explicit and off by default.

### Begins-within and comparison semantics (recommended D12)

Expose quick chips Begins within 1 / 3 / 6 months and a custom N (recommend 1–12). Resolve today in the chosen workplace/search timezone and add **calendar months**, clamping end-of-month days; show the actual inclusive date window. Fixed/window starts match only if a permissible start lies in `[today, cutoff]`; ASAP matches if accepting now. Rolling/flexible starts require a known overlapping start window or a separately selected “Include flexible/unknown starts” option. A job already started is not assumed open unless the host marks a continuing/rolling intake. An expired deadline remains ineligible.

User availability is a separate private input, never a silent rewrite of this filter. Include `begins_within_months`, `resolved_from`, `resolved_through`, `timezone` in the query contract; paging freezes this resolution until refresh. Define precedence: explicit start range replaces relative begins-within; date-overlap asks about work duration and is labeled separately.

Pay filter requires a currency, basis and minimum threshold. Recommend “minimum guaranteed pay at least X” (lower bound >= threshold); negotiable/share/piece roles without comparable guarantee appear only through an explicit include-variable option. Show original pay beside every result; no guessed annualization. Housing distinguishes available vs free; meals distinguishes available vs included/free, with unknown opt-in. Sort labels: Relevant, Newest, Begins soonest (unknown last), Distance with an anchor, Pay high to low with comparable basis/currency. Stable ID breaks ties. Housing/meals are filters, not an invented monetary value in ranking.

## 4. Swipe — exploration with intentional submission

Deck uses the same query/filter state and canonical card fields. A card leaves the deck only after the save/skip request succeeds or a reversible optimistic state is queued. Show category, position and timing before allowing action; no gestures on a blank loading card.

| Input | Effect | Persistent result |
| --- | --- | --- |
| Left swipe | Skip current job | `DiscoveryDisposition=skipped`; visible in Profile/Skipped |
| Right swipe | Save current job | `DiscoveryDisposition=saved`; visible in Profile/Saved |
| Up swipe | Open application flow/review | No application until explicit submit; external roles show redirect confirmation |
| Tap title/body | Open listing detail | Deck position retained on return |
| Tap logo/name | Open host storefront | Deck position retained on return |
| Undo | Restore previous disposition and previous card | Last successful save/skip within 10 seconds; never undoes an application |

Proposed gesture threshold: >=25% card width horizontally or 100 px upward with intended direction dominant by 1.5x; release below threshold snaps back. Vertical scrolling inside long card content takes priority until at its boundary; up gesture can begin only on a dedicated drag area. Reduced-motion mode uses minimal transition. These thresholds are tuning defaults; QA must verify actual touch behavior, not only unit events.

An accessible “Actions” control/menu supplies Skip, Save and Open application equivalents for keyboard, assistive technology and gesture-disabled preference. This preserves the requested gesture-first layout without making gestures mandatory. Keyboard focus on deck: Left/Right arrows invoke skip/save only when not editing or navigating nested controls; Enter opens detail; explicit menu opens application. Announce outcomes via a live region. First-use coach marks explain all actions; dismissible help remains available.

Saved and internally applied listings are excluded from default deck, preventing repeat work; Seek/Map can still display them with state. Skipped listings return only through explicit restore/include-skipped. No “mutual match” or host notification from a save; private interest is not an application. Undo uses disposition version checks; if another tab changed the record, reload current state instead of overwriting it. Deck exhaustion offers filter edits and Saved; it never resets skips automatically.

## 5. Map — host discovery with canonical jobs

**Latest directional preference D25:** user favors host-logo pins that link to the host public page with its jobs. Recommend this as the working Map design; the previous job-pin -> selected job sheet flow is superseded as the default proposal, not deleted as a possible alternative. Optional collapsed-map preview and the fraction of the screen it occupies remain open.

Map starts at chosen destination/default broad pilot area; geolocation optional. Pins represent disclosed host worksites/home ports with matching eligible jobs, never seeker location, live vessel position or arbitrary headquarters for remote work. Group canonical filtered results by host plus approved published physical anchor. Multiple jobs at one host/worksite share a pin; several distant sites retain separate pins. No matching jobs -> no physical pin. Preserve distinct published anchors if revisions still disagree after a host location edit.

Pin uses host logo inside a legible category outline/symbol. Recommend Maritime anchor/blue, Seasonal mountain/green, Farm leaf/amber, Remote laptop/purple in legend; final visual tokens open. For a single matching primary category show its indicator; for several show distinct small category indicators, not a new mixed category. Provide accessible host/location/category/job-count text and neutral logo fallback; never encode category in color alone. Secondary job categories remain available in details/filter semantics. Coincident host/location pins cluster; disambiguate via zoom or accessible list. Label cluster counts as host/locations and matching jobs separately.

**Recommended primary path:** select host pin -> `/hosts/:slug` at the relevant location/jobs section, with safe current discovery filter context -> canonical job card -> job detail/application. Back restores bounds, query, selected host/location and list position. On the host page label “2 matching jobs at this location” separately from “9 active jobs across all locations”; allow explicit View all jobs, never silently broaden the map search. Job selection still reviews current canonical terms. A host-summary pin/preview never submits, saves or skips an organization.

Map retains the earlier pull-up viewport list, now showing host groups and their canonical job cards, with an expand button/keyboard alternative. This list is available independently of pin navigation; tapping a pin need not collapse the map before opening the public host page. **Optional preview alternative:** a pin opens a compact host card with matching count and View host / View jobs, then explicit navigation. That extra preview step and any fixed map-height percentage remain open under D25. List-based host links remain usable even when map provider fails. Selecting a job in a grouped list can highlight its host pin; scrolling alone does not continuously recenter.

Use explicit Search this area after pan/zoom, 300ms proposed debounce, discard stale responses and label prior results until refreshed. Cap response at 200 pins/clusters (proposed), with exact/capped labels and paginated host-group/job lists. Date-line bounds normalize server-side. Low zoom uses aggregates. Filter visibility before grouping/counts and recheck before destination reads. A group emptied by expiry/moderation disappears with a safe announcement, never exposing restricted jobs.

### Remote and mobile work on maps

Remote roles with region/worldwide eligibility do **not** receive a fabricated office/destination pin. A Remote layer/legend item opens a labeled list section: “Remote roles eligible in [selected region]”. Determine region using the explicitly chosen location/region, or ask the user to choose; viewport crossing regions uses any-overlap and labels eligibility clearly. They are counted separately from physical pins. A remote role may have a separate headquarters location on the host page, explicitly labeled, but no default discovery marker there. Remote category marker style is reserved for future genuine disclosed geographic anchors; all four categories still appear in filters and the legend. No duplicate pin/list entry for a listing with secondary Remote relevance.

Maritime roles use disclosed home port plus operating-region text. Approximate private sites use approved locality centroids labeled “Approximate location”, never random coordinates that move between requests. Maps must not expose a precise residence, vessel position or restricted farm entrance.

## 6. Shared search and mode state

`DiscoveryQueryV1` includes query text, categories[], work arrangements[], occupation codes[], location/radius or bounds, remote eligibility region, timing range, housing/meals filters, pay currency/basis/minimum, sort, include-skipped and cursor. Validate ranges and cap radii/bounds complexity. Empty category array means all four. Date range match means employment window overlaps requested window; rolling/unknown timing is excluded from strict fixed-date filters unless user opts to include flexible dates. `housing=provided` means provided/optional as separately selected values, never automatically unknown. Filter labels explain exact semantics.

Mode is separate from the shared query. Switching tabs preserves filters; Map adds a temporary viewport constraint, which does not silently restrict Seek/Swipe. Persist safe common filters plus per-mode scroll/deck/bounds state per session; account-level saved searches are later. Personal saved/skipped/applied state is read only for the authenticated user. Guest save/apply/skip asks sign-in, retains intended action and returns to the same listing; an application is never replayed automatically after sign-in. No offline submission queue in V1.

Queries use stable ordering and cursor `{query_hash, last_sort_values, last_id, snapshot_time}` protected against tampering. A changed query invalidates cursor. Listings may disappear as moderation/expiry changes, so pages can shrink; deduplicate by listing ID. In V1 all listing/storefront/discovery HTML and JSON responses use `Cache-Control: no-store`; the server may cache candidate IDs/ranking internally only if it rechecks current authoritative visibility before serialization. Current per-user state and fit are private overlay responses, also no-store. Only static application assets are CDN-cacheable; no service-worker cache of marketplace data or user media.

## 7. Transparent fit hints

V1 has no numeric AI score or universal candidate ranking. Guests see no personalized fit. Signed-in seekers may enable structured hints from their profile; opting out leaves chronological/relevant search intact. Evaluate required credentials/authorization and availability as `met|not_met|unknown`, then preference alignment (category, destination, pay basis, housing). Show up to three factual reasons and any missing requirement: “Your availability overlaps”, “Housing available”, “Credential information missing”. Unknown never means met; self-reported qualifications are labeled self-reported.

These hints inform the seeker and do not block applying, auto-reject, or expose private preferences to hosts. Deterministic hints include rule version, evaluated_at and source-field references; no protected traits, housing-companion preferences or medical data feed fit. No aggregate percentage or paid alteration of fit. Host applicant lists sort by submission time with manual status filters in V1. A future model requires a separate decision, evaluation, explanation and jurisdiction review.

## 8. Acceptance examples

1. Save a Farm job in Swipe; it appears Saved in Seek and Map, without an application or host notification.
2. Open housing from any mode; the same four slots, cost and unknown labels appear for the same revision.
3. Open a logo from Map, then Back; selected pin, list position and sheet height are restored.
4. Close/restrict a listing while a seeker is reviewing; submission fails safely with current status and preserves their local draft.
5. Search a US region with Remote enabled; US-eligible Remote roles are listed separately with no misleading geographic pin.
6. Use all three modes with keyboard/screen reader and 200% text zoom; all actions and essential information remain available.
