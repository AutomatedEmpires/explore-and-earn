// Public API of the privacy module. Barrels are re-exported so later workstreams edit one file each.
import type { HandlerMap } from '@/modules/jobs';
import { engineJobHandlers } from './engine';
import { retentionJobHandlers } from './retention';

import './notification-types';

export type {
  EraseResult,
  ExportPart,
  HoldScope,
  MediaColumnRef,
  PrivacyHandler,
  PrivacySubject,
  RetainReason,
  RetentionRule,
} from './types';
export { HOLD_SCOPES, RETAIN_REASONS } from './types';
export { PRIVACY_EXEMPT_TABLES } from './exempt';
export { stubPrivacyHandler } from './handler-stub';
export * from './consent-cookie';
export * from './engine';
export * from './retention';
export * from './consent';
export * from './ports';

let registry: Promise<import('@/server/privacy-registry').PrivacyRegistry> | null = null;

/** The process-wide registry. Loaded after every module has exported its handler. */
export function loadPrivacyRegistry(): Promise<
  import('@/server/privacy-registry').PrivacyRegistry
> {
  registry ??= import('@/server/privacy-registry').then((mod) => mod.privacyRegistry);
  return registry;
}

export const jobHandlers: HandlerMap = { ...engineJobHandlers, ...retentionJobHandlers };
