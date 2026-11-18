// Public API of the content module. W4 and W5 fill the barrels; this file only re-exports them.
import type { HandlerMap } from '@/modules/jobs';
import { legalJobHandlers } from './legal-exports';
import './notification-types';

export * from './help-exports';
export * from './legal-exports';

export const jobHandlers: HandlerMap = { ...legalJobHandlers };
