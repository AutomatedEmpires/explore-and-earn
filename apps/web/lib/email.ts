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
 * Env:
 *   - RESEND_API_KEY    (required to actually send) server-only; never exposed
 *   - RESEND_FROM_EMAIL (optional) From header override
 *   - NEXT_PUBLIC_APP_URL (optional) base URL used by absoluteUrl()
 */

export interface SendEmailOptions {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
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

export async function sendEmail(
  opts: SendEmailOptions,
): Promise<{ ok: boolean }> {
  const { to, subject, html } = opts;
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
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    console.error("[email] send failed:", error);
    return { ok: false };
  }
}
