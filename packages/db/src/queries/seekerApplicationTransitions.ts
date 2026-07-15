import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { authedClient } from "../client";

export type SeekerApplicationTransitionIntent =
  | "withdraw"
  | "accept_offer"
  | "decline_offer";

export interface SeekerApplicationTransitionResult {
  readonly ok: boolean;
  readonly error?: string;
}

interface TransitionRpcPayload {
  readonly ok?: unknown;
  readonly error?: unknown;
}

/**
 * Invoke the ownership-checking application transition RPC from migration 058.
 *
 * The RPC returns an explicit JSON outcome. Treat a null/malformed response as
 * failure so PostgREST/RLS can never turn a zero-row mutation into false success.
 */
export async function transitionSeekerApplication(
  clerkToken: string,
  applicationId: string,
  intent: SeekerApplicationTransitionIntent,
): Promise<SeekerApplicationTransitionResult> {
  const untyped = authedClient(clerkToken) as unknown as SupabaseClient;
  const { data, error } = await untyped.rpc("seeker_transition_application", {
    p_application_id: applicationId,
    p_intent: intent,
  });

  if (error) {
    return { ok: false, error: error.message || "transition_failed" };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: "transition_failed" };
  }

  const payload = data as TransitionRpcPayload;
  if (payload.ok === true) {
    return { ok: true };
  }
  if (payload.ok === false) {
    return {
      ok: false,
      error:
        typeof payload.error === "string" && payload.error.length > 0
          ? payload.error
          : "transition_failed",
    };
  }

  return { ok: false, error: "transition_failed" };
}
