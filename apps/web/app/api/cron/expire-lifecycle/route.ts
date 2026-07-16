import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";

import { sweepExpiredLifecycles } from "@explore-and-earn/db";

// Expiry depends on the current wall clock — never statically cached.
export const dynamic = "force-dynamic";

/**
 * Scheduled job — enforce the application/invite/offer lifecycle windows
 * (LIFECYCLE_EXPIRY_DAYS: application 30d, invite 14d, offer 7d).
 *
 * Rows whose expires_at (stamped by migration 067's triggers) has passed
 * transition to 'expired' via the service role; the 001 lifecycle triggers
 * stay the authoritative edge guard underneath. Rows with a NULL expires_at
 * are never touched, so running this cron before 067 is applied is a safe
 * no-op rather than a guess.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`. See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await sweepExpiredLifecycles();

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    applicationsExpired: result.applicationsExpired,
    offersExpired: result.offersExpired,
    invitesExpired: result.invitesExpired,
  });
}
