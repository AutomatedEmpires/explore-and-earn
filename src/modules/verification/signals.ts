// The signals business verification weighs (SP2 spec 8.4): the owner's email domain and
// whether it's a free or disposable provider, whether the website answers over HTTPS and
// shares the email domain, the domain's age from RDAP, the card checks Stripe ran, whether a
// location is in the US, and the operator blocklist. Collecting never fails on a lookup: a
// failed website fetch is "not reachable" and a failed RDAP lookup is "age unknown".
import { z } from 'zod';
import type { DbOrTx } from '@/lib/db';
import { notFound } from '@/lib/errors';
import { US_STATE_CODES } from '@/lib/us-states';
import { getCardChecks } from '@/modules/billing';
import { listOrgLocations } from '@/modules/locations';
import { getOrgSummaries, listMembers } from '@/modules/orgs';
import { getSetting } from '@/modules/settings';
import { safeFetchText } from './safe-fetch';

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
};

export type HardFlag = 'blocked_domain' | 'disposable_email' | 'cvc_failed';

export type SignalDeps = {
  fetchText: typeof safeFetchText;
  rdapRegisteredAt: (domain: string) => Promise<Date | null>;
  now: Date;
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

/** The production dependencies: the SSRF-safe fetch and the RDAP client. */
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

async function domainAgeDays(domain: string | null, deps: SignalDeps): Promise<number | null> {
  if (!domain || isReserved(domain)) return null;
  try {
    const at = await deps.rdapRegisteredAt(domain);
    return at ? Math.max(0, Math.floor((deps.now.getTime() - at.getTime()) / DAY_MS)) : null;
  } catch {
    return null;
  }
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

  const [site, age, card, locations, blockedList] = await Promise.all([
    websiteSignals(org.websiteUrl, deps.fetchText),
    domainAgeDays(ownDomain, deps),
    getCardChecks(db, orgId),
    listOrgLocations(db, orgId),
    getSetting(db, 'verification.blocked_domains'),
  ]);

  const blocked = new Set(blockedList.map(normalizeHost));
  const blockedDomain = [emailDomain, siteHost].some(
    (d) => d !== null && withParents(d).some((p) => blocked.has(p)),
  );
  const states: readonly string[] = US_STATE_CODES;

  return {
    emailDomain,
    freeEmail,
    disposableEmail,
    websiteReachable: site.reachable,
    domainMatch: siteHost === null || emailDomain === null ? null : siteHost === emailDomain,
    domainAgeDays: age,
    cvcCheck: card.cvcCheck,
    postalCheck: card.postalCheck,
    hasCard: card.hasCard,
    locationInUs: locations.some((l) => states.includes(l.state)),
    blockedDomain,
    websiteText: site.text,
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
