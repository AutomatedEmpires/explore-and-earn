// The export archive. fflate builds it in memory: an export is one person's records and the
// files they uploaded, which the media size limits keep small.
import { strToU8, unzipSync, zipSync } from 'fflate';

/** A zip of `entries` (archive path -> bytes), in the order given. */
export function buildZip(entries: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [name, bytes] of entries) input[name] = bytes;
  return zipSync(input, { level: 6 });
}

/** The entries of a zip built by `buildZip` (tests and the restore drill read exports back). */
export function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  return new Map(Object.entries(unzipSync(bytes)));
}

export function textBytes(text: string): Uint8Array {
  return strToU8(text);
}
