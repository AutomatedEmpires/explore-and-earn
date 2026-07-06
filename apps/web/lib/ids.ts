/**
 * Canonical RFC-4122 UUID shape — listings.id and host_profiles.id are
 * Postgres uuid columns, so any non-UUID path param can never exist in the
 * DB. Guarding at the route layer turns would-be Postgres 22P02 throws
 * (invalid input syntax for type uuid → error boundary behind HTTP 200)
 * into honest 404s.
 */
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}
