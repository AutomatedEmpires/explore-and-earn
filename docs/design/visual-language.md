# Visual Language

The feeling, the references, and the anti-patterns. Read this before building any surface. The founder's biggest concern is **visual quality**; the bar is "premium travel/work marketplace," not "SaaS dashboard."

## It should feel like

Premium Adventure + Warm Working Landscape + Operational Efficiency — **card-first, mobile-first, zero bloat.**

Closest references: **Airbnb, Patagonia, National Geographic**, premium travel/work marketplaces.

## It must NOT feel like

Indeed · ZipRecruiter · generic SaaS dashboard · corporate HR/ATS tool.

## The hybrid sketchbook / product aesthetic

- Soft **hand-drawn card edges** and ink borders (borders over shadows).
- **Paper-like surfaces** (`--color-paper`, `--color-surface`).
- **Premium scenic photo areas** with warm, organic photography.
- **Purposeful hand-drawn icons** (Streamline Freehand), never decorative clutter.
- **Clean information blocks** for fast scanning and high trust.

## One system, many visual worlds

Explore&Earn supports multiple lifestyle categories through **one unified component system**. Do **not** build a separate UI system per category — vary **imagery + accent color** only.

The locked category taxonomy is **farm / maritime / remote / seasonal / mix**. *Lodge is not a category* — it is a setting/environment that lives under **seasonal**.

| Lane | Imagery cues | Accent |
| --- | --- | --- |
| **Farm / Orchard / Greenhouse** | warm earth, produce, soil, barns, golden-hour light, wood, baskets, greenhouses | Farm accent |
| **Maritime** | rope, docks, water, boats, nets, salt | Maritime blue-gray |
| **Remote** | cabins, laptops, quiet landscapes, desks, simple workspaces | Remote accent |
| **Seasonal / Outdoor** | mountains, cabins, lodges, trails, lakes, pine, stone, scenic work (lodge is a *setting* here, never a top-level category) | Seasonal accent |
| **Mix** | blended / multi-category opportunities; compass + folded-map cues | Mix accent |

> **Do not let Explore&Earn become only alpine adventure.** The Farm/greenhouse "Warm Working Landscape" lane is co-equal. Balance imagery across lanes everywhere defaults appear.

## Layout rules

- Mobile-first; cards stack vertically; bottom nav (height 64); bottom sheets for depth.
- Desktop (≥ 1024) adds rails, side panels, hover previews, multi-column — same components, denser.
- Generous whitespace; let photography + type carry richness; restrained accent use.

## Mobile rules

Large tap targets · vertical hierarchy · bottom action rows · bottom-sheet escalation for deep content · media-forward layouts.

## Motion rules

Useful, not decorative. Fast transitions (120/200/320ms), no bounce, reduced-motion fallback. Animate swipe cards, sheet open/close, map drawer, skeletons, status changes, meters.

## Anti-patterns (do not ship)

- Generic Material/Bootstrap default SaaS UI.
- Drop-shadow-heavy "card" stacks (we are borders-first).
- Color-only status (always icon + text).
- Filters/overlays painted *onto* host photos (frame *around*, never *on* — see `photo-language.md`).
- Mixed icon libraries (Streamline Freehand only).
- Ad-heavy, low-trust marketplace clutter; spammy boost treatments.
- Dense corporate ATS tables as a primary surface.
- Inventing colors/type/spacing outside the locked tokens.
