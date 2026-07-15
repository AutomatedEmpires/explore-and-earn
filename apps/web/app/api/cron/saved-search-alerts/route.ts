import { NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "../../../../lib/cronAuth";

import { runSavedSearchAlerts } from "@explore-and-earn/db";

import {
  drainDueDeliveries,
  enqueueScheduleDerived,
} from "../../../../services/notifications/dispatcher";

// Alert sweep must always run fresh (never statically cached).
export const dynamic = "force-dynamic";
// Scanning many saved searches can take a while; give it room.
export const maxDuration = 300;

/**
 * Scheduled job — notify seekers when new live listings match their saved
 * searches (the re-engagement flywheel).
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Delegates the sweep
 * to runSavedSearchAlerts(); delivery goes through the NOTIFICATION ENGINE
 * (schedule-derived saved_search_results intents: real ranked inventory,
 * idempotent per search×window, preferences/quiet hours/unsubscribe honored,
 * localized) instead of the legacy direct in-app insert.
 * See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const nowIso = new Date().toISOString();
    const result = await runSavedSearchAlerts(nowIso, async (batch) => {
      if (!batch.job.recipientClerkUserId) return;
      await enqueueScheduleDerived([
        {
          // One logical alert per saved search per watermark window.
          dedupBase: `saved_search␟${batch.job.savedSearchId}␟${batch.floorIso}`,
          intent: {
            sourceEventId: "",
            sourceOccurredAt: nowIso,
            recipientClerkUserId: batch.job.recipientClerkUserId,
            category: "matches",
            type: "saved_search_results",
            variant: "default",
            destinationPath: batch.queryString ? `/seek?${batch.queryString}` : "/seek",
            titleKey: "Notifications.types.saved_search_results.title",
            bodyKey: "Notifications.types.saved_search_results.body",
            values: { count: batch.newCount, searchLabel: batch.job.label },
            entity: { type: "saved_search", id: batch.job.savedSearchId },
            urgent: false,
          },
        },
      ]);
    });

    // Drain the freshly enqueued alerts in this run (batched until empty;
    // anything past the drain cap is picked up by the 5-min dispatch cron).
    const delivery = await drainDueDeliveries(Date.now());
    return NextResponse.json({ ok: true, ...result, delivery });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
