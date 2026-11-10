// @vitest-environment jsdom
// The client-safe discovery contract (SP3 plan Task 1): time zones, return paths, states, the
// install trigger event, and the rule that src/lib/discovery never reaches the database.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TZ,
  INSTALL_TRIGGER_EVENT,
  US_STATES,
  emitInstallTrigger,
  resolveTimeZone,
  safeReturnTo,
  stateByCode,
  stateBySlug,
} from './index';

describe('resolveTimeZone', () => {
  it('keeps a valid IANA zone', () => {
    expect(resolveTimeZone('America/Denver')).toBe('America/Denver');
  });

  it.each([['Etc/Unknown'], ['Mars/Base'], [''], [null], [undefined], ['a'.repeat(200)]])(
    'falls back to America/Chicago for %j (Review Focus 3)',
    (tz) => {
      expect(resolveTimeZone(tz)).toBe('America/Chicago');
      expect(DEFAULT_TZ).toBe('America/Chicago');
    },
  );
});

describe('safeReturnTo', () => {
  it('keeps a same-site path with its query', () => {
    expect(safeReturnTo('/jobs/view/1/lift-operator?intent=save%3A1')).toBe(
      '/jobs/view/1/lift-operator?intent=save%3A1',
    );
  });

  it.each([
    ['//evil.test'],
    ['/\\evil.test'],
    ['https://evil.test'],
    ['javascript:alert(1)'],
    [''],
    [undefined],
    [null],
    [`/${'a'.repeat(512)}`],
  ])('returns / for %j', (v) => {
    expect(safeReturnTo(v)).toBe('/');
  });

  it('keeps a path of exactly 512 characters', () => {
    const p = `/${'a'.repeat(511)}`;
    expect(p).toHaveLength(512);
    expect(safeReturnTo(p)).toBe(p);
  });
});

describe('US_STATES', () => {
  it('holds the 50 states and DC as landing pages, plus 5 territories', () => {
    expect(US_STATES).toHaveLength(56);
    expect(US_STATES.filter((s) => s.landing)).toHaveLength(51);
    expect(
      US_STATES.filter((s) => !s.landing)
        .map((s) => s.code)
        .sort(),
    ).toEqual(['AS', 'GU', 'MP', 'PR', 'VI']);
  });

  it('has unique, hyphenated lowercase slugs and codes', () => {
    const slugs = US_STATES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
    const codes = US_STATES.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('has a centroid inside the coordinate range for every entry', () => {
    for (const s of US_STATES) {
      expect(Math.abs(s.centroid.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.centroid.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('looks states up by slug and code', () => {
    expect(stateBySlug('district-of-columbia')?.code).toBe('DC');
    expect(stateByCode('AK')?.name).toBe('Alaska');
    expect(stateByCode('ZZ')).toBeUndefined();
    expect(stateBySlug('atlantis')).toBeUndefined();
  });
});

describe('src/lib/discovery imports', () => {
  it('never imports the database, drizzle, server-only or a module at runtime', () => {
    const dir = import.meta.dirname;
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    const forbidden = /^(@\/lib\/db|drizzle-orm(\/.*)?|server-only|@\/modules\/.*)$/;
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      // import ... from 'x', export ... from 'x', import 'x', and dynamic import('x').
      const statements = source.matchAll(
        /(?:^|\n)\s*(import|export)\s+(type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g,
      );
      for (const m of statements) {
        const typeOnly = Boolean(m[2]);
        const target = m[3] ?? m[4] ?? '';
        if (!typeOnly && forbidden.test(target)) offenders.push(`${file}: ${target}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('emitInstallTrigger', () => {
  it('dispatches the install trigger event on window', () => {
    const seen: unknown[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<{ trigger: string }>).detail);
    window.addEventListener(INSTALL_TRIGGER_EVENT, listener);
    try {
      emitInstallTrigger('save');
    } finally {
      window.removeEventListener(INSTALL_TRIGGER_EVENT, listener);
    }
    expect(seen).toEqual([{ trigger: 'save' }]);
    expect(INSTALL_TRIGGER_EVENT).toBe('ee:install-trigger');
  });
});
