// W1 replaces these with the export and erasure engine. W0 keeps the signatures.
import type { HandlerMap } from '@/modules/jobs';
import type { HoldScope, PrivacySubject } from './types';
import { stubPrivacyHandler } from './handler-stub';
import { CONSENT_TABLES } from './consent';

const noop: HandlerMap[string] = async () => {};

export const privacyHandler = stubPrivacyHandler('privacy', [...CONSENT_TABLES]);

export async function activeHolds(_db: unknown, _subject: PrivacySubject): Promise<HoldScope[]> {
  return [];
}

export async function isOnLegalHold(
  _db: unknown,
  _input: { userId?: string; orgId?: string; scope: HoldScope },
): Promise<boolean> {
  return false;
}

export function requestExport(_db: unknown, _userId: string): Promise<{ requestId: string }> {
  return Promise.reject(new Error('not implemented: requestExport (W1)'));
}

export function requestDeletion(
  _db: unknown,
  _clerk: unknown,
  _userId: string,
): Promise<{ requestId: string }> {
  return Promise.reject(new Error('not implemented: requestDeletion (W1)'));
}

export const engineJobHandlers: HandlerMap = {
  'privacy.export_step': noop,
  'privacy.export_finalize': noop,
  'privacy.deactivate': noop,
  'privacy.erase_step': noop,
  'privacy.erase_finalize': noop,
  'privacy.ledger_mirror': noop,
  'privacy.request_watch': noop,
};
