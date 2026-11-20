// Saved-search matching, the alert push and the daily and weekly emails (SP3 spec 6 and 8.10).
// W0 stub: W4 replaces it (Tasks 29 and 30). The scheduled topics are acknowledged until then.
import type { HandlerMap } from '@/modules/jobs';

const noop = async () => {};

export const alertHandlers: HandlerMap = {
  'discovery.alerts_match': noop,
  'discovery.alerts_daily': noop,
  'discovery.alerts_weekly': noop,
};
