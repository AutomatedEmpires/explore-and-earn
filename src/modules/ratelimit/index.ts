// Public API of the ratelimit module: the Postgres fixed-window limiter (spec section 4) that
// apiRoute's `rateLimit` option uses. Owned by W4 (Task 11).
import type { HandlerMap } from '@/modules/jobs';

export {
  NEW_HOST_DAILY_CAP,
  NEW_HOST_DAYS,
  consume,
  consumeNewHostDaily,
  newHostWindowOpen,
  type NewHostAction,
  type RateLimitResult,
} from './limiter';

export const jobHandlers: HandlerMap = {};
