// Public API of the support module. W4 replaces the stubs.
import type { HandlerMap } from '@/modules/jobs';
import { jobHandlers as stubHandlers } from './stubs';
import './notification-types';

export { privacyHandler, retentionRules, supportTicketStats } from './stubs';
export * from './ports';

export const jobHandlers: HandlerMap = { ...stubHandlers };
