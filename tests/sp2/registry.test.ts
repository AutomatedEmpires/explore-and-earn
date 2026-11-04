// The SP2 registries: every scheduled or subscribed topic has a handler, SP2 topics are named
// after their module, and the wiring module is imported where registrations must run.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { jobHandlers as billing } from '@/modules/billing';
import { jobHandlers as entitlements } from '@/modules/entitlements';
import { jobHandlers as hostpages } from '@/modules/hostpages';
import { jobHandlers as listings } from '@/modules/listings';
import { jobHandlers as locations } from '@/modules/locations';
import { jobHandlers as orgs } from '@/modules/orgs';
import { jobHandlers as verification } from '@/modules/verification';
import { eventSubscribers } from '@/server/event-subscribers';
import { handlers } from '@/server/job-handlers';
import { schedules } from '@/server/schedules';

const SP2 = { billing, entitlements, hostpages, listings, locations, orgs, verification };

/** A source file with its line endings normalized (Windows checkouts use CRLF). */
const source = (file: string) => readFileSync(path.resolve(file), 'utf8').replace(/\r\n/g, '\n');

describe('SP2 registries', () => {
  it('has a handler for every scheduled topic', () => {
    for (const { topic } of schedules) expect(handlers[topic], topic).toBeTypeOf('function');
  });

  it('has a handler for every event subscriber', () => {
    for (const topics of Object.values(eventSubscribers)) {
      for (const topic of topics) expect(handlers[topic], topic).toBeTypeOf('function');
    }
  });

  it('names every SP2 topic after its module, and merges them all', () => {
    for (const [name, map] of Object.entries(SP2)) {
      for (const topic of Object.keys(map)) {
        expect(topic.startsWith(`${name}.`), topic).toBe(true);
        expect(handlers[topic], topic).toBe(map[topic]);
      }
    }
  });

  it('owns the topics the spec names', () => {
    expect(Object.keys(billing).sort()).toEqual([
      'billing.apply_launch_date',
      'billing.cancel_subscription',
      'billing.grant_monthly_credits',
      'billing.reconcile',
      'billing.sync_subscription',
    ]);
    expect(Object.keys(listings).sort()).toEqual([
      'listings.auto_close',
      'listings.close_for_org',
      'listings.enforce_slot_limit',
      'listings.photo_slot_check',
      'listings.repost_reminders',
      'listings.resume_screening',
      'listings.screen',
      'listings.still_hiring_sweep',
    ]);
    expect(Object.keys(locations).sort()).toEqual([
      'locations.refresh_weather',
      'locations.resolve_nws_grid',
    ]);
    expect(Object.keys(hostpages).sort()).toEqual([
      'hostpages.check_content',
      'hostpages.mark_public',
      'hostpages.notify_followers',
    ]);
    expect(Object.keys(verification)).toEqual(['verification.run']);
    expect(Object.keys(orgs)).toEqual(['orgs.send_invitation']);
    expect(Object.keys(entitlements)).toEqual([]);
  });

  it('schedules the SP2 jobs in UTC cron', () => {
    const cron = Object.fromEntries(schedules.map((s) => [s.topic, s.cron]));
    expect(cron).toMatchObject({
      'listings.still_hiring_sweep': '0 * * * *',
      'listings.auto_close': '5 * * * *',
      'listings.repost_reminders': '0 15 * * *',
      'locations.refresh_weather': '*/30 * * * *',
      'billing.grant_monthly_credits': '10 0 * * *',
      'billing.apply_launch_date': '20 * * * *',
      'billing.reconcile': '0 7 * * *',
    });
  });

  it('imports every SP2 module in sp2-wiring, and the wiring where registrations must run', () => {
    const wiring = source('src/server/sp2-wiring.ts').split('\n');
    for (const name of Object.keys(SP2)) {
      expect(wiring, name).toContain(`import '@/modules/${name}';`);
    }
    for (const file of ['src/server/api.ts', 'src/app/api/jobs/run/route.ts']) {
      expect(source(file).split('\n'), file).toContain(`import '@/server/sp2-wiring';`);
    }
  });
});
