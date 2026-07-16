# Notification Engine — Staged Activation Runbook

> Founder control surface for turning on the Lifecycle & Engagement
> Notification Engine (migration 065, founder charter 2026-07-14). No secret
> values appear here — only names, locations, and steps.

The engine is **event → taxonomy → delivery ledger → channel adapters**
(in-app / email / push), driven inline by server actions (`after(triggerDispatch)`)
plus two crons. Every stage transition below is one Vercel env change + redeploy;
every stage is reversible by setting the variable back.

## The activation ladder

`NOTIFICATION_ENGINE_STAGE` (Vercel production env):

| Stage | What runs | What users see | Ledger |
| --- | --- | --- | --- |
| *(unset)* / `disabled` | Nothing. Dispatch passes are clean no-ops with no table access — safe **before migration 065 is applied**. | Nothing | Untouched |
| `ledger_only` | Expansion + full phase-2 pipeline (staleness recheck, consent recheck, collapse), then every would-send settles `suppressed` (`stage:ledger_only`). | Nothing (in-app included) | Full fidelity |
| `dry_run` | ledger_only + one structured `[notifications:dry_run]` log line per would-send (channel/type/recipient id — no copy, no addresses). | Nothing | Full fidelity |
| `internal_preview` | Real delivery on **all channels**, only for Clerk ids in `NOTIFICATION_INTERNAL_ALLOWLIST`; everyone else suppressed (`stage:internal_preview`). | Allowlisted users only | Full |
| `limited` | Allowlist + a deterministic `NOTIFICATION_LIMITED_PERCENT` % of recipients (stable per-user cohort — no flapping between retries). | Cohort | Full |
| `enabled` | Everything, everyone. | All users | Full |

Unset/invalid values resolve **`disabled` in production** (fail-closed) and
`enabled` in dev/test (local email already no-ops without `RESEND_API_KEY`).

Digest windows are consumed **only** for stage-allowed recipients — gated
recipients' digest memberships stay queued, so raising the stage later
delivers without losing windows. Digests do not run at all below
`internal_preview` (they only email).

## Prerequisites per rung

| Before setting… | Required |
| --- | --- |
| `ledger_only` | Migration **065 applied** (Gate B ledger repair → db-migrate pipeline green). Nothing else. |
| `dry_run` | Same as ledger_only. |
| `internal_preview` | `NOTIFICATION_INTERNAL_ALLOWLIST` set (founder + team Clerk ids); `NOTIFICATION_SIGNING_SECRET` set (else engine email ships without unsubscribe links — deliverability/CAN-SPAM hazard); `RESEND_WEBHOOK_SECRET` set + Resend webhook pointed at `/api/webhooks/resend` (bounces/complaints → suppressions); Resend domain verified (Gate C). For push previews: the three `VAPID_*` vars (else push deliveries settle `failed_terminal`, email/in-app unaffected). |
| `limited` | All of the above + `NOTIFICATION_LIMITED_PERCENT` (start 5–10). Review `/admin/notifications` for dead-letter/suppression anomalies from the preview stage first. |
| `enabled` | Clean limited run: no unexplained dead_letters, bounce rate normal, digest sends verified. |

## Verification per rung

- **ledger_only / dry_run**: trigger a real action (apply to a listing on prod),
  then check `/admin/notifications` — the delivery rows must appear as
  `suppressed` with the stage reason. Cron responses (`/api/cron/notification-dispatch`)
  now report `stage` in their JSON.
- **internal_preview**: allowlisted account performs apply/withdraw/message →
  real in-app rows + email arrive; one-click unsubscribe works (POST from the
  email client); a NON-allowlisted account's rows settle `stage:internal_preview`.
- **limited**: watch delivered-vs-suppressed proportions in the admin summary;
  bounce/complaint suppressions should stay near zero.

## Rollback

Set `NOTIFICATION_ENGINE_STAGE` back down (or remove it) + redeploy. Suppressed
rows are terminal per delivery (they are **not** retro-sent when the stage
rises later — only new events deliver); queued digests resume where they left off.

## Environment inventory (locations, not values)

| Var | Purpose | Where |
| --- | --- | --- |
| `NOTIFICATION_ENGINE_STAGE` | The ladder above | Vercel prod (founder) |
| `NOTIFICATION_INTERNAL_ALLOWLIST` | preview/limited real-delivery Clerk ids | Vercel prod |
| `NOTIFICATION_LIMITED_PERCENT` | limited-stage cohort size | Vercel prod |
| `NOTIFICATION_SIGNING_SECRET` | HMAC for unsubscribe tokens (falls back to `CRON_SECRET`) | Vercel prod + Doppler `prd` |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` / `RESEND_REPLY_TO_EMAIL` | Email transport | Already provisioned |
| `RESEND_WEBHOOK_SECRET` | Svix verify for bounce/complaint webhook (503 fail-closed without it) | Vercel prod |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web-push channel | Vercel prod (generate with `npx web-push generate-vapid-keys`) |
| `CRON_SECRET` | Bearer auth on all cron routes | Already provisioned |

## Moving parts

- Crons (`apps/web/vercel.json`): `notification-dispatch` (*/5 min sweeper),
  `notification-digests` (hourly: reminders + timezone-aware digests + drain).
  Both are constant-time Bearer-authenticated and stage-aware.
- Provider idempotency: engine email sends carry a Resend `Idempotency-Key`
  (sha-256 of the delivery dedup key), closing the crash-between-send-and-settle
  duplicate window across serverless instances.
- Ops surface: `/admin/notifications` — queue/status summary, recent + dead-letter
  deliveries, suppressions, digest queue, push-subscription health; requeue
  (dead_letter/failed_terminal → pending) and cancel (pending/deferred →
  cancelled) actions. Admin-gated via `ADMIN_CLERK_USER_ID`; no secrets shown;
  no bulk-send capability exists on this surface by design.
