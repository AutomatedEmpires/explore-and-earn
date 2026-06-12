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
 *   RESEND_API_KEY    — required to send; omit for local dev (logs to console)
 *   RESEND_FROM_EMAIL — optional From header override
 */
/** Exposed for testing only — resets the in-memory dedup store between tests. */
export declare function _resetDedup(): void;
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
export declare function sendMail(opts: SendMailOptions): Promise<SendMailResult>;
export interface MailTemplate {
    readonly subject: string;
    readonly body: string;
}
export declare function renderPlaceholderMailTemplate(templateName: string): MailTemplate;
