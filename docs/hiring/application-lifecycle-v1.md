# Application Lifecycle V1

> DRAFT — architecture only. States and transitions are canonical ("Lifecycle Registry", "Canonical Enum Registry", "Application, Invite & Offer State Machines", "Application & Host Review Pipelines"). Do not invent statuses.

## Canonical states (Enum Registry: `ApplicationStatus`)

`applied`, `reviewing`, `saved_by_host`, `offered`, `accepted`, `active`, `completed`, `not_selected`, `withdrawn`, `expired`.

## Canonical happy path (Lifecycle Registry)

`applied → reviewing → saved_by_host → offered → accepted → active → completed`

Terminals: `not_selected`, `withdrawn`, `expired`.

## Expiry

- **Auto-expire after 30 days** if still in `applied` / `reviewing` / `saved_by_host` (canon). Auto-expiry is a system lifecycle transition, **not** an automated hiring/rejection decision.

## Language rules (canon)

- Do **not** use the term "shortlisted". The canonical host-save state is `saved_by_host`.
- `viewed` is **metadata** (`viewedAt` / `firstViewedAt` / `lastViewedAt` / `viewedBy`), **not** a lifecycle state.
- Applications (seeker-initiated) and invites (host-initiated) are **separate objects**.

## State visibility separation (Mission Q7)

| Layer | Example |
| --- | --- |
| Seeker-visible | applied, under review, saved, offered, accepted, active, completed, not selected, withdrawn, expired |
| Host-visible | full lifecycle + viewed/saved metadata + match band |
| Internal | event history, responsiveness inputs, refresh bookkeeping |
| Event history | `application_*` events (see analytics doc) |

## Transitions

All transitions MUST be validated against `packages/contracts/lifecycles.ts` via `assert_lifecycle_transition()` (guardrail G16) and use enum values imported from contracts (G13) — no string literals in implementation. Transition table is canonical; this doc does not redefine it.

## Not implemented here

No transition execution, no DB writes, no auto-selection. Type-only `ApplicationState` lives in `packages/contracts/src/applications.ts`.
