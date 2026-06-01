# Entitlements V1

> **DRAFT.** Entitlements are product capabilities, not one-off UI flags. Source: Canonical Enum Registry + Field-Level Billing Dictionary + Open Questions "Locked Decisions". Changing any entitlement mapping is founder-gated (P-ENT).

## Model

- **Boolean entitlements** = capability on/off (e.g. `analytics.advanced`).
- **Usage (metered) entitlements** = a counter with a limit and a reset interval (e.g. `listing.active`, `announcement.publish`).
- **Ledger entitlements** = an accumulating balance that rolls over (e.g. `invite.credit`).
- Entitlements are **granted by** a plan (subscription) or a one-time/recurring product (add-on).
- Every mutation route checks entitlements **server-side** (G14). UI-state-only checks are forbidden. RLS is defense-in-depth, not the entitlement check.

## Locked decisions reflected here

- Seekers are free forever; no seeker entitlement reads (G4).
- Pro and Enterprise get matching functionality; **Starter can view matched buckets but has 0 included invites**.
- **Invite credits roll over** (do not reset per cycle, do not expire).

## Entitlement keys

| Key | Kind | Granted by | Reset | Notes |
| --- | --- | --- | --- | --- |
| `listing.active` | usage | plan (1 / 5 / 10) + `addon_additional_listing` | none (concurrent cap) | concurrent active listings |
| `listing.create` | boolean | all plans | — | gated by `listing.active` cap |
| `listing.publish` | boolean | all plans | — | gated by publish checks |
| `listing.boost` | usage | `addon_boost_*` (one-time) | per purchase | exposure-only (G8) |
| `host.featured` | usage | `addon_featured_employer_*` | per purchase | surface=host (G21) |
| `match.view_buckets` | boolean | all plans (incl. Starter) | — | view matched buckets |
| `match.full` | boolean | Professional, Enterprise | — | full matching functionality (TODO(?) confirm exact split) |
| `candidate.invite` | boolean | gated by `invite.credit` balance | — | requires ≥ 1 credit |
| `analytics.basic` | boolean | all plans | — | |
| `analytics.advanced` | boolean | Enterprise | — | (TODO(?) Pro inclusion vs Open Question "Analytics") |
| `announcement.publish` | usage | Pro 1/mo, Ent 3/mo, `addon_community_announcement` | monthly (plan portion) | active_days=15 per announcement |
| `invite.credit` | ledger | Pro 5, Ent 10 (granted per cycle), `addon_invite_pack_*` | **none — rolls over, never expires** | consumed from `invite_credit_ledger` |
| `team.seat` | usage | Ent 1, `addon_team_seat` | none | Enterprise-only |
| `support.priority` | boolean | Enterprise `TODO(?)` | — | confirm support tiers in canon |

## Consumption & reset

- **Invite credits**: ledger-based. Plan-granted credits are added each cycle and **roll over** (accumulate); purchased pack credits also roll over and never expire. Decrement only on a successful invite send (idempotent per invite).
- **Announcements**: plan-included monthly allotment resets per billing cycle; purchased announcements add `active_days=15` each.
- **Boost / featured**: consumed per purchase, time-boxed by duration; do not roll over.

## Database mirror (later)

`entitlements`, `entitlement_grants`, `usage_counters`, `invite_credit_ledger` — conceptual only (see `data-mirror-erd-v1.md`); no migrations here. `EntitlementSnapshot` is the read model the host dashboard reads from (`GET /api/v1/host/billing`).

## UI surfaces that read entitlements

Host dashboard plan/entitlement strip, listing editor (boost/feature), invite tool (credits), team settings (seats), announcement composer, matched-buckets view. Seeker surfaces read **none** (G4).

## Founder gate

Adding/removing entitlement keys or changing grant mappings requires founder approval (P-ENT).
