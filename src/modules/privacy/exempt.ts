/** Tables the coverage report must not treat as unclaimed personal data. */
export const PRIVACY_EXEMPT_TABLES: Readonly<Record<string, string>> = {
  schema_migrations: 'Migration bookkeeping; no personal data.',
  rate_limits: 'Counter windows; deleted after 2 days by privacy.rate_limit_windows_2d.',
  destinations: 'Reference data; no personal data.',
  occupations: 'Reference data; no personal data.',
  link_domains: 'Domain reputation cache; no personal data.',
};
