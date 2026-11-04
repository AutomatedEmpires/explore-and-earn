// Dotted field paths into listing content and drafts ('basics.title', 'housing.photos.bedroom').
// Arrays are leaves: a path never indexes into a list.

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every path to a filled leaf: not undefined, null, an empty string or an empty list. */
export function leafPaths(value: unknown, prefix = ''): string[] {
  if (!isObject(value)) {
    if (value === undefined || value === null || value === '') return [];
    if (Array.isArray(value) && value.length === 0) return [];
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, v]) =>
    leafPaths(v, prefix ? `${prefix}.${key}` : key),
  );
}

/** The value at `path` (a numeric segment indexes a list), or undefined. */
export function getPath(value: unknown, path: string): unknown {
  let at: unknown = value;
  for (const key of path.split('.')) {
    if (Array.isArray(at) && /^\d+$/.test(key)) at = at[Number(key)];
    else if (isObject(at)) at = at[key];
    else return undefined;
  }
  return at;
}

/** Whether two JSON values are equal (key order ignored). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => sameJson(v, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => sameJson(a[k], b[k]));
  }
  return false;
}
