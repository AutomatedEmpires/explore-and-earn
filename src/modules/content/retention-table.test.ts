// The privacy policy's retention table (SP8 plan Task 25, Plan decision 25).
import { describe, expect, it } from 'vitest';
import { renderRetentionTable } from './retention-table';

describe('renderRetentionTable', () => {
  it('writes one row per rule, sorted by key, split at the first "are deleted" or "is deleted"', () => {
    expect(
      renderRetentionTable([
        {
          key: 'privacy.consent_records_24m',
          description: 'Records of your cookie choices are deleted after 24 months.',
        },
        {
          key: 'notifications.in_app_90d',
          description: 'In-app notifications are deleted after 90 days.',
        },
        { key: 'media.orphans', description: 'A photo nothing uses is deleted after 30 days.' },
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
        { key: 'a.first', description: 'Drafts are deleted after 7 days; copies are deleted too.' },
        { key: 'b.whole', description: 'Audit records are kept permanently.' },
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
      renderRetentionTable([
        { key: 'x.pipe', description: 'Logs | traces are deleted after 2 days.' },
      ]),
    ).toContain('| Logs \\| traces | after 2 days. |');
    expect(renderRetentionTable([])).toBe('| What we delete | When |\n| --- | --- |');
  });
});
