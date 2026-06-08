/**
 * Transactional email sender (Resend).
 *
 * Best-effort by contract: this NEVER throws and returns { ok: false } on any
 * failure, so a notification send can never break the user-facing action that
 * triggered it.
 *
 * Transport: we call the Resend REST API directly with fetch rather than taking
 * a hard dependency on an SDK. This keeps the web app email-capable without a
 * new package to install in the monorepo, and remains a drop-in for the
 * `resend` SDK later if desired. (Brief asked for `@resend/node`; the published
 * package is `resend` — see PR notes.)
 *
 * DEV MODE: when NODE_ENV !== "production" and no RESEND_API_KEY is set, the
 * email is logged to the console instead of being sent, so local development
 * works without any Resend setup.
 *
 * AUDIT LOG: every real send attempt is recorded fire-and-forget in the
 * email_log table via the Supabase service-role client (adminClient). The log
 * write is best-effort and never blocks or fails a send. In dev (no service
 * role key) the write is skipped silently.
 *
 * Env:
 *   - RESEND_API_KEY    (required to actually send) server-only; never exposed
 *   - RESEND_FROM_EMAIL (optional) From header override
 *   - NEXT_PUBLIC_APP_URL (optional) base URL used by absoluteUrl()
 */

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
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Default From address. Uses the product sender once the domain is verified in
 * Resend; override with RESEND_FROM_EMAIL (e.g. noreply@automatedempires.com)
 * until exploreandearn.com is configured.
 */
const DEFAULT_FROM = "Explore & Earn <notifications@exploreandearn.com>";

function resolveFrom(): string {
  const fromEnv = process.env.RESEND_FROM_EMAIL;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv : DEFAULT_FROM;
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

export async function sendEmail(
  opts: SendEmailOptions,
): Promise<{ ok: boolean }> {
  const { to, subject, html } = opts;
  const templateName = opts.template ?? subject;
  const apiKey = process.env.RESEND_API_KEY;

  // Local-dev fallback: no key outside production -> log instead of send.
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[email:dev] would send email\n  to: ${to}\n  subject: ${subject}\n  html:\n${html}`,
      );
      return { ok: true };
    }
    // Production without a key: nothing we can do, but never throw.
    console.error("[email] RESEND_API_KEY is not set; skipping send.");
    void insertEmailLog({
      templateName,
      recipientEmail: to,
      ok: false,
      error: "RESEND_API_KEY is not set",
    });
    return { ok: false };
  }

  if (!to || to.trim().length === 0) {
    return { ok: false };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: resolveFrom(),
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[email] Resend responded ${response.status}: ${detail.slice(0, 500)}`,
      );
      void insertEmailLog({
        templateName,
        recipientEmail: to,
        ok: false,
        error: `Resend ${response.status}: ${detail.slice(0, 300)}`,
      });
      return { ok: false };
    }

    void insertEmailLog({ templateName, recipientEmail: to, ok: true });
    return { ok: true };
  } catch (error) {
    console.error("[email] send failed:", error);
    void insertEmailLog({
      templateName,
      recipientEmail: to,
      ok: false,
      error: error instanceof Error ? error.message : "unknown",
    });
    return { ok: false };
  }
}
