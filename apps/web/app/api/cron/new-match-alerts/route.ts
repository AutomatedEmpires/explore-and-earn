import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";

import { runNewMatchAlerts } from "../../../../services/matching/newMatchAlerts";

// Alert sweep must always run fresh (never statically cached).
export const dynamic = "force-dynamic";
// Scoring listings against the active-seeker pool can take a while.
export const maxDuration = 300;

/**
 * Scheduled job — notify seekers when a newly-published listing is a STRONG
 * match for them (ADR-040 engine). The fit-based complement to
 * saved-search-alerts (filter-based).
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Service-role
 * (RLS-bypassing) so it can score across the seeker pool and write notifications.
 * Delegates to runNewMatchAlerts(). See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNewMatchAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
