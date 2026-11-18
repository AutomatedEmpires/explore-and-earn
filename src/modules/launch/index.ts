// Public API of the launch module. W6 replaces the stubs.
import type { HandlerMap } from '@/modules/jobs';
import { jobHandlers as stubHandlers } from './stubs';

export {
  getLaunchModeCached,
  getLaunchState,
  privacyHandler,
  retentionRules,
  type LaunchState,
} from './stubs';
export * from './ports';

export const jobHandlers: HandlerMap = { ...stubHandlers };
