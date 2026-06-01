# Entitlements V1

> **DRAFT.** Entitlements are product capabilities, not one-off UI flags. Source: Canonical Enum Registry + Field-Level Billing Dictionary. Changing any entitlement mapping is founder-gated.

## Model

- **Boolean entitlements** = capability on/off (e.g. `analytics.advanced`).
- **Usage (metered) entitlements** = a counter with a limit and a reset interval (e.g. `listing.active`, `invite.credit`).
- Entitlements are **granted by** a plan (subscription) or a one-time/recurring product (add-on).
- Every mutation route must check entitlements **server-side** (G14). UI-state-only checks are forbidden.

## Entitlement keys (proposed; confirm against canon — `TODO(?)` where uncertain)

| Key | Kind | Granted by | Reset | Notes |
| --- | --- | --- | --- | --- |
| `listing.active` | usage | plan (1/5/10) + `addon_additional_listing` | none (concurrent cap) | concurrent active listings |
| `listing.create` | boolean | all plans | — | gated by `listing.active` cap |
| `listing.publish` | boolean | all plans | — | |
| `listing.boost` | usage | `addon_boost_*` (one-time) | per purchase | exposure-only (G8) |
| `host.featured` | usage | `addon_featured_employer_*` | per purchase | surface=host (G21) |
| `analytics.basic` | boolean | all plans | — | |
| `analytics.advanced` | boolean | Enterprise | — | |
| `announcement.publish` | usage | Pro 1/mo, Ent 3/mo, `addon_community_announcement` | monthly (plan portion) | active_days=15 |
| `invite.credit` | usage | Pro 5, Ent 10, `addon_invite_pack_*` | none (ledger) | non-refundable purchases |
| `team.seat` | usage | Ent 1, `addon_team_seat` | none | Enterprise-only |
| `support.priority` | boolean | Enterprise `TODO(?)` | — | confirm support tiers in canon |

## Consumption & reset

- **Invite credits**: ledger-based (`InviteCreditLedger`); decrement on successful invite send; plan-granted credits reset per cycle, purchased credits never expire unless canon says otherwise (`TODO(?)`).
- **Announcements**: plan-included monthly allotment resets per billing cycle; purchased announcements add active_days=15 each.
- **Boost / featured**: consumed per purchase, time-boxed by duration; do not roll over.

## Database mirror (later)

`entitlements`, `entitlement_grants`, `usage_counters`, `invite_credit_ledger` — conceptual only; no migrations here. `EntitlementSnapshot` is the read model UI reads from.

## UI surfaces that read entitlements

Host dashboard (listing limits, analytics depth), listing editor (boost/feature), invite tool (credits), team settings (seats), announcement composer. Seeker surfaces read **none** (G4: no seeker paywall).

## Founder gate

Adding/removing entitlement keys or changing grant mappings requires founder approval.
