// Client-safe messaging types (SP5 spec section 3).
export type ThreadCard = { type: 'application' | 'invite' | 'interview' | 'offer'; refId: string };
export type ThreadEventCode =
  | 'invite_interested'
  | 'application_submitted'
  | 'interview_scheduled'
  | 'interview_canceled'
  | 'interview_completed'
  | 'interview_no_show'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_canceled'
  | 'hired'
  | 'withdrawn';
/**
 * Why a thread is read-only, as its viewer sees it. `unavailable` is shown, never stored: a
 * thread closed by a block reads `blocked` only to the side that made the block, and
 * `unavailable` to the other side (SP4 spec 8.7 and 10).
 */
export type ReadOnlyReason = 'withdrawn' | 'blocked' | 'removed' | 'listing_closed' | 'unavailable';
export type MessageState = 'sending' | 'sent' | 'not_delivered' | 'removed';
export type MessageView = {
  id: string;
  clientId: string | null;
  kind: 'text' | 'card' | 'event';
  mine: boolean;
  senderType: 'seeker' | 'host' | 'system';
  senderFirstName: string | null;
  body: string | null;
  attachments: { mediaId: string; mime: string }[];
  card: ThreadCard | null;
  event: ThreadEventCode | null;
  warn: boolean;
  state: MessageState | null;
  createdAt: string;
};
export type ThreadSummary = {
  threadId: string;
  listingId: string;
  listingTitle: string;
  counterpartName: string;
  counterpartAvatarUrl: string | null;
  lastMessage: { preview: string | null; at: string } | null;
  unread: boolean;
  readOnly: boolean;
};
export type ThreadView = {
  thread: {
    id: string;
    listingId: string;
    listingTitle: string;
    orgId: string;
    orgName: string;
    seekerFirstName: string;
    applicationId: string | null;
    inviteId: string | null;
    hired: boolean;
  };
  messages: MessageView[];
  nextBefore: string | null;
  readOnly: ReadOnlyReason | null;
  canSend: boolean;
};
export type SavedReply = { id: string; title: string; body: string; updatedAt: string };
export type ReplyStats = {
  conversations: number;
  medianFirstReplyMinutes: number | null;
  usuallyRepliesWithinDay: boolean;
};
export type TemplateVars = {
  first_name: string;
  position: string;
  org_name: string;
  my_first_name: string;
};
