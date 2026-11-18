// Legal review 4.5 (P0 item 18): Global Privacy Control is a rejection everywhere, and session
// replay stays off in production in PostHog and Sentry. The PostHog side of the replay guard is
// in analytics.test.ts, next to the rest of initAnalytics.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { sentryOptions } from '../../sentry.shared';
import { gpcFromHeaders, gpcInBrowser, isReplayIntegration } from './privacy-signals';

describe('gpcFromHeaders', () => {
  it('reads Sec-GPC: 1 as the signal', () => {
    expect(gpcFromHeaders(new Headers({ 'sec-gpc': '1' }))).toBe(true);
    expect(gpcFromHeaders(new Headers({ 'Sec-GPC': ' 1 ' }))).toBe(true);
  });

  it.each([[{}], [{ 'sec-gpc': '0' }], [{ 'sec-gpc': '' }], [{ 'sec-gpc': 'true' }]])(
    'reads %o as no signal',
    (headers) => {
      expect(gpcFromHeaders(new Headers(headers))).toBe(false);
    },
  );
});

describe('gpcInBrowser', () => {
  it('is true only when navigator.globalPrivacyControl is true', () => {
    expect(gpcInBrowser({ globalPrivacyControl: true })).toBe(true);
    expect(gpcInBrowser({ globalPrivacyControl: false })).toBe(false);
    expect(gpcInBrowser({ globalPrivacyControl: 'true' })).toBe(false);
    expect(gpcInBrowser({})).toBe(false);
    expect(gpcInBrowser(undefined)).toBe(false);
    expect(gpcInBrowser(null)).toBe(false);
  });
});

const DSN = 'https://public@o0.ingest.sentry.io/0';

type ReplayOptions = {
  replaysSessionSampleRate?: number;
  replaysOnErrorSampleRate?: number;
  integrations?: unknown;
};

describe('Sentry never records a session (legal review 4.5)', () => {
  it.each(['prod', 'staging', 'dev', undefined])('samples no replays with APP_ENV %s', (env) => {
    const options = sentryOptions(DSN, env) as ReplayOptions;
    expect(options.replaysSessionSampleRate).toBe(0);
    expect(options.replaysOnErrorSampleRate).toBe(0);
  });

  it('drops any replay integration the SDK would add, and keeps the others', () => {
    const options = sentryOptions(DSN, 'prod') as ReplayOptions;
    expect(typeof options.integrations).toBe('function');
    const filter = options.integrations as (all: { name: string }[]) => { name: string }[];
    const kept = filter([
      { name: 'Replay' },
      { name: 'ReplayCanvas' },
      { name: 'BrowserTracing' },
      { name: 'Dedupe' },
    ]);
    expect(kept.map((i) => i.name)).toEqual(['BrowserTracing', 'Dedupe']);
  });

  it('names the replay integrations', () => {
    expect(isReplayIntegration('Replay')).toBe(true);
    expect(isReplayIntegration('ReplayCanvas')).toBe(true);
    expect(isReplayIntegration('BrowserTracing')).toBe(false);
  });
});

// A static check of the code itself: nothing turns replay on, whatever the config says.
const ROOT = path.resolve(import.meta.dirname, '../..');
const REPLAY_ON = [
  /replayIntegration\s*\(/,
  /replayCanvasIntegration\s*\(/,
  /startSessionRecording\s*\(/,
  /disable_session_recording\s*:\s*false/,
  /replaysSessionSampleRate\s*:\s*(?!0\b)[\d.]/,
  /replaysOnErrorSampleRate\s*:\s*(?!0\b)[\d.]/,
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no code turns session replay on', () => {
  it('in src/ or the Sentry and Next.js configs', () => {
    const files = [
      ...sourceFiles(path.join(ROOT, 'src')),
      ...readdirSync(ROOT)
        .filter((f) => /^(sentry\..+|next\.config)\.ts$/.test(f))
        .map((f) => path.join(ROOT, f)),
    ];
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) => {
      const text = readFileSync(file, 'utf8');
      return REPLAY_ON.filter((re) => re.test(text)).map(
        (re) => `${path.relative(ROOT, file)}: ${re.source}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
