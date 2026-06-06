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
export const config = {
  buildCommand: "cd ../.. && pnpm build --filter=@explore-and-earn/web",
  framework: "nextjs",
  headers: [
    {
      // Baseline security headers applied to every route.
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        {
          key: "Permissions-Policy",
          value: "camera=(), microphone=(), geolocation=(self)",
        },
      ],
    },
    {
      // Long-lived caching for fonts served from /public/fonts.
      source: "/fonts/(.*)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
    {
      // Long-lived caching for fingerprinted static assets.
      source:
        "/(.*)\\.(js|css|woff|woff2|ttf|otf|eot|svg|png|jpg|jpeg|gif|webp|avif|ico)",
      headers: [
        { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
      ],
    },
  ],
};
