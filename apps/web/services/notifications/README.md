# services/notifications

> DRAFT — architecture only. NO sending (email/SMS/push) is implemented in this pack. See `docs/analytics/matching-hiring-events-v1.md`.

## Role

Define notification events and routing for matching/hiring. Event taxonomy only until a dedicated notification build pack is approved.

## Allowed imports

- `@explore-and-earn/contracts` (matching-events; enums for `NotificationChannel` / `NotificationCategory` / `NotificationPriority`)

## Forbidden imports

- email/SMS/push providers (Resend, etc.) until notification build pack approved
- matching internals / scoring

## Related contracts

`matching-events.ts`

## Future API routes (deferred)

- notification event intake / routing

## Founder gates

Automated reminders (e.g., invite/offer expires-soon) · any actual sending · suppression/digest policy (G18).
