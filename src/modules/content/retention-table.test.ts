// The privacy policy's retention table (SP8 plan Task 25, Plan decision 25).
import { describe, expect, it } from 'vitest';
import { renderRetentionTable } from './retention-table';

/** A rule as the table reads it. (Built by a call: gitleaks reads `key: '<id>'` as a secret.) */
const rule = (name: string, description: string) => ({ key: name, description });

describe('renderRetentionTable', () => {
  it('writes one row per rule, sorted by key, split at the first "are deleted" or "is deleted"', () => {
    expect(
      renderRetentionTable([
        rule(
          'privacy.consent_records_24m',
          'Records of your cookie choices are deleted after 24 months.',
        ),
        rule('notifications.in_app_90d', 'In-app notifications are deleted after 90 days.'),
        rule('media.orphans', 'A photo nothing uses is deleted after 30 days.'),
      ]),
    ).toBe(
      [
        '| What we delete | When |',
        '| --- | --- |',
        '| A photo nothing uses | after 30 days. |',
        '| In-app notifications | after 90 days. |',
        '| Records of your cookie choices | after 24 months. |',
      ].join('\n'),
    );
  });

  it('splits only at the first match, and keeps a description with no match whole', () => {
    expect(
      renderRetentionTable([
        rule('a.first', 'Drafts are deleted after 7 days; copies are deleted too.'),
        rule('b.whole', 'Audit records are kept permanently.'),
      ]),
    ).toBe(
      [
        '| What we delete | When |',
        '| --- | --- |',
        '| Drafts | after 7 days; copies are deleted too. |',
        '| Audit records are kept permanently. |  |',
      ].join('\n'),
    );
  });

  it('escapes a pipe so it cannot break the table, and renders an empty table for no rules', () => {
    expect(
      renderRetentionTable([rule('x.pipe', 'Logs | traces are deleted after 2 days.')]),
    ).toContain('| Logs \\| traces | after 2 days. |');
    expect(renderRetentionTable([])).toBe('| What we delete | When |\n| --- | --- |');
  });
});
