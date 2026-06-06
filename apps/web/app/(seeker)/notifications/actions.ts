"use server";

import { auth } from "@clerk/nextjs/server";
import { markAllNotificationsRead } from "@explore-and-earn/db";
import { revalidatePath } from "next/cache";

/**
 * Mark every unread notification for the authed seeker as read, then refresh
 * the (seeker) layout so the SeekerHeader unread badge clears on next render.
 * Best-effort: silently no-ops when signed out (never throws into the client).
 */
export async function markAllNotificationsReadAction(): Promise<void> {
  const { userId, getToken } = await auth();
  if (!userId) {
    return;
  }
  const token = await getToken({ template: "supabase" });
  if (!token) {
    return;
  }

  const { ok } = await markAllNotificationsRead(token, userId);
  if (ok) {
    // The unread badge is resolved by the (seeker) layout that wraps this
    // route, so revalidate that layout to clear the badge after marking read.
    revalidatePath("/notifications", "layout");
  }
}
