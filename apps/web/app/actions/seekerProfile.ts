"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { saveSeekerProfile } from "@explore-and-earn/db";

const VALID_TIMELINES = new Set(["now", "1_month", "3_months", "6_months"]);

async function getSession(): Promise<{ userId: string; token: string } | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken({ template: "supabase" });
  if (!token) return null;
  return { userId, token };
}

/** Persist a new profile photo URL after a successful Supabase Storage upload. */
export async function saveProfilePhotoAction(
  photoUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const result = await saveSeekerProfile(session.token, session.userId, { profilePhotoUrl: photoUrl });
  if (result.ok) {
    revalidatePath("/profile");
    revalidatePath("/profile/edit");
  }
  return result;
}

/** Persist a new hero cover URL after a successful Supabase Storage upload. */
export async function saveHeroCoverAction(
  coverUrl: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const result = await saveSeekerProfile(session.token, session.userId, { heroCoverUrl: coverUrl });
  if (result.ok) revalidatePath("/seek");
  return result;
}

/** Persist the seeker's readiness / seeking timeline. */
export async function saveReadinessAction(
  timeline: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!VALID_TIMELINES.has(timeline)) return { ok: false, error: "invalid_timeline" };
  const session = await getSession();
  if (!session) return { ok: false, error: "unauthenticated" };
  const result = await saveSeekerProfile(session.token, session.userId, { seekingTimeline: timeline });
  if (result.ok) revalidatePath("/seek");
  return result;
}
