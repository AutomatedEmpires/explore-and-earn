# Host scope (`(host)`)

Route group for the **host** user type — the side that posts opportunities and
reviews applicants. Routes live under the `/host` URL prefix (route groups do
not affect the URL), so they never collide with the seeker scope.

Navigation is **scoped per user type** (founder canon): there is no global
bottom nav. The host bottom nav (Dashboard · Listings · Applicants · Messages ·
Profile) is owned by this lane and wired in `layout.tsx` via `<HostBottomNav>`.

## Status

UI-complete and hardened. Every surface renders from local fixtures; there is
**no backend**. Matching, hiring decisions, persistence, and payments are
founder-gated and intentionally not implemented here (tracked by issues 46, 47,
and 48).

## Routes

| URL | Surface |
| --- | --- |
| `/host` | Dashboard — derived stats, listing previews, new applicants |
| `/host/listings` | Listings management — status filter with live counts |
| `/host/listings/new` | Create listing (inert, UI-only form) |
| `/host/listings/[id]` | Listing detail |
| `/host/listings/[id]/edit` | Edit listing (inert, UI-only form) |
| `/host/applicants` | Applicant pipeline board — grouped by stage |
| `/host/applicants/[id]` | Applicant detail |
| `/host/messages` | Message threads — grouped Unread / Read with counts |
| `/host/messages/[id]` | Message thread |
| `/host/profile` | Host profile |
| `/host/profile/edit` | Edit profile (inert, UI-only form) |

## Resilience

- `error.tsx` — scope error boundary with a recovery action.
- `not-found.tsx` — scope 404 that routes back to the dashboard.
- `loading.tsx` (detail routes) — skeleton placeholders via `HostDetailSkeleton`
  so navigation never flashes a blank screen.
- `layout.tsx` — host-scoped page metadata (title template + description).

## Build log (UI phases)

- **A** — scope shell: layout, header, bottom nav, dashboard.
- **B** — listing detail + create/edit listing forms.
- **C** — applicant detail + message thread.
- **D** — host profile + profile edit.
- **E** — applicant pipeline board (grouped by stage).
- **F** — listings management view (client-side status filter).
- **G** — messages grouped Unread / Read with counts.
- **H** — production hardening (error boundary + not-found + metadata).
- **I** — detail-route loading skeletons + this README.

## Conventions

- Components live in `apps/web/components/host` and are exported from its
  `index.ts`. Data lives in `models.ts` (types + pure derivations) and
  `fixtures.ts` (sample data). Counts and stats are **derived, never
  hardcoded** (`deriveHostStats`, `countByStage`, `countListingsByState`).
- Forms are uncontrolled and inert (no submit handlers); boards and filters are
  read-only / presentational. No stage mutation or hiring-decision logic.
- Styling uses **semantic tokens only** and **canonical icon keys** only; the
  frozen design-system foundation (`packages/ui`, `packages/contracts`,
  `styles/tokens.css`, `styles/primitives.css`) is never edited from this lane.
- Dynamic routes use `generateStaticParams` and `await params`, calling
  `notFound()` for unknown ids (static-export friendly).
