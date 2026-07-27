/**
 * Route path constants shared between a route handler and its tests.
 *
 * These live here rather than in the route module itself because a Next.js
 * route file may only export the fields Next recognises — the HTTP verbs plus
 * a fixed set of segment config keys (`runtime`, `dynamic`, `revalidate`, …).
 * Any other named export fails the production build with
 * "<NAME> is not a valid Route export field", and `tsc -b` cannot see it:
 * the contract is generated into .next/types during `next build`, so the error
 * only appears there. That is exactly how it reached CI once already.
 */

/** Sentry tag + test assertion target for the Stripe webhook receiver. */
export const STRIPE_WEBHOOK_ROUTE = "/api/webhooks/stripe";
