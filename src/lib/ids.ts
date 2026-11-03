import { v7 } from 'uuid';

/** A new UUIDv7. Values created later sort after earlier ones, even within one millisecond. */
export function newId(): string {
  return v7();
}
