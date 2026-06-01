# Matching Service Boundaries

> DRAFT — architecture only. Defines roles and import boundaries for the matching/hiring services. Enforced by guardrails (G8 + proposed). No service logic implemented.

## Services

### `apps/web/services/matching`
- **Role**: compute & serve `MatchResult` (score/confidence/reasons), staleness, candidate pools. Assistive ranking inputs only.
- **Allowed imports**: `packages/contracts` (matching, applications, hiring types), `packages/db` read models (future), profile/listing read models.
- **Forbidden imports**: `pricing`/`entitlements`/`boost`/`featured` (G8); any protected-signal source; external AI APIs; notification senders.
- **Related contracts**: `matching.ts`, `applications.ts`, `hiring.ts`, `responsiveness.ts`, `matching-events.ts`.
- **Future API routes** (deferred): ranked pool read, match explanation read, recompute trigger (internal).
- **Founder gates**: weights, AI use, production deploy, inactivity penalty.

### `apps/web/services/discovery`
- **Role**: seeker-facing discovery & placement; may apply **boost/featured placement** (NOT score).
- **Allowed imports**: `packages/contracts`, matching read outputs, pricing/boost (placement only).
- **Forbidden imports**: writing into match score; protected signals.
- **Related contracts**: `matching.ts`, `matching-events.ts`.
- **Future API routes**: discovery feed, recommended opportunities.
- **Founder gates**: ranking logic that mixes placement + score.

### `apps/web/services/notifications`
- **Role**: define notification events/routing; NO sending in this pack.
- **Allowed imports**: `packages/contracts` (matching-events, enums for `NotificationChannel`/`Category`/`Priority`).
- **Forbidden imports**: email/SMS/push providers (until notification build pack); matching internals.
- **Related contracts**: `matching-events.ts`.
- **Future API routes**: event intake (deferred).
- **Founder gates**: automated reminders, any sending.

### `apps/web/services/moderation`
- **Role**: trust/safety concerns that can cap or hide a match (canon hard modifier).
- **Allowed imports**: `packages/contracts`, moderation read models.
- **Forbidden imports**: protected-attribute inference; auto-decision over hiring.
- **Related contracts**: `matching.ts` (concern → cap/hide), `hiring.ts`.
- **Future API routes**: concern lookup (deferred).
- **Founder gates**: any signal that hides candidates.

## Import rule summary

matching → (contracts, read models) only. discovery may use boost for placement. Nothing writes monetization into score. Nothing imports protected signals. Notifications/moderation cannot make hiring decisions.
