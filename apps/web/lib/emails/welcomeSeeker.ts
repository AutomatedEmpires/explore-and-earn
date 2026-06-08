import { renderEmailLayout } from "./layout";

export interface WelcomeSeekerEmailInput {
  /** Optional first name for a personalised greeting. */
  readonly name?: string | null;
  /** CTA target — the seeker discovery surface. */
  readonly exploreUrl: string;
}

/**
 * To a new seeker right after sign-up: what to do next, plus the Housing /
 * Meals / Pay promise that defines every Explore & Earn opportunity.
 */
export function welcomeSeekerEmail({
  name,
  exploreUrl,
}: WelcomeSeekerEmailInput): string {
  const trimmed = name?.trim();
  const heading =
    trimmed && trimmed.length > 0
      ? `Welcome to Explore & Earn, ${trimmed}!`
      : "Welcome to Explore & Earn!";
  return renderEmailLayout({
    heading,
    bodyHtml:
      `<p style="margin:0;">You're in. Explore & Earn connects you with seasonal and adventure work where the essentials are spelled out up front — no guesswork.</p>` +
      `<p style="margin:16px 0 0;font-weight:600;">Here's how to get started:</p>` +
      `<ul style="margin:8px 0 0;padding-left:20px;">` +
      `<li style="margin:0 0 4px;">Browse live opportunities and save the ones that spark something.</li>` +
      `<li style="margin:0;">Complete your profile so hosts can find and invite you.</li>` +
      `</ul>` +
      `<div style="margin:20px 0 0;padding:14px 16px;background-color:#F6F3EC;border-radius:12px;">` +
      `<p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#6E685D;">HOUSING &middot; MEALS &middot; PAY</p>` +
      `<p style="margin:6px 0 0;font-size:14px;line-height:1.5;">Every opportunity tells you exactly where you'll sleep, what you'll eat, and what you'll earn.</p>` +
      `</div>`,
    ctaLabel: "Find your adventure",
    ctaUrl: exploreUrl,
  });
}
