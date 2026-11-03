-- A Clerk event that can never apply (a payload that fails validation, or an organization role
-- we don't map) is kept as 'rejected' with its reason, instead of failing every redelivery for
-- days. A redelivery of a recorded event is a no-op either way. To apply a rejected event after
-- a fix, delete its row and resend the message from the Clerk Dashboard (Webhooks).
alter table app.webhook_events
  add column status text not null default 'applied' check (status in ('applied', 'rejected')),
  add column event_type text,
  add column reason text;
