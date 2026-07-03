"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import {
  takeModerationAction,
  type ModerationActionKind,
  type ModerationSubjectType,
} from "@explore-and-earn/db";

import { isAdminUserId } from "../../lib/admin";
import { reportError } from "../../lib/sentry";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Service role key is read server-side only and handed to the db layer. Server
 * actions are independently invocable endpoints, so this one RE-VERIFIES the
 * caller is an admin before touching the service-role client (defense in depth
 * on top of the (admin) layout gate and Clerk middleware). It also captures the
 * acting moderator's Clerk user id from auth() so every moderation_actions row is
 * stamped with WHO acted — never trusting a client-supplied id.
 */
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Input the client passes; the moderator id is derived server-side from auth(). */
export interface ModerationActionInput {
  readonly reportId?: string | null;
  readonly subjectType: ModerationSubjectType;
  readonly subjectId: string;
  readonly action: ModerationActionKind;
  readonly rationale?: string | null;
}

async function takeModerationActionImpl(
  input: ModerationActionInput,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!isAdminUserId(userId)) {
    return { ok: false, error: "forbidden" };
  }
  // Narrowed by isAdminUserId above (it only returns true for a string id).
  const moderatorClerkUserId = userId as string;

  if (!input.subjectId) return { ok: false, error: "Missing subject id." };

  const result = await takeModerationAction(SERVICE_ROLE_KEY, {
    reportId: input.reportId ?? null,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    action: input.action,
    moderatorClerkUserId,
    rationale: input.rationale ?? null,
  });
  if (!result.ok) return result;

  // Repaint the workbench and the overview (its queue counts shift).
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true };
}

export async function takeModerationActionAction(
  input: ModerationActionInput,
): Promise<ActionResult> {
  try {
    return await takeModerationActionImpl(input);
  } catch (error) {
    reportError(error, { action: "takeModerationActionAction" });
    throw error;
  }
}
