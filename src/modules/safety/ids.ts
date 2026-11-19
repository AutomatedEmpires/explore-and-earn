// Id checks for the safety module. Party and subject ids come from callers and routes; one
// that is not a uuid can't name a row, so reads answer "none" instead of failing a cast.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID.test(id);
}

/** The distinct uuids among `ids`, in first-seen order. */
export function uuids(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(isUuid))];
}
