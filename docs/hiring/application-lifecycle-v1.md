# Application Lifecycle V1

> DRAFT — architecture only. States and transitions are canonical ("Lifecycle Registry", "Canonical Enum Registry", "Application, Invite & Offer State Machines", "Application & Host Review Pipelines"). Do not invent statuses.

## Canonical states (Enum Registry: `ApplicationStatus`)

`applied`, `reviewing`, `saved_by_host`, `offered`, `accepted`, `active`, `completed`, `not_selected`, `withdrawn`, `expired`.

## State diagram

```mermaid
stateDiagram-v2
	[*] --> applied
	applied --> reviewing
	reviewing --> saved_by_host
	saved_by_host --> offered
	offered --> accepted
	accepted --> active
	active --> completed
	completed --> [*]

	applied --> withdrawn
	reviewing --> withdrawn
	saved_by_host --> withdrawn
	offered --> withdrawn

	reviewing --> not_selected
	saved_by_host --> not_selected
	offered --> not_selected

	applied --> expired
	reviewing --> expired
	saved_by_host --> expired

	withdrawn --> [*]
	not_selected --> [*]
	expired --> [*]
```

> Adjacency beyond the canonical happy path + the auto-expire/withdraw/not-selected branches above is **TODO(?)** — confirm against the State Transition Tables canon before implementation.

## Expiry

- **Auto-expire after 30 days** if still in `applied` / `reviewing` / `saved_by_host` (canon). Auto-expiry is a system lifecycle transition, **not** an automated hiring/rejection decision.

## Language rules (canon)

- Do **not** use the term "shortlisted". The canonical host-save state is `saved_by_host`.
- `viewed` is **metadata** (`viewedAt` / `firstViewedAt` / `lastViewedAt` / `viewedBy`), **not** a lifecycle state.
- Applications (seeker-initiated) and invites (host-initiated) are **separate objects**.

## State visibility separation (Mission Q7)

| Canonical state | Seeker-visible label | Host-visible | Internal/event |
| --- | --- | --- | --- |
| applied | Applied | Applied + viewed metadata | `application_submitted` |
| reviewing | Under review | Reviewing | `application_status_changed` |
| saved_by_host | Saved | Saved (NOT "shortlisted") | `application_status_changed` |
| offered | Offer sent | Offered | offer events |
| accepted | Accepted | Accepted | `application_accepted` |
| active | Active | Active | `application_status_changed` |
| completed | Completed | Completed | `application_completed` |
| not_selected | Not selected | Not selected | `application_not_selected` |
| withdrawn | Withdrawn | Withdrawn | `application_withdrawn` |
| expired | Expired | Expired | `application_expired` |

## Transitions

All transitions MUST be validated against `packages/contracts/lifecycles.ts` via `assert_lifecycle_transition()` (guardrail G16) and use enum values imported from contracts (G13) — no string literals in implementation. The type-level adjacency in `packages/contracts/src/applications.ts` mirrors canon for editor support; `lifecycles.ts` remains the runtime authority.

## Not implemented here

No transition execution, no DB writes, no auto-selection. Type-only `ApplicationState` lives in `packages/contracts/src/applications.ts`.
