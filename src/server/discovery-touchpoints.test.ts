// SP3's lines in the shared touchpoints (SP3 plan Task 4): event subscribers, schedules, job
// handlers, the email template names, the Apply placeholder and the storage accessor the
// projection's media URLs use.
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ApplyPage from '@/app/(seeker)/apply/[listingId]/page';
import { resetEnvCache } from '@/lib/env';
import { getStorage } from '@/modules/media';
import { EMAIL_TEMPLATE_NAMES } from '@/modules/notifications';
import { eventSubscribers } from './event-subscribers';
import { handlers } from './job-handlers';
import { schedules } from './schedules';

const envOverride = vi.hoisted(() => ({ appEnv: null as 'prod' | null }));
vi.mock('@/lib/env', async (orig) => {
  const actual = await orig<typeof import('@/lib/env')>();
  return {
    ...actual,
    getEnv: () =>
      envOverride.appEnv ? { ...actual.getEnv(), APP_ENV: envOverride.appEnv } : actual.getEnv(),
  };
});

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

// The Apply placeholder asks the seeker shell for the viewer; only the env check is real.
const seekerPage = vi.hoisted(() => vi.fn(async () => ({ id: 'user_1' })));
vi.mock('@/server/shell', async (orig) => ({
  ...(await orig<typeof import('@/server/shell')>()),
  seekerPage,
}));

const applyProps = (listingId: string) => ({
  params: Promise.resolve({ listingId }),
  searchParams: Promise.resolve({}),
});

const SP3_TOPICS = [
  'discovery.sync_listing',
  'discovery.sync_host',
  'discovery.drift_check',
  'discovery.maintenance',
  'discovery.alerts_match',
  'discovery.alerts_daily',
  'discovery.alerts_weekly',
];

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvCache();
});

describe('event subscribers', () => {
  it('projects every listing event into search, keeping SP2 subscribers', () => {
    expect(eventSubscribers['listing.published']).toEqual(
      expect.arrayContaining(['hostpages.notify_followers', 'discovery.sync_listing']),
    );
    for (const event of ['listing.changed', 'listing.closed', 'listing.removed'] as const) {
      expect(eventSubscribers[event], event).toContain('discovery.sync_listing');
    }
  });

  it('re-syncs a host or location when its public facts change, keeping SP2 subscribers', () => {
    for (const event of ['hostpage.updated', 'location.updated', 'subscription.changed'] as const) {
      expect(eventSubscribers[event], event).toContain('discovery.sync_host');
    }
    // org.status_changed gains discovery.sync_host in a follow-up (see event-subscribers.ts).
    expect(eventSubscribers['org.status_changed']).toEqual(['listings.close_for_org']);
    expect(eventSubscribers['location.updated']).toContain('locations.resolve_nws_grid');
    expect(eventSubscribers['org.status_changed']).toContain('listings.close_for_org');
    expect(eventSubscribers['subscription.changed']).toEqual(
      expect.arrayContaining(['listings.enforce_slot_limit', 'hostpages.mark_public']),
    );
  });

  it('subscribes no topic twice to one event', () => {
    for (const [event, topics] of Object.entries(eventSubscribers)) {
      expect(new Set(topics).size, event).toBe(topics.length);
    }
  });
});

describe('schedules', () => {
  it('runs the discovery crons (UTC)', () => {
    expect(schedules).toEqual(
      expect.arrayContaining([
        { topic: 'discovery.drift_check', cron: '30 3 * * *' },
        { topic: 'discovery.alerts_match', cron: '*/15 * * * *' },
        { topic: 'discovery.alerts_daily', cron: '0 14 * * *' },
        { topic: 'discovery.alerts_weekly', cron: '0 14 * * 1' },
        { topic: 'discovery.maintenance', cron: '15 4 * * *' },
      ]),
    );
  });
});

describe('job handlers', () => {
  it('has a handler for every SP3 topic, merged without a duplicate', () => {
    for (const topic of SP3_TOPICS) expect(typeof handlers[topic], topic).toBe('function');
  });

  it('has a handler for every subscribed and scheduled topic', () => {
    const topics = new Set([
      ...Object.values(eventSubscribers).flat(),
      ...schedules.map((s) => s.topic),
    ]);
    for (const topic of topics) expect(typeof handlers[topic], topic).toBe('function');
  });
});

describe('/apply/[listingId] placeholder', () => {
  it('names the sub-project that delivers it, for a signed-in seeker', async () => {
    const html = renderToStaticMarkup(await ApplyPage(applyProps('l1')));
    expect(html).toContain('Coming in sub-project 4: Seeker');
    expect(seekerPage).toHaveBeenCalledWith('/apply/l1', { guests: false });
  });

  it('is hidden in prod', async () => {
    envOverride.appEnv = 'prod';
    try {
      await expect(ApplyPage(applyProps('l1'))).rejects.toThrow('NEXT_NOT_FOUND');
    } finally {
      envOverride.appEnv = null;
    }
  });
});

describe('email templates', () => {
  it('names the daily and weekly job alert templates', () => {
    expect(EMAIL_TEMPLATE_NAMES).toEqual(
      expect.arrayContaining(['JobAlertDaily', 'JobAlertWeekly']),
    );
  });
});

describe('getStorage', () => {
  it('is one memory store per process with STORAGE_PROVIDER=stub', async () => {
    vi.stubEnv('STORAGE_PROVIDER', 'stub');
    resetEnvCache();
    const storage = getStorage();
    expect(getStorage()).toBe(storage);
    const bytes = new TextEncoder().encode('lift operator');
    await storage.write('media-public', 'sp3/touchpoint.txt', bytes, 'text/plain');
    expect(await storage.read('media-public', 'sp3/touchpoint.txt')).toEqual(bytes);
  });
});
