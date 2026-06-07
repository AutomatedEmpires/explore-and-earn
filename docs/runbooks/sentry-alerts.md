# Sentry Alert Rules — Explore & Earn

This runbook documents the Sentry alerts to configure for the `explore-and-earn`
web app. Set these up in **Sentry → Alerts → Create Alert**, scoped to the
Explore & Earn web project, and route notifications to the preferred channel
(email/Slack).

## Where the telemetry comes from

- **Error boundaries** (`app/**/error.tsx`) — each `Sentry.captureException` is
  tagged with `route` and carries the Next.js error `digest` in `extra`.
- **Server actions** (`app/actions/**`) — every action runs inside the
  `runAction()` wrapper (`lib/sentry.ts`), which opens a `server.action`
  transaction span named after the action and tags captured exceptions with
  `action` (plus `action_error` for handled `{ ok:false }` failures).
- **`reportError()`** — attaches `environment`, `app_version`, and the Clerk
  `user.id` when available.

All capture is a no-op when `SENTRY_DSN` is unset, so non-production
environments stay quiet.

## 1. Error-rate spike (any issue)

- **Type:** Issue alert (Number of errors)
- **Condition:** an issue is seen **more than 10 times in 1 minute**
- **Filter:** `environment` equals `production`
- **Action:** notify immediately (high priority)
- **Why:** a single issue crossing 10 errors/min signals an active incident
  (bad deploy, downstream outage) rather than background noise.

## 2. P95 server-action latency > 2s

- **Type:** Metric alert on **Transaction Duration**
- **Filter:** `transaction.op:server.action` and `environment:production`
- **Aggregate:** `p95(transaction.duration)`
- **Threshold:** warning at **1.5s**, critical at **2s** over a 5-minute window
- **Group by:** `transaction` (the action name) to see which action is slow
- **Why:** slow server actions degrade apply/invite/message flows; p95 captures
  the tail latency users actually feel.

## 3. New `fatal`-level issue

- **Type:** Issue alert
- **Condition:** **a new issue is created**
- **Filter:** `level:fatal` and `environment:production`
- **Action:** notify immediately (page / high priority)
- **Why:** fatal events (crashes, unrecoverable RSC errors surfaced via
  `onRequestError`) should not wait for an aggregate spike threshold.

## Supporting setup

- **Per-action error rate:** build a dashboard widget on
  `transaction.op:server.action` grouped by `transaction`, charting
  `failure_rate()` and `count()`. The `action` / `action_error` tags let you
  separate unexpected throws from handled business failures.
- **Release health:** set `NEXT_PUBLIC_APP_VERSION` per deploy so `release` is
  populated; this enables "new in latest release" regression alerts.
- **Environments:** ensure `VERCEL_ENV` maps to `production` / `preview` so
  alerts can be scoped to production only.

## Note on the metrics API

The original spec referenced `Sentry.metrics.increment('action.<name>.called' /
'.error')`. The Sentry **Metrics beta was removed in `@sentry/nextjs` v9+**
(this app runs v10), so that API is unavailable and would fail typechecking.
Equivalent per-action throughput and error rate are derived from the
`server.action` transaction spans and the `action` / `action_error` tags above,
which power the same dashboards and alerts.
