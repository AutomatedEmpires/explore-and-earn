import { escapeHtml, renderEmailLayout } from "./layout";

export interface NewMessageEmailInput {
  readonly senderName: string;
  readonly listingTitle: string;
  /** Message body; truncated to 100 chars for the preview. */
  readonly messagePreview: string;
  readonly conversationUrl: string;
}

const PREVIEW_LIMIT = 100;

/** To recipient: a new message arrived in one of their conversations. */
export function newMessageEmail({
  senderName,
  listingTitle,
  messagePreview,
  conversationUrl,
}: NewMessageEmailInput): string {
  const preview =
    messagePreview.length > PREVIEW_LIMIT
      ? `${messagePreview.slice(0, PREVIEW_LIMIT).trimEnd()}\u2026`
      : messagePreview;
  return renderEmailLayout({
    heading: `New message about ${listingTitle}`,
    bodyHtml: `<p style="margin:0;"><strong>${escapeHtml(senderName)}</strong> sent you a message about <strong>${escapeHtml(listingTitle)}</strong>:</p><p style="margin:12px 0 0;padding:12px 16px;background-color:#F6F3EC;border-radius:12px;">${escapeHtml(preview)}</p>`,
    ctaLabel: "Open conversation",
    ctaUrl: conversationUrl,
  });
}
