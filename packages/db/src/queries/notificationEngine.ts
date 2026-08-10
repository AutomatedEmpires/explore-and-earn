import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EngagementCategory,
  EngagementChannel,
  NotificationIntent,
} from "@explore-and-earn/contracts";

import { adminClient } from "../adminClient";

/**
 * Persistence layer of the Lifecycle & Engagement Notification Engine
 * (migration 065): delivery state machine, dispatcher watermark, push
 * subscriptions, email suppression, digest memberships, and engine prefs.
 *
 * Everything here runs on the SERVICE ROLE client — these tables are RLS
 * deny-by-default on purpose (delivery ledger + push keys + suppression are
 * server-only concerns). Ownership checks for user-facing mutations happen in
 * the server actions with the verified `auth().userId` BEFORE calling in.
 */

function admin(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/* ------------------------------------------------------------- deliveries */

export type DeliveryStatus =
  | "pending"
  | "deferred"
  | "processing"
  | "delivered"
  | "suppressed"
  | "failed_retryable"
  | "failed_terminal"
  | "dead_letter"
  | "cancelled";

export interface DeliveryRow {
  readonly id: string;
  readonly event_id: string | null;
  readonly recipient_clerk_user_id: string;
  readonly channel: EngagementChannel;
  readonly category: string;
  readonly notification_type: string;
  readonly variant: string;
  readonly dedup_key: string;
  readonly status: DeliveryStatus;
  readonly attempt_count: number;
  readonly next_attempt_at: string;
  readonly intent: NotificationIntent | Record<string, never>;
  readonly cadence: "immediate" | "daily" | "weekly";
  readonly created_at: string;
}

export interface NewDeliveryInput {
  readonly eventId: string | null;
  readonly recipientClerkUserId: string;
  readonly channel: EngagementChannel;
  readonly category: EngagementCategory;
  readonly notificationType: string;
  readonly variant: string;
  readonly dedupKey: string;
  readonly intent: NotificationIntent;
  readonly cadence: "immediate" | "daily" | "weekly";
  /** Defer first attempt (quiet hours / digest window). Default: now. */
  readonly nextAttemptAt?: string;
  readonly status?: Extract<DeliveryStatus, "pending" | "deferred">;
}

/**
 * Idempotent delivery materialization: ON CONFLICT (dedup_key) DO NOTHING.
 * Replays of the same event can never create a second logical delivery.
 * Returns the number of NEW rows created.
 */
export async function insertDeliveries(
  inputs: readonly NewDeliveryInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = inputs.map((d) => ({
    event_id: d.eventId,
    recipient_clerk_user_id: d.recipientClerkUserId,
    channel: d.channel,
    category: d.category,
    notification_type: d.notificationType,
    variant: d.variant,
    dedup_key: d.dedupKey,
    intent: d.intent,
    cadence: d.cadence,
    ...(d.nextAttemptAt ? { next_attempt_at: d.nextAttemptAt } : {}),
    ...(d.status ? { status: d.status } : {}),
  }));
  const { data, error } = await admin()
    .from("notification_deliveries")
    .upsert(rows, { onConflict: "dedup_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`insertDeliveries failed: ${error.message}`);
  return data?.length ?? 0;
}

/** Delivery ids for a set of dedup keys (existing OR just-created rows). */
export async function getDeliveryIdsByDedupKeys(
  dedupKeys: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dedupKeys.length === 0) return map;
  const { data, error } = await admin()
    .from("notification_deliveries")
    .select("id, dedup_key")
    .in("dedup_key", [...dedupKeys]);
  if (error) throw new Error(`getDeliveryIdsByDedupKeys failed: ${error.message}`);
  for (const row of (data ?? []) as Array<{ id: string; dedup_key: string }>) {
    map.set(row.dedup_key, row.id);
  }
  return map;
}

/**
 * ATOMIC digest-window claim: transitions the digest delivery row into
 * 'processing' iff it is currently held ('deferred') or abandoned by a
 * crashed run ('processing' with an expired lease). Exactly one concurrent
 * digest run wins; the rest see zero affected rows and skip. This is the
 * digest counterpart of claim_notification_deliveries.
 */
export async function claimDigestDelivery(
  deliveryId: string,
  leaseSeconds = 300,
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const lease = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  // Try the 'deferred' hold first (the common case)…
  const held = await admin()
    .from("notification_deliveries")
    .update({ status: "processing", lease_expires_at: lease, updated_at: nowIso })
    .eq("id", deliveryId)
    .eq("status", "deferred")
    .select("id");
  if (held.error) throw new Error(`claimDigestDelivery failed: ${held.error.message}`);
  if ((held.data ?? []).length > 0) return true;
  // …then crash recovery: an expired 'processing' lease is reclaimable.
  const reclaimed = await admin()
    .from("notification_deliveries")
    .update({ status: "processing", lease_expires_at: lease, updated_at: nowIso })
    .eq("id", deliveryId)
    .eq("status", "processing")
    .lt("lease_expires_at", nowIso)
    .select("id");
  if (reclaimed.error) {
    throw new Error(`claimDigestDelivery failed: ${reclaimed.error.message}`);
  }
  return (reclaimed.data ?? []).length > 0;
}

/** One delivery's id+status by its dedup key (digest-run crash recovery). */
export async function getDeliveryByDedupKey(
  dedupKey: string,
): Promise<{ readonly id: string; readonly status: DeliveryStatus } | null> {
  const { data, error } = await admin()
    .from("notification_deliveries")
    .select("id, status")
    .eq("dedup_key", dedupKey)
    .maybeSingle();
  if (error) throw new Error(`getDeliveryByDedupKey failed: ${error.message}`);
  return (data as { id: string; status: DeliveryStatus } | null) ?? null;
}

/**
 * Mark a batch of held digest-member deliveries as logically delivered via
 * the digest email that represented them.
 */
export async function collapseDeliveriesInto(
  ids: readonly string[],
  digestDeliveryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin()
    .from("notification_deliveries")
    .update({
      status: "delivered",
      collapsed_into_delivery_id: digestDeliveryId,
      delivered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", [...ids]);
  if (error) throw new Error(`collapseDeliveriesInto failed: ${error.message}`);
}

/** Feed of events the taxonomy has not expanded yet (oldest first). */
export async function getUnprocessedEvents(
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin().rpc("get_unprocessed_notification_events", {
    p_limit: limit,
  });
  if (error) throw new Error(`getUnprocessedEvents failed: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/**
 * Watermark an event as expanded. Idempotent (PK upsert, ignore duplicates):
 * with the deliveries dedup_key this gives exactly-once LOGICAL expansion
 * even when two dispatcher runs race the same event.
 */
export async function markEventProcessed(
  eventId: string,
  deliveryCount: number,
): Promise<void> {
  const { error } = await admin()
    .from("notification_processed_events")
    .upsert(
      { event_id: eventId, delivery_count: deliveryCount },
      { onConflict: "event_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(`markEventProcessed failed: ${error.message}`);
}

/** Atomically lease due deliveries for one worker (SKIP LOCKED RPC). */
export async function claimDeliveries(args: {
  readonly workerId: string;
  readonly limit?: number;
  readonly leaseSeconds?: number;
}): Promise<DeliveryRow[]> {
  const { data, error } = await admin().rpc("claim_notification_deliveries_v2", {
    p_worker_id: args.workerId,
    p_limit: args.limit ?? 20,
    p_lease_seconds: args.leaseSeconds ?? 120,
  });
  if (error) throw new Error(`claimDeliveries failed: ${error.message}`);
  return (data ?? []) as DeliveryRow[];
}

/** Terminal + retry transitions for a claimed delivery. */
export async function settleDelivery(args: {
  readonly id: string;
  readonly status: Exclude<DeliveryStatus, "pending" | "processing">;
  /**
   * Invitation deliveries must exit `processing` only for the exact v2 claim
   * that owns the row. This prevents an expired worker from overwriting a
   * newer provider-started claim after lease reclamation.
   */
  readonly workerId?: string;
  readonly providerMessageId?: string;
  readonly failureClass?: string;
  readonly failureDetail?: string;
  readonly suppressionReason?: string;
  readonly nextAttemptAt?: string;
  readonly collapsedIntoDeliveryId?: string;
  readonly deliveredAt?: string;
  /**
   * Explicit attempt-count correction. Deferrals (quiet hours, throttle)
   * REFUND the claim's increment — attempt_count must count real send
   * attempts, or long quiet hours would eat the retry budget.
   */
  readonly attemptCount?: number;
}): Promise<void> {
  const patch: Record<string, unknown> = {
    status: args.status,
    worker_id: null,
    lease_expires_at: null,
    updated_at: new Date().toISOString(),
  };
  if (args.attemptCount !== undefined) {
    patch.attempt_count = Math.max(0, args.attemptCount);
  }
  if (args.providerMessageId !== undefined) patch.provider_message_id = args.providerMessageId;
  if (args.failureClass !== undefined) patch.failure_class = args.failureClass;
  if (args.failureDetail !== undefined) {
    // Bounded, never raw provider payloads with recipient data.
    patch.failure_detail = args.failureDetail.slice(0, 500);
  }
  if (args.suppressionReason !== undefined) patch.suppression_reason = args.suppressionReason;
  if (args.nextAttemptAt !== undefined) patch.next_attempt_at = args.nextAttemptAt;
  if (args.collapsedIntoDeliveryId !== undefined) {
    patch.collapsed_into_delivery_id = args.collapsedIntoDeliveryId;
  }
  if (args.deliveredAt !== undefined) patch.delivered_at = args.deliveredAt;
  const update = admin()
    .from("notification_deliveries")
    .update(patch)
    .eq("id", args.id);
  if (args.workerId !== undefined) {
    const { data, error } = await update
      .eq("status", "processing")
      .eq("worker_id", args.workerId)
      .eq("claim_authority_version", "094")
      .select("id");
    if (error) throw new Error(`settleDelivery failed: ${error.message}`);
    if ((data ?? []).length !== 1) {
      throw new Error("settleDelivery failed: delivery lease lost");
    }
    return;
  }
  const { error } = await update;
  if (error) throw new Error(`settleDelivery failed: ${error.message}`);
}

/**
 * Atomically settle a successfully-sent invite notification with its invite.
 *
 * Migration 094 serializes this RPC with host withdrawal (invite row first,
 * then the claimed delivery) and verifies the worker, event dimensions, and
 * recipient before it can stamp either row. This release is DB-first, so
 * missing authority, permission, validation, and database faults all fail
 * closed; there is no delivery-only fallback that can race withdrawal.
 */
export async function settleInviteNotificationDelivery(args: {
  readonly id: string;
  readonly workerId: string;
  readonly deliveredAt: string;
  readonly providerMessageId?: string;
}): Promise<"delivered" | "cancelled"> {
  const { data, error } = await admin().rpc(
    "settle_invite_notification_delivery",
    {
      p_delivery_id: args.id,
      p_worker_id: args.workerId,
      p_provider_message_id: args.providerMessageId ?? null,
      p_delivered_at: args.deliveredAt,
    },
  );

  if (error) {
    throw new Error(
      `settleInviteNotificationDelivery failed: ${error.message}`,
    );
  }

  if (
    typeof data !== "object" ||
    data === null ||
    !("ok" in data) ||
    data.ok !== true ||
    !("status" in data) ||
    (data.status !== "delivered" && data.status !== "cancelled")
  ) {
    throw new Error("settleInviteNotificationDelivery returned an invalid result");
  }

  return data.status;
}

/**
 * Authoritative pre-send invite state. The 094 RPC takes a short FOR SHARE
 * lock so this recheck and host withdrawal cannot both cross the provider-send
 * boundary while observing stale state. There is deliberately no direct-read
 * rollout fallback: until the locking authority RPC is visible, callers must
 * retry before provider submission.
 */
export async function getInviteNotificationState(
  args: {
    readonly inviteId: string;
    readonly deliveryId: string;
    readonly workerId: string;
  },
): Promise<{ readonly status: string; readonly expiresAt: string | null } | null> {
  const response = await admin().rpc("get_invite_notification_state", {
    p_invite_id: args.inviteId,
    p_delivery_id: args.deliveryId,
    p_worker_id: args.workerId,
  });

  if (response.error) {
    throw new Error(
      `getInviteNotificationState failed: ${response.error.message}`,
    );
  }

  if (!Array.isArray(response.data) || response.data.length > 1) {
    throw new Error("getInviteNotificationState returned an invalid result");
  }

  const rows = response.data;
  const row = rows[0];
  if (!row) return null;
  if (
    typeof row !== "object" ||
    row === null ||
    !("status" in row) ||
    typeof row.status !== "string" ||
    !["created", "delivered", "viewed"].includes(row.status) ||
    !("expires_at" in row) ||
    (row.expires_at !== null &&
      (typeof row.expires_at !== "string" ||
        !Number.isFinite(Date.parse(row.expires_at))))
  ) {
    throw new Error("getInviteNotificationState returned an invalid result");
  }

  return { status: row.status, expiresAt: row.expires_at };
}

/**
 * Cross the durable provider boundary for one worker-owned invitation row.
 * The 094 RPC revalidates the exact delivery/event/invite relationship, marks
 * provider_started_at, and renews the lease in the same locked transaction.
 */
export async function beginInviteNotificationDelivery(
  args: {
    readonly inviteId: string;
    readonly deliveryId: string;
    readonly workerId: string;
  },
): Promise<{ readonly status: string; readonly expiresAt: string | null } | null> {
  const response = await admin().rpc("begin_invite_notification_delivery", {
    p_invite_id: args.inviteId,
    p_delivery_id: args.deliveryId,
    p_worker_id: args.workerId,
  });

  if (response.error) {
    throw new Error(
      `beginInviteNotificationDelivery failed: ${response.error.message}`,
    );
  }
  if (!Array.isArray(response.data) || response.data.length > 1) {
    throw new Error("beginInviteNotificationDelivery returned an invalid result");
  }
  const row = response.data[0];
  if (!row) return null;
  if (
    typeof row !== "object" ||
    row === null ||
    !("status" in row) ||
    typeof row.status !== "string" ||
    !["created", "delivered", "viewed"].includes(row.status) ||
    !("expires_at" in row) ||
    (row.expires_at !== null &&
      (typeof row.expires_at !== "string" ||
        !Number.isFinite(Date.parse(row.expires_at))))
  ) {
    throw new Error("beginInviteNotificationDelivery returned an invalid result");
  }
  return { status: row.status, expiresAt: row.expires_at };
}

/**
 * Release an invitation claim that failed before any provider submission.
 *
 * The worker/status predicates are the authority boundary: if withdrawal or
 * another worker already changed the row, this update affects zero rows and
 * cannot reopen it. This also bridges the web-before-094 deploy window, where
 * the new locking recheck RPC is intentionally not callable yet.
 */
export async function releaseInviteNotificationClaimKnownUnsent(args: {
  readonly id: string;
  readonly workerId: string;
  readonly attemptCount: number;
  readonly nextAttemptAt: string;
}): Promise<boolean> {
  const { data, error } = await admin()
    .from("notification_deliveries")
    .update({
      status: "failed_retryable",
      attempt_count: Math.max(0, args.attemptCount - 1),
      next_attempt_at: args.nextAttemptAt,
      failure_class: "known_unsent",
      failure_detail: "invite authority unavailable before provider submission",
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.id)
    .eq("notification_type", "invite_received")
    .eq("status", "processing")
    .eq("worker_id", args.workerId)
    .eq("claim_authority_version", "094")
    .is("provider_started_at", null)
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(
      `releaseInviteNotificationClaimKnownUnsent failed: ${error.message}`,
    );
  }
  return data !== null;
}

/**
 * Outbound sends (email+push) to one recipient since a timestamp — the
 * dispatcher's per-recipient throttle window input.
 */
export async function countRecentOutboundDeliveries(
  recipientClerkUserId: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await admin()
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("recipient_clerk_user_id", recipientClerkUserId)
    .in("channel", ["email", "push"])
    .eq("status", "delivered")
    .gte("delivered_at", sinceIso);
  if (error) throw new Error(`countRecentOutboundDeliveries failed: ${error.message}`);
  return count ?? 0;
}

/**
 * Open (not yet settled) deliveries in a collapse group for a recipient —
 * used for thread-aware collapse: a new message in a thread supersedes the
 * still-undelivered notification for the previous one.
 */
export async function findOpenCollapsibleDeliveries(args: {
  readonly recipientClerkUserId: string;
  readonly channel: EngagementChannel;
  readonly collapseKey: string;
  readonly excludeDeliveryId?: string;
}): Promise<
  Array<{ readonly id: string; readonly dedup_key: string; readonly created_at: string }>
> {
  // 'processing' is included so two workers concurrently holding SIBLING
  // deliveries in one collapse group can still see each other — the
  // strictly-newer one survives, the older cancels itself.
  let query = admin()
    .from("notification_deliveries")
    .select("id, dedup_key, created_at")
    .eq("recipient_clerk_user_id", args.recipientClerkUserId)
    .eq("channel", args.channel)
    .in("status", ["pending", "deferred", "failed_retryable", "processing"])
    .eq("intent->>collapseKey", args.collapseKey);
  if (args.excludeDeliveryId) query = query.neq("id", args.excludeDeliveryId);
  const { data, error } = await query;
  if (error) throw new Error(`findOpenCollapsibleDeliveries failed: ${error.message}`);
  return (data ?? []) as Array<{ id: string; dedup_key: string; created_at: string }>;
}

/* ----------------------------------------------------- in-app channel write */

/**
 * Idempotent write into the EXISTING in-app notifications table (008). The
 * partial unique index on dedupe_key is the guard: a concurrent duplicate
 * insert fails with 23505 and is reported as `duplicate` (logical delivery
 * already exists — success for exactly-once purposes).
 */
export async function insertEngineNotification(args: {
  readonly recipientClerkUserId: string;
  /** LEGACY in-app category (widened 008 CHECK), not the engine category. */
  readonly inAppCategory: string;
  readonly priority: "critical" | "important" | "informational";
  readonly title: string;
  readonly body: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly actionUrl?: string;
  readonly dedupeKey: string;
}): Promise<{ inserted: boolean; duplicate: boolean }> {
  const { error } = await admin().from("notifications").insert({
    recipient_user_id: null,
    recipient_clerk_user_id: args.recipientClerkUserId,
    category: args.inAppCategory,
    priority: args.priority,
    channel: "in_app",
    title: args.title,
    body: args.body,
    subject_type: args.subjectType ?? null,
    subject_id: args.subjectId ?? null,
    action_url: args.actionUrl ?? null,
    dedupe_key: args.dedupeKey,
  });
  if (!error) return { inserted: true, duplicate: false };
  if (error.code === "23505") return { inserted: false, duplicate: true };
  throw new Error(`insertEngineNotification failed: ${error.message}`);
}

/* ------------------------------------------------------------ engine prefs */

export interface EnginePrefsRecord {
  readonly clerk_user_id: string;
  readonly email_enabled: boolean;
  readonly push_enabled: boolean;
  readonly in_app_enabled: boolean;
  readonly category_prefs: Record<string, unknown>;
  readonly quiet_hours_enabled: boolean;
  readonly quiet_start_minute: number | null;
  readonly quiet_end_minute: number | null;
  readonly timezone: string | null;
  readonly locale: string | null;
}

const PREFS_COLUMNS =
  "clerk_user_id, email_enabled, push_enabled, in_app_enabled, category_prefs, " +
  "quiet_hours_enabled, quiet_start_minute, quiet_end_minute, timezone, locale";

/** Batch prefs read for the dispatcher (absent users simply aren't in the map). */
export async function getEnginePrefsMap(
  clerkUserIds: readonly string[],
): Promise<Map<string, EnginePrefsRecord>> {
  const map = new Map<string, EnginePrefsRecord>();
  if (clerkUserIds.length === 0) return map;
  const unique = [...new Set(clerkUserIds)];
  const { data, error } = await admin()
    .from("notification_engine_prefs")
    .select(PREFS_COLUMNS)
    .in("clerk_user_id", unique);
  if (error) throw new Error(`getEnginePrefsMap failed: ${error.message}`);
  for (const row of (data ?? []) as unknown as EnginePrefsRecord[]) {
    map.set(row.clerk_user_id, row);
  }
  return map;
}

export async function getEnginePrefs(
  clerkUserId: string,
): Promise<EnginePrefsRecord | null> {
  const { data, error } = await admin()
    .from("notification_engine_prefs")
    .select(PREFS_COLUMNS)
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw new Error(`getEnginePrefs failed: ${error.message}`);
  return (data as unknown as EnginePrefsRecord) ?? null;
}

export interface EnginePrefsPatch {
  readonly emailEnabled?: boolean;
  readonly pushEnabled?: boolean;
  readonly inAppEnabled?: boolean;
  readonly categoryPrefs?: Record<string, unknown>;
  readonly quietHoursEnabled?: boolean;
  readonly quietStartMinute?: number | null;
  readonly quietEndMinute?: number | null;
  readonly timezone?: string | null;
  readonly locale?: string | null;
}

/**
 * Upsert engine prefs for one user. Callers (server actions / unsubscribe
 * route) are responsible for having authenticated or token-verified the
 * clerkUserId — this function trusts its argument by contract.
 */
export async function upsertEnginePrefs(
  clerkUserId: string,
  patch: EnginePrefsPatch,
): Promise<void> {
  const row: Record<string, unknown> = {
    clerk_user_id: clerkUserId,
    updated_at: new Date().toISOString(),
  };
  if (patch.emailEnabled !== undefined) row.email_enabled = patch.emailEnabled;
  if (patch.pushEnabled !== undefined) row.push_enabled = patch.pushEnabled;
  if (patch.inAppEnabled !== undefined) row.in_app_enabled = patch.inAppEnabled;
  if (patch.categoryPrefs !== undefined) row.category_prefs = patch.categoryPrefs;
  if (patch.quietHoursEnabled !== undefined) row.quiet_hours_enabled = patch.quietHoursEnabled;
  if (patch.quietStartMinute !== undefined) row.quiet_start_minute = patch.quietStartMinute;
  if (patch.quietEndMinute !== undefined) row.quiet_end_minute = patch.quietEndMinute;
  if (patch.timezone !== undefined) row.timezone = patch.timezone;
  if (patch.locale !== undefined) row.locale = patch.locale;
  const { error } = await admin()
    .from("notification_engine_prefs")
    .upsert(row, { onConflict: "clerk_user_id" });
  if (error) throw new Error(`upsertEnginePrefs failed: ${error.message}`);
}

/* ------------------------------------------------------ push subscriptions */

export interface PushSubscriptionRow {
  readonly id: string;
  readonly clerk_user_id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

/**
 * Register/refresh a push subscription. Endpoint is globally unique: a
 * re-subscribe (same endpoint, e.g. after permission re-grant or on a shared
 * device signed into a different account) re-binds it to the CURRENT verified
 * owner and clears any revocation.
 */
export async function upsertPushSubscription(args: {
  readonly clerkUserId: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
  readonly userAgent?: string | null;
  readonly locale?: string | null;
  readonly timezone?: string | null;
}): Promise<void> {
  const { error } = await admin()
    .from("push_subscriptions")
    .upsert(
      {
        clerk_user_id: args.clerkUserId,
        endpoint: args.endpoint,
        p256dh: args.p256dh,
        auth: args.auth,
        user_agent: args.userAgent ?? null,
        locale: args.locale ?? null,
        timezone: args.timezone ?? null,
        revoked_at: null,
        failure_count: 0,
      },
      { onConflict: "endpoint" },
    );
  if (error) throw new Error(`upsertPushSubscription failed: ${error.message}`);
}

/** Owner-scoped removal: deletes only when BOTH endpoint and owner match. */
export async function deletePushSubscription(
  clerkUserId: string,
  endpoint: string,
): Promise<void> {
  const { error } = await admin()
    .from("push_subscriptions")
    .delete()
    .eq("clerk_user_id", clerkUserId)
    .eq("endpoint", endpoint);
  if (error) throw new Error(`deletePushSubscription failed: ${error.message}`);
}

export async function getActivePushSubscriptions(
  clerkUserId: string,
): Promise<PushSubscriptionRow[]> {
  const { data, error } = await admin()
    .from("push_subscriptions")
    .select("id, clerk_user_id, endpoint, p256dh, auth")
    .eq("clerk_user_id", clerkUserId)
    .is("revoked_at", null);
  if (error) throw new Error(`getActivePushSubscriptions failed: ${error.message}`);
  return (data ?? []) as PushSubscriptionRow[];
}

/** Terminal provider response (404/410): the endpoint is dead — revoke it. */
export async function revokePushSubscription(subscriptionId: string): Promise<void> {
  const { error } = await admin()
    .from("push_subscriptions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) throw new Error(`revokePushSubscription failed: ${error.message}`);
}

export async function recordPushOutcome(
  subscriptionId: string,
  ok: boolean,
): Promise<void> {
  const patch = ok
    ? { last_success_at: new Date().toISOString(), failure_count: 0 }
    : undefined;
  if (patch) {
    const { error } = await admin()
      .from("push_subscriptions")
      .update(patch)
      .eq("id", subscriptionId);
    if (error) throw new Error(`recordPushOutcome failed: ${error.message}`);
    return;
  }
  // Failure: bump the counter without racing concurrent workers to zero.
  const { data, error } = await admin()
    .from("push_subscriptions")
    .select("failure_count")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error || !data) return;
  await admin()
    .from("push_subscriptions")
    .update({ failure_count: (data.failure_count as number) + 1 })
    .eq("id", subscriptionId);
}

/* --------------------------------------------------------- email suppression */

export async function isEmailSuppressed(email: string): Promise<boolean> {
  const { data, error } = await admin()
    .from("email_suppressions")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`isEmailSuppressed failed: ${error.message}`);
  return data != null;
}

/** Idempotent (unique email): repeat bounce/complaint webhooks are no-ops. */
export async function suppressEmail(args: {
  readonly email: string;
  readonly reason: "hard_bounce" | "complaint" | "manual" | "invalid";
  readonly source?: string;
}): Promise<void> {
  const email = args.email.trim().toLowerCase();
  // Defense in depth behind the signed webhook: never store garbage rows.
  if (email.length === 0 || email.length > 320 || !email.includes("@")) return;
  const { error } = await admin()
    .from("email_suppressions")
    .upsert(
      {
        email,
        reason: args.reason,
        source: args.source ?? null,
      },
      { onConflict: "email", ignoreDuplicates: true },
    );
  if (error) throw new Error(`suppressEmail failed: ${error.message}`);
}

/* ------------------------------------- schedule-derived reminder feeds
   (REAL current state only: an unexpired offered application / a live
   listing with a real expires_at — re-checked again at send time) */

export interface ExpiringOfferedApplication {
  readonly id: string;
  readonly seeker_profile_id: string;
  readonly listing_id: string;
  readonly expires_at: string;
}

/** Applications sitting at status='offered' with a REAL imminent expiry. */
export async function getExpiringOfferedApplications(
  withinHours: number,
  limit = 500,
): Promise<ExpiringOfferedApplication[]> {
  const now = new Date();
  const until = new Date(now.getTime() + withinHours * 3_600_000);
  const { data, error } = await admin()
    .from("applications")
    .select("id, seeker_profile_id, listing_id, expires_at")
    .eq("status", "offered")
    .gt("expires_at", now.toISOString())
    .lte("expires_at", until.toISOString())
    .limit(limit);
  if (error) throw new Error(`getExpiringOfferedApplications failed: ${error.message}`);
  return (data ?? []) as ExpiringOfferedApplication[];
}

/** Send-time re-check: the offer must STILL be open and unexpired. */
export async function getApplicationOfferState(
  applicationId: string,
): Promise<{ readonly status: string; readonly expires_at: string | null } | null> {
  const { data, error } = await admin()
    .from("applications")
    .select("status, expires_at")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`getApplicationOfferState failed: ${error.message}`);
  return (data as { status: string; expires_at: string | null }) ?? null;
}

export interface ExpiringLiveListing {
  readonly id: string;
  readonly title: string;
  readonly host_profile_id: string;
  readonly expires_at: string;
}

/** Live listings whose REAL expires_at falls within the window. */
export async function getExpiringLiveListings(
  withinDays: number,
  limit = 500,
): Promise<ExpiringLiveListing[]> {
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 86_400_000);
  const { data, error } = await admin()
    .from("listings")
    .select("id, title, host_profile_id, expires_at")
    .eq("status", "live")
    .gt("expires_at", now.toISOString())
    .lte("expires_at", until.toISOString())
    .limit(limit);
  if (error) throw new Error(`getExpiringLiveListings failed: ${error.message}`);
  return (data ?? []) as ExpiringLiveListing[];
}

/** Send-time re-check: the listing must STILL be live and unexpired. */
export async function getListingLiveState(
  listingId: string,
): Promise<{ readonly status: string; readonly expires_at: string | null } | null> {
  const { data, error } = await admin()
    .from("listings")
    .select("status, expires_at")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw new Error(`getListingLiveState failed: ${error.message}`);
  return (data as { status: string; expires_at: string | null }) ?? null;
}

/* ------------------------------------------------- taxonomy resolvers (admin)
   Service-role lookups used by the dispatcher's event→intent expansion.
   Read-only, id-keyed, no user-generated free text beyond listing titles. */

export async function adminSeekerClerkId(seekerProfileId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from("seeker_profiles")
    .select("clerk_user_id")
    .eq("id", seekerProfileId)
    .maybeSingle();
  if (error) throw new Error(`adminSeekerClerkId failed: ${error.message}`);
  const clerkId = (data as { clerk_user_id: string | null } | null)?.clerk_user_id;
  return typeof clerkId === "string" && clerkId.length > 0 ? clerkId : null;
}

export async function adminHostClerkId(hostProfileId: string): Promise<string | null> {
  const { data, error } = await admin()
    .from("host_profiles")
    .select("clerk_user_id")
    .eq("id", hostProfileId)
    .maybeSingle();
  if (error) throw new Error(`adminHostClerkId failed: ${error.message}`);
  const clerkId = (data as { clerk_user_id: string | null } | null)?.clerk_user_id;
  return typeof clerkId === "string" && clerkId.length > 0 ? clerkId : null;
}

export async function adminListingContext(
  listingId: string,
): Promise<{ readonly title: string; readonly hostProfileId: string | null } | null> {
  const { data, error } = await admin()
    .from("listings")
    .select("title, host_profile_id")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw new Error(`adminListingContext failed: ${error.message}`);
  if (!data) return null;
  const row = data as { title: string | null; host_profile_id: string | null };
  return { title: row.title ?? "", hostProfileId: row.host_profile_id };
}

export async function adminConversationContext(conversationId: string): Promise<{
  readonly seekerProfileId: string | null;
  readonly hostProfileId: string | null;
  readonly listingId: string | null;
} | null> {
  const { data, error } = await admin()
    .from("conversations")
    .select("seeker_profile_id, host_profile_id, listing_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`adminConversationContext failed: ${error.message}`);
  if (!data) return null;
  const row = data as {
    seeker_profile_id: string | null;
    host_profile_id: string | null;
    listing_id: string | null;
  };
  return {
    seekerProfileId: row.seeker_profile_id,
    hostProfileId: row.host_profile_id,
    listingId: row.listing_id,
  };
}

export async function adminApplicationContext(applicationId: string): Promise<{
  readonly seekerProfileId: string | null;
  readonly listingId: string | null;
} | null> {
  const { data, error } = await admin()
    .from("applications")
    .select("seeker_profile_id, listing_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw new Error(`adminApplicationContext failed: ${error.message}`);
  if (!data) return null;
  const row = data as { seeker_profile_id: string | null; listing_id: string | null };
  return { seekerProfileId: row.seeker_profile_id, listingId: row.listing_id };
}

/* -------------------------------------------------- résumé-nudge candidates */

export interface ResumeNudgeCandidate {
  readonly seekerProfileId: string;
  readonly clerkUserId: string;
  readonly completion: number;
}

/**
 * Service-role résumé completeness probe using THE authoritative predicate
 * (lib/resumeCompleteness.seekerResumeCompletion) over the same real rows the
 * apply-gate reads. Returns null when the profile does not exist.
 */
export async function getResumeCompletionByProfileId(
  seekerProfileId: string,
): Promise<{ readonly complete: boolean; readonly completion: number } | null> {
  const db = admin();
  const { data: profile, error } = await db
    .from("seeker_profiles")
    .select(
      "id, display_name, relative_location, seeking_timeline, short_bio, general_skill_tags",
    )
    .eq("id", seekerProfileId)
    .maybeSingle();
  if (error) throw new Error(`getResumeCompletionByProfileId failed: ${error.message}`);
  if (!profile) return null;
  const p = profile as {
    id: string;
    display_name: string | null;
    relative_location: string | null;
    seeking_timeline: string | null;
    short_bio: string | null;
    general_skill_tags: string[] | null;
  };
  const { data: experiences, error: expError } = await db
    .from("seeker_resume_experiences")
    .select("id, company_name, role_title, skill_tags")
    .eq("seeker_profile_id", seekerProfileId);
  if (expError) {
    throw new Error(`getResumeCompletionByProfileId experiences failed: ${expError.message}`);
  }
  const { seekerResumeCompletion } = await import("../lib/resumeCompleteness");
  const status = seekerResumeCompletion({
    profile: {
      seekerProfileId: p.id,
      bio: p.short_bio,
      headline: null,
      displayName: p.display_name,
      location: p.relative_location,
      seekingTimeline: p.seeking_timeline,
      desiredCategories: [],
      generalSkills: p.general_skill_tags ?? [],
    },
    experiences: ((experiences ?? []) as Array<{
      id: string;
      company_name: string | null;
      role_title: string | null;
      skill_tags: string[] | null;
    }>).map(
      (row) => ({
        id: row.id,
        companyName: row.company_name,
        roleTitle: row.role_title,
        location: null,
        startDate: null,
        endDate: null,
        isCurrent: false,
        summary: null,
        categoryTags: [],
        skillTags: row.skill_tags ?? [],
      }),
    ),
    educations: [],
    certifications: [],
  });
  return { complete: status.complete, completion: status.completion };
}

/**
 * Bounded feed of seekers to CONSIDER for a résumé nudge (oldest profiles
 * first for fairness). Completeness is evaluated per candidate by the caller
 * via getResumeCompletionByProfileId — this feed only narrows to seekers with
 * a Clerk identity.
 */
export async function getResumeNudgeCandidates(
  limit = 200,
): Promise<Array<{ readonly seekerProfileId: string; readonly clerkUserId: string }>> {
  const { data, error } = await admin()
    .from("seeker_profiles")
    .select("id, clerk_user_id")
    .not("clerk_user_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getResumeNudgeCandidates failed: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; clerk_user_id: string | null }>)
    .filter((row) => Boolean(row.clerk_user_id))
    .map((row) => ({ seekerProfileId: row.id, clerkUserId: row.clerk_user_id as string }));
}

/* ----------------------------------------------- legacy pref-boolean overlay */

export interface LegacySeekerEmailBooleans {
  readonly email_on_invite: boolean;
  readonly email_on_status_change: boolean;
  readonly email_on_message: boolean;
}

/**
 * The 019 seeker email booleans, for users WITHOUT an engine prefs row: an
 * existing opt-out must keep holding when the engine takes over email — a
 * migration may never re-subscribe someone.
 */
export async function getLegacySeekerEmailBooleans(
  clerkUserIds: readonly string[],
): Promise<Map<string, LegacySeekerEmailBooleans>> {
  const map = new Map<string, LegacySeekerEmailBooleans>();
  if (clerkUserIds.length === 0) return map;
  const { data, error } = await admin()
    .from("seeker_profiles")
    .select("clerk_user_id, email_on_invite, email_on_status_change, email_on_message")
    .in("clerk_user_id", [...new Set(clerkUserIds)]);
  if (error) throw new Error(`getLegacySeekerEmailBooleans failed: ${error.message}`);
  for (const row of (data ?? []) as Array<
    { clerk_user_id: string | null } & LegacySeekerEmailBooleans
  >) {
    if (row.clerk_user_id) {
      map.set(row.clerk_user_id, {
        email_on_invite: row.email_on_invite !== false,
        email_on_status_change: row.email_on_status_change !== false,
        email_on_message: row.email_on_message !== false,
      });
    }
  }
  return map;
}

/* ------------------------------------------------------- digest membership */

export interface NewDigestMembership {
  readonly recipientClerkUserId: string;
  readonly cadence: "daily" | "weekly";
  readonly category: EngagementCategory;
  readonly eventId: string;
  readonly deliveryId: string | null;
}

/** Idempotent: unique (recipient, cadence, event). Returns rows created. */
export async function insertDigestMemberships(
  inputs: readonly NewDigestMembership[],
): Promise<number> {
  if (inputs.length === 0) return 0;
  const rows = inputs.map((m) => ({
    recipient_clerk_user_id: m.recipientClerkUserId,
    cadence: m.cadence,
    category: m.category,
    event_id: m.eventId,
    delivery_id: m.deliveryId,
  }));
  const { data, error } = await admin()
    .from("digest_memberships")
    .upsert(rows, {
      onConflict: "recipient_clerk_user_id,cadence,event_id",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) throw new Error(`insertDigestMemberships failed: ${error.message}`);
  return data?.length ?? 0;
}

export interface QueuedDigestMembership {
  readonly id: string;
  readonly recipient_clerk_user_id: string;
  readonly cadence: "daily" | "weekly";
  readonly category: string;
  readonly event_id: string;
  readonly delivery_id: string | null;
  readonly created_at: string;
  readonly delivery:
    | { readonly intent: NotificationIntent | Record<string, never> }
    | null;
}

/** All queued memberships for a cadence (bounded), oldest first. */
export async function getQueuedDigestMemberships(
  cadence: "daily" | "weekly",
  limit = 2000,
): Promise<QueuedDigestMembership[]> {
  const { data, error } = await admin()
    .from("digest_memberships")
    .select(
      "id, recipient_clerk_user_id, cadence, category, event_id, delivery_id, created_at, " +
        "delivery:notification_deliveries!digest_memberships_delivery_id_fkey(intent)",
    )
    .eq("cadence", cadence)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`getQueuedDigestMemberships failed: ${error.message}`);
  return (data ?? []) as unknown as QueuedDigestMembership[];
}

export async function markDigestMembershipsSent(
  ids: readonly string[],
  digestDeliveryId: string,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin()
    .from("digest_memberships")
    .update({
      status: "sent",
      digest_delivery_id: digestDeliveryId,
      sent_at: new Date().toISOString(),
    })
    .in("id", [...ids]);
  if (error) throw new Error(`markDigestMembershipsSent failed: ${error.message}`);
}

export async function cancelDigestMemberships(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await admin()
    .from("digest_memberships")
    .update({ status: "cancelled" })
    .in("id", [...ids]);
  if (error) throw new Error(`cancelDigestMemberships failed: ${error.message}`);
}

/* --------------------------------------------------------------- admin ops */
/* Read-only observability + narrow repair verbs for /admin/notifications.
 * Service-role like everything else here; the admin server actions re-verify
 * the caller with isCurrentUserAdmin() before calling in. There is
 * DELIBERATELY no bulk-send or bulk-requeue verb on this surface. */

export const DELIVERY_STATUSES: readonly DeliveryStatus[] = [
  "pending",
  "deferred",
  "processing",
  "delivered",
  "suppressed",
  "failed_retryable",
  "failed_terminal",
  "dead_letter",
  "cancelled",
];

/** Per-status delivery counts (exact, head-only — no row transfer). */
export async function adminDeliveryStatusCounts(): Promise<Record<DeliveryStatus, number>> {
  const entries = await Promise.all(
    DELIVERY_STATUSES.map(async (status) => {
      const { count, error } = await admin()
        .from("notification_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`adminDeliveryStatusCounts(${status}): ${error.message}`);
      return [status, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<DeliveryStatus, number>;
}

export interface AdminDeliveryRow {
  readonly id: string;
  readonly recipient_clerk_user_id: string;
  readonly channel: string;
  readonly notification_type: string;
  readonly status: string;
  readonly attempt_count: number;
  readonly failure_class: string | null;
  readonly failure_detail: string | null;
  readonly suppression_reason: string | null;
  readonly next_attempt_at: string;
  readonly delivered_at: string | null;
  readonly created_at: string;
}

const ADMIN_DELIVERY_COLUMNS =
  "id, recipient_clerk_user_id, channel, notification_type, status, attempt_count, " +
  "failure_class, failure_detail, suppression_reason, next_attempt_at, delivered_at, created_at";

/** Recent deliveries, newest first, optionally filtered by status. */
export async function adminListDeliveries(args: {
  readonly status?: DeliveryStatus;
  readonly limit?: number;
}): Promise<AdminDeliveryRow[]> {
  let query = admin()
    .from("notification_deliveries")
    .select(ADMIN_DELIVERY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(args.limit ?? 50, 1), 200));
  if (args.status) query = query.eq("status", args.status);
  const { data, error } = await query;
  if (error) throw new Error(`adminListDeliveries: ${error.message}`);
  return (data ?? []) as unknown as AdminDeliveryRow[];
}

export interface AdminSuppressionRow {
  readonly id: string;
  readonly email: string;
  readonly reason: string;
  readonly source: string | null;
  readonly created_at: string;
}

export async function adminListEmailSuppressions(limit = 50): Promise<AdminSuppressionRow[]> {
  const { data, error } = await admin()
    .from("email_suppressions")
    .select("id, email, reason, source, created_at")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));
  if (error) throw new Error(`adminListEmailSuppressions: ${error.message}`);
  return (data ?? []) as unknown as AdminSuppressionRow[];
}

export interface AdminDigestQueueSummary {
  readonly dailyQueued: number;
  readonly weeklyQueued: number;
}

export async function adminDigestQueueSummary(): Promise<AdminDigestQueueSummary> {
  const [daily, weekly] = await Promise.all(
    (["daily", "weekly"] as const).map(async (cadence) => {
      const { count, error } = await admin()
        .from("digest_memberships")
        .select("id", { count: "exact", head: true })
        .eq("cadence", cadence)
        .eq("status", "queued");
      if (error) throw new Error(`adminDigestQueueSummary(${cadence}): ${error.message}`);
      return count ?? 0;
    }),
  );
  return { dailyQueued: daily, weeklyQueued: weekly };
}

export interface AdminPushSubscriptionSummary {
  readonly active: number;
  readonly revoked: number;
}

export async function adminPushSubscriptionSummary(): Promise<AdminPushSubscriptionSummary> {
  const [active, revoked] = await Promise.all([
    admin()
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null),
    admin()
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .not("revoked_at", "is", null),
  ]);
  if (active.error) throw new Error(`adminPushSubscriptionSummary: ${active.error.message}`);
  if (revoked.error) throw new Error(`adminPushSubscriptionSummary: ${revoked.error.message}`);
  return { active: active.count ?? 0, revoked: revoked.count ?? 0 };
}

/**
 * Requeue ONE terminally-failed delivery for a fresh attempt cycle. An
 * outcome-unknown invitation dead letter is deliberately immutable: the
 * provider may have accepted it before its response was lost. Known-unsent
 * terminal rows remain recoverable. The database trigger is authoritative;
 * this predicate mirrors it so direct callers fail closed without an error.
 */
export async function adminRequeueDelivery(deliveryId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from("notification_deliveries")
    .update({
      status: "pending",
      attempt_count: 0,
      next_attempt_at: new Date().toISOString(),
      failure_class: null,
      failure_detail: null,
      worker_id: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId)
    .in("status", ["dead_letter", "failed_terminal"])
    .or(
      "notification_type.neq.invite_received,status.neq.dead_letter,failure_class.neq.outcome_unknown,failure_class.is.null",
    )
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`adminRequeueDelivery: ${error.message}`);
  return data !== null;
}

/** Cancel ONE not-yet-sent delivery (pending/deferred/failed_retryable). */
export async function adminCancelDelivery(deliveryId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from("notification_deliveries")
    .update({
      status: "cancelled",
      suppression_reason: "admin_cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("id", deliveryId)
    .in("status", ["pending", "deferred", "failed_retryable"])
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`adminCancelDelivery: ${error.message}`);
  return data !== null;
}
