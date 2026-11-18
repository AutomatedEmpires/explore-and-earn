# Backups runbook

How Explore&Earn's off-platform backup works, how to set it up, and how to turn it on. The design is in [the SP8 design spec](../superpowers/specs/2026-11-03-sp8-trust-privacy-launch-design.md), sections 8.11 and 9. Restoring is in [restore.md](restore.md).

- **Who runs it:** the founder. Only the founder can read the production and backup secrets.
- **Status:** built and tested, and **off**. Nothing in this runbook has been run against production. The first manual run of the Backup workflow is the `backups.running` launch evidence.
- **Never commit a value** from this runbook. Every secret below is a name. The values live in Doppler.

## What is backed up

| What | Where it goes | Kept for |
|---|---|---|
| Supabase's own daily backup of `ee-prod` | Supabase (Pro plan) | 7 days |
| A dump of schema `app`, with a manifest | `ee-backup`, bucket `backups`, `pg/<date>/` | 35 days from `<date>` |
| Buckets `media-public` and `media-private` | `ee-backup`, bucket `backups`, `files/<bucket>/` | Current copy |
| Files changed or deleted in those buckets | `ee-backup`, bucket `backups`, `files-deleted/<date>/<bucket>/` | 35 days from the day they were changed or deleted |
| The deletion ledger (who was erased, IDs only) | `ee-backup`, bucket `ledger`, `<date>/<ledgerId>.json` | Never deleted |

`<date>` is the UTC day of the run that wrote the folder. The last step of each run deletes a dated folder once its date is more than 35 days before the run's date, so a file deleted on 15 January is still there on 19 February and goes on the 20 February run. It goes by the date in the folder's name and never by a file's own time: rclone keeps a file's modification time when it moves it into `files-deleted/`, so a photo uploaded 60 days ago and deleted today carries a 60-day-old time, and pruning by file age would delete it the same night. `scripts/backup-prune.ts` decides which folders are due (`src/server/ops/backup-prune.ts`, with its tests); a folder whose name is not a date is never deleted and is named in the run log.

Everything in bucket `backups` is encrypted by rclone before it leaves the GitHub runner, file names included. Without `BACKUP_CRYPT_PASSWORD` and `BACKUP_CRYPT_SALT` the bucket cannot be read. **Keep a second copy of those two values outside Doppler** (a password manager). If they are lost, every backup is lost.

### What is not backed up, and why

- **Child-safety files.** The restricted bucket that holds matched images is never read by the backup, and no step may be added that reads it. Federal law allows those files to be kept for preservation only, so a copy in a backup would be a second, uncontrolled copy. A test fails the build if the workflow names that bucket. The legal review (section 3.3, item 1) asks for object versioning and a deletion lock on that bucket instead, so that one protected copy cannot be lost. That is a separate founder item and is not done by this runbook.
- **The quarantine bucket** (uploads not yet scanned) and **privacy export zips**. Both are short-lived and can be made again.
- **Clerk, Stripe and Resend.** Each provider keeps its own data. After a restore, `pnpm ops:resync-clerk` and SP2's `reconcileAll` bring the database back in line with them (see [restore.md](restore.md)).

### The manifest

Each dump has a `manifest.json` beside it: the time it was taken, the applied migrations, and for every table in schema `app` its row count and newest `created_at`. The restore drill compares it with the restored database, so a restore that lost rows fails instead of looking fine.

The dump and the manifest read **one snapshot**. `pnpm backup:manifest --dump` opens a read-only transaction, exports its snapshot, counts the rows inside it, and runs `pg_dump --snapshot=<id>` while that transaction stays open. Busy tables then match exactly. Never run `pg_dump` and the manifest as two separate sessions: the counts would differ and the drill would fail for no real reason.

The manifest's `takenAt` is read just **before** the transaction begins, so it is never later than the snapshot. After a restore, `pnpm ops:replay-deletions` replays erasures from an hour before `takenAt` ([restore.md](restore.md)); a `takenAt` later than the snapshot could let an erasure that committed during the dump be undone.

## How it is kept off

The Backup workflow (`.github/workflows/backup.yml`) reads nothing until all three of these are true:

1. Someone starts it by hand from the Actions tab. There is no timer in the file.
2. The repository variable `BACKUPS_ENABLED` is exactly `true`. Until then a run only prints "Backups are off".
3. The GitHub environment `backup` exists and holds the secrets in the table below. A run with a missing secret stops before it connects to anything and names the missing secret.

It also runs only from `main`.

## One-time setup

Do these in order. Steps 1 to 4 need the founder.

### 1. Create the backup project

In the Supabase Pro organization, create a project named `ee-backup` (SP8 spec section 13 lists this as a founder item). Put it in a different region from `ee-prod` if the plan allows.

In `ee-backup`, create two **private** storage buckets:

- `backups` (dumps and files)
- `ledger` (the deletion ledger mirror)

Then create S3 access keys for it: Storage → Settings → S3 access keys. Note the endpoint, the region, the access key ID and the secret.

### 2. Create S3 access keys for production storage

In `ee-prod`: Storage → Settings → S3 access keys. The backup only reads `media-public` and `media-private`. Note the endpoint, the region, the access key ID and the secret.

### 3. Create the read-only database role

Run this in the `ee-prod` SQL editor, as the role that runs migrations (`postgres`). Replace the password with a long random one first.

<!-- backup_reader:sql -->
```sql
create role backup_reader login bypassrls password '<a long random password>';
grant usage on schema app to backup_reader;
grant select on all tables in schema app to backup_reader;
alter default privileges in schema app grant select on tables to backup_reader;
```

Why each line is needed:

- `bypassrls`: every table in schema `app` has row-level security on with no policies. Without `bypassrls` the role reads no rows, and `pg_dump` stops at the first table.
- `grant select` only: the role can read and can never change a row.
- `alter default privileges`: tables added by later migrations become readable too. It applies to tables created by the role that runs this statement, which is why you run it as the migration role.

An integration test creates the role from exactly this block and checks that it reads every table, so do not change the block without running the tests.

The role's connection string is `PROD_BACKUP_DATABASE_URL`. Use the **session pooler** string from Supabase (Connect → Session pooler: port 5432 on the pooler host, user `backup_reader.<project ref>`). Do not use the transaction pooler (port 6543): an exported snapshot disappears when its session ends, and the backup would fail.

### 4. Store the secrets

Store these in Doppler, then sync them to the GitHub environments named. The spec puts them in a Doppler branch config `prd_backup` that only the founder can read. If the Doppler project still has only the `prd` config, create `prd_backup` first.

| Name | What it is | GitHub environment |
|---|---|---|
| `PROD_BACKUP_DATABASE_URL` | Session-pooler URL of `backup_reader` on `ee-prod` | `backup` |
| `PROD_S3_ENDPOINT` | S3 endpoint of `ee-prod` storage | `backup` |
| `PROD_S3_ACCESS_KEY_ID` | S3 access key ID for `ee-prod` | `backup` |
| `PROD_S3_SECRET_ACCESS_KEY` | S3 secret for `ee-prod` | `backup` |
| `BACKUP_S3_ENDPOINT` | S3 endpoint of `ee-backup` storage | `backup`, `restore-drill` |
| `BACKUP_S3_ACCESS_KEY_ID` | S3 access key ID for `ee-backup` | `backup`, `restore-drill` |
| `BACKUP_S3_SECRET_ACCESS_KEY` | S3 secret for `ee-backup` | `backup`, `restore-drill` |
| `BACKUP_CRYPT_PASSWORD` | rclone crypt password (choose a long random value) | `backup`, `restore-drill` |
| `BACKUP_CRYPT_SALT` | rclone crypt salt (a second long random value) | `backup`, `restore-drill` |
| `BACKUP_SUPABASE_URL` | URL of the `ee-backup` project | `restore-drill`; also Doppler `prd` for the app |
| `BACKUP_SUPABASE_SERVICE_ROLE_KEY` | Service-role key of `ee-backup` | `restore-drill`; also Doppler `prd` for the app |

Two more settings are not secrets. Set them as **variables** on the GitHub environments, only if the region is not `us-east-1`:

| Variable | What it is | GitHub environment |
|---|---|---|
| `PROD_S3_REGION` | Region of `ee-prod` storage | `backup` |
| `BACKUP_S3_REGION` | Region of `ee-backup` storage | `backup`, `restore-drill` |

Create the two GitHub environments (Settings → Environments):

- `backup`: limit it to the `main` branch.
- `restore-drill`: limit it to `main` and add the founder as a **required reviewer**, so every drill waits for approval.

### 5. Turn it on

1. Set the repository variable `BACKUPS_ENABLED` to `true` (Settings → Secrets and variables → Actions → Variables).
2. Actions → Backup → Run workflow, on `main`.
3. Check the run: the "Upload" step ends with rclone's check reporting 0 differences, and `ee-backup` bucket `backups` has new (encrypted) objects.
4. Check that deleted files are kept. The first run moves nothing into `files-deleted/`. After a later run, `rclone lsf --dirs-only backupcrypt:files-deleted/` lists a folder named with that run's date if any file was deleted or replaced since the run before; check after the next run that the folder and its files are still there. Do not delete a production file to test this.
5. Run a restore drill ([restore.md](restore.md)). A backup that has never been restored is not yet a backup.

### 6. Make it nightly

Only after one manual run and one drill have passed. Open a pull request that changes the `on:` block of `.github/workflows/backup.yml` to:

```yaml
on:
  schedule:
    - cron: '0 2 * * *'
  workflow_dispatch:
```

The test `src/server/ops/backup-manifest.test.ts` asserts that the workflow has no timer; change that assertion in the same pull request. Cron runs in UTC, so this is 02:00 UTC every night.

## Turning it off

Set `BACKUPS_ENABLED` to `false`. Runs then read nothing. Existing backups stay where they are.

## Checking a backup by hand

Without the workflow, from a machine with Node, pnpm and the PostgreSQL 17 client tools:

```sh
# Manifest only (reads counts; writes nothing to the database).
doppler run --config prd_backup -- sh -c 'DATABASE_URL="$PROD_BACKUP_DATABASE_URL" pnpm backup:manifest --out manifest.json'
```

`pnpm backup:manifest` only reads. With `--dump <file>` it also writes a dump file to the local disk; treat that file as production data and delete it when done.

## Restoring a single file by hand

To get back one media file that was deleted or overwritten in the last 35 days:

1. Install rclone and write a configuration with the `backup` and `backupcrypt` remotes. The exact shape is in the "Write the rclone configuration" step of `.github/workflows/restore-drill.yml`. Take the values from Doppler with `doppler run`, never by pasting them into a file you keep.
2. Find the file. The current copy is under `backupcrypt:files/<bucket>/`. A file that was deleted or replaced on a given day is under `backupcrypt:files-deleted/<date>/<bucket>/`:

   ```sh
   rclone lsf backupcrypt:files/media-public/ | head
   rclone lsf --dirs-only backupcrypt:files-deleted/
   ```

3. Copy it out, to a local folder first:

   ```sh
   rclone copy "backupcrypt:files-deleted/2027-01-15/media-public/<path>" ./restored/
   ```

4. Look at the file, then upload it to the same path in the production bucket through the Supabase dashboard. Record what you restored and why on the incident.

Do not restore a file that was removed by a moderation decision or by a user's deletion request. Check the media row and the audit log first.

## When a run fails

| Symptom | Likely cause |
|---|---|
| "X is not set in the backup environment" | The secret is missing from the `backup` environment. Sync it from Doppler |
| The dump step fails with "invalid snapshot identifier" or "snapshot ... does not exist" | `PROD_BACKUP_DATABASE_URL` points at the transaction pooler. Use the session pooler |
| The dump step fails with "permission denied for table" | A table was created by a role other than the one that ran `alter default privileges`. Re-run `grant select on all tables in schema app to backup_reader` |
| The dump has tables but 0 rows | The role lost `bypassrls`. Run `alter role backup_reader bypassrls` |
| rclone fails with a signature or region error | Set `PROD_S3_REGION` or `BACKUP_S3_REGION` to the project's region |
| "Could not list backupcrypt:files-deleted/" on the first run | Nothing has been deleted from the live buckets yet, so the folder does not exist. Nothing was pruned; no action |
| "backup-prune: not a dated folder, left in place" | Someone put a folder that is not a date under `pg/` or `files-deleted/`. It is never deleted automatically. Move or delete it by hand after checking what it is |

A failed backup deletes nothing: the pruning step runs only after the upload has been checked.
