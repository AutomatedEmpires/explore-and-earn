export const NOT_SELECTED_DEFAULT =
  "Hi {first_name}, thank you for applying for {position} at {org_name}. We've decided to move forward with other candidates for this role. We wish you the best with your search.";

export const SCAM_BANNER = {
  title: 'Never pay to get a job',
  body: 'Explore&Earn employers never ask for money, gift cards, or bank or Social Security details before hiring.',
};

export const EMPTY = {
  hostThreads: 'No conversations yet. Threads start when someone applies or answers Interested.',
  seekerThreads: 'No messages yet',
  savedReplies: 'No saved replies yet',
};

export const READ_ONLY = 'This conversation is read-only';
export const MESSAGE_STATE_LABELS = {
  sending: 'Sending…',
  sent: 'Sent',
  not_delivered: 'Not delivered',
} as const;
export const SCANNING = 'Scanning…';
export const DELETED_BODY = '[deleted]';
export const DELETED_USER = 'Deleted user';
export const REPLY_IN_APP = 'Reply in app';
export const USUALLY_REPLIES = 'Usually replies within a day';

export const ATTACHMENT_LABELS = { pdf: 'PDF', image: 'Photo' } as const;

export function attachmentLabel(mime: string): 'PDF' | 'Photo' {
  if (mime === 'application/pdf') return ATTACHMENT_LABELS.pdf;
  return ATTACHMENT_LABELS.image;
}
