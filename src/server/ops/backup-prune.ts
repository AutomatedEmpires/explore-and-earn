// Which dated backup folders to delete (SP8 spec 8.11). The Backup workflow writes each dump to
// backupcrypt:pg/<date>/ and moves each file that left the live buckets into
// backupcrypt:files-deleted/<date>/, where <date> is the UTC day of the run. Both are kept for
// 35 days from that day.
//
// Pruning goes by the date in the folder's name, never by a file's own time. rclone keeps a
// file's modification time when `sync --backup-dir` moves it, so a photo uploaded 60 days ago
// and deleted today lands in today's folder with a 60-day-old time: an age filter such as
// `rclone delete --min-age 35d` would delete it the same night, and the 35 days to get it back
// would never exist.
//
// This file only decides. scripts/backup-prune.ts reads the folder listing on stdin and prints
// the folders to delete; the workflow deletes them.

/** How long a dump, and a file deleted from the live buckets, stays in the backup. */
export const BACKUP_KEEP_DAYS = 35;

const DAY_MS = 24 * 60 * 60 * 1000;
/** `YYYY-MM-DD`, with or without the trailing slash `rclone lsf --dirs-only` prints. */
const DATED_FOLDER = /^(\d{4}-\d{2}-\d{2})\/?$/;

export type PrunePlan = {
  /** Folders whose date is more than `keepDays` days before today. */
  purge: string[];
  /** Dated folders still inside the window, including any dated after today. */
  keep: string[];
  /** Names that are not a real UTC day. Never deleted. */
  unknown: string[];
};

/** Midnight UTC of a `YYYY-MM-DD` that is a real day, or null. */
function dayStart(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const at = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== day ? null : at;
}

/**
 * Splits folder names, in the order given, into those to delete and those to keep. A folder
 * goes when its date is more than `keepDays` days before `today`, so one dated exactly
 * `keepDays` days ago is kept: a file deleted on a day stays for at least `keepDays` full days
 * after it. Names are returned exactly as given; empty names are ignored.
 */
export function planPrune(names: readonly string[], today: string, keepDays: number): PrunePlan {
  const todayAt = dayStart(today);
  if (todayAt === null) throw new Error(`backup-prune: today must be a YYYY-MM-DD day, got ${today}`);
  if (!Number.isInteger(keepDays) || keepDays <= 0) {
    throw new Error(`backup-prune: --keep-days must be a positive whole number, got ${keepDays}`);
  }

  const plan: PrunePlan = { purge: [], keep: [], unknown: [] };
  for (const name of names) {
    if (name === '') continue;
    const day = DATED_FOLDER.exec(name)?.[1];
    const at = day === undefined ? null : dayStart(day);
    if (at === null) plan.unknown.push(name);
    else if ((todayAt - at) / DAY_MS > keepDays) plan.purge.push(name);
    else plan.keep.push(name);
  }
  return plan;
}

const USAGE = 'usage: tsx scripts/backup-prune.ts --today <YYYY-MM-DD> --keep-days <n> < folders.txt';

function option(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  const value = at === -1 ? undefined : argv[at + 1];
  return value && !value.startsWith('--') ? value : undefined;
}

/**
 * The command line of scripts/backup-prune.ts: `listing` is what `rclone lsf --dirs-only`
 * printed. stdout gets the folders to delete, one per line; stderr names any folder left in
 * place because it is not dated. Exit code 1 means nothing may be deleted.
 */
export function pruneCli(
  argv: readonly string[],
  listing: string,
): { code: number; stdout: string; stderr: string } {
  const today = option(argv, '--today');
  const keepDays = Number(option(argv, '--keep-days'));
  let plan: PrunePlan;
  try {
    if (!today) throw new Error('backup-prune: --today is missing');
    plan = planPrune(listing.split(/\r?\n/), today, keepDays);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { code: 1, stdout: '', stderr: `${message}\n${USAGE}\n` };
  }
  return {
    code: 0,
    stdout: plan.purge.map((name) => `${name}\n`).join(''),
    stderr: plan.unknown
      .map((name) => `backup-prune: not a dated folder, left in place: ${name}\n`)
      .join(''),
  };
}
