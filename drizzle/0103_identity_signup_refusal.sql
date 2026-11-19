-- 0103_identity_signup_refusal: an under-age refusal holds on the account, not only on the
-- browser session (legal review 2.6; lead decision 2026-11-18 on explore-and-earn#45).
--
-- When the age screen refuses a seeker, the account is stamped with the time of the refusal and
-- nothing else: never the date of birth and never the year. While the stamp is set, onboarding
-- is refused for that account as seeker and as host, from any browser. Only the under-age
-- report path or an operator may clear it.

alter table app.users
  add column signup_refused_at timestamptz,
  -- A refused account never holds the "18 or older" confirmation, so it is never a seeker
  -- (users_seeker_adult_attested) and never keeps a year (users_birth_year_adult).
  add constraint users_signup_refused_not_adult
    check (signup_refused_at is null or adult_attested_at is null),
  -- Nor does it become a host. Operators exist only by the team's invitation, not by sign-up.
  add constraint users_signup_refused_not_host
    check (signup_refused_at is null or account_type is distinct from 'host');
