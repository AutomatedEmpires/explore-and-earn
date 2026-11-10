// Every module's Drizzle tables, for typing the database client. Modules own their tables;
// nothing outside a module imports a table directly.
export * from '../modules/audit/schema';
export * from '../modules/identity/schema';
export * from '../modules/jobs/schema';
export * from '../modules/media/schema';
export * from '../modules/notifications/schema';
export * from '../modules/operator/schema';
export * from '../modules/orgs/schema';
export * from '../modules/ratelimit/schema';
export * from '../modules/settings/schema';
export * from '../modules/trust/schema';
// SP2
export * from '../modules/billing/schema';
export * from '../modules/entitlements/schema';
export * from '../modules/hostpages/schema';
export * from '../modules/listings/schema';
export * from '../modules/locations/schema';
export * from '../modules/verification/schema';
// SP3
export * from '../modules/discovery/schema';
export * from '../modules/landing/schema';
// SP8 (types only until SP8 W0)
export * from '../modules/privacy/schema';
