// Immutable get and set on the builder draft by dotted path ('housing.cost.cents'). The draft is
// JSON the server checks against ListingDraftSchema, so the builder edits it as plain data.

export type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function getPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const key of path.split('.')) {
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (isObject(cur)) cur = cur[key];
    else return undefined;
  }
  return cur;
}

/** A copy of `root` with `path` set to `value` (or removed when `value` is undefined). */
export function setPath<T extends Json>(root: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  if (head === undefined) return root;
  const copy: Json = { ...root };
  if (rest.length === 0) {
    if (value !== undefined) return { ...copy, [head]: value } as T;
    return Object.fromEntries(Object.entries(copy).filter(([k]) => k !== head)) as T;
  }
  const child = copy[head];
  if (Array.isArray(child)) {
    const index = Number(rest[0]);
    const list = [...child];
    const inner = rest.slice(1).join('.');
    list[index] = inner ? setPath(isObject(list[index]) ? list[index] : {}, inner, value) : value;
    copy[head] = list;
    return copy as T;
  }
  copy[head] = setPath(isObject(child) ? child : {}, rest.join('.'), value);
  return copy as T;
}

export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;
export const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
export const obj = (v: unknown): Json => (isObject(v) ? v : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const strings = (v: unknown): string[] =>
  arr(v).filter((s): s is string => typeof s === 'string');
