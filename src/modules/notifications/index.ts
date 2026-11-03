// Public API of the notifications module (in-app, email, push). Owned by W6 (Tasks 17-19).
import type { HandlerMap } from '@/modules/jobs';

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

export const jobHandlers: HandlerMap = {};
