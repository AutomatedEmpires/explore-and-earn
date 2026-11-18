# Restore runbook

How to prove that a backup can be restored (the drill), and what to do in a real incident. The design is in [the SP8 design spec](../superpowers/specs/2026-11-03-sp8-trust-privacy-launch-design.md), section 8.11. Setting up backups is in [backups.md](backups.md).

- **Who runs it:** the founder approves every drill and leads every real restore.
- **Status:** built and tested against a local database and fakes, and **off**. No drill has run against a real backup yet. The first passing drill is the `restore.drill` launch evidence.
- **Targets:** a restore loses at most 24 hours of data (restore point age) and takes at most 8 hours.
- **Never commit a value** from this runbook. Every secret below is a name. The values live in Doppler.

## Why a restore needs more than the dump

A restored database is as old as its backup. Three things have moved on since, and each has its own step:

| What moved on | What fixes it |
|---|---|
| People who asked to be erased after the backup are back in the database | `pnpm ops:replay-deletions` erases them again, from the deletion ledger mirror |
| Sign-ups, profile changes and team changes made in Clerk | `pnpm ops:resync-clerk` re-pulls users, organizations and memberships |
| Payments and subscription changes in Stripe | SP2's `reconcileAll` |

Replaying deletions comes first, always. Until it has run, the restored database holds personal data that people asked us to delete.

## The drill

Run it once before launch, then every quarter, and after any change to the backup workflow or the database role.

### Path A: the Restore drill workflow

`.github/workflows/restore-drill.yml` restores the newest backup into a throwaway Postgres that exists only inside the job. It holds no production database URL and no production storage keys, so it cannot change production.

#### How it is kept off

It reads nothing until all three of these are true:

1. Someone starts it by hand from the Actions tab. There is no timer in the file.
2. The repository variable `RESTORE_DRILL_ENABLED` is exactly `true`. Until then a run only prints "The restore drill is off".
3. The GitHub environment `restore-drill` exists, has the founder as required reviewer, and holds these secrets (set up in [backups.md](backups.md), step 4): `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, `BACKUP_CRYPT_PASSWORD`, `BACKUP_CRYPT_SALT`, `BACKUP_SUPABASE_URL` and `BACKUP_SUPABASE_SERVICE_ROLE_KEY`.

#### Running it

1. Make sure the Backup workflow has produced a dump in the last 24 hours ([backups.md](backups.md)).
2. Set the repository variable `RESTORE_DRILL_ENABLED` to `true`.
3. Actions → Restore drill → Run workflow, on `main`. Approve the run when GitHub asks.
4. When it finishes, download the `restore-summary` artifact.

#### What it checks

| Step | Passes when |
|---|---|
| Restore | `pg_restore` loads the newest dump with no error |
| Migrations | `pnpm db:migrate` applies nothing. The dump already holds every migration in the commit |
| Row counts | `pnpm backup:manifest --verify` finds no difference from the manifest taken with the dump, and the dump is at most 24 hours old |
| Deletions | `pnpm ops:replay-deletions --since <takenAt> --apply` replays every erasure mirrored since the dump, with none failing |
| Tests | `tests/restore` passes: every mirrored user is erased, and `schema_migrations` lists every file in `drizzle/` |
| Time | The whole job took at most 8 hours |

`restore-summary.json` looks like this:

```json
{ "restorePointAgeHours": 6.5, "elapsedMinutes": 42, "replayed": 3, "passed": true }
```

Attach it to the `restore.drill` launch gate. `passed` is true only when every step passed and the job took at most 480 minutes.

#### When a drill fails

| Failing step | What it means |
|---|---|
| "No backup found" | The Backup workflow has not run, or the crypt password differs between the two environments |
| Restore: a type or schema does not exist | The dump refers to PostGIS types in a schema the drill database does not have. Compare where the `postgis` extension lives in `ee-prod` with the drill database and fix the drill, not production |
| Migrations applied something | `main` holds a migration that production does not have yet. Release first, back up, then drill |
| Row counts differ | The restore lost or gained rows. This is a real failure: do not launch on it. Keep the job log and the dump (dumps are kept 35 days) and find the cause before the next drill |
| "not implemented: replayErasure (W1)" | The privacy engine is not merged into this commit yet |
| Restore point older than 24 hours | The nightly backup is not running |

### Path B: Supabase "restore to new project"

Once before launch, and timed the same way:

1. Note the start time.
2. In the Supabase dashboard, restore `ee-prod`'s latest daily backup into a **new** project named `ee-drill`. Never restore over `ee-prod` in a drill.
3. Point a shell at `ee-drill` (its session-pooler URL as `DATABASE_URL`, taken from the dashboard for this session only) and run, in order:

   ```sh
   pnpm db:migrate                                  # must report "count":0
   pnpm ops:replay-deletions --since <restore point, ISO time>            # dry run: read the counts
   pnpm ops:replay-deletions --since <restore point, ISO time> --apply
   ```

4. Note the end time. Record the restore point age and the elapsed time on the `restore.drill` gate, beside Path A's summary.
5. Delete the `ee-drill` project. It holds a full copy of production data.

## The two ops commands

Both are **dry runs by default**. Without `--apply` they change nothing and print what they would do. Read the dry run's counts before you run with `--apply`.

| Command | Dry run prints | With `--apply` |
|---|---|---|
| `pnpm ops:replay-deletions --since <ISO time>` | `pending`: erasures it would replay. `skipped`: erasures the database already has | Erases those users in `DATABASE_URL`. Cannot be undone. Exits 1 if any erasure failed, and lists the ledger IDs |
| `pnpm ops:resync-clerk` | How many users, organizations and memberships Clerk holds | Updates `DATABASE_URL` from Clerk. Reads Clerk and never writes to it. An erased user is never re-created |

`ops:replay-deletions` needs `DATABASE_URL`, `BACKUP_SUPABASE_URL` and `BACKUP_SUPABASE_SERVICE_ROLE_KEY`. `ops:resync-clerk` needs `DATABASE_URL` and `CLERK_SECRET_KEY`. Both are safe to run twice: a second run finds nothing left to do.

`--since` is the restore point: the `takenAt` in the dump's `manifest.json`, or for a Supabase restore the time of the backup you restored. When unsure, use an earlier time. Replaying an erasure the database already has is skipped, and missing one leaves a deleted person's data in place.

## A real incident

Use this order. It is the order in SP8 spec 8.11:

1. **Restore.** Either restore the newest dump from `ee-backup` into a new Supabase project, or use Supabase's "restore to new project". Prefer a new project over restoring in place, so the damaged database stays available for investigation.
2. **`pnpm ops:replay-deletions --since <restore point> --apply`.** Run the dry run first and read the counts. Do not open the app to users before this has finished with no failures.
3. **`pnpm ops:resync-clerk --apply`.** Re-pulls users, organizations and memberships through `handleClerkEvent`.
4. **SP2 `reconcileAll`.** Brings subscriptions and payments back in line with Stripe.
5. **SP3 `rebuildSearchProjection`.** Rebuilds search from the restored listings.
6. **Point Doppler `prd` `DATABASE_URL` at the restored project**, if it is a new project. Update `PROD_DATABASE_URL` and `PROD_BACKUP_DATABASE_URL` the same way, and re-create the `backup_reader` role there ([backups.md](backups.md), step 3).
7. **Release.** Run the Release workflow so the app and the database are on the same commit.

Throughout:

- Keep private mode on, or the app closed, until step 2 has finished.
- Write down the restore point, who decided, and the time of each step. If personal data was lost or exposed, the [breach response runbook](breach-response.md) applies too.
- Media files are not in the dump. If files were lost as well, restore them from `backupcrypt:files/` ([backups.md](backups.md), "Restoring a single file by hand"). Files deleted by a deletion request in the lost window must stay deleted: so restore lost files only after step 2, and never a file whose media row step 2 removed.
