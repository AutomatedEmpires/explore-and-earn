# Integration baseline — 4 November 2026

This is the handoff for the next implementation agent. It is the source of truth for what is integrated, what is only preserved, and what to do next. Do not treat chat history as state.

## Product boundaries that stay

- Verticals: Maritime, Seasonal, Farm, Remote.
- Discovery modes: Seek, Swipe, Map. Seeker mobile tabs stay Seek / Swipe / Map / Profile.
- Seeker and host are separate experiences.
- Do not merge to `main` until an explicit integration decision. `main` is still documentation only.
- Do not activate live Stripe, change production Clerk, Supabase, Vercel, or DNS, or deploy publicly.
- Do not delete worktrees, branches, or `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-recovery-20261104`.

## What is integrated

| Branch | Role | HEAD at handoff |
|---|---|---|
| `main` | Docs only. No `src` tree. | `a5b407b` |
| `integrate/foundation-20261104` | Foundation core hardening (`feat/foundation` `9425e95`) merged onto Foundation screens (`feat/foundation-screens` `b47e2fe`). | `19dae34` |
| `integrate/sp2-20261104` | `feat/sp2` (`888205b`) merged onto that foundation baseline, then the combined-suite fixes below. | `9b86d38` plus this document |

`feat/foundation`, `feat/foundation-screens`, and `feat/sp2` were not moved. Original worktrees were not cleaned.

### Foundation reconciliation

Screens and core had diverged after `d60ef0e` (3 core commits, 10 screen commits). Conflicts were only test warmup comments versus route bindings. The screen bindings that assign `POST` were kept, and the core hardening was kept: placeholder-secret rejection, exact Supabase storage CSP origin, rate-limit module move, worker dead-letter alerts, open trust-check registry.

Operator threshold forms read an open threshold map. The form is a client component, so it does not import the settings module's runtime values (that pulled Postgres into the browser build).

The operator console's raw SQL against trust, identity, and media is an existing documented read model. `tests/lint/table-ownership.test.ts` allowlists those files. New cross-module SQL does not belong on that list.

`0000_init.sql` spends most of its time creating PostGIS. On this machine that can pass Vitest's 30s default and leave only the first migration committed. The full-migration test and the two-database isolation test use a 90s timeout.

### SP2 reconciliation

Lineage: the seven workstreams are already combined on `feat/sp2`. That branch does not contain the final foundation hardening or the screens. The integration branch starts at the foundation integration and merges `feat/sp2`. It does not replay the seven workstreams one by one.

Shared-file conflicts kept both sides: foundation security and the open check registry, plus SP2 billing, Mapbox CSP, job handlers, `reviewQueue`, and the six known check kinds registered through `registerCheckKind`. Business verification stays never auto-rejected (`rejectAtOrAbove` 1.01).

### Original 17 SP2 failures

Root causes, fixed without rewriting the assertions:

1. **Capacity fake.** `listings/slots.ts` and `orgs/invitations.ts` register real usage counters at import. The entitlements fake then ignored `setUsed`, so downgrades saw 0 listings and 1 seat. An explicit `setUsed` now wins. A registered counter still applies when the test has not set usage.
2. **Foreign keys.** After the locations and listings migrations, `member_assignments` and `organizations.primary_location_id` reference real rows. Tests that used bare ids now insert a location or listing through `seedLocation` / `seedListingRow`.
3. **Import cycle.** Identity loads orgs while the notifications barrel is still starting, so `defineType` is not ready at module scope. Org notification types register when a notice is sent and from `src/server/sp2-wiring.ts`. Do not register them with `queueMicrotask` during import.

## Checks

Recorded on this machine (Windows ARM64, Node 26, pnpm 12.16.1). No Clerk secret, publishable key, or Stripe secret is set in the local `.env.local`, so authenticated browser journeys and live billing were not run. Provider configuration was not changed.

Foundation (`integrate/foundation-20261104`):

- Lint, design-token check, and `pnpm typecheck` passed.
- Production `pnpm build` passed after the settings form stopped importing the server settings module (Next.js 16.4.5).
- Full unit suite on `19dae34`: 67 files passed, 699 tests passed, exit 0. An earlier run timed out once while opening two PostGIS databases; that test's limit is 90s.

SP2 (`integrate/sp2-20261104`):

- Lint, design-token check, and `pnpm typecheck` passed on the combined tree before the last notification-registration edit.
- The 17 previously failing tests passed in a focused rerun of those seven files (88 tests) after the fixture and fake fixes, and the host-page file passed after the import-cycle fix (18 tests).
- Full unit suite on `9b86d38`: 125 files passed, 1444 tests passed, exit 0. No uncaught errors.

SP2 production `pnpm build` at `e2a4af9` exited 0. That is a local build with the gitignored `.env.local`, not a live-provider check.

## What is not implemented

Placeholders in the screens branch are not finished product features. Seek, Swipe, and Map are not implemented. Many seeker and host destinations are still placeholders.

### SP3 — do not implement in this stabilization

`feat/sp3` is `2e58047`. It has contracts, Drizzle migrations `2000`–`2100`, module skeletons, and hooks. Domain entry points still throw `not implemented`, including `searchListings`, `getJobCards`, `mapPins`, dispositions, alerts, and landing/SEO helpers.

`feat/sp3` also replaces several SP2 module indexes with stubs. Do not merge `feat/sp3` onto `integrate/sp2-20261104`. Copy or cherry-pick only the discovery and landing additions onto the integrated SP2 tree.

Partial work, not a finished feature:

- `recovery/2026-11-04/ws-sp3-w1-projection` (`29f66d8`) — pay normalization, `src/lib/discovery/pay.ts`, projection touch, and `pay.test.ts`.
- `recovery/2026-11-04/ws-sp3-w5-patterns` (`fd6bed4`) — job card, icons, and pattern tests.

### SP4 — do not treat the conflict snapshot as a merge

`feat/sp4` (`e10feef`) is only the specs merge onto foundation. The worktree `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-sp4` still has the interrupted SP3 merge. 13 unmerged paths:

- `src/app/api/jobs/run/route.ts`
- `src/lib/env.test.ts`
- `src/lib/env.ts`
- `src/lib/security-headers.ts`
- `src/modules/jobs/index.ts`
- `src/modules/settings/registry.ts`
- `src/modules/settings/settings.test.ts`
- `src/modules/trust/checks.test.ts`
- `src/modules/trust/checks.ts`
- `src/modules/trust/index.ts`
- `src/modules/trust/types.ts`
- `src/server/api.ts`
- `src/server/job-handlers.ts`

`recovery/2026-11-04/feat-sp4` (`804e9c9`) preserves that working tree, including conflict markers. Leave the original worktree and that branch as archives.

Restart SP4 from `integrate/sp2-20261104` after SP3's real discovery modules exist. SP4 depends on SP3 and on the integrated foundation. Do not start resumes, profiles, or applications yet.

### SP5–SP8

Plans and designs are on `docs/subproject-specs` (`ae1b676`) and are included in the SP2 integration merge:

- `docs/superpowers/plans/2026-11-03-sp5-host-hiring.md`
- `docs/superpowers/plans/2026-11-03-sp6-paid-add-ons.md`
- `docs/superpowers/plans/2026-11-03-sp7-community.md`
- `docs/superpowers/plans/2026-11-03-sp8-trust-privacy-launch.md`

Matching design specs are beside them. No SP5–SP8 product implementation was started.

## Worktrees

Do not delete these.

| Path | Branch |
|---|---|
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn` | `feat/foundation` (original) |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-fnd` | `feat/foundation-screens` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-integrate` | `integrate/foundation-20261104` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-sp2` | `feat/sp2` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-sp2-integrate` | `integrate/sp2-20261104` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-sp3` | `feat/sp3` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-sp4` | `feat/sp4` plus the interrupted merge |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-specs` | `docs/subproject-specs` |
| `C:\Users\Cole0\AutomatedEmpires\Projects\explore-and-earn-recovery-20261104` | recovery archive, not a worktree |

`.env.local` in the integration worktrees is a local copy for builds. It is gitignored. It does not contain usable Clerk or Stripe keys.

## Next implementation order

1. Review and, only with an explicit decision, merge the foundation PR into `feat/foundation-screens`. Do not merge to `main`.
2. Review the SP2 PR. Re-run `pnpm lint`, `pnpm check:tokens`, `pnpm typecheck`, `pnpm test`, and `pnpm build` in `explore-and-earn-sp2-integrate`.
3. Host UI that SP2 does not have yet: listing builder, billing, team, and public host page screens. Sandbox providers only. No live billing. Before any founding checkout, replace `founding_30_forever`. The approved offer is FD-7: first 100 host organizations by signup, one discount, six-month clock starting at the first paid activation, annual Starter included with the other annual tiers.
4. SP3 discovery on top of `integrate/sp2-20261104`, using the recovery branches as notes, not as a merge.
5. Restart SP4 from that tree. Do not resume the interrupted merge.
6. Then SP5, SP6, SP7, SP8 in that dependency order.
