import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getType } from '@/modules/notifications';
import { jobHandlers as privacyJobs } from '@/modules/privacy';
import { eventSubscribers } from '@/server/event-subscribers';
import { handlers } from '@/server/job-handlers';
import { privacyRegistry } from '@/server/privacy-registry';
import { schedules } from '@/server/schedules';
import { EXPECTED_PRIVACY_MODULES } from '../privacy/coverage-report';

const PRIVACY_TOPICS = [
  'privacy.export_step',
  'privacy.export_finalize',
  'privacy.deactivate',
  'privacy.erase_step',
  'privacy.erase_finalize',
  'privacy.ledger_mirror',
  'privacy.retention_sweep',
  'privacy.retention_rule',
  'privacy.request_watch',
];

const SP8_TOPICS = [
  ...PRIVACY_TOPICS,
  'support.ai_triage',
  'support.auto_resolve',
  'support.enterprise_onboarding',
  'operator.metrics_snapshot',
  'operator.daily_digest',
  'operator.heartbeat',
  'operator.sanction_expiry',
  'operator.org_sanction',
  'operator.clerk_ban',
  'operator.refund',
  'content.legal_effective',
  'content.legal_notify_chunk',
  'launch.check',
  'launch.went_public',
];

describe('SP8 registries', () => {
  it('gives every schedule and subscriber a handler, once', () => {
    const topics = [
      ...schedules.map((row) => row.topic),
      ...Object.values(eventSubscribers).flat(),
    ];
    for (const topic of topics) {
      expect(handlers[topic], topic).toEqual(expect.any(Function));
    }
    expect(new Set(Object.keys(handlers)).size).toBe(Object.keys(handlers).length);
    for (const topic of SP8_TOPICS) {
      expect(topic.startsWith(`${topic.split('.')[0]}.`)).toBe(true);
      expect(handlers[topic], topic).toEqual(expect.any(Function));
    }
  });

  it('registers every privacy module and each privacy topic once', () => {
    expect(privacyRegistry.handlers.map((handler) => handler.module).sort()).toEqual(
      [...EXPECTED_PRIVACY_MODULES].sort(),
    );
    expect(Object.keys(privacyJobs).sort()).toEqual([...PRIVACY_TOPICS].sort());
  });

  it('keeps the barrel files and the wiring imports', () => {
    const privacyIndex = readFileSync('src/modules/privacy/index.ts', 'utf8');
    expect(privacyIndex).toContain("export * from './engine'");
    expect(privacyIndex).toContain("export * from './retention'");
    expect(privacyIndex).toContain("export * from './consent'");

    const contentIndex = readFileSync('src/modules/content/index.ts', 'utf8');
    expect(contentIndex).toContain("export * from './help-exports'");
    expect(contentIndex).toContain("export * from './legal-exports'");
    const contentSchema = readFileSync('src/modules/content/schema.ts', 'utf8');
    expect(contentSchema).toContain("export * from './schema-help'");
    expect(contentSchema).toContain("export * from './schema-legal'");

    const mediaIndex = readFileSync('src/modules/media/index.ts', 'utf8');
    expect(mediaIndex).toContain("from './export'");
    expect(mediaIndex).toContain("from './purge'");

    const wiring = readFileSync('src/server/sp8-wiring.ts', 'utf8');
    for (const name of ['privacy', 'support', 'content', 'launch', 'operator']) {
      expect(wiring).toContain(`@/modules/${name}`);
    }
    expect(wiring).toContain('@/server/privacy-registry');
    expect(readFileSync('src/server/api.ts', 'utf8')).toContain('@/server/sp8-wiring');
    expect(readFileSync('src/app/api/jobs/run/route.ts', 'utf8')).toContain('@/server/sp8-wiring');
  });

  it('renders the SP8 notification titles', () => {
    expect(getType('privacy.export_ready')?.title({})).toBe('Your data download is ready');
    expect(getType('privacy.export_ready')?.body({ ttlDays: 7 })).toBe(
      'Download it within 7 days from your privacy settings.',
    );
    expect(getType('privacy.request_delayed')?.title({})).toBe(
      'Your privacy request is taking longer',
    );
    expect(getType('support.reply')?.title({ number: 14 })).toBe(
      'Reply to your support ticket #14',
    );
    expect(getType('legal.updated')?.title({ title: 'Privacy Policy' })).toBe(
      "We're updating our Privacy Policy",
    );
    expect(getType('operator.daily_digest')?.title({ dateLabel: '18 Nov 2026' })).toBe(
      'Daily digest · 18 Nov 2026',
    );
  });
});
