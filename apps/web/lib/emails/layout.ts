/**
 * Shared HTML shell for transactional emails.
 *
 * Deliberately plain, inline-styled, mobile-friendly HTML — no CSS framework
 * and no <style> blocks (many clients strip them). Palette values are the
 * LOCKED Explore & Earn brand tokens from apps/web/styles/tokens.css. V1 has no
 * single "primary" token, so the brand ink (#24221E) is used as the primary
 * accent. Hex is inlined because email clients cannot resolve CSS variables.
 */

const BRAND = {
  ink: "#24221E", // --palette-ink: primary/brand accent, headings, button bg
  inkSoft: "#6E685D", // --palette-ink-soft: secondary / footer text
  paper: "#F6F3EC", // --palette-paper: page background
  surface: "#FFFFFF", // --palette-white: card background
  line: "#E7E1D3", // --palette-line: hairline borders
  white: "#FFFFFF",
} as const;

const COMPANY_NAME = "Explore & Earn";

/** Minimal HTML escape for interpolated, user-derived text. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailLayoutOptions {
  /** Plain heading text; escaped by the layout. */
  readonly heading: string;
  /** Body block as safe HTML — callers must escape any dynamic text. */
  readonly bodyHtml: string;
  readonly ctaLabel: string;
  readonly ctaUrl: string;
}

/**
 * Render a complete transactional email document: a top accent line in the
 * brand ink, a card with heading + one body block + a CTA button, and a footer
 * with the unsubscribe note and company name.
 */
export function renderEmailLayout({
  heading,
  bodyHtml,
  ctaLabel,
  ctaUrl,
}: EmailLayoutOptions): string {
  const company = escapeHtml(COMPANY_NAME);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${BRAND.paper};">
    <div style="width:100%;background-color:${BRAND.paper};padding:24px 12px;">
      <div style="max-width:480px;margin:0 auto;background-color:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:24px;overflow:hidden;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
        <div style="height:4px;background-color:${BRAND.ink};"></div>
        <div style="padding:32px 28px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${BRAND.ink};font-weight:600;">${escapeHtml(heading)}</h1>
          <div style="margin:0 0 24px;font-size:16px;line-height:1.5;color:${BRAND.ink};">${bodyHtml}</div>
          <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:${BRAND.ink};color:${BRAND.white};text-decoration:none;font-size:15px;font-weight:600;padding:12px 24px;border-radius:16px;">${escapeHtml(ctaLabel)}</a>
        </div>
        <div style="padding:20px 28px;border-top:1px solid ${BRAND.line};">
          <p style="margin:0;font-size:12px;line-height:1.4;color:${BRAND.inkSoft};">You're receiving this because you have an ${company} account. Manage email preferences in your account settings.</p>
          <p style="margin:8px 0 0;font-size:12px;line-height:1.4;color:${BRAND.inkSoft};">\u00A9 ${company}</p>
        </div>
      </div>
    </div>
  </body>
</html>`;
}
