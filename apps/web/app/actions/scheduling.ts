"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

import {
  cancelSchedulingRequest,
  proposeHostSchedulingRequest,
  resolveHostSchedulingRequest,
  respondToSchedulingRequest,
  type SchedulingMutationResult,
} from "@explore-and-earn/db";
import {
  MEETING_TYPE,
  type MeetingType,
} from "@explore-and-earn/contracts";

import { checkRateLimitDistributed } from "../../lib/rateLimit";
import { reportError } from "../../lib/sentry";
import { isValidTimeZone } from "../../lib/format";
import { triggerDispatch } from "../../services/notifications/dispatcher";

export type SchedulingActionResult = SchedulingMutationResult;

export interface ProposeSchedulingActionInput {
  readonly applicationId: string;
  readonly meetingType: MeetingType;
  readonly durationMinutes: number;
  readonly proposalTimezone: string;
  readonly meetingDetails: string;
  readonly startsAt: readonly string[];
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function normalizeProposal(
  input: ProposeSchedulingActionInput,
): ProposeSchedulingActionInput | null {
  if (
    !input ||
    typeof input.applicationId !== "string" ||
    typeof input.meetingDetails !== "string" ||
    typeof input.proposalTimezone !== "string" ||
    !Array.isArray(input.startsAt) ||
    !input.startsAt.every((value) => typeof value === "string")
  ) {
    return null;
  }
  const meetingDetails = input.meetingDetails.trim();
  if (
    !isUuid(input.applicationId) ||
    !(MEETING_TYPE as readonly string[]).includes(input.meetingType) ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 15 ||
    input.durationMinutes > 240 ||
    meetingDetails.length < 1 ||
    meetingDetails.length > 500 ||
    !isValidTimeZone(input.proposalTimezone) ||
    input.startsAt.length < 1 ||
    input.startsAt.length > 3
  ) {
    return null;
  }

  const now = Date.now();
  const minimum = now + 4 * 60 * 60 * 1000;
  const maximum = now + 180 * 24 * 60 * 60 * 1000;
  const startsAt = [...new Set(input.startsAt)]
    .map((value) => new Date(value))
    .filter(
      (date) =>
        Number.isFinite(date.getTime()) &&
        date.getTime() > minimum &&
        date.getTime() <= maximum,
    )
    .sort((a, b) => a.getTime() - b.getTime())
    .map((date) => date.toISOString());
  if (startsAt.length !== input.startsAt.length) return null;

  return {
    ...input,
    meetingDetails,
    startsAt,
  };
}

async function credentials(): Promise<
  | { readonly userId: string }
  | SchedulingActionResult
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "unauthorized" };
  return { userId };
}

function isCredentials(
  value:
    | { readonly userId: string }
    | SchedulingActionResult,
): value is { readonly userId: string } {
  return "userId" in value;
}

function refreshScheduling(applicationId?: string): void {
  // Migration 088 writes the domain event in the SAME transaction as the
  // lifecycle mutation. The action only wakes the dispatcher and refreshes
  // route caches; either follow-up may fail without changing write truth.
  try {
    after(triggerDispatch);
  } catch (error) {
    reportError(error, {
      action: "refreshScheduling.dispatch",
    });
  }

  try {
    revalidatePath("/schedule");
    revalidatePath("/applied");
    revalidatePath("/host/applicants");
    if (applicationId) {
      revalidatePath(`/applied/${applicationId}`);
      revalidatePath(`/host/applicants/${applicationId}`);
    }
  } catch (error) {
    reportError(error, {
      action: "refreshScheduling.revalidate",
    });
  }
}

export async function proposeSchedulingAction(
  input: ProposeSchedulingActionInput,
): Promise<SchedulingActionResult> {
  try {
    const normalized = normalizeProposal(input);
    if (!normalized) return { ok: false, error: "invalid_input" };
    const authResult = await credentials();
    if (!isCredentials(authResult)) return authResult;
    const { allowed } = await checkRateLimitDistributed(
      `scheduling-propose:${authResult.userId}`,
      20,
      60 * 60 * 1000,
    );
    if (!allowed) return { ok: false, error: "rate_limited" };

    const result = await proposeHostSchedulingRequest(authResult.userId, normalized);
    if (result.ok && result.requestId) {
      refreshScheduling(normalized.applicationId);
    }
    return result;
  } catch (error) {
    reportError(error, { action: "proposeSchedulingAction" });
    return { ok: false, error: "unknown" };
  }
}

export async function respondToSchedulingAction(
  requestId: string,
  response: "selected" | "alternate_requested",
  optionId?: string,
): Promise<SchedulingActionResult> {
  try {
    if (
      !isUuid(requestId) ||
      (response !== "selected" && response !== "alternate_requested") ||
      (response === "selected" && (!optionId || !isUuid(optionId))) ||
      (response === "alternate_requested" && optionId != null)
    ) {
      return { ok: false, error: "invalid_input" };
    }
    const authResult = await credentials();
    if (!isCredentials(authResult)) return authResult;
    const { allowed } = await checkRateLimitDistributed(
      `scheduling-respond:${authResult.userId}`,
      30,
      60 * 60 * 1000,
    );
    if (!allowed) return { ok: false, error: "rate_limited" };
    const result = await respondToSchedulingRequest(
      authResult.userId,
      requestId,
      response,
      optionId,
    );
    if (result.ok) {
      refreshScheduling();
    }
    return result;
  } catch (error) {
    reportError(error, { action: "respondToSchedulingAction" });
    return { ok: false, error: "unknown" };
  }
}

export async function cancelSchedulingAction(
  requestId: string,
): Promise<SchedulingActionResult> {
  try {
    if (!isUuid(requestId)) return { ok: false, error: "invalid_input" };
    const authResult = await credentials();
    if (!isCredentials(authResult)) return authResult;
    const { allowed } = await checkRateLimitDistributed(
      `scheduling-cancel:${authResult.userId}`,
      30,
      60 * 60 * 1000,
    );
    if (!allowed) return { ok: false, error: "rate_limited" };
    const result = await cancelSchedulingRequest(authResult.userId, requestId);
    if (result.ok && result.actorScope) {
      refreshScheduling();
    }
    return result;
  } catch (error) {
    reportError(error, { action: "cancelSchedulingAction" });
    return { ok: false, error: "unknown" };
  }
}

export async function resolveSchedulingAction(
  requestId: string,
  outcome: "completed" | "no_show",
): Promise<SchedulingActionResult> {
  try {
    if (
      !isUuid(requestId) ||
      (outcome !== "completed" && outcome !== "no_show")
    ) {
      return { ok: false, error: "invalid_input" };
    }
    const authResult = await credentials();
    if (!isCredentials(authResult)) return authResult;
    const { allowed } = await checkRateLimitDistributed(
      `scheduling-resolve:${authResult.userId}`,
      30,
      60 * 60 * 1000,
    );
    if (!allowed) return { ok: false, error: "rate_limited" };
    const result = await resolveHostSchedulingRequest(
      authResult.userId,
      requestId,
      outcome,
    );
    if (result.ok) {
      refreshScheduling();
    }
    return result;
  } catch (error) {
    reportError(error, { action: "resolveSchedulingAction" });
    return { ok: false, error: "unknown" };
  }
}
