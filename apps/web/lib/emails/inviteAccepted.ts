import { escapeHtml, renderEmailLayout } from "./layout";

export interface InviteAcceptedEmailInput {
  readonly seekerName: string;
  readonly listingTitle: string;
  /** Link to the host's applicant pipeline. */
  readonly applicantsUrl: string;
}

/** To host: a seeker accepted their invite and applied to the listing. */
export function inviteAcceptedEmail({
  seekerName,
  listingTitle,
  applicantsUrl,
}: InviteAcceptedEmailInput): string {
  return renderEmailLayout({
    heading: `${seekerName} accepted your invite`,
    bodyHtml: `<p style="margin:0;"><strong>${escapeHtml(seekerName)}</strong> accepted your invite and applied to <strong>${escapeHtml(listingTitle)}</strong>. Review their application to take the next step.</p>`,
    ctaLabel: "Review applicants",
    ctaUrl: applicantsUrl,
  });
}
