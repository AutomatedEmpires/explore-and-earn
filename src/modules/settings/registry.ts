// Every operator setting: its type, default and validation. Add a key here (all three maps)
// before reading it; the operator console renders one form field per key.
import { z } from 'zod';

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

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as readonly SettingKey[];

const probability = z.number().min(0).max(1);

const thresholds = z
  .strictObject({ approveBelow: probability, rejectAtOrAbove: probability })
  .refine((t) => t.approveBelow <= t.rejectAtOrAbove, {
    message: 'approveBelow must not be greater than rejectAtOrAbove',
  });

/** Validates a value before it is stored, and again when it is read back. */
export const SETTING_SCHEMAS: { readonly [K in SettingKey]: z.ZodType<SettingValues[K]> } = {
  'limits.invites_per_seeker_per_week': z.number().int().min(0).max(1000),
  'trust.thresholds': z.strictObject({ image_safety: thresholds, text_safety: thresholds }),
  'trust.audit_sample_rate': probability,
  'business.mailing_address': z.string().max(500),
  'business.support_email': z.union([z.literal(''), z.email().max(254)]),
  'ops.second_signoff_refund_cents': z.number().int().min(0),
};
