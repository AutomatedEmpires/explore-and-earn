// RFC 4180 CSV for host analytics. Formula-looking cells are prefixed so a spreadsheet
// shows them as text.
import type { HostAnalytics, Metric, Slice } from '@/lib/host-analytics';

const TILE_LABELS: Record<keyof HostAnalytics['tiles'], string> = {
  views: 'Views',
  saves: 'Saves',
  applications: 'Applications',
  interviews: 'Interviews',
  hires: 'Hires',
  followers: 'Followers',
};

const TILE_ORDER: (keyof HostAnalytics['tiles'])[] = [
  'views',
  'saves',
  'applications',
  'interviews',
  'hires',
  'followers',
];

function csvField(value: string): string {
  let field = value;
  if (field.length > 0 && /^[=+\-@\t\r]/.test(field)) field = `'${field}`;
  if (/[",\r\n]/.test(field)) return `"${field.replaceAll('"', '""')}"`;
  return field;
}

function cell(value: string | number | null): string {
  if (value === null) return '';
  return csvField(String(value));
}

function line(card: string, label: string, value: number, previous: number | null): string {
  return [cell(card), cell(label), cell(value), cell(previous)].join(',');
}

function metricRow(card: string, label: string, metric: Metric): string {
  return line(card, label, metric.value, metric.previous);
}

function sliceRows(card: string, rows: Slice[]): string[] {
  return rows.map((row) => line(card, row.label, row.value, null));
}

/** Header `card,label,value,previous_value`, then one row per tile, slice, week and boost. */
export function toAnalyticsCsv(a: HostAnalytics): string {
  const rows = [
    'card,label,value,previous_value',
    ...TILE_ORDER.map((key) => metricRow('tiles', TILE_LABELS[key], a.tiles[key])),
    ...sliceRows('funnel', a.funnel),
    ...sliceRows('perListing', a.perListing),
    ...a.weekly.flatMap((week) => [
      line('weekly', `${week.week} views`, week.views, null),
      line('weekly', `${week.week} applications`, week.applications, null),
    ]),
    ...sliceRows('invites', a.invites),
    ...a.boost.map((row) => line('boost', row.listingId, row.during, row.before)),
    ...sliceRows('sources', a.sources),
    ...sliceRows('statuses', a.statuses),
  ];
  return rows.join('\n');
}
