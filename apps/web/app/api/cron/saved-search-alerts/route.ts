import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";

import { runSavedSearchAlerts } from "@explore-and-earn/db";

// Alert sweep must always run fresh (never statically cached).
export const dynamic = "force-dynamic";
// Scanning many saved searches can take a while; give it room.
export const maxDuration = 300;

/**
 * Scheduled job — notify seekers when new live listings match their saved
 * searches (the re-engagement flywheel).
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Uses the service-role
 * admin client (RLS-bypassing) so the sweep covers every seeker's saved
 * searches and can write their notifications. Delegates to runSavedSearchAlerts().
 * See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSavedSearchAlerts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
