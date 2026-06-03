# Seeker Phase A Audit

Date: 2026-06-03

Scope:
- `apps/web/app/(seeker)/**`
- `apps/web/components/seeker/**`

Commands run:
- `pnpm -w typecheck`
- `pnpm -w lint`
- `pnpm --filter @explore-and-earn/web build`
- `pnpm -w run guardrails`
- `find apps/web/app -maxdepth 4 \( -path 'apps/web/app/(seeker)/*' -o -path 'apps/web/app/*seeker*' \) -type f | sort`
- `find apps/web/components -maxdepth 4 -type f | sort | grep '/seeker/' || true`

Result summary:
- The scoped seeker lane is not implemented in source on this checkout.
- `apps/web/app/(seeker)/` contains only a placeholder README.
- `apps/web/components/seeker/` does not exist.
- The web app still builds cleanly because only `/` and `/_not-found` are emitted.

## PASS / FAIL

| Check | Status | Evidence | Suggested fix |
| --- | --- | --- | --- |
| Build / type / lint / guardrails | PASS | `pnpm -w typecheck`, `pnpm -w lint`, `pnpm --filter @explore-and-earn/web build`, and `pnpm -w run guardrails` all passed. The route scaffold remains intentionally placeholder-only in `apps/web/app/README.md:3`, `apps/web/app/README.md:15`. | None. Keep these checks green while seeker surfaces remain gated. |
| Token resolution | FAIL | No seeker page or component source exists to verify token consumption. The seeker route group is still a TODO in `apps/web/app/(seeker)/README.md:3`. | Implement the seeker surface only after the gated contracts/permissions/dashboard surfaces are approved, then audit token usage on the real components. |
| Frozen foundation usage | PASS | No seeker-local component tree exists under `apps/web/components/`. This does not violate the app-local component rule in `apps/web/components/README.md:3`. Existing feed mapping outside scope already points to the canonical card in `apps/web/components/discovery/listing.ts:24`. | None within scope. When seeker components are added, prefer `packages/ui` primitives first. |
| Icons | FAIL | No seeker implementation exists to verify canonical icon keys. The canonical category mapping that should be reused lives outside scope in `apps/web/components/discovery/listing.ts:62`. | Reuse canonical icon registry keys when seeker components are introduced; do not add a seeker-local icon set. |
| Canon / copy / field labels | FAIL | No seeker UI exists to verify canonical labels. The current canon-bearing fixtures outside scope lock the taxonomy and verified-host copy in `apps/web/lib/fixtures/listings.ts:6`, `apps/web/lib/fixtures/listings.ts:14`, and `apps/web/lib/fixtures/types.ts:36`. | When seeker surfaces land, bind them to the same canonical fixture/contract vocabulary instead of inventing seeker-local copy. |
| Nav lock | PASS | No seeker route or component source exists to own bottom navigation. The route group is still scaffold-only in `apps/web/app/(seeker)/README.md:3`. | None within scope. Preserve shell-owned navigation when the lane is implemented. |
| Lane boundaries | PASS | The app router is explicitly placeholder-only in `apps/web/app/README.md:3`, and app-local components remain gated by `apps/web/components/README.md:3`. There is no scoped seeker code crossing into other lanes. | None within scope. Keep lane-specific code isolated when implementation starts. |
| Link integrity | FAIL | The seeker route group has no route files beyond `apps/web/app/(seeker)/README.md:1`, and the build emitted only `/` and `/_not-found`. | Add real seeker routes only when the approvals named in `apps/web/app/(seeker)/README.md:3` are satisfied, or update the audit scope if PR #45 moved the work elsewhere. |
| A11y / semantics | FAIL | There are no seeker pages or components to audit for landmarks, headings, focus order, or control semantics. | Run an accessibility audit after real seeker pages/components exist; current scope is non-auditable because it is still placeholder-only. |

## Minimal patch / diff

No product-code patch was applied.

Rationale:
- The scoped seeker source is absent, so creating seeker routes or components here would be feature work, not a defect fix.
- The only accurate minimal diff for this audit is this report artifact on the requested review branch.

## Blocking finding

The primary defect after PR #45 is not a token, icon, or accessibility regression inside the seeker lane. It is that the seeker lane is still scaffold-only in the scoped source tree, so most requested checks are currently non-auditable and fail by absence rather than by bad implementation.