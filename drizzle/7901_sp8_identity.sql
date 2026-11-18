-- SP8 W0: a Clerk user id that has been erased is remembered only as a hash, so a late
-- webhook cannot recreate the person. Ignored deliveries are recorded and not retried.

alter table app.users
  add column erased_clerk_id_sha256 text unique;

alter table app.webhook_events drop constraint webhook_events_status_check;
alter table app.webhook_events
  add constraint webhook_events_status_check
  check (status in ('applied', 'rejected', 'ignored'));
