import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { adminClient } from "@explore-and-earn/db";

// Listing expiry sweep must always run fresh (never statically cached).
export const dynamic = "force-dynamic";

/**
 * Scheduled job — archive live listings whose expiry has passed.
 *
 * Auth: requires `Authorization: Bearer ${CRON_SECRET}`. Uses the service-role
 * admin client (RLS-bypassing) so the sweep covers every host's listings.
 * See docs/runbooks/cron-jobs.md.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization");
  if (!secret || provided !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const nowIso = new Date().toISOString();
  const db = adminClient() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("listings")
    .update({ status: "archived", archived_at: nowIso })
    .lt("expires_at", nowIso)
    .eq("status", "live")
    .select("id");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, archived: (data ?? []).length });
}
