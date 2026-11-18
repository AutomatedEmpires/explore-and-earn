-- 0102_identity_birth_year: the seeker age screen (legal review 2.6, P0 item 17) and the
-- Global Privacy Control record (legal review 4.5, P0 item 18).
--
-- Seeker sign-up asks for the full date of birth. The server checks it, and keeps only
-- "18 or older: yes" (adult_attested_at, the time the screen was passed) and the year. The full
-- date is never stored. Seekers who onboarded before the screen keep a null year.
--
-- analytics_opt_out_at is set once, the first time a signed-in request carries Sec-GPC: 1, so
-- work that runs with no request (jobs) can honor the opt-out too.

alter table app.users
  add column birth_year smallint,
  add column analytics_opt_out_at timestamptz,
  add constraint users_birth_year_range check (birth_year between 1900 and 2100),
  -- A year is only ever kept together with the "18 or older" confirmation.
  add constraint users_birth_year_adult
    check (birth_year is null or adult_attested_at is not null);
