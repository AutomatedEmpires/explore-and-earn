# Events & Observability — V1 (DRAFT, review-only)

> Maps the canon **Canonical Event Registry** to emit points, analytics/audit routing, and the **data-retention map (G28)**. Planning only; no instrumentation is wired here. Agents must not invent event names — additions go to the registry first.

## 1. Event taxonomy (verified against registry)
The registry locks ~180 snake_case, past-tense events across 16 domains: discovery, listing/host, application, invite, offer, matching, messaging, scheduling, travel plan, billing/subscription, refund/service-credit, verification, moderation/report, media, community, notification, demo, and internal build-governance.

### Routing rule of thumb
| Event class | Sink | Why |
|---|---|---|
| Product/discovery (`*_impression`, `*_loaded`, `*_opened`) | Analytics (PostHog) + `analytics_events` | high-volume funnel + retention analysis |
| Lifecycle (`*_submitted`, `*_accepted`, `*_published`) | `analytics_events` + drives notifications | state transitions users care about |
| Trust/billing/moderation (`refund_*`, `verification_*`, `moderation_*`) | `audit_log_entries` (in-txn, G15) + analytics | compliance + dispute reconstruction |
| Internal governance (`schema_drift_detected`, `ci_guardrail_failed`, `adr_violation_detected`) | CI logs + alert channel | build integrity, never user-facing |

## 2. Emit-point discipline
- Each Route Contract row names the exact events its handler must emit; CI can later diff route handlers against the registry to catch drift.
- `listing_impression` / `boosted_listing_impression` are emitted by discovery surfaces only and must distinguish boosted vs organic so boost-share targets (15–25%) can be measured against the canon Discovery formula.
- `match_generated` / `match_marked_stale` / `match_refreshed` are emitted by the matching service; they carry NO monetization fields (consistent with DR-B14 / G8).

## 3. Observability stack (proposed, founder-confirmable)
- **Product analytics:** PostHog, keyed off the canonical event names (1:1, no synonyms).
- **Error/perf:** Sentry on web + API routes; release-tagged; PII scrubbed before send.
- **Audit:** first-class Postgres `audit_log_entries`, never a log-only sink, so it is queryable for disputes and retained 7yr (G28).
- TODO(founder?): confirm PostHog + Sentry as the V1 vendors, or substitute. Treated as a proposal, not a lock.

## 4. Data-retention map (G28 source of truth, cents-of-truth for time windows)
| Data class | Window | Action at expiry |
|---|---|---|
| Analytics events | 24 months | purge |
| Messages | account-life + 90 days | purge |
| Soft-deleted rows | 30 days | hard delete |
| Audit / moderation | 7 years | retain |
| Travel attachments | 90 days post-completion | purge |
| Financial records | 7 years | retain |
A scheduled `runRetentionSweep()` enforces the map; CI asserts every PII-bearing table appears in `packages/contracts/retention.ts` (G28). PII scrub on retention pairs with the soft/hard-delete policy (DR-B4).

## 5. Notification governance hook (G18)
`notifications.send()` is the only fan-out path; it consults `notification_preferences` + `notification_suppression_rules`, honors quiet hours, and always delivers critical priority in-app. Notification events (`notification_created/delivered/read/dismissed/suppressed/digest_sent`) instrument that path.
