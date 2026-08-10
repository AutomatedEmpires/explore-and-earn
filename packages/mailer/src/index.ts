/**
 * packages/mailer — Canonical transactional email transport.
 *
 * sendMail: best-effort Resend transport. Never throws; provider errors are
 * caught and logged so a broken send can never crash the server action that
 * triggered it (callers receive { ok: false } on any failure).
 *
 * Idempotency: pass an `idempotencyKey` to guard against duplicate sends on
 * retries. Duplicate detection uses an in-memory map with a 5-minute TTL —
 * this protects against immediate retries in the same process but not
 * cross-process or cross-restart replays (acceptable for MVP single-instance).
 *
 * Env:
 *   RESEND_API_KEY        — required to send; omit for local dev (logs to console)
 *   RESEND_FROM_EMAIL     — optional From header override
 *   RESEND_REPLY_TO_EMAIL — optional Reply-To address
 */

import { createHash } from "node:crypto";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Explore & Earn <notifications@exploreandearn.com>";
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes
const PROVIDER_FETCH_TIMEOUT_MS = 25_000;

/** Deterministic ASCII form of a caller idempotency key for the HTTP header. */
export function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * In-process logical-send claims. A pending claim is never evidence that a
 * provider accepted the message; only confirmed success may deduplicate a
 * later call as already sent.
 */
const _sentKeys = new Map<
  string,
  { readonly state: "pending" | "sent"; readonly at: number }
>();

/** Exposed for testing only — resets the in-memory dedup store between tests. */
export function _resetDedup(): void {
  _sentKeys.clear();
}

export interface SendMailOptions {
  readonly to: string;
  /** Defaults to DEFAULT_FROM / RESEND_FROM_EMAIL env var. */
  readonly from?: string;
  readonly subject: string;
  readonly html: string;
  /** Optional plain-text alternative part (multipart/alternative). */
  readonly text?: string;
  /**
   * Extra SMTP headers (e.g. List-Unsubscribe / List-Unsubscribe-Post for
   * one-click unsubscribe). Passed through to the provider verbatim.
   */
  readonly headers?: Readonly<Record<string, string>>;
  /**
   * When set, duplicate sends within the 5-minute TTL window are silently
   * dropped. Use a string that uniquely identifies the send event, e.g.
   * `"applicationStatus:<applicationId>:<newStatus>"`.
   */
  readonly idempotencyKey?: string;
  /**
   * Optional durable authority check invoked only at the logical provider
   * boundary, after every local preflight guard and immediately before fetch.
   */
  readonly beforeProviderRequest?: () => Promise<
    | { readonly actionable: true }
    | { readonly actionable: false; readonly reason: string }
  >;
}

export interface SendMailResult {
  readonly ok: boolean;
  readonly error?: string;
  /** True only after this call crossed the Resend HTTP boundary. */
  readonly providerRequestStarted?: boolean;
  /** The durable provider-boundary authority could not be established. */
  readonly providerBoundaryUnavailable?: boolean;
  /** Domain truth changed before provider submission. */
  readonly cancelledReason?: string;
  /** True when the send was skipped because an identical send was already recorded within the TTL. */
  readonly isDuplicate?: boolean;
  /** Provider HTTP status when the provider responded (success or failure). */
  readonly status?: number;
  /** Provider message id on success (Resend `id`), when available. */
  readonly providerMessageId?: string;
}

function resolveFrom(override?: string): string {
  const fromEnv = process.env.RESEND_FROM_EMAIL;
  return (
    override ??
    (fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_FROM)
  );
}

/**
 * Send a transactional email via the Resend REST API.
 *
 * Contract: NEVER throws. Returns `{ ok: false, error }` on any failure so
 * email sends can never break the server action that triggered them.
 *
 * Idempotency: if `idempotencyKey` is set and an identical send was recorded
 * within the last 5 minutes, the send is skipped and
 * `{ ok: true, isDuplicate: true }` is returned without hitting the Resend API.
 *
 * Dev mode: when `NODE_ENV !== "production"` and `RESEND_API_KEY` is not set,
 * the email body is logged to the console and `{ ok: true }` is returned.
 *
 * @example
 * // Success
 * const r = await sendMail({ to: "u@example.com", subject: "Hi", html: "<p>Hi</p>",
 *                             idempotencyKey: "event:123" });
 * // r.ok === true (or isDuplicate === true on a retry)
 *
 * // Failure — never throws
 * const r = await sendMail({ to: "bad", subject: "Hi", html: "<p>Hi</p>" });
 * // r.ok === false; r.error contains the reason
 */
export async function sendMail(opts: SendMailOptions): Promise<SendMailResult> {
  const {
    to,
    subject,
    html,
    text,
    headers,
    idempotencyKey,
    beforeProviderRequest,
  } = opts;
  const from = resolveFrom(opts.from);

  const checkProviderBoundary = async (
    logicalProviderRequestStarted: boolean,
  ): Promise<SendMailResult | null> => {
    if (!beforeProviderRequest) return null;
    try {
      const boundary = await beforeProviderRequest();
      return boundary.actionable
        ? null
        : {
            ok: false,
            cancelledReason: boundary.reason,
            providerRequestStarted: logicalProviderRequestStarted,
          };
    } catch {
      return {
        ok: false,
        error: "provider boundary unavailable",
        providerBoundaryUnavailable: true,
        providerRequestStarted: logicalProviderRequestStarted,
      };
    }
  };

  // Guard: skip if this key was already claimed within the dedup window.
  // CLAIM-then-send (not send-then-record): two concurrent calls with the
  // same key would otherwise both pass a read-only check before either
  // recorded it. The claim is rolled back on failure so retries still work.
  if (idempotencyKey) {
    const now = Date.now();
    const existing = _sentKeys.get(idempotencyKey);
    if (existing && now - existing.at < IDEMPOTENCY_TTL_MS) {
      if (existing.state === "pending") {
        return {
          ok: false,
          error: "send with this idempotency key is already in progress",
          providerRequestStarted: false,
        };
      }
      const boundaryFailure = await checkProviderBoundary(true);
      if (boundaryFailure) return boundaryFailure;
      return {
        ok: true,
        isDuplicate: true,
        providerRequestStarted: true,
      };
    }
    if (existing) _sentKeys.delete(idempotencyKey);
    _sentKeys.set(idempotencyKey, { state: "pending", at: now });
  }

  if (!to || to.trim().length === 0) {
    if (idempotencyKey) _sentKeys.delete(idempotencyKey);
    return {
      ok: false,
      error: "recipient address is empty",
      providerRequestStarted: false,
    };
  }

  const apiKey = process.env.RESEND_API_KEY;

  // Local-dev fallback: no key → log and return ok so callers are unblocked.
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      const boundaryFailure = await checkProviderBoundary(false);
      if (boundaryFailure) {
        if (idempotencyKey) _sentKeys.delete(idempotencyKey);
        return boundaryFailure;
      }
      console.info(
        `[mailer:dev] would send\n  to: ${to}\n  subject: ${subject}\n  idempotencyKey: ${idempotencyKey ?? "(none)"}`,
      );
      if (idempotencyKey) {
        _sentKeys.set(idempotencyKey, { state: "sent", at: Date.now() });
      }
      return { ok: true, providerRequestStarted: false };
    }
    if (idempotencyKey) _sentKeys.delete(idempotencyKey);
    const error = "RESEND_API_KEY is not set";
    console.error(`[mailer] ${error}`);
    return { ok: false, error, providerRequestStarted: false };
  }

  const boundaryFailure = await checkProviderBoundary(false);
  if (boundaryFailure) {
    if (idempotencyKey) _sentKeys.delete(idempotencyKey);
    return boundaryFailure;
  }

  try {
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
    const controller = new AbortController();
    const providerTimeout = setTimeout(
      () => controller.abort(),
      PROVIDER_FETCH_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
          // Provider-side idempotency: the in-memory map above only protects a
          // single process; a worker that crashes after Resend accepts but
          // before the delivery ledger settles gets reclaimed by ANOTHER
          // instance, which would re-send. Resend dedupes on this header for
          // 24h. Hashed: keys can contain non-Latin-1 separators (the engine's
          // dedup_key uses U+241F), which HTTP header values cannot carry.
          ...(idempotencyKey
            ? { "Idempotency-Key": hashIdempotencyKey(idempotencyKey) }
            : {}),
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
          ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(providerTimeout);
    }

    if (!response.ok) {
      if (idempotencyKey) _sentKeys.delete(idempotencyKey);
      const detail = await response.text().catch(() => "");
      const error = `Resend ${response.status}: ${detail.slice(0, 300)}`;
      console.error(`[mailer] send failed: ${error}`);
      return {
        ok: false,
        error,
        status: response.status,
        providerRequestStarted: true,
      };
    }

    let providerMessageId: string | undefined;
    try {
      const payload = (await response.json()) as { id?: unknown };
      if (typeof payload.id === "string") providerMessageId = payload.id;
    } catch {
      // Body is informational only — a success without a parsable id is fine.
    }

    if (idempotencyKey) {
      _sentKeys.set(idempotencyKey, { state: "sent", at: Date.now() });
    }
    return {
      ok: true,
      status: response.status,
      providerMessageId,
      providerRequestStarted: true,
    };
  } catch (err) {
    if (idempotencyKey) _sentKeys.delete(idempotencyKey);
    const error = err instanceof Error ? err.message : "unknown";
    console.error("[mailer] send threw:", err);
    return { ok: false, error, providerRequestStarted: true };
  }
}

// ── Placeholder template helpers (kept for backward compatibility) ────────────

export interface MailTemplate {
  readonly subject: string;
  readonly body: string;
}

export function renderPlaceholderMailTemplate(templateName: string): MailTemplate {
  // TODO: Replace with Resend-backed templates after transactional message
  // rules are approved for implementation.
  return {
    subject: `${templateName} placeholder`,
    body: "TODO: Add canonical email copy and rendering logic.",
  };
}
