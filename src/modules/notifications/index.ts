// Public API of the notifications module (in-app, email, push). Owned by W6 (Tasks 17-19).
import type { HandlerMap } from '@/modules/jobs';
import { FLUSH_TOPIC, flushBatches } from './batches';
import { sendEmailJob } from './email/send';
import { EMAIL_TOPIC } from './notify';

export {
  EMAIL_TOPIC,
  PUSH_TOPIC,
  getPreferences,
  isEmailSuppressed,
  listNotifications,
  markRead,
  notify,
  setPreference,
  suppressEmail,
  unreadCount,
  type NotificationItem,
  type Preferences,
  type SuppressionReason,
} from './notify';

export {
  CATEGORIES,
  CATEGORY_LABELS,
  CHANNELS,
  EMAIL_TEMPLATE_NAMES,
  MANDATORY_CATEGORIES,
  defineType,
  getType,
  isMandatory,
  type Category,
  type Channel,
  type EmailTemplateName,
  type NotificationData,
  type NotificationTypeDef,
} from './types';

export { FLUSH_TOPIC, flushBatches } from './batches';

export {
  getEmailProvider,
  resendEmailProvider,
  sendEmailJob,
  stubEmailProvider,
  stubOutbox,
  type EmailProvider,
  type Message,
} from './email/send';

export {
  buildUnsubscribeToken,
  unsubscribe,
  unsubscribeUrl,
  verifyUnsubscribeToken,
} from './email/unsubscribe';

export const jobHandlers: HandlerMap = {
  [EMAIL_TOPIC]: async (payload, { db }) => {
    await sendEmailJob(db, payload);
  },
  [FLUSH_TOPIC]: async (_payload, { db, now }) => {
    await flushBatches(db, now);
  },
};
