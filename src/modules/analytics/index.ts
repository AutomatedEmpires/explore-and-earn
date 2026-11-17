// Public API of the analytics module. Client code imports @/lib/host-analytics, not this file.
import type { HandlerMap } from '@/modules/jobs';
import { getBoostWindows, registerBoostWindowsSource } from './boost';
import { toAnalyticsCsv } from './csv';
import { getHostAnalytics } from './host';
import { privacyHandler, retentionRules } from './privacy';
import { resolveRange } from './ranges';

export * from '@/lib/host-analytics';
export type { BoostWindow, BoostWindowsSource } from './boost';

export const jobHandlers: HandlerMap = {};

export {
  getBoostWindows,
  getHostAnalytics,
  privacyHandler,
  registerBoostWindowsSource,
  resolveRange,
  retentionRules,
  toAnalyticsCsv,
};
