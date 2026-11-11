# Explore&Earn design system in Figma

Issue [#61](https://github.com/AutomatedEmpires/explore-and-earn/issues/61) (EE-F0). The Figma page mirrors the code on `integrate/sp2-20261104` at `ae72a80`. The code stays the source of truth: `src/ui/tokens.css` (and `src/ui/tokens.ts`) for tokens, `src/ui/components` for components and `src/ui/icons.ts` for icons. Figma variables and components mirror them; the page adds no new styles.

Category colors are the exception, recorded in [Category palette](#category-palette-issue-85). Figma holds the proposed values. `src/ui/tokens.css` keeps the old ones until issue #86.

- **File:** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A (jackson.cole's team)
- **Page "00 System":** https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=0-1
- **Status:** top bar A is the founder's choice (B and C are archived). The recolored palette (#85) is approved; `src/ui/tokens.css` takes it in #86. The #152 revision below is not approved yet: the lead re-audits (audit 3), then asks the founder. Nothing here is approved until the founder comments `approved` on the design issue (policy/designops.md in AE-Control).

## Design audit 2 revision (#152)

Issue [#152](https://github.com/AutomatedEmpires/explore-and-earn/issues/152). Since #152 the Figma page leads the code for the items below; each one names its code follow-up. Prefix nodes with `https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=`.

| Id | What changed | Where |
|---|---|---|
| S-1 | The type scale is 8 steps: 12, 14, 16, 18, 20, 24, 28, 32. New styles `text-16/regular`, `text-18/bold`, `text-20/bold`, `text-20/extrabold`, `text-32/extrabold`; new Type variables `text/18/*` and `text/20/*`. Every 13, 15, 17, 19 and 21 px use on pages 00, 01 and 02 was moved up or down to the nearest step (561 nodes on 00, every node on 01 and 02), then the 10 off-scale styles were deleted (no node on 00 to 03 used them). `wordmark` is 20 px. 18 styles remain. Code: #86 | [6-494](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=6-494) |
| S-2 | First-run parts now use 16 px inputs and body and 14 px secondary text through the new scale | Section 5 |
| S-3 | Section 4 marks A approved and archives B and C. New "Top bar A · widths and states": 320, 390, 768 and 1440, signed in and signed out, the host bar at 390, and desktop links with Seek current. The TopBar component and its variant names are unchanged | [147-4550](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=147-4550) |
| S-4 | ErrorState is a set with `Kind` error, offline (WifiOff) and denied (Lock). New **Notice** (info, warning, danger, success) for partial data ("Some results didn’t load · Retry"), the minimum-wage warning, failed sends and confirmations. Code: `ErrorState kind`, new `Notice.tsx` | ErrorState [144-4443](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=144-4443), Notice [144-4507](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=144-4507) |
| S-5 | TabsTrigger Default and Disabled strokes bound to `color/line` | [16-1818](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1818) |
| S-6 | Pill is 44 px high in every variant | [12-57](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-57) |
| S-7 | CategoryBadge keeps the icon and word mandatory (no icon-less variant); the tint table is below | [Category tints](#category-tints-and-status-tints) |
| S-8 | Seasonal is gold again (`color/seasonal-fg` on `color/seasonal-bg`). Status badges (Badge) have 8 px corners (`radius/sm`) and always show an icon; categories are full pills in their tint. Shape, icon and word separate them even where tints are close | CategoryBadge [12-106](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-106), Badge [11-300](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-300) |
| S-9 | Dark first run: check your email, sign-in error, sign-up, and onboarding submitting (new `State=Submitting` variant on Onboarding · seeker) | Section 5 rows |
| S-10 | The sign-in card offers Google, **Sign in with a passkey** and an email link | [21-2213](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2213) |
| S-11 | "Secured by Clerk" and the caret on Continue are hidden; the footer is the card surface with a top line. Code: `src/ui/clerk.ts` still needs `buttonArrowIcon` hidden and branding off in the dashboard | Clerk cards |
| S-12 | This README's status lines are current | here |
| S-13 | CardSkeleton follows the #101 JobCard: cover, logo tile, three title lines, the deal row, the pay chip and the action row | [14-1542](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1542) |
| #152 asks | JobCard gets `Pay estimate` (line and basis, legal review §9), `Freshness` (under the dates) and `Cover` (collapse) slots, with no variant renamed; cover and room photos centre and fill at any width. Checkbox labels and every field's error and hint wrap on their own. New PhotoSlot, BuilderStepHeader and MapPin components, five icons (WifiOff, Lock, KeyRound, Mail, Image) and seven original sample illustrations (six rooms and meals, one base map) | Components and sample media below |

## Page layout

| Section | Link | What it holds |
|---|---|---|
| Read me | [6:2](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=6-2) | How to use the page |
| 1 Foundations | [6:667](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=6-667) | Color (light and dark), type scale and text styles, radius, spacing, shadows, motion |
| 2 Icons | [7:463](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=7-463) | The 69 icons that `src/ui/icons.ts` exports, plus 5 added in #152 (WifiOff, Lock, KeyRound, Mail, Image) that `icons.ts` must export |
| 3 Components | [11:301](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-301) | One component set per file in `src/ui/components`, with specimens |
| 4 Top bar (A approved) | [20:2791](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=20-2791) | Option A at every width and state; B and C archived |
| 5 First run (as built) | [21:2446](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2446) | Sign-in, sign-up and onboarding at phone and desktop widths |
| 6 Category palette | [43:2627](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-2627) | Issue #85. Recolored category variables, compared with every status color, at 390, 768 and 1440, light and dark |

## Designing screens on this system

These rules are for the agents who design the host and seeker screens.

- Build from component instances. Each component is named as the code exports it (`JobCard`, `IconButton`, ...), and its description gives the file path and props.
- Colors come only from the **Color** collection, which has the code's token names (`color/bg`, `color/surface-2`, `color/ink`, ...). Never use hex values. Switch a frame between light and dark with the Color collection's mode.
- Text uses the `text-<size>/<weight>` text styles. Spacing uses `space/<Tailwind step>` (4px each, so `space/4` is 16px). Corners use `radius/*`.
- Color only carries meaning: category colors and the green "Provided". Everything else is warm neutrals and the near-black primary. Touch targets are at least 44px.
- Swap icons with the `Icon` instance-swap property. Icons are `icon/<ExportName>`, matching `import { ExportName } from '@/ui/icons'`.

## Variables, styles and effects

| Collection | Modes | Variables | Mirrors |
|---|---|---|---|
| Color | Light, Dark | 35: the 29 color tokens (`color/bg` ... `color/remote-solid`), `color/scrim`, and 5 shadow colors (`shadow/card-1`, `shadow/card-2`, `shadow/raised`, `shadow/overlay-1`, `shadow/overlay-2`) | `--ee-*` in `src/ui/tokens.css`; code syntax `var(--ee-<name>)` |
| Type | Value | 38: `font/family/sans` (Figtree), `font/weight/regular|semibold|bold|extrabold`, and `text/<size>/size`, `line-height` and `letter-spacing`. The styles use 12, 14, 16, 18, 20, 24, 28 and 32. `text/18/*` and `text/20/*` are new in #152; the old 13, 15, 17, 19 and 21 variables stay until #86 removes them from `tokens.css`, and no style uses them | `@theme` `--text-*` |
| Radius | Value | 6: `radius/sm` 8, `md` 12, `lg` 14, `xl` 20, `2xl` 24, `full` | `--radius-*`, plus Tailwind `rounded-full` |
| Spacing | Value | 17: `space/0_5` (2px) to `space/16` (64px), the steps the components use | Tailwind's default `--spacing` (0.25rem), which tokens.css keeps |
| Motion | Value | 10: `easing/standard`, `easing/exit`, and the `duration/*` of the 8 animations (fade, sheet, panel, pop; in and out) | `--ease-*`, `--animate-*` |

- **Text styles (18, #152):** `text-12/semibold`, `/bold`, `/extrabold`, `/bold-caps`; `text-14/regular`, `/semibold`, `/bold`; `text-16/regular`, `/semibold`, `/bold`; `text-18/bold`; `text-20/bold`, `/extrabold`; `wordmark` (20); `text-24/extrabold`, `/extrabold-tight`; `text-28/extrabold`; `text-32/extrabold`. Body copy is `text-16/regular`. Size, line height, letter spacing, family and weight are bound to the Type variables.
- **Effect styles (3):** `shadow/card`, `shadow/raised` and `shadow/overlay`. The offsets and blurs are the same in both themes; their colors are the shadow variables, so the shadows follow the Light/Dark mode.

## Components

All links go to the component set or component. Variant properties are listed first; text, boolean and instance-swap properties follow them.

| Component | Figma | Code | Variants and properties |
|---|---|---|---|
| Sample media | [11:5](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-5) | `public/design-system/samples/*.svg` | `media/lake`, `harbor`, `farm`, `maya`, `kettle-ridge-logo` (fictional); #152 adds original illustrations `media/room-bedroom` [154:5103](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5103), `room-bathroom` [154:5141](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5141), `room-kitchen` [154:5185](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5185), `room-exterior` [154:5233](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5233), `meal-plate` [154:5268](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5268), `meal-dining` [154:5306](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=154-5306) and the base map `media/map` [173:9171](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=173-9171) |
| Button | [11:179](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-179) | `src/ui/components/Button.tsx` | Variant (primary, secondary, ghost, danger) x Size (md, lg) x State (Default, Disabled, Loading); Label, Show icon, Icon |
| IconButton | [11:228](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-228) | `src/ui/components/IconButton.tsx` | Variant (ghost, outline, subtle, primary, overlay) x Size (md, lg); Badge (None, Count, Dot); Pressed; Icon, Count |
| IconLink | [11:248](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-248) | `src/ui/components/IconLink.tsx` | Current x Badge (None, Count); Icon, Count |
| Badge | [11:300](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=11-300) | `src/ui/components/Badge.tsx` | Tone (neutral, surface, inverse, success, warning, danger) x Size (sm, md); Label, Show icon, Icon. #152: 8 px corners; a status always shows its icon |
| Pill | [12:57](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-57) | `src/ui/components/Pill.tsx` | Selected x Leading (None, Icon, Category); Label, Show count, Count, Icon. 44 px high (#152) |
| Chip | [12:84](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-84) | `src/ui/components/Chip.tsx` | Tone (default, success, muted); Label, Value, Icon |
| CategoryBadge | [12:106](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-106) | `src/ui/components/CategoryBadge.tsx` | Category (maritime, seasonal, farm, remote). Full pill in the category tint; icon and word always shown. Seasonal is gold again (#152) |
| CategoryListBadge | [12:107](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-107) | `src/ui/components/CategoryBadge.tsx` | Label, Icon 1, Icon 2, Show icon 2 |
| Avatar | [12:207](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-207) | `src/ui/components/Avatar.tsx` | Size (sm, md, lg, xl) x Photo x Ring; Initials |
| OrgLogo | [12:259](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=12-259) | `src/ui/components/OrgLogo.tsx` | Size (sm, md, lg, xl) x Logo x Ring; Initials |
| Card | [14:260](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-260) | `src/ui/components/Card.tsx` | Cover size (lg, md); the anatomy, with each slot labelled |
| JobCard | [14:1170](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1170) | `src/ui/components/JobCard.tsx` | Housing (Provided, No housing) x Meals (Provided, No meals) x Apply (Apply, Applied); Position, Host, Location, Starts, Ends; Boosted, Info button, Subscriber, Cover photo, Show end, Actions; Housing type, Housing cost, Meals detail, Couples, Room photo; exposed category badge, host logo, Pay chip and Save. #152 adds Freshness and Freshness text, Pay estimate with Pay estimate line and basis, and Cover (collapse). Variant names are unchanged. Issues #101 and #152. |
| JobCard specimens | [15:750](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=15-750) | gallery `cards.tsx`, PR #50 | The gallery cases, plus PR #50: yearly pay ($45,000/yr), preformatted labels ($52k/yr, Summer 2027, · Ongoing), Applied |
| Pay chip values | [15:1753](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=15-1753) | `JobCard.test.tsx` | hr, day, wk, mo, season, yr; ranges; labels; the formatStart date lines |
| CandidateCard | [14:1534](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1534) | `src/ui/components/CandidateCard.tsx` | Variant (applicant, pool) x Photo (Shown, Initials) |
| Skeleton | [14:1541](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1541) | `src/ui/components/Skeleton.tsx` | Shape (rect, circle, text) |
| CardSkeleton | [14:1542](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=14-1542) | `src/ui/components/Skeleton.tsx` | The shared card while it loads, on the #101 JobCard anatomy (#152) |
| Input | [16:1515](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1515) | `Input.tsx`, `Field.tsx` | State (Empty, Filled, Error, Disabled); Label, Required, Show hint, Hint, Error, Leading icon, Icon. Hint and error wrap (#152); Textarea and Select too |
| Textarea | [16:1552](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1552) | `Textarea.tsx`, `Field.tsx` | State (Empty, Filled, Error, Disabled); Label, Required, Show hint, Hint, Error |
| Select | [16:1597](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1597) | `Select.tsx`, `Field.tsx` | State (Placeholder, Selected, Error, Disabled); Label, Required, Show hint, Hint, Error |
| Select menu | [16:1598](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1598) | `Select.tsx` | The open list: selected, highlighted and disabled items |
| Checkbox | [16:1677](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1677) | `Checkbox.tsx` | Checked x State (Default, Error, Disabled); Label, Show description, Description, Error. Label and description wrap (#152); Radio too |
| Radio | [16:1707](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1707) | `Radio.tsx` | Checked x Disabled; Label, Show description, Description |
| RadioGroup | [16:1708](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1708) | `Radio.tsx` | Legend, Show error, Error |
| Switch | [16:1773](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1773) | `Switch.tsx` | Checked x Disabled; Label, Show description, Description |
| Slider | [16:1794](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1794) | `Slider.tsx` | Thumbs (Single, Range); Label, Value |
| SegmentedControl | [16:1808](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1808) | `SegmentedControl.tsx` | Selected (First, Second); Option 1, Option 2 |
| TabsTrigger | [16:1818](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1818) | `Tabs.tsx` | State (Default, Active, Disabled); Label |
| TabsList | [16:1819](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=16-1819) | `Tabs.tsx` | The gallery's Community tabs |
| Wordmark | [17:1510](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1510) | `TopBar.tsx` | Explore&Earn |
| TopBar link | [17:1518](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1518) | `TopBar.tsx` | Current; Label |
| TopBar | [17:1855](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1855) | `TopBar.tsx` | Role (None, Seeker, Host, Operator); Menu (start), Links (desktop), Community, Inbox, Notifications, Account menu, Org switcher, Sign in |
| OrgSwitcher | [17:1539](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1539) | `OrgSwitcher.tsx` | Compact; Name, Role |
| OrgSwitcher menu | [17:1540](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1540) | `OrgSwitcher.tsx` | The open popover |
| BottomNav item | [17:1881](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1881) | `BottomNav.tsx` | Current x Attention; Label, Icon |
| BottomNav | [17:1951](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1951) | `BottomNav.tsx` | Role (Seeker: Seek, Swipe, Map, Profile; Host: Home, Applicants, Messages, Listings, More) |
| Sidebar item | [17:1975](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1975) | `Sidebar.tsx` | Level (Top, Child) x Current; Label, Show count, Count, Icon |
| Sidebar | [17:1976](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=17-1976) | `Sidebar.tsx`, `src/app/host/_components/HostShell.tsx` | The host sidebar in spec 15.2 order, without Promote. A plan subscription only, no add-ons. |
| Sheet | [18:1755](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1755) | `Sheet.tsx` | Layout (Bottom sheet, Side panel); Title, Description, Show icon, Icon, Footer |
| Dialog | [18:1793](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1793) | `Dialog.tsx` | Title, Description; exposed cancel and confirm buttons |
| Toast | [18:1883](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1883) | `Toast.tsx` | Tone (default, success, danger); Title, Show description, Description, Action, Action label, Dismiss |
| Tooltip | [18:1925](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1925) | `Tooltip.tsx` | Content |
| EmptyState | [18:1951](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-1951) | `EmptyState.tsx` | Title, Description, Action, Icon |
| ErrorState | [144:4443](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=144-4443) | `ErrorState.tsx` | Kind (error, offline, denied), #152. Title, Description and Icon properties drive Kind=error; offline and denied carry their own copy and icon |
| Notice | [144:4507](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=144-4507) | new `Notice.tsx` | Tone (info, warning, danger, success); Title, Description, Show description, Show action, Icon; exposed Button. #152 |
| PhotoSlot | [155:5143](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=155-5143) | new, builder | State (Empty, Filled, Failed); Slot, Hint, Icon, Photo. #152 |
| BuilderStepHeader | [155:5144](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=155-5144) | new, builder | Step, Show back; progress fill set per step. #152 |
| MapPin | [181:5151](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=181-5151) | new, Map | Kind (maritime, seasonal, farm, remote, cluster, boosted); Count. 44 px (boosted 52). #152 |
| StatTile | [18:2047](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=18-2047) | `StatTile.tsx` | Trend (None, Up, Flat, Down) x Good news; Label, Value, Trend label, Show hint, Hint, Show icon, Icon |
| BarChart | [19:1907](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=19-1907) | `BarChart.tsx`, `ChartParts.tsx` | View (Chart, Table) |
| StackedBar | [19:1988](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=19-1988) | `StackedBar.tsx`, `ChartParts.tsx` | View (Chart, Table); drawn as rows |
| DonutChart | [19:2063](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=19-2063) | `DonutChart.tsx`, `ChartParts.tsx` | View (Chart, Table) |

## Top bar (option A approved)

The founder chose **A · Icons only**. The section now opens with [Top bar A · widths and states](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=147-4550): 320, 390, 768 and 1440, signed in and signed out (guest: Community and Sign in), the host bar at 390 (768 and 1440 use the Sidebar), and the desktop links with Seek current. B and C below are archived at 45% opacity and must not be used. The original comparison follows for the record.


Product spec 15.1 leaves the top bar open, and section 26 lists it as an open item to settle before the design system locks. The three options are the ones the gallery shows at `/design-system/topbar-options` (`src/app/design-system/_reference/TopBarOptions.tsx`), drawn with the TopBar component. Each is shown at phone width, for a seeker and a host, in light and dark. They match the committed Playwright capture `artifacts/design-review/design-topbar-options-light-1280.png`.

| Option | Link | What it is |
|---|---|---|
| A · Icons only | [20:1841](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=20-1841) | The calmest bar, with every action one tap away. Seeker and host bars look alike. **The seeker and host shells render this one today.** |
| B · Icons with a role badge | [20:1981](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=20-1981) | The same actions plus a small Seeker or Host badge, so whose view it is shows at a glance. About 60px wider. The design board's artboards use this one. |
| C · Hamburger menu with a role badge | [20:2275](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=20-2275) | The fewest icons: Inbox stays in the bar (the org switcher for a host) and the menu holds the rest. Includes the open menu sheet for a seeker and a host. Community and Notifications take one more tap. |

## First run, as built (for after-the-fact approval)

The screens are already coded. They are captured here, not redesigned. Screens group: [23:2279](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2279).

| Screen | Phone 390, light | Phone 390, dark | Desktop 1440, light | Code |
|---|---|---|---|---|
| `/sign-in` | [23:2285](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2285) | [23:2500](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2500) | [23:2568](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2568) | `src/app/sign-in/[[...sign-in]]/page.tsx`, `src/ui/clerk.ts` |
| `/sign-up` | [23:2321](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2321) | | [23:2604](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2604) | `src/app/sign-up/[[...sign-up]]/page.tsx`, `src/ui/clerk.ts` |
| `/onboarding`, choose | [23:2358](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2358) | [23:2536](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2536) | [23:2641](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2641) | `src/app/onboarding/OnboardingForm.tsx` |
| `/onboarding`, seeker | [23:2387](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2387) | | [23:2670](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2670) | same |
| `/onboarding`, host | [23:2412](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2412) | | [23:2695](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2695) | same |
| `/onboarding`, seeker error | [23:2437](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2437) | | | same |
| `/onboarding`, host error | [23:2467](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=23-2467) | | | same |

The screens are built from these parts: Clerk SignIn card [21:2213](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2213), Clerk SignUp card [21:2244](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2244), Onboarding choice [21:2275](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2275), Onboarding · choose [21:2284](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2284), Onboarding · seeker [21:2372](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2372) and Onboarding · host [21:2438](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=21-2438). Each has a Default and an Error state. They sit inside the AuthFrame layout (`src/ui/patterns/AuthFrame.tsx`).


#152 added these first-run frames (S-9, S-10, S-11):

| Frame | Light | Dark |
|---|---|---|
| `/sign-in` · check your email | [149:4920](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4920) | [149:4998](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4998) |
| `/sign-in` · error | [149:4959](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4959) | [149:5037](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-5037) |
| `/sign-up` | (above) | [149:5076](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-5076) |
| `/onboarding` · seeker · submitting | [149:5082](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-5082) | [149:5113](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-5113) |

New parts: [Clerk check email card](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4818), [Clerk SignIn card · error](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4861) and `State=Submitting` on Onboarding · seeker ([149:4900](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=149-4900)). The sign-in card gains "Sign in with a passkey" under Google; both Clerk cards lose "Secured by Clerk" and the Continue caret.

## Category palette (issue 85)

Issue [#85](https://github.com/AutomatedEmpires/explore-and-earn/issues/85) (EE-F0b). Section [6 Category palette](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-2627) on page 00 System.

Only the 12 category variables changed: `color/maritime`, `color/seasonal`, `color/farm` and `color/remote`, each with `fg`, `bg` and `solid`, in Light and Dark. Status, brand and neutral variables are unchanged. Light success is still `#1F6B43`. Dark success is still `#7FD3A0`. Warning, danger and focus are unchanged too.

The frames bind those variables. The hex below is the value of each variable, not a hardcoded paint. `src/ui/tokens.css` still has the old values. Issue #86 copies this palette into the code after the lead asks the founder to approve it.

Each color names a kind of work, and none of them is a status color. Maritime is harbor water, a teal, not the focus blue. Seasonal is fall gold, yellower than warning. Farm is orchard olive, lighter than success. Remote was red, the same hue as danger, so it is now violet. The laptop icon and the word Remote stay with it.

| Frame | Link |
|---|---|
| Palette · 1440 · Light | [43:2628](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-2628) |
| Palette · 1440 · Dark | [43:3041](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-3041) |
| Palette · 768 · Light | [43:3454](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-3454) |
| Palette · 768 · Dark | [43:3867](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-3867) |
| Palette · 390 · Light | [43:4280](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-4280) |
| Palette · 390 · Dark | [43:4693](https://www.figma.com/design/PbAWCgi2JXiyl5PmbGvr9A?node-id=43-4693) |

### Old values, still in `src/ui/tokens.css`

| Token | Light | Dark |
|---|---|---|
| maritime fg / bg / solid | `#1A4F9C` / `#E6EEFA` / `#1D5FBF` | `#A9C8F5` / `#16294A` / `#5B95E8` |
| seasonal fg / bg / solid | `#8F4E06` / `#FBEEDD` / `#B45F06` | `#F5BF7E` / `#3A2710` / `#E08A2E` |
| farm fg / bg / solid | `#24622E` / `#E5F2E6` / `#2F7D3B` | `#9AD6A4` / `#183520` / `#55AC62` |
| remote fg / bg / solid | `#A12C23` / `#FBE7E5` / `#C8382E` | `#F6A8A1` / `#451B17` / `#E5604F` |

### New values, in the Figma Color collection

| Token | Light | Dark |
|---|---|---|
| maritime fg / bg / solid | `#003949` / `#DBF3FC` / `#0E7490` | `#C9EBF8` / `#011E28` / `#3D859D` |
| seasonal fg / bg / solid | `#4B4300` / `#F4EEB8` / `#A08318` | `#F3EFB0` / `#241F0C` / `#F3EFB0` |
| farm fg / bg / solid | `#354316` / `#EAF8D4` / `#74915E` | `#CCF3AE` / `#131E0A` / `#5F8938` |
| remote fg / bg / solid | `#41094C` / `#FBECFE` / `#652A72` | `#F1DCF5` / `#251229` / `#C282D0` |

Dark seasonal uses the same pale gold for `fg` and `solid`. A darker gold sat on top of farm for red-blind viewers.

### Contrast

Text is `fg` on `bg` and must be at least 4.5:1. Marks are `solid` on the card (`color/surface`), the page (`color/bg`) and the tint (`bg`), and must be at least 3:1. Light page `#FBFAF7`, light card `#FFFFFF`. Dark page `#141311`, dark card `#1D1B18`.

| Category | Theme | Text on tint | Mark on card | Mark on page | Mark on tint |
|---|---|---|---|---|---|
| Maritime | Light | 10.85:1 | 5.36:1 | 5.13:1 | 4.65:1 |
| Seasonal | Light | 8.45:1 | 3.65:1 | 3.50:1 | 3.09:1 |
| Farm | Light | 9.60:1 | 3.53:1 | 3.38:1 | 3.17:1 |
| Remote | Light | 13.54:1 | 9.87:1 | 9.46:1 | 8.71:1 |
| Maritime | Dark | 13.73:1 | 4.12:1 | 4.46:1 | 4.14:1 |
| Seasonal | Dark | 13.93:1 | 14.55:1 | 15.72:1 | 13.93:1 |
| Farm | Dark | 13.96:1 | 4.19:1 | 4.53:1 | 4.21:1 |
| Remote | Dark | 13.61:1 | 6.05:1 | 6.54:1 | 6.18:1 |

### Distance from each status color

The number is CIEDE2000 between the category solid and that status solid. The hue gap is from the nearest status hue. Under 10 can look like one color to a sighted person. Every pair below is past that.

| Category | Theme | Success | Warning | Danger | Focus | Hue gap |
|---|---|---|---|---|---|---|
| Maritime | Light | 28.6 | 42.9 | 54.3 | 18.2 | 40° from focus |
| Seasonal | Light | 32.3 | 19.4 | 38.4 | 60.8 | 25° from warning |
| Farm | Light | 18.9 | 32.9 | 51.1 | 51.4 | 24° from success |
| Remote | Light | 42.9 | 47.2 | 34.8 | 23.3 | 57° from focus |
| Maritime | Dark | 35.1 | 46.5 | 49.0 | 21.9 | 37° from focus |
| Seasonal | Dark | 20.9 | 18.6 | 36.1 | 48.7 | 29° from warning |
| Farm | Dark | 23.8 | 34.5 | 50.1 | 52.1 | 24° from success |
| Remote | Dark | 44.5 | 51.0 | 26.9 | 26.3 | 60° from focus |

### Color-vision check

Simulated with the Machado 2009 matrices at full severity (protanopia, deuteranopia, tritanopia). The number is the nearest status color after the simulation. The same frames state this in words. The icon and the word still name the job, which is how the badge already works in `CategoryBadge`.

Light:

- Red-blind: Maritime 13.4 from focus, Seasonal 16.4 from warning, Farm 16.1 from success, Remote 15.5 from focus. Closest pair: Seasonal and Farm, 11.4.
- Green-blind: Maritime 10.5 from focus, Seasonal 13.2 from danger, Farm 15.8 from danger, Remote 12.1 from focus.
- Blue-blind: Maritime 8.0 from success, Seasonal 16.3 from warning, Farm 19.2 from focus, Remote 15.3 from warning.

Dark:

- Red-blind: Maritime 19.2 from focus, Seasonal 9.2 from success, Farm 18.5 from warning, Remote 10.5 from focus. Closest pair: Maritime and Remote, 10.8.
- Green-blind: Maritime 19.6 from focus, Seasonal 11.6 from warning, Farm 20.1 from danger, Remote 7.1 from focus.
- Blue-blind: Maritime 17.8 from focus, Seasonal 18.6 from warning, Farm 21.7 from focus, Remote 13.0 from danger.

Three simulated gaps are under 10. They are listed in [Gaps and notes](#gaps-and-notes). Changing the color to close them pushed another pair under 10, or made the mark look dull next to the status colors.


### Category tints and status tints

CIEDE2000 between each category tint (`*-bg`) and each status tint, computed from the Color variables (S-7). Under 10 can look alike as a fill. The badges never rely on the fill: a category is a full pill with its icon and word; a status Badge has 8 px corners and its own icon.

| Category tint | Theme | success-bg | warning-bg | danger-bg | surface-2 (neutral) |
|---|---|---|---|---|---|
| maritime-bg | Light | 8.4 | 17.3 | 19.5 | 11.3 |
| seasonal-bg | Light | 14.9 | 10.0 | 21.4 | 14.9 |
| farm-bg | Light | 9.2 | 11.9 | 22.7 | 13.3 |
| remote-bg | Light | 18.6 | 19.0 | 8.3 | 13.1 |
| maritime-bg | Dark | 17.4 | 24.9 | 32.1 | 13.5 |
| seasonal-bg | Dark | 16.4 | 8.0 | 19.8 | 7.5 |
| farm-bg | Dark | 8.8 | 17.6 | 30.7 | 12.1 |
| remote-bg | Dark | 31.2 | 27.1 | 16.2 | 18.8 |

### Job cards

Each frame has four `JobCard` instances, one per category, with the Apply button in its active state. Covers use the sample media: harbor for the deckhand, the lake for the housekeeper, the farm for the orchard. Remote has no cover. Hollow Oak shows initials HO. Trailhead Booking shows initials TB. Kettle Ridge keeps its logo.

The orchard pay is `$18–$22/hr`. The gallery string `$18.50 to $22/hr` clips inside the pay chip, so the specimen uses the shorter line. The job pays $18.50 to $22 an hour.

On the 390 frames the card is 384px wide, so the row sits 3px from each edge. The heading "A job in each color" sits 16px in.

Issue #101 adds the whole deal under the dates, readable at 390px with no tap. A 72px room thumbnail sits beside four 16px lines: housing type, housing cost with any period ("$12 a night, taken from pay", or "Free"), meals, and whether couples are housed. Housing type uses `text-16/semibold`. The old Housing and Meals chips are hidden, so the card does not also say "Provided". The pay chip stays and is 140px wide, so `$280/day` and `$18.50–22/hr` are not cut off. `Apply=Applied` is a secondary button with a check, not a disabled button. Since #152, `Category=seasonal` uses `color/seasonal-fg` on `color/seasonal-bg` again (S-8), and the housing, meals and couples lines use `text-16/regular`.

`Housing=No housing` hides the thumbnail, the type, the cost, and the couples line, and shows "No housing". `Meals=No meals` shows "No meals". Host listing rows that are not a JobCard use icon fact lines in the same grammar: "Shared room, free", "2 meals a day, free", "Couples housed" (#152, H-16). Promote is not in the sidebar.

## Gaps and notes

1. **The Clerk forms were not captured from a live render.** No screenshot of `/sign-in` or `/sign-up` exists in the repository. A local run would mean either using the `prd` key set or letting Clerk create a keyless development instance; neither fits a design-only task. The cards follow Clerk's prebuilt layout with our appearance and copy from `src/ui/clerk.ts`. The methods drawn follow product spec section 2: Google, then an email address, with no password. The Clerk dashboard decides which methods actually appear (a passkey option, name fields, a "Development mode" note with test keys). Clerk's internal type sizes are drawn with the nearest text styles. **Next step:** take Playwright screenshots of `/sign-in` and `/sign-up` the next time a claimed task runs the dev server, and correct the two Clerk cards if they differ.
2. **Onboarding is drawn from `OnboardingForm.tsx`**, not from a capture. In code the Back button is `-ml-3 px-3`. Figma auto layout has no negative margins, so the instance puts its 12px left padding on the right: the label lines up the same way.
3. **Spacing and radius are partly Tailwind defaults.** `tokens.css` keeps Tailwind's `--spacing` (0.25rem) and does not define `rounded-full`. Figma rejects `.` in variable names, so half steps are written `space/0_5`, `space/1_5`, and so on.
4. **There is no primitive color layer.** `tokens.css` defines semantic tokens with a value per theme, so Figma has one Color collection with Light and Dark modes and no aliases.
5. **Shadows.** The CSS writes a whole shadow per theme. Figma uses one effect style per shadow, whose colors are Light/Dark variables; the geometry is identical in both themes.
6. **Interaction states.** Hover and focus are described in each component's description, not drawn. Every focusable element gets a 2px `color/focus` outline with a 2px offset. Pressed (aria-pressed) is drawn for the outline IconButton. Skeleton's pulse and all motion appear only as Motion variables.
7. **Text properties share one default across variants.** For example, every Chip tone in the main set reads "Pay $19/hr". The specimens next to each set show real content.
8. **Not drawn:** `Img` and `Slot` (no visuals), and `ToastProvider`, `DialogClose` and `TabsContent` (behavior only). `ChartParts.tsx` is covered by the three charts. The charts are static drawings of the Recharts output using the gallery's sample data.
9. **Small differences from the code.** The Sheet footer button in the reference has a trailing ChevronRight (an `asChild` link); Button has only a leading icon, so it is drawn without the chevron. A md Badge with an icon uses 8px left padding in code, while the Figma Badge keeps 10px.
10. **Top bar on desktop.** The code's options exist only at phone width. On desktop the seeker bar is the TopBar component with Links on (Seek, Swipe, Map, Community) and the account menu; option B adds the badge there too. The host uses the Sidebar on desktop.
11. **Icon swaps.** Swapping a nested icon to the icon it already shows resets the glyph's color override. If an icon turns ink after a swap, bind its `glyph` stroke to the right color variable again.
12. **Category palette, still open.** The proposed colors are in Figma only. Three color-vision gaps stay under 10 and are carried by the icon plus the word: dark Remote vs focus for green-blind viewers (7.1), light Maritime vs success for blue-blind viewers (8.0), and dark Seasonal vs success for red-blind viewers (9.2). Light Seasonal mark on tint is 3.09:1 and light Farm mark on tint is 3.17:1, both just over 3. The nearest sighted gaps are light Maritime vs focus (18.2), light Farm vs success (18.9) and light Seasonal vs warning (19.4). JobCard's own 12px chip labels are unchanged; the type scale is issue #86. A 384px card in a 390px frame leaves 3px a side, and the frame clips the card shadow at that edge. #152 restored the Seasonal colors on the badge.
13. **Whole deal, issue #101.** The housing cost, meals and couples lines use `text-16/regular` (#152). The room thumbnail is the original `media/room-bedroom` illustration. The pay chip is 140px wide so the longest specimen amount fits.
14. **#152 code follow-ups.** The Figma page leads code for: the 8-step scale and `text-16/regular` (#86); JobCard `payEstimate`, `freshness` and `cover`; Notice; ErrorState `kind`; PhotoSlot, BuilderStepHeader and MapPin; the five icons; Badge 8 px corners; Pill 44 px; Clerk `buttonArrowIcon` hidden and branding off. Each component description names its file.
15. **Instance limits found in #152.** An instance cannot move a nested layer, so photos that must stay centred sit in centred auto-layout frames (JobCard cover and room, PhotoSlot). Resize the nested photo to cover; it stays centred.
16. **Onboarding age step.** The as-built onboarding still shows the "I'm 18 or older" checkbox. The design that replaces it is the date-of-birth step on page 02 (#128), now joined to the work-authorization question in "Apply · your details".
