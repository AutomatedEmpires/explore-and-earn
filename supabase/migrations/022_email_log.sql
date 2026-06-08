-- 022_email_log.sql
-- Audit log for transactional email send attempts (the Resend pipeline in
-- apps/web/lib/email.ts).
--
-- Every call to sendEmail() records a fire-and-forget row here via the Supabase
-- service-role client (adminClient), capturing the template, recipient, success
-- flag, and any error string. This is an internal observability table — it is
-- NOT exposed to the client.
--
-- RLS: enabled with NO user-facing policy. The service role bypasses RLS (so
-- inserts/reads via adminClient continue to work), while the anon and
-- authenticated roles get no policy and therefore can neither read nor write
-- the table. This mirrors the "service role only" pattern and the idempotent
-- house style of 021_rls_complete.sql.

begin;

create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  template_name text not null,
  recipient_email text not null,
  ok boolean not null,
  error text,
  sent_at timestamptz not null default now()
);

-- Most queries inspect the most recent send attempts first.
create index if not exists email_log_sent_at_idx
  on public.email_log (sent_at desc);

-- Enable RLS and deliberately add NO policy: only the service-role key
-- (adminClient), which BYPASSES RLS, may read or write this table. anon /
-- authenticated have no policy and are fully denied.
alter table public.email_log enable row level security;

commit;
