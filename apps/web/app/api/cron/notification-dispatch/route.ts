import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";
import { runDispatchOnce } from "../../../../services/notifications/dispatcher";

// The dispatcher must always run fresh (never statically cached).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Scheduled sweeper for the Lifecycle & Engagement Notification Engine.
 *
 * Server actions already trigger a dispatch pass inline (via next/server
 * `after()`), so this cron is the SAFETY NET: it expands any events those
 * passes missed (crashes, deploy gaps, cron-produced events) and drives
 * retries/deferred deliveries (backoff, quiet-hours resumes). Idempotent and
 * concurrency-safe end to end — overlapping runs cannot double-deliver
 * (dedup_key + SKIP LOCKED lease claiming).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDispatchOnce();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
