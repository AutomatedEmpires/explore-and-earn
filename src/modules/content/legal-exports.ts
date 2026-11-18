// W5 fills legal documents and acceptances.
import type { HandlerMap } from '@/modules/jobs';
import type { DbOrTx } from '@/lib/db';
import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';
import { HELP_TABLES } from './help-exports';

const noop: HandlerMap[string] = async () => {};

export async function getConsentNotBefore(_db: DbOrTx): Promise<Date | null> {
  return null;
}

export async function pendingAcceptances(_db: DbOrTx, _userId: string): Promise<unknown[]> {
  return [];
}

export const privacyHandler = stubPrivacyHandler('content', [...HELP_TABLES]);

export const retentionRules: RetentionRule[] = [];

export const legalJobHandlers: HandlerMap = {
  'content.legal_effective': noop,
  'content.legal_notify_chunk': noop,
};
