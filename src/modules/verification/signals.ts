// The signals business verification weighs (SP2 spec 8.4): the owner's email domain and
// whether it's a free or disposable provider, whether the website answers over HTTPS and
// shares the email domain, the domain's age from RDAP, the card checks Stripe ran, whether a
// location is in the US, and the operator blocklist. Collecting never fails on a lookup: a
// failed website fetch is "not reachable" and a failed RDAP lookup is "age unknown".
//
// The legal review's section 7 signals come from the card on file (billing): its fingerprint
// against the banned list, and its country and cardholder name against the business. Sign-up
// collects no device or phone value yet, so those two are checked only when a caller passes
// them. Fingerprints are stored and compared by `fingerprintValue`: a Stripe card print exactly
// (it is case-sensitive), a device or phone trimmed and lowercased.
import { and, eq, or } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { US_STATE_CODES } from '@/lib/us-states';
import { getCardChecks } from '@/modules/billing';
import { listOrgLocations } from '@/modules/locations';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { getSetting } from '@/modules/settings';
import { safeFetchText } from './safe-fetch';
import {
  FINGERPRINT_KINDS,
  verificationBannedFingerprints,
  verificationBrandContacts,
} from './schema';

export type VerificationSignals = {
  emailDomain: string | null;
  freeEmail: boolean;
  disposableEmail: boolean;
  /** null when the org has no website. */
  websiteReachable: boolean | null;
  /** null when the org has no website or the owner no email. */
  domainMatch: boolean | null;
  domainAgeDays: number | null;
  cvcCheck: string | null;
  postalCheck: string | null;
  hasCard: boolean;
  locationInUs: boolean;
  blockedDomain: boolean;
  /** The website's visible text (at most 5,000 characters), when it answered with a 2xx. */
  websiteText: string | null;
  /** True when the domain was registered before the account. Null when the date is unknown. */
  domainPredatesAccount: boolean | null;
  /** Null when the card country or the business country is unknown. */
  cardCountryFits: boolean | null;
  /** Null when the card has no name. */
  cardNameFits: boolean | null;
  /** True when the card, device or phone is on the banned-fingerprint list. */
  bannedFingerprint: boolean;
  /** True when the org name matches a known brand and the email is not that brand's careers contact. */
  brandCareersMismatch: boolean;
};

export type HardFlag = 'blocked_domain' | 'disposable_email' | 'cvc_failed';

export type HostFingerprints = {
  card?: string | null;
  device?: string | null;
  phone?: string | null;
};

export type CardProfile = { country: string | null; name: string | null };

export type SignalDeps = {
  fetchText: typeof safeFetchText;
  rdapRegisteredAt: (domain: string) => Promise<Date | null>;
  now: Date;
  /**
   * A device or phone value to check against the banned list. Sign-up collects neither yet, so
   * the production run passes none. The card print always comes from the card on file.
   */
  fingerprints?: Pick<HostFingerprints, 'device' | 'phone'>;
};

/** Free email providers: an address there says nothing about the business's own domain. */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
]);

const DAY_MS = 86_400_000;
const RDAP_TIMEOUT_MS = 5_000;

/** Lowercase letters, digits and hyphens in dot-separated labels, with a TLD of 2+ letters. */
const DOMAIN = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/** Special-use names (RFC 2606 and 6761) that never have registration data. */
const RESERVED_TLDS = new Set(['test', 'example', 'invalid', 'localhost', 'local', 'internal']);
const RESERVED_DOMAINS = new Set(['example.com', 'example.net', 'example.org']);

/** Lowercase, without a trailing dot. */
function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, '');
}

/** `a.b.example.com` -> [`a.b.example.com`, `b.example.com`, `example.com`]. */
function withParents(domain: string): string[] {
  const labels = domain.split('.');
  const out: string[] = [];
  for (let i = 0; i < labels.length - 1; i++) out.push(labels.slice(i).join('.'));
  return out;
}

function isReserved(domain: string): boolean {
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return RESERVED_TLDS.has(tld) || withParents(domain).some((d) => RESERVED_DOMAINS.has(d));
}

let disposable: Promise<ReadonlySet<string>> | undefined;

/** The `disposable-email-domains` list, loaded on first use (it holds 100,000+ domains). */
function disposableDomains(): Promise<ReadonlySet<string>> {
  disposable ??= import('disposable-email-domains').then(
    (m) => new Set((m.default as string[]).map(normalizeHost)),
  );
  return disposable;
}

/** The website's host, lowercased, without a trailing dot or a leading `www.`. */
function websiteHost(websiteUrl: string): string | null {
  try {
    return normalizeHost(new URL(websiteUrl).hostname).replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

function emailDomainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  const domain = at >= 0 ? normalizeHost(email.slice(at + 1)) : '';
  return domain || null;
}

const rdapResponse = z.object({
  events: z
    .array(z.object({ eventAction: z.string(), eventDate: z.string() }).loose())
    .optional(),
});

/**
 * When `domain` was registered, from the `registration` event of
 * `https://rdap.org/domain/<domain>` (5 s timeout). Any failure, a reserved or malformed name,
 * or a missing event gives null: a missing domain age is a neutral signal.
 */
export async function rdapRegisteredAt(
  domain: string,
  o: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<Date | null> {
  const d = normalizeHost(domain);
  if (!DOMAIN.test(d) || isReserved(d)) return null;
  try {
    const res = await (o.fetch ?? fetch)(`https://rdap.org/domain/${encodeURIComponent(d)}`, {
      headers: { accept: 'application/rdap+json, application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(o.timeoutMs ?? RDAP_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const parsed = rdapResponse.safeParse(await res.json());
    if (!parsed.success) return null;
    const event = parsed.data.events?.find((e) => e.eventAction === 'registration');
    if (!event) return null;
    const at = new Date(event.eventDate);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

/**
 * The production dependencies: the SSRF-safe fetch and the RDAP client. The card's print,
 * country and name need no dependency: collectSignals reads them from billing's card on file.
 */
export function defaultSignalDeps(now: Date = new Date()): SignalDeps {
  return {
    fetchText: (url, deps) => safeFetchText(url, deps),
    rdapRegisteredAt: (domain) => rdapRegisteredAt(domain),
    now,
  };
}

async function websiteSignals(
  websiteUrl: string | null,
  fetchText: SignalDeps['fetchText'],
): Promise<{ reachable: boolean | null; text: string | null }> {
  if (!websiteUrl) return { reachable: null, text: null };
  try {
    const res = await fetchText(websiteUrl);
    const ok = res.status >= 200 && res.status < 300;
    return { reachable: ok, text: ok && res.text ? res.text : null };
  } catch {
    return { reachable: false, text: null };
  }
}

async function domainFacts(
  domain: string | null,
  deps: SignalDeps,
): Promise<{ days: number | null; registeredAt: Date | null }> {
  if (!domain || isReserved(domain)) return { days: null, registeredAt: null };
  try {
    const at = await deps.rdapRegisteredAt(domain);
    if (!at) return { days: null, registeredAt: null };
    return {
      registeredAt: at,
      days: Math.max(0, Math.floor((deps.now.getTime() - at.getTime()) / DAY_MS)),
    };
  } catch {
    return { days: null, registeredAt: null };
  }
}

/** True when the domain was registered before the account existed. Null when the date is unknown. */
export function domainPredatesAccount(
  registeredAt: Date | null,
  accountCreatedAt: Date,
): boolean | null {
  if (!registeredAt) return null;
  return registeredAt.getTime() < accountCreatedAt.getTime();
}

/** Legal-form words a card or business name may carry or leave off. */
const LEGAL_SUFFIXES: ReadonlySet<string> = new Set([
  'llc',
  'pllc',
  'lllp',
  'llp',
  'lp',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'limited',
  'pc',
  'pa',
  'plc',
]);

/**
 * A name for comparing: accents, case and punctuation dropped (`L.L.C.` is `llc`, `&` is
 * `and`), a leading `the` and trailing legal-form words removed. The last word always stays,
 * so a name that is only `LLC` is still a name. Empty when nothing is left.
 */
export function normalizeName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length > 1 && words[0] === 'the') words.shift();
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1) ?? '')) words.pop();
  return words.join(' ');
}

/** Levenshtein distance, giving up (returning `max + 1`) once it must exceed `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

/** Typos a name of this length may carry: none under 8 characters, 1 under 16, else 2. */
function allowedEdits(a: string, b: string): number {
  const length = Math.max(a.length, b.length);
  return length < 8 ? 0 : length < 16 ? 1 : 2;
}

/** Without single-letter words: a middle initial (`Sam J. Rivera`) is left off. */
const withoutInitials = (name: string) =>
  name
    .split(' ')
    .filter((w) => w.length > 1)
    .join(' ');

/** True when two normalized names are the same, apart from initials and a typo or two. */
function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [x, y] = [withoutInitials(a) || a, withoutInitials(b) || b];
  return editDistance(x, y, allowedEdits(x, y)) <= allowedEdits(x, y);
}

/**
 * Whether the card's country and name fit the business. A US location expects country `US`.
 * The cardholder may be the business (`Kettle Ridge Lodge, LLC`) or one of its people (`Sam J
 * Rivera`); names are compared normalized (see normalizeName), allowing a close spelling.
 * Either check is null when that side of it is unknown, and a null check does not force review.
 */
export function cardFitsBusiness(
  profile: CardProfile | null,
  business: { name: string; inUs: boolean; people?: readonly (string | null)[] },
): { countryFits: boolean | null; nameFits: boolean | null } {
  if (!profile) return { countryFits: null, nameFits: null };
  const countryFits =
    profile.country === null || !business.inUs
      ? null
      : profile.country.trim().toUpperCase() === 'US';
  const holder = profile.name === null ? '' : normalizeName(profile.name);
  const names = [business.name, ...(business.people ?? [])].flatMap((n) =>
    n ? [normalizeName(n)] : [],
  );
  const nameFits = holder === '' ? null : names.some((n) => namesMatch(holder, n));
  return { countryFits, nameFits };
}

/** True when `orgName` matches a listed brand and the email domain is not that brand's careers contact. */
export function brandCareersMismatch(
  orgName: string,
  emailDomain: string | null,
  brands: readonly { name: string; contactDomain: string }[],
): boolean {
  const org = orgName.trim().toLowerCase();
  const hit = brands.find((b) => org.includes(b.name.trim().toLowerCase()));
  if (!hit) return false;
  return emailDomain !== hit.contactDomain.trim().toLowerCase();
}

/** Reasons that always wait for an operator. Unknown (null) checks are not reasons. */
export function manualReviewReasons(s: VerificationSignals): string[] {
  const reasons: string[] = [];
  if (s.freeEmail) reasons.push('free_email');
  if (s.bannedFingerprint) reasons.push('banned_fingerprint');
  if (s.brandCareersMismatch) reasons.push('brand_careers_mismatch');
  if (s.cardCountryFits === false) reasons.push('card_country');
  if (s.cardNameFits === false) reasons.push('card_name');
  if (s.domainPredatesAccount === false) reasons.push('domain_after_account');
  return reasons;
}

type FingerprintKind = (typeof FINGERPRINT_KINDS)[number];

/**
 * The stored form of a fingerprint, for both writing and lookup. A Stripe card print is kept
 * exactly (prints are case-sensitive, so case folding would merge distinct cards); a device or
 * phone value is trimmed and lowercased. Empty means there is nothing to check.
 */
export function fingerprintValue(kind: FingerprintKind, value: string): string {
  const trimmed = value.trim();
  return kind === 'card' ? trimmed : trimmed.toLowerCase();
}

/** The non-empty prints in `prints`, in their stored form. */
function fingerprintRows(prints: HostFingerprints | undefined): [FingerprintKind, string][] {
  return FINGERPRINT_KINDS.flatMap((kind) => {
    const value = prints?.[kind];
    const stored = value ? fingerprintValue(kind, value) : '';
    return stored ? [[kind, stored] as [FingerprintKind, string]] : [];
  });
}

/**
 * Adds prints to the banned list (the confirmed-fake-host procedure, legal review 7 item 6).
 * Idempotent: a print already listed is left alone. Returns how many it added.
 */
export async function banFingerprints(db: DbOrTx, prints: HostFingerprints): Promise<number> {
  const rows = fingerprintRows(prints);
  if (rows.length === 0) return 0;
  const added = await db
    .insert(verificationBannedFingerprints)
    .values(rows.map(([kind, value]) => ({ id: newId(), kind, value })))
    .onConflictDoNothing({
      target: [verificationBannedFingerprints.kind, verificationBannedFingerprints.value],
    })
    .returning({ id: verificationBannedFingerprints.id });
  return added.length;
}

/** Bans the print of the org's card on file. Reads billing (Stripe): call it outside a transaction. */
export async function banCardOnFile(db: DbOrTx, orgId: string): Promise<number> {
  const card = await getCardChecks(db, orgId);
  return card.hasCard ? banFingerprints(db, { card: card.fingerprint ?? null }) : 0;
}

async function bannedFingerprint(
  db: DbOrTx,
  prints: HostFingerprints | undefined,
): Promise<boolean> {
  const checks = fingerprintRows(prints);
  if (checks.length === 0) return false;
  const rows = await db
    .select({ id: verificationBannedFingerprints.id })
    .from(verificationBannedFingerprints)
    .where(
      or(
        ...checks.map(([kind, value]) =>
          and(
            eq(verificationBannedFingerprints.kind, kind),
            eq(verificationBannedFingerprints.value, value),
          ),
        ),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Gathers the spec 8.4 signals for an org. Throws `not_found` for an unknown org. */
export async function collectSignals(
  db: DbOrTx,
  orgId: string,
  deps: SignalDeps,
): Promise<VerificationSignals> {
  const org = (await getOrgSummaries(db, [orgId])).get(orgId);
  if (!org) throw notFound('Organization not found');

  const members = await listMembers(db, orgId);
  const owner =
    members.find((m) => m.userId === org.ownerUserId) ?? members.find((m) => m.role === 'owner');
  const emailDomain = emailDomainOf(owner?.email);
  const siteHost = org.websiteUrl ? websiteHost(org.websiteUrl) : null;

  const disposableSet = await disposableDomains();
  const freeEmail = emailDomain !== null && FREE_EMAIL_DOMAINS.has(emailDomain);
  const disposableEmail =
    emailDomain !== null && withParents(emailDomain).some((d) => disposableSet.has(d));
  // The business's own domain: its website, else a business email address.
  const ownDomain = siteHost ?? (emailDomain && !freeEmail && !disposableEmail ? emailDomain : null);

  const [site, domain, card, locations, blockedList, brands] = await Promise.all([
    websiteSignals(org.websiteUrl, deps.fetchText),
    domainFacts(ownDomain, deps),
    getCardChecks(db, orgId),
    listOrgLocations(db, orgId),
    getSetting(db, 'verification.blocked_domains'),
    db
      .select({
        name: verificationBrandContacts.brandName,
        contactDomain: verificationBrandContacts.contactDomain,
      })
      .from(verificationBrandContacts),
  ]);
  const banned = await bannedFingerprint(db, {
    card: card.hasCard ? (card.fingerprint ?? null) : null,
    device: deps.fingerprints?.device ?? null,
    phone: deps.fingerprints?.phone ?? null,
  });
  const cardProfile: CardProfile | null = card.hasCard
    ? { country: card.country ?? null, name: card.name ?? null }
    : null;

  const blocked = new Set(blockedList.map(normalizeHost));
  const blockedDomain = [emailDomain, siteHost].some(
    (d) => d !== null && withParents(d).some((p) => blocked.has(p)),
  );
  const states: readonly string[] = US_STATE_CODES;
  const locationInUs = locations.some((l) => states.includes(l.state));
  const fit = cardFitsBusiness(cardProfile, {
    name: org.name,
    inUs: locationInUs,
    people: members.map((m) => m.displayName),
  });

  return {
    emailDomain,
    freeEmail,
    disposableEmail,
    websiteReachable: site.reachable,
    domainMatch: siteHost === null || emailDomain === null ? null : siteHost === emailDomain,
    domainAgeDays: domain.days,
    cvcCheck: card.cvcCheck,
    postalCheck: card.postalCheck,
    hasCard: card.hasCard,
    locationInUs,
    blockedDomain,
    websiteText: site.text,
    domainPredatesAccount: domainPredatesAccount(domain.registeredAt, org.createdAt),
    cardCountryFits: fit.countryFits,
    cardNameFits: fit.nameFits,
    bannedFingerprint: banned,
    brandCareersMismatch: brandCareersMismatch(org.name, emailDomain, brands),
  };
}

/** The signals that force a review at priority 100 (spec 8.4), in a fixed order. */
export function hardFlags(s: VerificationSignals): HardFlag[] {
  const flags: HardFlag[] = [];
  if (s.blockedDomain) flags.push('blocked_domain');
  if (s.disposableEmail) flags.push('disposable_email');
  if (s.cvcCheck === 'fail') flags.push('cvc_failed');
  return flags;
}
