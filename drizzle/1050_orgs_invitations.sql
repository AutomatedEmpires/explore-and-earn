-- 1050_orgs_invitations (SP2 W3): an invitation has no token until the orgs.send_invitation job
-- creates one and emails it in the same step (SP2 plan decision 9), so the raw token never
-- reaches app.outbox. token_hash therefore starts null; it stays unique.
alter table app.org_invitations alter column token_hash drop not null;
