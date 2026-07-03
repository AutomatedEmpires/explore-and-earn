# Design — Replace paid Streamline Freehand with free Phosphor icons

**Date:** 2026-07-02
**Status:** Approved (design) — pending spec review → implementation plan
**Branch:** `feat/phosphor-icons`
**Supersedes:** the Streamline-Freehand provider decision in `docs/design/icon-system.md` / ADR-044 (founder-relaxed 2026-07-02).

## 1. Problem

The icon system has two coupled problems:

1. **Performance.** `packages/ui/src/icons/Icon.tsx` is a client component that, on mount, does a **runtime `fetch()` per distinct icon** from Cloudinary and sanitizes each SVG with client-side `DOMPurify`. A discovery card grid therefore fires N network requests on mount, each flashing a skeleton. (Root-cause finding P0 #3 of the 2026-07-02 performance audit.)
2. **Cost + licensing.** Streamline Freehand is a **paid** subscription, and because the repo is public the paid `.svg` assets **cannot be committed** — which is precisely *why* they are fetched from Cloudinary at runtime. The founder no longer wants to pay for icons alone.

## 2. Decision

- **Provider:** **Phosphor Icons** via the **`@phosphor-icons/react`** package (MIT, ~9,000 icons, six weights). Free, permissively licensed, self-contained in `node_modules` — **no icon assets committed to the repo, nothing paid, no runtime fetch.**
- **Aesthetic:** the founder has **relaxed** the hand-drawn Streamline mandate. Target feel is "natural, consistent, professional, premium." Default weight **`regular`**; **`fill`** for the active nav tab; **`duotone`** for category map pins (`mappin.*`) so they still read as distinct tinted markers.
- **Scope:** full swap in one branch / one reviewable PR.

## 3. Non-goals — what does NOT change

- **The `<Icon name="domain.name" />` public API is preserved verbatim.** All ~267 feature files keep calling `<Icon>` exactly as today. Zero feature-component edits.
- **The `IconKey` taxonomy is preserved** (103 keys across 11 domains). No key is added or removed in this work.
- No visual redesign of any surface beyond the icons themselves rendering in the new set.
- Business logic, routing, auth, RLS, Stripe — untouched.

## 4. Architecture

### 4.1 Registry (`packages/ui/src/icons/registry.ts`)
Becomes a map from `IconKey` → `{ icon: PhosphorIcon; label: string; weight?: IconWeight }`.
- `icon` is a Phosphor React component (e.g. `House`, `Anchor`).
- `label` (kept from today) feeds `aria-label`.
- optional per-key `weight` override (used by `mappin.*` → `duotone`).
- **Removed:** `streamline` concept-hint field, `cloudinaryId`, and `getIconUrl()`.
- `getIcon(key)` is retained (returns the entry) so any label/entry consumers keep working.

### 4.2 `Icon.tsx`
Rewritten to render synchronously:
```
export function Icon({ name, size = 24, weight, color, className, title, ...aria }) {
  const entry = getIcon(name);
  const Glyph = entry.icon;
  return (
    <Glyph
      size={size}
      weight={weight ?? entry.weight ?? "regular"}
      color={color ?? "currentColor"}
      aria-label={aria["aria-hidden"] ? undefined : (title ?? entry.label)}
      aria-hidden={aria["aria-hidden"]}
      className={className}
      data-icon={name}
    />
  );
}
```
- **Removed entirely:** `useEffect`, `useState`, the module `_svgCache`, `fetch()`, `DOMPurify`, `PURIFY_CONFIG`, the emoji/skeleton fallback, `dangerouslySetInnerHTML`.
- Props API unchanged except `weight?` is now an accepted optional override (additive, non-breaking). `size` stays `16 | 20 | 24` (Phosphor accepts the number).
- `currentColor` tinting still works (Phosphor honours `color`), so `mappin.*` category tints via the existing `color` prop are preserved.

### 4.3 Weight strategy
Set app-wide defaults via Phosphor's `IconContext` is **not** used (keeps `Icon` self-contained); instead the default is `regular` in `Icon.tsx`, per-key overrides live in the registry (`mappin.* → duotone`), and callers may pass `weight="fill"` for active states (the seeker/host bottom docks pass `fill` on the active tab).

### 4.4 Dependencies
- **Add** `@phosphor-icons/react` to `packages/ui`.
- **Remove** `dompurify` and `@types/dompurify` from `packages/ui` (only the icon-fetch path used them; confirm no other importer first).
- **Add** `@phosphor-icons/react` to `experimental.optimizePackageImports` in `apps/web/next.config.ts` so only the ~103 referenced icons ship (tree-shaken).

### 4.5 Governance & docs
- **G30 guardrail** (`tools/scripts/…` / the eslint rule): update to **allow** `@phosphor-icons/react`, keep banning Lucide/Heroicons/Font-Awesome/Material/react-icons and ad-hoc inline SVG in feature code.
- **`docs/design/icon-system.md`**: rewrite the "Decision"/licensing sections to record Phosphor as the provider; note the Streamline relaxation and remove the Cloudinary-fetch + DOMPurify description. Leave the taxonomy section intact.
- Retire/annotate `docs/design/streamline-freehand-map.md` (superseded by the mapping table below).
- Cloudinary icon assets can be left in place (harmless) — no deletion required by this work.

## 5. Concept → Phosphor mapping (all 103 keys)

Exact component names are validated against the installed `@phosphor-icons/react` during implementation (a mis-named import fails typecheck, so drift is caught mechanically). Weight is `regular` unless noted.

| Key | Phosphor | Key | Phosphor |
|---|---|---|---|
| category.farm | `Plant` | status.accepted | `CheckCircle` |
| category.maritime | `Anchor` | status.applied | `PaperPlaneTilt` |
| category.remote | `Laptop` | status.archived | `Archive` |
| category.seasonal | `Sun` | status.begins | `CalendarBlank` |
| category.mix | `Shuffle` | status.ends | `CalendarX` |
| benefit.housing | `House` | status.draft | `NotePencil` |
| benefit.meals | `ForkKnife` | status.boosted | `Rocket` |
| benefit.pay | `CurrencyDollar` | status.featured | `Star` |
| benefit.transport | `Van` | status.filled | `UsersThree` |
| benefit.wifi | `WifiHigh` | status.match | `Sparkle` |
| mappin.* (farm/maritime/remote/seasonal/mix) | `MapPin` (duotone, tinted) | status.offered | `Handshake` |
| mappin.location | `MapPin` | status.open | `CircleDashed` |
| mappin.cluster | `CirclesThree` (duotone) | status.partially_filled | `CircleHalf` |
| nav.seek | `Compass` | status.paused | `PauseCircle` |
| nav.swipe | `Cards` | status.seasonal | `Sun` |
| nav.map | `MapTrifold` | status.declined | `XCircle` |
| nav.saved | `BookmarkSimple` | status.withdrawn | `ArrowUUpLeft` |
| nav.messages | `ChatCircle` | profile.experience | `Briefcase` |
| nav.dashboard | `SquaresFour` | profile.resume | `ReadCvLogo` |
| nav.profile | `UserCircle` | profile.skills | `Wrench` |
| nav.admin | `ShieldStar` | profile.verification | `SealCheck` |
| nav.feed | `Newspaper` | trust.verified_host | `SealCheck` |
| nav.host | `Storefront` | trust.founding_host | `Medal` |
| nav.hosts | `Storefront` | trust.featured_employer | `Crown` |
| nav.logout | `SignOut` | analytics.donut | `ChartDonut` |
| nav.notifications | `Bell` | analytics.funnel | `Funnel` |
| nav.photos | `Image` | analytics.meter | `Gauge` |
| nav.reports | `Flag` | analytics.source | `TreeStructure` |
| nav.seekers | `UsersThree` | analytics.trend | `TrendUp` |
| nav.settings | `GearSix` | system.info | `Info` |
| nav.announcements | `Megaphone` | system.success | `CheckCircle` |
| nav.help | `Question` | system.warning | `Warning` |
| action.apply | `PaperPlaneTilt` | system.error | `XCircle` |
| action.back | `ArrowLeft` | system.lock | `Lock` |
| action.forward | `ArrowRight` | system.loading | `CircleNotch` |
| action.close | `X` | work.deckhand | `Anchor` |
| action.delete | `Trash` | work.harvest | `Basket` |
| action.download | `DownloadSimple` | work.hospitality | `Coffee` |
| action.edit | `PencilSimple` | work.kitchen | `CookingPot` |
| action.filter | `FunnelSimple` | work.ranch | `Horse` |
| action.link | `LinkSimple` | action.message | `ChatCircle` |
| action.more | `DotsThree` | action.report | `Flag` |
| action.save | `BookmarkSimple` | action.search | `MagnifyingGlass` |
| action.settings | `GearSix` | action.share | `ShareNetwork` |
| action.sort | `ArrowsDownUp` | action.upload | `UploadSimple` |
| action.view | `Eye` | | |

Any concept whose first-choice name doesn't exist in the installed package falls back to the closest sibling (caught at typecheck); the table is the intent, not a promise every string resolves.

## 6. Edge cases
- **currentColor / tinting:** preserved via `color` prop; `mappin.*` category colours still applied by callers.
- **Sizes:** `16 | 20 | 24` map directly to Phosphor `size`.
- **a11y:** `aria-hidden` icons emit no label; labelled icons use `title ?? entry.label`.
- **`system.loading`:** Phosphor `CircleNotch` is static; spin (if any) stays a CSS concern on the caller, honouring `prefers-reduced-motion` (matches existing convention — icons don't self-animate).
- **Dead nav components** (`SeekerBottomNav`/`HostBottomNav`, if still present on this branch) compile unchanged — they consume `<Icon>` and inherit the swap.

## 7. Verification
- `pnpm typecheck` (catches any bad Phosphor name), `pnpm lint`, clean `pnpm build`, `pnpm guardrails` (incl. updated G30).
- Grep proof: no remaining `dompurify`, `getIconUrl`, `cloudinaryId`, or `fetch(` in `packages/ui/src/icons`.
- Visual spot-check (public surfaces, no auth needed): home, `/seek`, a `/listing/[id]`, and the public bottom dock — confirm every icon slot renders a real glyph (no emoji/skeleton), correct sizes, and map-pin tints. Authed surfaces (seeker/host OS nav) spot-checked on a preview deploy.

## 8. Risks & rollback
- **Risk:** a chosen Phosphor name doesn't exist → typecheck fails at build; fix by picking the sibling. Low, mechanically caught.
- **Risk:** `optimizePackageImports` interaction with `@phosphor-icons/react` — validated by the production build's per-route First-Load-JS numbers not regressing.
- **Rollback:** revert the branch; the registry + `Icon.tsx` are the only load-bearing changes, and the Cloudinary assets remain in place, so reverting restores the old path intact.

## 9. Out of scope (follow-ups)
- Removing the now-unused Cloudinary icon assets (separate cleanup).
- Any per-surface icon-choice polish once the founder sees the set live.
