// Small helpers for the operator module's raw SQL reads. Not exported from ./index.
import { sql, type SQL } from 'drizzle-orm';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * A timestamptz column as epoch milliseconds. Both drivers return timestamps as Postgres text,
 * which `new Date()` cannot always parse; a float8 number reads the same everywhere.
 */
export function epochMs(column: SQL): SQL {
  return sql`(extract(epoch from ${column}) * 1000)::float8`;
}

export function toDate(ms: number | string | null | undefined): Date | null {
  if (ms === null || ms === undefined) return null;
  const n = Number(ms);
  return Number.isFinite(n) ? new Date(n) : null;
}

export function requireDate(ms: number | string | null | undefined): Date {
  return toDate(ms) ?? new Date(0);
}

/** postgres.js and PGlite both parse text[] and uuid[]; accept the literal form too. */
export function toArray(value: string[] | string | null | undefined): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  const inner = value.replace(/^\{|\}$/g, '');
  return inner ? inner.split(',').map((v) => v.replace(/^"|"$/g, '')) : [];
}

export function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** A Postgres text[] literal for a list of plain identifiers (queue names). */
export function textArrayLiteral(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, '')}"`).join(',')}}`;
}

/** A person's name for the console: their display name, else their email, else `fallback`. */
export function personName(
  displayName: string | null | undefined,
  email: string | null | undefined,
  fallback = 'Operator',
): string {
  return displayName?.trim() || email?.trim() || fallback;
}
