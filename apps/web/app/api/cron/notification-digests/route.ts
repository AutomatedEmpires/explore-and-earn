import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";
import { reportCronException } from "../../../../lib/cronReport";
import { drainDueDeliveries } from "../../../../services/notifications/dispatcher";
import {
  enqueueScheduledReminders,
  runDigests,
} from "../../../../services/notifications/digests";
import { resolveEngineStage } from "../../../../services/notifications/stage";

// Digest windows depend on the current wall clock — never statically cached.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Hourly digest + reminder job for the notification engine:
 *
 *   1. enqueue schedule-DERIVED reminders (offers/listings with a REAL
 *      imminent expires_at, résumé nudges for genuinely-incomplete résumés
 *      with a 14-day cooldown) — all re-checked against live state at send;
 *   2. send daily digests to recipients whose LOCAL morning this is
 *      (timezone-aware; runs hourly so every zone gets its own 08:00);
 *   3. send weekly digests on the recipient's local Monday morning;
 *   4. drive a delivery pass so the newly enqueued work goes out immediately.
 *
 * Idempotent per (recipient, cadence, window) and per reminder entity/window.
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const stage = resolveEngineStage();
    if (stage === "disabled") {
      // Clean, observable no-op — the engine is off (and its tables may not
      // exist yet); a disabled engine must never 500 the cron.
      return NextResponse.json({ ok: true, stage, skipped: true });
    }
    const nowMs = Date.now();
    const reminders = await enqueueScheduledReminders(nowMs);
    const daily = await runDigests("daily", nowMs);
    const weekly = await runDigests("weekly", nowMs);
    const delivery = await drainDueDeliveries(nowMs);
    return NextResponse.json({ ok: true, stage, reminders, daily, weekly, delivery });
  } catch (error) {
    reportCronException("notification-digests", error);
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
