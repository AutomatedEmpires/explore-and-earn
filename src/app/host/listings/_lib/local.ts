// The copy of a draft kept on this device (spec failure modes 4 and 5): what the host typed,
// including text that is not valid yet, and the sections that still need saving. Storage can
// be full or blocked; then the builder works without it.
import type { BuilderSection } from '@/modules/listings';
import type { Raw } from './model';
import type { Json } from './paths';

export type LocalDraft = { draft: Json; raw: Raw; dirty: BuilderSection[]; at: number };

const key = (listingId: string) => `ee.listing-draft.${listingId}`;

export function readLocal(listingId: string): LocalDraft | null {
  try {
    const text = window.localStorage.getItem(key(listingId));
    if (!text) return null;
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Partial<LocalDraft>;
    if (typeof v.draft !== 'object' || v.draft === null) return null;
    return {
      draft: v.draft,
      raw: typeof v.raw === 'object' && v.raw !== null ? v.raw : {},
      dirty: Array.isArray(v.dirty) ? v.dirty : [],
      at: typeof v.at === 'number' ? v.at : 0,
    };
  } catch {
    return null;
  }
}

export function writeLocal(listingId: string, value: LocalDraft): void {
  try {
    window.localStorage.setItem(key(listingId), JSON.stringify(value));
  } catch {
    // Full or blocked storage: the server copy is still saved when online.
  }
}

export function clearLocal(listingId: string): void {
  try {
    window.localStorage.removeItem(key(listingId));
  } catch {
    // Nothing to clear.
  }
}

/**
 * The draft to start from: the server's, with this device's unsaved sections laid over it.
 * Returns the sections that still need saving.
 */
export function mergeLocal(
  server: Json,
  local: LocalDraft | null,
  contentKeys: Record<BuilderSection, readonly string[]>,
): { draft: Json; raw: Raw; dirty: BuilderSection[] } {
  if (!local) return { draft: server, raw: {}, dirty: [] };
  const fromDevice = new Set(local.dirty.flatMap((section) => contentKeys[section] ?? []));
  const draft: Json = Object.fromEntries(
    [...new Set([...Object.keys(server), ...fromDevice])]
      .map((k): [string, unknown] => [k, fromDevice.has(k) ? local.draft[k] : server[k]])
      .filter(([, v]) => v !== undefined),
  );
  return { draft, raw: local.raw, dirty: local.dirty };
}
