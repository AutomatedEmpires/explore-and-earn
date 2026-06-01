# Notifications & Reminders V1 (events only)

> DRAFT — architecture only. NO sending (email/SMS/push) is implemented. Automated reminders are a founder approval gate. Canonical routing from the Event Taxonomy / Notification Routing canon and the Notification Trigger Matrix (superseded version noted in canon).

This defines **which events may produce a notification** and their routing metadata. It does not send anything.

## Notification events (matching/hiring)

| Event | Recipient | Priority (canon enum) | Category (canon enum) | Channel(s) | Reminder? |
| --- | --- | --- | --- | --- | --- |
| `invite_sent` | seeker | important | invites | in_app, email | no |
| `invite_expires_soon` | seeker | important | invites | in_app, email | yes (T-3, T-1 — TODO?) |
| `invite_expired` | host, seeker | informational | invites | in_app | no |
| `offer_sent` | seeker | critical | offers | in_app, email | no |
| `offer_expires_soon` | seeker | critical | offers | in_app, email | yes (TODO?) |
| `offer_accepted` | host | important | offers | in_app, email | no |
| `offer_declined` | host | informational | offers | in_app | no |
| `application_viewed_by_host` | seeker | informational | applications | in_app | no |
| `host_message_received` | seeker/host | important | community | in_app, email | no |
| `profile_incomplete` | seeker | informational | verification | in_app | yes (digest — TODO?) |

Priority / Category / Channel values come from the Canonical Enum Registry (`NotificationPriority`, `NotificationCategory`, `NotificationChannel`). Exact priority/category per event is **TODO(?)** pending the Notification routing canon and must respect suppression/digest rules (G18).

## Rules

- **Events only** in this pack — no provider integration (Resend etc.) until a Notification build pack is approved (guardrail).
- Reminders (any `*_expires_soon`) are a **founder approval gate** (automated reminders).
- Suppression and digesting follow G18; risky surfaces stay behind default-off flags (G20).
- No notification may leak protected attributes or raw private content.

## Not implemented here

No sending, no scheduling. Event names align with `../analytics/matching-hiring-events-v1.md` and `packages/contracts/src/matching-events.ts`.
