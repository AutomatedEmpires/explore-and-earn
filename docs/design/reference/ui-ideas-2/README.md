# UI Ideas 2 Reference Set

Source folder on machine:
- `/mnt/c/Users/autom/projects/automated_empires/explore&earn/ui ideas 2`

Preserved in repo:
- `docs/design/reference/ui-ideas-2/`

## What Changed Versus The First UI Ideas Set

This folder contains the original popup/card references plus a new community-dashboard reference pack.

## New Community Dashboard References

### Feed
- `community dashboard feed (pc_.png`
- `community dashboard feed mobile.png`

### Photos
- `community dashboard photos (pc).png`
- `community dashboard photos mobile.png`

### Announcements
- `community dashboard announcements (pc).png`
- `community dashboard announcements (mobile.png`

### Additional concept comps
- `ChatGPT Image Jun 8, 2026, 04_32_47 PM.png`
- `ChatGPT Image Jun 8, 2026, 04_36_12 PM.png`

## New Design Language Confirmed By This Set

1. Community is a full three-tab product surface, not a single feed block.
2. Tabs are explicitly `Feed`, `Photos`, and `Announcements` with the same parchment shell as the rest of the product.
3. The top bar uses search, notification, and avatar actions inside the same illustrated shell.
4. Every community card uses the same paper-card framing with heavy ink outline and soft grain texture.
5. Reactions are standardized across card types: smile, heart, 100, raised hands, sparkle.
6. Seeker, host, and blog posts all belong in the same feed system, with different card variants.
7. Host announcement cards use pinned/taped scrapbook treatment plus `View host profile` CTA.
8. Photo posts use large scenic media with inline tags and a lighter body copy block.
9. Blog/editorial cards can expand into a dedicated article reading surface.
10. Mobile is not a scaled-down desktop canvas; the layout stacks and simplifies intentionally.
11. The community page includes supportive side or footer modules such as welcome/xp, popular tags, help, and upcoming listings.

## High-Value UI Patterns In The New References

### Community shell
- Brand mark at left
- Three tab nav centered
- Search, notification, avatar controls at right
- Welcome / level progress strip below nav

### Feed cards
- Mixed card types in one feed: seeker post, host post, blog post
- Author lane badge (`SEEKER`, `HOST`, `BLOG`)
- Scenic media at right or full-width depending on card type
- Reactions in a consistent footer rail

### Photos tab
- Image-dominant cards
- Tag chips overlaid on media
- Short caption + lightweight action button
- Same reaction bar as feed

### Announcements tab
- Host-first posting format
- Pinned note / scrapbook composition
- Three-image gallery pattern
- Strong `View host profile` CTA

### Secondary support modules
- Welcome / XP card
- Popular tags card
- Help card
- Upcoming listings card

## Suggested Implementation Owners

### Community page shell and tabs
- likely new seeker-scope route/page for community
- same visual token family as the popup/card system

### Community card primitives
- new shared community card family:
  - seeker post card
  - host announcement card
  - blog/editorial card
  - photo post card

### Article detail surface
- dedicated blog/article reading view matching `ChatGPT Image Jun 8, 2026, 04_36_12 PM.png`

## Implementation Implication

The new references broaden the vision beyond popups. They define a community dashboard system with:
- page-level shell
- feed variants
- editorial/article detail
- support modules
- responsive mobile patterns

This should be treated as its own surface pack, parallel to the popup/card work, not as a one-off page mock.
