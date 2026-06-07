import { escapeHtml, renderEmailLayout } from "./layout";

export interface ApplicationStatusEmailInput {
  readonly listingTitle: string;
  /** Raw persisted status (e.g. "reviewing"); accepted for completeness. */
  readonly newStatus: string;
  /** Human-readable status label shown to the seeker. */
  readonly statusLabel: string;
  readonly dashboardUrl: string;
}

/** To seeker: the host changed the status of their application. */
export function applicationStatusEmail({
  listingTitle,
  statusLabel,
  dashboardUrl,
}: ApplicationStatusEmailInput): string {
  return renderEmailLayout({
    heading: `Update on your application to ${listingTitle}`,
    bodyHtml: `<p style="margin:0;">Your application to <strong>${escapeHtml(listingTitle)}</strong> has a new status: <strong>${escapeHtml(statusLabel)}</strong>.</p>`,
    ctaLabel: "View your applications",
    ctaUrl: dashboardUrl,
  });
}
