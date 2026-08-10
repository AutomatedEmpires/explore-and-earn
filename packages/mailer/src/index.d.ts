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
/** Deterministic ASCII form of a caller idempotency key for the HTTP header. */
export declare function hashIdempotencyKey(key: string): string;
/** Exposed for testing only — resets the in-memory dedup store between tests. */
export declare function _resetDedup(): void;
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
    readonly beforeProviderRequest?: () => Promise<{
        readonly actionable: true;
    } | {
        readonly actionable: false;
        readonly reason: string;
    }>;
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
