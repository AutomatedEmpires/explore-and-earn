// `tsx scripts/backup-prune.ts --today <YYYY-MM-DD> --keep-days <n> < folders.txt`: reads the
// folder names `rclone lsf --dirs-only` printed for backupcrypt:pg/ or backupcrypt:files-deleted/
// and prints the dated folders to delete, one per line. It deletes nothing itself; the Backup
// workflow purges what it prints.
//
// A folder goes when the date in its name is more than <n> days before --today, never by the
// age of the files inside it (rclone keeps a file's old modification time when it moves it
// there). A name that is not a date is never printed; it is named on stderr. Exits 1, printing
// nothing, on a bad argument. Logic and tests: src/server/ops/backup-prune.ts.
import { readFileSync } from 'node:fs';
import { pruneCli } from '../src/server/ops/backup-prune';

const result = pruneCli(process.argv.slice(2), readFileSync(0, 'utf8'));
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.exitCode = result.code;
