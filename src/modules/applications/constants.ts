// Application constants for server code: the client-safe limits (re-exported) and the API's
// rate limit (spec 8.1). apiRoute takes static rate limits, so these are code constants.
export * from '@/lib/applications/constants';

/** Per user, per 24 hours. The key is `apply:<userId>`. */
export const RATE_LIMITS = {
  apply: { key: 'apply', limit: 30, windowSec: 86_400 },
} as const;
