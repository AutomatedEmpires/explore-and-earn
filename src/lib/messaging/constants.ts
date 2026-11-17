export const MESSAGES = {
  bodyMax: 4000,
  maxAttachments: 5,
  previewMax: 140,
  readOnlyAfterCloseDays: 90,
  emailDelayMinutes: 15,
};
export const SAVED_REPLIES = { max: 20, titleMax: 60, bodyMax: 2000 };
export const BULK = { maxRecipients: 200 };
export const REPLY_STATS = {
  windowDays: 180,
  capDays: 7,
  minAgeHours: 24,
  minConversations: 10,
  withinDayMinutes: 1440,
};
export const RATE_LIMITS = {
  messages: { limit: 60, windowSec: 600 },
  bulk: { limit: 5, windowSec: 3600 },
};
