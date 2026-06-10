# Popup System

## Goal

One overlay language across Explore & Earn.

- Fast to scan
- Minimal helper copy
- Strong visual hierarchy
- Same shell, different payload
- Every popup has one job

## Shell Rules

- One shell component: `apps/web/components/overlay/PopupShell.tsx`
- Mobile defaults to bottom-sheet posture
- Desktop defaults to centered modal posture
- Top bar is always: eyebrow + close
- Header is always: title + compact meta + tags
- Content is always chunked into strong visual blocks, never long prose
- Footer is always action-first and short

## Content Rules

- Prefer icons, tags, chips, meters, rows, cards, and media
- Avoid explanatory paragraphs unless the state would be unclear without one
- No generic helper text when a status chip, icon, or count can say it faster
- Use short labels: `Housing`, `Meals`, `Pay`, `Reported`, `Verified`, `Offer sent`
- If a popup can chain into another flow, use a clear row/card action instead of embedded text links

## Existing Popups

### `HostProfilePopup`

- Trigger: profile icon / identity circle on card
- Purpose: trust + identity + open roles
- Must show:
  - avatar
  - host name
  - verified tag when present
  - open role count
  - host's active listing rows
- Must not show:
  - filler trust explanation copy
  - invented ratings, reviews, or history

### `QuickPeekDrawer`

- Trigger: card body tap
- Purpose: fast listing evaluation
- Must show:
  - media
  - listing title
  - host + location + date meta
  - category/featured/seasonal/boosted tags
  - housing/meals/pay block
  - match meter when applicable
  - primary actions
- Must not show:
  - long narrative copy

### `BenefitBucketDrawer`

- Trigger: housing or meals cell tap
- Purpose: evidence bucket for one benefit
- Must show:
  - benefit state tag (`Provided`, `Partial`, `Not provided`)
  - summary line
  - media bucket or empty visual state
- Must not show:
  - generic explanation text beyond the empty state itself

### `PayDetailsDrawer`

- Trigger: pay cell tap
- Purpose: compact pay-read view
- Must show:
  - pay summary
  - provision tag
  - scale / meter
  - optional compact note only when needed
- Must not show:
  - verbose compensation explanation

### `ReportListingDrawer`

- Trigger: report flag tap
- Purpose: fast moderation intake
- Must show:
  - listing identity
  - compact reason chips / rows
  - optional detail field
  - clear confirmation state
- Must not show:
  - defensive copy
  - legalese

### `SeekerSearchDrawer`

- Trigger: host invite flow
- Purpose: search seekers + invite one
- Shell: migrated to `PopupShell`
- Must show:
  - search field
  - seeker result cards
  - selected seeker state
  - optional message composer
  - send action
- Must not show:
  - onboarding text walls

## Defined But Missing Popups

### `FilterPopup`

- Purpose: seeker filters only
- Fields:
  - start range: `1 month`, `3 months`, `6 months`
  - visa support
  - pay scale slider with day/hour mode
  - housing included
  - meals included
- Layout:
  - top summary chips for active filters
  - grouped controls
  - sticky footer with `Apply` + `Clear`

### `SortPopup`

- Purpose: lane/category sort pivot only
- Options:
  - `Maritime`
  - `Remote`
  - `Farm`
  - `Seasonal`
  - `Mix`
- Layout:
  - five icon rows or chips
  - one selected state
  - immediate apply or single confirm action

### `SeekerResumePopup`

- Purpose: host quick review of a seeker without leaving the pipeline board
- Must show:
  - seeker identity
  - top skills tags
  - availability
  - work summary
  - resume highlights
  - footer actions: `Skip`, `Save`, `Offer`

### `CommunityProfilePopup`

- Purpose: lightweight member identity / credibility surface
- Must show:
  - avatar
  - handle/name
  - tags
  - recent posts / contributions rows
- Must not show:
  - long biography blocks

## Visual Vocabulary

- `Verified`: trust blue
- `Provided`: success green border
- `Partial`: plum / featured accent border
- `Not provided`: neutral ink / grey border
- `Reported`: warning ink + report tag
- `Matched`: neutral meter, never green/red judgment

## Flow Rules

- Card body -> `QuickPeek`
- Profile icon -> `HostProfile` / `CommunityProfile`
- Housing -> `BenefitBucket(housing)`
- Meals -> `BenefitBucket(meals)`
- Pay -> `PayDetails`
- Flag -> `ReportListing`
- Host board applicant card -> `SeekerResumePopup` or detail route
- Invite CTA -> `SeekerSearchDrawer`

## Implementation Order

1. Migrate all existing discovery/host overlays to `PopupShell`
2. Build `FilterPopup`
3. Build `SortPopup`
4. Build `SeekerResumePopup`
5. Add community popup once community surface is live