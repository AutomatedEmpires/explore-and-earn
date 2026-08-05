import type { SchedulingRequest } from "@explore-and-earn/db/client";

const PROPOSABLE_APPLICATION_STATUSES = new Set([
  "applied",
  "reviewing",
  "saved_by_host",
]);

const ACTIVE_REQUEST_STATUSES = new Set([
  "proposed",
  "selected",
  "alternate_requested",
]);

export function canHostProposeInterview(
  applicationStatus: string,
  request: Pick<SchedulingRequest, "status" | "expiresAt"> | null,
  nowMs: number = Date.now(),
): boolean {
  if (!PROPOSABLE_APPLICATION_STATUSES.has(applicationStatus)) return false;
  if (!request || !ACTIVE_REQUEST_STATUSES.has(request.status)) return true;
  if (request.status === "alternate_requested") return true;
  return (
    request.status === "proposed" &&
    new Date(request.expiresAt).getTime() <= nowMs
  );
}

export function showsSelectedInterviewTime(status: SchedulingRequest["status"]): boolean {
  return ["selected", "completed", "no_show", "cancelled", "expired"].includes(status);
}

export function canRecordInterviewNoShow(startsAt: string, nowMs: number): boolean {
  return Date.parse(startsAt) + 15 * 60 * 1000 <= nowMs;
}

export function canCompleteInterview(endsAt: string, nowMs: number): boolean {
  return Date.parse(endsAt) <= nowMs;
}
