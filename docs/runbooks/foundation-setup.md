# Foundation setup runbook

How to stand up the cloud environments the Foundation code expects: Supabase, storage, the worker
cron, Clerk, Vercel and GitHub. The design is in
[the Foundation design spec](../superpowers/specs/2026-11-03-foundation-design.md), section 13.

- **Who runs it:** the founder, or an engineer with access to each dashboard.
- **When:** once per environment. Re-run a section when you rotate a secret or rebuild a project.
- **Never commit a value** from this runbook. Secrets go in Vercel and GitHub environment secrets only.

## Environments

| Environment | App | Database | Clerk |
|---|---|---|---|
| dev | local `pnpm dev` | `pnpm db:local`, or Supabase `ee-dev` | development instance |
| preview | Vercel | Supabase `ee-preview` | development instance |
| prod | Vercel production | Supabase `ee-prod` | production instance |

**Until launch:** the Vercel Production target serves staging (`staging.` and `admin.staging.`)
on `ee-preview` with `APP_ENV=preview`, and branch previews use `ee-dev`. Wherever this runbook
says "preview", that is the Production target for now. At cut-over, Production moves to `ee-prod`
and `APP_ENV=prod` (section 8).

## 1. Supabase projects

Do these steps for each of `ee-dev`, `ee-preview` and `ee-prod`.

1. **Create the project** in the Supabase organization:
   - name `ee-dev`, `ee-preview` or `ee-prod`
   - region `us-east-1` (Vercel functions run in `iad1`, next to it)
   - a generated database password, stored in your password manager
   - **`ee-prod` needs the Pro plan:** daily backups and no pausing.
2. **Enable the extensions.** In the SQL editor, run:

   ```sql
   create extension if not exists postgis with schema extensions;
   create extension if not exists pg_cron with schema pg_catalog;
   create extension if not exists pg_net with schema extensions;
   grant usage on schema cron to postgres;
   ```

3. **Keep the `app` schema out of the Data API.** Under Project Settings > Data API, the exposed
   schemas stay `public` and `graphql_public`. Every app table is in `app`, has RLS enabled and has
   no policies, and only the server reaches it.
4. **Copy two connection strings** (Connect > Connection string):
   - **Transaction pooler** (port `6543`): the app's `DATABASE_URL` in Vercel. The client
     disables prepared statements for it.
   - **Session pooler** (port `5432` on the pooler host): for migrations from GitHub Actions,
     whose runners have no IPv6 for the direct connection. This is `PREVIEW_DATABASE_URL` or
     `PROD_DATABASE_URL` in GitHub (section 7).
5. **Apply the migrations.**
   - `ee-preview` and `ee-prod`: the workflows do it (sections 7 and 8).
   - `ee-dev`, by hand: `DATABASE_URL='<ee-dev session pooler>' pnpm db:migrate`.

   Check: `select name from app.schema_migrations order by name;` lists every file in `drizzle/`.

## 2. Storage buckets

In each project's SQL editor:

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Uploads land here, unreadable until the scan finishes. Limits mirror KIND_RULES.
  ('quarantine', 'quarantine', false, 15728640,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']),
  ('media-public', 'media-public', true, null, null),
  ('media-private', 'media-private', false, null, null),
  ('evidence', 'evidence', false, null, null)
on conflict (id) do nothing;
```

- **`media-public`** is the only public bucket: approved photos for public pages.
- **`media-private`** holds resumes, attachments and held images, served by 300-second signed URLs.
- **`evidence`** holds originals of child-safety matches. It has **restricted access**:
  - Add no storage policies for it, so only the service role key can read it. The browser never
    talks to Storage directly.
  - Only the Owner has a Supabase organization seat on `ee-prod`.
  - Never make it public, and never create signed URLs for it outside an NCMEC report.

Check: `select id, public from storage.buckets order by id;` shows four rows, and only
`media-public` is `true`.

## 3. Worker cron

Supabase Cron calls the worker every minute through `pg_net`. The worker runs due schedules
(SLA sweep, digests, accuracy sampling) and drains the outbox.

1. **Store the target and the secret in Vault** (SQL editor). Use this environment's `APP_URL`
   and `JOBS_SECRET` (section 6):

   ```sql
   select vault.create_secret('<APP_URL>', 'app_url', 'Base URL the worker cron calls');
   select vault.create_secret('<JOBS_SECRET>', 'jobs_secret', 'x-jobs-secret for /api/jobs/run');
   ```

2. **Schedule the job:**

   ```sql
   select cron.schedule(
     'jobs-run',
     '* * * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url')
              || '/api/jobs/run',
       headers := jsonb_build_object(
         'content-type', 'application/json',
         'x-jobs-secret',
         (select decrypted_secret from vault.decrypted_secrets where name = 'jobs_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 55000
     );
     $$
   );
   ```

3. **Check it** after two minutes. `select status_code from net._http_response order by created desc limit 5;`
   should show `200`.
   - `401` means the Vault secret and `JOBS_SECRET` in Vercel differ.
   - A Vercel login page means Deployment Protection covers that URL. Point the cron at an
     unprotected domain, or add a protection-bypass header.
4. **`ee-dev`:** nothing public serves it, so unschedule the job
   (`select cron.unschedule('jobs-run');`). Locally, run the worker by hand (README,
   "Develop locally").

To rotate `JOBS_SECRET`, change it in Vercel and redeploy, then update the Vault secret:
`select vault.update_secret((select id from vault.secrets where name = 'jobs_secret'), '<new>');`

## 4. Clerk

Use the development instance for dev and preview, and the production instance for prod. Make
each change in both instances.

1. **Organizations:** turn on Organizations. The creator's role is `org:admin`.
2. **Custom roles** (Organizations > Roles & Permissions):
   - `org:recruiter`, named Recruiter
   - `org:billing`, named Billing

   Keep `org:admin`. An Owner is `org:admin` plus `organizations.owner_user_id` in our database.
3. **Session token claim** (Sessions > Customize session token):

   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```

   The proxy reads `metadata.account_type` from it to send new users to `/onboarding`.
4. **Sign-in methods** (User & authentication):
   - Passkeys: on. Operators must have one.
   - Multi-factor: authenticator app (TOTP) and backup codes on. Host Owners and Admins need a
     passkey or two-step sign-in.
5. **Paths:** sign-in `/sign-in`, sign-up `/sign-up`, after sign-up `/onboarding`.
6. **Webhook** (Webhooks > Add endpoint), one per deployed environment:
   - URL: `<APP_URL>/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`, `user.deleted`, `organization.created`,
     `organization.updated`, `organization.deleted`, `organizationMembership.created`,
     `organizationMembership.updated`, `organizationMembership.deleted`
   - Copy the endpoint's signing secret into `CLERK_WEBHOOK_SECRET` (section 6).
   - Check: send a test `user.updated` from the dashboard. It returns `200` and
     `app.webhook_events` has its id.
7. **Production instance only:** add the domain and its DNS records as Clerk lists them. The
   console's `admin.` host is a subdomain of the same domain, so it shares the session.
8. **The first operator Owner**, once per environment, after the app is deployed:

   ```sh
   DATABASE_URL='<session pooler>' CLERK_SECRET_KEY='<instance secret key>' \
     pnpm ops:bootstrap-owner owner@your-domain
   ```

   This emails a Clerk invitation. Accepting it creates the Owner, who registers a passkey at
   `admin.<host>/passkey`. The script refuses once an Owner exists.

## 5. VAPID keys

Generate one pair per environment, and keep it. Changing the keys drops every browser's push
subscription.

```sh
pnpm tsx scripts/gen-vapid.ts mailto:ops@your-domain
```

It prints `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` lines for Vercel. The
private key is a secret.

## 6. Vercel environment variables

Set every key from `.env.local.example` on each Vercel target. Use the Vercel dashboard
(Settings > Environment Variables) or the CLI, for example
`vercel env add JOBS_SECRET production`. Mark every secret as Sensitive.

| Key | preview | prod |
|---|---|---|
| `APP_ENV` | `preview` | `prod` |
| `APP_URL` | `https://staging.<domain>` | `https://<domain>` |
| `ADMIN_HOST` | `admin.staging.<domain>` | `admin.<domain>` |
| `DATABASE_URL` | `ee-preview` transaction pooler | `ee-prod` transaction pooler |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | development instance | production instance |
| `CLERK_WEBHOOK_SECRET` | this environment's endpoint (section 4) | same |
| `STORAGE_PROVIDER` | `supabase` | `supabase` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `ee-preview` | `ee-prod` |
| `AI_PROVIDER`, `ANTHROPIC_API_KEY` | `anthropic` (or `stub`) | `anthropic` |
| `CHILD_SAFETY_PROVIDER`, `PHOTODNA_KEY` | `stub` until PhotoDNA approves | `photodna` (a launch gate) |
| `MALWARE_PROVIDER`, `CLOUDMERSIVE_API_KEY` | `cloudmersive` (or `stub`) | `cloudmersive` |
| `EMAIL_PROVIDER`, `RESEND_API_KEY` | `resend` | `resend` |
| `EMAIL_FROM` | `Explore&Earn <noreply@<domain>>` (a domain verified in Resend) | same |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | this environment's pair (section 5) | its own pair |
| `JOBS_SECRET`, `UNSUBSCRIBE_SECRET`, `ANALYTICS_HASH_SECRET` | `openssl rand -base64 48`, one each | new values |
| `SENTRY_DSN` | the Sentry project DSN | same |
| `NEXT_PUBLIC_POSTHOG_KEY` | the PostHog project key | same |

- **Production refuses to start** when any provider is `stub` or `local`, or a required key is
  missing. The startup error names the variable (`src/lib/env.ts`).
- **A missing key fails every request, in preview too.** The proxy (`src/proxy.ts`) reads the
  environment on each request. Set a new key on every target before the code that needs it
  deploys. For example, SP3 adds `ANALYTICS_HASH_SECRET`, the HMAC key for view dedupe and the
  guest viewer key.
- **Leave unset in the cloud:** `LOCAL_STORAGE_DIR` and `CHILD_SAFETY_STUB_HASHES`, which are
  for development only.
- **Branch previews** use `ee-dev` values with `APP_ENV=preview`.

**No `vercel.json` is needed.** The worker schedule lives in Supabase Cron (section 3), and the
proxy (`src/proxy.ts`) sets the security headers on every response.

## 7. GitHub environments and secrets

In the repository settings, under Environments:

1. **`preview`**
   - Deployment branches: `main` only.
   - Secret `PREVIEW_DATABASE_URL`: the `ee-preview` session pooler string.
   - `.github/workflows/migrate-preview.yml` applies migrations on every push to `main`.
2. **`production`**
   - Required reviewers: the founder.
   - Deployment branches: `main` only.
   - Secret `PROD_DATABASE_URL`: the `ee-prod` session pooler string.
   - Secret `VERCEL_DEPLOY_HOOK_PROD`: create it in Vercel under Project Settings > Git >
     Deploy Hooks, named `release`, for branch `main`. The hook URL is a secret.

**Migrations must be backward compatible.** Vercel deploys `main` while `migrate-preview` is still
running, so for a minute the old code can meet the new schema, or the new code the old one. Add
columns and tables first, and remove old ones in a later release.

## 8. Releasing to production

1. **Make sure `main` is green in CI**, and that `migrate-preview` succeeded on the same commit.
2. **Start the release:** Actions > Release > Run workflow, on `main`.
3. **Approve it.** The founder approves the `production` deployment. The job then:
   1. checks that `main` has not moved since the release started
   2. runs `pnpm db:migrate` against `PROD_DATABASE_URL`
   3. checks `main` again, then calls the deploy hook
4. **Check:**
   - `GET https://<domain>/api/v1/health` returns `{"ok":true,"env":"prod"}`.
   - The Vercel deployment shows the released commit.
5. **If the app breaks,** use Vercel's Instant Rollback to the previous deployment. Migrations do
   not roll back, which is why they must be backward compatible (section 7).

**Cut-over: production deploys only through the release.** Once `ee-prod` exists, a push to
`main` must stop deploying production by itself:

1. Add this to `vercel.json`:

   ```json
   { "git": { "deploymentEnabled": { "main": false } } }
   ```

2. Run one release and confirm that the deploy hook still builds production. Vercel documents
   deploy hooks as re-running the build for their branch, but test it before you rely on it.
