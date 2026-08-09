"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { saveSeekerProfile } from "@explore-and-earn/db";
import { normalizeTimeline, type Timeline } from "../../lib/readiness";
import { reportError } from "../../lib/sentry";

async function getSession(): Promise<{ userId: string; token: string } | null> {
  const { userId, getToken } = await auth();
  if (!userId) return null;
  const token = await getToken();
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
export type SaveReadinessResult =
  | { readonly ok: true; readonly timeline: Timeline }
  | {
      readonly ok: false;
      readonly error:
        | "invalid_timeline"
        | "unauthenticated"
        | "temporarily_unavailable";
    };

export async function saveReadinessAction(
  value: unknown,
): Promise<SaveReadinessResult> {
  const timeline = normalizeTimeline(value);
  if (timeline === null) return { ok: false, error: "invalid_timeline" };

  let session: Awaited<ReturnType<typeof getSession>>;
  try {
    session = await getSession();
  } catch (error) {
    reportError(error, { action: "saveReadinessAction.authenticate" });
    return { ok: false, error: "temporarily_unavailable" };
  }

  if (!session) return { ok: false, error: "unauthenticated" };

  try {
    const result = await saveSeekerProfile(session.token, session.userId, {
      seekingTimeline: timeline,
    });
    if (!result.ok) {
      reportError(
        new Error(
          result.error || "Readiness persistence was not confirmed",
        ),
        {
          action: "saveReadinessAction.persist",
          userId: session.userId,
        },
      );
      return { ok: false, error: "temporarily_unavailable" };
    }
  } catch (error) {
    reportError(error, {
      action: "saveReadinessAction.persist",
      userId: session.userId,
    });
    return { ok: false, error: "temporarily_unavailable" };
  }

  for (const path of ["/home", "/profile", "/resume"] as const) {
    try {
      revalidatePath(path);
    } catch (error) {
      // Persistence is already durable. Cache freshness cannot turn this into
      // a false failure, and every path gets an independent best-effort retry.
      reportError(error, {
        action: "saveReadinessAction.postPersistRevalidate",
        route: path,
        userId: session.userId,
      });
    }
  }

  return { ok: true, timeline };
}
