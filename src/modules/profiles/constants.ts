// Profile constants for server code: the client-safe limits (re-exported) and the API's rate
// limits (spec 8.1). apiRoute takes static rate limits, so these are code constants.
export * from '@/lib/profiles/constants';

/** Per user, per 24 hours. Keys are `ai_import:<userId>` and `writing_help:<userId>`. */
export const RATE_LIMITS = {
  aiImport: { key: 'ai_import', limit: 5, windowSec: 86_400 },
  writingHelp: { key: 'writing_help', limit: 30, windowSec: 86_400 },
} as const;
