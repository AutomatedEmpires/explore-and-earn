import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MeetingType,
  SchedulingStatus,
} from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";
import { authedClient } from "../client";

export const ACTIVE_SCHEDULING_STATUSES = [
  "proposed",
  "selected",
  "alternate_requested",
] as const satisfies readonly SchedulingStatus[];

export interface SchedulingOption {
  readonly id: string;
  readonly proposalRound: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

export interface SchedulingRequest {
  readonly id: string;
  readonly applicationId: string;
  readonly status: SchedulingStatus;
  readonly meetingType: MeetingType;
  readonly durationMinutes: number;
  readonly proposalTimezone: string;
  readonly meetingDetails: string;
  readonly currentRound: number;
  readonly selectedOptionId: string | null;
  readonly expiresAt: string;
  readonly respondedAt: string | null;
  readonly cancelledAt: string | null;
  readonly cancelledBy: "host" | "seeker" | "platform" | null;
  readonly completedAt: string | null;
  readonly noShowAt: string | null;
  readonly createdAt: string;
  readonly options: readonly SchedulingOption[];
  /** Immutable proposal snapshot; available even when the listing is no longer visible. */
  readonly listingTitle: string;
}

export interface SchedulingLookup {
  /** False only when migration 088 is not available through the Data API yet. */
  readonly available: boolean;
  readonly request: SchedulingRequest | null;
}

export interface SchedulingListResult {
  readonly available: boolean;
  readonly requests: readonly SchedulingRequest[];
}

export interface SchedulingMutationResult {
  readonly ok: boolean;
  readonly requestId?: string;
  /** Present when the cancellation RPC derived the participant from the JWT. */
  readonly actorScope?: "host" | "seeker";
  readonly error?:
    | "unauthorized"
    | "invalid_input"
    | "invalid_slots"
    | "application_closed"
    | "active_request_exists"
    | "time_conflict"
    | "rate_limited"
    | "conflict"
    | "not_available"
    | "unknown";
}

interface DbError {
  readonly code?: string;
  readonly message?: string;
}

const SCHEMA_UNAVAILABLE_CODES = new Set(["42P01", "PGRST202", "PGRST205"]);

function isSchemaUnavailable(error: DbError | null): boolean {
  if (!error) return false;
  if (error.code && SCHEMA_UNAVAILABLE_CODES.has(error.code)) return true;
  const message = error.message?.toLowerCase() ?? "";
  return (
    message.includes("scheduling_requests") &&
    (message.includes("does not exist") || message.includes("schema cache"))
  );
}

function mutationError(error: DbError | null): SchedulingMutationResult["error"] {
  if (isSchemaUnavailable(error)) return "not_available";
  const message = error?.message ?? "";
  if (message.includes("scheduling_forbidden")) return "unauthorized";
  if (message.includes("scheduling_invalid_slots")) return "invalid_slots";
  if (message.includes("scheduling_invalid_input")) return "invalid_input";
  if (message.includes("scheduling_application_closed")) return "application_closed";
  if (message.includes("scheduling_active_request_exists")) {
    return "active_request_exists";
  }
  if (message.includes("scheduling_time_conflict")) return "time_conflict";
  return "unknown";
}

function client(token: string): SupabaseClient {
  return authedClient(token) as unknown as SupabaseClient;
}

function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

function asObject(value: unknown): Record<string, unknown> | null {
  const row = Array.isArray(value) ? value[0] : value;
  return row && typeof row === "object"
    ? (row as Record<string, unknown>)
    : null;
}

function toOption(value: unknown): SchedulingOption {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    proposalRound: Number(row.proposal_round),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
  };
}

function toRequest(
  value: unknown,
  options: readonly SchedulingOption[],
): SchedulingRequest {
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    applicationId: String(row.application_id),
    status: String(row.status) as SchedulingStatus,
    meetingType: String(row.meeting_type) as MeetingType,
    durationMinutes: Number(row.duration_minutes),
    proposalTimezone: String(row.proposal_timezone),
    meetingDetails: String(row.meeting_details),
    currentRound: Number(row.current_round),
    selectedOptionId:
      typeof row.selected_option_id === "string"
        ? row.selected_option_id
        : null,
    expiresAt: String(row.expires_at),
    respondedAt:
      typeof row.responded_at === "string" ? row.responded_at : null,
    cancelledAt:
      typeof row.cancelled_at === "string" ? row.cancelled_at : null,
    cancelledBy:
      row.cancelled_by === "host" ||
      row.cancelled_by === "seeker" ||
      row.cancelled_by === "platform"
        ? row.cancelled_by
        : null,
    completedAt:
      typeof row.completed_at === "string" ? row.completed_at : null,
    noShowAt: typeof row.no_show_at === "string" ? row.no_show_at : null,
    createdAt: String(row.created_at),
    options,
    listingTitle: String(row.listing_title),
  };
}

async function optionsForRequests(
  db: SupabaseClient,
  requestIds: readonly string[],
): Promise<Map<string, SchedulingOption[]>> {
  const result = new Map<string, SchedulingOption[]>();
  if (requestIds.length === 0) return result;
  // PostgREST encodes `.in(...)` in the URL. Keep each batch bounded so a
  // mature account's history cannot exceed proxy/request-line limits.
  for (let offset = 0; offset < requestIds.length; offset += 25) {
    const batch = requestIds.slice(offset, offset + 25);
    const { data, error } = await db
      .from("scheduling_options")
      .select("id,scheduling_request_id,proposal_round,starts_at,ends_at")
      .in("scheduling_request_id", [...batch])
      .order("starts_at", { ascending: true });
    if (error) throw new Error(`optionsForRequests: ${error.message}`);
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const requestId = String(row.scheduling_request_id);
      const bucket = result.get(requestId) ?? [];
      bucket.push(toOption(row));
      result.set(requestId, bucket);
    }
  }
  return result;
}

/** Latest scheduling workflow for an application, participant-scoped by RLS. */
export async function getSchedulingRequestForApplication(
  clerkToken: string,
  applicationId: string,
): Promise<SchedulingLookup> {
  const db = client(clerkToken);
  const { data, error } = await db
    .from("scheduling_requests")
    .select("*")
    .eq("application_id", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isSchemaUnavailable(error)) return { available: false, request: null };
    throw new Error(`getSchedulingRequestForApplication: ${error.message}`);
  }
  if (!data) return { available: true, request: null };
  const row = data as Record<string, unknown>;
  const requestId = String(row.id);
  const options = await optionsForRequests(db, [requestId]);
  return {
    available: true,
    request: toRequest(row, options.get(requestId) ?? []),
  };
}

/** Every interview visible to the signed-in seeker, newest first. */
export async function getSeekerSchedulingRequests(
  clerkToken: string,
  clerkUserId: string,
): Promise<SchedulingListResult> {
  const db = client(clerkToken);
  const profile = await db
    .from("seeker_profiles")
    .select("id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (profile.error) {
    throw new Error(`getSeekerSchedulingRequests(profile): ${profile.error.message}`);
  }
  if (!profile.data) return { available: true, requests: [] };

  const select = "*,applications!application_id!inner(seeker_profile_id)";
  const active = await db
    .from("scheduling_requests")
    .select(select)
    .eq("applications.seeker_profile_id", String(profile.data.id))
    .in("status", [...ACTIVE_SCHEDULING_STATUSES])
    .order("created_at", { ascending: false })
    .limit(100);
  if (active.error) {
    if (isSchemaUnavailable(active.error)) {
      return { available: false, requests: [] };
    }
    throw new Error(`getSeekerSchedulingRequests(active): ${active.error.message}`);
  }
  const terminal = await db
    .from("scheduling_requests")
    .select(select)
    .eq("applications.seeker_profile_id", String(profile.data.id))
    .not("status", "in", `(${ACTIVE_SCHEDULING_STATUSES.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(50);
  if (terminal.error) {
    if (isSchemaUnavailable(terminal.error)) {
      return { available: false, requests: [] };
    }
    throw new Error(
      `getSeekerSchedulingRequests(terminal): ${terminal.error.message}`,
    );
  }
  const byId = new Map<string, Record<string, unknown>>();
  for (const raw of [...(active.data ?? []), ...(terminal.data ?? [])]) {
    const row = raw as Record<string, unknown>;
    byId.set(String(row.id), row);
  }
  const rows = [...byId.values()].sort(
    (a, b) =>
      Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)),
  );
  const requestIds = rows.map((row) => String(row.id));
  const options = await optionsForRequests(db, requestIds);
  return {
    available: true,
    requests: rows.map((row) => {
      const requestId = String(row.id);
      return toRequest(row, options.get(requestId) ?? []);
    }),
  };
}

export async function proposeHostSchedulingRequest(
  clerkUserId: string,
  input: {
    readonly applicationId: string;
    readonly meetingType: MeetingType;
    readonly durationMinutes: number;
    readonly proposalTimezone: string;
    readonly meetingDetails: string;
    readonly startsAt: readonly string[];
  },
): Promise<SchedulingMutationResult> {
  const { data, error } = await admin().rpc(
    "propose_my_host_scheduling_request",
    {
      p_clerk_user_id: clerkUserId,
      p_application_id: input.applicationId,
      p_meeting_type: input.meetingType,
      p_duration_minutes: input.durationMinutes,
      p_proposal_timezone: input.proposalTimezone,
      p_meeting_details: input.meetingDetails,
      p_starts_at: [...input.startsAt],
    },
  );
  if (error) return { ok: false, error: mutationError(error) };
  if (typeof data !== "string" || data.length === 0) {
    return { ok: false, error: "conflict" };
  }
  return { ok: true, requestId: data };
}

export async function respondToSchedulingRequest(
  clerkUserId: string,
  requestId: string,
  response: "selected" | "alternate_requested",
  optionId?: string,
): Promise<SchedulingMutationResult> {
  const { data, error } = await admin().rpc(
    "respond_to_my_scheduling_request",
    {
      p_clerk_user_id: clerkUserId,
      p_request_id: requestId,
      p_response: response,
      p_option_id: optionId ?? null,
    },
  );
  if (error) return { ok: false, error: mutationError(error) };
  return data === true
    ? { ok: true, requestId }
    : { ok: false, error: "conflict" };
}

export async function cancelSchedulingRequest(
  clerkUserId: string,
  requestId: string,
): Promise<SchedulingMutationResult> {
  const { data, error } = await admin().rpc(
    "cancel_my_scheduling_request",
    { p_clerk_user_id: clerkUserId, p_request_id: requestId },
  );
  if (error) return { ok: false, error: mutationError(error) };
  return data === "host" || data === "seeker"
    ? { ok: true, requestId, actorScope: data }
    : { ok: false, error: "conflict" };
}

export async function resolveHostSchedulingRequest(
  clerkUserId: string,
  requestId: string,
  outcome: "completed" | "no_show",
): Promise<SchedulingMutationResult> {
  const { data, error } = await admin().rpc(
    "resolve_my_host_scheduling_request",
    {
      p_clerk_user_id: clerkUserId,
      p_request_id: requestId,
      p_outcome: outcome,
    },
  );
  if (error) return { ok: false, error: mutationError(error) };
  return data === true
    ? { ok: true, requestId }
    : { ok: false, error: "conflict" };
}

/** Authoritative participant/listing context for notification expansion. */
export interface AdminSchedulingContext {
  readonly applicationId: string;
  readonly seekerProfileId: string;
  readonly listingId: string;
  readonly hostProfileId: string;
  readonly listingTitle: string;
  readonly status: SchedulingStatus;
  readonly currentRound: number;
  readonly expiresAt: string;
}

export async function adminSchedulingContext(
  requestId: string,
): Promise<AdminSchedulingContext | null> {
  const { data, error } = await admin()
    .from("scheduling_requests")
    .select(
      "application_id,listing_title,status,current_round,expires_at,applications!application_id!inner(seeker_profile_id,listing_id,listings!listing_id!inner(host_profile_id))",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    throw new Error(`adminSchedulingContext: ${error.message}`);
  }
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const application = asObject(row.applications);
  const listing = asObject(application?.listings);
  if (!application || !listing) return null;
  return {
    applicationId: String(row.application_id),
    seekerProfileId: String(application.seeker_profile_id),
    listingId: String(application.listing_id),
    hostProfileId: String(listing.host_profile_id),
    listingTitle: String(row.listing_title),
    status: String(row.status) as SchedulingStatus,
    currentRound: Number(row.current_round),
    expiresAt: String(row.expires_at),
  };
}
