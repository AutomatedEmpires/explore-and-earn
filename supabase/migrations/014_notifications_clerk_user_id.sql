-- Migration 014: deliver notifications by Clerk user id
--
-- Why: notifications.recipient_user_id is a NOT NULL FK to auth.users(id)
-- (migration 008). Auth is now owned by Clerk (issue #105) and Clerk users have
-- no auth.users row, so recipient_user_id never matched and notification feeds
-- were always empty. We add a Clerk-addressed recipient column and relax the
-- legacy NOT NULL so Clerk-only notifications can be inserted.

alter table notifications
  add column if not exists recipient_clerk_user_id text;

-- Allow Clerk-only recipients (no auth.users row).
alter table notifications
  alter column recipient_user_id drop not null;

-- Recipient lookups (feed) are scoped by Clerk id; partial index keeps it lean.
create index if not exists idx_notifications_recipient_clerk
  on notifications (recipient_clerk_user_id)
  where recipient_clerk_user_id is not null;

-- Unread-count fast path (header badge): recipient + read_at.
create index if not exists idx_notifications_recipient_clerk_unread
  on notifications (recipient_clerk_user_id, read_at)
  where recipient_clerk_user_id is not null;
