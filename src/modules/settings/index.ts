// Public API of the settings module (typed operator settings). Owned by W3 (Task 10).
import type { DbOrTx } from '@/lib/db';
import type { HandlerMap } from '@/modules/jobs';

type Thresholds = { approveBelow: number; rejectAtOrAbove: number };

/** The type of every setting, by key. */
export interface SettingValues {
  'limits.invites_per_seeker_per_week': number;
  'trust.thresholds': { image_safety: Thresholds; text_safety: Thresholds };
  'trust.audit_sample_rate': number;
  'business.mailing_address': string;
  'business.support_email': string;
  'ops.second_signoff_refund_cents': number;
}

export type SettingKey = keyof SettingValues;
export type SettingValue<K extends SettingKey> = SettingValues[K];

export const SETTING_DEFAULTS: { readonly [K in SettingKey]: SettingValues[K] } = {
  'limits.invites_per_seeker_per_week': 10,
  'trust.thresholds': {
    image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
  },
  'trust.audit_sample_rate': 0.01,
  'business.mailing_address': '',
  'business.support_email': '',
  'ops.second_signoff_refund_cents': 50000,
};

/** Reads a setting, falling back to its default. Stub (always the default): Task 10 replaces it. */
export async function getSetting<K extends SettingKey>(
  _db: DbOrTx,
  key: K,
): Promise<SettingValue<K>> {
  return structuredClone(SETTING_DEFAULTS[key]);
}

export const jobHandlers: HandlerMap = {};
