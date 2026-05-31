# Streamline Freehand — Concept Map

Maps Explore&Earn product concepts to **stable registry names** and candidate **Streamline Freehand** glyph concepts. Coding agents wire registry names to placeholder components now; the real Streamline glyphs are connected locally later (never committed to this public repo — see [`icon-system.md`](./icon-system.md)).

> `registry name` is canonical and **must not change** once referenced by components. The Streamline concept column is a hint for whoever selects the final glyph.

## Benefits (HOUSING / MEALS / PAY triad)

| Registry name | Concept | Streamline Freehand candidate |
| --- | --- | --- |
| `benefit.housing` | Where will I sleep? | home / cabin / house |
| `benefit.meals` | What will I eat? | fork-knife / food / meal |
| `benefit.pay` | What will I earn? | dollar / money / compensation |
| `benefit.transport` | Transport provided | bus / car / road |
| `benefit.wifi` | Connectivity | wifi / signal |

## Categories

| Registry name | Streamline Freehand candidate |
| --- | --- |
| `category.farm` | barn / wheat / basket / greenhouse |
| `category.maritime` | anchor / boat / rope |
| `category.remote` | laptop / desk / cabin |
| `category.seasonal` | leaf / sun / mountain |
| `category.mix` | compass / map |

## Trust & status

| Registry name | Concept | Streamline Freehand candidate |
| --- | --- | --- |
| `trust.verified_host` | Verified Host (self-declared, mandatory) | check-badge / verification |
| `trust.founding_host` | Founding Host program | seal / ribbon |
| `trust.featured_employer` | Featured Employer | star |
| `status.match` | Match relevance | target / spark |
| `status.boosted` | Paid exposure (premium, not spammy) | ring / glow / arrow-up |
| `status.open` / `partially_filled` / `filled` | Listing fill | circle / half-circle / full-circle |

## Actions

| Registry name | Concept | Streamline Freehand candidate |
| --- | --- | --- |
| `action.apply` | Quick Apply | arrow / send / paper-plane |
| `action.save` | Save | heart |
| `action.share` | Share | share / export |
| `action.report` | Report/flag | flag |
| `action.message` | Messages | chat / speech-bubble |
| `action.filter` / `action.sort` | Filter / sort | sliders / arrows |
| `action.back` / `forward` / `close` / `more` | Nav controls | chevrons / x / ellipsis |

## Map pins & navigation

| Registry name | Concept | Streamline Freehand candidate |
| --- | --- | --- |
| `mappin.{category}` | Category-tinted pins | map-pin variants |
| `mappin.cluster` | Cluster | stacked pins / number badge |
| `nav.seek` / `swipe` / `map` / `saved` / `messages` / `dashboard` / `profile` / `admin` | Bottom-nav + dashboard | per concept |
| `action.location` (alias `nav.map`) | Tap location → map view | map-pin / navigation |

## Analytics & system

| Registry name | Streamline Freehand candidate |
| --- | --- |
| `analytics.meter` / `funnel` / `trend` / `donut` / `source` | gauge / funnel / line / donut / bars |
| `system.info` / `success` / `warning` / `error` / `lock` / `loading` | i / check / triangle / x-octagon / padlock / spinner |

## Rules for editing this map

1. Add new concepts as new rows — never repurpose an existing registry name.
2. Keep names `{domain}.{name}`, lowercase, snake within name.
3. If a needed concept is missing, add it here first, then reference it in code.
