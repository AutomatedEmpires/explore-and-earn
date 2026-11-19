// Neutral support stubs. W4 replaces this file.
import type { HandlerMap } from '@/modules/jobs';
import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

const noop: HandlerMap[string] = async () => {};

export async function supportTicketStats(
  _db: unknown,
): Promise<{ resolved: number; autoResolved: number }> {
  return { resolved: 0, autoResolved: 0 };
}

export const privacyHandler = stubPrivacyHandler('support', []);

export const retentionRules: RetentionRule[] = [];

export const jobHandlers: HandlerMap = {
  'support.ai_triage': noop,
  'support.auto_resolve': noop,
  'support.enterprise_onboarding': noop,
};
