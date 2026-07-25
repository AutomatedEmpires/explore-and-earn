import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";
import { reportCronException, reportCronFailure } from "../../../../lib/cronReport";

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
    reportCronFailure("expire-listings", result.error ?? "expireListings reported ok:false");
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  // Also reconcile stale sourced inventory (never presents a weeks-old sourced
  // posting as current). Still best-effort — a sourcing fault must not fail the
  // primary expiry sweep — but no longer SILENT.
  //
  // This exact swallow hid a real outage: 064's CHECK omitted 'stale', the very
  // status this sweep writes, so it failed on every invocation for weeks while
  // the route kept answering ok:true and sourcedClosed:0. A permanent failure
  // was indistinguishable from "nothing to close", which is precisely why
  // stale sourced listings would have stayed live indefinitely.
  const sourced = await sweepStaleSourcedListings().catch((error: unknown) => {
    reportCronException("expire-listings", error);
    return { ok: false as const, closed: 0, ids: [] as string[], threw: true };
  });

  if (!sourced.ok) {
    if (!("threw" in sourced)) {
      reportCronFailure(
        "expire-listings",
        "sweepStaleSourcedListings reported ok:false (sourced inventory not reconciled)",
      );
    }
    // The primary sweep DID succeed, so this is a 200 — but the body must not
    // claim overall success, and a caller must be able to tell "nothing was
    // stale" apart from "the sweep is broken". Both were `sourcedClosed: 0`.
    return NextResponse.json({
      ok: false,
      archived: result.archived,
      sourcedClosed: 0,
      sourcedSweepFailed: true,
    });
  }

  return NextResponse.json({
    ok: true,
    archived: result.archived,
    sourcedClosed: sourced.closed,
  });
}
