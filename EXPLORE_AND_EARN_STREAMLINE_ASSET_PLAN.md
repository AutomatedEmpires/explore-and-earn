# Explore&Earn — Streamline HQ Asset Plan

> Generated: 2026-06-05 | Agent: Claude Code (Sonnet 4.6)

---

## 1. Streamline Access Findings

| Item | Finding |
|------|---------|
| Account | jackson@automatedempires.com |
| Subscription | **Streamline Full Access** ($59/mo) — purchased 2026-05-31 |
| Icon set | **Streamline Freehand** (~11,171 assets, 24px grid, varying stroke) |
| License | Royalty-free, no attribution required, commercial use OK |
| Standard license cap | **~100 distinct icons per project** |
| Extended Vector License | Available if >100 icons needed — founder gate A-ICON-LICENSE |
| Formats | SVG (preferred for UI), PNG/PDF (email/print only) |
| VS Code extension | Available in VS Code marketplace (search "Streamline") |
| Figma plugin | Available in Figma Community (search "Streamline") |
| Streamline API | Available with Full Access subscription |

Source: `docs/design/icon-system.md`, Notion "Icon & Element System — Streamline Freehand (Locked)", Notion "Icon & Illustration Manifest — V1".

---

## 2. Critical License Rule

> **This repo is PUBLIC on GitHub.**

Do NOT commit paid/proprietary Streamline `.svg`/`.png`/`.pdf` asset files to this repo. The license covers use inside the product, not redistribution of the asset set.

The safe strategy (already implemented in the repo):
- Commit only the **icon registry** with stable names + emoji placeholders
- Wire real glyphs locally via VS Code extension / Figma plugin / official API
- Never use scripted bulk export (violates Streamline's Fair Use Policy)
- Keep the icon registry under the 100-distinct-icon cap

---

## 3. What Already Exists in the Repo

### packages/ui/src/icons/ — Complete Registry

All 9 icon domains are registered (~60 canonical icon keys):

| Domain | Keys | Example names |
|--------|------|---------------|
| `category.*` | 5 | farm, maritime, remote, seasonal, mix |
| `benefit.*` | 5 | housing, meals, pay, transport, wifi |
| `mappin.*` | 6 | farm, maritime, remote, seasonal, mix, cluster |
| `trust.*` | 3 | verified_host, founding_host, featured_employer |
| `status.*` | 5 | open, partially_filled, filled, boosted, match |
| `action.*` | 12 | apply, save, share, report, message, filter, sort, back, forward, close, more, location |
| `nav.*` | 8 | seek, swipe, map, saved, messages, dashboard, profile, admin |
| `analytics.*` | 5 | meter, funnel, trend, donut, source |
| `system.*` | 6 | info, success, warning, error, lock, loading |

**Total: ~60 keys — well under the 100-icon cap**

Concept map in `docs/design/streamline-freehand-map.md` maps each registry name to a Streamline Freehand candidate concept.

Current state: all icons render as emoji placeholders via `<Icon name="domain.name" />`. Real SVG glyphs need to be wired locally (not committed to public repo).

---

## 4. Proposed First Icon Pull (20 Icons)

These cover the highest-visibility product surfaces. The order is: Discovery Card → nav → actions → categories.

### Priority 1 — Discovery Card (must-have for any demo)

| # | Registry name | Streamline candidate |
|---|--------------|---------------------|
| 1 | `benefit.housing` | home / cabin / house |
| 2 | `benefit.meals` | fork-knife / food |
| 3 | `benefit.pay` | dollar / money / coin |
| 4 | `trust.verified_host` | check-badge / verification-badge |
| 5 | `status.open` | circle-outline / open-circle |

### Priority 2 — Seeker Bottom Nav

| # | Registry name | Streamline candidate |
|---|--------------|---------------------|
| 6 | `nav.swipe` | swipe / hand / cards |
| 7 | `nav.map` | map / location |
| 8 | `nav.seek` | search / discover / compass |
| 9 | `nav.profile` | person / user |

### Priority 3 — Seeker Actions

| # | Registry name | Streamline candidate |
|---|--------------|---------------------|
| 10 | `action.save` | heart |
| 11 | `action.apply` | paper-plane / send / arrow-right |
| 12 | `action.message` | chat / speech-bubble |

### Priority 4 — Category Chips

| # | Registry name | Streamline candidate |
|---|--------------|---------------------|
| 13 | `category.farm` | barn / wheat / basket |
| 14 | `category.maritime` | anchor / boat |
| 15 | `category.remote` | laptop / desk |
| 16 | `category.seasonal` | leaf / mountain / sun |

### Priority 5 — Host Dashboard

| # | Registry name | Streamline candidate |
|---|--------------|---------------------|
| 17 | `nav.dashboard` | grid / squares |
| 18 | `nav.messages` | chat-bubble |
| 19 | `status.match` | target / spark |
| 20 | `action.filter` | sliders / funnel |

---

## 5. Proposed Repo Structure

### Already in repo (committed, safe — no asset files)
```
packages/ui/src/icons/
  Icon.tsx                         ← <Icon name="domain.name" /> wrapper
  registry.ts                      ← Full 9-domain registry with emoji placeholders
  index.ts                         ← Public exports

docs/design/streamline-freehand-map.md   ← registry name → Streamline concept
docs/design/icon-system.md               ← governance + license rules
```

### Recommended additions (committed docs)
```
docs/DESIGN_ASSET_POLICY.md              ← Asset handling policy (license rules, gitignore strategy)
docs/STREAMLINE_ICON_REGISTRY.md         ← First-pull registry with exact Streamline icon names
```

### Gitignored local asset cache (NEVER committed)
```
.streamline/                       ← Add to .gitignore
  benefit.housing.svg              ← Local only — wired at dev time
  benefit.meals.svg
  ...
```

The `Icon.tsx` component should load from `.streamline/` when `STREAMLINE_LOCAL_ASSETS=1` env var is set (local dev only), falling back to emoji placeholders otherwise (CI + production).

---

## 6. Open Questions for Jackson

| # | Question | Why it matters |
|---|----------|---------------|
| 1 | Confirm Freehand is still the brand direction? | Lock confirmation before wiring real glyphs |
| 2 | ~~Inline SVG vs external SVG file references — DECIDED~~ | **Decided 2026-06-05: inline SVG components.** Inline `<svg>` inherits `currentColor` from semantic tokens, zero extra HTTP requests, correct for the token-driven design system. VS Code extension is the wiring tool. |
| 3 | Which 5 icons should land first? (Recommendation: Priority 1 — triad + verified_host + status.open) | Sequencing |
| 4 | Can paid assets live in a private CI asset cache (separate from public repo)? | Opens more automation options for team builds |
| 5 | Attribution required anywhere? (Full Access says no — just confirm) | License compliance |
| 6 | ~~Which tool for first pull — DECIDED~~ | **Decided 2026-06-05: VS Code extension.** Jackson will use the Streamline VS Code extension to search/select/export each icon one at a time into `.streamline/`. |
| 7 | Should icon count be tracked automatically in CI guardrails? | License governance (stay under 100-cap) |

---

## 7. Recommended First Icon PR

**Branch:** `design/icon-local-glyph-wiring-v1`

**Scope:**
1. Add `STREAMLINE_LOCAL_ASSETS` env var support to `Icon.tsx` (load from `.streamline/` in local builds)
2. Add `.streamline/` to `.gitignore`
3. Add `docs/DESIGN_ASSET_POLICY.md` + `docs/STREAMLINE_ICON_REGISTRY.md`
4. Wire the 5 Priority 1 icons locally (no committed SVG files)
5. Verify Discovery Card renders with real glyphs in local dev

**NOT in this PR:** No committed SVG files, no bulk export, max 5 glyphs wired.

**Founder gate:** Add a row to `docs/source-of-truth/founder-approval-queue.md` for the gitignored local asset cache strategy before merging. Gate: `asset-license`.

---

## 8. Icon Count Tracker

| Domain | Registry keys | Target V1 (Notion manifest) |
|--------|--------------|---------------------------|
| category | 5 | 5 |
| benefit | 5 | 5 |
| mappin | 6 | 6 |
| trust | 3 | 3 |
| status | 5 | 5 |
| action | 12 | 12+ |
| nav | 8 | 8 |
| analytics | 5 | 5+ |
| system | 6 | 6 |
| additional illustration | 0 | ~22 (Notion manifest notes leaf/tent/map/mailbox/backpack/signpost/plug/cloud etc.) |
| **Total** | **~55** | **~72–77** |

V1 target of 72–77 stays comfortably under the 100-icon cap. Extended Vector License not needed for V1.
