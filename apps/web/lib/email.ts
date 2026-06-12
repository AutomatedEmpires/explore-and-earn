/**
 * Transactional email sender — thin app-layer wrapper over @explore-and-earn/mailer.
 *
 * Responsibilities here (vs. in packages/mailer):
 *   • Accept the app-level `SendEmailOptions` (adds `template` + `idempotencyKey`).
 *   • Write a fire-and-forget audit row to email_log via the service-role client.
 *   • Delegate the actual transport (Resend API call, idempotency guard) to
 *     `sendMail` in packages/mailer, which never throws.
 *
 * Contract: sendEmail NEVER throws and returns { ok: false } on any failure so
 * a notification send can never break the user-facing action that triggered it.
 *
 * Dev mode: when RESEND_API_KEY is absent and NODE_ENV !== "production", the
 * mailer logs to the console instead of sending.
 *
 * Env:
 *   - RESEND_API_KEY    (required to actually send) server-only; never exposed
 *   - RESEND_FROM_EMAIL (optional) From header override
 *   - NEXT_PUBLIC_APP_URL (optional) base URL used by absoluteUrl()
 */

import { sendMail } from "@explore-and-earn/mailer";

import { adminClient } from "@explore-and-earn/db";

export interface SendEmailOptions {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  /**
   * Optional template identifier recorded as email_log.template_name. This is
   * additive and OPTIONAL: existing callers that pass only { to, subject, html }
   * are unaffected (the { to, subject, html } -> { ok } contract is unchanged)
   * and fall back to the subject line for the audit log.
   */
  readonly template?: string;
  /**
   * Optional idempotency key forwarded to the mailer transport. When set,
   * duplicate sends within the 5-minute dedup window are silently dropped so
   * retried server actions do not double-email recipients.
   *
   * Use a stable string that identifies the send event uniquely, e.g.
   * `"applicationStatus:<applicationId>:<newStatus>"`.
   */
  readonly idempotencyKey?: string;
}

/**
 * Build an absolute URL for links embedded in emails. Defaults to the public
 * site origin when NEXT_PUBLIC_APP_URL is not set.
 */
export function absoluteUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ||
    "https://exploreandearn.com";
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Minimal structural view of the service-role client used only for the
 * email_log insert. email_log is intentionally absent from the generated
 * Database types, so we narrow to just the insert path we need rather than
 * widening types.gen.ts.
 */
type EmailLogWriter = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>) => PromiseLike<unknown>;
  };
};

interface EmailLogEntry {
  readonly templateName: string;
  readonly recipientEmail: string;
  readonly ok: boolean;
  readonly error?: string;
}

/**
 * Fire-and-forget audit write. Uses the service-role client (which bypasses
 * RLS; email_log has RLS enabled with no user-facing policy). Best-effort:
 * never throws and never blocks the send — callers invoke it with `void`. In
 * environments without a service-role key (local dev) adminClient throws and we
 * simply swallow it.
 */
async function insertEmailLog(entry: EmailLogEntry): Promise<void> {
  try {
    const db = adminClient() as unknown as EmailLogWriter;
    await db.from("email_log").insert({
      template_name: entry.templateName,
      recipient_email: entry.recipientEmail,
      ok: entry.ok,
      error: entry.error ?? null,
    });
  } catch (error) {
    console.error("[email] email_log insert failed (non-fatal):", error);
  }
}

/**
 * Send a transactional email.
 *
 * Contract: NEVER throws; returns { ok: false } on any failure so a broken
 * send can never crash the server action that triggered it.
 *
 * Delegates transport to `sendMail` from @explore-and-earn/mailer, which
 * handles the Resend API call, error catching, and idempotency dedup. This
 * layer adds the email_log audit write on top.
 */
export async function sendEmail(
  opts: SendEmailOptions,
): Promise<{ ok: boolean }> {
  const { to, subject, idempotencyKey } = opts;
  const templateName = opts.template ?? subject;

  const result = await sendMail({
    to,
    subject,
    html: opts.html,
    idempotencyKey,
  });

  // Deduplicated sends: the original send was already logged. Skipping the
  // audit write avoids a spurious second row that would inflate send counts
  // in the email_log table and misrepresent actual Resend API calls made.
  if (result.isDuplicate) {
    return { ok: true };
  }

  void insertEmailLog({
    templateName,
    recipientEmail: to,
    ok: result.ok,
    error: result.error,
  });

  return { ok: result.ok };
}
