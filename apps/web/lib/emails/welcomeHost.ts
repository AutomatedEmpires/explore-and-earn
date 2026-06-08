import { renderEmailLayout } from "./layout";

export interface WelcomeHostEmailInput {
  /** Optional name (company or contact) for a personalised greeting. */
  readonly name?: string | null;
  /** CTA target — where the host creates their first listing. */
  readonly createListingUrl: string;
}

/**
 * To a new host right after sign-up: confirm the account is ready and point
 * them at creating their first listing.
 */
export function welcomeHostEmail({
  name,
  createListingUrl,
}: WelcomeHostEmailInput): string {
  const trimmed = name?.trim();
  const heading =
    trimmed && trimmed.length > 0
      ? `Your host account is ready, ${trimmed}`
      : "Your host account is ready";
  return renderEmailLayout({
    heading,
    bodyHtml:
      `<p style="margin:0;">Your host account is live. You can now post opportunities and start meeting seekers looking for their next adventure.</p>` +
      `<p style="margin:16px 0 0;font-weight:600;">First steps:</p>` +
      `<ul style="margin:8px 0 0;padding-left:20px;">` +
      `<li style="margin:0 0 4px;">Post your first opportunity with clear Housing, Meals, and Pay details.</li>` +
      `<li style="margin:0;">Invite seekers whose profiles match what you need.</li>` +
      `</ul>`,
    ctaLabel: "Post an opportunity",
    ctaUrl: createListingUrl,
  });
}
