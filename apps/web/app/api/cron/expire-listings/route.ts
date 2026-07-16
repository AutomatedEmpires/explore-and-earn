import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";

import { expireListings, sweepStaleSourcedListings } from "@explore-and-earn/db";

// Listing expiry sweep must always run fresh (never statically cached).
export const dynamic = "force-dynamic";

/**
 * Scheduled job — archive live listings whose expiry has passed.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Uses the service-role
 * admin client (RLS-bypassing) so the sweep covers every host's listings.
 * Delegates to `expireListings()` in the lifecycle engine, which validates the
 * live → archived transition before writing.
 * See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await expireListings();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  // Also reconcile stale sourced inventory (never presents a weeks-old sourced
  // posting as current). Best-effort — a sourcing-sweep fault must not fail the
  // primary expiry sweep; it degrades to closed:0 (e.g. pre-064).
  const sourced = await sweepStaleSourcedListings().catch(() => ({
    ok: false as const,
    closed: 0,
    ids: [] as string[],
  }));

  return NextResponse.json({
    ok: true,
    archived: result.archived,
    sourcedClosed: sourced.closed,
  });
}
