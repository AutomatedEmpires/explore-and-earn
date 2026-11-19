// Public API of the messaging module. Importing it registers the message notification.
import { getAttachmentUrl } from './attachments';
import { createBulkMessage } from './bulk';
import { requireMessagingAccess } from './gate';
import { jobHandlers } from './jobs';
import { privacyHandler, retentionRules } from './privacy';
import { markThreadRead, unreadThreadCount } from './reads';
import {
  createSavedReply,
  deleteSavedReply,
  getNotSelectedMessage,
  listSavedReplies,
  setNotSelectedMessage,
  updateSavedReply,
} from './replies';
import { getMessageForReview } from './review';
import { sendHostMessage, sendMessage } from './send';
import { scanHostText } from './scan';
import { getReplyStats } from './stats';
import {
  ensureThread,
  getThread,
  hostRepliesByApplication,
  listThreads,
  markThreadHired,
  postCard,
  postEvent,
  setThreadReadOnly,
  threadIdsForApplications,
} from './threads';
import {
  inScope,
  listingScope,
  listingTeam,
  requireHiringCapability,
} from './access';
import './notification-types';
import './register';

export * from '@/lib/messaging';
export type { ListingScope, ThreadViewer } from './access';
export { messagingItemOwners, type MessagingItemOwners, type MessagingOwnedItem } from './owners';

export {
  createBulkMessage,
  createSavedReply,
  deleteSavedReply,
  ensureThread,
  getAttachmentUrl,
  getMessageForReview,
  getNotSelectedMessage,
  getReplyStats,
  getThread,
  hostRepliesByApplication,
  inScope,
  jobHandlers,
  listSavedReplies,
  listThreads,
  listingScope,
  listingTeam,
  markThreadHired,
  markThreadRead,
  postCard,
  postEvent,
  privacyHandler,
  requireHiringCapability,
  requireMessagingAccess,
  retentionRules,
  scanHostText,
  sendHostMessage,
  sendMessage,
  setNotSelectedMessage,
  setThreadReadOnly,
  threadIdsForApplications,
  unreadThreadCount,
  updateSavedReply,
};
