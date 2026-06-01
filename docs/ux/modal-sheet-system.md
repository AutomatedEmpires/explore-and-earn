# Overlay System (Modal / Sheet / Drawer / Popover / Fullscreen) — V1

> Source: Notion *Popup Architecture & Modal Families*, *Canonical Page Registry* (registered popups), *Navigation Architecture Doctrine* (routing doctrine). One overlay system, shared families — **never** 20+ one-off modals. This pack defines the contract only; **no overlay logic is implemented yet**.

## Form-factors (responsive)

| Form-factor | When | Mobile | Desktop |
| --- | --- | --- | --- |
| **Modal** (centered) | focused decision/confirm | full-width sheet | centered dialog |
| **Bottom sheet** | card actions, filters, quick detail, media, scheduling | primary | (rarely) |
| **Drawer** | map list, side detail, analytics peek | slide-up | side panel |
| **Popover** | small contextual menus, quick actions, match explanation | inline/sheet | anchored popover |
| **Fullscreen immersive** | map, media gallery, onboarding | fullscreen | fullscreen/large |

Routing doctrine: **Full page** for dashboards, editors, billing, admin queues, resume builder. **Overlay** for rapid review, previews, report, upgrade, match explanation, media, scheduling.

## Behavior families (from canon)

1. **Profile popups** — Seeker / Host / Explore&Earn / Admin profile.
2. **Media bucket popups** — Cover/Icon buckets, Host Photo Carousel, Housing Media, Meals Media (source order: listing override → host profile bucket).
3. **Detail & review** — Discovery Card Detail, Seeker Resume, Quick Peek, Match Score Explanation, Listing Relevance Extension.
4. **Workflow** — Report Pipeline, Calendar/Scheduling, Messaging, Get More Listings, Get More Announcements, Upgrade to Professional, Upgrade to Enterprise, Boost Your Listing, Invite to Apply, Offer, Travel Plan.
5. **Navigation/utility** — Host More, Notification Center, scope switcher, quick action.

## Registered overlay surfaces (must stay registered)

Seeker/Host/E&E/Admin Profile · Cover/Icon Photo Bucket · Host Photo Carousel · Quick Peek · Seeker Resume · Report Pipeline · Discovery Card Detail · Host More · Calendar/Scheduling · Messaging · Get More Listings · Get More Announcements · Upgrade to Professional · Upgrade to Enterprise · Boost Your Listing · Housing Media · Meals Media · Match Score Explanation.

## ModalHost contract (to implement later)

A single root-level **overlay router** (`apps/web/components/shell/ModalHost.tsx`, placeholder shipped here) owns:

- a typed registry of overlay keys → form-factor + family;
- open/close state, stacking, and **escalation** (small popover → deeper sheet/modal → full route when content outgrows the overlay);
- **focus trap, keyboard (Esc/Tab), and SR labels** on every overlay;
- **permission/tier checks before open** (e.g. upgrade-gated actions) — checks only, no billing logic;
- the **Interaction Preservation Rule**: closing returns the user to the exact prior scroll / card / map position;
- analytics hooks (`popup_opened`, etc.) — **names reserved, not emitted yet**.

Mobile renders families as bottom sheets / fullscreen; desktop as popovers / centered modals / side panels. Overlays are **not routes** and must not appear in `route-map.md`.

## Do not

- create per-surface bespoke modals outside these families;
- deep-link overlays as routes;
- implement any overlay's feature behavior in this pack (report submission, messaging, scheduling, billing) — placeholder + contract only.
