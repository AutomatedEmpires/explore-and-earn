// W2 replaces the sweep. The rule list is the core rules plus consent's.
import type { HandlerMap } from '@/modules/jobs';
import type { RetentionRule } from './types';
import { consentRetentionRules } from './consent-rules';
import { coreRetentionRules } from './retention-rules';

const noop: HandlerMap[string] = async () => {};

export const retentionRules: RetentionRule[] = [...coreRetentionRules, ...consentRetentionRules];

export const retentionJobHandlers: HandlerMap = {
  'privacy.retention_sweep': noop,
  'privacy.retention_rule': noop,
};
