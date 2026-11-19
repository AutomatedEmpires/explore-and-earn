// The Additional step link's domain reputation (spec section 8.3 step 4): Google Cloud Web
// Risk `uris.search`, cached per domain in app.link_domains for 30 days. Web Risk being
// unreachable makes the domain `unknown`, which sends the listing to moderation; a domain is
// never allowed without an answer.
import { eq } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { linkDomains } from './schema';

export type LinkVerdict = 'safe' | 'flagged' | 'unreachable';
export type DomainStatus = 'allowed' | 'blocked' | 'unknown';

export interface LinkSafety {
  lookup(url: string): Promise<LinkVerdict>;
}

const WEB_RISK_URL = 'https://webrisk.googleapis.com/v1/uris:search';
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'] as const;
const LOOKUP_TIMEOUT_MS = 5_000;
const RECHECK_AFTER_MS = 30 * 86_400_000;

type FetchFn = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Google Cloud Web Risk: a `threat` in the answer is flagged, `{}` is safe. */
export function webRisk(key: string, fetchFn: FetchFn = fetch): LinkSafety {
  return {
    async lookup(url) {
      const q = new URL(WEB_RISK_URL);
      for (const t of THREAT_TYPES) q.searchParams.append('threatTypes', t);
      q.searchParams.set('uri', url);
      q.searchParams.set('key', key);
      try {
        const res = await fetchFn(q.toString(), {
          signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        });
        if (!res.ok) {
          logger.warn('web risk lookup failed', { status: res.status });
          await res.body?.cancel();
          return 'unreachable';
        }
        const body = (await res.json()) as { threat?: unknown };
        return body && typeof body === 'object' && body.threat ? 'flagged' : 'safe';
      } catch (err) {
        logger.warn('web risk lookup failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return 'unreachable';
      }
    },
  };
}

/** The stub: `__flag__` in the URL is flagged, `__down__` unreachable, anything else safe. */
export function stubLinkSafety(): LinkSafety {
  return {
    async lookup(url) {
      if (url.includes('__flag__')) return 'flagged';
      if (url.includes('__down__')) return 'unreachable';
      return 'safe';
    },
  };
}

/** The provider LINK_SAFETY_PROVIDER names. */
export function getLinkSafety(): LinkSafety {
  const env = getEnv();
  if (env.LINK_SAFETY_PROVIDER === 'webrisk') return webRisk(env.WEB_RISK_API_KEY ?? '');
  return stubLinkSafety();
}

const STATUS_OF: Record<LinkVerdict, DomainStatus> = {
  safe: 'allowed',
  flagged: 'blocked',
  unreachable: 'unknown',
};

/**
 * Whether links to `host` are allowed. An operator's ruling always stands; an allowed or
 * blocked answer is reused for 30 days; otherwise `url` is looked up and the answer stored.
 */
export async function domainStatus(
  db: DbOrTx,
  host: string,
  url: string,
  ls: LinkSafety,
  now: Date = new Date(),
): Promise<DomainStatus> {
  const domain = host.toLowerCase();
  const [row] = await db.select().from(linkDomains).where(eq(linkDomains.domain, domain));
  if (row) {
    if (row.source === 'operator') return row.status;
    const fresh = now.getTime() - row.checkedAt.getTime() < RECHECK_AFTER_MS;
    if (fresh && row.status !== 'unknown') return row.status;
  }

  const verdict = await ls.lookup(url);
  const status = STATUS_OF[verdict];
  await db
    .insert(linkDomains)
    .values({ domain, status, source: 'web_risk', checkedAt: now })
    .onConflictDoUpdate({
      target: linkDomains.domain,
      set: { status, source: 'web_risk', checkedAt: now },
    });
  return status;
}
