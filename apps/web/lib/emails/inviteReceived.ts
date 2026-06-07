import { escapeHtml, renderEmailLayout } from "./layout";

export interface InviteReceivedEmailInput {
  readonly hostCompany: string;
  readonly listingTitle: string;
  readonly message: string | null;
  readonly invitesUrl: string;
}

/** To seeker: a host invited them to apply to a listing. */
export function inviteReceivedEmail({
  hostCompany,
  listingTitle,
  message,
  invitesUrl,
}: InviteReceivedEmailInput): string {
  const trimmed = message?.trim();
  const messageBlock =
    trimmed && trimmed.length > 0
      ? `<p style="margin:12px 0 0;padding:12px 16px;background-color:#F6F3EC;border-radius:12px;font-style:italic;">${escapeHtml(trimmed)}</p>`
      : "";
  return renderEmailLayout({
    heading: `${hostCompany} invited you to apply to ${listingTitle}`,
    bodyHtml: `<p style="margin:0;"><strong>${escapeHtml(hostCompany)}</strong> invited you to apply to <strong>${escapeHtml(listingTitle)}</strong>.</p>${messageBlock}`,
    ctaLabel: "View invite",
    ctaUrl: invitesUrl,
  });
}
