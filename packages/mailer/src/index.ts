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

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Explore & Earn <notifications@exploreandearn.com>";
const IDEMPOTENCY_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** In-process dedup store: idempotencyKey → timestamp of last successful send. */
const _sentKeys = new Map<string, number>();

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
  /**
   * When set, duplicate sends within the 5-minute TTL window are silently
   * dropped. Use a string that uniquely identifies the send event, e.g.
   * `"applicationStatus:<applicationId>:<newStatus>"`.
   */
  readonly idempotencyKey?: string;
}

export interface SendMailResult {
  readonly ok: boolean;
  readonly error?: string;
  /** True when the send was skipped because an identical send was already recorded within the TTL. */
  readonly isDuplicate?: boolean;
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
  const { to, subject, html, idempotencyKey } = opts;
  const from = resolveFrom(opts.from);

  // Guard: skip if we already sent this within the dedup window.
  if (idempotencyKey) {
    const lastSent = _sentKeys.get(idempotencyKey);
    if (lastSent !== undefined && Date.now() - lastSent < IDEMPOTENCY_TTL_MS) {
      return { ok: true, isDuplicate: true };
    }
  }

  if (!to || to.trim().length === 0) {
    return { ok: false, error: "recipient address is empty" };
  }

  const apiKey = process.env.RESEND_API_KEY;

  // Local-dev fallback: no key → log and return ok so callers are unblocked.
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[mailer:dev] would send\n  to: ${to}\n  subject: ${subject}\n  idempotencyKey: ${idempotencyKey ?? "(none)"}`,
      );
      if (idempotencyKey) _sentKeys.set(idempotencyKey, Date.now());
      return { ok: true };
    }
    const error = "RESEND_API_KEY is not set";
    console.error(`[mailer] ${error}`);
    return { ok: false, error };
  }

  try {
    const replyTo = process.env.RESEND_REPLY_TO_EMAIL?.trim();
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const error = `Resend ${response.status}: ${detail.slice(0, 300)}`;
      console.error(`[mailer] send failed: ${error}`);
      return { ok: false, error };
    }

    if (idempotencyKey) _sentKeys.set(idempotencyKey, Date.now());
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "unknown";
    console.error("[mailer] send threw:", err);
    return { ok: false, error };
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
