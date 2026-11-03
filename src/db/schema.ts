// Every module's Drizzle tables, for typing the database client. Modules own their tables;
// nothing outside a module imports a table directly.
export * from '../modules/audit/schema';
export * from '../modules/identity/schema';
export * from '../modules/jobs/schema';
export * from '../modules/media/schema';
export * from '../modules/notifications/schema';
export * from '../modules/operator/schema';
export * from '../modules/orgs/schema';
export * from '../modules/settings/schema';
export * from '../modules/trust/schema';
