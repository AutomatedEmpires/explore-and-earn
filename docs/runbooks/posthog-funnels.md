# PostHog funnel instrumentation runbook

Owner: Lane D (data & observability).

Project: `exploreandearn` (id `291166`), org `AutomatedEmpires`, region
`us.posthog.com` / ingest `https://us.i.posthog.com`.

## 1. Current state (verified against the codebase)

- `posthog-js` is installed (`apps/web/package.json`) and the React provider is
  wired in `apps/web/app/providers.tsx` behind `NEXT_PUBLIC_POSTHOG_KEY` /
  `NEXT_PUBLIC_POSTHOG_HOST`.
- CSP already allowlists `https://us.posthog.com` (`next.config.ts`, `vercel.ts`).
- Consent opt-in/opt-out lives in `components/CookieBanner.tsx`.
- **The pre-billing host funnel is captured; nothing else is.** Commercial
  redesign D15 added the first product events in the codebase, and with them the
  capture seam every later event should use:
  - `apps/web/lib/analytics/events.ts` — the event-name constants. Add new names
    here, never as a literal at a call site.
  - `apps/web/lib/analytics/capture.ts` — `captureFunnelEvent(name, props)`.
    Dynamic-imports `posthog-js` (a static import welds ~200 kB into the first
    load of every route that captures), swallows every failure, and is a no-op
    when PostHog is unconfigured or the visitor has not consented.
  - `apps/web/components/analytics/FunnelEvents.tsx` — `CaptureOnMount`,
    `FunnelLink` and `FunnelSubmitButton`, so a **server** component can carry an
    event without becoming a client component.
  - Captured today: `host_plans_viewed`, `host_browse_first_selected`,
    `host_profile_created`, `host_listing_draft_started`,
    `host_activation_banner_clicked`, `host_checkout_started`.
- Every event in section 2 that is not in that list is still UNIMPLEMENTED.
- PostHog autocapture covers pageviews/clicks, but the funnel below needs
  explicit, stable event names to be reliable.

## 2. Canonical funnel events

Use snake_case event names and attach the listed properties. Group host events
by `host_profile_id` and seeker events by `seeker_profile_id` (never raw PII).

### Seeker activation funnel

| #   | Event                      | Trigger point                                | Key properties                              |
| --- | -------------------------- | -------------------------------------------- | ------------------------------------------- |
| 1   | `seeker_signup_completed`  | Clerk sign-up completes (post-auth callback) | `method`                                    |
| 2   | `seeker_profile_created`   | First successful seeker profile insert       | `seeker_profile_id`                         |
| 3   | `seeker_profile_completed` | `completion_score` crosses 80                | `seeker_profile_id`, `completion_score`     |
| 4   | `listing_viewed`           | Listing detail page view                     | `listing_id`, `category`                    |
| 5   | `application_submitted`    | `submitApplication` server action succeeds   | `listing_id`, `seeker_profile_id`, `source` |

### Host activation funnel

| #   | Event                   | Trigger point                         | Key properties                                       |
| --- | ----------------------- | ------------------------------------- | ---------------------------------------------------- |
| 1   | `host_signup_completed` | Clerk sign-up completes (host intent) | `method`                                             |
| 2   | `host_profile_created`  | First successful host profile insert  | `host_profile_id`                                    |
| 3   | `host_attested`         | `host_attestations` insert succeeds   | `host_profile_id`, `policy_version`                  |
| 4   | `listing_published`     | Listing `status` -> `live`            | `listing_id`, `category`                             |
| 5   | `invite_sent`           | `sendInvite` server action succeeds   | `listing_id`, `host_profile_id`, `seeker_profile_id` |
| 6   | `offer_accepted`        | Offer `status` -> `accepted`          | `listing_id`, `offer_id`                             |

### Engagement events

`listing_saved`, `conversation_started`, `message_sent`
(`message_sent` -> `messages` insert; carries `conversation_id`).

## 3. Where instrumentation must be wired (and current blockers)

| Event                                                 | Intended call site                           | Status                                          |
| ----------------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `application_submitted`                               | `apps/web/app/actions/applications.ts`       | **Blocked** — file owned by open PRs #173/#175. |
| `invite_sent`                                         | `apps/web/app/actions/invites.ts`            | **Blocked** — owned by #173/#175.               |
| `message_sent`                                        | `apps/web/app/actions/messages.ts`           | **Blocked** — owned by #173/#175.               |
| `*_signup_completed`                                  | Clerk webhook (`app/api/webhooks/clerk`)     | **Blocked** — owned by email PR #173.           |
| `listing_viewed`, `listing_published`, profile events | Lane C seeker/host client + route components | Out of Lane D scope (Lane C ownership).         |

Lane D deliberately does **not** edit those files while the listed PRs are open
(per the fallback-scope rule). Server-side events should be emitted with the
PostHog Node client using `POSTHOG_PROJECT_API_KEY`; client-side events reuse the
existing `posthog-js` provider. Recommended follow-up: once #172/#173/#175 land,
add a tiny `captureServer(event, distinctId, props)` helper and call it at the
success points above (failures must be swallowed so analytics never breaks a
user action).

## 4. Dashboard / funnel setup (PostHog UI)

1. **Funnel — Seeker activation:** steps 1→5 above, 14-day conversion window,
   breakdown by `category`.
2. **Funnel — Host activation:** steps 1→6 above, 30-day window.
3. **Trend — Core actions:** `application_submitted`, `invite_sent`,
   `offer_accepted`, `message_sent` (weekly).
4. **Retention:** returning on `listing_viewed` after `seeker_profile_created`.
5. Save all four to a **"North Star / Activation"** dashboard; restrict raw PII
   properties and rely on the grouped ids above.
