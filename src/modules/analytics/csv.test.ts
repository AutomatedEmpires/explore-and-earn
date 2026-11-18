import { describe, expect, it } from 'vitest';
import type { HostAnalytics } from '@/lib/host-analytics';
import { toAnalyticsCsv } from './csv';

const tally = { yes: 0, partly: 0, no: 0 };

function analytics(patch: Partial<HostAnalytics> = {}): HostAnalytics {
  const zero = { value: 0, previous: null as number | null };
  return {
    tiles: {
      views: { value: 120, previous: 98 },
      saves: zero,
      applications: zero,
      interviews: zero,
      hires: zero,
      followers: zero,
    },
    funnel: [],
    perListing: [],
    weekly: [],
    invites: [],
    boost: [],
    asDescribed: { responses: 0, visible: false, housing: tally, meals: tally, pay: tally },
    sources: [],
    statuses: [],
    ...patch,
  };
}

describe('toAnalyticsCsv', () => {
  it('writes the header and a tile with its previous value', () => {
    const lines = toAnalyticsCsv(analytics()).split('\n');
    expect(lines[0]).toBe('card,label,value,previous_value');
    expect(lines).toContain('tiles,Views,120,98');
  });

  it('leaves previous_value empty for all-time', () => {
    const csv = toAnalyticsCsv(
      analytics({
        tiles: {
          views: { value: 120, previous: null },
          saves: { value: 0, previous: null },
          applications: { value: 0, previous: null },
          interviews: { value: 0, previous: null },
          hires: { value: 0, previous: null },
          followers: { value: 0, previous: null },
        },
      }),
    );
    expect(csv.split('\n')).toContain('tiles,Views,120,');
  });

  it('neutralizes formula cells and quotes commas', () => {
    const csv = toAnalyticsCsv(
      analytics({
        perListing: [
          { key: 'a', label: '=HYPERLINK("x")', value: 1 },
          { key: 'b', label: '-5 cabins', value: 2 },
          { key: 'c', label: 'Bend, OR', value: 3 },
        ],
      }),
    );
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`'-5 cabins`);
    expect(csv).toContain(`"Bend, OR"`);
  });
});
