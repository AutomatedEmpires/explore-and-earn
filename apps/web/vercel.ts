/**
 * Vercel project configuration (TypeScript form).
 *
 * Follows the @vercel/config "config export" pattern documented at
 * https://vercel.com/docs/project-configuration/vercel-ts
 *
 * NOTE: We intentionally use a plain `config` object literal instead of
 * importing `VercelConfig` / `routes` from `@vercel/config/v1`. Pulling that
 * package in here would require regenerating pnpm-lock.yaml (CI installs with a
 * frozen lockfile) and would add a dependency just for `tsc` typecheck. The
 * object shape below is exactly what Vercel reads. To adopt the typed helpers
 * later, run `pnpm add -D @vercel/config` and switch to `routes.header(...)`.
 *
 * Monorepo note: the Vercel project's Root Directory is `apps/web`, so the
 * build command steps up to the repo root before running the Turborepo build.
 */
// SINGLE SOURCE OF TRUTH NOTE (do not re-add headers here):
//   - Security headers (incl. the CSP) ship via `next.config.ts` → headers().
//     Next.js applies those on every response regardless of Vercel config, so
//     they are the live, authoritative source. A second copy here previously
//     drifted and never shipped (Vercel does not read vercel.ts without the
//     @vercel/config package), which was misleading — hence removed.
//   - Scheduled jobs (crons) ship via the committed `apps/web/vercel.json`,
//     which Vercel DOES read (project Root Directory = apps/web).
// This file is retained only to document the intended build command for a future
// migration to the typed @vercel/config form.
export const config = {
  buildCommand: "cd ../.. && pnpm build --filter=@explore-and-earn/web",
  framework: "nextjs",
};
