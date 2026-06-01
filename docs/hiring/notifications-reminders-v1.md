# Notifications & Reminders V1 (events only)

> DRAFT — architecture only. NO sending (email/SMS/push) is implemented. **Reminder schedule + per-event routing LOCKED 2026-05-31** (ADR-0001 §9; `REMINDER_SCHEDULE_V1`). **Sending stays deferred** to an approved Notification build pack. Canonical routing from the Event Taxonomy / Notification Routing canon.

This defines **which events may produce a notification** and their routing metadata. It does not send anything.

## Notification events (matching/hiring)

| Event | Recipient | Priority (canon enum) | Category (canon enum) | Channel(s) | Reminder schedule |
| --- | --- | --- | --- | --- | --- |
| `invite_sent` | seeker | important | invites | in_app, email | none |
| `invite_expires_soon` | seeker | important | invites | in_app, email | **T-3 and T-1 days** |
| `invite_expired` | host, seeker | informational | invites | in_app | none |
| `offer_sent` | seeker | critical | offers | in_app, email | none |
| `offer_expires_soon` | seeker | critical | offers | in_app, email | **T-3 and T-1 days** |
| `offer_accepted` | host | important | offers | in_app, email | none |
| `offer_declined` | host | informational | offers | in_app | none |
| `application_viewed_by_host` | seeker | informational | applications | in_app | none |
| `host_message_received` | seeker/host | important | community | in_app, email | none |
| `profile_incomplete` | seeker | informational | verification | in_app | **weekly digest, max 1/week** |

Priority / Category / Channel values come from the Canonical Enum Registry (`NotificationPriority`, `NotificationCategory`, `NotificationChannel`). The per-event mapping above is **locked for V1** and must respect suppression/digest rules (G18).

## Reminder rules (LOCKED — ADR-0001 §9)

- Each `*_expires_soon` fires at **T-3 days** and **T-1 day** before `expiresAt`.
- Global caps: **max 2 reminders per object**; never same-day duplicates; honor G18 suppression/digest and G20 default-off risky-surface flags.
- Rationale: two spaced nudges plus a final-day beat reduce silent expiries without nagging — over-reminding erodes marketplace trust.

## Rules

- **Events only** in this pack — no provider integration (Resend etc.) until a Notification build pack is approved (guardrail G9-proposed).
- Reminder **sending** is gated even though the **policy** is locked.
- No notification may leak protected attributes or raw private content (IDs/refs only).

## Not implemented here

No sending, no scheduling. Event names align with `../analytics/matching-hiring-events-v1.md` and `packages/contracts/src/matching-events.ts`; locked schedule in `packages/contracts/src/matching-config.ts`.
