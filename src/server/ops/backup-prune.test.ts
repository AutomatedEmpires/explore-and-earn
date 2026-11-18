import { describe, expect, it } from 'vitest';
import { BACKUP_KEEP_DAYS, planPrune, pruneCli } from './backup-prune';

const DAY_MS = 24 * 60 * 60 * 1000;
/** The UTC day `days` after `day`. */
const plus = (day: string, days: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

describe('planPrune', () => {
  it('keeps a file deleted today for 35 days, however old the file itself is', () => {
    // The review's case: a photo uploaded 60 days ago is deleted today. rclone moves it into
    // today's folder with its 60-day-old modification time. The plan never sees that time: it
    // goes by the folder, so the photo is there tonight and for the next 35 days.
    const deletedOn = '2026-11-18';
    for (let after = 0; after <= BACKUP_KEEP_DAYS; after++) {
      expect(planPrune([`${deletedOn}/`], plus(deletedOn, after), BACKUP_KEEP_DAYS).purge).toEqual([]);
    }
    expect(planPrune([`${deletedOn}/`], plus(deletedOn, 36), BACKUP_KEEP_DAYS).purge).toEqual([
      `${deletedOn}/`,
    ]);
  });

  it('purges only folders more than keepDays before today, and returns each name as listed', () => {
    const today = '2026-12-31';
    const plan = planPrune(
      [plus(today, -36), `${plus(today, -35)}/`, `${plus(today, -400)}/`, `${today}/`],
      today,
      35,
    );

    expect(plan).toEqual({
      purge: [plus(today, -36), `${plus(today, -400)}/`],
      keep: [`${plus(today, -35)}/`, `${today}/`],
      unknown: [],
    });
  });

  it('never purges a name that is not a real UTC day, and reports it', () => {
    const plan = planPrune(
      ['media-public/', '2026-02-30/', '2026-1-01/', 'pg', '../2020-01-01/', ' 2020-01-01/', ''],
      '2026-12-31',
      35,
    );

    expect(plan.purge).toEqual([]);
    expect(plan.keep).toEqual([]);
    expect(plan.unknown).toEqual([
      'media-public/',
      '2026-02-30/',
      '2026-1-01/',
      'pg',
      '../2020-01-01/',
      ' 2020-01-01/',
    ]);
  });

  it('keeps a folder dated after today (a runner clock behind the last run)', () => {
    expect(planPrune(['2027-01-02/'], '2027-01-01', 35)).toEqual({
      purge: [],
      keep: ['2027-01-02/'],
      unknown: [],
    });
  });

  it('refuses a today that is not a day and a keepDays that is not a positive whole number', () => {
    expect(() => planPrune([], '2026-13-01', 35)).toThrow(/today/);
    expect(() => planPrune([], 'yesterday', 35)).toThrow(/today/);
    for (const days of [0, -1, 1.5, Number.NaN]) {
      expect(() => planPrune([], '2026-12-31', days)).toThrow(/keep-days/);
    }
  });
});

describe('pruneCli', () => {
  it('reads rclone lsf output and prints the folders to purge, one per line', () => {
    const listing = ['2026-10-01/', '2026-11-20/', 'stray/', ''].join('\n');

    const out = pruneCli(['--today', '2026-12-01', '--keep-days', '35'], listing);

    expect(out).toEqual({
      code: 0,
      stdout: '2026-10-01/\n',
      stderr: 'backup-prune: not a dated folder, left in place: stray/\n',
    });
  });

  it('accepts Windows line endings and prints nothing when nothing is due', () => {
    expect(pruneCli(['--today', '2026-12-01', '--keep-days', '35'], '2026-11-20/\r\n')).toEqual({
      code: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('exits 1 with the usage and prints no folder when an argument is missing or bad', () => {
    for (const argv of [[], ['--today', '2026-12-01'], ['--today', 'x', '--keep-days', '35']]) {
      const out = pruneCli(argv, '2020-01-01/\n');
      expect(out.code).toBe(1);
      expect(out.stdout).toBe('');
      expect(out.stderr).toMatch(/usage: tsx scripts\/backup-prune\.ts/);
    }
  });
});
