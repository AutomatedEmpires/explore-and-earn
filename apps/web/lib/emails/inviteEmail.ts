import { escapeHtml, renderEmailLayout } from "./layout";

export interface InviteEmailInput {
  /** Host company name / display name shown in the heading. */
  readonly hostName: string;
  readonly listingTitle: string;
  readonly listingLocation: string;
  /** Optional personalised message from the host. */
  readonly message: string | null;
  /** Direct link to the invite (e.g. /invites or /invites/{id}). */
  readonly inviteUrl: string;
}

/** To seeker: a host has invited them to apply to a specific listing. */
export function inviteEmail({
  hostName,
  listingTitle,
  listingLocation,
  message,
  inviteUrl,
}: InviteEmailInput): string {
  const trimmed = message?.trim();
  const messageBlock =
    trimmed && trimmed.length > 0
      ? `<p style="margin:12px 0 0;padding:12px 16px;background-color:#F6F3EC;border-radius:12px;font-style:italic;">${escapeHtml(trimmed)}</p>`
      : "";
  return renderEmailLayout({
    heading: `${hostName} invited you to apply to ${listingTitle}`,
    bodyHtml:
      `<p style="margin:0;"><strong>${escapeHtml(hostName)}</strong> invited you to apply to <strong>${escapeHtml(listingTitle)}</strong> in ${escapeHtml(listingLocation)}.</p>` +
      messageBlock,
    ctaLabel: "View invite",
    ctaUrl: inviteUrl,
  });
}
