# Sentry Alert Rules — Explore & Earn

This runbook lists the **5 alerts** to configure for the `explore-and-earn` web
app. Create each in **Sentry → Alerts → Create Alert**, scope it to the Explore
& Earn web project, and send notifications to the preferred channel
(email / Slack).

## Where the telemetry comes from

- **Error boundaries** (`app/**/error.tsx`) call `reportError(error, { route })`
  (`lib/sentry.ts`), tagging each event with `route`.
- **Server actions** (`app/actions/**`) wrap their body and call
  `reportError(error, { action, userId })` on genuine (thrown) exceptions, then
  rethrow — so each exception is tagged with `action` and attributed to a user.
- **Tracing** is enabled at `tracesSampleRate: 0.05` on both server
  (`instrumentation.ts`) and client (`instrumentation-client.ts`); the client
  also captures session replay on errors (`replaysOnErrorSampleRate: 0.1`).
- `environment` and `release` (`NEXT_PUBLIC_APP_VERSION`) are set at init.

All capture no-ops when the DSN is unset, so non-production stays quiet.

---

## 1. New issue at `fatal` level — immediate notify

- **Type:** Issue alert
- **When:** a new issue is created
- **If:** `level` equals `fatal` AND `environment` equals `production`
- **Then:** notify immediately (page / high priority)
- **Why:** fatal crashes (including unrecoverable RSC errors via
  `onRequestError`) must never wait for an aggregate threshold.

## 2. Error-rate spike — >10/min on any issue — notify

- **Type:** Issue alert (frequency)
- **When:** an issue is seen **more than 10 times in 1 minute**
- **If:** `environment` equals `production`
- **Then:** notify
- **Why:** a single issue crossing 10/min signals an active incident (bad
  deploy, downstream outage) rather than background noise.

## 3. P95 server response > 3s — notify

- **Type:** Metric alert on **Transaction Duration**
- **Filter:** `environment:production` (optionally `transaction.op:server.action`
  to focus on server actions)
- **Aggregate:** `p95(transaction.duration)`
- **Threshold:** critical when p95 **> 3s** over a 5-minute window
- **Group by:** `transaction` to see which route/action is slow
- **Why:** slow responses degrade apply / invite / message flows; p95 captures
  the tail latency users actually feel.

## 4. `unhandledRejection` in any server action — immediate notify

- **Type:** Issue alert
- **When:** a new event matches
- **If:** `mechanism:unhandledrejection` (or search `unhandledRejection`) AND
  tag `action` **is set** AND `environment:production`
- **Then:** notify immediately
- **Why:** an unhandled promise rejection inside a server action is always a
  real fault; the `action` tag (set by the action wrapper) pinpoints which one.

## 5. Any new production issue, first seen < 24h — notify

- **Type:** Issue alert
- **When:** a new issue is created
- **If:** `environment` equals `production` (and `age:-24h` / "first seen" within
  the last 24h)
- **Then:** notify
- **Why:** a regression catch-all so freshly introduced issues surface within a
  day even if they never trip the rate or latency thresholds.

---

## Supporting setup

- **Per-action error rate:** dashboard widget on `transaction.op:server.action`
  grouped by `transaction`, charting `failure_rate()` and `count()`. The
  `action` tag separates per-action signal.
- **Release health:** set `NEXT_PUBLIC_APP_VERSION` per deploy so `release` is
  populated and "new in latest release" regression alerts work.
- **Environments:** ensure `VERCEL_ENV` maps to `production` / `preview` so
  alerts can be scoped to production only.

## Note on the metrics API

The earlier `Sentry.metrics.increment(...)` counter approach is **not available**
— the Sentry Metrics beta was removed in `@sentry/nextjs` v9+ (this app runs
v10). Per-action throughput and error rate come from the `server.action`
transaction spans and the `action` tag instead, which drive alerts 3 and 4 and
the per-action dashboard widget above.
