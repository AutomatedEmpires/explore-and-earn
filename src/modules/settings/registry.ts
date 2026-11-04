// Every operator setting: its type, default and validation. Add a key here (all three maps)
// before reading it; the operator console renders one form field per key.
import { z } from 'zod';
import { MIN_WAGE_CENTS_2026 } from '@/lib/min-wage';
import { CATEGORIES, GENRES, type Category } from '@/lib/taxonomy';
import { US_STATE_CODES, type USStateCode } from '@/lib/us-states';

type Thresholds = { approveBelow: number; rejectAtOrAbove: number };

/** A genre as operators manage it; deactivated genres stay valid on existing listings. */
export type GenreSetting = { code: string; label: string; category: Category; active: boolean };

/** The type of every setting, by key. */
export interface SettingValues {
  'limits.invites_per_seeker_per_week': number;
  'trust.thresholds': {
    image_safety: Thresholds;
    text_safety: Thresholds;
    listing_moderation: Thresholds;
    listing_fraud: Thresholds;
    business_verification: Thresholds;
    photo_slot: Thresholds;
  };
  'trust.audit_sample_rate': number;
  'business.mailing_address': string;
  'business.support_email': string;
  'ops.second_signoff_refund_cents': number;
  // SP2: launch, founding hosts, team, listings and link safety.
  /** When public launch happens (ISO instant), or null before it is set. */
  'launch.public_at': string | null;
  'founding.max_hosts': number;
  'founding.free_days': number;
  'founding.return_window_months': number;
  'team.invitation_ttl_days': number;
  'listings.prohibited_phrases': string[];
  'listings.vague_pay_range_ratio': number;
  'listings.min_wage_cents_by_state': Record<USStateCode, number>;
  'listings.genres': GenreSetting[];
  'links.blocked_domains': string[];
  'links.shortener_domains': string[];
  'verification.blocked_domains': string[];
  // SP3: discovery limits (SP3 spec 8.8).
  'discovery.saved_jobs_per_user': number;
  'discovery.saved_searches_per_user': number;
  /** Alert pushes per user per UTC day; over the cap, matches still go to the daily email. */
  'discovery.alert_push_daily_cap': number;
}

export type SettingKey = keyof SettingValues;
export type SettingValue<K extends SettingKey> = SettingValues[K];

export const SETTING_DEFAULTS: { readonly [K in SettingKey]: SettingValues[K] } = {
  'limits.invites_per_seeker_per_week': 10,
  'trust.thresholds': {
    image_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    text_safety: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    listing_moderation: { approveBelow: 0.2, rejectAtOrAbove: 0.9 },
    listing_fraud: { approveBelow: 0.2, rejectAtOrAbove: 0.95 },
    // Never auto-rejected: no score reaches 1.01 (SP2 spec section 8.4).
    business_verification: { approveBelow: 0.3, rejectAtOrAbove: 1.01 },
    // No review band: a photo either matches its slot or it doesn't.
    photo_slot: { approveBelow: 0.5, rejectAtOrAbove: 0.5 },
  },
  'trust.audit_sample_rate': 0.01,
  'business.mailing_address': '',
  'business.support_email': '',
  'ops.second_signoff_refund_cents': 50000,
  'launch.public_at': null,
  'founding.max_hosts': 100,
  'founding.free_days': 90,
  'founding.return_window_months': 6,
  'team.invitation_ttl_days': 7,
  'listings.prohibited_phrases': [
    'US citizens only',
    'U.S. citizens only',
    'citizens only',
    'American citizens only',
    'no foreigners',
    'native English speaker',
  ],
  'listings.vague_pay_range_ratio': 2.5,
  'listings.min_wage_cents_by_state': MIN_WAGE_CENTS_2026,
  'listings.genres': GENRES.map((g) => ({ ...g, active: true })),
  'links.blocked_domains': [],
  'links.shortener_domains': [
    'bit.ly',
    'tinyurl.com',
    't.co',
    'goo.gl',
    'ow.ly',
    'is.gd',
    'buff.ly',
    'rebrand.ly',
    'cutt.ly',
    'shorturl.at',
    'tiny.cc',
    'rb.gy',
    'lnkd.in',
    's.id',
    't.ly',
  ],
  'verification.blocked_domains': [],
  'discovery.saved_jobs_per_user': 1000,
  'discovery.saved_searches_per_user': 20,
  'discovery.alert_push_daily_cap': 5,
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as readonly SettingKey[];

const probability = z.number().min(0).max(1);

// rejectAtOrAbove may be 1.01, above any score, so a kind is never auto-rejected.
const thresholds = z
  .strictObject({ approveBelow: probability, rejectAtOrAbove: z.number().min(0).max(1.01) })
  .refine((t) => t.approveBelow <= t.rejectAtOrAbove, {
    message: 'approveBelow must not be greater than rejectAtOrAbove',
  });

const int = (min: number, max: number) => z.number().int().min(min).max(max);

/** A lowercase hostname (punycode for IDNs), no scheme, port or trailing dot. */
const hostname = z
  .string()
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    'must be a lowercase hostname',
  );
const hostnames = z.array(hostname).max(5000);

const minWages = z.strictObject(
  Object.fromEntries(US_STATE_CODES.map((code) => [code, z.number().int().min(0)])) as Record<
    USStateCode,
    z.ZodNumber
  >,
);

const genres = z
  .array(
    z.strictObject({
      code: z.string().regex(/^[a-z0-9_]+$/, 'must be snake_case'),
      label: z.string().trim().min(1).max(60),
      category: z.enum(CATEGORIES),
      active: z.boolean(),
    }),
  )
  .min(1)
  .max(500)
  .refine((list) => new Set(list.map((g) => g.code)).size === list.length, {
    message: 'genre codes must be unique',
  });

/** Validates a value before it is stored, and again when it is read back. */
export const SETTING_SCHEMAS: { readonly [K in SettingKey]: z.ZodType<SettingValues[K]> } = {
  'limits.invites_per_seeker_per_week': z.number().int().min(0).max(1000),
  // Kinds added after Foundation default when missing, so thresholds stored earlier stay valid.
  'trust.thresholds': z.strictObject({
    image_safety: thresholds,
    text_safety: thresholds,
    listing_moderation: thresholds.default(SETTING_DEFAULTS['trust.thresholds'].listing_moderation),
    listing_fraud: thresholds.default(SETTING_DEFAULTS['trust.thresholds'].listing_fraud),
    business_verification: thresholds.default(
      SETTING_DEFAULTS['trust.thresholds'].business_verification,
    ),
    photo_slot: thresholds.default(SETTING_DEFAULTS['trust.thresholds'].photo_slot),
  }),
  'trust.audit_sample_rate': probability,
  'business.mailing_address': z.string().max(500),
  'business.support_email': z.union([z.literal(''), z.email().max(254)]),
  'ops.second_signoff_refund_cents': z.number().int().min(0),
  'launch.public_at': z.union([z.iso.datetime({ offset: true }), z.null()]),
  'founding.max_hosts': int(0, 1000),
  'founding.free_days': int(1, 365),
  'founding.return_window_months': int(0, 24),
  'team.invitation_ttl_days': int(1, 30),
  'listings.prohibited_phrases': z.array(z.string().trim().min(2).max(100)).min(1).max(200),
  'listings.vague_pay_range_ratio': z.number().min(1).max(10),
  'listings.min_wage_cents_by_state': minWages,
  'listings.genres': genres,
  'links.blocked_domains': hostnames,
  'links.shortener_domains': hostnames,
  'verification.blocked_domains': hostnames,
  'discovery.saved_jobs_per_user': int(1, 100_000),
  'discovery.saved_searches_per_user': int(1, 1000),
  'discovery.alert_push_daily_cap': int(0, 50),
};
