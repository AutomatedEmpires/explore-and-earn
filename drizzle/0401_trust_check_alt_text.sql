-- 0401_trust_check_alt_text: the alt text an image check wrote, when the caller asked for it.
-- A retried media scan reuses the check its first attempt stored (trust.findLatestCheck)
-- instead of classifying again, and needs that check's alt text as well as its decision.
alter table app.trust_checks add column alt_text text;
