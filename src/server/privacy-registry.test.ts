import { describe, expect, it } from 'vitest';
import type { PrivacyHandler, RetentionRule } from '@/modules/privacy';
import { buildPrivacyRegistry } from './privacy-registry';

function handler(module: string, tables: string[]): PrivacyHandler {
  return {
    module,
    tables,
    async exportData() {
      return { records: {}, files: [] };
    },
    async erase() {
      return { erased: 0, retained: [] };
    },
  };
}

function rule(key: string): RetentionRule {
  return {
    key,
    description: key,
    async run() {
      return { deleted: 0 };
    },
  };
}

describe('buildPrivacyRegistry', () => {
  it('refuses a module, a rule key or a table registered twice, and a rule key with no dot', () => {
    expect(() =>
      buildPrivacyRegistry([
        { handler: handler('a', []), rules: [] },
        { handler: handler('a', []), rules: [] },
      ]),
    ).toThrow('Privacy module "a" is registered twice');

    expect(() =>
      buildPrivacyRegistry([{ handler: handler('a', []), rules: [rule('a.x'), rule('a.x')] }]),
    ).toThrow('Retention rule "a.x" is registered twice');

    expect(() =>
      buildPrivacyRegistry([
        { handler: handler('a', ['t']), rules: [] },
        { handler: handler('b', ['t']), rules: [] },
      ]),
    ).toThrow('Table "t" is claimed by both a and b');

    expect(() =>
      buildPrivacyRegistry([{ handler: handler('a', []), rules: [rule('nodot')] }]),
    ).toThrow('Retention rule key "nodot" must look like <module>.<what>');
  });

  it('finds a handler and the module that claimed a table', () => {
    const registry = buildPrivacyRegistry([
      { handler: handler('a', ['t']), rules: [rule('a.x')] },
    ]);
    expect(() => registry.handlerFor('missing')).toThrow('No privacy handler for module "missing"');
    expect(registry.tableOwners.get('t')).toBe('a');
    expect(registry.handlerFor('a').module).toBe('a');
  });
});
