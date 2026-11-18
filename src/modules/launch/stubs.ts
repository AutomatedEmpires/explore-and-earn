// Neutral launch stubs. W6 replaces this file.
import type { HandlerMap } from '@/modules/jobs';
import type { DbOrTx } from '@/lib/db';
import { stubPrivacyHandler, type RetentionRule } from '@/modules/privacy';

const noop: HandlerMap[string] = async () => {};

export type LaunchState = { mode: 'private' | 'public'; publicAt: Date | null };

export async function getLaunchState(_db: DbOrTx): Promise<LaunchState> {
  return { mode: 'private', publicAt: null };
}

export function getLaunchModeCached(): 'private' | 'public' {
  return 'private';
}

export const privacyHandler = stubPrivacyHandler('launch', []);

export const retentionRules: RetentionRule[] = [];

export const jobHandlers: HandlerMap = {
  'launch.check': noop,
  'launch.went_public': noop,
};
