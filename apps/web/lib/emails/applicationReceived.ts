import { escapeHtml, renderEmailLayout } from "./layout";

export interface ApplicationReceivedEmailInput {
  readonly seekerName: string;
  readonly listingTitle: string;
  readonly reviewUrl: string;
}

/** To host: a seeker applied to one of their listings. */
export function applicationReceivedEmail({
  seekerName,
  listingTitle,
  reviewUrl,
}: ApplicationReceivedEmailInput): string {
  return renderEmailLayout({
    heading: `${seekerName} applied to ${listingTitle}`,
    bodyHtml: `<p style="margin:0;">${escapeHtml(seekerName)} just applied to <strong>${escapeHtml(listingTitle)}</strong>. Review their application and resume to decide on next steps.</p>`,
    ctaLabel: "Review applicants",
    ctaUrl: reviewUrl,
  });
}
